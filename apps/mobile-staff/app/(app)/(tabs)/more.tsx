import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight, LogOut } from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth.store';
import { NAV_ITEMS } from '@/constants/nav';

export default function MoreScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const items = NAV_ITEMS.filter((item) => !item.tab && !!user?.role && item.roles.includes(user.role));

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <ScrollView>
        <View className="px-4 pt-4 pb-2">
          <Text className="text-[15px] font-semibold text-foreground dark:text-dark-foreground">{user?.name}</Text>
          <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">
            {user?.email} · {user?.role}
          </Text>
        </View>

        <View className="mt-2 px-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Pressable
                key={item.key}
                onPress={() => router.push(item.href as never)}
                className="flex-row items-center gap-3 rounded-lg px-2.5 py-3 active:bg-muted dark:active:bg-dark-muted"
              >
                <Icon size={20} color="#6B7280" />
                <Text className="flex-1 text-[14px] text-foreground dark:text-dark-foreground">{item.label}</Text>
                <ChevronRight size={18} color="#9CA3AF" />
              </Pressable>
            );
          })}
        </View>

        <View className="mt-6 px-3">
          <Pressable
            onPress={() => {
              logout();
              router.replace('/login');
            }}
            className="flex-row items-center gap-3 rounded-lg px-2.5 py-3 active:bg-muted dark:active:bg-dark-muted"
          >
            <LogOut size={20} color="#EF4444" />
            <Text className="text-[14px] font-medium text-danger">ออกจากระบบ</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
