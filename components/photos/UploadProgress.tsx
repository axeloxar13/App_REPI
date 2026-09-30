import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../constants/theme';

type UploadProgressProps = {
  label: string;
};

export function UploadProgress({ label }: UploadProgressProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.primary} size="small" />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 42,
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
  },
  text: {
    flex: 1,
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
});
