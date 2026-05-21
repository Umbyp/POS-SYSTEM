'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit3, Trash2, Tag, Power, Calendar, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const TYPE_LABEL: Record<string, string> = {
  PERCENT_OFF: 'ลด %',
  FIXED_OFF: 'ลดบาท',
  BUY_X_GET_Y: 'ซื้อแถม',
  FIXED_PRICE: 'ราคาพิเศษ',
};

const SCOPE_LABEL: Record<string, string> = {
  ALL_ORDER: 'ทั้งบิล',
  CATEGORY: 'เฉพาะหมวด',
  PRODUCT: 'เฉพาะสินค้า',
};

const DOW_LABEL = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

export function PromotionsManager() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  const { data: promos = [] } = useQuery({
    queryKey: ['promotions'],
    queryFn: () => api.get('/promotions').then((r) => r.data),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/promotions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promotions'] });
      toast.success('ลบโปรโมชันแล้ว');
    },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: any) =>
      api.patch(`/promotions/${id}`, { isActive }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotions'] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Tag className="w-5 h-5" /> โปรโมชัน
          </span>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-1" /> เพิ่มโปรฯ
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {promos.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            ยังไม่มีโปรโมชัน
          </p>
        ) : (
          <div className="space-y-2">
            {promos.map((p: any) => (
              <div
                key={p.id}
                className={`p-3 rounded-lg border transition-colors ${
                  p.isActive ? 'border-primary/30 bg-primary/5' : 'border-border opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-medium truncate">{p.name}</span>
                      <Badge variant="accent" className="text-[10px]">
                        {TYPE_LABEL[p.type]}
                      </Badge>
                      <Badge variant="default" className="text-[10px]">
                        {SCOPE_LABEL[p.scope]}
                      </Badge>
                      {p.code && (
                        <Badge variant="warning" className="text-[10px] font-mono">
                          CODE: {p.code}
                        </Badge>
                      )}
                      {p.memberOnly && (
                        <Badge variant="success" className="text-[10px]">
                          สมาชิกเท่านั้น
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center flex-wrap gap-x-3 gap-y-0.5">
                      <span>
                        ค่า: <strong>{p.value}</strong>
                        {p.type === 'PERCENT_OFF' && '%'}
                      </span>
                      {p.type === 'BUY_X_GET_Y' && (
                        <span>ซื้อ {p.buyQty} แถม {p.getQty}</span>
                      )}
                      {p.minSpend && (
                        <span>ขั้นต่ำ {formatCurrency(p.minSpend)}</span>
                      )}
                      {p.daysOfWeek?.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {p.daysOfWeek.map((d: number) => DOW_LABEL[d]).join(',')}
                        </span>
                      )}
                      {p.hourStart != null && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {String(p.hourStart).padStart(2, '0')}-{String(p.hourEnd).padStart(2, '0')}
                        </span>
                      )}
                      {p.usageLimit && (
                        <span>
                          ใช้แล้ว {p.usageCount}/{p.usageLimit}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleActive.mutate({ id: p.id, isActive: !p.isActive })}
                      className={`p-1.5 rounded ${
                        p.isActive
                          ? 'text-success hover:bg-success/10'
                          : 'text-muted-foreground hover:bg-muted'
                      }`}
                      title={p.isActive ? 'ปิด' : 'เปิด'}
                    >
                      <Power className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditing(p)}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`ลบ "${p.name}"?`)) remove.mutate(p.id);
                      }}
                      className="p-1.5 rounded hover:bg-muted text-danger"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <PromotionDialog
        open={creating || !!editing}
        editing={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </Card>
  );
}

function PromotionDialog({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: any;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!editing;

  const [form, setForm] = useState<any>(() => ({
    name: editing?.name || '',
    code: editing?.code || '',
    type: editing?.type || 'PERCENT_OFF',
    scope: editing?.scope || 'ALL_ORDER',
    value: editing?.value || '',
    buyQty: editing?.buyQty || '',
    getQty: editing?.getQty || '',
    minSpend: editing?.minSpend || '',
    daysOfWeek: editing?.daysOfWeek || [],
    hourStart: editing?.hourStart ?? '',
    hourEnd: editing?.hourEnd ?? '',
    memberOnly: editing?.memberOnly || false,
    usageLimit: editing?.usageLimit || '',
  }));

  // reset form when editing changes
  useState(() => {
    if (editing) setForm(editing);
  });

  const save = useMutation({
    mutationFn: (payload: any) =>
      isEdit
        ? api.patch(`/promotions/${editing.id}`, payload).then((r) => r.data)
        : api.post('/promotions', payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promotions'] });
      toast.success(isEdit ? 'บันทึกแล้ว' : 'สร้างโปรโมชันแล้ว');
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'บันทึกไม่สำเร็จ'),
  });

  const toggleDay = (d: number) => {
    const cur = form.daysOfWeek || [];
    setForm({
      ...form,
      daysOfWeek: cur.includes(d) ? cur.filter((x: number) => x !== d) : [...cur, d],
    });
  };

  const handleSubmit = () => {
    const payload: any = {
      name: form.name,
      code: form.code || null,
      type: form.type,
      scope: form.scope,
      value: parseFloat(form.value) || 0,
      buyQty: form.buyQty ? parseInt(form.buyQty) : null,
      getQty: form.getQty ? parseInt(form.getQty) : null,
      minSpend: form.minSpend ? parseFloat(form.minSpend) : null,
      daysOfWeek: form.daysOfWeek || [],
      hourStart: form.hourStart !== '' ? parseInt(form.hourStart) : null,
      hourEnd: form.hourEnd !== '' ? parseInt(form.hourEnd) : null,
      memberOnly: !!form.memberOnly,
      usageLimit: form.usageLimit ? parseInt(form.usageLimit) : null,
    };
    save.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'แก้ไขโปรโมชัน' : 'โปรโมชันใหม่'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block">ชื่อโปรโมชัน *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="เช่น Happy Hour 50%, รับ 200 ลด 30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">ประเภท *</Label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full h-10 bg-input border border-border rounded-lg px-3 text-sm"
              >
                <option value="PERCENT_OFF">ลด %</option>
                <option value="FIXED_OFF">ลดบาท</option>
                <option value="BUY_X_GET_Y">ซื้อ X แถม Y</option>
                <option value="FIXED_PRICE">ราคาพิเศษ</option>
              </select>
            </div>
            <div>
              <Label className="mb-1.5 block">ขอบเขต *</Label>
              <select
                value={form.scope}
                onChange={(e) => setForm({ ...form, scope: e.target.value })}
                className="w-full h-10 bg-input border border-border rounded-lg px-3 text-sm"
              >
                <option value="ALL_ORDER">ทั้งบิล</option>
                <option value="CATEGORY">เฉพาะหมวด</option>
                <option value="PRODUCT">เฉพาะสินค้า</option>
              </select>
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">
              ค่า * {form.type === 'PERCENT_OFF' && '(%)'} {form.type !== 'PERCENT_OFF' && '(บาท)'}
            </Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
            />
          </div>

          {form.type === 'BUY_X_GET_Y' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block">ซื้อ (X)</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.buyQty}
                  onChange={(e) => setForm({ ...form, buyQty: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1.5 block">แถม (Y)</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.getQty}
                  onChange={(e) => setForm({ ...form, getQty: e.target.value })}
                />
              </div>
            </div>
          )}

          <div>
            <Label className="mb-1.5 block">โค้ดส่วนลด (ไม่บังคับ)</Label>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="เช่น SUMMER2026 — ถ้ามีจะ require ลูกค้ากรอก"
              className="font-mono uppercase"
            />
          </div>

          <div>
            <Label className="mb-1.5 block">ยอดขั้นต่ำ (บาท)</Label>
            <Input
              type="number"
              min="0"
              value={form.minSpend}
              onChange={(e) => setForm({ ...form, minSpend: e.target.value })}
              placeholder="0 = ไม่จำกัด"
            />
          </div>

          <div>
            <Label className="mb-1.5 block">วันในสัปดาห์ (เว้นว่าง = ทุกวัน)</Label>
            <div className="flex gap-1">
              {DOW_LABEL.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`flex-1 h-9 rounded-lg text-xs font-medium transition-colors ${
                    form.daysOfWeek?.includes(i)
                      ? 'bg-primary text-white'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">ช่วงเวลาเริ่ม</Label>
              <Input
                type="number"
                min="0"
                max="23"
                value={form.hourStart}
                onChange={(e) => setForm({ ...form, hourStart: e.target.value })}
                placeholder="0-23"
              />
            </div>
            <div>
              <Label className="mb-1.5 block">ช่วงเวลาสิ้นสุด</Label>
              <Input
                type="number"
                min="0"
                max="23"
                value={form.hourEnd}
                onChange={(e) => setForm({ ...form, hourEnd: e.target.value })}
                placeholder="0-23"
              />
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">จำกัดจำนวนครั้งใช้ (รวมทุกบิล)</Label>
            <Input
              type="number"
              min="1"
              value={form.usageLimit}
              onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
              placeholder="เว้นว่าง = ไม่จำกัด"
            />
          </div>

          <label className="flex items-center gap-2 p-2 rounded-lg border border-border">
            <input
              type="checkbox"
              checked={form.memberOnly}
              onChange={(e) => setForm({ ...form, memberOnly: e.target.checked })}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-sm">เฉพาะสมาชิก (ต้องเลือกลูกค้าก่อน)</span>
          </label>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={save.isPending || !form.name || !form.value}
            >
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'บันทึก'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
