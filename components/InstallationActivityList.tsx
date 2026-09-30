import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';
import { formatDateTime } from '../lib/date';
import type { InstallationActivity } from '../types/database';

type InstallationActivityListProps = {
  activities: InstallationActivity[];
  isLoading: boolean;
  error: string;
};

function getActivityLabel(activity: InstallationActivity) {
  if (activity.activityType === 'installation_started') {
    return 'Instalación iniciada';
  }

  if (activity.activityType === 'installation_completed') {
    return 'Instalación terminada';
  }

  if (activity.activityType === 'location_registered') {
    return 'Ubicación registrada';
  }

  if (activity.activityType === 'location_reregistered') {
    return 'Ubicación registrada nuevamente';
  }

  if (activity.activityType === 'location_approved') {
    return 'Ubicación aprobada';
  }

  if (activity.activityType === 'location_invalidated') {
    return 'Ubicación eliminada por administrador';
  }

  if (activity.activityType === 'handoff_submitted') {
    return 'Entrega enviada para revisión';
  }

  if (activity.activityType === 'handoff_approved') {
    return 'Entrega aprobada';
  }

  if (activity.activityType === 'handoff_rejected') {
    return 'Entrega devuelta para corrección';
  }

  if (activity.activityType === 'deliverable_generated') {
    return 'Entregable generado';
  }

  return 'Cambio de estado';
}

export function InstallationActivityList({
  activities,
  isLoading,
  error,
}: InstallationActivityListProps) {
  if (isLoading) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Actividad</Text>
        <Text style={styles.muted}>Cargando actividad</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Actividad</Text>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (activities.length === 0) {
    return null;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Actividad</Text>
      <View style={styles.list}>
        {activities.map((activity) => (
          <View key={activity.id} style={styles.item}>
            <Text style={styles.itemTitle}>{getActivityLabel(activity)}</Text>
            <Text style={styles.itemDate}>{formatDateTime(activity.createdAt)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
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
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
  },
  list: {
    gap: spacing.sm,
  },
  item: {
    gap: 2,
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
    paddingLeft: spacing.sm,
  },
  itemTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  itemDate: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  muted: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 18,
  },
});
