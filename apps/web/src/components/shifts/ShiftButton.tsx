'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, PlayCircle, StopCircle, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatCurrency, formatTime } from '@/lib/format';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

export function ShiftButton() {
  const qc = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);

  const { data: activeShift } = useQuery({
    queryKey: ['shift-active'],
    queryFn: () => api.get('/employees/shifts/active').then((r) => r.data),
    refetchInterval: 30_000,
  });

  if (activeShift) {
    // กะเปิดอยู่ — แสดงปุ่มปิดกะ + นาฬิกา
    const startTime = formatTime(activeShift.startTime);
    return (
      <>
        <button
          onClick={() => setOpenDialog(true)}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-success/10 border border-success/30 text-success text-xs hover:bg-success/20 transition-colors"
        >
          <PlayCircle className="w-3.5 h-3.5" />
          <span>กะเปิด · {startTime}</span>
        </button>
        <button
          onClick={() => setOpenDialog(true)}
          className="sm:hidden p-2 rounded-lg bg-success/10 border border-success/30 text-success"
          aria-label="จัดการกะ"
        >
          <PlayCircle className="w-4 h-4" />
        </button>
        <CloseShiftDialog
          open={openDialog}
          onClose={() => setOpenDialog(false)}
          shift={activeShift}
          onClosed={() => qc.invalidateQueries({ queryKey: ['shift-active'] })}
        />
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpenDialog(true)}
        className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-card-hover text-xs transition-colors"
      >
        <PlayCircle className="w-3.5 h-3.5" /> เปิดกะ
      </button>
      <button
        onClick={() => setOpenDialog(true)}
        className="sm:hidden p-2 rounded-lg border border-border bg-card hover:bg-card-hover"
        aria-label="เปิดกะ"
      >
        <PlayCircle className="w-4 h-4" />
      </button>
      <OpenShiftDialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        onOpened={() => qc.invalidateQueries({ queryKey: ['shift-active'] })}
      />
    </>
  );
}

function OpenShiftDialog({
  open,
  onClose,
  onOpened,
}: {
  open: boolean;
  onClose: () => void;
  onOpened: () => void;
}) {
  const [openingCash, setOpeningCash] = useState('0');

  const mut = useMutation({
    mutationFn: (cash: number) =>
      api.post('/employees/shifts/open', { openingCash: cash }).then((r) => r.data),
    onSuccess: () => {
      toast.success('เปิดกะแล้ว');
      onOpened();
      onClose();
      setOpeningCash('0');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'เปิดกะไม่สำเร็จ'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlayCircle className="w-5 h-5 text-success" /> เปิดกะใหม่
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate(parseFloat(openingCash) || 0);
          }}
          className="space-y-3"
        >
          <p className="text-sm text-muted-foreground">
            นับเงินสดในลิ้นชักก่อนเริ่มกะ เพื่อเช็คตอนปิดกะให้ตรง
          </p>
          <div>
            <Label className="mb-1.5 block">เงินสดเริ่มต้น (บาท)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              className="text-lg h-12 tabular-nums"
              autoFocus
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" variant="success" className="flex-1" disabled={mut.isPending}>
              {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'เปิดกะ'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CloseShiftDialog({
  open,
  onClose,
  shift,
  onClosed,
}: {
  open: boolean;
  onClose: () => void;
  shift: any;
  onClosed: () => void;
}) {
  const [closingCash, setClosingCash] = useState('');
  const [notes, setNotes] = useState('');

  const { data: summary } = useQuery({
    queryKey: ['shift-summary', shift?.id],
    queryFn: () =>
      api.get('/orders', {
        params: { limit: 200 },
      }).then((r) => {
        const orders = r.data.data.filter(
          (o: any) =>
            o.cashierId === shift.userId &&
            new Date(o.createdAt) >= new Date(shift.startTime) &&
            !['CANCELLED', 'REFUNDED'].includes(o.status)
        );
        const totalSales = orders.reduce((s: number, o: any) => s + Number(o.total), 0);
        const cashSales = orders.reduce((s: number, o: any) => {
          const cash = o.payments
            .filter((p: any) => p.method === 'CASH')
            .reduce((ss: number, p: any) => ss + Number(p.amount), 0);
          return s + cash;
        }, 0);
        return { totalSales, cashSales, orderCount: orders.length };
      }),
    enabled: open && !!shift,
  });

  const expectedCash = (Number(shift?.openingCash || 0) + (summary?.cashSales || 0));
  const diff = closingCash ? parseFloat(closingCash) - expectedCash : 0;

  const mut = useMutation({
    mutationFn: (payload: any) =>
      api.post(`/employees/shifts/${shift.id}/close`, payload).then((r) => r.data),
    onSuccess: () => {
      toast.success('ปิดกะเรียบร้อย');
      onClosed();
      onClose();
      setClosingCash('');
      setNotes('');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'ปิดกะไม่สำเร็จ'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StopCircle className="w-5 h-5 text-danger" /> ปิดกะ
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between p-2 rounded bg-muted">
            <span className="text-muted-foreground">เปิดกะเวลา</span>
            <span className="font-medium">{formatTime(shift?.startTime)}</span>
          </div>
          <div className="flex justify-between p-2 rounded bg-muted">
            <span className="text-muted-foreground">เงินสดเริ่มต้น</span>
            <span className="tabular-nums font-medium">
              {formatCurrency(shift?.openingCash || 0)}
            </span>
          </div>
          <div className="flex justify-between p-2 rounded bg-muted">
            <span className="text-muted-foreground">ยอดขายระหว่างกะ ({summary?.orderCount || 0} ออเดอร์)</span>
            <span className="tabular-nums font-medium">
              {formatCurrency(summary?.totalSales || 0)}
            </span>
          </div>
          <div className="flex justify-between p-2 rounded bg-primary/10 border border-primary/30">
            <span className="font-medium flex items-center gap-1">
              <Wallet className="w-3.5 h-3.5" /> เงินสดที่ควรมี
            </span>
            <span className="tabular-nums font-bold text-primary">
              {formatCurrency(expectedCash)}
            </span>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate({
              closingCash: parseFloat(closingCash) || 0,
              notes: notes || undefined,
            });
          }}
          className="space-y-3 mt-2"
        >
          <div>
            <Label className="mb-1.5 block">นับเงินสดในลิ้นชักจริง</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={closingCash}
              onChange={(e) => setClosingCash(e.target.value)}
              className="text-lg h-12 tabular-nums"
              required
              autoFocus
            />
            {closingCash && (
              <div
                className={`mt-2 text-sm font-medium ${
                  Math.abs(diff) < 0.01
                    ? 'text-success'
                    : diff > 0
                    ? 'text-warning'
                    : 'text-danger'
                }`}
              >
                {Math.abs(diff) < 0.01
                  ? '✅ ตรงพอดี'
                  : diff > 0
                  ? `⚠️ เกิน ${formatCurrency(diff)}`
                  : `🔴 ขาด ${formatCurrency(-diff)}`}
              </div>
            )}
          </div>
          <div>
            <Label className="mb-1.5 block">บันทึก (ไม่บังคับ)</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="เช่น มีเงินทอนผิดให้ลูกค้า..."
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm"
              rows={2}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" variant="danger" className="flex-1" disabled={mut.isPending}>
              {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'ปิดกะ'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
