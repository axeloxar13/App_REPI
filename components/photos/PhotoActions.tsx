import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../constants/theme';

type PhotoActionsProps = {
  onTakePhoto: () => void;
  onPickPhotos: () => void;
  disabled: boolean;
};

export function PhotoActions({
  onTakePhoto,
  onPickPhotos,
  disabled,
}: PhotoActionsProps) {
  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [
          styles.button,
          disabled ? styles.buttonDisabled : null,
          pressed && !disabled ? styles.buttonPressed : null,
        ]}
        onPress={onTakePhoto}
        disabled={disabled}
        accessibilityRole="button"
      >
        <MaterialCommunityIcons
          name="camera-outline"
          size={18}
          color={disabled ? colors.placeholder : colors.primary}
        />
        <Text style={[styles.buttonText, disabled ? styles.buttonTextDisabled : null]}>
          Tomar foto
        </Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.button,
          disabled ? styles.buttonDisabled : null,
          pressed && !disabled ? styles.buttonPressed : null,
        ]}
        onPress={onPickPhotos}
        disabled={disabled}
        accessibilityRole="button"
      >
        <MaterialCommunityIcons
          name="image-multiple-outline"
          size={18}
          color={disabled ? colors.placeholder : colors.primary}
        />
        <Text style={[styles.buttonText, disabled ? styles.buttonTextDisabled : null]}>
          Elegir de galería
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  button: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
  },
  buttonPressed: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  buttonTextDisabled: {
    color: colors.placeholder,
  },
});
