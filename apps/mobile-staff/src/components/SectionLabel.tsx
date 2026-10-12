import { Text } from 'react-native';

/** Small grey label that sits above a block (card, table, list). */
export function SectionLabel({ children, className }: { children: string; className?: string }) {
  return (
    <Text className={`text-[12px] font-semibold text-muted-foreground dark:text-dark-muted-foreground ${className ?? ''}`}>
      {children}
    </Text>
  );
}
