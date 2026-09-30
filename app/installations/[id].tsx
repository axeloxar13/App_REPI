// app/installations/[id].tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Image,
  Linking,
  Alert,
  FlatList,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons, Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { StatusChip } from '../../components/admin/StatusChip';
import { StatusChangeDialog } from '../../components/admin/StatusChangeDialog';
import { formatDate, formatDateTime } from '../../lib/date';
import { useInstallationActions } from '../../hooks/useInstallationActions';
import { useInstallationActivity } from '../../hooks/useInstallationActivity';
import { useInstallationHandoff } from '../../hooks/useInstallationHandoff';
import { fetchInstallationByIdAdmin } from '../../hooks/useInstallations';
import type { InstallationItem, InstallationWithClient, InstallationStatus } from '../../types/database';

const { width } = Dimensions.get('window');
const PHOTO_SIZE = (width - spacing.lg * 2 - spacing.sm * 2) / 3;

type TabType =
  | 'info'
  | 'equipment'
  | 'photos'
  | 'activity'
  | 'notes'
  | 'handoff';

type Equipment = {
  id: string;
  serial_number: string;
  brand: string;
  model: string;
  status: string;
  created_at: string;
};

type PhotoWithUrl = {
  id: string;
  url: string;
  category: string;
  created_at: string;
  latitud: number | null;
  longitud: number | null;
  tiene_ubicacion: boolean;
  uploader_name_snapshot: string | null;
  comment: string | null;
};

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function InstallationDetailScreen() {
  const { id, itemId } = useLocalSearchParams<{ id: string; itemId?: string }>();
  const { status, user, selectedMembership } = useAuth();
  const supabaseClient = supabase;

  const isAdmin = selectedMembership?.role === 'admin';
  const isTechnician = selectedMembership?.role === 'technician';

  const [installation, setInstallation] = useState<InstallationWithClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isItemSelectorOpen, setIsItemSelectorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('info');
  const [statusDialogVisible, setStatusDialogVisible] = useState(false);

  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [photos, setPhotos] = useState<PhotoWithUrl[]>([]);

  type InstallationNote = {
    id: string;
    note_type:
      | 'visit_anticipada'
      | 'nota_traslado'
      | 'observacion'
      | 'nota'
      | 'levantamiento';
    content: string;
    created_at: string;
    technician_user_id: string;
  };

  const [notes, setNotes] = useState<InstallationNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);

  const [loadingEquipment, setLoadingEquipment] = useState(false);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [loadingMorePhotos, setLoadingMorePhotos] = useState(false);
  const [photosHasMore, setPhotosHasMore] = useState(true);
  const [photosPage, setPhotosPage] = useState(0);
  const [photosTotal, setPhotosTotal] = useState(0);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoWithUrl | null>(null);
  const [downloadingPhoto, setDownloadingPhoto] = useState(false);

  const handleDownloadPhoto = useCallback(async () => {
    if (!selectedPhoto?.url || downloadingPhoto) return;

    try {
      setDownloadingPhoto(true);

      const extension = selectedPhoto.url.toLowerCase().includes('.png')
        ? 'png'
        : selectedPhoto.url.toLowerCase().includes('.webp')
          ? 'webp'
          : 'jpg';

      const fileName = `foto-${selectedPhoto.id}.${extension}`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

      const downloadResult = await FileSystem.downloadAsync(
        selectedPhoto.url,
        fileUri
      );

      if (downloadResult.status !== 200) {
        throw new Error('No se pudo descargar la fotografía.');
      }

      const canShare = await Sharing.isAvailableAsync();

      if (canShare) {
        await Sharing.shareAsync(downloadResult.uri, {
          mimeType: extension === 'png'
            ? 'image/png'
            : extension === 'webp'
              ? 'image/webp'
              : 'image/jpeg',
          dialogTitle: 'Guardar fotografía',
          UTI: extension === 'png'
            ? 'public.png'
            : extension === 'webp'
              ? 'org.webmproject.webp'
              : 'public.jpeg',
        });
      } else {
        Alert.alert(
          'Fotografía descargada',
          'La fotografía se descargó correctamente, pero este dispositivo no permite abrir el menú para guardarla.'
        );
      }
    } catch (error) {
      console.error('Error descargando fotografía:', error);
      Alert.alert(
        'Error',
        'No se pudo descargar la fotografía. Inténtalo nuevamente.'
      );
    } finally {
      setDownloadingPhoto(false);
    }
  }, [selectedPhoto, downloadingPhoto]);

  const PHOTOS_PAGE_SIZE = 30;

  const {
    startInstallation,
    clearMessage: clearActionMessage,
    isStarting,
    isCompleting,
    message: actionMessage,
    isError: isActionError,
  } = useInstallationActions();

  const {
    activities,
    isLoading: isActivityLoading,
    error: activityError,
    refresh: refreshActivity,
  } = useInstallationActivity(
    installation?.organizationId ?? null,
    installation?.id ?? null,
    selectedItem?.id ?? null,
  );

  const {
    latestHandoff,
    isLoading: isHandoffLoading,
    error: handoffError,
  } = useInstallationHandoff(
    installation?.organizationId ?? null,
    installation?.id ?? null,
    selectedItem?.id ?? null,
  );

  const getUnitLabel = useCallback((item: InstallationItem) => {
    if (item.itemRole === 'primary') return 'Instalación principal';
    const index = installation?.items.filter((i) => i.itemRole === 'partition').indexOf(item) ?? 0;
    return `Partición ${index + 1}`;
  }, [installation]);

  const getPrimaryItem = useCallback((items: InstallationItem[]) => {
    return items.find((item) => item.itemRole === 'primary') ?? items[0] ?? null;
  }, []);

  function buildItemInstallation(installation: InstallationWithClient, item: InstallationItem) {
    return {
      ...installation,
      installationType: item.serviceType || installation.installationType,
      assignedDate: item.assignedDate ?? installation.assignedDate,
      startDate: item.startDate,
      startedAt: item.startedAt,
      estimatedCompletionDate: item.estimatedCompletionDate ?? installation.estimatedCompletionDate,
      completedAt: item.completedAt,
      status: item.status,
      observations: item.observations,
    };
  }

  const installationItems = installation?.items ?? [];
  const primaryItem = getPrimaryItem(installationItems);
  const selectedItem = installationItems.find((item) => item.id === selectedItemId) ?? primaryItem ?? null;
  const activeInstallation = installation && selectedItem ? buildItemInstallation(installation, selectedItem) : installation;

  const loadInstallation = useCallback(async () => {
    if (!id || !selectedMembership) {
      setLoading(false);
      return;
    }

    if (!selectedMembership.isActive) {
      setInstallation(null);
      setError('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await fetchInstallationByIdAdmin(
      id,
      selectedMembership.organizationId
    );

    if (result.error) {
      setError(result.error);
      setInstallation(null);
    } else {
      setInstallation(result.data);
    }

    setLoading(false);
  }, [id, selectedMembership]);

  const loadEquipment = useCallback(async () => {
    if (!installation?.id) return;
    try {
      setLoadingEquipment(true);
      const { data, error } = await supabaseClient
        .from('installation_equipment')
        .select('*')
        .eq('installation_id', installation.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEquipment(data || []);
    } catch (error) {
      console.error('Error loading equipment:', error);
    } finally {
      setLoadingEquipment(false);
    }
  }, [installation?.id, supabaseClient]);

  const loadNotes = useCallback(async () => {
    if (!installation?.id) {
      setNotes([]);
      return;
    }

    try {
      setLoadingNotes(true);

      const { data, error } = await supabaseClient
        .from('installation_notes')
        .select(`
          id,
          note_type,
          content,
          created_at,
          technician_user_id
        `)
        .eq('installation_id', installation.id)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      setNotes((data ?? []) as InstallationNote[]);
    } catch (error) {
      console.error('Error loading installation notes:', error);
      setNotes([]);
    } finally {
      setLoadingNotes(false);
    }
  }, [installation?.id, supabaseClient]);

  const loadPhotos = useCallback(
    async (options?: { reset?: boolean }) => {
      if (!installation?.id) {
        return;
      }

      const reset = options?.reset ?? true;

      if (!reset && (loadingMorePhotos || !photosHasMore)) {
        return;
      }

      try {
        if (reset) {
          setLoadingPhotos(true);
          setPhotos([]);
          setPhotosPage(0);
          setPhotosHasMore(true);
        } else {
          setLoadingMorePhotos(true);
        }

        const page = reset ? 0 : photosPage + 1;
        const from = page * PHOTOS_PAGE_SIZE;
        const to = from + PHOTOS_PAGE_SIZE - 1;

        const { count, error: countError } = await supabaseClient
          .from('installation_photos')
          .select('id', { count: 'exact', head: true })
          .eq('installation_id', installation.id);

        if (countError) {
          throw countError;
        }

        setPhotosTotal(count ?? 0);

        const { data, error } = await supabaseClient
          .from('installation_photos')
          .select(`
            id,
            category,
            created_at,
            storage_path,
            latitud,
            longitud,
            tiene_ubicacion,
            uploader_name_snapshot,
            comment
          `)
          .eq('installation_id', installation.id)
          .order('created_at', { ascending: false })
          .range(from, to);

        if (error) {
          throw error;
        }

        const rows = data ?? [];
        const BATCH_SIZE = 5;
        const photosWithUrls: PhotoWithUrl[] = [];

        for (let index = 0; index < rows.length; index += BATCH_SIZE) {
          const batch = rows.slice(index, index + BATCH_SIZE);

          const batchResults = await Promise.all(
            batch.map(async (photo) => {
              let url = '';

              if (photo.storage_path) {
                try {
                  const { data: urlData, error: urlError } = await supabaseClient.storage
                    .from('installation-photos')
                    .createSignedUrl(photo.storage_path, 3600);

                  if (!urlError && urlData?.signedUrl) {
                    url = urlData.signedUrl;
                  }
                } catch (error) {
                  console.warn(
                    '[installation-photos] Error obteniendo URL firmada:',
                    error,
                  );
                }
              }

              return {
                id: photo.id,
                url,
                category: photo.category ?? 'Sin categoría',
                created_at: photo.created_at,
                latitud: photo.latitud ?? null,
                longitud: photo.longitud ?? null,
                tiene_ubicacion:
                  photo.latitud !== null &&
                  photo.latitud !== undefined &&
                  photo.longitud !== null &&
                  photo.longitud !== undefined,
                uploader_name_snapshot: photo.uploader_name_snapshot ?? null,
                comment: photo.comment ?? null,
              };
            }),
          );

          photosWithUrls.push(...batchResults);
        }

        setPhotos((current) => {
          if (reset) {
            return photosWithUrls;
          }

          const existingIds = new Set(current.map((photo) => photo.id));
          const newPhotos = photosWithUrls.filter(
            (photo) => !existingIds.has(photo.id),
          );

          return [...current, ...newPhotos];
        });

        setPhotosPage(page);

        const currentLoadedCount = reset
          ? photosWithUrls.length
          : photos.length + photosWithUrls.length;

        setPhotosHasMore(
          rows.length === PHOTOS_PAGE_SIZE &&
            currentLoadedCount < (count ?? 0),
        );
      } catch (error) {
        console.error(
          '[installation-photos] Error loading photos:',
          error,
        );
      } finally {
        setLoadingPhotos(false);
        setLoadingMorePhotos(false);
      }
    },
    [
      installation?.id,
      loadingMorePhotos,
      photosHasMore,
      photosPage,
      photos.length,
      supabaseClient,
    ],
  );

  useEffect(() => {
    loadInstallation();
  }, [loadInstallation]);

  useEffect(() => {
    if (installation) {
      loadEquipment();
      loadNotes();
    }
  }, [installation?.id, loadEquipment, loadNotes]);

  useEffect(() => {
    if (!installation) {
      setSelectedItemId(null);
      return;
    }

    const requestedItem = itemId ? installation.items.find((item) => item.id === itemId) : null;
    const currentItemStillExists = installation.items.some((item) => item.id === selectedItemId);

    if (requestedItem && selectedItemId !== requestedItem.id) {
      setSelectedItemId(requestedItem.id);
      return;
    }

    if (!currentItemStillExists) {
      setSelectedItemId(getPrimaryItem(installation.items)?.id ?? null);
    }
  }, [installation, itemId, selectedItemId, getPrimaryItem]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);

    const tasks: Promise<unknown>[] = [
      loadInstallation(),
      loadEquipment(),
      loadNotes(),
    ];

    if (activeTab === 'photos') {
      tasks.push(loadPhotos({ reset: true }));
    }

    Promise.all(tasks).finally(() => {
      setRefreshing(false);
    });
  }, [activeTab, loadInstallation, loadEquipment, loadNotes, loadPhotos]);

  const openMap = async (latitude: number, longitude: number) => {
    try {
      const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'No se puede abrir el mapa');
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo abrir la ubicación');
    }
  };

  const handleApproveHandoff = async (handoffId: string) => {
    Alert.alert(
      'Aprobar entrega',
      '¿Confirmas que la entrega es correcta?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aprobar',
          onPress: async () => {
            try {
              const { error } = await supabaseClient.rpc('admin_approve_installation_handoff', {
                p_organization_id: selectedMembership?.organizationId,
                p_handoff_id: handoffId,
              });
              if (error) throw error;
              Alert.alert('Éxito', 'Entrega aprobada');
              handleRefresh();
            } catch (err) {
              Alert.alert('Error', (err as Error).message);
            }
          },
        },
      ]
    );
  };

  const handleRejectHandoff = async (handoffId: string) => {
    Alert.alert(
      'Rechazar entrega',
      '¿Estás seguro de rechazar esta entrega?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Rechazar',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabaseClient.rpc('admin_reject_installation_handoff', {
                p_organization_id: selectedMembership?.organizationId,
                p_handoff_id: handoffId,
                p_rejection_reason: 'Rechazado por administrador',
              });
              if (error) throw error;
              Alert.alert('Éxito', 'Entrega rechazada');
              handleRefresh();
            } catch (err) {
              Alert.alert('Error', (err as Error).message);
            }
          },
        },
      ]
    );
  };

  async function handleStartInstallation() {
    if (!installation || !selectedItem || isStarting || isCompleting) return;
    clearActionMessage();

    Alert.alert(
      'Iniciar unidad',
      `Iniciar "${getUnitLabel(selectedItem)} - ${selectedItem.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Iniciar',
          onPress: async () => {
            const result = await startInstallation(installation.id, selectedItem.id);
            if (result?.ok) {
              setInstallation(result.installation);
              await refreshActivity();
              loadEquipment();
              if (activeTab === 'photos') {
                loadPhotos({ reset: true });
              }
            }
          },
        },
      ]
    );
  }

  async function handleCompleteInstallation() {
    if (!installation || !selectedItem || isStarting || isCompleting) return;
    clearActionMessage();
    router.push({
      pathname: '/installations/[id]/handoff',
      params: { id: installation.id, itemId: selectedItem.id },
    });
  }

  const handleStatusChange = () => {
    if (!selectedItem) return;
    setStatusDialogVisible(true);
  };

  const handleDeleteInstallation = async () => {
    if (!installation) return;

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
              const { error: deleteError } = await supabaseClient
                .from('installations')
                .delete()
                .eq('id', installation.id)
                .eq(
                  'organization_id',
                  selectedMembership?.organizationId
                );

              if (deleteError) {
                throw deleteError;
              }

              Alert.alert(
                '¡Eliminada!',
                'La instalación ha sido eliminada correctamente.',
                [
                  {
                    text: 'OK',
                    onPress: () => router.push('/installations'),
                  },
                ]
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

  if (status === 'checking' || loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerScreen}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Cargando instalación...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !installation) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerScreen}>
          <Text style={styles.errorText}>Error al cargar la instalación</Text>
          <Text style={styles.errorDetail}>{error || 'No encontrada'}</Text>
          <Pressable style={styles.retryButton} onPress={loadInstallation}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  function getAllowedStatuses(currentStatus: InstallationStatus): InstallationStatus[] {
    const transitions: Record<InstallationStatus, InstallationStatus[]> = {
      pending: ['in_progress'],
      in_progress: ['in_review'],
      in_review: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };
    return transitions[currentStatus] || [];
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <Stack.Screen
        options={{
          title: installation.projectName || 'Instalación',
          headerShown: true,
          headerBackTitle: 'Volver',
        }}
      />

      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.projectName}>{installation.projectName || 'Instalación'}</Text>
            <StatusChip status={selectedItem?.status || installation.status} />
          </View>
          <Text style={styles.address}>{installation.address}</Text>
          <Text style={styles.clientName}>👤 {installation.client?.name || 'Sin cliente'}</Text>

          {isAdmin && (
            <View style={styles.adminActionsRow}>
              <Pressable
                style={[styles.adminActionButton, styles.adminEditButton]}
                onPress={() =>
                  router.push({
                    pathname: '/installations/[id]/edit',
                    params: { id: installation.id },
                  })
                }
              >
                <Ionicons name="create-outline" size={18} color={colors.primary} />
                <Text style={styles.adminEditText}>Editar</Text>
              </Pressable>

              <Pressable
                style={[styles.adminActionButton, styles.adminDeleteButton]}
                onPress={handleDeleteInstallation}
              >
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
                <Text style={styles.adminDeleteText}>Eliminar</Text>
              </Pressable>
            </View>
          )}

          {installationItems.length > 1 && selectedItem && (
            <Pressable style={styles.unitSelector} onPress={() => setIsItemSelectorOpen(true)}>
              <Text style={styles.unitSelectorLabel}>📦 {getUnitLabel(selectedItem)}</Text>
              <Text style={styles.unitSelectorArrow}>▼</Text>
            </Pressable>
          )}
        </View>

        {/* TABS */}
        <View style={styles.tabsContainer}>
          <TabButton label="Info" active={activeTab === 'info'} onPress={() => setActiveTab('info')} />

          <TabButton
            label="Equipos"
            active={activeTab === 'equipment'}
            onPress={() => setActiveTab('equipment')}
          />

          <TabButton
            label="Fotos"
            active={activeTab === 'photos'}
            onPress={() => {
              setActiveTab('photos');

              if (photos.length === 0 && !loadingPhotos) {
                loadPhotos({ reset: true });
              }
            }}
          />

          <TabButton
            label="Notas"
            active={activeTab === 'notes'}
            onPress={() => {
              setActiveTab('notes');
              loadNotes();
            }}
          />

          <TabButton
            label="Entrega"
            active={activeTab === 'handoff'}
            onPress={() => setActiveTab('handoff')}
          />
        </View>

        {/* TAB CONTENT */}
        <View style={styles.tabContent}>
          {activeTab === 'info' && (
            <InfoTab 
              installation={installation} 
              selectedItem={selectedItem}
              activeInstallation={activeInstallation}
              equipmentCount={equipment.length}
              photosCount={photos.length}
            />
          )}
          {activeTab === 'equipment' && (
            <EquipmentTab 
              equipment={equipment} 
              loading={loadingEquipment} 
              onRefresh={loadEquipment}
            />
          )}
          {activeTab === 'photos' && (
            <PhotosTab
              photos={photos}
              loading={loadingPhotos}
              loadingMore={loadingMorePhotos}
              hasMore={photosHasMore}
              total={photosTotal}
              onRefresh={loadPhotos}
              onLoadMore={() => loadPhotos({ reset: false })}
              onOpenMap={openMap}
              onOpenPhoto={setSelectedPhoto}
            />
          )}
          {activeTab === 'notes' && (
            <NotesTab
              notes={notes}
              loading={loadingNotes}
              technicianName={installation.technician?.full_name || 'Técnico no disponible'}
              onRefresh={loadNotes}
            />
          )}
          {activeTab === 'activity' && (
            <ActivityTab activities={activities || []} loading={isActivityLoading} />
          )}
          {activeTab === 'handoff' && (
            <HandoffTab
              handoff={latestHandoff}
              loading={isHandoffLoading}
              onApprove={handleApproveHandoff}
              onReject={handleRejectHandoff}
              isAdmin={isAdmin}
            />
          )}
        </View>

        {/* SELECTOR DE UNIDAD */}
        <Modal visible={isItemSelectorOpen} transparent animationType="fade" onRequestClose={() => setIsItemSelectorOpen(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setIsItemSelectorOpen(false)}>
            <View style={styles.selectorSheet}>
              <Text style={styles.selectorTitle}>Seleccionar unidad</Text>
              {installationItems.map((item) => (
                <Pressable
                  key={item.id}
                  style={[styles.itemChip, item.id === selectedItem?.id && styles.itemChipActive]}
                  onPress={() => { setSelectedItemId(item.id); setIsItemSelectorOpen(false); }}
                >
                  <View style={styles.itemChipContent}>
                    <Text style={styles.itemChipLabel}>{getUnitLabel(item)}</Text>
                    <Text style={styles.itemChipText}>{item.name || item.serviceType}</Text>
                    <Text style={styles.itemChipMeta}>{item.serviceType} - {item.specificLocation}</Text>
                  </View>
                  <StatusChip status={item.status} />
                </Pressable>
              ))}
              <Pressable style={styles.modalCloseButton} onPress={() => setIsItemSelectorOpen(false)}>
                <Text style={styles.modalCloseButtonText}>Cerrar</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        {/* DIÁLOGO DE CAMBIO DE ESTADO */}
        {selectedItem && (
          <StatusChangeDialog
            visible={statusDialogVisible}
            installationId={installation.id}
            installationItemId={selectedItem.id}
            targetLabel={getUnitLabel(selectedItem)}
            currentStatus={selectedItem.status}
            allowedStatuses={getAllowedStatuses(selectedItem.status)}
            onClose={() => setStatusDialogVisible(false)}
            onSuccess={handleRefresh}
          />
        )}

        {/* VISOR DE FOTOGRAFÍA */}
        <Modal
          visible={!!selectedPhoto}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedPhoto(null)}
        >
          <View style={styles.photoViewerOverlay}>
            <Pressable
              style={styles.photoViewerCloseArea}
              onPress={() => setSelectedPhoto(null)}
            />

            <View style={styles.photoViewerContainer}>
              <View style={styles.photoViewerHeader}>
                <View style={styles.photoViewerHeaderText}>
                  <Text style={styles.photoViewerTitle}>
                    {selectedPhoto?.category || 'Fotografía'}
                  </Text>
                  {selectedPhoto?.created_at && (
                    <Text style={styles.photoViewerDate}>
                      {formatDateTime(selectedPhoto.created_at)}
                    </Text>
                  )}
                </View>

                <Pressable
                  style={styles.photoViewerCloseButton}
                  onPress={() => setSelectedPhoto(null)}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={24} color="#fff" />
                </Pressable>
              </View>

              <View style={styles.photoViewerImageContainer}>
                {selectedPhoto?.url ? (
                  <Image
                    source={{ uri: selectedPhoto.url }}
                    style={styles.photoViewerImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.photoViewerNoImage}>
                    <Ionicons name="image-outline" size={56} color="#94A3B8" />
                    <Text style={styles.photoViewerNoImageText}>
                      No se pudo cargar la fotografía
                    </Text>
                  </View>
                )}
              </View>

              {selectedPhoto?.url && (
                <Pressable
                  style={styles.photoViewerDownloadButton}
                  onPress={handleDownloadPhoto}
                  disabled={downloadingPhoto}
                >
                  {downloadingPhoto ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="download-outline" size={19} color="#fff" />
                  )}
                  <Text style={styles.photoViewerDownloadButtonText}>
                    {downloadingPhoto ? 'Descargando...' : 'Descargar foto'}
                  </Text>
                </Pressable>
              )}

              {selectedPhoto?.tiene_ubicacion && (
                <Pressable
                  style={styles.photoViewerMapButton}
                  onPress={() => {
                    setSelectedPhoto(null);
                    openMap(selectedPhoto.latitud!, selectedPhoto.longitud!);
                  }}
                >
                  <Ionicons name="location-outline" size={18} color="#fff" />
                  <Text style={styles.photoViewerMapButtonText}>
                    Ver ubicación
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================================
// SUBCOMPONENTES
// ============================================================

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function InfoTab({ installation, selectedItem, activeInstallation, equipmentCount, photosCount }: any) {
  return (
    <View style={styles.tabContentContainer}>
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{equipmentCount}</Text>
          <Text style={styles.statLabel}>Equipos</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{photosCount}</Text>
          <Text style={styles.statLabel}>Fotos</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>
            {installation.items.filter((i: any) => i.status === 'completed').length}
          </Text>
          <Text style={styles.statLabel}>Completadas</Text>
        </View>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoCardTitle}>📋 Información general</Text>
        <InfoRow label="Cliente" value={installation.client?.name || 'Sin cliente'} />
        <InfoRow label="Dirección" value={installation.address || 'Sin dirección'} />
        <InfoRow label="Técnico" value={installation.technician?.full_name || 'Sin asignar'} />
        <InfoRow label="Fecha asignación" value={formatDate(activeInstallation?.assignedDate)} />
        <InfoRow label="Estado" value={activeInstallation?.status || 'No definido'} />
      </View>

      {selectedItem && (
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>📦 Unidad seleccionada</Text>
          <InfoRow label="Nombre" value={selectedItem.name || 'Sin nombre'} />
          <InfoRow label="Servicio" value={selectedItem.serviceType || 'No especificado'} />
          <InfoRow label="Ubicación" value={selectedItem.specificLocation || 'No especificada'} />
          <InfoRow label="Estado" value={selectedItem.status || 'No definido'} />
          {selectedItem.observations && (
            <View style={styles.observationsContainer}>
              <Text style={styles.observationsLabel}>Observaciones</Text>
              <Text style={styles.observationsText}>{selectedItem.observations}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function EquipmentTab({ equipment, loading, onRefresh }: any) {
  if (loading) {
    return (
      <View style={styles.tabContentContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (equipment.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="hardware-chip-outline" size={48} color={colors.muted} />
        <Text style={styles.emptyText}>No hay equipos registrados</Text>
        <Text style={styles.emptySubText}>Los técnicos registrarán equipos aquí</Text>
      </View>
    );
  }

  return (
    <View style={styles.tabContentContainer}>
      {equipment.map((item: any) => (
        <View key={item.id} style={styles.equipmentCard}>
          <View style={styles.equipmentHeader}>
            <Text style={styles.equipmentSerial}>🔢 {item.serial_number || 'N/A'}</Text>
            <StatusChip status={item.status || 'pending'} />
          </View>
          <View style={styles.equipmentDetails}>
            {item.brand && <Text style={styles.equipmentDetail}>🏷️ {item.brand}</Text>}
            {item.model && <Text style={styles.equipmentDetail}>📱 {item.model}</Text>}
          </View>
          <Text style={styles.equipmentDate}>
            Registrado: {formatDateTime(item.created_at)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function PhotosTab({
  photos,
  loading,
  loadingMore,
  hasMore,
  total,
  onRefresh,
  onLoadMore,
  onOpenMap,
  onOpenPhoto,
}: any) {
  if (loading) {
    return (
      <View style={styles.tabContentContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.photosLoadingText}>
          Cargando fotografías...
        </Text>
      </View>
    );
  }

  if (photos.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="camera-outline" size={48} color={colors.muted} />
        <Text style={styles.emptyText}>No hay fotos</Text>
        <Text style={styles.emptySubText}>Los técnicos subirán fotos aquí</Text>
        <Pressable
          style={styles.photosRefreshButtonEmpty}
          onPress={() => onRefresh({ reset: true })}
        >
          <Ionicons name="refresh-outline" size={18} color={colors.primary} />
          <Text style={styles.loadMorePhotosText}>Actualizar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.tabContentContainer}>
      <View style={styles.photosHeader}>
        <View style={styles.photosHeaderText}>
          <Text style={styles.photosTitle}>Fotografías</Text>
          <Text style={styles.photosSubtitle}>
            Mostrando {photos.length}{total > 0 ? ` de ${total}` : ''} fotos
          </Text>
        </View>

        <Pressable
          style={styles.photosRefreshButton}
          onPress={() => onRefresh({ reset: true })}
          disabled={loadingMore}
        >
          <Ionicons name="refresh-outline" size={20} color={colors.primary} />
        </Pressable>
      </View>

      <View style={styles.photosGrid}>
        {photos.map((photo: any) => (
          <Pressable
            key={photo.id}
            style={styles.photoItem}
            onPress={() => onOpenPhoto(photo)}
          >
            {photo.url ? (
              <Image
                source={{ uri: photo.url }}
                style={styles.photoImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="image-outline" size={24} color={colors.muted} />
              </View>
            )}

            <View style={styles.photoOverlay}>
              <Text style={styles.photoCategory} numberOfLines={1}>
                {photo.category || 'Sin categoría'}
              </Text>

              {photo.tiene_ubicacion && (
                <Pressable
                  style={styles.photoLocationBadge}
                  onPress={(event) => {
                    event.stopPropagation();
                    onOpenMap(photo.latitud, photo.longitud);
                  }}
                >
                  <Ionicons name="location" size={12} color="#4CAF50" />
                </Pressable>
              )}
            </View>

            {photo.tiene_ubicacion && (
              <Pressable
                style={styles.photoLocationChip}
                onPress={(event) => {
                  event.stopPropagation();
                  onOpenMap(photo.latitud, photo.longitud);
                }}
              >
                <Ionicons name="map-outline" size={12} color="#fff" />
                <Text style={styles.photoLocationChipText}>📍</Text>
              </Pressable>
            )}
          </Pressable>
        ))}
      </View>

      {hasMore ? (
        <Pressable
          style={styles.loadMorePhotosButton}
          onPress={onLoadMore}
          disabled={loadingMore}
        >
          {loadingMore ? (
            <>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadMorePhotosText}>
                Cargando más fotos...
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
              <Text style={styles.loadMorePhotosText}>
                Cargar más fotos
              </Text>
            </>
          )}
        </Pressable>
      ) : (
        <Text style={styles.photosCount}>
          {photos.length} {photos.length === 1 ? 'foto' : 'fotos'} cargadas
        </Text>
      )}
    </View>
  );
}

function NotesTab({
  notes,
  loading,
  technicianName,
  onRefresh,
}: {
  notes: InstallationNote[];
  loading: boolean;
  technicianName: string;
  onRefresh: () => void;
}) {
  const getNoteTypeLabel = (type: InstallationNote['note_type']) => {
    switch (type) {
      case 'visit_anticipada':
        return 'Visita anticipada';

      case 'nota_traslado':
        return 'Nota de traslado';

      case 'observacion':
        return 'Observación';

      case 'nota':
        return 'Nota';

      case 'levantamiento':
        return 'Levantamiento';

      default:
        return 'Nota';
    }
  };

  const getNoteTypeIcon = (
    type: InstallationNote['note_type'],
  ): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'visit_anticipada':
        return 'location-outline';

      case 'nota_traslado':
        return 'car-outline';

      case 'observacion':
        return 'eye-outline';

      case 'levantamiento':
        return 'clipboard-outline';

      case 'nota':
      default:
        return 'create-outline';
    }
  };

  if (loading) {
    return (
      <View style={styles.tabContentContainer}>
        <ActivityIndicator size="small" color={colors.primary} />

        <Text style={styles.notesLoadingText}>
          Cargando notas...
        </Text>
      </View>
    );
  }

  if (notes.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons
          name="document-text-outline"
          size={48}
          color={colors.muted}
        />

        <Text style={styles.emptyText}>
          No hay notas
        </Text>

        <Text style={styles.emptySubText}>
          El técnico todavía no ha registrado apuntes para esta instalación.
        </Text>

        <Pressable
          style={styles.notesRefreshButton}
          onPress={onRefresh}
        >
          <Ionicons
            name="refresh-outline"
            size={18}
            color={colors.primary}
          />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.tabContentContainer}>
      <View style={styles.notesHeader}>
        <View style={styles.notesHeaderText}>
          <Text style={styles.notesTitle}>
            Notas de la instalación
          </Text>

          <Text style={styles.notesSubtitle}>
            {notes.length}{' '}
            {notes.length === 1 ? 'apunte registrado' : 'apuntes registrados'}
          </Text>
        </View>

        <Pressable
          style={styles.notesRefreshButton}
          onPress={onRefresh}
          disabled={loading}
        >
          <Ionicons
            name="refresh-outline"
            size={20}
            color={colors.primary}
          />
        </Pressable>
      </View>

      {notes.map((note) => (
        <View key={note.id} style={styles.noteAdminCard}>
          <View style={styles.noteAdminHeader}>
            <View style={styles.noteAdminType}>
              <View style={styles.noteAdminIcon}>
                <Ionicons
                  name={getNoteTypeIcon(note.note_type)}
                  size={20}
                  color={colors.primary}
                />
              </View>

              <View style={styles.noteAdminTypeText}>
                <Text style={styles.noteAdminTypeLabel}>
                  {getNoteTypeLabel(note.note_type)}
                </Text>

                <Text style={styles.noteAdminTechnician}>
                  👤 {technicianName}
                </Text>
              </View>
            </View>

            <Text style={styles.noteAdminDate}>
              {formatDateTime(note.created_at)}
            </Text>
          </View>

          <View style={styles.noteAdminContent}>
            <Text style={styles.noteAdminContentText}>
              {note.content}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function ActivityTab({ activities, loading }: any) {
  if (loading) {
    return (
      <View style={styles.tabContentContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (activities.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="time-outline" size={48} color={colors.muted} />
        <Text style={styles.emptyText}>No hay actividad</Text>
        <Text style={styles.emptySubText}>La actividad aparecerá aquí</Text>
      </View>
    );
  }

  return (
    <View style={styles.tabContentContainer}>
      {activities.map((activity: any) => (
        <View key={activity.id} style={styles.activityItem}>
          <View style={styles.activityHeader}>
            <Text style={styles.activityType}>{activity.activity_type || 'Actividad'}</Text>
            <Text style={styles.activityTime}>{formatDateTime(activity.created_at)}</Text>
          </View>
          <Text style={styles.activityActor}>👤 {activity.actor_name_snapshot || 'Actor no registrado'}</Text>
          {activity.details && (
            <Text style={styles.activityDetails}>{activity.details}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

function HandoffTab({ handoff, loading, onApprove, onReject, isAdmin }: any) {
  if (loading) {
    return (
      <View style={styles.tabContentContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (!handoff) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="document-text-outline" size={48} color={colors.muted} />
        <Text style={styles.emptyText}>No hay entregas</Text>
        <Text style={styles.emptySubText}>Las entregas aparecerán aquí</Text>
      </View>
    );
  }

  return (
    <View style={styles.tabContentContainer}>
      <View style={styles.handoffCard}>
        <View style={styles.handoffHeader}>
          <Text style={styles.handoffTitle}>📄 Entrega</Text>
          <StatusChip status={handoff.status || 'submitted'} />
        </View>
        <InfoRow label="Técnico" value={handoff.technicianNameSnapshot || 'No disponible'} />
        <InfoRow label="Recibe" value={handoff.recipientName || 'No especificado'} />
        <InfoRow label="Fecha" value={formatDateTime(handoff.submittedAt)} />
        {handoff.status === 'submitted' && isAdmin && (
          <View style={styles.handoffActionsRow}>
            <Pressable style={[styles.actionButton, styles.actionButtonSuccess]} onPress={() => onApprove(handoff.id)}>
              <Text style={styles.actionButtonText}>✅ Aprobar</Text>
            </Pressable>
            <Pressable style={[styles.actionButton, styles.actionButtonDanger]} onPress={() => onReject(handoff.id)}>
              <Text style={styles.actionButtonText}>❌ Rechazar</Text>
            </Pressable>
          </View>
        )}
        {handoff.status === 'submitted' && !isAdmin && (
          <Text style={styles.handoffWaitingText}>⏳ Esperando revisión del administrador</Text>
        )}
        {handoff.status === 'approved' && (
          <Text style={styles.handoffApprovedText}>✅ Entrega aprobada</Text>
        )}
        {handoff.status === 'rejected' && (
          <Text style={styles.handoffRejectedText}>❌ Entrega rechazada</Text>
        )}
      </View>
    </View>
  );
}

// ============================================================
// ESTILOS
// ============================================================

const styles = StyleSheet.create({
  safeArea: { 
    flex: 1, 
    backgroundColor: '#F8FAFC' 
  },
  centerScreen: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center', 
    backgroundColor: '#F8FAFC', 
    padding: spacing.lg 
  },
  loadingText: { 
    marginTop: spacing.md, 
    color: colors.muted, 
    fontSize: 16 
  },
  container: { 
    flex: 1, 
    padding: spacing.lg 
  },
  errorText: { 
    fontSize: 18, 
    fontWeight: '600', 
    color: '#ef4444', 
    marginBottom: spacing.xs 
  },
  errorDetail: { 
    color: colors.muted, 
    textAlign: 'center', 
    marginBottom: spacing.md 
  },
  retryButton: { 
    backgroundColor: colors.primary, 
    paddingHorizontal: spacing.lg, 
    paddingVertical: spacing.sm, 
    borderRadius: radius.sm 
  },
  retryText: { 
    color: 'white', 
    fontWeight: '600' 
  },
  header: { 
    marginBottom: spacing.md 
  },
  headerTop: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: spacing.xs 
  },
  projectName: { 
    fontSize: 22, 
    fontWeight: '700', 
    color: '#1E293B', 
    flex: 1, 
    marginRight: spacing.sm 
  },
  address: { 
    fontSize: 14, 
    color: colors.muted, 
    marginBottom: 2 
  },
  clientName: { 
    fontSize: 14, 
    color: colors.text, 
    fontWeight: '500',
    marginBottom: 4 
  },
  adminActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  adminActionButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  adminEditButton: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  adminDeleteButton: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  adminEditText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  adminDeleteText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
  unitSelector: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    backgroundColor: '#fff', 
    padding: spacing.sm, 
    borderRadius: radius.sm, 
    borderWidth: 1, 
    borderColor: colors.border, 
    marginTop: spacing.xs 
  },
  unitSelectorLabel: { 
    fontSize: 14, 
    color: colors.text, 
    fontWeight: '500' 
  },
  unitSelectorArrow: { 
    fontSize: 12, 
    color: colors.muted 
  },
  tabsContainer: { 
    flexDirection: 'row', 
    borderBottomWidth: 1, 
    borderBottomColor: colors.border, 
    marginBottom: spacing.md 
  },
  tab: { 
    flex: 1, 
    paddingVertical: spacing.sm, 
    alignItems: 'center' 
  },
  tabActive: { 
    borderBottomWidth: 2, 
    borderBottomColor: colors.primary 
  },
  tabText: { 
    fontSize: 12, 
    color: colors.muted, 
    fontWeight: '600' 
  },
  tabTextActive: { 
    color: colors.primary 
  },
  tabContent: { 
    paddingBottom: spacing.xl 
  },
  tabContentContainer: { 
    gap: spacing.sm 
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  infoCard: {
    backgroundColor: '#fff',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  infoCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  infoLabel: {
    fontSize: 13,
    color: colors.muted,
  },
  infoValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
    textAlign: 'right',
    flex: 1,
    marginLeft: spacing.md,
  },
  observationsContainer: {
    marginTop: 4,
  },
  observationsLabel: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 2,
  },
  observationsText: {
    fontSize: 14,
    color: colors.text,
  },
  equipmentCard: {
    backgroundColor: '#fff',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  equipmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  equipmentSerial: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  equipmentDetails: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: 4,
  },
  equipmentDetail: {
    fontSize: 13,
    color: colors.muted,
  },
  equipmentDate: {
    fontSize: 11,
    color: colors.muted,
  },
  photosLoadingText: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: colors.muted,
  },
  photosHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  photosHeaderText: {
    flex: 1,
  },
  photosTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  photosSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  photosRefreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photosRefreshButtonEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadMorePhotosButton: {
    minHeight: 46,
    marginTop: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  loadMorePhotosText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  photoViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  photoViewerCloseArea: {
    ...StyleSheet.absoluteFillObject,
  },
  photoViewerContainer: {
    width: '100%',
    maxWidth: 700,
    backgroundColor: '#0F172A',
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  photoViewerHeader: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  photoViewerHeaderText: {
    flex: 1,
    marginRight: spacing.sm,
  },
  photoViewerTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  photoViewerDate: {
    color: '#CBD5E1',
    fontSize: 11,
    marginTop: 2,
  },
  photoViewerCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoViewerImageContainer: {
    width: '100%',
    height: Math.min(width * 1.15, 620),
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoViewerImage: {
    width: '100%',
    height: '100%',
  },
  photoViewerNoImage: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  photoViewerNoImageText: {
    color: '#CBD5E1',
    fontSize: 13,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  photoViewerDownloadButton: {
    minHeight: 44,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  photoViewerDownloadButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  photoViewerMapButton: {
    minHeight: 44,
    margin: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  photoViewerMapButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  photoItem: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  photoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  photoCategory: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  photoLocationBadge: {
    padding: 2,
  },
  photoLocationChip: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  photoLocationChipText: {
    color: '#fff',
    fontSize: 10,
  },
  photosCount: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.muted,
    marginTop: spacing.md,
  },
  emptySubText: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
    textAlign: 'center',
  },
  activityItem: {
    backgroundColor: '#fff',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  activityType: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  activityTime: {
    fontSize: 11,
    color: colors.muted,
  },
  activityActor: {
    fontSize: 13,
    color: colors.muted,
  },
  activityDetails: {
    fontSize: 13,
    color: colors.text,
    marginTop: 2,
  },
  handoffCard: {
    backgroundColor: '#fff',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  handoffHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  handoffTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  handoffActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  handoffWaitingText: {
    fontSize: 13,
    color: '#F59E0B',
    textAlign: 'center',
    padding: spacing.sm,
  },
  handoffApprovedText: {
    fontSize: 13,
    color: '#10B981',
    textAlign: 'center',
    padding: spacing.sm,
  },
  handoffRejectedText: {
    fontSize: 13,
    color: '#EF4444',
    textAlign: 'center',
    padding: spacing.sm,
  },
  actionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    flex: 1,
  },
  actionButtonSuccess: {
    backgroundColor: '#10B981',
  },
  actionButtonDanger: {
    backgroundColor: '#EF4444',
  },
  actionButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  selectorSheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '70%',
  },
  selectorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  itemChip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  itemChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  itemChipContent: {
    flex: 1,
    gap: 2,
  },
  itemChipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  itemChipText: {
    fontSize: 14,
    color: colors.text,
  },
  itemChipMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  modalCloseButton: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCloseButtonText: {
    color: colors.text,
    fontWeight: '600',
  },
  notesLoadingText: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: colors.muted,
  },

  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },

  notesHeaderText: {
    flex: 1,
  },

  notesTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },

  notesSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },

  notesRefreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
  },

  noteAdminCard: {
    backgroundColor: '#fff',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },

  noteAdminHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },

  noteAdminType: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },

  noteAdminIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },

  noteAdminTypeText: {
    flex: 1,
  },

  noteAdminTypeLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },

  noteAdminTechnician: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },

  noteAdminDate: {
    fontSize: 11,
    color: colors.muted,
    textAlign: 'right',
  },

  noteAdminContent: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: spacing.sm,
  },

  noteAdminContentText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text,
  },
});