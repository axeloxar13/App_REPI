import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../constants/theme';

export function PhotoEmptyState() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Aún no hay fotografías</Text>
      <Text style={styles.description}>
        Agrega evidencia de esta etapa de la instalación.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  description: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
});
