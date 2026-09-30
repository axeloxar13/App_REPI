import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../constants/theme';

type LoadingStateProps = {
  text: string;
};

export function LoadingState({ text }: LoadingStateProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  text: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
  },
});
