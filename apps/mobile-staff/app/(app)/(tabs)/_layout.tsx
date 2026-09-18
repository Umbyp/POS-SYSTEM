import { Tabs } from 'expo-router';
import { LayoutDashboard, ShoppingCart, ChefHat, Grid3X3, MoreHorizontal } from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth.store';

export default function TabsLayout() {
  const role = useAuthStore((s) => s.user?.role);
  const can = (roles: string[]) => !!role && roles.includes(role);

  return (
    <Tabs screenOptions={{ headerShown: true, headerShadowVisible: false, tabBarActiveTintColor: '#FF6B35' }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />,
          href: can(['OWNER', 'ADMIN']) ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="pos"
        options={{
          title: 'POS',
          tabBarIcon: ({ color, size }) => <ShoppingCart color={color} size={size} />,
          href: can(['OWNER', 'ADMIN', 'CASHIER']) ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="kds"
        options={{
          title: 'Kitchen',
          tabBarIcon: ({ color, size }) => <ChefHat color={color} size={size} />,
          href: can(['OWNER', 'ADMIN', 'KITCHEN']) ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="tables"
        options={{
          title: 'Tables',
          tabBarIcon: ({ color, size }) => <Grid3X3 color={color} size={size} />,
          href: can(['OWNER', 'ADMIN', 'CASHIER']) ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <MoreHorizontal color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
