'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { adminApi } from '@/lib/api';
import {
  LayoutDashboard, Users, CandlestickChart, Wallet, Landmark,
  Settings, Sliders, BarChart3, Gift, Image, HeadphonesIcon,
  UserCog, ChevronDown, ChevronRight, Network, Share2,
  DollarSign, Percent, ArrowLeftRight, PanelLeftClose, PanelLeft,
  Receipt,
} from 'lucide-react';

interface NavItem {
  label: string;
  href?: string;
  icon: any;
  badge?: number;
  perm?: string;
  children?: { label: string; href: string; perm?: string }[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Users', href: '/users', icon: Users, perm: 'users.view' },
  { label: 'Trades', href: '/trades', icon: CandlestickChart, perm: 'trades.view' },
  { label: 'Deposits', href: '/deposits', icon: Wallet, perm: 'deposits.view' },
  { label: 'Transactions', href: '/transactions', icon: Receipt, perm: 'deposits.view' },
  { label: 'Banks', href: '/banks', icon: Landmark, perm: 'banks.view' },
  {
    label: 'Config', icon: Sliders, perm: 'config.view',
    children: [
      { label: 'Overview', href: '/config' },
      { label: 'Charges', href: '/config/charges' },
      { label: 'Spreads', href: '/config/spreads' },
      { label: 'Swaps', href: '/config/swaps' },
    ],
  },
  { label: 'Social', href: '/social', icon: Share2, perm: 'social.view' },
  {
    label: 'Business', icon: Network, perm: 'ib.view',
    children: [
      { label: 'Overview', href: '/business' },
      { label: 'IB Program', href: '/business/ib' },
      { label: 'Sub-Broker', href: '/business/sub-broker' },
      { label: 'MLM Config', href: '/business/mlm' },
    ],
  },
  { label: 'Analytics', href: '/analytics', icon: BarChart3, perm: 'analytics.view' },
  { label: 'Bonus', href: '/bonus', icon: Gift, perm: 'bonus.view' },
  { label: 'Banners', href: '/banners', icon: Image, perm: 'banners.view' },
  { label: 'Support', href: '/support', icon: HeadphonesIcon, perm: 'tickets.view' },
  { label: 'Employees', href: '/employees', icon: UserCog, perm: '_super_admin' },
  { label: 'Settings', href: '/settings', icon: Settings, perm: '_super_admin' },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['Config', 'Business']);
  const [permissions, setPermissions] = useState<string[]>(['*']);
  const [employeeRole, setEmployeeRole] = useState<string>('super_admin');

  useEffect(() => {
    (async () => {
      try {
        const me = await adminApi.get<{ permissions: string[]; employee_role: string }>('/auth/me');
        setPermissions(me.permissions || []);
        setEmployeeRole(me.employee_role || '');
      } catch {}
    })();
  }, []);

  const hasAccess = (perm?: string) => {
    if (!perm) return true;
    if (permissions.includes('*')) return true;
    if (perm === '_super_admin') return employeeRole === 'super_admin';
    return permissions.includes(perm);
  };

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) =>
      prev.includes(label) ? prev.filter((g) => g !== label) : [...prev, label]
    );
  };

  const isActive = (href?: string) => href && pathname === href;

  const visibleItems = NAV_ITEMS.filter(item => hasAccess(item.perm));

  return (
    <div className={cn(
      'flex flex-col h-full bg-bg-secondary border-r border-border-primary transition-all duration-200',
      collapsed ? 'w-14' : 'w-60',
    )}>
      {/* Header */}
      <div className="flex items-center h-12 px-3 border-b border-border-primary">
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-sm bg-buy flex items-center justify-center">
              <span className="text-white text-xxs font-bold">P</span>
            </div>
            <span className="text-md font-bold text-text-primary">Admin</span>
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn('p-1 text-text-tertiary hover:text-text-secondary transition-fast rounded-sm hover:bg-bg-hover', !collapsed && 'ml-auto')}
        >
          {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {visibleItems.map((item) => {
          if (item.children) {
            const isExpanded = expandedGroups.includes(item.label);
            const hasActiveChild = item.children.some((c) => pathname?.startsWith(c.href));
            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleGroup(item.label)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-fast',
                    hasActiveChild ? 'text-buy' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover',
                  )}
                >
                  <item.icon size={16} />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </>
                  )}
                </button>
                {isExpanded && !collapsed && (
                  <div className="ml-4 border-l border-border-primary">
                    {item.children.filter(c => hasAccess(c.perm)).map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          'block pl-4 pr-3 py-1.5 text-xs transition-fast',
                          isActive(child.href)
                            ? 'text-buy border-l-2 border-buy -ml-px'
                            : 'text-text-tertiary hover:text-text-primary',
                        )}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href!}
              className={cn(
                'flex items-center gap-2 px-3 py-2 text-xs font-medium transition-fast relative',
                isActive(item.href)
                  ? 'text-buy bg-bg-hover border-l-2 border-buy'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover',
              )}
            >
              <item.icon size={16} />
              {!collapsed && (
                <>
                  <span>{item.label}</span>
                  {item.badge && item.badge > 0 && (
                    <span className="ml-auto px-1.5 py-0.5 text-xxs bg-sell/20 text-sell rounded-sm tabular-nums">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
