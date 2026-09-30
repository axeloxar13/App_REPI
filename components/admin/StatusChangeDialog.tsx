// mobile-app/components/admin/StatusChangeDialog.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { colors, radius, spacing } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import type { InstallationStatus } from '../../types/database';

const STATUS_LABELS: Record<InstallationStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  in_review: 'En revisión',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

const STATUS_COLORS: Record<InstallationStatus, string> = {
  pending: '#f59e0b',
  in_progress: '#3b82f6',
  in_review: '#8b5cf6',
  completed: '#10b981',
  cancelled: '#ef4444',
};

interface Props {
  visible: boolean;
  installationId: string;
  installationItemId: string;
  targetLabel: string;
  currentStatus: InstallationStatus;
  allowedStatuses: InstallationStatus[];
  onClose: () => void;
  onSuccess: () => void;
}

export function StatusChangeDialog({
  visible,
  installationId,
  installationItemId,
  targetLabel,
  currentStatus,
  allowedStatuses,
  onClose,
  onSuccess,
}: Props) {
  const { supabase, selectedMembership } = useAuth();
  const [selectedStatus, setSelectedStatus] = useState<InstallationStatus | ''>(
    allowedStatuses[0] || ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChangeStatus = async () => {
    if (!selectedStatus || !supabase || !selectedMembership) return;

    setLoading(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .rpc('admin_set_installation_item_status', {
          p_organization_id: selectedMembership.organizationId,
          p_installation_id: installationId,
          p_installation_item_id: installationItemId,
          p_new_status: selectedStatus,
        });

      if (updateError) throw updateError;

      onSuccess();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (allowedStatuses.length === 0) {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.title}>Estado final</Text>
            <Text style={styles.message}>
              {targetLabel} está en un estado final. No se pueden hacer más cambios.
            </Text>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Cambiar estado de {targetLabel}</Text>

          <View style={styles.statusComparison}>
            <View>
              <Text style={styles.statusLabel}>Actual</Text>
              <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[currentStatus] }]}>
                <Text style={styles.statusBadgeText}>{STATUS_LABELS[currentStatus]}</Text>
              </View>
            </View>
            <View>
              <Text style={styles.statusLabel}>Nuevo</Text>
              <View style={[styles.statusBadge, { backgroundColor: selectedStatus ? STATUS_COLORS[selectedStatus as InstallationStatus] : '#94a3b8' }]}>
                <Text style={styles.statusBadgeText}>
                  {selectedStatus ? STATUS_LABELS[selectedStatus as InstallationStatus] : 'Selecciona'}
                </Text>
              </View>
            </View>
          </View>

          {allowedStatuses.map((status) => (
            <Pressable
              key={status}
              style={[
                styles.statusOption,
                selectedStatus === status && styles.statusOptionSelected,
              ]}
              onPress={() => setSelectedStatus(status)}
            >
              <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[status] }]} />
              <Text style={styles.statusOptionText}>{STATUS_LABELS[status]}</Text>
            </Pressable>
          ))}

          {selectedStatus === 'completed' && (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                ⚠️ Al marcar esta unidad como terminada, los técnicos ya no podrán subir nuevas fotografías.
              </Text>
            </View>
          )}

          {selectedStatus === 'cancelled' && (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                ⚠️ Esta unidad quedará cancelada y no admitirá nuevas fotografías.
              </Text>
            </View>
          )}

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose} disabled={loading}>
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmButton, (!selectedStatus || loading) && styles.confirmButtonDisabled]}
              onPress={handleChangeStatus}
              disabled={!selectedStatus || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.confirmButtonText}>Confirmar</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: spacing.lg,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 400,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  statusComparison: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
  },
  statusLabel: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  statusBadgeText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: spacing.sm,
  },
  statusOptionText: {
    fontSize: 14,
    color: colors.text,
  },
  notice: {
    backgroundColor: '#fef3c7',
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginVertical: spacing.sm,
  },
  noticeText: {
    color: '#92400e',
    fontSize: 13,
  },
  errorContainer: {
    backgroundColor: '#fee2e2',
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginVertical: spacing.sm,
  },
  errorText: {
    color: '#991b1b',
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  cancelButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  cancelButtonText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '500',
  },
  confirmButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    minWidth: 100,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  closeButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  closeButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  message: {
    color: colors.muted,
    fontSize: 14,
    marginBottom: spacing.md,
  },
});