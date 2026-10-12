import { View, Text, Pressable } from 'react-native';

export interface UnderlineTab<K extends string = string> {
  key: K;
  label: string;
}

interface UnderlineTabsProps<K extends string> {
  tabs: UnderlineTab<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Stretch tabs to share the full width equally (default true). */
  fill?: boolean;
  className?: string;
}

/** Underline tabs: selected = orange text + 2px orange underline, on a thin bottom border. */
export function UnderlineTabs<K extends string>({ tabs, value, onChange, fill = true, className }: UnderlineTabsProps<K>) {
  return (
    <View className={`flex-row border-b border-border dark:border-dark-border ${className ?? ''}`}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            className={`items-center border-b-2 py-3 ${fill ? 'flex-1' : 'px-4'} ${on ? 'border-primary' : 'border-transparent'}`}
            style={{ marginBottom: -1 }}
          >
            <Text className={`text-[13px] ${on ? 'font-bold text-primary dark:text-primary-400' : 'font-medium text-muted-foreground dark:text-dark-muted-foreground'}`}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
