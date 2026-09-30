// app/technicians/index.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors, radius, spacing } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

type Technician = {
  id: string;
  user_id?: string;
  full_name: string;
  email: string;
  active: boolean;
  created_at: string;
  total_installations: number;
  active_installations: number;
  invitation_pending: boolean;
};

export default function TechniciansScreen() {
  const { selectedMembership } = useAuth();
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Modal de invitación
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviting, setInviting] = useState(false);

  const organizationId = selectedMembership?.organizationId;

  // Cargar técnicos
  const loadTechnicians = useCallback(async () => {
    if (!organizationId || !supabase) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Obtener técnicos usando la RPC admin_technician_directory
      const { data, error: fetchError } = await supabase.rpc(
        'admin_technician_directory',
        {
          p_organization_id: organizationId,
          p_search: searchQuery || null,
          p_status: showInactive ? 'all' : 'active',
        }
      );

      if (fetchError) throw fetchError;

      setTechnicians(data || []);
    } catch (err) {
      console.error('Error loading technicians:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase, organizationId, searchQuery, showInactive]);

  useEffect(() => {
    loadTechnicians();
  }, [loadTechnicians]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadTechnicians();
  }, [loadTechnicians]);

  // Invitar técnico
  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteName.trim()) {
      Alert.alert('Error', 'Nombre y email son obligatorios');
      return;
    }

    try {
      setInviting(true);

      const { data, error: inviteError } = await supabase
        .from('organization_memberships')
        .insert({
          organization_id: organizationId,
          email: inviteEmail.trim(),
          full_name: inviteName.trim(),
          role: 'technician',
          status: 'invited',
          active: true,
        })
        .select()
        .single();

      if (inviteError) throw inviteError;

      Alert.alert(
        '¡Invitación enviada!',
        `Se ha enviado una invitación a ${inviteEmail}`,
        [{ text: 'OK' }]
      );

      setInviteModalVisible(false);
      setInviteEmail('');
      setInviteName('');
      loadTechnicians();
    } catch (err) {
      console.error('Error inviting technician:', err);
      Alert.alert('Error', (err as Error).message);
    } finally {
      setInviting(false);
    }
  };

  // Activar/Desactivar técnico
  const toggleTechnicianStatus = async (
    technicianId: string,
    currentActive: boolean
  ) => {
    Alert.alert(
      currentActive ? 'Desactivar técnico' : 'Activar técnico',
      currentActive
        ? '¿Estás seguro de desactivar este técnico?'
        : '¿Estás seguro de activar este técnico?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: currentActive ? 'Desactivar' : 'Activar',
          onPress: async () => {
            try {
              const { error: updateError } = await supabase.rpc(
                'admin_set_technician_active',
                {
                  p_organization_id: organizationId,
                  p_technician_id: technicianId,
                  p_active: !currentActive,
                }
              );

              if (updateError) throw updateError;
              loadTechnicians();
            } catch (err) {
              Alert.alert('Error', (err as Error).message);
            }
          },
        },
      ]
    );
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerScreen}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Cargando técnicos...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        {/* BOTÓN REGRESAR */}
        <Pressable
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.backButtonPressed,
          ]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Regresar"
          hitSlop={8}
        >
          <Text style={styles.backButtonText}>‹</Text>
        </Pressable>

        {/* CONTENIDO DEL HEADER */}
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.eyebrow}>Gestión</Text>
            <Text style={styles.title}>Técnicos</Text>
            <Text style={styles.subtitle}>
              Total: {technicians.length}
            </Text>
          </View>

          <Pressable
            style={styles.inviteButton}
            onPress={() => setInviteModalVisible(true)}
          >
            <Text style={styles.inviteButtonText}>+ Invitar</Text>
          </Pressable>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar técnico..."
          placeholderTextColor={colors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          onSubmitEditing={loadTechnicians}
        />
      </View>

      {/* Filter */}
      <View style={styles.filterContainer}>
        <Pressable
          style={[
            styles.filterChip,
            !showInactive && styles.filterChipActive,
          ]}
          onPress={() => setShowInactive(false)}
        >
          <Text
            style={[
              styles.filterText,
              !showInactive && styles.filterTextActive,
            ]}
          >
            Activos
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.filterChip,
            showInactive && styles.filterChipActive,
          ]}
          onPress={() => setShowInactive(true)}
        >
          <Text
            style={[
              styles.filterText,
              showInactive && styles.filterTextActive,
            ]}
          >
            Todos
          </Text>
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>

          <Pressable
            style={styles.retryButton}
            onPress={loadTechnicians}
          >
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      )}

      {/* List */}
      <FlatList
        data={technicians}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        }
        renderItem={({ item }) => (
          <TechnicianCard
            technician={item}
            onPress={() =>
              router.push(`/technicians/${item.id}`)
            }
            onToggleStatus={() =>
              toggleTechnicianStatus(item.id, item.active)
            }
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👤</Text>
            <Text style={styles.emptyTitle}>
              No hay técnicos
            </Text>
            <Text style={styles.emptyText}>
              {searchQuery
                ? 'No se encontraron técnicos con esa búsqueda'
                : 'Invita a un técnico desde el botón superior'}
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />

      {/* Modal de invitación */}
      <Modal
        visible={inviteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setInviteModalVisible(false)
        }
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Invitar técnico
              </Text>

              <Pressable
                onPress={() =>
                  setInviteModalVisible(false)
                }
              >
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.field}>
                <Text style={styles.label}>
                  Nombre completo
                </Text>

                <TextInput
                  style={styles.input}
                  placeholder="Nombre del técnico"
                  placeholderTextColor={colors.muted}
                  value={inviteName}
                  onChangeText={setInviteName}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>
                  Correo electrónico
                </Text>

                <TextInput
                  style={styles.input}
                  placeholder="tecnico@ejemplo.com"
                  placeholderTextColor={colors.muted}
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <Pressable
                style={[
                  styles.modalSubmitButton,
                  inviting &&
                    styles.modalSubmitButtonDisabled,
                ]}
                onPress={handleInvite}
                disabled={inviting}
              >
                {inviting ? (
                  <ActivityIndicator
                    size="small"
                    color="white"
                  />
                ) : (
                  <Text style={styles.modalSubmitButtonText}>
                    Enviar invitación
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ============================================
// COMPONENTE: TechnicianCard
// ============================================

function TechnicianCard({
  technician,
  onPress,
  onToggleStatus,
}: {
  technician: Technician;
  onPress: () => void;
  onToggleStatus: () => void;
}) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <View style={styles.cardNameContainer}>
          <Text style={styles.cardName}>
            {technician.full_name}
          </Text>

          {technician.invitation_pending && (
            <View style={styles.invitationBadge}>
              <Text style={styles.invitationBadgeText}>
                Pendiente
              </Text>
            </View>
          )}
        </View>

        <Pressable
          style={[
            styles.statusToggle,
            technician.active
              ? styles.statusToggleActive
              : styles.statusToggleInactive,
          ]}
          onPress={(e) => {
            e.stopPropagation();
            onToggleStatus();
          }}
        >
          <Text style={styles.statusToggleText}>
            {technician.active ? 'Activo' : 'Inactivo'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.cardEmail}>
        {technician.email}
      </Text>

      <View style={styles.cardStats}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {technician.total_installations}
          </Text>
          <Text style={styles.statLabel}>
            Instalaciones totales
          </Text>
        </View>

        <View style={styles.statDivider} />

        <View style={styles.statItem}>
          <Text
            style={[
              styles.statValue,
              { color: colors.primary },
            ]}
          >
            {technician.active_installations}
          </Text>
          <Text style={styles.statLabel}>
            Instalaciones activas
          </Text>
        </View>

        <View style={styles.statDivider} />

        <View style={styles.statItem}>
          <Text
            style={[
              styles.statValue,
              { color: '#10b981' },
            ]}
          >
            {technician.active ? '✅' : '⛔'}
          </Text>

          <Text style={styles.statLabel}>
            {technician.active
              ? 'Disponible'
              : 'Inactivo'}
          </Text>
        </View>
      </View>
    </Pressable>
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
  },

  loadingText: {
    marginTop: spacing.md,
    color: colors.muted,
    fontSize: 16,
  },

  // HEADER PRINCIPAL
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },

  // BOTÓN REGRESAR
  backButton: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginTop: 2,
  },

  backButtonPressed: {
    opacity: 0.75,
  },

  backButtonText: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '400',
    lineHeight: 38,
    marginTop: -4,
  },

  // CONTENIDO DEL HEADER
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  eyebrow: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
  },

  subtitle: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 2,
  },

  inviteButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },

  inviteButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },

  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },

  searchInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text,
  },

  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },

  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  filterText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
  },

  filterTextActive: {
    color: 'white',
  },

  errorContainer: {
    backgroundColor: '#fee2e2',
    margin: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
  },

  errorText: {
    color: '#991b1b',
    fontSize: 14,
    marginBottom: spacing.sm,
  },

  retryButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },

  retryText: {
    color: 'white',
    fontWeight: '600',
  },

  listContent: {
    padding: spacing.lg,
    gap: spacing.sm,
  },

  emptyState: {
    alignItems: 'center',
    padding: spacing.xl,
  },

  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },

  emptyText: {
    color: colors.muted,
    textAlign: 'center',
  },

  card: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },

  cardNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },

  cardName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },

  invitationBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },

  invitationBadgeText: {
    fontSize: 10,
    color: '#92400e',
    fontWeight: '600',
  },

  cardEmail: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: spacing.sm,
  },

  statusToggle: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    minWidth: 60,
    alignItems: 'center',
  },

  statusToggleActive: {
    backgroundColor: '#d1fae5',
  },

  statusToggleInactive: {
    backgroundColor: '#fee2e2',
  },

  statusToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },

  cardStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },

  statItem: {
    flex: 1,
    alignItems: 'center',
  },

  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },

  statLabel: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 1,
  },

  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.border,
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

  modalSubmitButton: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: radius.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
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