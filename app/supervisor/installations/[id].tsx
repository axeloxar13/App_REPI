import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import {
  useLocalSearchParams,
  useRouter,
} from 'expo-router';

import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../context/AuthContext';

type InstallationStatus =
  | 'pending'
  | 'in_progress'
  | 'in_review'
  | 'completed'
  | 'cancelled';

const STATUS_LABELS: Record<
  InstallationStatus,
  string
> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  in_review: 'En revisión',
  completed: 'Completada',
  cancelled: 'Cancelada',
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

type InstallationItem = {
  id: string;
  status?: string | null;
  [key: string]: any;
};

type InstallationEquipment = {
  id: string;
  organizationId: string;
  installationId: string;
  installationItemId: string | null;
  technicalRecordId: string | null;
  serviceCategoryId: string | null;
  equipmentType: string;
  serialNumber: string | null;
  brand: string | null;
  model: string | null;
  observations: string | null;
  detectedValue: string | null;
  confirmedValue: string | null;
  captureMethod: string | null;
  technicianUserId: string | null;
  technicianMembershipId: string | null;
  technicianName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type InstallationData = {
  id: string;
  projectName: string;
  status: InstallationStatus;
  address: string;
  assignedDate: string | null;
  installationType: string | null;

  client: {
    id: string;
    name: string;
  } | null;

  technician: {
    id: string;
    fullName: string;
  } | null;

  items: InstallationItem[];
  equipment: InstallationEquipment[];
};

// ============================================================
// HELPERS
// ============================================================

function getStatusLabel(
  status: string | null | undefined,
) {
  if (
    status &&
    status in STATUS_LABELS
  ) {
    return STATUS_LABELS[
      status as InstallationStatus
    ];
  }

  return status || 'Sin estado';
}

function displayValue(
  value: string | null | undefined,
) {
  const normalized =
    typeof value === 'string'
      ? value.trim()
      : '';

  return normalized || 'No registrado';
}

function getCaptureMethodLabel(
  method: string | null,
) {
  switch (method) {
    case 'manual':
      return 'Manual';

    case 'qr':
      return 'QR';

    case 'barcode':
      return 'Código de barras';

    case 'ocr':
      return 'OCR';

    case 'photo':
      return 'Fotografía';

    default:
      return method || 'No especificado';
  }
}

function formatDate(
  value: string | null,
) {
  if (!value) {
    return 'Sin fecha';
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return 'Sin fecha';
  }

  return date.toLocaleDateString(
    'es-MX',
    {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    },
  );
}

// ============================================================
// PANTALLA PRINCIPAL
// ============================================================

export default function SupervisorInstallationDetail() {
  const router = useRouter();

  const params =
    useLocalSearchParams<{
      id: string;
    }>();

  const {
    selectedMembership,
  } = useAuth();

  const installationId =
    Array.isArray(params.id)
      ? params.id[0]
      : params.id;

  const [installation, setInstallation] =
    useState<InstallationData | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  // ==========================================================
  // CARGAR DETALLE
  // ==========================================================

  const loadInstallation =
    useCallback(async () => {
      if (!installationId) {
        setError(
          'No se recibió el ID de la instalación.',
        );
        setLoading(false);
        return;
      }

      const organizationId =
        selectedMembership?.organizationId;

      if (!organizationId) {
        setError(
          'No se encontró la organización activa.',
        );
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // ----------------------------------------------------
        // 1. INSTALACIÓN
        // ----------------------------------------------------

        const {
          data: installationRow,
          error: installationError,
        } = await supabase
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
            'id',
            installationId,
          )
          .eq(
            'organization_id',
            organizationId,
          )
          .maybeSingle();

        if (installationError) {
          throw installationError;
        }

        if (!installationRow) {
          setError(
            'No se encontró la instalación.',
          );
          setInstallation(null);
          return;
        }

        // ----------------------------------------------------
        // 2. CLIENTE Y TÉCNICO ASIGNADO
        // ----------------------------------------------------

        const [
          clientResult,
          technicianResult,
        ] = await Promise.all([
          installationRow.client_id
            ? supabase
                .from('clients')
                .select(
                  'id, name',
                )
                .eq(
                  'id',
                  installationRow.client_id,
                )
                .eq(
                  'organization_id',
                  organizationId,
                )
                .maybeSingle()
            : Promise.resolve({
                data: null,
                error: null,
              }),

          installationRow
            .technician_membership_id
            ? supabase
                .from(
                  'organization_memberships',
                )
                .select(
                  'id, full_name',
                )
                .eq(
                  'id',
                  installationRow.technician_membership_id,
                )
                .eq(
                  'organization_id',
                  organizationId,
                )
                .maybeSingle()
            : Promise.resolve({
                data: null,
                error: null,
              }),
        ]);

        if (clientResult.error) {
          throw clientResult.error;
        }

        if (technicianResult.error) {
          throw technicianResult.error;
        }

        // ----------------------------------------------------
        // 3. UNIDADES
        //
        // SOLO se utilizan para el avance.
        // No representan el equipo físico.
        // ----------------------------------------------------

        const {
          data: itemsData,
          error: itemsError,
        } = await supabase
          .from('installation_items')
          .select('*')
          .eq(
            'installation_id',
            installationId,
          )
          .eq(
            'organization_id',
            organizationId,
          );

        if (itemsError) {
          console.warn(
            '[SupervisorInstallationDetail] No se pudieron cargar las unidades:',
            itemsError,
          );
        }

        // ----------------------------------------------------
        // 4. EQUIPO FÍSICO REAL
        // ----------------------------------------------------

        const {
          data: equipmentData,
          error: equipmentError,
        } = await supabase
          .from('installation_equipment')
          .select(`
            id,
            organization_id,
            installation_id,
            installation_item_id,
            technical_record_id,
            service_category_id,
            equipment_type,
            serial_number,
            brand,
            model,
            observations,
            detected_value,
            confirmed_value,
            capture_method,
            technician_user_id,
            technician_membership_id,
            created_at,
            updated_at
          `)
          .eq(
            'installation_id',
            installationId,
          )
          .eq(
            'organization_id',
            organizationId,
          )
          .order(
            'created_at',
            {
              ascending: false,
            },
          );

        if (equipmentError) {
          throw equipmentError;
        }

        // ----------------------------------------------------
        // 5. TÉCNICOS QUE REGISTRARON LOS EQUIPOS
        // ----------------------------------------------------

        const equipmentTechnicianIds = [
          ...new Set(
            (equipmentData ?? [])
              .map(
                (equipment) =>
                  equipment.technician_membership_id,
              )
              .filter(
                (
                  id,
                ): id is string =>
                  Boolean(id),
              ),
          ),
        ];

        let equipmentTechnicians: Array<{
          id: string;
          full_name: string | null;
        }> = [];

        if (
          equipmentTechnicianIds.length >
          0
        ) {
          const {
            data,
            error:
              equipmentTechniciansError,
          } = await supabase
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
              equipmentTechnicianIds,
            );

          if (
            equipmentTechniciansError
          ) {
            throw equipmentTechniciansError;
          }

          equipmentTechnicians =
            data ?? [];
        }

        const technicianMap =
          new Map<
            string,
            string
          >();

        equipmentTechnicians.forEach(
          (technician) => {
            technicianMap.set(
              technician.id,
              technician.full_name ||
                'Sin nombre',
            );
          },
        );

        // ----------------------------------------------------
        // 6. MAPEAR EQUIPO
        // ----------------------------------------------------

        const mappedEquipment: InstallationEquipment[] =
          (
            equipmentData ?? []
          ).map(
            (equipment) => ({
              id: equipment.id,

              organizationId:
                equipment.organization_id,

              installationId:
                equipment.installation_id,

              installationItemId:
                equipment.installation_item_id ??
                null,

              technicalRecordId:
                equipment.technical_record_id ??
                null,

              serviceCategoryId:
                equipment.service_category_id ??
                null,

              equipmentType:
                equipment.equipment_type ||
                'Equipo',

              serialNumber:
                equipment.serial_number ??
                null,

              brand:
                equipment.brand ??
                null,

              model:
                equipment.model ??
                null,

              observations:
                equipment.observations ??
                null,

              detectedValue:
                equipment.detected_value ??
                null,

              confirmedValue:
                equipment.confirmed_value ??
                null,

              captureMethod:
                equipment.capture_method ??
                null,

              technicianUserId:
                equipment.technician_user_id ??
                null,

              technicianMembershipId:
                equipment.technician_membership_id ??
                null,

              technicianName:
                equipment.technician_membership_id
                  ? technicianMap.get(
                      equipment.technician_membership_id,
                    ) ?? null
                  : null,

              createdAt:
                equipment.created_at ??
                null,

              updatedAt:
                equipment.updated_at ??
                null,
            }),
          );

        // ----------------------------------------------------
        // 7. OBJETO FINAL
        // ----------------------------------------------------

        const mappedInstallation: InstallationData =
          {
            id:
              installationRow.id,

            projectName:
              installationRow.project_name ??
              'Sin nombre',

            status:
              installationRow.status ??
              'pending',

            address:
              installationRow.address ??
              '',

            assignedDate:
              installationRow.assigned_date ??
              null,

            installationType:
              installationRow.installation_type ??
              null,

            client:
              clientResult.data
                ? {
                    id:
                      clientResult.data
                        .id,

                    name:
                      clientResult.data
                        .name,
                  }
                : null,

            technician:
              technicianResult.data
                ? {
                    id:
                      technicianResult
                        .data.id,

                    fullName:
                      technicianResult
                        .data
                        .full_name ||
                      'Sin nombre',
                  }
                : null,

            items:
              (itemsData ??
                []) as InstallationItem[],

            equipment:
              mappedEquipment,
          };

        setInstallation(
          mappedInstallation,
        );
      } catch (err: any) {
        console.error(
          '[SupervisorInstallationDetail] Error:',
          err,
        );

        setError(
          err?.message ||
            'No fue posible cargar la instalación.',
        );
      } finally {
        setLoading(false);
      }
    }, [
      installationId,
      selectedMembership?.organizationId,
    ]);

  useEffect(() => {
    loadInstallation();
  }, [loadInstallation]);

  // ==========================================================
  // LOADING
  // ==========================================================

  if (loading) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <View
          style={styles.centered}
        >
          <ActivityIndicator
            size="large"
            color="#2563EB"
          />

          <Text
            style={
              styles.loadingText
            }
          >
            Cargando instalación...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ==========================================================
  // ERROR
  // ==========================================================

  if (
    error ||
    !installation
  ) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <View
          style={styles.centered}
        >
          <View
            style={styles.errorIcon}
          >
            <Ionicons
              name="alert-circle-outline"
              size={34}
              color="#DC2626"
            />
          </View>

          <Text
            style={
              styles.errorTitle
            }
          >
            No se pudo cargar la
            instalación
          </Text>

          <Text
            style={
              styles.errorText
            }
          >
            {error ||
              'Instalación no encontrada.'}
          </Text>

          <Pressable
            style={
              styles.retryButton
            }
            onPress={
              loadInstallation
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

          <Pressable
            style={
              styles.backButton
            }
            onPress={() =>
              router.back()
            }
          >
            <Text
              style={
                styles.backButtonText
              }
            >
              Volver
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ==========================================================
  // DATOS CALCULADOS
  // ==========================================================

  const status =
    installation.status;

  const statusColor =
    STATUS_COLORS[status] ??
    '#64748B';

  const items =
    installation.items ?? [];

  const equipment =
    installation.equipment ?? [];

  const totalItems =
    items.length;

  const completedItems =
    items.filter(
      (item) =>
        item.status ===
        'completed',
    ).length;

  const clientName =
    installation.client?.name ||
    'Sin cliente';

  const technicianName =
    installation.technician
      ?.fullName ||
    'Sin técnico asignado';

  const installationType =
    installation.installationType ||
    'No especificado';

  const assignedDate =
    formatDate(
      installation.assignedDate,
    );

  const progress =
    totalItems > 0
      ? Math.min(
          100,
          Math.round(
            (completedItems /
              totalItems) *
              100,
          ),
        )
      : 0;

  return (
    <SafeAreaView
      style={styles.safeArea}
    >
      <View
        style={styles.container}
      >
        {/* ================================================== */}
        {/* HEADER */}
        {/* ================================================== */}

        <View
          style={styles.header}
        >
          <Pressable
            style={
              styles.headerBackButton
            }
            onPress={() =>
              router.back()
            }
          >
            <Ionicons
              name="arrow-back"
              size={23}
              color="#0F172A"
            />
          </Pressable>

          <View
            style={
              styles.headerTitleContainer
            }
          >
            <Text
              style={
                styles.headerEyebrow
              }
            >
              SUPERVISOR
            </Text>

            <Text
              style={
                styles.headerTitle
              }
            >
              Detalle
            </Text>
          </View>

          <View
            style={
              styles.headerIcon
            }
          >
            <Ionicons
              name="eye-outline"
              size={22}
              color="#2563EB"
            />
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={
            false
          }
          contentContainerStyle={
            styles.content
          }
        >
          {/* ================================================= */}
          {/* INSTALACIÓN */}
          {/* ================================================= */}

          <View
            style={
              styles.titleSection
            }
          >
            <View
              style={styles.titleRow}
            >
              <View
                style={
                  styles.titleContainer
                }
              >
                <Text
                  style={
                    styles.projectTitle
                  }
                >
                  {
                    installation.projectName
                  }
                </Text>

                <Text
                  style={
                    styles.address
                  }
                >
                  {
                    installation.address ||
                    'Sin dirección'
                  }
                </Text>
              </View>

              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor:
                      `${statusColor}18`,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    {
                      color:
                        statusColor,
                    },
                  ]}
                >
                  {getStatusLabel(
                    status,
                  )}
                </Text>
              </View>
            </View>
          </View>

          {/* ================================================= */}
          {/* INFORMACIÓN GENERAL */}
          {/* ================================================= */}

          <SectionTitle
            icon="information-circle-outline"
            title="Información general"
          />

          <View
            style={styles.card}
          >
            <InfoRow
              icon="person-outline"
              label="Cliente"
              value={
                clientName
              }
            />

            <InfoRow
              icon="construct-outline"
              label="Técnico asignado"
              value={
                technicianName
              }
            />

            <InfoRow
              icon="settings-outline"
              label="Tipo de instalación"
              value={
                installationType
              }
            />

            <InfoRow
              icon="calendar-outline"
              label="Fecha asignada"
              value={
                assignedDate
              }
            />

            <InfoRow
              icon="location-outline"
              label="Dirección"
              value={
                installation.address ||
                'Sin dirección'
              }
              last
            />
          </View>

          {/* ================================================= */}
          {/* AVANCE */}
          {/* ================================================= */}

          <SectionTitle
            icon="layers-outline"
            title="Avance"
          />

          <View
            style={styles.card}
          >
            <View
              style={
                styles.progressHeader
              }
            >
              <Text
                style={
                  styles.progressTitle
                }
              >
                Unidades
              </Text>

              <Text
                style={
                  styles.progressCount
                }
              >
                {completedItems} /{' '}
                {totalItems}
              </Text>
            </View>

            <View
              style={
                styles.progressBarBackground
              }
            >
              <View
                style={[
                  styles.progressBar,
                  {
                    width: `${progress}%`,
                  },
                ]}
              />
            </View>

            <Text
              style={
                styles.progressDescription
              }
            >
              {totalItems > 0
                ? `${completedItems} de ${totalItems} unidades completadas`
                : 'No hay unidades registradas.'}
            </Text>
          </View>

          {/* ================================================= */}
          {/* EQUIPO FÍSICO */}
          {/* ================================================= */}

          <SectionTitle
            icon="hardware-chip-outline"
            title="Equipo"
          />

          <View
            style={styles.card}
          >
            <View
              style={
                styles.equipmentSummary
              }
            >
              <View
                style={
                  styles.equipmentSummaryIcon
                }
              >
                <Ionicons
                  name="hardware-chip-outline"
                  size={23}
                  color="#2563EB"
                />
              </View>

              <View
                style={
                  styles.equipmentSummaryContent
                }
              >
                <Text
                  style={
                    styles.equipmentSummaryTitle
                  }
                >
                  Equipo registrado
                </Text>

                <Text
                  style={
                    styles.equipmentSummaryDescription
                  }
                >
                  {equipment.length ===
                  1
                    ? '1 equipo físico registrado en esta instalación.'
                    : `${equipment.length} equipos físicos registrados en esta instalación.`}
                </Text>
              </View>
            </View>

            {equipment.length ===
            0 ? (
              <View
                style={
                  styles.emptyEquipment
                }
              >
                <Ionicons
                  name="cube-outline"
                  size={32}
                  color="#94A3B8"
                />

                <Text
                  style={
                    styles.emptyEquipmentTitle
                  }
                >
                  No hay equipos
                  registrados
                </Text>

                <Text
                  style={
                    styles.emptyEquipmentText
                  }
                >
                  Los equipos aparecerán
                  aquí cuando un técnico
                  los registre en esta
                  instalación.
                </Text>
              </View>
            ) : (
              <View>
                {equipment.map(
                  (
                    item,
                    index,
                  ) => (
                    <EquipmentCard
                      key={
                        item.id
                      }
                      equipment={
                        item
                      }
                      last={
                        index ===
                        equipment.length -
                          1
                      }
                    />
                  ),
                )}
              </View>
            )}
          </View>

          {/* ================================================= */}
          {/* CONSULTA */}
          {/* ================================================= */}

          <SectionTitle
            icon="eye-outline"
            title="Consulta"
          />

          <View
            style={styles.card}
          >
            <ReadOnlyOption
              icon="images-outline"
              title="Fotografías"
              description="Consultar las fotografías de evidencia."
              onPress={() =>
                router.push(
                  `/supervisor/installations/${installation.id}/photos`,
                )
              }
            />

            <ReadOnlyOption
              icon="document-text-outline"
              title="Reporte"
              description={
                status === 'completed'
                  ? 'Consultar y descargar el reporte de instalación.'
                  : 'El reporte estará disponible cuando la instalación haya finalizado.'
              }
              disabled={status !== 'completed'}
              onPress={
                status === 'completed'
                  ? () =>
                      router.push(
                        `/supervisor/installations/${installation.id}/report`,
                      )
                  : undefined
              }
              last
            />
          </View>

          {/* ================================================= */}
          {/* SOLO LECTURA */}
          {/* ================================================= */}

          <View
            style={
              styles.readOnlyNotice
            }
          >
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color="#64748B"
            />

            <View
              style={
                styles.noticeTextContainer
              }
            >
              <Text
                style={
                  styles.noticeTitle
                }
              >
                Modo Supervisor
              </Text>

              <Text
                style={
                  styles.noticeText
                }
              >
                Esta vista es únicamente
                de consulta. El
                supervisor no puede
                modificar la instalación.
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

// ============================================================
// SECTION TITLE
// ============================================================

function SectionTitle({
  icon,
  title,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}) {
  return (
    <View
      style={styles.sectionTitle}
    >
      <Ionicons
        name={icon}
        size={20}
        color="#2563EB"
      />

      <Text
        style={
          styles.sectionTitleText
        }
      >
        {title}
      </Text>
    </View>
  );
}

// ============================================================
// INFO ROW
// ============================================================

function InfoRow({
  icon,
  label,
  value,
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.infoRow,
        !last &&
          styles.infoRowBorder,
      ]}
    >
      <Ionicons
        name={icon}
        size={19}
        color="#64748B"
      />

      <View
        style={styles.infoContent}
      >
        <Text
          style={styles.infoLabel}
        >
          {label}
        </Text>

        <Text
          style={styles.infoValue}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

// ============================================================
// EQUIPO FÍSICO
// ============================================================

function EquipmentCard({
  equipment,
  last = false,
}: {
  equipment: InstallationEquipment;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.equipmentCard,
        !last &&
          styles.equipmentCardBorder,
      ]}
    >
      {/* CABECERA */}

      <View
        style={
          styles.equipmentHeader
        }
      >
        <View
          style={
            styles.equipmentTypeIcon
          }
        >
          <Ionicons
            name="hardware-chip-outline"
            size={21}
            color="#2563EB"
          />
        </View>

        <View
          style={
            styles.equipmentHeaderContent
          }
        >
          <Text
            style={
              styles.equipmentType
            }
          >
            {
              equipment.equipmentType
            }
          </Text>

          <Text
            style={
              styles.equipmentDate
            }
          >
            Registrado el{' '}
            {formatDate(
              equipment.createdAt,
            )}
          </Text>
        </View>
      </View>

      {/* MARCA / MODELO */}

      <View
        style={
          styles.equipmentGrid
        }
      >
        <EquipmentField
          icon="pricetag-outline"
          label="Marca"
          value={displayValue(
            equipment.brand,
          )}
        />

        <EquipmentField
          icon="options-outline"
          label="Modelo"
          value={displayValue(
            equipment.model,
          )}
        />
      </View>

      {/* SERIAL */}

      <View
        style={
          styles.serialContainer
        }
      >
        <Ionicons
          name="barcode-outline"
          size={19}
          color="#64748B"
        />

        <View
          style={
            styles.serialContent
          }
        >
          <Text
            style={
              styles.fieldLabel
            }
          >
            Número de serie (SN)
          </Text>

          <Text
            style={
              styles.serialValue
            }
          >
            {displayValue(
              equipment.serialNumber,
            )}
          </Text>
        </View>
      </View>

      {/* TÉCNICO */}

      <View
        style={
          styles.detailRow
        }
      >
        <Ionicons
          name="person-outline"
          size={18}
          color="#64748B"
        />

        <View
          style={
            styles.detailContent
          }
        >
          <Text
            style={
              styles.fieldLabel
            }
          >
            Registrado por
          </Text>

          <Text
            style={
              styles.detailValue
            }
          >
            {displayValue(
              equipment.technicianName,
            )}
          </Text>
        </View>
      </View>

      {/* MÉTODO */}

      <View
        style={
          styles.detailRow
        }
      >
        <Ionicons
          name="scan-outline"
          size={18}
          color="#64748B"
        />

        <View
          style={
            styles.detailContent
          }
        >
          <Text
            style={
              styles.fieldLabel
            }
          >
            Método de registro
          </Text>

          <Text
            style={
              styles.detailValue
            }
          >
            {getCaptureMethodLabel(
              equipment.captureMethod,
            )}
          </Text>
        </View>
      </View>

      {/* VALORES */}

      {(equipment.detectedValue ||
        equipment.confirmedValue) && (
        <View
          style={
            styles.valuesContainer
          }
        >
          {equipment.detectedValue && (
            <EquipmentValueRow
              label="Valor detectado"
              value={
                equipment.detectedValue
              }
            />
          )}

          {equipment.confirmedValue && (
            <EquipmentValueRow
              label="Valor confirmado"
              value={
                equipment.confirmedValue
              }
            />
          )}
        </View>
      )}

      {/* OBSERVACIONES */}

      {equipment.observations && (
        <View
          style={
            styles.observationsContainer
          }
        >
          <Text
            style={
              styles.fieldLabel
            }
          >
            Observaciones
          </Text>

          <Text
            style={
              styles.observationsText
            }
          >
            {
              equipment.observations
            }
          </Text>
        </View>
      )}
    </View>
  );
}

// ============================================================
// CAMPO DE EQUIPO
// ============================================================

function EquipmentField({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View
      style={
        styles.equipmentField
      }
    >
      <View
        style={
          styles.fieldIconContainer
        }
      >
        <Ionicons
          name={icon}
          size={17}
          color="#64748B"
        />
      </View>

      <View
        style={
          styles.equipmentFieldContent
        }
      >
        <Text
          style={
            styles.fieldLabel
          }
        >
          {label}
        </Text>

        <Text
          style={
            styles.equipmentFieldValue
          }
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

// ============================================================
// FILA DE VALOR
// ============================================================

function EquipmentValueRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View
      style={
        styles.valueRow
      }
    >
      <Text
        style={
          styles.valueLabel
        }
      >
        {label}
      </Text>

      <Text
        style={
          styles.valueText
        }
      >
        {value}
      </Text>
    </View>
  );
}

// ============================================================
// OPCIÓN DE CONSULTA
// ============================================================

function ReadOnlyOption({
  icon,
  title,
  description,
  last = false,
  onPress,
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  last?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const isDisabled = disabled || !onPress;

  return (
    <Pressable
      style={[
        styles.readOnlyOption,
        !last &&
          styles.readOnlyOptionBorder,
        isDisabled &&
          styles.readOnlyOptionDisabled,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{
        disabled: isDisabled,
      }}
    >
      <View
        style={[
          styles.optionIcon,
          isDisabled &&
            styles.optionIconDisabled,
        ]}
      >
        <Ionicons
          name={icon}
          size={21}
          color={
            isDisabled
              ? '#94A3B8'
              : '#2563EB'
          }
        />
      </View>

      <View
        style={styles.optionContent}
      >
        <Text
          style={[
            styles.optionTitle,
            isDisabled &&
              styles.optionTitleDisabled,
          ]}
        >
          {title}
        </Text>

        <Text
          style={[
            styles.optionDescription,
            isDisabled &&
              styles.optionDescriptionDisabled,
          ]}
        >
          {description}
        </Text>
      </View>

      <Ionicons
        name={
          isDisabled
            ? 'lock-closed-outline'
            : 'chevron-forward'
        }
        size={19}
        color={
          isDisabled
            ? '#CBD5E1'
            : '#94A3B8'
        }
      />
    </Pressable>
  );
}

// ============================================================
// ESTILOS
// ============================================================

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor:
        '#F8FAFC',
    },

    container: {
      flex: 1,
    },

    // ======================================================
    // HEADER
    // ======================================================

    header: {
      height: 68,
      flexDirection:
        'row',
      alignItems:
        'center',
      paddingHorizontal: 16,
      backgroundColor:
        '#FFFFFF',
      borderBottomWidth: 1,
      borderBottomColor:
        '#E2E8F0',
    },

    headerBackButton: {
      width: 42,
      height: 42,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    headerTitleContainer: {
      flex: 1,
      paddingHorizontal: 8,
    },

    headerEyebrow: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1,
      color: '#2563EB',
    },

    headerTitle: {
      fontSize: 19,
      fontWeight: '800',
      color: '#0F172A',
      marginTop: 1,
    },

    headerIcon: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        '#EFF6FF',
    },

    // ======================================================
    // CONTENIDO
    // ======================================================

    content: {
      padding: 16,
      paddingBottom: 40,
    },

    titleSection: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor:
        '#E2E8F0',
    },

    titleRow: {
      flexDirection:
        'row',
      alignItems:
        'flex-start',
    },

    titleContainer: {
      flex: 1,
      paddingRight: 10,
    },

    projectTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: '#0F172A',
    },

    address: {
      fontSize: 14,
      lineHeight: 20,
      color: '#64748B',
      marginTop: 5,
    },

    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
    },

    statusText: {
      fontSize: 11,
      fontWeight: '700',
    },

    // ======================================================
    // SECTION
    // ======================================================

    sectionTitle: {
      flexDirection:
        'row',
      alignItems:
        'center',
      marginTop: 20,
      marginBottom: 9,
    },

    sectionTitleText: {
      fontSize: 17,
      fontWeight: '800',
      color: '#0F172A',
      marginLeft: 8,
    },

    card: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        '#E2E8F0',
      overflow: 'hidden',
    },

    // ======================================================
    // INFORMACIÓN
    // ======================================================

    infoRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
      padding: 14,
      minHeight: 68,
    },

    infoRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor:
        '#F1F5F9',
    },

    infoContent: {
      flex: 1,
      marginLeft: 11,
    },

    infoLabel: {
      fontSize: 11,
      color: '#64748B',
      marginBottom: 3,
    },

    infoValue: {
      fontSize: 14,
      fontWeight: '600',
      color: '#0F172A',
    },

    // ======================================================
    // AVANCE
    // ======================================================

    progressHeader: {
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
      padding: 14,
      paddingBottom: 8,
    },

    progressTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: '#0F172A',
    },

    progressCount: {
      fontSize: 14,
      fontWeight: '800',
      color: '#2563EB',
    },

    progressBarBackground: {
      height: 9,
      backgroundColor:
        '#E2E8F0',
      borderRadius: 5,
      marginHorizontal: 14,
      overflow: 'hidden',
    },

    progressBar: {
      height: '100%',
      backgroundColor:
        '#2563EB',
      borderRadius: 5,
    },

    progressDescription: {
      fontSize: 12,
      color: '#64748B',
      padding: 14,
      paddingTop: 8,
    },

    // ======================================================
    // EQUIPO
    // ======================================================

    equipmentSummary: {
      flexDirection:
        'row',
      alignItems:
        'center',
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor:
        '#F1F5F9',
    },

    equipmentSummaryIcon: {
      width: 44,
      height: 44,
      borderRadius: 13,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        '#EFF6FF',
    },

    equipmentSummaryContent: {
      flex: 1,
      marginLeft: 11,
    },

    equipmentSummaryTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: '#0F172A',
    },

    equipmentSummaryDescription: {
      fontSize: 12,
      lineHeight: 17,
      color: '#64748B',
      marginTop: 3,
    },

    equipmentCard: {
      padding: 15,
    },

    equipmentCardBorder: {
      borderBottomWidth: 1,
      borderBottomColor:
        '#E2E8F0',
    },

    equipmentHeader: {
      flexDirection:
        'row',
      alignItems:
        'center',
      marginBottom: 15,
    },

    equipmentTypeIcon: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        '#EFF6FF',
    },

    equipmentHeaderContent: {
      flex: 1,
      marginLeft: 10,
    },

    equipmentType: {
      fontSize: 16,
      fontWeight: '800',
      color: '#0F172A',
    },

    equipmentDate: {
      fontSize: 11,
      color: '#64748B',
      marginTop: 3,
    },

    equipmentGrid: {
      flexDirection:
        'row',
      marginBottom: 12,
    },

    equipmentField: {
      flex: 1,
      flexDirection:
        'row',
      alignItems:
        'flex-start',
      marginRight: 8,
    },

    fieldIconContainer: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor:
        '#F8FAFC',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    equipmentFieldContent: {
      flex: 1,
      marginLeft: 7,
    },

    fieldLabel: {
      fontSize: 10,
      color: '#64748B',
      marginBottom: 3,
    },

    equipmentFieldValue: {
      fontSize: 13,
      fontWeight: '700',
      color: '#0F172A',
    },

    serialContainer: {
      flexDirection:
        'row',
      alignItems:
        'center',
      backgroundColor:
        '#F8FAFC',
      borderRadius: 10,
      padding: 11,
      marginBottom: 11,
    },

    serialContent: {
      flex: 1,
      marginLeft: 9,
    },

    serialValue: {
      fontSize: 14,
      fontWeight: '800',
      color: '#0F172A',
      letterSpacing: 0.3,
    },

    detailRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
      marginTop: 10,
    },

    detailContent: {
      flex: 1,
      marginLeft: 9,
    },

    detailValue: {
      fontSize: 13,
      fontWeight: '600',
      color: '#0F172A',
    },

    valuesContainer: {
      marginTop: 12,
      padding: 11,
      borderRadius: 10,
      backgroundColor:
        '#F8FAFC',
    },

    valueRow: {
      marginBottom: 8,
    },

    valueLabel: {
      fontSize: 10,
      color: '#64748B',
      marginBottom: 2,
    },

    valueText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#0F172A',
    },

    observationsContainer: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor:
        '#F1F5F9',
    },

    observationsText: {
      fontSize: 13,
      lineHeight: 19,
      color: '#334155',
      marginTop: 3,
    },

    emptyEquipment: {
      alignItems:
        'center',
      paddingHorizontal: 25,
      paddingVertical: 28,
    },

    emptyEquipmentTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: '#334155',
      marginTop: 9,
    },

    emptyEquipmentText: {
      fontSize: 12,
      lineHeight: 18,
      color: '#64748B',
      textAlign:
        'center',
      marginTop: 5,
    },

    // ======================================================
    // CONSULTA
    // ======================================================

    readOnlyOption: {
      flexDirection:
        'row',
      alignItems:
        'center',
      padding: 14,
      minHeight: 78,
    },

    readOnlyOptionBorder: {
      borderBottomWidth: 1,
      borderBottomColor:
        '#F1F5F9',
    },

    readOnlyOptionDisabled: {
      backgroundColor: '#F8FAFC',
    },

    optionIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        '#EFF6FF',
    },

    optionIconDisabled: {
      backgroundColor: '#F1F5F9',
    },

    optionContent: {
      flex: 1,
      marginHorizontal: 11,
    },

    optionTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: '#0F172A',
    },

    optionTitleDisabled: {
      color: '#64748B',
    },

    optionDescription: {
      fontSize: 12,
      lineHeight: 17,
      color: '#64748B',
      marginTop: 3,
    },

    optionDescriptionDisabled: {
      color: '#94A3B8',
    },

    // ======================================================
    // SOLO LECTURA
    // ======================================================

    readOnlyNotice: {
      flexDirection:
        'row',
      alignItems:
        'flex-start',
      backgroundColor:
        '#F1F5F9',
      borderRadius: 12,
      padding: 14,
      marginTop: 20,
    },

    noticeTextContainer: {
      flex: 1,
      marginLeft: 10,
    },

    noticeTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: '#334155',
    },

    noticeText: {
      fontSize: 12,
      lineHeight: 18,
      color: '#64748B',
      marginTop: 3,
    },

    // ======================================================
    // LOADING
    // ======================================================

    centered: {
      flex: 1,
      alignItems:
        'center',
      justifyContent:
        'center',
      paddingHorizontal: 30,
    },

    loadingText: {
      marginTop: 10,
      fontSize: 14,
      color: '#64748B',
    },

    // ======================================================
    // ERROR
    // ======================================================

    errorIcon: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor:
        '#FEF2F2',
      alignItems:
        'center',
      justifyContent:
        'center',
      marginBottom: 14,
    },

    errorTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: '#0F172A',
      textAlign:
        'center',
    },

    errorText: {
      fontSize: 14,
      lineHeight: 20,
      color: '#64748B',
      textAlign:
        'center',
      marginTop: 7,
    },

    retryButton: {
      marginTop: 18,
      paddingHorizontal: 20,
      paddingVertical: 11,
      borderRadius: 10,
      backgroundColor:
        '#2563EB',
    },

    retryButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },

    backButton: {
      marginTop: 10,
      paddingHorizontal: 20,
      paddingVertical: 11,
    },

    backButtonText: {
      color: '#2563EB',
      fontSize: 14,
      fontWeight: '700',
    },
  });