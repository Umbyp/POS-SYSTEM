'use client';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Grid3X3, Eye, EyeOff, Plus, Check, X, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Status = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED';

const STATUS_COLOR: Record<Status, string> = {
  AVAILABLE: 'bg-card border-border hover:border-success/60 text-foreground',
  OCCUPIED: 'bg-danger/10 border-danger/60 text-danger',
  RESERVED: 'bg-warning/10 border-warning/60 text-warning',
};

const STATUS_LABEL: Record<Status, string> = {
  AVAILABLE: 'Available',
  OCCUPIED: 'Occupied',
  RESERVED: 'Reserved',
};

const STATUS_ICON: Record<Status, any> = {
  AVAILABLE: Check,
  OCCUPIED: X,
  RESERVED: Clock,
};

export default function TablesPage() {
  const qc = useQueryClient();
  const [showOccupied, setShowOccupied] = useState(false);
  const [selectedTable, setSelectedTable] = useState<any>(null);
  const [addOpen, setAddOpen] = useState(false);

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
      toast.error('Update failed');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['tables'] }),
    onSuccess: (_d, { status }) => {
      const labels = { AVAILABLE: 'Available', OCCUPIED: 'Occupied', RESERVED: 'Reserved' };
      toast.success(`Status changed to "${labels[status]}"`);
      setSelectedTable(null);
    },
  });

  const counts = useMemo(() => {
    const c = { AVAILABLE: 0, OCCUPIED: 0, RESERVED: 0 };
    for (const t of tables as any[]) c[t.status as Status]++;
    return c;
  }, [tables]);

  const visibleTables = useMemo(
    () => (tables as any[]).filter((t) => showOccupied || t.status !== 'OCCUPIED'),
    [tables, showOccupied]
  );

  return (
    <div className="p-4 sm:p-6 h-full overflow-y-auto scrollbar-thin">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Tables</h2>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              <span className="tabular-nums">{counts.AVAILABLE} Available</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-warning" />
              <span className="tabular-nums">{counts.RESERVED} Reserved</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-danger" />
              <span className="tabular-nums">{counts.OCCUPIED} Occupied</span>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowOccupied((v) => !v)}
            className="px-3 py-1.5 rounded-md border border-border bg-card hover:bg-card-hover text-sm transition-colors"
          >
            {showOccupied ? 'Hide occupied' : 'Show occupied'}
          </button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add table
          </Button>
        </div>
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
            {tables.length === 0 ? 'No tables yet' : 'No available or reserved tables'}
          </p>
          {tables.length === 0 ? (
            <Button className="mt-3" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add first table
            </Button>
          ) : (
            !showOccupied &&
            counts.OCCUPIED > 0 && (
              <button
                onClick={() => setShowOccupied(true)}
                className="mt-3 text-xs text-primary hover:underline"
              >
                Show occupied tables ({counts.OCCUPIED})
              </button>
            )
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
          <AnimatePresence mode="popLayout">
            {visibleTables.map((t: any) => (
              <motion.button
                key={t.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setSelectedTable(t)}
                className={`aspect-square rounded-lg border p-3 flex flex-col items-center justify-center transition-colors touch-manipulation ${
                  STATUS_COLOR[t.status as Status]
                }`}
              >
                <div className="text-2xl sm:text-3xl font-semibold leading-none tabular-nums tracking-tight">
                  {t.number}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                  {t.capacity} seats
                </div>
                <div className="text-[10px] uppercase tracking-wider mt-2 opacity-80">
                  {STATUS_LABEL[t.status as Status]}
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Status dialog */}
      <Dialog open={!!selectedTable} onOpenChange={(o) => !o && setSelectedTable(null)}>
        <DialogContent className="max-w-sm">
          {selectedTable && (
            <>
              <DialogHeader>
                <DialogTitle>Table {selectedTable.number}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Current status:{' '}
                <Badge
                  variant={
                    selectedTable.status === 'AVAILABLE'
                      ? 'success'
                      : selectedTable.status === 'OCCUPIED'
                      ? 'danger'
                      : 'warning'
                  }
                >
                  {STATUS_LABEL[selectedTable.status as Status]}
                </Badge>
              </p>
              <div className="grid grid-cols-1 gap-2 mt-2">
                {(['AVAILABLE', 'RESERVED', 'OCCUPIED'] as Status[]).map((s) => {
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
                        <div className="font-medium">{STATUS_LABEL[s]}</div>
                        <div className="text-xs opacity-75">
                          {s === 'AVAILABLE' && 'Open for customers'}
                          {s === 'RESERVED' && 'Reserved by customer'}
                          {s === 'OCCUPIED' && 'Customer is seated'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AddTableDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

function AddTableDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ number: '', capacity: '4' });

  const create = useMutation({
    mutationFn: (payload: any) => api.post('/tables', payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tables'] });
      toast.success('Table added');
      setForm({ number: '', capacity: '4' });
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to add table'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add new table</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ number: form.number, capacity: parseInt(form.capacity) || 4 });
          }}
          className="space-y-3"
        >
          <div>
            <Label className="mb-1.5 block">Table number / name *</Label>
            <Input
              value={form.number}
              onChange={(e) => setForm({ ...form, number: e.target.value })}
              placeholder="e.g. 1, A1, VIP-1"
              required
              autoFocus
            />
          </div>
          <div>
            <Label className="mb-1.5 block">Seats *</Label>
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
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={create.isPending}>
              Add table
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
