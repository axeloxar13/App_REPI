// app/technicians/[id].tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors, radius, spacing } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { StatusChip } from '../../components/admin/StatusChip';
import type { InstallationStatus } from '../../types/database';

// ============================================
// TIPOS
// ============================================

type TechnicianDetail = {
  id: string;
  user_id?: string;
  full_name: string;
  email: string;
  active: boolean;
  created_at: string;
  total_installations: number;
  active_installations: number;
  pending_installations: number;
  in_progress_installations: number;
  in_review_installations: number;
  completed_installations: number;
  cancelled_installations: number;
  invitation_pending: boolean;
};

type RecentInstallation = {
  id: string;
  project_name: string;
  status: InstallationStatus;
  client: { name: string } | null;
  updated_at: string;
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export default function TechnicianDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selectedMembership } = useAuth();
  
  const [technician, setTechnician] = useState<TechnicianDetail | null>(null);
  const [recentInstallations, setRecentInstallations] = useState<RecentInstallation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Modal de edición
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editing, setEditing] = useState(false);

  const organizationId = selectedMembership?.organizationId;

  // Cargar datos del técnico
  const loadTechnician = useCallback(async () => {
    if (!organizationId || !supabase || !id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1. Obtener detalle del técnico usando RPC
      const { data: techData, error: techError } = await supabase
        .rpc('admin_get_technician_detail', {
          p_organization_id: organizationId,
          p_technician_id: id,
        });

      if (techError) throw techError;

      if (!techData || techData.length === 0) {
        setError('Técnico no encontrado');
        setLoading(false);
        return;
      }

      setTechnician(techData[0]);
      setEditName(techData[0].full_name);

      // 2. Obtener instalaciones recientes (consulta directa - corregida)
      const { data: installsData, error: installsError } = await supabase
        .from('installations')
        .select(`
          id,
          project_name,
          status,
          updated_at,
          client:client_id (name)
        `)
        .eq('organization_id', organizationId)
        .eq('technician_id', id)
        .order('updated_at', { ascending: false })
        .limit(10);

      if (installsError) throw installsError;

      setRecentInstallations(installsData || []);
    } catch (err) {
      console.error('Error loading technician:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase, organizationId, id]);

  useEffect(() => {
    loadTechnician();
  }, [loadTechnician]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadTechnician();
  }, [loadTechnician]);

  // Actualizar nombre del técnico
  const handleUpdateName = async () => {
    if (!editName.trim()) {
      Alert.alert('Error', 'El nombre es obligatorio');
      return;
    }

    try {
      setEditing(true);

      const { error: updateError } = await supabase
        .rpc('admin_update_technician_name', {
          p_organization_id: organizationId,
          p_technician_id: id,
          p_full_name: editName.trim(),
        });

      if (updateError) throw updateError;

      Alert.alert('Éxito', 'Nombre actualizado correctamente');
      setEditModalVisible(false);
      loadTechnician();
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setEditing(false);
    }
  };

  // Activar/Desactivar técnico
  const toggleStatus = async () => {
    if (!technician) return;

    Alert.alert(
      technician.active ? 'Desactivar técnico' : 'Activar técnico',
      technician.active
        ? `¿Estás seguro de desactivar a ${technician.full_name}?`
        : `¿Estás seguro de activar a ${technician.full_name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: technician.active ? 'Desactivar' : 'Activar',
          onPress: async () => {
            try {
              const { error: updateError } = await supabase
                .rpc('admin_set_technician_active', {
                  p_organization_id: organizationId,
                  p_technician_id: id,
                  p_active: !technician.active,
                });

              if (updateError) throw updateError;
              loadTechnician();
            } catch (err) {
              Alert.alert('Error', (err as Error).message);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerScreen}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Cargando técnico...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !technician) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerScreen}>
          <Text style={styles.errorText}>Error al cargar el técnico</Text>
          <Text style={styles.errorDetail}>{error || 'No encontrado'}</Text>
          <Pressable style={styles.retryButton} onPress={loadTechnician}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <Stack.Screen
        options={{
          title: technician.full_name,
          headerShown: true,
          headerBackTitle: 'Volver',
        }}
      />

      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Información del técnico */}
        <View style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>
                {technician.full_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{technician.full_name}</Text>
              <Text style={styles.profileEmail}>{technician.email}</Text>
            </View>
            <View style={[
              styles.statusBadge,
              technician.active ? styles.statusBadgeActive : styles.statusBadgeInactive,
            ]}>
              <Text style={styles.statusBadgeText}>
                {technician.active ? 'Activo' : 'Inactivo'}
              </Text>
            </View>
          </View>

          <View style={styles.profileActions}>
            <Pressable
              style={[styles.actionButton, styles.actionButtonPrimary]}
              onPress={() => setEditModalVisible(true)}
            >
              <Text style={styles.actionButtonText}>✏️ Editar nombre</Text>
            </Pressable>
            <Pressable
              style={[
                styles.actionButton,
                technician.active ? styles.actionButtonDanger : styles.actionButtonSuccess,
              ]}
              onPress={toggleStatus}
            >
              <Text style={styles.actionButtonText}>
                {technician.active ? '🚫 Desactivar' : '✅ Activar'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.profileMeta}>
            <Text style={styles.metaText}>
              Miembro desde: {new Date(technician.created_at).toLocaleDateString()}
            </Text>
            {technician.invitation_pending && (
              <View style={styles.invitationBadge}>
                <Text style={styles.invitationBadgeText}>⏳ Invitación pendiente</Text>
              </View>
            )}
          </View>
        </View>

        {/* Estadísticas */}
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Estadísticas de instalaciones</Text>
          <View style={styles.statsGrid}>
            <StatItem
              label="Total"
              value={technician.total_installations}
              color={colors.text}
            />
            <StatItem
              label="Activas"
              value={technician.active_installations}
              color={colors.primary}
            />
            <StatItem
              label="Pendientes"
              value={technician.pending_installations}
              color="#f59e0b"
            />
            <StatItem
              label="En progreso"
              value={technician.in_progress_installations}
              color="#3b82f6"
            />
            <StatItem
              label="En revisión"
              value={technician.in_review_installations}
              color="#8b5cf6"
            />
            <StatItem
              label="Completadas"
              value={technician.completed_installations}
              color="#10b981"
            />
            <StatItem
              label="Canceladas"
              value={technician.cancelled_installations}
              color="#ef4444"
            />
          </View>
        </View>

        {/* Instalaciones recientes */}
        <View style={styles.installationsCard}>
          <View style={styles.installationsHeader}>
            <Text style={styles.installationsTitle}>Instalaciones recientes</Text>
            <Pressable onPress={() => router.push(`/installations?technicianId=${technician.id}`)}>
              <Text style={styles.seeAll}>Ver todas</Text>
            </Pressable>
          </View>

          {recentInstallations.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No hay instalaciones asignadas</Text>
            </View>
          ) : (
            recentInstallations.map((installation) => (
              <Pressable
                key={installation.id}
                style={styles.installationItem}
                onPress={() => router.push(`/installations/${installation.id}`)}
              >
                <View style={styles.installationItemHeader}>
                  <Text style={styles.installationItemName} numberOfLines={1}>
                    {installation.project_name || 'Instalación'}
                  </Text>
                  <StatusChip status={installation.status} />
                </View>
                {installation.client && (
                  <Text style={styles.installationItemClient}>
                    Cliente: {installation.client.name}
                  </Text>
                )}
                <Text style={styles.installationItemDate}>
                  Actualizado: {new Date(installation.updated_at).toLocaleString()}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      {/* Modal de edición */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar nombre</Text>
              <Pressable onPress={() => setEditModalVisible(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.field}>
                <Text style={styles.label}>Nombre completo</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Nombre del técnico"
                  placeholderTextColor={colors.muted}
                  value={editName}
                  onChangeText={setEditName}
                />
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalCancelButton]}
                  onPress={() => setEditModalVisible(false)}
                >
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalSubmitButton, editing && styles.modalSubmitButtonDisabled]}
                  onPress={handleUpdateName}
                  disabled={editing}
                >
                  {editing ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text style={styles.modalSubmitButtonText}>Guardar</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ============================================
// COMPONENTES
// ============================================

function StatItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ============================================
// ESTILOS
// ============================================

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.muted,
    fontSize: 16,
  },
  container: {
    flex: 1,
    padding: spacing.lg,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ef4444',
    marginBottom: spacing.xs,
  },
  errorDetail: {
    color: colors.muted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  retryText: {
    color: 'white',
    fontWeight: '600',
  },

  // Profile Card
  profileCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  profileAvatarText: {
    color: 'white',
    fontSize: 24,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  profileEmail: {
    fontSize: 14,
    color: colors.muted,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  statusBadgeActive: {
    backgroundColor: '#d1fae5',
  },
  statusBadgeInactive: {
    backgroundColor: '#fee2e2',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  profileActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  actionButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  actionButtonPrimary: {
    backgroundColor: colors.primary,
  },
  actionButtonDanger: {
    backgroundColor: '#ef4444',
  },
  actionButtonSuccess: {
    backgroundColor: '#10b981',
  },
  actionButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  profileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  metaText: {
    fontSize: 13,
    color: colors.muted,
  },
  invitationBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  invitationBadgeText: {
    fontSize: 12,
    color: '#92400e',
    fontWeight: '600',
  },

  // Stats
  statsCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statItem: {
    flex: 1,
    minWidth: '28%',
    alignItems: 'center',
    padding: spacing.xs,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
    textAlign: 'center',
  },

  // Recent Installations
  installationsCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  installationsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  installationsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  seeAll: {
    color: colors.primary,
    fontWeight: '500',
    fontSize: 14,
  },
  installationItem: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  installationItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  installationItemName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  installationItemClient: {
    fontSize: 13,
    color: colors.muted,
  },
  installationItemDate: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  emptyState: {
    padding: spacing.md,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: spacing.lg,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: radius.lg,
    width: '100%',
    maxWidth: 400,
    padding: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  modalClose: {
    fontSize: 22,
    color: colors.muted,
    padding: spacing.xs,
  },
  modalBody: {
    gap: spacing.md,
  },
  field: {
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text,
    backgroundColor: 'white',
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  modalCancelButton: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCancelText: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: '500',
  },
  modalSubmitButton: {
    flex: 1,
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  modalSubmitButtonDisabled: {
    opacity: 0.5,
  },
  modalSubmitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});