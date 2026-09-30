import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

type InstallationStatus =
  | 'pending'
  | 'in_progress'
  | 'in_review'
  | 'completed'
  | 'cancelled';

type InstallationRow = {
  id: string;
  project_name: string;
  status: InstallationStatus;
  address: string;
  assigned_date: string | null;
  installation_type: string | null;

  client: {
    id: string;
    name: string;
  } | null;

  technician: {
    id: string;
    full_name: string;
  } | null;
};

type FilterKey =
  | 'all'
  | InstallationStatus;

const STATUS_LABELS: Record<
  FilterKey,
  string
> = {
  all: 'Todas',
  pending: 'Pendientes',
  in_progress: 'En progreso',
  in_review: 'En revisión',
  completed: 'Completadas',
  cancelled: 'Canceladas',
};

const STATUS_COLORS: Record<
  InstallationStatus,
  string
> = {
  pending: '#F59E0B',
  in_progress: '#2563EB',
  in_review: '#8B5CF6',
  completed: '#16A34A',
  cancelled: '#DC2626',
};

export default function SupervisorDashboard() {
  const router = useRouter();

  const {
    selectedMembership,
    signOut,
  } = useAuth();

  const organizationId =
    selectedMembership?.organizationId;

  const [installations, setInstallations] =
    useState<InstallationRow[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [search, setSearch] =
    useState('');

  const [filter, setFilter] =
    useState<FilterKey>('all');

  const [isSigningOut, setIsSigningOut] =
    useState(false);

  // ==========================================================
  // CERRAR SESIÓN
  // ==========================================================

  const handleLogout = useCallback(
    async () => {
      if (isSigningOut) {
        return;
      }

      try {
        setIsSigningOut(true);

        await signOut();

        router.replace('/login');
      } catch (err: any) {
        console.error(
          '[SupervisorDashboard] Error cerrando sesión:',
          err,
        );

        setIsSigningOut(false);

        setError(
          err?.message ||
            'No fue posible cerrar la sesión.',
        );
      }
    },
    [
      isSigningOut,
      router,
      signOut,
    ],
  );

  // ==========================================================
  // CARGAR INSTALACIONES
  // ==========================================================

  const loadInstallations = useCallback(
    async (
      isRefresh = false,
    ) => {
      if (isSigningOut) {
        return;
      }

      if (!organizationId) {
        setInstallations([]);
        setError(
          'No se encontró la organización activa.',
        );
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError(null);

        // ----------------------------------------------------
        // 1. CARGAMOS LAS INSTALACIONES SOLAMENTE
        // ----------------------------------------------------

        let query = supabase
          .from('installations')
          .select(`
            id,
            project_name,
            status,
            address,
            assigned_date,
            installation_type,
            client_id,
            technician_membership_id
          `)
          .eq(
            'organization_id',
            organizationId,
          )
          .order('updated_at', {
            ascending: false,
          });

        if (filter !== 'all') {
          query = query.eq(
            'status',
            filter,
          );
        }

        const {
          data: installationData,
          error: installationError,
        } = await query;

        if (installationError) {
          throw installationError;
        }

        const rows =
          installationData ?? [];

        // ----------------------------------------------------
        // 2. OBTENER IDs DE CLIENTES
        // ----------------------------------------------------

        const clientIds = Array.from(
          new Set(
            rows
              .map(
                (row: any) =>
                  row.client_id,
              )
              .filter(Boolean),
          ),
        );

        // ----------------------------------------------------
        // 3. OBTENER IDs DE TÉCNICOS
        // ----------------------------------------------------

        const technicianIds =
          Array.from(
            new Set(
              rows
                .map(
                  (row: any) =>
                    row.technician_membership_id,
                )
                .filter(Boolean),
            ),
          );

        // ----------------------------------------------------
        // 4. CARGAR CLIENTES Y TÉCNICOS EN PARALELO
        // ----------------------------------------------------

        const [
          clientsResult,
          techniciansResult,
        ] = await Promise.all([
          clientIds.length > 0
            ? supabase
                .from('clients')
                .select('id, name')
                .eq(
                  'organization_id',
                  organizationId,
                )
                .in(
                  'id',
                  clientIds,
                )
            : Promise.resolve({
                data: [],
                error: null,
              }),

          technicianIds.length > 0
            ? supabase
                .from(
                  'organization_memberships',
                )
                .select(
                  'id, full_name',
                )
                .eq(
                  'organization_id',
                  organizationId,
                )
                .in(
                  'id',
                  technicianIds,
                )
            : Promise.resolve({
                data: [],
                error: null,
              }),
        ]);

        if (clientsResult.error) {
          throw clientsResult.error;
        }

        if (techniciansResult.error) {
          throw techniciansResult.error;
        }

        // ----------------------------------------------------
        // 5. CREAR MAPA DE CLIENTES
        // ----------------------------------------------------

        const clientsMap =
          new Map<
            string,
            {
              id: string;
              name: string;
            }
          >();

        (
          clientsResult.data ?? []
        ).forEach(
          (client: any) => {
            clientsMap.set(
              client.id,
              {
                id: client.id,
                name: client.name,
              },
            );
          },
        );

        // ----------------------------------------------------
        // 6. CREAR MAPA DE TÉCNICOS
        // ----------------------------------------------------

        const techniciansMap =
          new Map<
            string,
            {
              id: string;
              full_name: string;
            }
          >();

        (
          techniciansResult.data ?? []
        ).forEach(
          (technician: any) => {
            techniciansMap.set(
              technician.id,
              {
                id: technician.id,
                full_name:
                  technician.full_name,
              },
            );
          },
        );

        // ----------------------------------------------------
        // 7. ARMAR OBJETO FINAL
        // ----------------------------------------------------

        const mapped: InstallationRow[] =
          rows.map(
            (row: any) => ({
              id: row.id,

              project_name:
                row.project_name ??
                'Sin nombre',

              status:
                row.status ??
                'pending',

              address:
                row.address ?? '',

              assigned_date:
                row.assigned_date ??
                null,

              installation_type:
                row.installation_type ??
                null,

              client:
                row.client_id
                  ? clientsMap.get(
                      row.client_id,
                    ) ?? null
                  : null,

              technician:
                row.technician_membership_id
                  ? techniciansMap.get(
                      row.technician_membership_id,
                    ) ?? null
                  : null,
            }),
          );

        setInstallations(mapped);
      } catch (err: any) {
        console.error(
          '[SupervisorDashboard] Error cargando instalaciones:',
          err,
        );

        setError(
          err?.message ||
            'No fue posible cargar las instalaciones.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      organizationId,
      filter,
      isSigningOut,
    ],
  );

  // ==========================================================
  // RECARGAR AL CAMBIAR FILTRO / ORGANIZACIÓN
  // ==========================================================

  useEffect(() => {
    loadInstallations();
  }, [loadInstallations]);

  // ==========================================================
  // BÚSQUEDA
  // ==========================================================

  const filteredInstallations =
    useMemo(() => {
      const normalizedSearch =
        search
          .trim()
          .toLowerCase();

      if (!normalizedSearch) {
        return installations;
      }

      return installations.filter(
        (installation) => {
          const values = [
            installation.project_name,
            installation.address,
            installation.client?.name,
            installation.technician
              ?.full_name,
            installation.installation_type,
          ];

          return values.some(
            (value) =>
              value
                ?.toLowerCase()
                .includes(
                  normalizedSearch,
                ),
          );
        },
      );
    }, [
      installations,
      search,
    ]);

  // ==========================================================
  // MÉTRICAS
  // ==========================================================

  const metrics = useMemo(() => {
    return {
      total:
        installations.length,

      pending:
        installations.filter(
          (item) =>
            item.status ===
            'pending',
        ).length,

      inProgress:
        installations.filter(
          (item) =>
            item.status ===
            'in_progress',
        ).length,

      inReview:
        installations.filter(
          (item) =>
            item.status ===
            'in_review',
        ).length,

      completed:
        installations.filter(
          (item) =>
            item.status ===
            'completed',
        ).length,
    };
  }, [installations]);

  // ==========================================================
  // ABRIR DETALLE
  // ==========================================================

  const handleOpenInstallation = (
    installationId: string,
  ) => {
    if (isSigningOut) {
      return;
    }

    router.push({
      pathname:
        '/supervisor/installations/[id]',
      params: {
        id: installationId,
      },
    });
  };

  // ==========================================================
  // FILTRO
  // ==========================================================

  const renderStatusFilter = (
    key: FilterKey,
  ) => {
    const active =
      filter === key;

    return (
      <Pressable
        key={key}
        onPress={() =>
          setFilter(key)
        }
        disabled={isSigningOut}
        style={[
          styles.filterButton,
          active &&
            styles.filterButtonActive,
          isSigningOut &&
            styles.disabledControl,
        ]}
      >
        <Text
          style={[
            styles.filterButtonText,
            active &&
              styles.filterButtonTextActive,
          ]}
        >
          {STATUS_LABELS[key]}
        </Text>
      </Pressable>
    );
  };

  // ==========================================================
  // TARJETA
  // ==========================================================

  const renderInstallation = ({
    item,
  }: {
    item: InstallationRow;
  }) => {
    const statusColor =
      STATUS_COLORS[item.status];

    return (
      <Pressable
        style={
          styles.supervisorInstallationCard
        }
        onPress={() =>
          handleOpenInstallation(
            item.id,
          )
        }
        disabled={isSigningOut}
      >
        <View
          style={
            styles.supervisorCardHeader
          }
        >
          <View
            style={
              styles.supervisorCardTitleContainer
            }
          >
            <Text
              style={
                styles.supervisorCardTitle
              }
              numberOfLines={2}
            >
              {item.project_name}
            </Text>

            <Text
              style={
                styles.supervisorCardAddress
              }
              numberOfLines={2}
            >
              {item.address ||
                'Sin dirección'}
            </Text>
          </View>

          <View
            style={[
              styles.supervisorStatusBadge,
              {
                backgroundColor:
                  `${statusColor}18`,
              },
            ]}
          >
            <Text
              style={[
                styles.supervisorStatusText,
                {
                  color:
                    statusColor,
                },
              ]}
            >
              {
                STATUS_LABELS[
                  item.status
                ]
              }
            </Text>
          </View>
        </View>

        <View
          style={
            styles.supervisorCardInfo
          }
        >
          {/* CLIENTE */}
          <View
            style={
              styles.supervisorInfoRow
            }
          >
            <Ionicons
              name="person-outline"
              size={17}
              color="#64748B"
            />

            <Text
              style={
                styles.supervisorInfoText
              }
              numberOfLines={1}
            >
              {item.client?.name ||
                'Sin cliente'}
            </Text>
          </View>

          {/* TÉCNICO */}
          <View
            style={
              styles.supervisorInfoRow
            }
          >
            <Ionicons
              name="construct-outline"
              size={17}
              color="#64748B"
            />

            <Text
              style={
                styles.supervisorInfoText
              }
              numberOfLines={1}
            >
              {item.technician
                ?.full_name ||
                'Sin técnico asignado'}
            </Text>
          </View>

          {/* TIPO */}
          {item.installation_type && (
            <View
              style={
                styles.supervisorInfoRow
              }
            >
              <Ionicons
                name="settings-outline"
                size={17}
                color="#64748B"
              />

              <Text
                style={
                  styles.supervisorInfoText
                }
                numberOfLines={1}
              >
                {
                  item.installation_type
                }
              </Text>
            </View>
          )}

          {/* FECHA */}
          <View
            style={
              styles.supervisorInfoRow
            }
          >
            <Ionicons
              name="calendar-outline"
              size={17}
              color="#64748B"
            />

            <Text
              style={
                styles.supervisorInfoText
              }
            >
              {item.assigned_date
                ? new Date(
                    item.assigned_date,
                  ).toLocaleDateString()
                : 'Sin fecha'}
            </Text>
          </View>
        </View>

        <View
          style={
            styles.supervisorCardFooter
          }
        >
          <Text
            style={
              styles.supervisorViewText
            }
          >
            Ver instalación
          </Text>

          <Ionicons
            name="chevron-forward"
            size={20}
            color="#2563EB"
          />
        </View>
      </Pressable>
    );
  };

  // ==========================================================
  // ESTADO VACÍO
  // ==========================================================

  const renderEmptyState = () => {
    if (loading) {
      return null;
    }

    return (
      <View
        style={
          styles.emptyContainer
        }
      >
        <View
          style={styles.emptyIcon}
        >
          <Ionicons
            name="business-outline"
            size={34}
            color="#64748B"
          />
        </View>

        <Text
          style={
            styles.emptyTitle
          }
        >
          No hay instalaciones
        </Text>

        <Text
          style={styles.emptyText}
        >
          {search.trim()
            ? 'No encontramos instalaciones que coincidan con tu búsqueda.'
            : filter !== 'all'
              ? `No hay instalaciones en estado "${STATUS_LABELS[filter]}".`
              : 'Todavía no hay instalaciones disponibles para consultar.'}
        </Text>
      </View>
    );
  };

  // ==========================================================
  // SESIÓN CARGANDO
  // ==========================================================

  if (!selectedMembership) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <View
          style={styles.centered}
        >
          <ActivityIndicator
            size="large"
          />

          <Text
            style={
              styles.loadingText
            }
          >
            Cargando sesión...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <SafeAreaView
      style={styles.safeArea}
    >
      <View
        style={styles.container}
      >
        {/* HEADER */}

        <View style={styles.header}>
          <View
            style={
              styles.headerTextContainer
            }
          >
            <Text
              style={styles.eyebrow}
            >
              SUPERVISOR
            </Text>

            <Text
              style={styles.title}
            >
              Instalaciones
            </Text>

            <Text
              style={styles.subtitle}
            >
              Consulta el avance de las
              instalaciones de tu
              organización.
            </Text>
          </View>

          <View
            style={
              styles.headerActions
            }
          >
            <View
              style={
                styles.headerIcon
              }
            >
              <Ionicons
                name="eye-outline"
                size={25}
                color="#2563EB"
              />
            </View>

            <Pressable
              onPress={handleLogout}
              disabled={
                isSigningOut
              }
              accessibilityRole="button"
              accessibilityLabel="Cerrar sesión"
              style={[
                styles.logoutButton,
                isSigningOut &&
                  styles.logoutButtonDisabled,
              ]}
            >
              {isSigningOut ? (
                <ActivityIndicator
                  size="small"
                  color="#DC2626"
                />
              ) : (
                <Ionicons
                  name="log-out-outline"
                  size={22}
                  color="#DC2626"
                />
              )}
            </Pressable>
          </View>
        </View>

        {/* MÉTRICAS */}

        <View
          style={
            styles.metricsContainer
          }
        >
          <MetricCard
            icon="layers-outline"
            label="Todas"
            value={metrics.total}
          />

          <MetricCard
            icon="time-outline"
            label="Pendientes"
            value={metrics.pending}
            accent={
              STATUS_COLORS.pending
            }
          />

          <MetricCard
            icon="construct-outline"
            label="En progreso"
            value={
              metrics.inProgress
            }
            accent={
              STATUS_COLORS.in_progress
            }
          />

          <MetricCard
            icon="checkmark-circle-outline"
            label="Completadas"
            value={
              metrics.completed
            }
            accent={
              STATUS_COLORS.completed
            }
          />
        </View>

        {/* BÚSQUEDA */}

        <View
          style={
            styles.searchContainer
          }
        >
          <Ionicons
            name="search-outline"
            size={21}
            color="#64748B"
          />

          <TextInput
            value={search}
            onChangeText={
              setSearch
            }
            placeholder="Buscar instalación, cliente o técnico..."
            placeholderTextColor="#94A3B8"
            style={
              styles.searchInput
            }
            autoCapitalize="none"
            autoCorrect={false}
            editable={
              !isSigningOut
            }
          />

          {search.length > 0 && (
            <Pressable
              onPress={() =>
                setSearch('')
              }
              hitSlop={8}
              disabled={
                isSigningOut
              }
            >
              <Ionicons
                name="close-circle"
                size={20}
                color="#94A3B8"
              />
            </Pressable>
          )}
        </View>

        {/* FILTROS */}

        <View
          style={
            styles.filtersWrapper
          }
        >
          <FlatList
            horizontal
            data={[
              'all',
              'pending',
              'in_progress',
              'in_review',
              'completed',
              'cancelled',
            ] as FilterKey[]}
            keyExtractor={(item) =>
              item
            }
            renderItem={({
              item,
            }) =>
              renderStatusFilter(
                item,
              )
            }
            showsHorizontalScrollIndicator={
              false
            }
            contentContainerStyle={
              styles.filtersContent
            }
          />
        </View>

        {/* ERROR */}

        {error && (
          <View
            style={
              styles.errorContainer
            }
          >
            <Ionicons
              name="alert-circle-outline"
              size={21}
              color="#DC2626"
            />

            <View
              style={
                styles.errorTextContainer
              }
            >
              <Text
                style={
                  styles.errorTitle
                }
              >
                No se pudieron cargar
                las instalaciones
              </Text>

              <Text
                style={
                  styles.errorText
                }
              >
                {error}
              </Text>
            </View>

            <Pressable
              onPress={() =>
                loadInstallations()
              }
              style={
                styles.retryButton
              }
              disabled={
                isSigningOut
              }
            >
              <Text
                style={
                  styles.retryButtonText
                }
              >
                Reintentar
              </Text>
            </Pressable>
          </View>
        )}

        {/* LIST HEADER */}

        <View
          style={styles.listHeader}
        >
          <Text
            style={styles.listTitle}
          >
            {filter === 'all'
              ? 'Instalaciones'
              : STATUS_LABELS[
                  filter
                ]}
          </Text>

          <View
            style={
              styles.listCountContainer
            }
          >
            <Text
              style={styles.listCount}
            >
              {
                filteredInstallations.length
              }
            </Text>
          </View>
        </View>

        {/* LISTA */}

        <FlatList
          data={
            filteredInstallations
          }
          keyExtractor={(item) =>
            item.id
          }
          renderItem={
            renderInstallation
          }
          ListEmptyComponent={
            renderEmptyState
          }
          showsVerticalScrollIndicator={
            false
          }
          refreshControl={
            <RefreshControl
              refreshing={
                refreshing
              }
              onRefresh={() =>
                loadInstallations(
                  true,
                )
              }
              enabled={
                !isSigningOut
              }
            />
          }
          contentContainerStyle={
            filteredInstallations.length ===
            0
              ? styles.emptyListContent
              : styles.listContent
          }
        />

        {/* LOGOUT OVERLAY */}

        {isSigningOut && (
          <View
            pointerEvents="auto"
            style={
              styles.logoutOverlay
            }
          >
            <View
              style={
                styles.logoutOverlayCard
              }
            >
              <ActivityIndicator
                size="large"
                color="#2563EB"
              />

              <Text
                style={
                  styles.logoutOverlayTitle
                }
              >
                Cerrando sesión...
              </Text>

              <Text
                style={
                  styles.logoutOverlayText
                }
              >
                Regresando al inicio
                de sesión.
              </Text>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// ============================================================
// MÉTRICA
// ============================================================

type MetricCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  accent?: string;
};

function MetricCard({
  icon,
  label,
  value,
  accent,
}: MetricCardProps) {
  return (
    <View
      style={styles.metricCard}
    >
      <View
        style={[
          styles.metricIcon,
          accent
            ? {
                backgroundColor:
                  `${accent}18`,
              }
            : null,
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={
            accent ?? '#2563EB'
          }
        />
      </View>

      <Text
        style={
          styles.metricValue
        }
      >
        {value}
      </Text>

      <Text
        style={
          styles.metricLabel
        }
      >
        {label}
      </Text>
    </View>
  );
}

// ============================================================
// ESTILOS
// ============================================================

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  container: {
    flex: 1,
    paddingHorizontal: 16,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 18,
  },

  headerTextContainer: {
    flex: 1,
    paddingRight: 12,
  },

  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
    letterSpacing: 1,
    marginBottom: 4,
  },

  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
  },

  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: '#64748B',
    marginTop: 4,
  },

  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },

  logoutButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },

  logoutButtonDisabled: {
    opacity: 0.65,
  },

  disabledControl: {
    opacity: 0.6,
  },

  metricsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },

  metricCard: {
    flex: 1,
    minHeight: 106,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  metricIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    marginBottom: 7,
  },

  metricValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },

  metricLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 48,
  },

  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    marginLeft: 8,
    paddingVertical: 10,
  },

  filtersWrapper: {
    marginTop: 10,
    marginHorizontal: -16,
  },

  filtersContent: {
    paddingHorizontal: 16,
    gap: 8,
  },

  filterButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },

  filterButtonActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },

  filterButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },

  filterButtonTextActive: {
    color: '#FFFFFF',
  },

  supervisorInstallationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 15,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },

  supervisorCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  supervisorCardTitleContainer: {
    flex: 1,
    paddingRight: 10,
  },

  supervisorCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },

  supervisorCardAddress: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },

  supervisorStatusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
  },

  supervisorStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },

  supervisorCardInfo: {
    marginTop: 14,
    gap: 8,
  },

  supervisorInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  supervisorInfoText: {
    flex: 1,
    fontSize: 13,
    color: '#475569',
    marginLeft: 8,
  },

  supervisorCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },

  supervisorViewText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
    marginRight: 4,
  },

  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },

  errorTextContainer: {
    flex: 1,
    marginLeft: 9,
    marginRight: 8,
  },

  errorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#991B1B',
  },

  errorText: {
    fontSize: 12,
    color: '#B91C1C',
    marginTop: 2,
  },

  retryButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#DC2626',
  },

  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },

  listTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },

  listCountContainer: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E8F0',
  },

  listCount: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },

  listContent: {
    paddingBottom: 30,
  },

  emptyListContent: {
    flexGrow: 1,
  },

  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingBottom: 80,
  },

  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },

  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
  },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#64748B',
  },

  logoutOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor:
      'rgba(15, 23, 42, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },

  logoutOverlayCard: {
    width: 230,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  logoutOverlayTitle: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },

  logoutOverlayText: {
    marginTop: 5,
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
});