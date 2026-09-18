import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';

interface PlaceholderScreenProps {
  title: string;
  icon: LucideIcon;
  note?: string;
}

/** Stub for screens whose real implementation lands in a later phase. */
export function PlaceholderScreen({ title, icon: Icon, note }: PlaceholderScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background" edges={['bottom', 'left', 'right']}>
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 dark:bg-dark-card">
          <Icon size={26} color="#FF6B35" />
        </View>
        <Text className="text-[17px] font-semibold text-foreground dark:text-dark-foreground">{title}</Text>
        <Text className="text-center text-[13px] text-muted-foreground dark:text-dark-muted-foreground">
          {note ?? 'This screen is coming in a later phase of the mobile build.'}
        </Text>
      </View>
    </SafeAreaView>
  );
}
