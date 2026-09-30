// app/administrators/index.tsx
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
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors, radius, spacing } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

type Administrator = {
  id: string;
  user_id?: string;
  full_name: string;
  email: string;
  active: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  invitation_pending: boolean;
};

export default function AdministratorsScreen() {
  const { selectedMembership } = useAuth();
  const [administrators, setAdministrators] = useState<Administrator[]>([]);
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

  // Cargar administradores
  const loadAdministrators = useCallback(async () => {
    if (!organizationId || !supabase) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Usar la RPC admin_administrator_directory
      const { data, error: fetchError } = await supabase.rpc(
        'admin_administrator_directory',
        {
          p_organization_id: organizationId,
          p_search: searchQuery || null,
          p_status: showInactive ? 'all' : 'active',
        }
      );

      if (fetchError) throw fetchError;

      setAdministrators(data || []);
    } catch (err) {
      console.error('Error loading administrators:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase, organizationId, searchQuery, showInactive]);

  useEffect(() => {
    loadAdministrators();
  }, [loadAdministrators]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadAdministrators();
  }, [loadAdministrators]);

  // Invitar administrador
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
          role: 'admin',
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
      loadAdministrators();
    } catch (err) {
      console.error('Error inviting administrator:', err);
      Alert.alert('Error', (err as Error).message);
    } finally {
      setInviting(false);
    }
  };

  // Activar/Desactivar administrador
  const toggleAdminStatus = async (
    adminId: string,
    currentActive: boolean
  ) => {
    // No permitir desactivarse a sí mismo
    if (adminId === selectedMembership?.userId) {
      Alert.alert(
        'No permitido',
        'No puedes desactivarte a ti mismo'
      );
      return;
    }

    Alert.alert(
      currentActive
        ? 'Desactivar administrador'
        : 'Activar administrador',
      currentActive
        ? '¿Estás seguro de desactivar este administrador?'
        : '¿Estás seguro de activar este administrador?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: currentActive ? 'Desactivar' : 'Activar',
          onPress: async () => {
            try {
              const { error: updateError } = await supabase.rpc(
                'admin_set_administrator_active',
                {
                  p_organization_id: organizationId,
                  p_admin_id: adminId,
                  p_active: !currentActive,
                }
              );

              if (updateError) throw updateError;
              loadAdministrators();
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
          <ActivityIndicator
            size="large"
            color={colors.primary}
          />
          <Text style={styles.loadingText}>
            Cargando administradores...
          </Text>
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
            <Text style={styles.title}>Administradores</Text>
            <Text style={styles.subtitle}>
              Total: {administrators.length}
            </Text>
          </View>

          <Pressable
            style={styles.inviteButton}
            onPress={() => setInviteModalVisible(true)}
          >
            <Text style={styles.inviteButtonText}>
              + Invitar
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar administrador..."
          placeholderTextColor={colors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          onSubmitEditing={loadAdministrators}
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
            onPress={loadAdministrators}
          >
            <Text style={styles.retryText}>
              Reintentar
            </Text>
          </Pressable>
        </View>
      )}

      {/* List */}
      <FlatList
        data={administrators}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        }
        renderItem={({ item }) => (
          <AdministratorCard
            admin={item}
            isCurrentUser={
              item.user_id === selectedMembership?.userId
            }
            onToggleStatus={() =>
              toggleAdminStatus(item.id, item.active)
            }
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👑</Text>

            <Text style={styles.emptyTitle}>
              No hay administradores
            </Text>

            <Text style={styles.emptyText}>
              {searchQuery
                ? 'No se encontraron administradores con esa búsqueda'
                : 'Invita a un administrador desde el botón superior'}
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
                Invitar administrador
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
                  placeholder="Nombre del administrador"
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
                  placeholder="admin@ejemplo.com"
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
// COMPONENTE: AdministratorCard
// ============================================

function AdministratorCard({
  admin,
  isCurrentUser,
  onToggleStatus,
}: {
  admin: Administrator;
  isCurrentUser: boolean;
  onToggleStatus: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardNameContainer}>
          <Text style={styles.cardName}>
            {admin.full_name}
          </Text>

          {isCurrentUser && (
            <View style={styles.currentUserBadge}>
              <Text style={styles.currentUserBadgeText}>
                Tú
              </Text>
            </View>
          )}

          {admin.invitation_pending && (
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
            admin.active
              ? styles.statusToggleActive
              : styles.statusToggleInactive,
          ]}
          onPress={onToggleStatus}
          disabled={isCurrentUser}
        >
          <Text style={styles.statusToggleText}>
            {admin.active ? 'Activo' : 'Inactivo'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.cardEmail}>
        {admin.email}
      </Text>

      <View style={styles.cardFooter}>
        <Text style={styles.cardDate}>
          Miembro desde:{' '}
          {new Date(admin.created_at).toLocaleDateString()}
        </Text>

        {admin.last_sign_in_at && (
          <Text style={styles.cardLastLogin}>
            Último acceso:{' '}
            {new Date(
              admin.last_sign_in_at
            ).toLocaleString()}
          </Text>
        )}
      </View>
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

  currentUserBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },

  currentUserBadgeText: {
    fontSize: 10,
    color: '#1e40af',
    fontWeight: '600',
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

  cardFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  cardDate: {
    fontSize: 12,
    color: colors.muted,
  },

  cardLastLogin: {
    fontSize: 12,
    color: colors.muted,
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