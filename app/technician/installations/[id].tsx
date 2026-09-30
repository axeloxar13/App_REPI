// app/technician/installations/[id].tsx
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { ChevronIcon } from '../../../components/ChevronIcon';
import { EmptyState } from '../../../components/EmptyState';
import { InstallationActionCard } from '../../../components/InstallationActionCard';
import { InstallationActivityList } from '../../../components/InstallationActivityList';
import { InstallationHandoffCard } from '../../../components/InstallationHandoffCard';
import { InstallationLocationSection } from '../../../components/InstallationLocationSection';
import { InstallationStatusBadge } from '../../../components/InstallationStatusBadge';
import { LoadingState } from '../../../components/LoadingState';
import { PhotoEvidenceSection } from '../../../components/photos/PhotoEvidenceSection';
import { TechnicalInfoSection } from '../../../components/TechnicalInfoSection';
import { InstallationNotesSection } from '../../../components/InstallationNotesSection';
import { colors, radius, spacing } from '../../../constants/theme';
import { useAuth } from '../../../context/AuthContext';
import { formatDate, formatDateTime } from '../../../lib/date';
import { useInstallationActions } from '../../../hooks/useInstallationActions';
import { useInstallationActivity } from '../../../hooks/useInstallationActivity';
import { useInstallationHandoff } from '../../../hooks/useInstallationHandoff';
import { fetchInstallationById } from '../../../hooks/useInstallations';
import type { InstallationItem, InstallationWithClient } from '../../../types/database';

type DetailRowProps = {
  label: string;
  value: string | null;
};

function DetailRow({ label, value }: DetailRowProps) {
  if (!value) {
    return null;
  }

  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

type DetailSectionProps = {
  title: string;
  children: ReactNode;
};

function DetailSection({ title, children }: DetailSectionProps) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function buildItemInstallation(
  installation: InstallationWithClient,
  item: InstallationItem,
): InstallationWithClient {
  return {
    ...installation,
    installationType: item.serviceType,
    assignedDate: item.assignedDate ?? installation.assignedDate,
    startDate: item.startDate,
    startedAt: item.startedAt,
    estimatedCompletionDate:
      item.estimatedCompletionDate ?? installation.estimatedCompletionDate,
    completedAt: item.completedAt,
    status: item.status,
    observations: item.observations,
  };
}

function getPrimaryItem(items: InstallationItem[]) {
  return items.find((item) => item.itemRole === 'primary') ?? items[0] ?? null;
}

function getUnitLabel(item: InstallationItem) {
  if (item.itemRole === 'primary') {
    return 'Instalación principal';
  }

  return `Partición ${Math.max(1, item.position - 1)}`;
}

async function openAddressInMaps(address: string | null | undefined) {
  if (!address?.trim()) {
    return;
  }

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address.trim(),
  )}`;

  try {
    const supported = await Linking.canOpenURL(mapsUrl);

    if (!supported) {
      Alert.alert(
        'No se pudo abrir Maps',
        'No hay una aplicación o navegador disponible para abrir la ubicación.',
      );
      return;
    }

    await Linking.openURL(mapsUrl);
  } catch {
    Alert.alert(
      'No se pudo abrir Maps',
      'Ocurrió un problema al intentar abrir la dirección.',
    );
  }
}

export default function TechnicianInstallationDetailScreen() {
  const { id, itemId } = useLocalSearchParams<{ id: string; itemId?: string }>();
  const { status, user, selectedMembership } = useAuth();
  const [installation, setInstallation] = useState<InstallationWithClient | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isItemSelectorOpen, setIsItemSelectorOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const installationItems = installation?.items ?? [];
  const primaryItem = getPrimaryItem(installationItems);
  const selectedItem =
    installationItems.find((item) => item.id === selectedItemId) ??
    primaryItem ??
    null;
  const partitionCount = installationItems.filter((item) => item.itemRole === 'partition').length;
  const activeInstallation =
    installation && selectedItem ? buildItemInstallation(installation, selectedItem) : installation;
  const completedItemCount = installationItems.filter(
    (item) => item.status === 'completed',
  ).length;

  // Bloquea la captura técnica, fotografías y evidencias hasta iniciar.
  const isInstallationStarted =
    selectedItem?.status === 'in_progress' ||
    Boolean(selectedItem?.startedAt);

  // 🔥 VERIFICAR SI LA INSTALACIÓN ESTÁ COMPLETADA
  const isCompleted = activeInstallation?.status === 'completed' || 
                      activeInstallation?.status === 'in_review';

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

  const {
    startInstallation,
    clearMessage: clearActionMessage,
    isStarting,
    isCompleting,
    message: actionMessage,
    isError: isActionError,
  } = useInstallationActions();

  const loadInstallation = useCallback(async () => {
    if (!id || !selectedMembership) {
      return;
    }

    if (!selectedMembership.isActive) {
      setInstallation(null);
      setError('');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');

    const result = await fetchInstallationById(id, selectedMembership);

    if (result.error) {
      setError(result.error);
      setInstallation(null);
    } else {
      setInstallation(result.data);
    }

    setIsLoading(false);
  }, [id, selectedMembership]);

  useEffect(() => {
    loadInstallation();
  }, [loadInstallation]);

  useEffect(() => {
    if (!installation) {
      setSelectedItemId(null);
      return;
    }

    const requestedItem = itemId
      ? installation.items.find((item) => item.id === itemId)
      : null;
    const currentItemStillExists = installation.items.some(
      (item) => item.id === selectedItemId,
    );

    if (requestedItem && selectedItemId !== requestedItem.id) {
      setSelectedItemId(requestedItem.id);
      return;
    }

    if (!currentItemStillExists) {
      setSelectedItemId(getPrimaryItem(installation.items)?.id ?? null);
    }
  }, [installation, itemId, selectedItemId]);

  async function handleStartInstallation() {
    if (!installation || !selectedItem || isStarting || isCompleting) {
      return;
    }

    clearActionMessage();

    Alert.alert(
      'Iniciar unidad',
      `Iniciar "${getUnitLabel(selectedItem)} - ${selectedItem.name}"? El estado de las demás unidades no cambiará.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Iniciar',
          onPress: async () => {
            const result = await startInstallation(installation.id, selectedItem.id);

            if (result?.ok) {
              setInstallation(result.installation);
              await refreshActivity();
            }
          },
        },
      ],
    );
  }

  async function handleCompleteInstallation() {
    if (!installation || !selectedItem || isStarting || isCompleting) {
      return;
    }

    clearActionMessage();
    router.push({
      pathname: '/installations/[id]/handoff',
      params: { id: installation.id, itemId: selectedItem.id },
    });
  }

  // 🔥 NAVEGAR AL REPORTE
  const handleGenerateReport = () => {
    router.push(`/installations/${installation?.id}/report`);
  };

  if (status === 'checking') {
    return (
      <View style={styles.centerScreen}>
        <StatusBar style="dark" />
        <LoadingState text="Cargando instalación" />
      </View>
    );
  }

  if (status !== 'authenticated' || !user) {
    return <Redirect href="/login" />;
  }

  if (!selectedMembership) {
    return <Redirect href="/select-company" />;
  }

  if (!selectedMembership.isActive) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.replace('/home')}
            accessibilityRole="button"
            hitSlop={8}
          >
            <ChevronIcon direction="left" size={18} color={colors.primary} />
            <Text style={styles.backText}>Mis instalaciones</Text>
          </Pressable>
          <EmptyState
            title="Acceso desactivado"
            description="Tu acceso a esta empresa está desactivado. Contacta al administrador"
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          hitSlop={8}
        >
          <ChevronIcon direction="left" size={18} color={colors.primary} />
          <Text style={styles.backText}>Volver</Text>
        </Pressable>

        {isLoading ? (
          <LoadingState text="Cargando instalación" />
        ) : error ? (
          <EmptyState
            title="No pudimos cargar la instalación"
            description={error}
            actionLabel="Reintentar"
            onAction={loadInstallation}
          />
        ) : installation && activeInstallation ? (
          <View style={styles.detailStack}>
            <View style={styles.headingCard}>
              <Text style={styles.title}>{installation.projectName}</Text>
              <InstallationStatusBadge status={activeInstallation.status} />
              {installationItems.length > 1 ? (
                <Text style={styles.itemProgress}>
                  {completedItemCount} de {installationItems.length} completadas
                </Text>
              ) : null}
            </View>

            <DetailSection title="Información general">
              <DetailRow label="Cliente" value={installation.client.name} />
              <DetailRow label="Dirección" value={installation.address} />

              {installation.address ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.mapsButton,
                    pressed && styles.mapsButtonPressed,
                  ]}
                  onPress={() => openAddressInMaps(installation.address)}
                  accessibilityRole="button"
                  accessibilityLabel="Abrir dirección en Google Maps"
                >
                  <Ionicons name="map-outline" size={20} color={colors.primary} />
                  <Text style={styles.mapsButtonText}>Abrir en Maps</Text>
                  <Ionicons
                    name="open-outline"
                    size={18}
                    color={colors.primary}
                  />
                </Pressable>
              ) : null}

              
              <DetailRow label="Tipo" value={activeInstallation.installationType} />
              <DetailRow
                label="Tipo de trabajo"
                value={selectedItem?.workType === 'maintenance' ? 'Mantenimiento' : 'Instalación'}
              />
              <DetailRow
                label="Ubicación o área"
                value={selectedItem?.specificLocation ?? null}
              />
              {partitionCount > 0 ? (
                <Pressable
                  style={styles.partitionButton}
                  onPress={() => setIsItemSelectorOpen(true)}
                  accessibilityRole="button"
                >
                  <Text style={styles.partitionButtonText}>
                    Particiones ({partitionCount})
                  </Text>
                </Pressable>
              ) : null}
            </DetailSection>

            <DetailSection title="Fechas">
              <DetailRow
                label="Fecha asignada"
                value={formatDate(activeInstallation.assignedDate)}
              />
              <DetailRow
                label="Fecha de inicio"
                value={formatDate(activeInstallation.startDate)}
              />
              <DetailRow
                label="Fecha y hora de inicio"
                value={activeInstallation.startedAt ? formatDateTime(activeInstallation.startedAt) : null}
              />
              <DetailRow
                label="Fecha de termnino"
                value={formatDate(activeInstallation.estimatedCompletionDate)}
              />
              <DetailRow
                label="Fecha y hora de finalización"
                value={activeInstallation.completedAt ? formatDateTime(activeInstallation.completedAt) : null}
              />
            </DetailSection>

            {selectedItem ? (
              <InstallationLocationSection
                installationId={installation.id}
                item={selectedItem}
                onRegistered={async () => {
                  await loadInstallation();
                  await refreshActivity();
                }}
              />
            ) : null}

            {activeInstallation.observations ? (
              <DetailSection title="Observaciones">
                <Text style={styles.observations}>{activeInstallation.observations}</Text>
              </DetailSection>
            ) : null}

            <InstallationNotesSection
              organizationId={installation.organizationId}
              installationId={installation.id}
              technicianUserId={user.id}
              technicianMembershipId={installation.technicianMembershipId}
            />

            {selectedItem ? (
              isInstallationStarted ? (
                <TechnicalInfoSection
                  organizationId={installation.organizationId}
                  installationId={installation.id}
                  item={selectedItem}
                />
              ) : null
            ) : null}

            <InstallationActionCard
              installation={activeInstallation}
              isStarting={isStarting}
              isCompleting={isCompleting}
              message={actionMessage}
              isError={isActionError}
              onStart={handleStartInstallation}
              onComplete={handleCompleteInstallation}
            />

            <Pressable
              style={[
                styles.photoCollectionButton,
                !isInstallationStarted && styles.photoCollectionButtonDisabled,
              ]}
              disabled={!isInstallationStarted}
              onPress={() => {
                if (!isInstallationStarted) {
                  Alert.alert(
                    'Instalación no iniciada',
                    'Primero debes pulsar "Iniciar instalación" para poder recabar fotografías.',
                  );
                  return;
                }

                router.push({
                  pathname: '/technician/installations/photo-collection',
                  params: {
                    id: installation.id,
                  },
                });
              }}
              accessibilityRole="button"
              accessibilityState={{ disabled: !isInstallationStarted }}
            >
              <View style={styles.photoCollectionIcon}>
                <Ionicons
                  name="images-outline"
                  size={24}
                  color={colors.primary}
                />
              </View>

              <View style={styles.photoCollectionContent}>
                <Text style={styles.photoCollectionTitle}>
                  Recabar fotografías
                </Text>

                <Text style={styles.photoCollectionDescription}>
                  Recaba fotografías de la instalación y sus elementos.
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.primary}
              />
            </Pressable>

            {/* 🔥 BOTÓN DE REPORTE - SOLO CUANDO LA INSTALACIÓN ESTÁ COMPLETADA */}
            {isCompleted && (
              <Pressable
                style={styles.reportButton}
                onPress={handleGenerateReport}
                accessibilityRole="button"
              >
                <Ionicons name="document-text-outline" size={22} color="#fff" />
                <Text style={styles.reportButtonText}>Generar Reporte</Text>
                <Ionicons name="chevron-forward" size={18} color="#fff" style={styles.reportButtonArrow} />
              </Pressable>
            )}

            {isHandoffLoading ? null : latestHandoff ? (
              <InstallationHandoffCard handoff={latestHandoff} />
            ) : handoffError ? (
              <DetailSection title="Entrega y conformidad">
                <Text style={styles.observations}>{handoffError}</Text>
              </DetailSection>
            ) : null}

            <InstallationActivityList
              activities={activities}
              isLoading={isActivityLoading}
              error={activityError}
            />

            {isInstallationStarted ? (
              <PhotoEvidenceSection
                organizationId={installation.organizationId}
                installationId={installation.id}
                installationItemId={selectedItem?.id ?? null}
                technicianId={user.id}
                technicianMembershipId={installation.technicianMembershipId}
                status={activeInstallation.status}
              />
            ) : null}

            <Modal
              visible={isItemSelectorOpen}
              transparent
              animationType="fade"
              onRequestClose={() => setIsItemSelectorOpen(false)}
            >
              <Pressable
                style={styles.modalOverlay}
                onPress={() => setIsItemSelectorOpen(false)}
              >
                <Pressable style={styles.selectorSheet}>
                  <Text style={styles.selectorTitle}>Seleccionar unidad</Text>
                  <View style={styles.itemSelector}>
                    {installationItems.map((item) => {
                      const isSelected = item.id === selectedItem?.id;

                      return (
                        <Pressable
                          key={item.id}
                          style={[
                            styles.itemChip,
                            isSelected ? styles.itemChipActive : null,
                          ]}
                          onPress={() => {
                            setSelectedItemId(item.id);
                            setIsItemSelectorOpen(false);
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                        >
                          <View style={styles.itemChipContent}>
                            <Text
                              style={[
                                styles.itemChipLabel,
                                isSelected ? styles.itemChipTextActive : null,
                              ]}
                            >
                              {getUnitLabel(item)}
                            </Text>
                            <Text
                              style={[
                                styles.itemChipText,
                                isSelected ? styles.itemChipTextActive : null,
                              ]}
                            >
                              {item.name || item.serviceType}
                            </Text>
                            <Text style={styles.itemChipMeta}>
                              {item.serviceType} - {item.specificLocation}
                            </Text>
                          </View>
                          <InstallationStatusBadge status={item.status} />
                        </Pressable>
                      );
                    })}
                  </View>
                </Pressable>
              </Pressable>
            </Modal>
          </View>
        ) : (
          <EmptyState
            title="Instalación no disponible"
            description="No existe o no está asignada a tu usuario."
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerScreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  backButton: {
    minHeight: 44,
    alignSelf: 'flex-start',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingRight: spacing.sm,
    paddingVertical: spacing.xs,
  },
  backText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  detailStack: {
    gap: spacing.md,
  },
  headingCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#e4edf7',
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    shadowColor: '#12355f',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
  },
  itemProgress: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  partitionButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  partitionButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20, 32, 51, 0.42)',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  selectorSheet: {
    maxHeight: '76%',
    gap: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  selectorTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  itemSelector: {
    gap: spacing.sm,
  },
  itemChip: {
    minHeight: 66,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexDirection: 'row',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  itemChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  itemChipContent: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  itemChipLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  itemChipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  itemChipTextActive: {
    color: colors.primary,
  },
  itemChipMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  sectionCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#e4edf7',
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.md,
    shadowColor: '#12355f',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 7,
    elevation: 1,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
  },
  sectionBody: {
    gap: spacing.sm,
  },
  detailRow: {
    gap: 1,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  detailValue: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  mapsButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  mapsButtonPressed: {
    opacity: 0.7,
  },
  mapsButtonText: {
    flex: 1,
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
  },
  observations: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  photoCollectionButton: {
  minHeight: 78,
  flexDirection: 'row',
  alignItems: 'center',
  gap: spacing.sm,
  borderWidth: 1,
  borderColor: '#bfdbfe',
  borderRadius: radius.md,
  backgroundColor: colors.primarySoft,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
},

photoCollectionButtonDisabled: {
  opacity: 0.45,
},

photoCollectionIcon: {
  width: 46,
  height: 46,
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: radius.sm,
  backgroundColor: colors.background,
},

photoCollectionContent: {
  flex: 1,
  gap: 3,
},

photoCollectionTitle: {
  color: colors.text,
  fontSize: 16,
  fontWeight: '800',
  lineHeight: 21,
},

photoCollectionDescription: {
  color: colors.muted,
  fontSize: 12,
  lineHeight: 17,
},
  // 🔥 ESTILOS DEL BOTÓN DE REPORTE
  reportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF6',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    marginVertical: spacing.xs,
    gap: spacing.sm,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  reportButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  reportButtonArrow: {
    marginLeft: 'auto',
  },
});