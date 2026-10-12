import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { useActiveShift, useMinuteTick } from '@/hooks/useShift';
import { formatElapsedMinutes } from '@/lib/format';

const SHIFT_ROLES = ['OWNER', 'ADMIN', 'CASHIER'];

/** Compact status chip: "กะเปิดอยู่ · 2 ชม." / "ยังไม่เปิดกะ" — taps through to the shift screen. */
export function ShiftChip() {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const allowed = !!role && SHIFT_ROLES.includes(role);
  const { data: shift } = useActiveShift(allowed);
  useMinuteTick();
  if (!allowed || shift === undefined) return null;

  const open = !!shift;
  return (
    <Pressable
      onPress={() => router.push('/shift' as never)}
      hitSlop={6}
      className={`h-8 flex-row items-center gap-1.5 rounded-full border px-2.5 ${
        open ? 'border-success/40 bg-success/10' : 'border-warning/40 bg-warning/10'
      }`}
    >
      <View className={`h-2 w-2 rounded-full ${open ? 'bg-success dark:bg-dark-success' : 'bg-warning dark:bg-dark-warning'}`} />
      <Text
        numberOfLines={1}
        className={`text-[11px] font-semibold ${open ? 'text-success dark:text-dark-success' : 'text-warning dark:text-dark-warning'}`}
      >
        {open ? `กะเปิดอยู่ · ${formatElapsedMinutes(shift.startTime)}` : 'ยังไม่เปิดกะ'}
      </Text>
    </Pressable>
  );
}
