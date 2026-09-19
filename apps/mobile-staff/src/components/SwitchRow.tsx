import { View, Text, Switch } from 'react-native';

interface SwitchRowProps {
  label: string;
  note?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

export function SwitchRow({ label, note, value, onChange }: SwitchRowProps) {
  return (
    <View className="flex-row items-center justify-between py-1">
      <View className="flex-1 pr-3">
        <Text className="text-[14px] text-foreground dark:text-dark-foreground">{label}</Text>
        {note ? <Text className="text-[12px] text-muted-foreground dark:text-dark-muted-foreground">{note}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: '#C9622E' }} />
    </View>
  );
}
