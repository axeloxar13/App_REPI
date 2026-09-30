import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';
import { formatDateTime } from '../lib/date';
import { useInstallationItemLocation } from '../hooks/useInstallationItemLocation';
import type { InstallationItem } from '../types/database';

type InstallationLocationSectionProps = {
  installationId: string;
  item: InstallationItem;
  onRegistered: () => Promise<void> | void;
};

const LOCATION_REREGISTRATION_NOTICE =
  'Un administrador eliminó la ubicación registrada. Regístrala nuevamente para continuar con la revisión.';
const LOCATION_PENDING_REVIEW_NOTICE =
  'Ubicación registrada nuevamente. Está pendiente de aprobación por un administrador.';

function formatAccuracy(value: number) {
  return `${Math.round(value * 10) / 10} m`;
}

export function InstallationLocationSection({
  installationId,
  item,
  onRegistered,
}: InstallationLocationSectionProps) {
  const {
    registerLocation,
    setResultMessage,
    isRegistering,
    message,
    isError,
  } = useInstallationItemLocation();
  const activeLocation = item.activeLocation;
  const needsReregistration = !activeLocation && item.status === 'in_review';
  const isAvailable =
    !activeLocation &&
    (item.status === 'in_progress' || needsReregistration);
  const activeLocationIsApproved = activeLocation?.reviewStatus === 'approved';
  const activeLocationIsPending = activeLocation?.reviewStatus === 'pending_review';

  async function handleRegisterLocation() {
    if (!isAvailable || isRegistering) {
      return;
    }

    const result = await registerLocation({
      installationId,
      installationItemId: item.id,
      isReregistration: needsReregistration,
    });

    setResultMessage(result);

    if (result.ok) {
      await onRegistered();
    }
  }

  if (activeLocation) {
    return (
      <View style={[styles.card, activeLocationIsPending ? styles.warningCard : null]}>
        <Text style={activeLocationIsApproved ? styles.successTitle : styles.warningTitle}>
          {activeLocationIsApproved
            ? 'Ubicación aprobada'
            : 'Pendiente de aprobación'}
        </Text>
        {activeLocationIsPending ? (
          <Text style={styles.value}>{LOCATION_PENDING_REVIEW_NOTICE}</Text>
        ) : null}
        <Text style={styles.value}>
          Precisión aproximada: {formatAccuracy(activeLocation.accuracyMeters)}
        </Text>
        <Text style={styles.muted}>{formatDateTime(activeLocation.recordedAt)}</Text>
        <Text style={styles.muted}>
          Estado: {activeLocationIsApproved ? 'Aprobada' : 'Pendiente de aprobación'}
        </Text>
        <Text style={styles.muted}>No puedes reemplazarla mientras siga activa.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, needsReregistration ? styles.warningCard : null]}>
      <Pressable
        style={[
          styles.button,
          !isAvailable || isRegistering ? styles.buttonDisabled : null,
        ]}
        onPress={handleRegisterLocation}
        disabled={!isAvailable || isRegistering}
        accessibilityRole="button"
        accessibilityState={{ disabled: !isAvailable || isRegistering }}
      >
        {isRegistering ? (
          <ActivityIndicator color={colors.surface} size="small" />
        ) : null}
        <Text style={styles.buttonText}>
          {isRegistering
            ? 'Obteniendo ubicación precisa...'
            : needsReregistration
              ? 'Registrar ubicación nuevamente'
              : 'Registrar ubicación actual'}
        </Text>
      </Pressable>

      {needsReregistration ? (
        <View style={styles.warningNotice}>
          <Text style={styles.warningText}>{LOCATION_REREGISTRATION_NOTICE}</Text>
        </View>
      ) : null}

      {!isAvailable ? (
        <Text style={styles.muted}>
          Disponible después de iniciar esta instalación.
        </Text>
      ) : null}

      {message ? (
        <Text style={[styles.message, isError ? styles.errorText : styles.successText]}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#dce9f6',
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  warningCard: {
    borderColor: '#fbbf24',
    backgroundColor: '#fffbeb',
  },
  button: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.58,
  },
  buttonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
    textAlign: 'center',
  },
  successTitle: {
    color: '#148048',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  warningTitle: {
    color: '#92400e',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  value: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  muted: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  message: {
    fontSize: 13,
    lineHeight: 19,
  },
  errorText: {
    color: colors.error,
  },
  successText: {
    color: '#148048',
  },
  warningNotice: {
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: radius.sm,
    backgroundColor: '#fff7ed',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  warningText: {
    color: '#92400e',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
});
