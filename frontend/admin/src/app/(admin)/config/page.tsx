'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';
import {
  ArrowLeftRight,
  Check,
  DollarSign,
  Edit3,
  Loader2,
  RefreshCw,
  Save,
  Settings,
  X,
} from 'lucide-react';

interface InstrumentConfig {
  id: string;
  symbol: string;
  display_name: string;
  segment: string;
  segment_id: string | null;
  pip_size: number;
  digits: number;
  contract_size: number;
  charge: { type: string; value: number } | null;
  spread: { type: string; value: number } | null;
  swap: { long: number; short: number; free: boolean } | null;
}

function spreadPrice(val: number, pip: number): string {
  const price = val * pip;
  if (price >= 1) return `±$${price.toFixed(2)}`;
  if (price >= 0.01) return `±$${price.toFixed(4)}`;
  return `±${price.toFixed(6)}`;
}

interface EditState {
  commission: string;
  commission_type: string;
  spread: string;
  spread_type: string;
  swap_long: string;
  swap_short: string;
  swap_free: boolean;
}

const CONFIG_LINKS = [
  { href: '/config/charges', icon: DollarSign, title: 'Charges', desc: 'Per-instrument & per-user rules' },
  { href: '/config/spreads', icon: ArrowLeftRight, title: 'Spreads', desc: 'Per-instrument & per-user rules' },
  { href: '/config/swaps', icon: RefreshCw, title: 'Swaps', desc: 'Per-instrument & per-user rules' },
];

export default function ConfigPage() {
  const [instruments, setInstruments] = useState<InstrumentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminApi.get<{ items: InstrumentConfig[] }>('/config/instruments');
      setInstruments(data.items || []);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const startEdit = (inst: InstrumentConfig) => {
    setEditingId(inst.id);
    setEditState({
      commission: inst.charge?.value?.toString() ?? '',
      commission_type: inst.charge?.type ?? 'commission_per_lot',
      spread: inst.spread?.value?.toString() ?? '',
      spread_type: inst.spread?.type ?? 'fixed',
      swap_long: inst.swap?.long?.toString() ?? '0',
      swap_short: inst.swap?.short?.toString() ?? '0',
      swap_free: inst.swap?.free ?? false,
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditState(null); };

  const saveEdit = async (inst: InstrumentConfig) => {
    if (!editState) return;
    setSaving(inst.id);
    try {
      const body: Record<string, any> = {};
      if (editState.commission) {
        body.commission = parseFloat(editState.commission);
        body.commission_type = editState.commission_type;
      }
      if (editState.spread) {
        body.spread = parseFloat(editState.spread);
        body.spread_type = editState.spread_type;
      }
      body.swap_long = parseFloat(editState.swap_long) || 0;
      body.swap_short = parseFloat(editState.swap_short) || 0;
      body.swap_free = editState.swap_free;

      await adminApi.put(`/config/instrument/${inst.id}`, body);
      toast.success(`${inst.symbol} config saved`);
      setEditingId(null);
      setEditState(null);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Save failed');
    } finally {
      setSaving(null);
    }
  };

  const segments = Array.from(new Set(instruments.map((i) => i.segment))).filter(Boolean).sort();

  return (
    <>
      <div className="p-6 space-y-5">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Configuration</h1>
          <p className="text-xxs text-text-tertiary mt-0.5">Click any row to edit charges, spreads, and swaps inline. Use sub-pages for per-user rules.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {CONFIG_LINKS.map((l) => {
            const Icon = l.icon;
            return (
              <Link key={l.href} href={l.href} className="bg-bg-secondary border border-border-primary rounded-md p-3 flex items-center gap-3 transition-fast hover:border-buy/30 hover:bg-bg-hover/30 group">
                <div className="p-2 rounded-md bg-bg-tertiary border border-border-primary">
                  <Icon size={14} className="text-buy" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-text-primary group-hover:text-buy transition-fast">{l.title}</p>
                  <p className="text-xxs text-text-tertiary">{l.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-md">
          <div className="px-4 py-3 border-b border-border-primary flex items-center gap-2">
            <Settings size={14} className="text-text-tertiary" />
            <h2 className="text-xs font-semibold text-text-primary">All Instruments</h2>
            <span className="ml-auto text-xxs text-text-tertiary">{instruments.length} instruments · Click <Edit3 size={10} className="inline" /> to edit</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-text-tertiary" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px]">
                <thead>
                  <tr className="border-b border-border-primary bg-bg-tertiary/40">
                    {['Symbol', 'Commission', 'Spread', 'Price Impact', 'Swap Long', 'Swap Short', 'Swap Free', ''].map(c => (
                      <th key={c} className={cn('text-left px-3 py-2.5 text-xxs font-medium text-text-tertiary uppercase tracking-wide', ['Commission', 'Spread (pips)', 'Swap Long', 'Swap Short'].includes(c) && 'text-center')}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {segments.map(seg => (
                    <>
                      <tr key={`seg-${seg}`} className="bg-bg-tertiary/20">
                        <td colSpan={8} className="px-3 py-1.5 text-xxs font-semibold text-text-secondary uppercase tracking-wider">{seg}</td>
                      </tr>
                      {instruments.filter(i => i.segment === seg).map(inst => {
                        const isEditing = editingId === inst.id;
                        const isSaving = saving === inst.id;

                        if (isEditing && editState) {
                          return (
                            <tr key={inst.id} className="border-b border-buy/20 bg-buy/[0.03]">
                              <td className="px-3 py-1.5">
                                <span className="text-xs text-buy font-semibold">{inst.symbol}</span>
                                <span className="text-xxs text-text-tertiary ml-1">{inst.display_name}</span>
                              </td>
                              <td className="px-3 py-1.5">
                                <div className="flex items-center gap-1 justify-center">
                                  <input type="number" step="any" min="0" value={editState.commission} onChange={e => setEditState({ ...editState, commission: e.target.value })} placeholder="0" className="w-16 px-1.5 py-1 text-xs bg-bg-input border border-border-primary rounded text-center font-mono tabular-nums text-text-primary" />
                                  <select value={editState.commission_type} onChange={e => setEditState({ ...editState, commission_type: e.target.value })} className="text-xxs py-1 px-1 bg-bg-input border border-border-primary rounded text-text-primary">
                                    <option value="commission_per_lot">/lot</option>
                                    <option value="commission_per_trade">/trade</option>
                                    <option value="spread_percentage">%</option>
                                  </select>
                                </div>
                              </td>
                              <td className="px-3 py-1.5">
                                <div className="flex items-center gap-1 justify-center">
                                  <input type="number" step="0.1" min="0" value={editState.spread} onChange={e => setEditState({ ...editState, spread: e.target.value })} placeholder="0" className="w-16 px-1.5 py-1 text-xs bg-bg-input border border-border-primary rounded text-center font-mono tabular-nums text-text-primary" />
                                  <select value={editState.spread_type} onChange={e => setEditState({ ...editState, spread_type: e.target.value })} className="text-xxs py-1 px-1 bg-bg-input border border-border-primary rounded text-text-primary">
                                    <option value="fixed">fix</option>
                                    <option value="variable">var</option>
                                  </select>
                                </div>
                              </td>
                              <td className="px-3 py-1.5 text-center">
                                <span className="text-xxs text-warning font-mono">{editState.spread ? spreadPrice(parseFloat(editState.spread), inst.pip_size) : '—'}</span>
                              </td>
                              <td className="px-3 py-1.5 text-center">
                                <input type="number" step="0.01" value={editState.swap_long} onChange={e => setEditState({ ...editState, swap_long: e.target.value })} className="w-16 px-1.5 py-1 text-xs bg-bg-input border border-border-primary rounded text-center font-mono tabular-nums text-text-primary" />
                              </td>
                              <td className="px-3 py-1.5 text-center">
                                <input type="number" step="0.01" value={editState.swap_short} onChange={e => setEditState({ ...editState, swap_short: e.target.value })} className="w-16 px-1.5 py-1 text-xs bg-bg-input border border-border-primary rounded text-center font-mono tabular-nums text-text-primary" />
                              </td>
                              <td className="px-3 py-1.5 text-center">
                                <button onClick={() => setEditState({ ...editState, swap_free: !editState.swap_free })} className={cn('w-8 h-4 rounded-full transition-fast relative', editState.swap_free ? 'bg-success' : 'bg-bg-hover border border-border-primary')}>
                                  <span className={cn('absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-fast', editState.swap_free ? 'left-[16px]' : 'left-0.5')} />
                                </button>
                              </td>
                              <td className="px-3 py-1.5">
                                <div className="flex items-center gap-1 justify-end">
                                  <button onClick={() => saveEdit(inst)} disabled={isSaving} className="p-1 rounded text-success hover:bg-success/15 transition-fast" title="Save">
                                    {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                  </button>
                                  <button onClick={cancelEdit} className="p-1 rounded text-text-tertiary hover:text-danger hover:bg-danger/10 transition-fast" title="Cancel">
                                    <X size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr key={inst.id} className="border-b border-border-primary/50 hover:bg-bg-hover/50 transition-fast group cursor-pointer" onClick={() => startEdit(inst)}>
                            <td className="px-3 py-2">
                              <span className="text-xs text-text-primary font-semibold">{inst.symbol}</span>
                              <span className="text-xxs text-text-tertiary ml-1.5">{inst.display_name}</span>
                            </td>
                            <td className="px-3 py-2 text-xs text-center font-mono tabular-nums text-text-secondary">
                              {inst.charge ? <span>${inst.charge.value}<span className="text-xxs text-text-tertiary">/{inst.charge.type === 'commission_per_lot' ? 'lot' : inst.charge.type === 'commission_per_trade' ? 'trade' : '%'}</span></span> : <span className="text-text-tertiary">—</span>}
                            </td>
                            <td className="px-3 py-2 text-xs text-center font-mono tabular-nums text-text-secondary">
                              {inst.spread ? <span>{inst.spread.value} <span className="text-xxs text-text-tertiary">pips</span></span> : <span className="text-text-tertiary">—</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {inst.spread ? <span className="text-xxs text-warning font-mono">{spreadPrice(inst.spread.value, inst.pip_size)}</span> : <span className="text-xxs text-text-tertiary">—</span>}
                            </td>
                            <td className={cn('px-3 py-2 text-xs text-center font-mono tabular-nums', (inst.swap?.long ?? 0) < 0 ? 'text-danger' : 'text-text-secondary')}>
                              {inst.swap ? inst.swap.long : '—'}
                            </td>
                            <td className={cn('px-3 py-2 text-xs text-center font-mono tabular-nums', (inst.swap?.short ?? 0) < 0 ? 'text-danger' : 'text-text-secondary')}>
                              {inst.swap ? inst.swap.short : '—'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {inst.swap?.free ? (
                                <span className="text-xxs px-1.5 py-0.5 rounded-sm bg-success/15 text-success font-medium">Yes</span>
                              ) : (
                                <span className="text-xxs text-text-tertiary">No</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Edit3 size={12} className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-fast inline" />
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
