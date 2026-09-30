// mobile-app/components/admin/ApproveLocationButton.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
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

export function ApproveLocationButton({
  installationId,
  installationItemId,
  locationPinId,
  onSuccess,
}: Props) {
  const { supabase, selectedMembership } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleApprove = async () => {
    Alert.alert(
      'Aprobar ubicación',
      '¿Confirmas que la ubicación registrada corresponde al lugar correcto de esta instalación?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aprobar',
          onPress: async () => {
            setLoading(true);
            try {
              const { error } = await supabase
                .rpc('admin_approve_installation_item_location', {
                  p_organization_id: selectedMembership?.organizationId,
                  p_location_pin_id: locationPinId,
                });

              if (error) throw error;
              onSuccess();
            } catch (err) {
              Alert.alert('Error', (err as Error).message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Pressable
      style={[styles.button, loading && styles.buttonDisabled]}
      onPress={handleApprove}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color="white" />
      ) : (
        <>
          <Text style={styles.buttonText}>✅ Aprobar ubicación</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#10b981',
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
});