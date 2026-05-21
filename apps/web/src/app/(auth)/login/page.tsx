'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { GoogleLogin } from '@react-oauth/google';
import { toast } from 'sonner';
import { Loader2, Lock, Mail, ShoppingBag } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const [email, setEmail] = useState('owner@pos.local');
  const [password, setPassword] = useState('admin1234');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setAuth(data.user, data.token);
      toast.success('Logged in successfully');
      router.push('/pos');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async (cred: any) => {
    try {
      const { data } = await api.post('/auth/google', { idToken: cred.credential });
      setAuth(data.user, data.token);
      toast.success('Logged in successfully');
      router.push('/pos');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Google login failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="bg-card border border-border rounded-3xl p-8 shadow-2xl">
          <div className="flex items-center justify-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/40">
              <ShoppingBag className="w-7 h-7 text-white" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-center mb-2">Sign in to POS</h1>
          <p className="text-muted-foreground text-center text-sm mb-8">
            Smart real-time store management
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="email" className="mb-2 block">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  className="pl-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="password" className="mb-2 block">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  className="pl-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'เข้าสู่ระบบ'}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">หรือ</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
            <div className="flex justify-center">
              <GoogleLogin onSuccess={handleGoogle} theme="filled_black" />
            </div>
          ) : (
            <p className="text-xs text-center text-muted-foreground">
              Google Login: ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID
            </p>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            ยังไม่มีบัญชี?{' '}
            <Link href="/register" className="text-primary hover:underline">
              สมัครใหม่
            </Link>
          </p>
        </div>

        <p className="mt-4 text-xs text-center text-muted-foreground">
          Demo: owner@pos.local / admin1234
        </p>
      </motion.div>
    </div>
  );
}
