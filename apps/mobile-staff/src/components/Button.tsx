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
      className={`${isPrimary ? 'h-[56px]' : 'h-[52px]'} items-center justify-center rounded-xl ${
        isPrimary ? 'bg-primary active:bg-primary-600' : 'bg-muted dark:bg-dark-muted'
      } ${disabled || loading ? 'opacity-50' : ''} ${className ?? ''}`}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#FFFFFF' : '#7A6A5C'} />
      ) : (
        <Text className={`${isPrimary ? 'text-[16px] font-bold text-white' : 'text-[15px] font-semibold text-foreground dark:text-dark-foreground'}`}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
