import { Pressable, Text, ActivityIndicator, type PressableProps } from 'react-native';

interface ButtonProps extends PressableProps {
  label: string;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
}

/** primary = solid orange; secondary = outlined (white bg, orange border + text). */
export function Button({ label, variant = 'primary', loading, disabled, className, ...rest }: ButtonProps) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      disabled={disabled || loading}
      className={`${isPrimary ? 'h-[50px]' : 'h-[46px]'} items-center justify-center rounded-[8px] ${
        isPrimary
          ? 'bg-primary active:bg-primary-600'
          : 'border border-primary bg-card active:bg-primary-50 dark:bg-dark-card dark:active:bg-dark-muted'
      } ${disabled || loading ? 'opacity-50' : ''} ${className ?? ''}`}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#FFFFFF' : '#D25E3B'} />
      ) : (
        <Text className={isPrimary ? 'text-[15px] font-bold text-white' : 'text-[14px] font-semibold text-primary dark:text-primary-400'}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
