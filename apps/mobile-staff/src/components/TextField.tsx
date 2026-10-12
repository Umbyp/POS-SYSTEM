import { useState } from 'react';
import { View, Text, TextInput, Pressable, type TextInputProps } from 'react-native';
import { useThemeColors } from '@/lib/theme';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export function TextField({ label, error, className, secureTextEntry, ...rest }: TextFieldProps) {
  const t = useThemeColors();
  const [revealed, setRevealed] = useState(false);
  const isSecret = !!secureTextEntry;

  return (
    <View className="gap-1.5">
      <Text className="text-[13px] font-medium text-muted-foreground dark:text-dark-muted-foreground">{label}</Text>
      <View className="justify-center">
        <TextInput
          className={`h-[48px] rounded-[8px] border border-border bg-input dark:border-dark-border dark:bg-dark-input px-3.5 text-[15px] text-foreground dark:text-dark-foreground focus:border-primary ${isSecret ? 'pr-16' : ''} ${className ?? ''}`}
          placeholderTextColor={t.placeholder}
          keyboardAppearance={t.isDark ? 'dark' : 'light'}
          selectionColor={t.primary}
          secureTextEntry={isSecret && !revealed}
          {...rest}
        />
        {isSecret ? (
          <Pressable onPress={() => setRevealed((v) => !v)} hitSlop={8} className="absolute right-3.5">
            <Text className="text-[12px] font-semibold text-muted-foreground dark:text-dark-muted-foreground">
              {revealed ? 'ซ่อน' : 'แสดง'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text className="text-[12px] text-danger dark:text-dark-danger">{error}</Text> : null}
    </View>
  );
}
