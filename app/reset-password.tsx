import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LogoHeader } from '../components/LogoHeader';
import { colors, radius, spacing } from '../constants/theme';

export default function ResetPasswordScreen() {
  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.card}>
        <LogoHeader title="Restablecer contraseña" />
        <Text style={styles.text}>
          El enlace de recuperación llega correctamente a la app. El cambio de
          contraseña se completará en la siguiente etapa de autenticación.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  text: {
    marginTop: spacing.xl,
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
});
