'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, ShoppingCart, Edit3, Trash2, Undo2, LogIn, Package, Filter } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n';

const ACTION_META: Record<string, { labelKey: string; icon: any; tone: 'blue' | 'success' | 'warning' | 'default' | 'danger' }> = {
  LOGIN: { labelKey: 'activity.action.LOGIN', icon: LogIn, tone: 'blue' },
  CREATE_ORDER: { labelKey: 'activity.action.CREATE_ORDER', icon: ShoppingCart, tone: 'success' },
  REFUND: { labelKey: 'activity.action.REFUND', icon: Undo2, tone: 'warning' },
  CREATE_PRODUCT: { labelKey: 'activity.action.CREATE_PRODUCT', icon: Package, tone: 'success' },
  UPDATE_PRODUCT: { labelKey: 'activity.action.UPDATE_PRODUCT', icon: Edit3, tone: 'default' },
  DELETE_PRODUCT: { labelKey: 'activity.action.DELETE_PRODUCT', icon: Trash2, tone: 'danger' },
};

const TONE_CLASSES: Record<string, { icon: string; badge: string }> = {
  blue: { icon: 'bg-blue-500/10 text-blue-500', badge: 'bg-blue-500/10 text-blue-500' },
  success: { icon: 'bg-success/10 text-success', badge: 'bg-success/10 text-success' },
  warning: { icon: 'bg-warning/10 text-warning', badge: 'bg-warning/10 text-warning' },
  danger: { icon: 'bg-danger/10 text-danger', badge: 'bg-danger/10 text-danger' },
  default: { icon: 'bg-muted text-foreground', badge: 'bg-muted text-foreground' },
};

export default function ActivityPage() {
  const t = useT();
  const [filter, setFilter] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['activity-logs', filter],
    queryFn: () =>
      api
        .get('/activity-logs', { params: filter ? { action: filter } : {} })
        .then((r) => r.data),
  });

  const logs = data?.data || [];

  return (
    <div className="p-4 sm:p-6 h-full overflow-y-auto scrollbar-thin">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="text-lg sm:text-xl font-extrabold tracking-tight flex items-center gap-2">
          <History className="w-5 h-5 text-primary" /> {t('nav.activity')}
        </h2>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
          {data?.total || 0} {t('activity.entries')}
        </span>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1 scrollbar-thin">
        <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
        <button
          onClick={() => setFilter('')}
          className={`px-3.5 py-2 text-[13px] font-semibold rounded-lg shrink-0 transition-colors ${
            !filter
              ? 'bg-foreground text-background'
              : 'bg-card border border-border hover:bg-muted'
          }`}
        >
          {t('activity.all')}
        </button>
        {Object.entries(ACTION_META).map(([key, meta]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3.5 py-2 text-[13px] font-semibold rounded-lg shrink-0 transition-colors ${
              filter === key
                ? 'bg-foreground text-background'
                : 'bg-card border border-border hover:bg-muted'
            }`}
          >
            {t(meta.labelKey)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="shimmer h-16 rounded-xl" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <History className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">{t('activity.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log: any) => {
            const meta = ACTION_META[log.action];
            const label = meta ? t(meta.labelKey) : log.action;
            const Icon = meta?.icon || History;
            const tone = TONE_CLASSES[meta?.tone || 'default'];
            return (
              <div
                key={log.id}
                className="bg-card border border-border rounded-xl p-3.5 flex items-start gap-3 hover:bg-card-hover transition-colors"
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tone.icon}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${tone.badge}`}>
                      {label}
                    </span>
                    <span className="text-sm font-bold truncate">
                      {log.user?.name || t('activity.unknown')}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      ({log.user?.role})
                    </span>
                  </div>
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1 font-mono break-all">
                      {Object.entries(log.metadata).map(([k, v]) => (
                        <span key={k} className="mr-3">
                          {k}: <span className="text-foreground">{String(v)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {formatDate(log.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
