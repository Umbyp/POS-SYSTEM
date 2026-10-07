'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Printer as PrinterIcon } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Role = 'KITCHEN' | 'RECEIPT';

interface PrinterRow {
  id: string;
  name: string;
  ip: string;
  port: number;
  role: Role;
  autoPrint: boolean;
  copies: number;
  categoryIds: string[];
  isActive: boolean;
  status: 'ok' | 'error';
  stuckJobs: number;
  lastError: string | null;
  failingSince: string | null;
}

interface JobRow {
  id: string;
  kind: Role;
  status: 'PENDING' | 'PRINTED' | 'FAILED';
  attempts: number;
  error: string | null;
  createdAt: string;
  printedAt: string | null;
  orderNumber: string | null;
  printer: { id: string; name: string; role: Role };
}

interface Category { id: string; name: string }

const emptyForm = {
  name: '', ip: '', port: '9100', role: 'KITCHEN' as Role, copies: '1',
  autoPrint: true, isActive: true, categoryIds: [] as string[],
};

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

const errMsg = (e: any, fallback: string) => e?.response?.data?.error || fallback;

export function PrintersManager() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: printers = [] } = useQuery<PrinterRow[]>({
    queryKey: ['printers'],
    queryFn: () => api.get('/printers').then((r) => r.data),
    refetchInterval: 10_000,
  });
  const { data: jobs = [] } = useQuery<JobRow[]>({
    queryKey: ['print-jobs'],
    queryFn: () => api.get('/print-jobs', { params: { limit: 20 } }).then((r) => r.data),
    refetchInterval: 10_000,
  });
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/products/categories').then((r) => r.data),
  });
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? '?';

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['printers'] });
    qc.invalidateQueries({ queryKey: ['print-jobs'] });
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(), ip: form.ip.trim(), port: Number(form.port) || 9100,
        role: form.role, copies: Math.min(5, Math.max(1, Number(form.copies) || 1)),
        autoPrint: form.autoPrint, isActive: form.isActive,
        categoryIds: form.role === 'KITCHEN' ? form.categoryIds : [],
      };
      return editingId === 'new'
        ? api.post('/printers', body)
        : api.patch(`/printers/${editingId}`, body);
    },
    onSuccess: () => { toast.success('บันทึกสถานีพิมพ์แล้ว'); setEditingId(null); refresh(); },
    onError: (e) => toast.error(errMsg(e, 'บันทึกไม่สำเร็จ')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/printers/${id}`),
    onSuccess: () => { toast.success('ลบสถานีพิมพ์แล้ว'); refresh(); },
    onError: (e) => toast.error(errMsg(e, 'ลบไม่สำเร็จ')),
  });

  const test = useMutation({
    mutationFn: (id: string) => api.post(`/printers/${id}/test`),
    onSuccess: () => { toast.success('ส่งงานพิมพ์ทดสอบแล้ว — แอปมือถือที่อยู่ WiFi เดียวกับเครื่องจะพิมพ์ให้'); refresh(); },
    onError: (e) => toast.error(errMsg(e, 'ส่งไม่สำเร็จ')),
  });

  const reprint = useMutation({
    mutationFn: ({ id, printerId }: { id: string; printerId?: string }) =>
      api.post(`/print-jobs/${id}/reprint`, { printerId }),
    onSuccess: () => { toast.success('ส่งเข้าคิวพิมพ์อีกครั้งแล้ว'); refresh(); },
    onError: (e) => toast.error(errMsg(e, 'ส่งไม่สำเร็จ')),
  });

  const startEdit = (p: PrinterRow) => {
    setEditingId(p.id);
    setForm({
      name: p.name, ip: p.ip, port: String(p.port), role: p.role, copies: String(p.copies),
      autoPrint: p.autoPrint, isActive: p.isActive, categoryIds: p.categoryIds,
    });
  };
  const startNew = () => { setEditingId('new'); setForm(emptyForm); };

  const toggleCat = (id: string) =>
    setForm((f) => ({
      ...f,
      categoryIds: f.categoryIds.includes(id) ? f.categoryIds.filter((c) => c !== id) : [...f.categoryIds, id],
    }));

  const problemJobs = jobs.filter((j) => j.status !== 'PRINTED' && j.attempts > 0);
  const kitchenPrinters = printers.filter((p) => p.role === 'KITCHEN' && p.isActive);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PrinterIcon className="w-5 h-5" /> สถานีพิมพ์
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            เครื่องพิมพ์อยู่ใน WiFi ร้าน — ระบบสร้างงานพิมพ์ แล้วแอปมือถือพนักงานที่ต่อ WiFi เดียวกันจะพิมพ์ให้อัตโนมัติ
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {printers.length === 0 && editingId !== 'new' && (
            <p className="text-sm text-muted-foreground py-2">
              ยังไม่มีสถานีพิมพ์ (ถ้าไม่เพิ่ม ระบบจะใช้ค่า IP เครื่องพิมพ์เดิมที่ตั้งไว้)
            </p>
          )}

          {printers.map((p) =>
            editingId === p.id ? (
              <PrinterForm
                key={p.id} form={form} setForm={setForm} categories={categories}
                toggleCat={toggleCat} onSave={() => save.mutate()} onCancel={() => setEditingId(null)}
                saving={save.isPending}
              />
            ) : (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    !p.isActive ? 'bg-muted-foreground/40' : p.status === 'ok' ? 'bg-emerald-600' : 'bg-red-600'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">
                    {p.name}
                    {p.role === 'RECEIPT' && <span className="ml-1 text-muted-foreground font-normal">(ใบเสร็จ)</span>}
                    {!p.isActive && <span className="ml-1 text-muted-foreground font-normal">· ปิดใช้งาน</span>}
                  </div>
                  <div className={`text-[11px] font-mono truncate ${p.status === 'error' ? 'text-red-600' : 'text-muted-foreground'}`}>
                    {p.ip}:{p.port}
                    {p.status === 'error' && p.failingSince
                      ? ` · ไม่ตอบสนองตั้งแต่ ${hhmm(p.failingSince)} (${p.stuckJobs} งานค้าง)`
                      : p.role === 'KITCHEN'
                        ? ` · ${p.categoryIds.length ? p.categoryIds.map(catName).join(', ') : 'ทุกหมวด'}`
                        : ''}
                    {!p.autoPrint && ' · ไม่พิมพ์อัตโนมัติ'}
                    {p.copies > 1 && ` · ${p.copies} ใบ`}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={p.status === 'error' ? 'default' : 'outline'}
                  onClick={() => test.mutate(p.id)}
                  disabled={test.isPending || !p.isActive}
                >
                  {p.status === 'error' ? 'เชื่อมต่อใหม่' : 'พิมพ์ทดสอบ'}
                </Button>
                <Button size="icon" variant="ghost" onClick={() => startEdit(p)}><Edit className="w-4 h-4" /></Button>
                <Button
                  size="icon" variant="ghost"
                  onClick={() => { if (confirm(`ลบสถานีพิมพ์ "${p.name}"?`)) remove.mutate(p.id); }}
                >
                  <Trash2 className="w-4 h-4 text-danger" />
                </Button>
              </div>
            ),
          )}

          {editingId === 'new' ? (
            <PrinterForm
              form={form} setForm={setForm} categories={categories} toggleCat={toggleCat}
              onSave={() => save.mutate()} onCancel={() => setEditingId(null)} saving={save.isPending}
            />
          ) : (
            <button
              onClick={startNew}
              className="w-full flex items-center justify-center gap-1 p-2.5 rounded-lg border border-dashed border-border text-sm font-semibold text-muted-foreground hover:bg-muted/30"
            >
              <Plus className="w-4 h-4" /> เพิ่มสถานีพิมพ์
            </button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>คิวงานพิมพ์</CardTitle>
            {problemJobs.length > 0 && (
              <span className="text-xs font-semibold text-red-600">
                ค้าง {problemJobs.length} งาน · ลองใหม่ทุก 15 วินาที
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {jobs.length === 0 && <p className="text-sm text-muted-foreground py-2">ยังไม่มีงานพิมพ์</p>}
          {jobs.map((j) => {
            const color = j.status === 'PRINTED' ? 'bg-emerald-600' : j.attempts > 0 || j.status === 'FAILED' ? 'bg-red-600' : 'bg-amber-500';
            const label = `${j.kind === 'RECEIPT' ? 'ใบเสร็จ' : 'ใบครัว'} #${j.orderNumber?.split('-').pop() ?? '—'} → ${j.printer.name}`;
            const sub =
              j.status === 'PRINTED' ? `${hhmm(j.printedAt ?? j.createdAt)} · พิมพ์แล้ว`
              : j.status === 'FAILED' ? `${hhmm(j.createdAt)} · ล้มเหลว${j.error ? ` (${j.error})` : ''}`
              : j.attempts > 0 ? `${hhmm(j.createdAt)} · ลองแล้ว ${j.attempts} ครั้ง`
              : `${hhmm(j.createdAt)} · รอพิมพ์`;
            const alt = kitchenPrinters.find((p) => p.id !== j.printer.id);
            return (
              <div key={j.id} className="flex items-center gap-3 py-1.5">
                <div className={`w-1.5 h-8 rounded ${color} shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold truncate">{label}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{sub}</div>
                </div>
                {j.status !== 'PRINTED' && alt && (
                  <Button
                    size="sm" variant="outline"
                    onClick={() => reprint.mutate({ id: j.id, printerId: alt.id })}
                  >
                    พิมพ์ที่{alt.name}แทน
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => reprint.mutate({ id: j.id })}>
                  {j.status === 'PRINTED' ? 'พิมพ์ซ้ำ' : 'ลองใหม่'}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function PrinterForm({
  form, setForm, categories, toggleCat, onSave, onCancel, saving,
}: {
  form: typeof emptyForm;
  setForm: (f: typeof emptyForm) => void;
  categories: Category[];
  toggleCat: (id: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs space-y-1 col-span-2 sm:col-span-1">
          <span className="text-muted-foreground">ชื่อสถานี</span>
          <Input value={form.name} placeholder="เช่น ครัวหลัง, บาร์น้ำ" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="text-xs space-y-1 col-span-2 sm:col-span-1">
          <span className="text-muted-foreground">ประเภท</span>
          <select
            className="w-full h-10 rounded-md border border-border bg-background px-2 text-sm"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          >
            <option value="KITCHEN">ใบสั่งครัว</option>
            <option value="RECEIPT">ใบเสร็จ (เคาน์เตอร์)</option>
          </select>
        </label>
        <label className="text-xs space-y-1">
          <span className="text-muted-foreground">IP เครื่องพิมพ์</span>
          <Input value={form.ip} placeholder="192.168.1.40" onChange={(e) => setForm({ ...form, ip: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">พอร์ต</span>
            <Input inputMode="numeric" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">จำนวนใบ</span>
            <Input inputMode="numeric" value={form.copies} onChange={(e) => setForm({ ...form, copies: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.autoPrint} onChange={(e) => setForm({ ...form, autoPrint: e.target.checked })} />
          พิมพ์อัตโนมัติ{form.role === 'RECEIPT' ? 'เมื่อชำระเงินสำเร็จ' : 'เมื่อส่งเข้าครัว'}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          เปิดใช้งาน
        </label>
      </div>

      {form.role === 'KITCHEN' && (
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground">หมวดสินค้าที่พิมพ์ที่สถานีนี้ (ไม่เลือก = ทุกหมวด)</div>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => {
              const on = form.categoryIds.includes(c.id);
              return (
                <button
                  key={c.id} type="button" onClick={() => toggleCat(c.id)}
                  className={`px-2.5 py-1 rounded-full text-xs border ${
                    on ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>ยกเลิก</Button>
        <Button size="sm" onClick={onSave} disabled={saving || !form.name.trim() || !form.ip.trim()}>บันทึก</Button>
      </div>
    </div>
  );
}
