import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { DEFAULT_ROUTE } from '@/constants/nav';

export default function Index() {
  const { token, user } = useAuthStore();

  if (!token) return <Redirect href="/login" />;
  // Token present but /auth/me hasn't resolved yet — land on POS, the
  // (app) layout's useRequireAuth will bounce to the right screen once the
  // role is known.
  return <Redirect href={(user ? DEFAULT_ROUTE[user.role] : '/pos') as never} />;
}
