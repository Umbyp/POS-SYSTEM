import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight, LogOut, User } from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth.store';
import { avatarInitial } from '@/lib/format';
import { NAV_ITEMS } from '@/constants/nav';

const TH_LABEL: Record<string, string> = {
  orders: 'ออเดอร์',
  products: 'สินค้า',
  inventory: 'สต็อก',
  customers: 'ลูกค้า · สมาชิก',
  loyalty: 'สะสมแต้ม',
  employees: 'พนักงาน',
  reports: 'รายงาน',
  activity: 'ประวัติ',
  settings: 'ตั้งค่า',
};

export default function MoreScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const items = NAV_ITEMS.filter((item) => !item.tab && !!user?.role && item.roles.includes(user.role));

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <ScrollView>
        <View className="mx-3.5 mt-3.5 flex-row items-center gap-3 rounded-[14px] border border-border bg-card p-3.5 dark:border-dark-border dark:bg-dark-card">
          <View className="h-10 w-10 items-center justify-center rounded-full bg-muted dark:bg-dark-muted">
            {avatarInitial(user?.name) ? (
              <Text className="text-[15px] font-semibold text-foreground dark:text-dark-foreground">{avatarInitial(user?.name)}</Text>
            ) : (
              <User size={18} color="#7A6A5C" />
            )}
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-bold text-foreground dark:text-dark-foreground">{user?.name}</Text>
            <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground" numberOfLines={1}>
              {user?.email} · {user?.role}
            </Text>
          </View>
        </View>

        <View className="mx-3.5 mt-3 overflow-hidden rounded-[14px] border border-border bg-card dark:border-dark-border dark:bg-dark-card">
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <Pressable
                key={item.key}
                onPress={() => router.push(item.href as never)}
                className={`flex-row items-center gap-3 px-3.5 py-3.5 active:bg-muted dark:active:bg-dark-muted ${i > 0 ? 'border-t border-muted dark:border-dark-muted' : ''}`}
              >
                <Icon size={20} color="#7A6A5C" />
                <Text className="flex-1 text-[14px] font-medium text-foreground dark:text-dark-foreground">
                  {TH_LABEL[item.key] ?? item.label}
                </Text>
                <ChevronRight size={18} color="#A89684" />
              </Pressable>
            );
          })}
        </View>

        <View className="mx-3.5 mb-6 mt-3 overflow-hidden rounded-[14px] border border-border bg-card dark:border-dark-border dark:bg-dark-card">
          <Pressable
            onPress={() => {
              logout();
              router.replace('/login');
            }}
            className="flex-row items-center gap-3 px-3.5 py-3.5 active:bg-muted dark:active:bg-dark-muted"
          >
            <LogOut size={20} color="#B91C1C" />
            <Text className="text-[14px] font-semibold text-danger">ออกจากระบบ</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
