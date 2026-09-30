// mobile-app/components/admin/InvalidateLocationButton.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { colors, radius, spacing } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';

interface Props {
  installationId: string;
  installationItemId: string;
  locationPinId: string;
  onSuccess: () => void;
}

export function InvalidateLocationButton({
  installationId,
  installationItemId,
  locationPinId,
  onSuccess,
}: Props) {
  const { supabase, selectedMembership } = useAuth();
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [reason, setReason] = useState('');

  const handleInvalidate = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .rpc('admin_invalidate_installation_item_location', {
          p_organization_id: selectedMembership?.organizationId,
          p_location_pin_id: locationPinId,
          p_reason: reason || null,
        });

      if (error) throw error;
      setModalVisible(false);
      setReason('');
      onSuccess();
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={() => setModalVisible(true)}
        disabled={loading}
      >
        <Text style={styles.buttonText}>🗑️ Rechazar ubicación</Text>
      </Pressable>

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.title}>Rechazar ubicación</Text>
            <Text style={styles.message}>
              Esta acción solicitará al técnico registrar nuevamente la ubicación.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Motivo (opcional)"
              placeholderTextColor={colors.muted}
              value={reason}
              onChangeText={setReason}
              maxLength={500}
              multiline
            />

            <View style={styles.actions}>
              <Pressable style={styles.cancelButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmButton, loading && styles.buttonDisabled]}
                onPress={handleInvalidate}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.confirmButtonText}>Rechazar</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#ef4444',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
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
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  message: {
    color: colors.muted,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
    fontSize: 14,
    color: colors.text,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
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
    backgroundColor: '#ef4444',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    minWidth: 80,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});