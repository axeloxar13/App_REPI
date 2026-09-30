// app/installations/index.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors, radius, spacing } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { StatusChip } from '../../components/admin/StatusChip';
import { HighlightedText } from '../../components/HighlightedText';
import { getSearchTerms, scoreFields, findRanges } from '../../utils/search';
import type { InstallationStatus } from '../../types/database';

type Installation = {
  id: string;
  project_name: string;
  status: InstallationStatus;
  address: string;
  assigned_date: string;
  technician_membership_id?: string | null;
  client: { id: string; name: string } | null;
  technician: { id: string; full_name: string } | null;
  installation_type?: string | null;
  observations?: string | null;
  items?: Array<{
    id?: string;
    name?: string | null;
    service_type?: string | null;
    specific_location?: string | null;
    observations?: string | null;
    work_type?: string | null;
  }> | null;
};

type TechnicianOption = {
  id: string;
  full_name: string;
  email?: string;
};

const statusOptions: InstallationStatus[] = [
  'pending',
  'in_progress',
  'in_review',
  'completed',
  'cancelled',
];

const statusLabels: Record<InstallationStatus, string> = {
  pending: 'Pendientes',
  in_progress: 'En progreso',
  in_review: 'En revisión',
  completed: 'Completadas',
  cancelled: 'Canceladas',
};

const formatDate = (date?: string | null) =>
  date ? new Date(date).toLocaleDateString('es-MX') : 'Sin fecha';

// Puntaje de relevancia: null si alguna palabra no aparece en ningún campo.
function scoreInstallation(i: Installation, terms: string[]): number | null {
  const fields = [
    { value: i.project_name, weight: 10 },
    { value: i.client?.name, weight: 8 },
    { value: i.technician?.full_name, weight: 8 },
    { value: i.address, weight: 5 },
    { value: statusLabels[i.status], weight: 4 },
    { value: i.installation_type, weight: 4 },
    { value: formatDate(i.assigned_date), weight: 3 },
    { value: i.observations, weight: 2 },
    ...(i.items ?? []).flatMap((item) => [
      { value: item.name, weight: 4 },
      { value: item.service_type, weight: 3 },
      { value: item.specific_location, weight: 3 },
      { value: item.work_type, weight: 3 },
      { value: item.observations, weight: 2 },
    ]),
  ];
  return scoreFields(fields, terms);
}

// Coincidencias en datos que la tarjeta NO muestra directamente.
function getHiddenMatches(i: Installation, terms: string[]) {
  if (!terms.length) return [];
  const candidates: { label: string; text?: string | null }[] = [
    { label: 'Tipo', text: i.installation_type },
    { label: 'Observaciones', text: i.observations },
    ...(i.items ?? []).flatMap((item) => [
      { label: 'Partida', text: item.name },
      { label: 'Servicio', text: item.service_type },
      { label: 'Ubicación', text: item.specific_location },
      { label: 'Trabajo', text: item.work_type },
      { label: 'Obs. partida', text: item.observations },
    ]),
  ];
  return candidates
    .filter((c) => c.text && findRanges(c.text, terms).length > 0)
    .slice(0, 2) as { label: string; text: string }[];
}

export default function InstallationsScreen() {
  const { supabase, selectedMembership } = useAuth();
  const [allInstallations, setAllInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<InstallationStatus | 'all'>('all');
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string | 'all'>('all');
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [technicianModalVisible, setTechnicianModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const listRef = useRef<FlatList<Installation>>(null);

  const organizationId =
    selectedMembership?.organizationId || selectedMembership?.organization_id;

  const isAdmin = selectedMembership?.role === 'admin';

  // Solo se consulta la BD al cambiar de estado o refrescar (no por cada letra).
  const loadInstallations = useCallback(async () => {
    if (!organizationId) {
      setAllInstallations([]);
      setError('No hay una organización seleccionada.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (!supabase) {
      setAllInstallations([]);
      setError('No se pudo conectar con la base de datos.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setError(null);

      let query = supabase
        .from('installations')
        .select(`
          *,
          client:clients!installations_client_organization_fkey(id, name),
          technician:profiles(id, full_name),
          items:installation_items(*)
        `)
        .eq('organization_id', organizationId)
        .order('assigned_date', { ascending: true });

      if (selectedStatus !== 'all') {
        query = query.eq('status', selectedStatus);
      }

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;

      const installationData = (data || []) as unknown as Installation[];
      setAllInstallations(installationData);

      // Cargar todos los técnicos disponibles de la organización para el filtro.
      const { data: technicianData, error: technicianError } = await supabase.rpc(
        'admin_technician_directory',
        {
          p_organization_id: organizationId,
          p_search: null,
          p_status: '',
        }
      );

      if (technicianError) {
        console.warn('No se pudieron cargar los técnicos para el filtro:', technicianError);
        setTechnicians([]);
      } else {
        setTechnicians(
          ((technicianData || []) as TechnicianOption[]).sort((a, b) =>
            (a.full_name || '').localeCompare(b.full_name || '', 'es-MX')
          )
        );
      }
    } catch (err) {
      console.error('Error loading installations:', err);
      setAllInstallations([]);
      setError((err as Error)?.message || 'No se pudieron cargar las instalaciones.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase, organizationId, selectedStatus]);

  useEffect(() => {
    loadInstallations();
  }, [loadInstallations]);

  useEffect(() => {
    setSelectedTechnicianId('all');
    setTechnicianModalVisible(false);
  }, [organizationId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadInstallations();
  };

  const searchTerms = useMemo(() => getSearchTerms(searchQuery), [searchQuery]);
  const isSearching = searchTerms.length > 0;

  const selectedTechnician = useMemo(
    () =>
      technicians.find((technician) => technician.id === selectedTechnicianId) || null,
    [technicians, selectedTechnicianId]
  );

  // Primero filtra por técnico y después aplica la búsqueda por relevancia.
  const installations = useMemo(() => {
    const technicianFiltered =
      selectedTechnicianId === 'all'
        ? allInstallations
        : allInstallations.filter(
            (installation) =>
              installation.technician_membership_id === selectedTechnicianId
          );

    if (!isSearching) return technicianFiltered;

    return technicianFiltered
      .map((installation) => ({
        installation,
        score: scoreInstallation(installation, searchTerms),
      }))
      .filter((r): r is { installation: Installation; score: number } => r.score !== null)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.installation);
  }, [
    allInstallations,
    searchTerms,
    isSearching,
    selectedTechnicianId,
  ]);

  // Al cambiar la búsqueda, volver al inicio de la lista.
  useEffect(() => {
    if (isSearching) {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [searchQuery, isSearching]);

  const handleDeleteInstallation = (installation: Installation) => {
  if (!isAdmin) return;

  const status = installation.status;

  const statusMessages: Record<string, string> = {
    pending:
      'Esta instalación está pendiente de iniciar.',
    in_progress:
      'Esta instalación está actualmente en curso.',
    in_review:
      'Esta instalación está actualmente en revisión.',
    completed:
      'Esta instalación ya está completada.',
    cancelled:
      'Esta instalación está cancelada.',
  };

  const statusMessage =
    statusMessages[status] ||
    'Esta instalación tiene información registrada actualmente.';

  Alert.alert(
    'Eliminar instalación',
    `${statusMessage}\n\nSi continúas, se eliminarán permanentemente la instalación y todos sus datos relacionados, incluyendo partidas, fotos, firmas, equipos y registros asociados.\n\nEsta acción no se puede deshacer.\n\n¿Estás seguro de que deseas continuar?`,
    [
      {
        text: 'Cancelar',
        style: 'cancel',
      },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            if (!supabase || !organizationId) {
              throw new Error(
                'No se pudo conectar con la base de datos.'
              );
            }

            const { error: deleteError } = await supabase
              .from('installations')
              .delete()
              .eq('id', installation.id)
              .eq('organization_id', organizationId);

            if (deleteError) {
              throw deleteError;
            }

            setAllInstallations((current) =>
              current.filter(
                (item) => item.id !== installation.id
              )
            );

            Alert.alert(
              '¡Eliminada!',
              'La instalación ha sido eliminada correctamente.'
            );
          } catch (err) {
            console.error(
              'Error deleting installation:',
              err
            );

            Alert.alert(
              'Error',
              err instanceof Error
                ? err.message
                : 'No se pudo eliminar la instalación.'
            );
          }
        },
      },
    ]
  );
};

  const renderItem = ({ item }: { item: Installation }) => (
    <InstallationCard
      installation={item}
      terms={searchTerms}
      isAdmin={isAdmin}
      onPress={() => router.push(`/installations/${item.id}`)}
      onEdit={() =>
        router.push({
          pathname: '/installations/[id]/edit',
          params: { id: item.id },
        })
      }
      onDelete={() => handleDeleteInstallation(item)}
    />
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.centerScreen}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Cargando instalaciones...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>‹</Text>
        </Pressable>

        <View style={styles.headerContent}>
          <View style={styles.titleContainer}>
            <Text style={styles.eyebrow}>Administración</Text>
            <Text style={styles.title}>Instalaciones</Text>
            <Text style={styles.subtitle}>
              {isSearching || selectedTechnicianId !== 'all'
                ? `${installations.length} de ${allInstallations.length} instalaciones`
                : `${installations.length} ${
                    installations.length === 1 ? 'instalación' : 'instalaciones'
                  }`}
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [styles.newButton, pressed && styles.buttonPressed]}
            onPress={() => router.push('/installations/new')}
          >
            <Text style={styles.newButtonText}>+ Nueva</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search-outline" size={20} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar: técnico, cliente, proyecto, partida..."
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={20} color={colors.muted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Filtro por técnico */}
      <View style={styles.technicianFilterContainer}>
        <Text style={styles.technicianFilterLabel}>Técnico</Text>

        <Pressable
          style={({ pressed }) => [
            styles.technicianSelect,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => setTechnicianModalVisible(true)}
        >
          <View style={styles.technicianSelectContent}>
            <Ionicons
              name="person-outline"
              size={19}
              color={colors.muted}
            />
            <Text
              style={[
                styles.technicianSelectText,
                selectedTechnician && styles.technicianSelectTextActive,
              ]}
              numberOfLines={1}
            >
              {selectedTechnician?.full_name || 'Todos los técnicos'}
            </Text>
          </View>

          <Ionicons
            name="chevron-down"
            size={18}
            color={colors.muted}
          />
        </Pressable>
      </View>

      {/* El wrapper evita que el ScrollView horizontal se expanda en vertical
          y empuje la lista hacia el centro. */}
      <View style={styles.filtersWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersScroll}
          contentContainerStyle={styles.filtersContainer}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            style={[styles.filterChip, selectedStatus === 'all' && styles.filterChipActive]}
            onPress={() => setSelectedStatus('all')}
          >
            <Text style={[styles.filterText, selectedStatus === 'all' && styles.filterTextActive]}>
              Todas
            </Text>
          </Pressable>

          {statusOptions.map((status) => (
            <Pressable
              key={status}
              style={[styles.filterChip, selectedStatus === status && styles.filterChipActive]}
              onPress={() => setSelectedStatus(status)}
            >
              <Text
                style={[styles.filterText, selectedStatus === status && styles.filterTextActive]}
              >
                {statusLabels[status]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <Modal
        visible={technicianModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTechnicianModalVisible(false)}
      >
        <Pressable
          style={styles.technicianModalOverlay}
          onPress={() => setTechnicianModalVisible(false)}
        >
          <Pressable
            style={styles.technicianModalContent}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.technicianModalHeader}>
              <View>
                <Text style={styles.technicianModalTitle}>
                  Filtrar por técnico
                </Text>
                <Text style={styles.technicianModalSubtitle}>
                  Selecciona el técnico que quieres consultar
                </Text>
              </View>

              <Pressable
                onPress={() => setTechnicianModalVisible(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={24} color={colors.muted} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.technicianOptionsScroll}
              contentContainerStyle={styles.technicianOptionsContent}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable
                style={[
                  styles.technicianOption,
                  selectedTechnicianId === 'all' &&
                    styles.technicianOptionActive,
                ]}
                onPress={() => {
                  setSelectedTechnicianId('all');
                  setTechnicianModalVisible(false);
                }}
              >
                <View style={styles.technicianOptionIcon}>
                  <Ionicons
                    name="people-outline"
                    size={20}
                    color={
                      selectedTechnicianId === 'all'
                        ? colors.primary
                        : colors.muted
                    }
                  />
                </View>

                <Text
                  style={[
                    styles.technicianOptionText,
                    selectedTechnicianId === 'all' &&
                      styles.technicianOptionTextActive,
                  ]}
                >
                  Todos los técnicos
                </Text>

                {selectedTechnicianId === 'all' && (
                  <Ionicons
                    name="checkmark-circle"
                    size={22}
                    color={colors.primary}
                  />
                )}
              </Pressable>

              {technicians.map((technician) => (
                <Pressable
                  key={technician.id}
                  style={[
                    styles.technicianOption,
                    selectedTechnicianId === technician.id &&
                      styles.technicianOptionActive,
                  ]}
                  onPress={() => {
                    setSelectedTechnicianId(technician.id);
                    setTechnicianModalVisible(false);
                  }}
                >
                  <View style={styles.technicianOptionIcon}>
                    <Ionicons
                      name="person-outline"
                      size={20}
                      color={
                        selectedTechnicianId === technician.id
                          ? colors.primary
                          : colors.muted
                      }
                    />
                  </View>

                  <View style={styles.technicianOptionTextContainer}>
                    <Text
                      style={[
                        styles.technicianOptionText,
                        selectedTechnicianId === technician.id &&
                          styles.technicianOptionTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {technician.full_name}
                    </Text>

                    {!!technician.email && (
                      <Text
                        style={styles.technicianOptionEmail}
                        numberOfLines={1}
                      >
                        {technician.email}
                      </Text>
                    )}
                  </View>

                  {selectedTechnicianId === technician.id && (
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color={colors.primary}
                    />
                  )}
                </Pressable>
              ))}

              {technicians.length === 0 && (
                <View style={styles.technicianEmpty}>
                  <Ionicons
                    name="people-outline"
                    size={32}
                    color={colors.muted}
                  />
                  <Text style={styles.technicianEmptyText}>
                    No hay técnicos disponibles.
                  </Text>
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>No se pudieron cargar las instalaciones</Text>
          <Text style={styles.errorDetail}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={loadInstallations}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          style={styles.list}
          data={installations}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>{isSearching ? '🔍' : '📋'}</Text>
              <Text style={styles.emptyTitle}>
                {isSearching ? 'Sin resultados' : 'No hay instalaciones'}
              </Text>
              <Text style={styles.emptyText}>
                {isSearching
                  ? `No encontramos nada para "${searchQuery.trim()}". Prueba con menos palabras.`
                  : selectedTechnicianId !== 'all'
                  ? `El técnico ${selectedTechnician?.full_name || 'seleccionado'} no tiene instalaciones con estos filtros.`
                  : selectedStatus !== 'all'
                  ? 'No hay instalaciones con este estado.'
                  : 'Todavía no hay instalaciones registradas.'}
              </Text>
              {isAdmin && !isSearching && selectedStatus === 'all' && (
                <Pressable
                  style={styles.retryButton}
                  onPress={() => router.push('/installations/new')}
                >
                  <Text style={styles.retryText}>Crear instalación</Text>
                </Pressable>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function InstallationCard({
  installation,
  terms,
  isAdmin,
  onPress,
  onEdit,
  onDelete,
}: {
  installation: Installation;
  terms: string[];
  isAdmin: boolean;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const hiddenMatches = useMemo(
    () => getHiddenMatches(installation, terms),
    [installation, terms]
  );

  return (
    <View style={styles.card}>
      <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.cardPressed}>
        <View style={styles.cardHeader}>
          <HighlightedText
            style={styles.cardTitle}
            numberOfLines={1}
            text={installation.project_name || 'Instalación'}
            terms={terms}
          />
          <StatusChip status={installation.status} />
        </View>

        <HighlightedText
          style={styles.cardClient}
          text={installation.client?.name || 'Sin cliente'}
          terms={terms}
        />

        <HighlightedText
          style={styles.cardAddress}
          numberOfLines={2}
          text={installation.address || 'Sin dirección'}
          terms={terms}
        />

        {hiddenMatches.length > 0 && (
          <View style={styles.matchBox}>
            <Text style={styles.matchLabel}>Coincide en:</Text>
            {hiddenMatches.map((m, idx) => (
              <View key={idx} style={styles.matchRow}>
                <Text style={styles.matchKey}>{m.label}: </Text>
                <View style={styles.matchValue}>
                  <HighlightedText
                    style={styles.matchText}
                    numberOfLines={1}
                    text={m.text}
                    terms={terms}
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.cardFooter}>
          <HighlightedText
            style={styles.cardTechnician}
            numberOfLines={1}
            text={
              installation.technician
                ? `👤 ${installation.technician.full_name}`
                : 'Sin técnico asignado'
            }
            terms={terms}
          />
          <HighlightedText
            style={styles.cardDate}
            text={formatDate(installation.assigned_date)}
            terms={terms}
          />
        </View>
      </Pressable>

      {isAdmin && (
        <View style={styles.adminActionsRow}>
          <Pressable
            style={({ pressed }) => [
              styles.adminActionButton,
              styles.editButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={onEdit}
          >
            <Ionicons name="create-outline" size={18} color={colors.primary} />
            <Text style={styles.editButtonText}>Editar</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.adminActionButton,
              styles.deleteButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={onDelete}
          >
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
            <Text style={styles.deleteButtonText}>Eliminar</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.muted,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
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
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleContainer: {
    flex: 1,
    marginRight: spacing.sm,
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
  newButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    marginTop: 4,
  },
  newButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text,
  },

  technicianFilterContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },

  technicianFilterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 6,
  },

  technicianSelect: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },

  technicianSelectContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },

  technicianSelectText: {
    flex: 1,
    fontSize: 15,
    color: colors.muted,
  },

  technicianSelectTextActive: {
    color: colors.text,
    fontWeight: '600',
  },

  technicianModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: spacing.lg,
  },

  technicianModalContent: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '80%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },

  technicianModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  technicianModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },

  technicianModalSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: colors.muted,
  },

  technicianOptionsScroll: {
    maxHeight: 420,
  },

  technicianOptionsContent: {
    padding: spacing.sm,
    gap: 4,
  },

  technicianOption: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    gap: spacing.sm,
  },

  technicianOptionActive: {
    backgroundColor: colors.primarySoft,
  },

  technicianOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },

  technicianOptionTextContainer: {
    flex: 1,
  },

  technicianOptionText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },

  technicianOptionTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },

  technicianOptionEmail: {
    marginTop: 2,
    fontSize: 12,
    color: colors.muted,
  },

  technicianEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },

  technicianEmptyText: {
    marginTop: spacing.sm,
    color: colors.muted,
    fontSize: 14,
  },

  // Filtros: el wrapper tiene altura fija y no crece ni se encoge,
  // así la lista siempre arranca justo debajo (arriba, no al centro).
  filtersWrapper: {
    height: 62,
    marginBottom: spacing.sm,
    flexGrow: 0,
    flexShrink: 0,
  },
  filtersScroll: {
    flexGrow: 0,
  },
  filtersContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  filterChip: {
    height: 50,
    paddingHorizontal: spacing.md,
    borderRadius: 25,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    textAlign: 'center',
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
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorDetail: {
    color: '#7f1d1d',
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.sm,
  },
  retryText: {
    color: 'white',
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.xl,
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
  cardPressed: {
    opacity: 0.75,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  cardClient: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 2,
  },
  cardAddress: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  matchBox: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    gap: 2,
  },
  matchLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  matchKey: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  matchValue: {
    flex: 1,
  },
  matchText: {
    fontSize: 12,
    color: colors.muted,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTechnician: {
    fontSize: 12,
    color: colors.muted,
    flex: 1,
  },
  cardDate: {
    fontSize: 12,
    color: colors.muted,
  },
  adminActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  adminActionButton: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  editButton: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  deleteButton: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  editButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  deleteButtonText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
});