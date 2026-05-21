'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Role = 'OWNER' | 'ADMIN' | 'CASHIER' | 'KITCHEN';

const ROLE_OPTIONS: { value: Role; label: string; desc: string }[] = [
  { value: 'CASHIER', label: 'แคชเชียร์', desc: 'ขายหน้าร้าน + จัดการโต๊ะ + ดูออเดอร์' },
  { value: 'KITCHEN', label: 'พนักงานครัว', desc: 'ดูหน้า Kitchen Display + อัปเดตสถานะออเดอร์' },
  { value: 'ADMIN', label: 'ผู้ดูแล', desc: 'จัดการสินค้า/สต็อก/พนักงาน + ทุกอย่างยกเว้นโอนกรรมสิทธิ์' },
  { value: 'OWNER', label: 'เจ้าของ', desc: 'สิทธิ์เต็ม รวมถึงตั้งค่าร้าน' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AddEmployeeDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'CASHIER' as Role,
  });

  const create = useMutation({
    mutationFn: (payload: typeof form) =>
      api.post('/employees', payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success('เพิ่มพนักงานสำเร็จ');
      setForm({ name: '', email: '', password: '', role: 'CASHIER' });
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || err.response?.data?.message || 'เพิ่มพนักงานไม่สำเร็จ';
      toast.error(msg);
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 6) {
      toast.error('รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร');
      return;
    }
    create.mutate(form);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" /> เพิ่มพนักงานใหม่
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="mb-1.5 block">ชื่อ-นามสกุล *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="เช่น สมศักดิ์ ใจดี"
              required
              autoFocus
            />
          </div>

          <div>
            <Label className="mb-1.5 block">อีเมล *</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="staff@example.com"
              required
            />
          </div>

          <div>
            <Label className="mb-1.5 block">รหัสผ่าน * (≥ 6 ตัวอักษร)</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              minLength={6}
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              พนักงานสามารถเปลี่ยนรหัสผ่านเองได้ภายหลัง
            </p>
          </div>

          <div>
            <Label className="mb-1.5 block">บทบาท *</Label>
            <div className="space-y-1.5">
              {ROLE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    form.role === opt.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={opt.value}
                    checked={form.role === opt.value}
                    onChange={() => setForm({ ...form, role: opt.value })}
                    className="mt-1 accent-primary"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" className="flex-1" disabled={create.isPending}>
              {create.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'เพิ่มพนักงาน'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
