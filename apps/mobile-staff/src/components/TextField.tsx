import { View, Text, TextInput, type TextInputProps } from 'react-native';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export function TextField({ label, error, className, ...rest }: TextFieldProps) {
  return (
    <View className="gap-1.5">
      <Text className="text-[13px] font-medium text-muted-foreground dark:text-dark-muted-foreground">{label}</Text>
      <TextInput
        className={`h-[52px] rounded-[10px] border-2 border-border bg-input dark:border-dark-border dark:bg-dark-input px-3.5 text-[15px] text-foreground dark:text-dark-foreground focus:border-foreground dark:focus:border-dark-foreground ${className ?? ''}`}
        placeholderTextColor="#A89684"
        {...rest}
      />
      {error ? <Text className="text-[12px] text-danger">{error}</Text> : null}
    </View>
  );
}
