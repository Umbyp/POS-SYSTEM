import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { LogOut } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { avatarInitial } from '@/lib/format';
import { NAV_ITEMS, visibleNavItems } from '@/constants/nav';
import type { StoreSettings } from '@/types/backoffice';

// Thai labels matching the redesign; nav.ts keeps the English keys/labels.
const TH_LABEL: Record<string, string> = {
  dashboard: 'ภาพรวม',
  pos: 'ขาย (POS)',
  kds: 'ครัว',
  tables: 'โต๊ะ',
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

const LAST_TAB_KEY = [...NAV_ITEMS].reverse().find((item) => item.tab)?.key;

export function SidebarNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: store } = useQuery({
    queryKey: ['store-me'],
    queryFn: async () => (await api.get('/stores/me')).data as StoreSettings,
  });
  const { user, logout } = useAuthStore();
  const items = visibleNavItems(user?.role);
  const initial = avatarInitial(user?.name) ?? '?';

  return (
    <SafeAreaView
      edges={['top', 'bottom', 'left']}
      className="w-[196px] bg-[#1F1F1F] dark:bg-dark-card"
    >
      <View className="flex-1 py-4">
        <View className="flex-row items-center gap-2.5 px-4 pb-4">
          <View className="h-[30px] w-[30px] items-center justify-center rounded-lg bg-primary">
            <Text className="text-[15px] font-bold text-white">R</Text>
          </View>
          <View className="flex-1">
            <Text className="text-[13px] font-bold text-white" numberOfLines={1}>
              RestroPOS
            </Text>
            <Text className="text-[10px] font-medium text-[#A3A3A3]" numberOfLines={1}>
              {store?.name ?? ''}
            </Text>
          </View>
        </View>

        <ScrollView className="flex-1">
          {items.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <View key={item.key}>
                <Pressable
                  onPress={() => router.push(item.href as never)}
                  className={`border-l-[3px] px-4 py-[11px] ${active ? 'border-l-primary bg-[#2C2C2C]' : 'border-l-transparent'}`}
                >
                  <Text
                    className={`text-[13px] ${active ? 'font-semibold text-white' : 'font-medium text-[#A3A3A3]'}`}
                    numberOfLines={1}
                  >
                    {TH_LABEL[item.key] ?? item.label}
                  </Text>
                </Pressable>
                {item.key === LAST_TAB_KEY ? <View className="mx-4 my-2.5 h-px bg-[#3A3A3A]" /> : null}
              </View>
            );
          })}
        </ScrollView>

        <View className="flex-row items-center gap-2.5 border-t border-[#3A3A3A] px-4 pt-3.5">
          <View className="h-7 w-7 items-center justify-center rounded-full bg-[#2C2C2C]">
            <Text className="text-[12px] font-semibold text-[#F5F5F5]">{initial}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-[12px] font-semibold text-white" numberOfLines={1}>
              {user?.name}
            </Text>
            <Text className="text-[10px] font-medium text-[#A3A3A3]" numberOfLines={1}>
              {user?.role}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              logout();
              router.replace('/login');
            }}
            hitSlop={8}
          >
            <LogOut size={16} color="#A3A3A3" />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
