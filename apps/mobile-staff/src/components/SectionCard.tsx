import { View, Text } from 'react-native';
import type { ReactNode } from 'react';

interface SectionCardProps {
  title?: string;
  children: ReactNode;
}

export function SectionCard({ title, children }: SectionCardProps) {
  return (
    <View className="rounded-[14px] border border-border bg-card dark:border-dark-border dark:bg-dark-card p-4 gap-3">
      {title ? (
        <Text className="text-[12px] font-semibold text-[#8C6A4F] dark:text-dark-muted-foreground">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}
