import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';
import { formatDateTime } from '../lib/date';
import type { InstallationHandoff } from '../types/database';

const HANDOFF_STATUS_LABELS: Record<InstallationHandoff['status'], string> = {
  submitted: 'En revisión',
  approved: 'Aprobada',
  rejected: 'Devuelta para corrección',
};

export function InstallationHandoffCard({
  handoff,
}: {
  handoff: InstallationHandoff;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Entrega y conformidad</Text>
        <Text style={styles.badge}>{HANDOFF_STATUS_LABELS[handoff.status]}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Recibe</Text>
        <Text style={styles.value}>{handoff.recipientName}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Enviada</Text>
        <Text style={styles.value}>{formatDateTime(handoff.submittedAt)}</Text>
      </View>

      {handoff.finalNotes ? (
        <View style={styles.row}>
          <Text style={styles.label}>Observaciones finales</Text>
          <Text style={styles.value}>{handoff.finalNotes}</Text>
        </View>
      ) : null}

      {handoff.rejectionReason ? (
        <View style={styles.rejectionBox}>
          <Text style={styles.rejectionTitle}>Motivo de devolución</Text>
          <Text style={styles.rejectionText}>{handoff.rejectionReason}</Text>
        </View>
      ) : null}

      <View style={styles.signatureBlock}>
        <Text style={styles.label}>Firma de conformidad</Text>
        {handoff.signatureUrl ? (
          <Image
            source={{ uri: handoff.signatureUrl }}
            style={styles.signature}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={handoff.signatureStoragePath}
            transition={120}
          />
        ) : (
          <View style={styles.signaturePlaceholder}>
            <Text style={styles.placeholderText}>Firma no disponible</Text>
          </View>
        )}
      </View>
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
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
  },
  badge: {
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  row: {
    gap: 2,
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  value: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  signatureBlock: {
    gap: spacing.xs,
  },
  signature: {
    width: '100%',
    height: 150,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  signaturePlaceholder: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  placeholderText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  rejectionBox: {
    gap: 3,
    borderWidth: 1,
    borderColor: colors.errorSoft,
    borderRadius: radius.sm,
    backgroundColor: colors.errorSoft,
    padding: spacing.sm,
  },
  rejectionTitle: {
    color: colors.error,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  rejectionText: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 18,
  },
});
