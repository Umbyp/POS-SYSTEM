import { View } from 'react-native';
import type { ReactNode } from 'react';
import { SectionLabel } from './SectionLabel';

interface SectionCardProps {
  title?: string;
  children: ReactNode;
}

/** White bordered card; the optional title renders as a small grey label above it. */
export function SectionCard({ title, children }: SectionCardProps) {
  return (
    <View className="gap-1.5">
      {title ? <SectionLabel>{title}</SectionLabel> : null}
      <View className="gap-3 rounded-[10px] border border-border bg-card p-3.5 dark:border-dark-border dark:bg-dark-card">
        {children}
      </View>
    </View>
  );
}
