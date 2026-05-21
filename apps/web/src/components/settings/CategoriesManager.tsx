'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Check, X, FolderTree } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Category {
  id: string;
  name: string;
  icon: string | null;
  sortOrder: number;
}

export function CategoriesManager() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', icon: '' });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/products/categories').then((r) => r.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['categories'] });

  const create = useMutation({
    mutationFn: (payload: any) =>
      api.post('/products/categories', payload).then((r) => r.data),
    onSuccess: () => {
      invalidate();
      toast.success('เพิ่มหมวดหมู่แล้ว');
      reset();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'เพิ่มไม่สำเร็จ'),
  });

  const update = useMutation({
    mutationFn: ({ id, ...rest }: any) =>
      api.patch(`/products/categories/${id}`, rest).then((r) => r.data),
    onSuccess: () => {
      invalidate();
      toast.success('อัปเดตแล้ว');
      reset();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'อัปเดตไม่สำเร็จ'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/products/categories/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success('ลบหมวดหมู่แล้ว');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'ลบไม่สำเร็จ'),
  });

  const reset = () => {
    setAdding(false);
    setEditingId(null);
    setForm({ name: '', icon: '' });
  };

  const startEdit = (c: Category) => {
    setEditingId(c.id);
    setAdding(false);
    setForm({ name: c.name, icon: c.icon || '' });
  };

  const save = () => {
    if (!form.name.trim()) {
      toast.error('กรุณาใส่ชื่อหมวดหมู่');
      return;
    }
    if (editingId) {
      update.mutate({ id: editingId, name: form.name, icon: form.icon || null });
    } else {
      create.mutate({
        name: form.name,
        icon: form.icon || null,
        sortOrder: categories.length,
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderTree className="w-5 h-5" /> หมวดหมู่สินค้า
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {categories.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground py-2">ยังไม่มีหมวดหมู่</p>
        )}

        {categories.map((c) =>
          editingId === c.id ? (
            <CategoryEditRow
              key={c.id}
              form={form}
              setForm={setForm}
              onSave={save}
              onCancel={reset}
              loading={update.isPending}
            />
          ) : (
            <div
              key={c.id}
              className="flex items-center justify-between p-2.5 rounded-lg border border-border hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-lg shrink-0">
                  {c.icon || '📦'}
                </div>
                <div className="font-medium truncate">{c.name}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="icon" variant="ghost" onClick={() => startEdit(c)}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`ลบหมวดหมู่ "${c.name}"?`)) remove.mutate(c.id);
                  }}
                >
                  <Trash2 className="w-4 h-4 text-danger" />
                </Button>
              </div>
            </div>
          )
        )}

        {adding && (
          <CategoryEditRow
            form={form}
            setForm={setForm}
            onSave={save}
            onCancel={reset}
            loading={create.isPending}
          />
        )}

        {!adding && !editingId && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setAdding(true);
              setForm({ name: '', icon: '' });
            }}
          >
            <Plus className="w-4 h-4 mr-1" /> เพิ่มหมวดหมู่
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryEditRow({
  form,
  setForm,
  onSave,
  onCancel,
  loading,
}: {
  form: { name: string; icon: string };
  setForm: (f: any) => void;
  onSave: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border-2 border-primary bg-primary/5">
      <Input
        value={form.icon}
        onChange={(e) => setForm({ ...form, icon: e.target.value })}
        placeholder="🍕"
        className="w-16 text-center text-lg"
        maxLength={2}
      />
      <Input
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="ชื่อหมวดหมู่"
        className="flex-1"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave();
          if (e.key === 'Escape') onCancel();
        }}
      />
      <Button size="icon" variant="ghost" onClick={onSave} disabled={loading}>
        <Check className="w-4 h-4 text-success" />
      </Button>
      <Button size="icon" variant="ghost" onClick={onCancel}>
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
