import { View, Text, Switch } from 'react-native';
import { useThemeColors } from '@/lib/theme';

interface SwitchRowProps {
  label: string;
  note?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

export function SwitchRow({ label, note, value, onChange }: SwitchRowProps) {
  const t = useThemeColors();
  return (
    <View className="flex-row items-center justify-between py-1">
      <View className="flex-1 pr-3">
        <Text className="text-[14px] text-foreground dark:text-dark-foreground">{label}</Text>
        {note ? <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">{note}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.primary, false: t.isDark ? '#3A3A3A' : undefined }} />
    </View>
  );
}
