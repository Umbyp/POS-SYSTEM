'use client';
import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Check, Clock, Pencil, Trash2, Users, Receipt, Sparkles, CalendarClock, QrCode } from 'lucide-react';
import { TableQrDialog } from '@/components/tables/TableQrDialog';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useCart } from '@/stores/cart.store';
import { useT } from '@/lib/i18n';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Status = 'AVAILABLE' | 'RESERVED' | 'OCCUPIED' | 'BILLING' | 'DIRTY';
type Size = 'SMALL' | 'MEDIUM' | 'LARGE';

// Ordered for the status dialog / legend
const STATUSES: Status[] = ['AVAILABLE', 'RESERVED', 'OCCUPIED', 'BILLING', 'DIRTY'];

// Bolder fills/borders than a subtle tint so status reads at a glance across
// a busy floor — only AVAILABLE stays calm/neutral (it's the "nothing to do"
// state; coloring it too would drown out the tables that actually need attention).
const STATUS_COLOR: Record<Status, string> = {
  AVAILABLE: 'bg-card border-border hover:border-emerald-500/60 text-foreground',
  RESERVED: 'bg-sky-500/20 border-sky-500 text-sky-700 dark:text-sky-300',
  OCCUPIED: 'bg-indigo-500/20 border-indigo-500 text-indigo-700 dark:text-indigo-300',
  BILLING: 'bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300',
  DIRTY: 'bg-rose-500/20 border-rose-500 text-rose-700 dark:text-rose-300',
};

// Small dot color for legend/summary
const STATUS_DOT: Record<Status, string> = {
  AVAILABLE: 'bg-emerald-500',
  RESERVED: 'bg-sky-500',
  OCCUPIED: 'bg-indigo-500',
  BILLING: 'bg-amber-500',
  DIRTY: 'bg-rose-500',
};

const STATUS_LABEL: Record<Status, string> = {
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  OCCUPIED: 'Occupied',
  BILLING: 'Billing',
  DIRTY: 'Cleaning',
};

const STATUS_DESC: Record<Status, string> = {
  AVAILABLE: 'Open for customers',
  RESERVED: 'Booked in advance',
  OCCUPIED: 'Guests are seated',
  BILLING: 'Payment in progress',
  DIRTY: 'Needs cleaning',
};

const STATUS_ICON: Record<Status, any> = {
  AVAILABLE: Check,
  RESERVED: CalendarClock,
  OCCUPIED: Users,
  BILLING: Receipt,
  DIRTY: Sparkles,
};

// Statuses that count as "in use" (a guest occupies the table)
const IN_USE: Status[] = ['OCCUPIED', 'BILLING'];

/** Compact elapsed label since a guest sat down, e.g. "8m", "1h05m". */
function formatElapsed(occupiedAt?: string | null, nowMs?: number): string | null {
  if (!occupiedAt) return null;
  const start = new Date(occupiedAt).getTime();
  if (Number.isNaN(start)) return null;
  const mins = Math.max(0, Math.floor(((nowMs ?? Date.now()) - start) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${String(m).padStart(2, '0')}m`;
}

// Table size is conveyed by the label text, not by decorative color — one calm
// neutral chip for all sizes (practitioner look, not a rainbow).
const SIZE_BADGE = 'bg-muted text-muted-foreground border-border';
const SIZE_META: Record<Size, { labelKey: string; badge: string; defaultCapacity: number }> = {
  SMALL: { labelKey: 'tablesPage.size.SMALL', badge: SIZE_BADGE, defaultCapacity: 2 },
  MEDIUM: { labelKey: 'tablesPage.size.MEDIUM', badge: SIZE_BADGE, defaultCapacity: 4 },
  LARGE: { labelKey: 'tablesPage.size.LARGE', badge: SIZE_BADGE, defaultCapacity: 8 },
};

export default function TablesPage() {
  const qc = useQueryClient();
  const t = useT();
  const router = useRouter();
  const cartTableId = useCart((s) => s.tableId);
  const setCartTable = useCart((s) => s.setTable);
  const setCartType = useCart((s) => s.setType);
  const clearCart = useCart((s) => s.clear);

  // Jump to the POS with this table selected → its running bill loads there.
  // Switching to a *different* table must wipe any leftover discount/points/
  // customer from whatever was in the cart before — otherwise a discount
  // applied to one table's bill could silently carry over to the next.
  const goToBill = (tableId: string) => {
    if (cartTableId !== tableId) clearCart();
    setCartType('DINE_IN');
    setCartTable(tableId);
    router.push('/pos');
  };
  // Default to showing in-use tables: an occupied/billing table is an unpaid
  // bill staff still need to act on — hiding it by default made those tables
  // look like they "vanished" after a refresh. Persist the choice so toggling
  // it off (to hunt for a free table) survives a reload too.
  const [showOccupied, setShowOccupied] = useState(true);
  useEffect(() => {
    const saved = localStorage.getItem('tables:showOccupied');
    if (saved !== null) setShowOccupied(saved === '1');
  }, []);
  useEffect(() => {
    localStorage.setItem('tables:showOccupied', showOccupied ? '1' : '0');
  }, [showOccupied]);
  const [sizeFilter, setSizeFilter] = useState<Size | 'ALL'>('ALL');
  const [selectedTable, setSelectedTable] = useState<any>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editTable, setEditTable] = useState<any>(null);
  const [qrTable, setQrTable] = useState<any>(null);

  // Tick every 30s so elapsed-time badges stay fresh without refetching
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: () => api.get('/tables').then((r) => r.data),
  });

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) =>
      api.patch(`/tables/${id}/status`, { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['tables'] });
      const previous = qc.getQueryData<any[]>(['tables']);
      qc.setQueryData<any[]>(['tables'], (old = []) =>
        old.map((t) => (t.id === id ? { ...t, status } : t))
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(['tables'], ctx.previous);
      toast.error(t('tablesPage.updateFailed'));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['tables'] }),
    onSuccess: (_d, { status }) => {
      toast.success(t(`tables.status.${status}`, STATUS_LABEL[status]));
      setSelectedTable(null);
    },
  });

  const counts = useMemo(() => {
    const c: Record<Status, number> = { AVAILABLE: 0, RESERVED: 0, OCCUPIED: 0, BILLING: 0, DIRTY: 0 };
    for (const t of tables as any[]) {
      const s = t.status as Status;
      if (c[s] !== undefined) c[s]++;
    }
    return c;
  }, [tables]);
  const inUseCount = counts.OCCUPIED + counts.BILLING;

  const sizeCounts = useMemo(() => {
    const c: Record<Size, number> = { SMALL: 0, MEDIUM: 0, LARGE: 0 };
    for (const t of tables as any[]) {
      const s = (t.size || 'MEDIUM') as Size;
      if (c[s] !== undefined) c[s]++;
    }
    return c;
  }, [tables]);

  const visibleTables = useMemo(() => {
    return (tables as any[]).filter((t) => {
      if (!showOccupied && IN_USE.includes(t.status as Status)) return false;
      if (sizeFilter !== 'ALL' && (t.size || 'MEDIUM') !== sizeFilter) return false;
      return true;
    });
  }, [tables, showOccupied, sizeFilter]);

  return (
    <div className="p-4 sm:p-6 h-full overflow-y-auto scrollbar-thin">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{t('tables.title')}</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-xs text-muted-foreground">
            {STATUSES.map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s]}`} />
                <span className="tabular-nums">
                  {counts[s]} {t(`tables.status.${s}`, STATUS_LABEL[s])}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowOccupied((v) => !v)}
            className="px-3 py-1.5 rounded-md border border-border bg-card hover:bg-card-hover text-sm transition-colors"
          >
            {showOccupied ? t('tables.hideOccupied') : t('tables.showOccupied')}
          </button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> {t('tables.addTable')}
          </Button>
        </div>
      </div>

      {/* Size filter chips */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 scrollbar-thin">
        <button
          onClick={() => setSizeFilter('ALL')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium shrink-0 transition-colors ${
            sizeFilter === 'ALL'
              ? 'bg-foreground text-background'
              : 'bg-card border border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('pos.all')} ({tables.length})
        </button>
        {(['SMALL', 'MEDIUM', 'LARGE'] as Size[]).map((s) => {
          const meta = SIZE_META[s];
          const count = sizeCounts[s];
          const active = sizeFilter === s;
          return (
            <button
              key={s}
              onClick={() => setSizeFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium shrink-0 transition-colors border ${
                active
                  ? meta.badge + ' border-transparent ring-2 ring-offset-1 ring-foreground/20'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(meta.labelKey)} ({count})
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="shimmer aspect-square rounded-lg" />
          ))}
        </div>
      ) : visibleTables.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p className="text-sm">
            {tables.length === 0 ? t('tables.noTables') : t('tables.noMatch')}
          </p>
          {tables.length === 0 ? (
            <Button className="mt-3" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> {t('tables.addFirst')}
            </Button>
          ) : (
            !showOccupied &&
            inUseCount > 0 && (
              <button
                onClick={() => setShowOccupied(true)}
                className="mt-3 text-xs text-primary hover:underline"
              >
                {t('tables.showOccupied')} ({inUseCount})
              </button>
            )
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
          <AnimatePresence mode="popLayout">
            {visibleTables.map((t2: any) => {
              const status = t2.status as Status;
              const seated = IN_USE.includes(status);
              const elapsed = seated ? formatElapsed(t2.occupiedAt, nowMs) : null;
              return (
                <motion.button
                  key={t2.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setSelectedTable(t2)}
                  aria-label={`${t('cart.tableWord')} ${t2.number}, ${t2.capacity} ${t('tables.seats')}, ${t(
                    `tables.status.${status}`,
                    STATUS_LABEL[status]
                  )}${elapsed ? `, ${t('tables.seated')} ${elapsed}` : ''}`}
                  className={`aspect-square rounded-xl border-2 p-2 flex flex-col items-center justify-center transition-colors touch-manipulation relative ${
                    STATUS_COLOR[status]
                  }`}
                >
                  <span className="absolute top-1.5 left-1.5 flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-background/60 backdrop-blur-sm tabular-nums">
                    <Users className="w-2.5 h-2.5" />
                    {t2.capacity}
                  </span>
                  {elapsed && (
                    <span className="absolute top-1.5 right-1.5 flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-background/60 backdrop-blur-sm tabular-nums">
                      <Clock className="w-2.5 h-2.5" />
                      {elapsed}
                    </span>
                  )}
                  <div className="text-3xl sm:text-4xl font-bold leading-none tabular-nums tracking-tight">
                    {t2.number}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider mt-1.5 font-semibold opacity-90">
                    {t(`tables.status.${status}`, STATUS_LABEL[status])}
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Status dialog */}
      <Dialog open={!!selectedTable} onOpenChange={(o) => !o && setSelectedTable(null)}>
        <DialogContent className="max-w-sm">
          {selectedTable && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {t('cart.tableWord')} {selectedTable.number}
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                      SIZE_META[(selectedTable.size || 'MEDIUM') as Size].badge
                    }`}
                  >
                    {t(SIZE_META[(selectedTable.size || 'MEDIUM') as Size].labelKey)}
                  </span>
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                {t('tables.currentStatus')}{' '}
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${
                    STATUS_COLOR[selectedTable.status as Status]
                  }`}
                >
                  {t(`tables.status.${selectedTable.status}`, STATUS_LABEL[selectedTable.status as Status])}
                </span>
                {IN_USE.includes(selectedTable.status as Status) &&
                  formatElapsed(selectedTable.occupiedAt, nowMs) && (
                    <span className="inline-flex items-center gap-1 text-xs tabular-nums">
                      <Clock className="w-3 h-3" />
                      {t('tables.seated')} {formatElapsed(selectedTable.occupiedAt, nowMs)}
                    </span>
                  )}
              </p>
              <div className="grid grid-cols-1 gap-2 mt-2">
                {STATUSES.map((s) => {
                  const Icon = STATUS_ICON[s];
                  const active = selectedTable.status === s;
                  return (
                    <button
                      key={s}
                      disabled={active || update.isPending}
                      onClick={() => update.mutate({ id: selectedTable.id, status: s })}
                      className={`p-3 rounded-lg border-2 flex items-center gap-3 transition-all text-left ${
                        active
                          ? 'opacity-50 cursor-not-allowed border-border'
                          : `${STATUS_COLOR[s]} hover:scale-[1.02]`
                      }`}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <div>
                        <div className="font-medium">{t(`tables.status.${s}`, STATUS_LABEL[s])}</div>
                        <div className="text-xs opacity-75">{t(`tables.desc.${s}`, STATUS_DESC[s])}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <Button
                className="w-full mt-1"
                onClick={() => goToBill(selectedTable.id)}
              >
                <Receipt className="w-4 h-4 mr-1.5" />
                {IN_USE.includes(selectedTable.status as Status)
                  ? t('tables.goToBill')
                  : t('tables.openBill')}
              </Button>
              <div className="flex gap-2 mt-2 pt-2 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setEditTable(selectedTable);
                    setSelectedTable(null);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5 mr-1" /> {t('tables.editTable')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setQrTable(selectedTable);
                    setSelectedTable(null);
                  }}
                >
                  <QrCode className="w-3.5 h-3.5 mr-1" /> {t('tableQr.buttonLabel')}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AddTableDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <EditTableDialog table={editTable} onClose={() => setEditTable(null)} />
      <TableQrDialog table={qrTable} onClose={() => setQrTable(null)} />
    </div>
  );
}

function AddTableDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = useState({ number: '', capacity: '4', size: 'MEDIUM' as Size });

  const create = useMutation({
    mutationFn: (payload: any) => api.post('/tables', payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tables'] });
      toast.success(t('tablesPage.added'));
      setForm({ number: '', capacity: '4', size: 'MEDIUM' });
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || t('tablesPage.addFailed')),
  });

  // Auto-suggest capacity based on size
  const onSizeChange = (s: Size) => {
    setForm((f) => ({ ...f, size: s, capacity: String(SIZE_META[s].defaultCapacity) }));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('tablesPage.addNew')}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({
              number: form.number,
              capacity: parseInt(form.capacity) || 4,
              size: form.size,
            });
          }}
          className="space-y-3"
        >
          <div>
            <Label className="mb-1.5 block">{t('tablesPage.numberLabel')}</Label>
            <Input
              value={form.number}
              onChange={(e) => setForm({ ...form, number: e.target.value })}
              placeholder={t('tablesPage.numberPlaceholder')}
              required
              autoFocus
            />
          </div>

          <div>
            <Label className="mb-1.5 block">{t('tablesPage.sizeLabel')}</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['SMALL', 'MEDIUM', 'LARGE'] as Size[]).map((s) => {
                const meta = SIZE_META[s];
                const active = form.size === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSizeChange(s)}
                    className={`p-2.5 rounded-lg border-2 transition-all text-sm font-medium ${
                      active
                        ? meta.badge + ' border-current'
                        : 'border-border hover:border-muted-foreground bg-card'
                    }`}
                  >
                    {t(meta.labelKey)}
                    <div className="text-[10px] opacity-70 mt-0.5">
                      {t('tablesPage.seatsApprox')}{meta.defaultCapacity} {t('tablesPage.seatsWord')}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">{t('tablesPage.seatsLabel')}</Label>
            <Input
              type="number"
              min="1"
              max="20"
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              required
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="flex-1" disabled={create.isPending}>
              {t('tablesPage.addButton')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditTableDialog({ table, onClose }: { table: any; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = useState({ number: '', capacity: '4', size: 'MEDIUM' as Size });

  // Sync form when table changes
  useEffect(() => {
    if (table) {
      setForm({
        number: table.number,
        capacity: String(table.capacity),
        size: (table.size || 'MEDIUM') as Size,
      });
    }
  }, [table?.id]);

  const update = useMutation({
    mutationFn: (payload: any) => api.patch(`/tables/${table.id}`, payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tables'] });
      toast.success(t('tablesPage.updated'));
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || t('tablesPage.updateFailed')),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/tables/${table.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tables'] });
      toast.success(t('tablesPage.deleted'));
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || t('tablesPage.deleteFailed')),
  });

  if (!table) return null;

  return (
    <Dialog open={!!table} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('tables.editTable')} {table.number}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({
              number: form.number,
              capacity: parseInt(form.capacity) || 4,
              size: form.size,
            });
          }}
          className="space-y-3"
        >
          <div>
            <Label className="mb-1.5 block">{t('tablesPage.numberLabel')}</Label>
            <Input
              value={form.number}
              onChange={(e) => setForm({ ...form, number: e.target.value })}
              required
            />
          </div>

          <div>
            <Label className="mb-1.5 block">{t('tablesPage.sizeLabel')}</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['SMALL', 'MEDIUM', 'LARGE'] as Size[]).map((s) => {
                const meta = SIZE_META[s];
                const active = form.size === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm({ ...form, size: s })}
                    className={`p-2 rounded-lg border-2 transition-all text-sm font-medium ${
                      active
                        ? meta.badge + ' border-current'
                        : 'border-border hover:border-muted-foreground bg-card'
                    }`}
                  >
                    {t(meta.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">{t('tablesPage.seatsLabel')}</Label>
            <Input
              type="number"
              min="1"
              max="20"
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              required
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm(`${t('tablesPage.confirmDelete')} ${table.number}?`)) remove.mutate();
              }}
              disabled={remove.isPending}
              className="text-danger hover:text-danger"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="flex-1" disabled={update.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
