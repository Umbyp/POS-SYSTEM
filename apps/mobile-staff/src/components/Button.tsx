import { Pressable, Text, ActivityIndicator, type PressableProps } from 'react-native';

interface ButtonProps extends PressableProps {
  label: string;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
}

export function Button({ label, variant = 'primary', loading, disabled, className, ...rest }: ButtonProps) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      disabled={disabled || loading}
      className={`h-12 items-center justify-center rounded-lg ${
        isPrimary ? 'bg-primary' : 'bg-muted dark:bg-dark-muted'
      } ${disabled || loading ? 'opacity-50' : ''} ${className ?? ''}`}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#FFFFFF' : '#6B7280'} />
      ) : (
        <Text className={`text-[15px] font-semibold ${isPrimary ? 'text-white' : 'text-foreground dark:text-dark-foreground'}`}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
