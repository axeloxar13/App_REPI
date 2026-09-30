import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';
import { formatDate } from '../lib/date';
import type { InstallationStatus, InstallationWithClient } from '../types/database';
import { ChevronIcon } from './ChevronIcon';
import { InstallationStatusBadge } from './InstallationStatusBadge';

const STATUS_SUMMARY_LABELS: Record<InstallationStatus, string> = {
  pending: 'Pendientes',
  in_progress: 'En proceso',
  in_review: 'En revision',
  completed: 'Terminadas',
  cancelled: 'Canceladas',
};

type InstallationCardProps = {
  installation: InstallationWithClient;
  onPress: () => void;
};

export function InstallationCard({ installation, onPress }: InstallationCardProps) {
  const totalItems = installation.items.length;
  const completedItems = installation.items.filter((item) => item.status === 'completed').length;
  const primaryItem =
    installation.items.find((item) => item.itemRole === 'primary') ?? installation.items[0] ?? null;
  const statusCounts = installation.items.reduce<Record<InstallationStatus, number>>(
    (counts, item) => ({
      ...counts,
      [item.status]: counts[item.status] + 1,
    }),
    {
      pending: 0,
      in_progress: 0,
      in_review: 0,
      completed: 0,
      cancelled: 0,
    },
  );
  const summaryStatuses = (Object.keys(statusCounts) as InstallationStatus[])
    .filter((status) => statusCounts[status] > 0)
    .map((status) => `${statusCounts[status]} ${STATUS_SUMMARY_LABELS[status].toLowerCase()}`)
    .join(' - ');

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text style={styles.title}>{installation.projectName}</Text>
          <Text style={styles.client}>{installation.client.name}</Text>
        </View>
        <View style={styles.chevronWrap}>
          <ChevronIcon size={16} color={colors.primary} />
        </View>
      </View>

      <View style={styles.meta}>
        <Text style={styles.metaText}>{installation.installationType}</Text>
        <Text style={styles.metaText}>{installation.address}</Text>
        {totalItems > 1 ? (
          <Text style={styles.metaText}>
            Unidades: {completedItems} de {totalItems} terminadas
          </Text>
        ) : null}
        {summaryStatuses ? (
          <Text style={styles.metaText}>{summaryStatuses}</Text>
        ) : null}
        <Text style={styles.metaText}>
          Asignada: {formatDate(installation.assignedDate)}
        </Text>
      </View>

      {totalItems === 1 && primaryItem ? (
        <InstallationStatusBadge status={primaryItem.status} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#e4edf7',
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    shadowColor: '#12355f',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  cardPressed: {
    borderColor: colors.primary,
    opacity: 0.96,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  titleGroup: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  client: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  chevronWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 28,
    minHeight: 28,
    marginTop: 1,
  },
  meta: {
    gap: 3,
  },
  metaText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
});
