import { StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { LayoutDashboard, ShoppingCart, ChefHat, Grid3X3, MoreHorizontal } from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth.store';
import { useIsTablet } from '@/hooks/useIsTablet';
import { useThemeColors } from '@/lib/theme';

export default function TabsLayout() {
  const role = useAuthStore((s) => s.user?.role);
  const isTablet = useIsTablet();
  const t = useThemeColors();
  const can = (roles: string[]) => !!role && roles.includes(role);

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: t.card },
        sceneStyle: { backgroundColor: t.background },
        headerTitleStyle: { fontSize: 16, fontWeight: '700', color: t.foreground },
        tabBarActiveTintColor: t.primary,
        // The sidebar (SidebarNav) owns primary navigation on tablet, so the
        // bottom tab bar is redundant there — hide it instead of removing
        // the navigator, which would require a second routing structure.
        tabBarInactiveTintColor: t.mutedForeground,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        tabBarStyle: isTablet
          ? { display: 'none' }
          : { backgroundColor: t.card, borderTopColor: t.border, borderTopWidth: StyleSheet.hairlineWidth, elevation: 0, shadowOpacity: 0 },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'ภาพรวม',
          headerShown: isTablet,
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={22} />,
          href: can(['OWNER', 'ADMIN']) ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="pos"
        options={{
          title: 'ขาย',
          // The POS screen draws its own "รับออเดอร์" header — a second native title would duplicate it.
          headerShown: false,
          tabBarIcon: ({ color, size }) => <ShoppingCart color={color} size={22} />,
          href: can(['OWNER', 'ADMIN', 'CASHIER']) ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="kds"
        options={{
          title: 'ครัว',
          tabBarIcon: ({ color, size }) => <ChefHat color={color} size={22} />,
          href: can(['OWNER', 'ADMIN', 'KITCHEN']) ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="tables"
        options={{
          title: 'โต๊ะ',
          tabBarIcon: ({ color, size }) => <Grid3X3 color={color} size={22} />,
          href: can(['OWNER', 'ADMIN', 'CASHIER']) ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'เพิ่มเติม',
          tabBarIcon: ({ color, size }) => <MoreHorizontal color={color} size={22} />,
        }}
      />
    </Tabs>
  );
}
