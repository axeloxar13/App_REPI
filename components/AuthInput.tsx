import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';

type AuthInputProps = TextInputProps & {
  label: string;
  allowVisibilityToggle?: boolean;
};

export function AuthInput({
  allowVisibilityToggle = false,
  label,
  secureTextEntry,
  style,
  ...props
}: AuthInputProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const canToggleVisibility = allowVisibilityToggle && Boolean(secureTextEntry);
  const isTextHidden = canToggleVisibility ? !isPasswordVisible : secureTextEntry;

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputShell}>
        <TextInput
          style={[styles.input, canToggleVisibility && styles.inputWithToggle, style]}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.primary}
          secureTextEntry={isTextHidden}
          {...props}
        />

        {canToggleVisibility ? (
          <Pressable
            style={styles.visibilityButton}
            onPress={() => setIsPasswordVisible((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel={
              isPasswordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'
            }
            accessibilityState={{ selected: isPasswordVisible }}
            hitSlop={8}
          >
            <Ionicons
              name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color={colors.muted}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.xs,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  inputShell: {
    position: 'relative',
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
  },
  inputWithToggle: {
    paddingRight: 54,
  },
  visibilityButton: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    width: 46,
  },
});
