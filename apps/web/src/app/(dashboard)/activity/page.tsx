'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, User, ShoppingCart, Edit3, Trash2, Undo2, LogIn, Package, Filter } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n';

const ACTION_META: Record<string, { labelKey: string; icon: any; variant: any; color: string }> = {
  LOGIN: { labelKey: 'activity.action.LOGIN', icon: LogIn, variant: 'default', color: 'text-blue-400' },
  CREATE_ORDER: { labelKey: 'activity.action.CREATE_ORDER', icon: ShoppingCart, variant: 'success', color: 'text-success' },
  REFUND: { labelKey: 'activity.action.REFUND', icon: Undo2, variant: 'warning', color: 'text-warning' },
  CREATE_PRODUCT: { labelKey: 'activity.action.CREATE_PRODUCT', icon: Package, variant: 'success', color: 'text-success' },
  UPDATE_PRODUCT: { labelKey: 'activity.action.UPDATE_PRODUCT', icon: Edit3, variant: 'default', color: 'text-foreground' },
  DELETE_PRODUCT: { labelKey: 'activity.action.DELETE_PRODUCT', icon: Trash2, variant: 'danger', color: 'text-danger' },
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
      <div className="flex items-center justify-between mb-4 gap-2">
        <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
          <History className="w-5 h-5" /> {t('nav.activity')}
        </h2>
        <Badge variant="default">{data?.total || 0} {t('activity.entries')}</Badge>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 scrollbar-thin">
        <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
        <button
          onClick={() => setFilter('')}
          className={`px-3 py-1 text-xs rounded-full border shrink-0 ${
            !filter ? 'bg-primary text-white border-primary' : 'border-border hover:bg-muted/50'
          }`}
        >
          {t('activity.all')}
        </button>
        {Object.entries(ACTION_META).map(([key, meta]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1 text-xs rounded-full border shrink-0 ${
              filter === key
                ? 'bg-primary text-white border-primary'
                : 'border-border hover:bg-muted/50'
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
            const variant = meta?.variant || 'default';
            const color = meta?.color || 'text-muted-foreground';
            return (
              <div
                key={log.id}
                className="bg-card border border-border rounded-xl p-3 flex items-start gap-3 hover:bg-card-hover transition-colors"
              >
                <div
                  className={`w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 ${color}`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={variant} className="text-[10px]">
                      {label}
                    </Badge>
                    <span className="text-sm font-medium truncate">
                      {log.user?.name || t('activity.unknown')}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
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
                  <div className="text-[10px] text-muted-foreground mt-1">
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
