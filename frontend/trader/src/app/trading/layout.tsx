'use client';

import { useEffect } from 'react';
import { useTradingStore } from '@/stores/tradingStore';
import { wsManager } from '@/lib/ws/wsManager';
import api from '@/lib/api/client';
import toast from 'react-hot-toast';
import { sounds, unlockAudio } from '@/lib/sounds';
import TopBar from '@/components/layout/TopBar';

export default function TradingLayout({ children }: { children: React.ReactNode }) {
  const { updatePrice, setActiveAccount, setAccounts, setPositions, setPendingOrders, setInstruments, refreshPositions, refreshAccount } = useTradingStore();

  useEffect(() => {
    const onFirstGesture = () => {
      unlockAudio();
    };
    document.addEventListener('pointerdown', onFirstGesture, { passive: true });
    document.addEventListener('keydown', onFirstGesture);
    return () => {
      document.removeEventListener('pointerdown', onFirstGesture);
      document.removeEventListener('keydown', onFirstGesture);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const [accountsRes, instrumentsRes] = await Promise.all([
          api.get<any>('/accounts').catch(() => ({ items: [] })),
          api.get<any>('/instruments/').catch(() => []),
        ]);

        if (cancelled) return;

        const instruments = Array.isArray(instrumentsRes) ? instrumentsRes : (instrumentsRes?.items ?? []);
        if (instruments.length > 0) {
          setInstruments(instruments.map((i: any) => ({
            symbol: i.symbol,
            display_name: i.display_name || i.symbol,
            segment: i.segment?.name || i.segment || '',
            digits: i.digits ?? 5,
            pip_size: i.pip_size ?? 0.0001,
            min_lot: i.min_lot ?? 0.01,
            max_lot: i.max_lot ?? 100,
            lot_step: i.lot_step ?? 0.01,
            contract_size: i.contract_size ?? 100000,
          })));
        }

        const accounts = Array.isArray(accountsRes) ? accountsRes : (accountsRes?.items ?? []);
        if (accounts.length > 0) {
          setAccounts(accounts);
          const primary = accounts.find((a: any) => !a.is_demo) || accounts[0];
          setActiveAccount({
            id: primary.id,
            account_number: primary.account_number,
            balance: Number(primary.balance) || 0,
            credit: Number(primary.credit) || 0,
            equity: Number(primary.equity || primary.balance) || 0,
            margin_used: Number(primary.margin_used) || 0,
            free_margin: Number(primary.free_margin || primary.balance) || 0,
            margin_level: Number(primary.margin_level) || 0,
            leverage: Number(primary.leverage) || 100,
            currency: primary.currency ?? 'USD',
            is_demo: primary.is_demo ?? false,
          });

          const [positions, orders] = await Promise.all([
            api.get<any[]>('/positions/', { account_id: primary.id, status: 'open' }).catch(() => []),
            api.get<any[]>('/orders/', { account_id: primary.id, status: 'pending' }).catch(() => []),
          ]);
          if (cancelled) return;

          if (Array.isArray(positions)) {
            setPositions(positions.map((p: any) => ({
              id: p.id,
              account_id: p.account_id,
              symbol: p.symbol || p.instrument?.symbol || '',
              side: p.side,
              lots: Number(p.lots) || 0,
              open_price: Number(p.open_price) || 0,
              current_price: p.current_price != null ? Number(p.current_price) : undefined,
              stop_loss: p.stop_loss != null ? Number(p.stop_loss) : undefined,
              take_profit: p.take_profit != null ? Number(p.take_profit) : undefined,
              swap: Number(p.swap) || 0,
              commission: Number(p.commission) || 0,
              profit: Number(p.profit) || 0,
              created_at: p.created_at,
            })));
          }
          if (Array.isArray(orders)) {
            setPendingOrders(orders.map((o: any) => ({
              id: o.id,
              account_id: o.account_id,
              symbol: o.symbol || o.instrument?.symbol || '',
              order_type: o.order_type,
              side: o.side,
              status: o.status,
              lots: Number(o.lots) || 0,
              price: Number(o.price) || 0,
              stop_loss: o.stop_loss != null ? Number(o.stop_loss) : undefined,
              take_profit: o.take_profit != null ? Number(o.take_profit) : undefined,
              created_at: o.created_at,
            })));
          }
        }
      } catch (err) {
        console.error('Trading bootstrap failed:', err);
      }
    }

    bootstrap();

    wsManager.connect();
    const unsub = wsManager.onMessage((data) => {
      if (data.symbol && data.bid != null && data.ask != null) {
        updatePrice({
          symbol: data.symbol,
          bid: parseFloat(data.bid),
          ask: parseFloat(data.ask),
          timestamp: data.timestamp || data.ts || new Date().toISOString(),
          spread: parseFloat(data.ask) - parseFloat(data.bid),
        });
      }
    });

    // REST fallback when WebSocket cannot connect (e.g. HTTPS site without /ws proxy to gateway).
    let pollCancelled = false;
    const pollPricesFromApi = async () => {
      try {
        const rows = await api.get<
          { symbol?: string; bid?: number; ask?: number; timestamp?: string; spread?: number }[]
        >('/instruments/prices/all', undefined, { timeoutMs: 15000 });
        if (pollCancelled || !Array.isArray(rows)) return;
        for (const row of rows) {
          const sym = row?.symbol;
          if (!sym || row.bid == null || row.ask == null) continue;
          const bid = Number(row.bid);
          const ask = Number(row.ask);
          if (Number.isNaN(bid) || Number.isNaN(ask)) continue;
          updatePrice({
            symbol: sym,
            bid,
            ask,
            timestamp: row.timestamp || new Date().toISOString(),
            spread: row.spread != null ? Number(row.spread) : ask - bid,
          });
        }
      } catch {
        /* ignore — WS may still work; market-data may be down */
      }
    };
    pollPricesFromApi();
    const pricePoll = setInterval(pollPricesFromApi, 2500);

    let prevPositionIds: Set<string> = new Set();

    const positionPoll = setInterval(async () => {
      const before = useTradingStore.getState().positions;
      const beforeIds = new Set(before.map(p => p.id));

      await refreshPositions();
      await refreshAccount();

      const after = useTradingStore.getState().positions;
      const afterIds = new Set(after.map(p => p.id));

      if (beforeIds.size > 0) {
        beforeIds.forEach((id) => {
          if (!afterIds.has(id)) {
            const closed = before.find(p => p.id === id);
            if (closed) {
              const pnl = closed.profit || 0;
              const hadSl = closed.stop_loss != null;
              const hadTp = closed.take_profit != null;
              const isLoss = pnl < 0;
              const reason = isLoss && hadSl ? 'Stop Loss' : !isLoss && hadTp ? 'Take Profit' : hadSl ? 'Stop Loss' : hadTp ? 'Take Profit' : 'Closed';
              const icon = reason === 'Stop Loss' ? '🔴' : reason === 'Take Profit' ? '🟢' : '⚪';
              const emoji = reason === 'Stop Loss' ? '🛑' : reason === 'Take Profit' ? '🎯' : '⚡';

              reason === 'Stop Loss' ? sounds.loss() : sounds.profit();

              toast(
                `${emoji} ${reason} Hit — ${closed.symbol} ${closed.side.toUpperCase()} ${closed.lots} lots\nP&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
                {
                  icon,
                  duration: 6000,
                  style: { fontWeight: 600, fontSize: '13px' },
                }
              );
            }
          }
        });
      }
    }, 3000);

    return () => {
      cancelled = true;
      pollCancelled = true;
      unsub();
      clearInterval(positionPoll);
      clearInterval(pricePoll);
    };
  }, []);

  return (
    <div className="trading-page flex flex-col h-[100dvh] pb-16 md:h-screen md:pb-0 bg-bg-base min-h-0">
      <TopBar />
      <div className="flex-1 flex overflow-hidden min-h-0">
        {children}
      </div>
    </div>
  );
}
