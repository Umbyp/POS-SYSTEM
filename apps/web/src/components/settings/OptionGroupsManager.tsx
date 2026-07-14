'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface OptionRow { name: string; priceDelta: string; isDefault: boolean }
interface GroupForm {
  name: string;
  selectType: 'single' | 'multi';
  required: boolean;
  options: OptionRow[];
}

const EMPTY: GroupForm = {
  name: '',
  selectType: 'single',
  required: true,
  options: [{ name: '', priceDelta: '0', isDefault: false }],
};

/** Human label for a group's selection rule. */
function ruleLabel(g: any): string {
  const single = g.maxSelect === 1;
  const req = g.minSelect >= 1;
  return `${single ? 'เลือก 1 อย่าง' : 'เลือกหลายอย่างได้'} · ${req ? 'บังคับเลือก' : 'ไม่บังคับ'}`;
}

export function OptionGroupsManager() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any | 'new' | null>(null);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['option-groups'],
    queryFn: () => api.get('/products/option-groups').then((r) => r.data),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/products/option-groups/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['option-groups'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('ลบชุดตัวเลือกแล้ว');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'ลบไม่สำเร็จ'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">ตัวเลือกเมนู</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            ตั้งชุดตัวเลือกกลาง เช่น ความหวาน / ท็อปปิ้ง แล้วนำไปใช้กับเมนูไหนก็ได้
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="w-4 h-4 mr-1" /> เพิ่มชุด
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="shimmer h-16 rounded-lg" />)}</div>
      ) : groups.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
          ยังไม่มีชุดตัวเลือก — กด “เพิ่มชุด” เพื่อเริ่ม
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((g: any) => (
            <div key={g.id} className="border border-border rounded-lg p-3 bg-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{g.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{ruleLabel(g)}</div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {g.options.map((o: any) => (
                      <span key={o.id} className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {o.name}
                        {Number(o.priceDelta) !== 0 && (
                          <span className="ml-1 text-foreground">
                            {Number(o.priceDelta) > 0 ? '+' : ''}{formatCurrency(o.priceDelta)}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                  {g._count?.products > 0 && (
                    <div className="text-[11px] text-muted-foreground mt-2">ใช้กับ {g._count.products} เมนู</div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => setEditing(g)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost"
                    onClick={() => { if (confirm(`ลบชุด "${g.name}"?`)) del.mutate(g.id); }}>
                    <Trash2 className="w-3.5 h-3.5 text-danger" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <GroupEditor
        target={editing}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function GroupEditor({ target, onClose }: { target: any | 'new' | null; onClose: () => void }) {
  const qc = useQueryClient();
  const open = target !== null;
  const isNew = target === 'new';
  const [form, setForm] = useState<GroupForm>(EMPTY);

  useEffect(() => {
    if (!open) return;
    if (isNew) {
      setForm(EMPTY);
    } else {
      setForm({
        name: target.name,
        selectType: target.maxSelect === 1 ? 'single' : 'multi',
        required: target.minSelect >= 1,
        options: target.options.map((o: any) => ({
          name: o.name,
          priceDelta: String(Number(o.priceDelta)),
          isDefault: o.isDefault,
        })),
      });
    }
  }, [open, target]);

  const save = useMutation({
    mutationFn: (payload: any) =>
      isNew
        ? api.post('/products/option-groups', payload).then((r) => r.data)
        : api.put(`/products/option-groups/${target.id}`, payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['option-groups'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('บันทึกชุดตัวเลือกแล้ว');
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'บันทึกไม่สำเร็จ'),
  });

  const submit = () => {
    const options = form.options
      .filter((o) => o.name.trim())
      .map((o) => ({ name: o.name.trim(), priceDelta: parseFloat(o.priceDelta) || 0, isDefault: o.isDefault }));
    if (!form.name.trim()) return toast.error('ใส่ชื่อชุดตัวเลือก');
    if (options.length === 0) return toast.error('ต้องมีอย่างน้อย 1 ตัวเลือก');
    save.mutate({
      name: form.name.trim(),
      // single-select => max 1; multi => 0 (unlimited)
      maxSelect: form.selectType === 'single' ? 1 : 0,
      minSelect: form.required ? 1 : 0,
      options,
    });
  };

  const setOpt = (i: number, patch: Partial<OptionRow>) =>
    setForm((f) => ({ ...f, options: f.options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>{isNew ? 'เพิ่มชุดตัวเลือก' : 'แก้ไขชุดตัวเลือก'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block">ชื่อชุด</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="เช่น ความหวาน, ท็อปปิ้ง" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="mb-1.5 block text-xs">รูปแบบ</Label>
              <div className="grid grid-cols-2 gap-1">
                {(['single', 'multi'] as const).map((s) => (
                  <button key={s} type="button"
                    onClick={() => setForm({ ...form, selectType: s })}
                    className={`p-2 rounded-lg border-2 text-xs font-medium transition-all ${
                      form.selectType === s ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground'
                    }`}>
                    {s === 'single' ? 'เลือก 1' : 'หลายอัน'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">การบังคับ</Label>
              <div className="grid grid-cols-2 gap-1">
                {[true, false].map((req) => (
                  <button key={String(req)} type="button"
                    onClick={() => setForm({ ...form, required: req })}
                    className={`p-2 rounded-lg border-2 text-xs font-medium transition-all ${
                      form.required === req ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground'
                    }`}>
                    {req ? 'บังคับ' : 'ไม่บังคับ'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label>ตัวเลือก</Label>
              <Button type="button" size="sm" variant="outline"
                onClick={() => setForm({ ...form, options: [...form.options, { name: '', priceDelta: '0', isDefault: false }] })}>
                <Plus className="w-3 h-3 mr-1" /> เพิ่ม
              </Button>
            </div>
            <div className="space-y-2">
              {form.options.map((o, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                  <Input className="flex-1" placeholder="ชื่อ เช่น หวานน้อย"
                    value={o.name} onChange={(e) => setOpt(i, { name: e.target.value })} />
                  <Input className="w-20" type="number" step="0.01" placeholder="+฿"
                    value={o.priceDelta} onChange={(e) => setOpt(i, { priceDelta: e.target.value })} />
                  <button type="button" title="ค่าเริ่มต้น"
                    onClick={() => setOpt(i, { isDefault: !o.isDefault })}
                    className={`text-[10px] px-1.5 h-9 rounded border shrink-0 ${
                      o.isDefault ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
                    }`}>
                    ตั้งต้น
                  </button>
                  <Button type="button" size="icon" variant="ghost"
                    onClick={() => setForm({ ...form, options: form.options.filter((_, idx) => idx !== i) })}>
                    <Trash2 className="w-4 h-4 text-danger" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-border">
            <Button variant="outline" className="flex-1" onClick={onClose}>ยกเลิก</Button>
            <Button className="flex-1" onClick={submit} disabled={save.isPending}>บันทึก</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
