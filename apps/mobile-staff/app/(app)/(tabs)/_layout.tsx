import { Tabs } from 'expo-router';
import { LayoutDashboard, ShoppingCart, ChefHat, Grid3X3, MoreHorizontal } from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth.store';
import { useIsTablet } from '@/hooks/useIsTablet';

export default function TabsLayout() {
  const role = useAuthStore((s) => s.user?.role);
  const isTablet = useIsTablet();
  const can = (roles: string[]) => !!role && roles.includes(role);

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        tabBarActiveTintColor: '#C9622E',
        // The sidebar (SidebarNav) owns primary navigation on tablet, so the
        // bottom tab bar is redundant there — hide it instead of removing
        // the navigator, which would require a second routing structure.
        tabBarInactiveTintColor: '#7A6A5C',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        tabBarStyle: isTablet
          ? { display: 'none' }
          : { backgroundColor: '#FFFFFF', borderTopColor: '#E7DACE', borderTopWidth: 1 },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'ภาพรวม',
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />,
          href: can(['OWNER', 'ADMIN']) ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="pos"
        options={{
          title: 'ขาย',
          tabBarIcon: ({ color, size }) => <ShoppingCart color={color} size={size} />,
          href: can(['OWNER', 'ADMIN', 'CASHIER']) ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="kds"
        options={{
          title: 'ครัว',
          tabBarIcon: ({ color, size }) => <ChefHat color={color} size={size} />,
          href: can(['OWNER', 'ADMIN', 'KITCHEN']) ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="tables"
        options={{
          title: 'โต๊ะ',
          tabBarIcon: ({ color, size }) => <Grid3X3 color={color} size={size} />,
          href: can(['OWNER', 'ADMIN', 'CASHIER']) ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'เพิ่มเติม',
          tabBarIcon: ({ color, size }) => <MoreHorizontal color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
