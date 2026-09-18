import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { SelectModal, type SelectOption } from './SelectModal';

interface SelectFieldProps {
  label: string;
  value?: string;
  placeholder?: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}

export function SelectField({ label, value, placeholder = 'เลือก', options, onChange }: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View className="gap-1.5">
      <Text className="text-[13px] font-medium text-muted-foreground dark:text-dark-muted-foreground">{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        className="h-12 flex-row items-center justify-between rounded-lg border border-border bg-input dark:border-dark-border dark:bg-dark-input px-3.5"
      >
        <Text className={`text-[15px] ${selected ? 'text-foreground dark:text-dark-foreground' : 'text-muted-foreground dark:text-dark-muted-foreground'}`}>
          {selected?.label ?? placeholder}
        </Text>
        <ChevronDown size={18} color="#9CA3AF" />
      </Pressable>
      <SelectModal
        visible={open}
        title={label}
        options={options}
        value={value}
        onSelect={(v) => {
          onChange(v);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}
