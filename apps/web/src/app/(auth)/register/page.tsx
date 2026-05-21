'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    storeName: '',
  });
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', form);
      setAuth(data.user, data.token);
      toast.success('สมัครสมาชิกสำเร็จ');
      router.push('/pos');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'สมัครไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-card border border-border rounded-3xl p-8">
        <h1 className="text-2xl font-bold text-center mb-2">สร้างร้านใหม่</h1>
        <p className="text-muted-foreground text-center text-sm mb-8">
          เริ่มต้นใช้งาน POS ในไม่กี่นาที
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="mb-2 block">ชื่อร้าน</Label>
            <Input
              value={form.storeName}
              onChange={(e) => setForm({ ...form, storeName: e.target.value })}
              required
            />
          </div>
          <div>
            <Label className="mb-2 block">ชื่อ-นามสกุล</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <Label className="mb-2 block">อีเมล</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div>
            <Label className="mb-2 block">รหัสผ่าน (อย่างน้อย 6 ตัว)</Label>
            <Input
              type="password"
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'สมัครและสร้างร้าน'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          มีบัญชีแล้ว?{' '}
          <Link href="/login" className="text-primary hover:underline">เข้าสู่ระบบ</Link>
        </p>
      </motion.div>
    </div>
  );
}
