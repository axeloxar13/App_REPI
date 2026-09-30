import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { colors, radius, spacing } from '../constants/theme';
import { formatDateTime } from '../lib/date';
import type { InstallationWithClient } from '../types/database';

type InstallationActionCardProps = {
  installation: InstallationWithClient;
  isStarting: boolean;
  isCompleting: boolean;
  message: string;
  isError: boolean;
  onStart: () => void;
  onComplete: () => void;
};

function getReadOnlyText(installation: InstallationWithClient) {
  if (installation.status === 'completed') {
    return {
      title: 'Esta instalación está terminada',
      description: installation.completedAt
        ? `Finalizada: ${formatDateTime(installation.completedAt)}`
        : 'La evidencia fotográfica existente permanece disponible.',
    };
  }

  if (installation.status === 'cancelled') {
    return {
      title: 'Esta instalación fue cancelada',
      description: 'No se pueden realizar cambios desde la app móvil.',
    };
  }

  if (installation.status === 'in_review') {
    return {
      title: 'Esta instalación está en revisión',
      description: 'Los cambios quedan reservados para administración.',
    };
  }

  return null;
}

export function InstallationActionCard({
  installation,
  isStarting,
  isCompleting,
  message,
  isError,
  onStart,
  onComplete,
}: InstallationActionCardProps) {
  const readOnlyText = getReadOnlyText(installation);

  if (installation.status === 'pending') {
    return (
      <View style={styles.card}>
        <View style={styles.textBlock}>
          <Text style={styles.title}>Iniciar instalación</Text>
          <Text style={styles.description}>
            Al iniciar, el estado cambiará a En proceso y se registrará la fecha
            de inicio.
          </Text>
        </View>
        <PrimaryButton
          title="Iniciar instalación"
          onPress={onStart}
          loading={isStarting}
          disabled={isStarting || isCompleting}
        />
        {message ? (
          <Text style={[styles.message, isError ? styles.error : styles.success]}>
            {message}
          </Text>
        ) : null}
      </View>
    );
  }

  if (installation.status === 'in_progress') {
    return (
      <View style={styles.card}>
        <View style={styles.textBlock}>
          <Text style={styles.title}>Finalizar trabajo</Text>
          <Text style={styles.description}>
            Captura el nombre y la firma de quien recibe para enviar la
            instalación a revisión administrativa.
          </Text>
        </View>
        <PrimaryButton
          title="Finalizar trabajo"
          onPress={onComplete}
          loading={isCompleting}
          disabled={isStarting || isCompleting}
        />
        {message ? (
          <Text style={[styles.message, isError ? styles.error : styles.success]}>
            {message}
          </Text>
        ) : null}
      </View>
    );
  }

  if (!readOnlyText) {
    return null;
  }

  return (
    <View style={styles.card}>
      <View style={styles.textBlock}>
        <Text style={styles.title}>{readOnlyText.title}</Text>
        <Text style={styles.description}>{readOnlyText.description}</Text>
      </View>
      {message ? (
        <Text style={[styles.message, isError ? styles.error : styles.success]}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: '#e4edf7',
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.md,
    shadowColor: '#12355f',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 7,
    elevation: 1,
  },
  textBlock: {
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
  },
  description: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  message: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  success: {
    color: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  error: {
    color: colors.error,
    backgroundColor: colors.errorSoft,
  },
});
