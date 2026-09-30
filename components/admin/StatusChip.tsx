// mobile-app/components/admin/StatusChip.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { InstallationStatus } from '../../types/database';

const statusColors: Record<InstallationStatus, { bg: string; text: string }> = {
  pending: { bg: '#fef3c7', text: '#92400e' },
  in_progress: { bg: '#dbeafe', text: '#1e40af' },
  in_review: { bg: '#ede9fe', text: '#5b21b6' },
  completed: { bg: '#d1fae5', text: '#065f46' },
  cancelled: { bg: '#fee2e2', text: '#991b1b' },
};

const statusLabels: Record<InstallationStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  in_review: 'En revisión',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

export function StatusChip({ status }: { status: InstallationStatus }) {
  const colors = statusColors[status] || statusColors.pending;
  
  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.text }]}>
        {statusLabels[status] || status}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
  },
});