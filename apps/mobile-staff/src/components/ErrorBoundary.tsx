import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TriangleAlert } from 'lucide-react-native';
import { Button } from '@/components/Button';
import { useThemeColors } from '@/lib/theme';

function ErrorFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const t = useThemeColors();
  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-dark-background">
      <View className="flex-1 items-center justify-center gap-4 px-8">
        <View className="h-16 w-16 items-center justify-center rounded-[14px] bg-card dark:bg-dark-card border border-border dark:border-dark-border">
          <TriangleAlert size={30} color={t.danger} />
        </View>
        <Text className="text-[20px] font-bold text-foreground dark:text-dark-foreground">เกิดข้อผิดพลาด</Text>
        <Text className="max-w-[360px] text-center text-[14px] leading-[21px] text-muted-foreground dark:text-dark-muted-foreground">
          ขออภัย แอปพบปัญหาบางอย่าง ข้อมูลที่บันทึกไว้ไม่สูญหาย ลองใหม่อีกครั้ง
          หากยังเป็นอยู่ให้ปิดแล้วเปิดแอปใหม่
        </Text>
        {__DEV__ ? (
          <ScrollView className="max-h-32 w-full max-w-[420px] rounded-lg border border-border bg-card p-3 dark:border-dark-border dark:bg-dark-card">
            <Text className="text-[11px] text-danger dark:text-dark-danger">{String(error?.message ?? error)}</Text>
          </ScrollView>
        ) : null}
        <Button label="ลองใหม่" onPress={onRetry} className="w-full max-w-[320px]" />
      </View>
    </SafeAreaView>
  );
}

interface State {
  error: Error | null;
}

/**
 * Root error boundary: a render error in any screen shows a friendly Thai
 * fallback instead of a white screen. "Retry" clears the error and remounts
 * the subtree (via `resetKey`) so screens re-initialise from scratch.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State & { resetKey: number }> {
  state: State & { resetKey: number } = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private reset = () => this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }));

  render() {
    if (this.state.error) return <ErrorFallback error={this.state.error} onRetry={this.reset} />;
    return <View key={this.state.resetKey} style={{ flex: 1 }}>{this.props.children}</View>;
  }
}
