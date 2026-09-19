import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { LogOut } from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth.store';
import { NAV_ITEMS, visibleNavItems } from '@/constants/nav';

const LAST_TAB_KEY = [...NAV_ITEMS].reverse().find((item) => item.tab)?.key;

export function SidebarNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const items = visibleNavItems(user?.role);
  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? '?';

  return (
    <SafeAreaView
      edges={['top', 'bottom', 'left']}
      className="w-[196px] bg-[#2B1F17] dark:bg-dark-card"
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
            <Text className="text-[10px] font-medium text-[#C0A78E]" numberOfLines={1}>
              {user?.storeId ?? ''}
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
                  className={`border-l-[3px] px-4 py-2.5 ${active ? 'border-l-primary bg-[#3B2A1E]' : 'border-l-transparent'}`}
                >
                  <Text
                    className={`text-[13px] ${active ? 'font-semibold text-white' : 'font-medium text-[#B9A392]'}`}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                </Pressable>
                {item.key === LAST_TAB_KEY ? <View className="mx-4 my-2.5 h-px bg-[#4A3627]" /> : null}
              </View>
            );
          })}
        </ScrollView>

        <View className="flex-row items-center gap-2.5 border-t border-[#4A3627] px-4 pt-3.5">
          <View className="h-7 w-7 items-center justify-center rounded-full bg-[#3B2A1E]">
            <Text className="text-[12px] font-semibold text-[#FBF6F0]">{initial}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-[12px] font-semibold text-white" numberOfLines={1}>
              {user?.name}
            </Text>
            <Text className="text-[10px] font-medium text-[#C0A78E]" numberOfLines={1}>
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
            <LogOut size={16} color="#B9A392" />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
