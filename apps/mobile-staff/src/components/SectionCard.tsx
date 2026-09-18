import { View, Text } from 'react-native';
import type { ReactNode } from 'react';

interface SectionCardProps {
  title?: string;
  children: ReactNode;
}

export function SectionCard({ title, children }: SectionCardProps) {
  return (
    <View className="rounded-xl border border-border bg-card dark:border-dark-border dark:bg-dark-card p-4 gap-3.5">
      {title ? <Text className="text-[13px] font-semibold text-foreground dark:text-dark-foreground">{title}</Text> : null}
      {children}
    </View>
  );
}
