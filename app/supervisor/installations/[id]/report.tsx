// app/supervisor/installations/[id]/report.tsx

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { colors, radius, spacing } from '../../../../constants/theme';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../lib/supabase';
import { fetchInstallationByIdAdmin } from '../../../../hooks/useInstallations';
import { formatDate, formatDateTime } from '../../../../lib/date';

type Deliverable = {
  id: string;
  organization_id: string;
  installation_id: string;
  installation_item_id: string | null;
  format_type: string;
  folio: string | null;
  version: number;
  status: string;
  storage_path: string | null;
  generated_at: string | null;
  file_size_bytes: number | null;
};

export default function SupervisorInstallationReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selectedMembership } = useAuth();

  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const [installation, setInstallation] = useState<any>(null);
  const [deliverable, setDeliverable] = useState<Deliverable | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ================================================================
  // CARGAR DATOS
  // ================================================================

  const loadData = useCallback(async () => {
    console.log('========================================');
    console.log('📄 SUPERVISOR - CARGANDO REPORTE');
    console.log('========================================');
    console.log('🆔 Installation ID:', id);
    console.log(
      '🏢 Organization ID:',
      selectedMembership?.organizationId
    );

    if (!id || !selectedMembership) {
      console.warn(
        '⚠️ Falta installation ID o membership'
      );

      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // ============================================================
      // 1. CARGAR INSTALACIÓN
      // ============================================================

      console.log('🔎 Buscando instalación...');

      const result = await fetchInstallationByIdAdmin(
        id,
        selectedMembership.organizationId
      );

      console.log('📦 Resultado instalación:', result);

      if (result.error) {
        console.error(
          '❌ Error instalación:',
          result.error
        );

        setError(result.error);
        return;
      }

      if (!result.data) {
        console.error(
          '❌ No se encontró la instalación'
        );

        setError(
          'No se encontró la instalación.'
        );

        return;
      }

      setInstallation(result.data);

      console.log(
        '✅ Instalación cargada:',
        result.data?.projectName ||
          result.data?.project_name
      );

      // ============================================================
      // 2. BUSCAR REPORTE
      // ============================================================

      console.log(
        '🔎 Buscando installation_deliverables...'
      );

      const {
        data: deliverables,
        error: deliverableError,
      } = await supabase
        .from('installation_deliverables')
        .select(`
          id,
          organization_id,
          installation_id,
          installation_item_id,
          format_type,
          folio,
          version,
          status,
          storage_path,
          generated_at,
          file_size_bytes
        `)
        .eq('installation_id', id)
        .eq(
          'organization_id',
          selectedMembership.organizationId
        )
        .order('version', {
          ascending: false,
        })
        .limit(1);

      console.log(
        '📄 Deliverables encontrados:',
        deliverables
      );

      if (deliverableError) {
        console.error(
          '❌ Error consultando deliverable:',
          deliverableError
        );

        setError(
          `No se pudo consultar el reporte: ${deliverableError.message}`
        );

        return;
      }

      if (
        deliverables &&
        deliverables.length > 0
      ) {
        const currentDeliverable =
          deliverables[0] as Deliverable;

        console.log(
          '✅ REPORTE ENCONTRADO'
        );

        console.log(
          '🧾 Folio:',
          currentDeliverable.folio
        );

        console.log(
          '🔢 Versión:',
          currentDeliverable.version
        );

        console.log(
          '📌 Estado:',
          currentDeliverable.status
        );

        console.log(
          '📁 Storage path:',
          currentDeliverable.storage_path
        );

        setDeliverable(
          currentDeliverable
        );
      } else {
        console.log(
          'ℹ️ Esta instalación NO tiene reporte'
        );

        setDeliverable(null);
      }
    } catch (err) {
      console.error(
        '❌ Error general cargando reporte:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Ocurrió un error al cargar el reporte.'
      );
    } finally {
      setLoading(false);

      console.log(
        '🏁 Carga del reporte finalizada'
      );
    }
  }, [id, selectedMembership]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ================================================================
  // DESCARGAR REPORTE
  // ================================================================

  const handleDownload = async () => {
    console.log('');
    console.log(
      '========================================'
    );
    console.log(
      '🟢 BOTÓN DESCARGAR PRESIONADO'
    );
    console.log(
      '========================================'
    );

    console.log(
      '📄 Deliverable actual:',
      deliverable
    );

    console.log(
      '📁 Storage path:',
      deliverable?.storage_path
    );

    console.log(
      '🆔 Installation ID:',
      id
    );

    console.log(
      '🏢 Organization ID:',
      selectedMembership?.organizationId
    );

    if (!deliverable) {
      console.warn(
        '⚠️ No existe deliverable'
      );

      Alert.alert(
        'Reporte no disponible',
        'Esta instalación todavía no tiene un reporte disponible.'
      );

      return;
    }

    if (!deliverable.storage_path) {
      console.warn(
        '⚠️ El deliverable NO tiene storage_path'
      );

      Alert.alert(
        'Archivo no disponible',
        'El reporte existe en la base de datos, pero todavía no tiene un archivo asociado para descargar.'
      );

      return;
    }

    if (deliverable.status !== 'ready') {
      console.warn(
        '⚠️ El reporte no está listo:',
        deliverable.status
      );

      Alert.alert(
        'Reporte no disponible',
        `El reporte actualmente tiene estado "${getStatusLabel(
          deliverable.status
        )}".`
      );

      return;
    }

    try {
      setDownloading(true);

      console.log(
        '⏳ Generando URL firmada...'
      );

      // ============================================================
      // 1. URL FIRMADA
      // ============================================================

      const {
        data: signedUrlData,
        error: signedUrlError,
      } = await supabase.storage
        .from('installation-deliverables')
        .createSignedUrl(
          deliverable.storage_path,
          60 * 60
        );

      console.log(
        '🔐 Resultado URL firmada:',
        signedUrlData
      );

      console.log(
        '🔐 Error URL firmada:',
        signedUrlError
      );

      if (
        signedUrlError ||
        !signedUrlData?.signedUrl
      ) {
        console.error(
          '❌ NO SE PUDO CREAR URL FIRMADA'
        );

        Alert.alert(
          'No se pudo descargar',
          signedUrlError?.message ||
            'No fue posible obtener acceso al archivo del reporte.'
        );

        return;
      }

      const signedUrl =
        signedUrlData.signedUrl;

      console.log(
        '✅ URL firmada obtenida'
      );

      // ============================================================
      // 2. NOMBRE DEL ARCHIVO
      // ============================================================

      const projectName =
        installation?.projectName ||
        installation?.project_name ||
        'Instalacion';

      const safeProjectName = String(
        projectName
      )
        .replace(
          /[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]/g,
          '_'
        )
        .replace(/_+/g, '_');

      const folio =
        deliverable.folio ||
        'reporte';

      const fileName =
        `Reporte_${safeProjectName}_${folio}_v${deliverable.version}.pdf`;

      const fileUri =
        `${FileSystem.documentDirectory}${fileName}`;

      console.log(
        '📄 Nombre archivo:',
        fileName
      );

      console.log(
        '📍 Ruta local:',
        fileUri
      );

      // ============================================================
      // 3. DESCARGAR PDF
      // ============================================================

      console.log(
        '⬇️ Iniciando descarga...'
      );

      const downloadResult =
        await FileSystem.downloadAsync(
          signedUrl,
          fileUri
        );

      console.log(
        '📥 Resultado descarga:',
        downloadResult
      );

      if (
        downloadResult.status !== 200
      ) {
        console.error(
          '❌ Descarga HTTP fallida:',
          downloadResult.status
        );

        Alert.alert(
          'No se pudo descargar',
          `El servidor respondió con código ${downloadResult.status}.`
        );

        return;
      }

      console.log(
        '✅ PDF descargado correctamente'
      );

      console.log(
        '📍 Archivo:',
        downloadResult.uri
      );

      // ============================================================
      // 4. COMPARTIR
      // ============================================================

      console.log(
        '🔎 Comprobando disponibilidad de compartir...'
      );

      const sharingAvailable =
        await Sharing.isAvailableAsync();

      console.log(
        '📤 Sharing disponible:',
        sharingAvailable
      );

      if (sharingAvailable) {
        console.log(
          '📤 Abriendo diálogo de compartir...'
        );

        await Sharing.shareAsync(
          downloadResult.uri,
          {
            mimeType: 'application/pdf',
            dialogTitle:
              `Reporte ${folio}`,
            UTI: 'com.adobe.pdf',
          }
        );

        console.log(
          '✅ Diálogo de compartir abierto'
        );
      } else {
        console.log(
          'ℹ️ Sharing no está disponible'
        );

        Alert.alert(
          'Reporte descargado',
          `El reporte se descargó correctamente como:\n\n${fileName}`
        );
      }
    } catch (err) {
      console.error(
        '❌ ERROR DURANTE LA DESCARGA:',
        err
      );

      Alert.alert(
        'Error',
        err instanceof Error
          ? err.message
          : 'Ocurrió un error al descargar el reporte.'
      );
    } finally {
      setDownloading(false);

      console.log(
        '🏁 Proceso de descarga terminado'
      );
    }
  };

  // ================================================================
  // FORMATEAR TIPO
  // ================================================================

  const getFormatLabel = (
    formatType: string
  ) => {
    switch (formatType) {
      case 'full_handover':
        return 'Entrega completa';

      case 'installation':
        return 'Reporte de instalación';

      case 'handover':
        return 'Acta de entrega';

      default:
        return (
          formatType ||
          'Reporte técnico'
        );
    }
  };

  // ================================================================
  // FORMATEAR ESTADO
  // ================================================================

  const getStatusLabel = (
    status: string
  ) => {
    switch (status) {
      case 'ready':
        return 'Disponible';

      case 'generating':
        return 'Generando';

      case 'failed':
        return 'Error';

      default:
        return status || 'Sin estado';
    }
  };

  const getStatusColor = (
    status: string
  ) => {
    switch (status) {
      case 'ready':
        return '#16A34A';

      case 'generating':
        return '#D97706';

      case 'failed':
        return '#DC2626';

      default:
        return colors.muted;
    }
  };

  // ================================================================
  // FORMATEAR TAMAÑO
  // ================================================================

  const formatFileSize = (
    bytes: number | null
  ) => {
    if (!bytes || bytes <= 0) {
      return 'Tamaño no disponible';
    }

    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${(
        bytes / 1024
      ).toFixed(1)} KB`;
    }

    return `${(
      bytes /
      (1024 * 1024)
    ).toFixed(2)} MB`;
  };

  // ================================================================
  // LOADING
  // ================================================================

  if (loading) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <StatusBar style="dark" />

        <Stack.Screen
          options={{
            title:
              'Reporte de Instalación',
            headerShown: true,
            headerBackTitle:
              'Volver',
          }}
        />

        <View
          style={styles.centerScreen}
        >
          <ActivityIndicator
            size="large"
            color={colors.primary}
          />

          <Text
            style={styles.loadingText}
          >
            Cargando reporte...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ================================================================
  // ERROR
  // ================================================================

  if (error || !installation) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <StatusBar style="dark" />

        <Stack.Screen
          options={{
            title:
              'Reporte de Instalación',
            headerShown: true,
            headerBackTitle:
              'Volver',
          }}
        />

        <View
          style={styles.centerScreen}
        >
          <View
            style={styles.errorIcon}
          >
            <Ionicons
              name="alert-circle-outline"
              size={42}
              color="#DC2626"
            />
          </View>

          <Text
            style={styles.errorTitle}
          >
            No se pudo cargar el reporte
          </Text>

          <Text
            style={styles.errorDetail}
          >
            {error ||
              'No se encontró la instalación.'}
          </Text>

          <Pressable
            style={styles.retryButton}
            onPress={loadData}
          >
            <Ionicons
              name="refresh-outline"
              size={18}
              color="#fff"
            />

            <Text
              style={styles.retryText}
            >
              Reintentar
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ================================================================
  // PANTALLA
  // ================================================================

  return (
    <SafeAreaView
      style={styles.safeArea}
    >
      <StatusBar style="dark" />

      <Stack.Screen
        options={{
          title:
            'Reporte de Instalación',
          headerShown: true,
          headerBackTitle:
            'Volver',
        }}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={
          styles.contentContainer
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        {/* ======================================================
            ENCABEZADO
        ====================================================== */}

        <View
          style={styles.headerCard}
        >
          <View
            style={styles.headerIcon}
          >
            <Ionicons
              name="document-text-outline"
              size={38}
              color={colors.primary}
            />
          </View>

          <Text
            style={styles.title}
          >
            Reporte de Instalación
          </Text>

          <Text
            style={styles.projectName}
          >
            {installation?.projectName ||
              installation?.project_name ||
              'Instalación'}
          </Text>

          <View
            style={styles.readOnlyBadge}
          >
            <Ionicons
              name="eye-outline"
              size={15}
              color={colors.primary}
            />

            <Text
              style={styles.readOnlyText}
            >
              Consulta de supervisor
            </Text>
          </View>
        </View>

        {/* ======================================================
            AVISO
        ====================================================== */}

        <View
          style={styles.noticeCard}
        >
          <View
            style={styles.noticeIcon}
          >
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color={colors.primary}
            />
          </View>

          <View
            style={styles.noticeContent}
          >
            <Text
              style={styles.noticeTitle}
            >
              Reporte en modo lectura
            </Text>

            <Text
              style={styles.noticeText}
            >
              Como supervisor puedes consultar
              y descargar el reporte existente.
              No puedes modificarlo ni generar
              una nueva versión.
            </Text>
          </View>
        </View>

        {/* ======================================================
            INFORMACIÓN
        ====================================================== */}

        <View
          style={styles.section}
        >
          <Text
            style={styles.sectionTitle}
          >
            Información de la instalación
          </Text>

          <View
            style={styles.infoCard}
          >
            <InfoRow
              icon="person-outline"
              label="Cliente"
              value={
                installation?.client?.name ||
                'No especificado'
              }
            />

            <InfoRow
              icon="business-outline"
              label="Proyecto"
              value={
                installation?.projectName ||
                installation?.project_name ||
                'No especificado'
              }
            />

            <InfoRow
              icon="location-outline"
              label="Dirección"
              value={
                installation?.address ||
                'No especificada'
              }
            />

            <InfoRow
              icon="construct-outline"
              label="Técnico"
              value={
                installation?.technician
                  ?.full_name ||
                'No asignado'
              }
            />

            <InfoRow
              icon="calendar-outline"
              label="Fecha"
              value={formatDate(
                installation?.completed_at ||
                  installation?.created_at
              )}
              last
            />
          </View>
        </View>

        {/* ======================================================
            ARCHIVO
        ====================================================== */}

        <View
          style={styles.section}
        >
          <Text
            style={styles.sectionTitle}
          >
            Archivo del reporte
          </Text>

          {!deliverable ? (
            <View
              style={styles.emptyCard}
            >
              <View
                style={styles.emptyIcon}
              >
                <Ionicons
                  name="document-outline"
                  size={38}
                  color={colors.muted}
                />
              </View>

              <Text
                style={styles.emptyTitle}
              >
                Reporte no disponible
              </Text>

              <Text
                style={styles.emptyText}
              >
                Esta instalación todavía no
                tiene un reporte generado y
                disponible para descarga.
              </Text>
            </View>
          ) : (
            <>
              <View
                style={styles.reportCard}
              >
                <View
                  style={styles.pdfIcon}
                >
                  <Ionicons
                    name="document-text"
                    size={32}
                    color="#DC2626"
                  />
                </View>

                <View
                  style={styles.reportMain}
                >
                  <Text
                    style={
                      styles.reportFileName
                    }
                  >
                    {deliverable.folio ||
                      'Reporte de instalación'}
                  </Text>

                  <Text
                    style={styles.reportType}
                  >
                    {getFormatLabel(
                      deliverable.format_type
                    )}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    {
                      borderColor: `${getStatusColor(
                        deliverable.status
                      )}40`,
                      backgroundColor: `${getStatusColor(
                        deliverable.status
                      )}12`,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor:
                          getStatusColor(
                            deliverable.status
                          ),
                      },
                    ]}
                  />

                  <Text
                    style={[
                      styles.statusText,
                      {
                        color:
                          getStatusColor(
                            deliverable.status
                          ),
                      },
                    ]}
                  >
                    {getStatusLabel(
                      deliverable.status
                    )}
                  </Text>
                </View>
              </View>

              <View
                style={styles.detailsCard}
              >
                <InfoRow
                  icon="barcode-outline"
                  label="Folio"
                  value={
                    deliverable.folio ||
                    'No disponible'
                  }
                />

                <InfoRow
                  icon="layers-outline"
                  label="Versión"
                  value={`v${deliverable.version}`}
                />

                <InfoRow
                  icon="document-outline"
                  label="Tipo"
                  value={getFormatLabel(
                    deliverable.format_type
                  )}
                />

                <InfoRow
                  icon="calendar-outline"
                  label="Generado"
                  value={
                    deliverable.generated_at
                      ? formatDateTime(
                          deliverable.generated_at
                        )
                      : 'No disponible'
                  }
                />

                <InfoRow
                  icon="save-outline"
                  label="Tamaño"
                  value={formatFileSize(
                    deliverable.file_size_bytes
                  )}
                  last
                />
              </View>

              {/* ==================================================
                  BOTÓN DE DESCARGA - PRUEBA DE TOQUE
              ================================================== */}

              {deliverable.status ===
                'ready' &&
              deliverable.storage_path ? (
                <Pressable
                  style={styles.downloadButton}
                  onPress={() => {
                    console.log(
                      '🔥🔥🔥 TOQUE EN DESCARGAR 🔥🔥🔥'
                    );

                    Alert.alert(
                      'Prueba',
                      'El botón de Descargar sí está recibiendo el toque.'
                    );
                  }}
                >
                  <Ionicons
                    name="download-outline"
                    size={22}
                    color="#fff"
                  />

                  <Text
                    style={
                      styles.downloadButtonText
                    }
                  >
                    Descargar reporte
                  </Text>
                </Pressable>
              ) : (
                <View
                  style={
                    styles.unavailableCard
                  }
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={20}
                    color="#D97706"
                  />

                  <Text
                    style={
                      styles.unavailableText
                    }
                  >
                    El archivo todavía no está
                    disponible para descarga.
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* ======================================================
            SEGURIDAD
        ====================================================== */}

        <View
          style={styles.securityCard}
        >
          <Ionicons
            name="shield-checkmark-outline"
            size={22}
            color="#16A34A"
          />

          <Text
            style={styles.securityText}
          >
            Este reporte se obtiene directamente
            del archivo oficial almacenado en
            Tamin Instalaciones.
          </Text>
        </View>

        {/* ======================================================
            VOLVER
        ====================================================== */}

        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons
            name="arrow-back-outline"
            size={20}
            color={colors.primary}
          />

          <Text
            style={styles.backButtonText}
          >
            Volver a la instalación
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// ================================================================
// INFO ROW
// ================================================================

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
        last && styles.infoRowLast,
      ]}
    >
      <View
        style={styles.infoLabelContainer}
      >
        <Ionicons
          name={icon}
          size={17}
          color={colors.muted}
        />

        <Text
          style={styles.infoLabel}
        >
          {label}
        </Text>
      </View>

      <Text
        style={styles.infoValue}
      >
        {value}
      </Text>
    </View>
  );
}

// ================================================================
// ESTILOS
// ================================================================

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  container: {
    flex: 1,
  },

  contentContainer: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },

  centerScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: '#F8FAFC',
  },

  loadingText: {
    marginTop: spacing.md,
    color: colors.muted,
    fontSize: 15,
  },

  errorIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    marginBottom: spacing.md,
  },

  errorTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },

  errorDetail: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.lg,
    maxWidth: 340,
  },

  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },

  retryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },

  // --------------------------------------------------------------
  // HEADER
  // --------------------------------------------------------------

  headerCard: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },

  headerIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },

  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },

  projectName: {
    fontSize: 15,
    color: colors.muted,
    marginTop: 4,
    textAlign: 'center',
  },

  readOnlyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
  },

  readOnlyText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },

  // --------------------------------------------------------------
  // AVISO
  // --------------------------------------------------------------

  noticeCard: {
    flexDirection: 'row',
    backgroundColor: '#F0F7FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },

  noticeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },

  noticeContent: {
    flex: 1,
  },

  noticeTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },

  noticeText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },

  // --------------------------------------------------------------
  // SECCIONES
  // --------------------------------------------------------------

  section: {
    marginBottom: spacing.lg,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },

  // --------------------------------------------------------------
  // INFORMACIÓN
  // --------------------------------------------------------------

  infoCard: {
    backgroundColor: '#fff',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },

  detailsCard: {
    backgroundColor: '#fff',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },

  infoRowLast: {
    borderBottomWidth: 0,
  },

  infoLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 105,
    gap: 7,
  },

  infoLabel: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
  },

  infoValue: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
    textAlign: 'right',
  },

  // --------------------------------------------------------------
  // REPORTE
  // --------------------------------------------------------------

  reportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },

  pdfIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },

  reportMain: {
    flex: 1,
    marginRight: spacing.sm,
  },

  reportFileName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },

  reportType: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 20,
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // --------------------------------------------------------------
  // BOTÓN
  // --------------------------------------------------------------

  downloadButton: {
    width: '100%',
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 15,
    marginTop: spacing.md,
  },

  downloadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  unavailableCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },

  unavailableText: {
    flex: 1,
    color: '#92400E',
    fontSize: 13,
    lineHeight: 18,
  },

  // --------------------------------------------------------------
  // SIN REPORTE
  // --------------------------------------------------------------

  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
  },

  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },

  emptyText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },

  // --------------------------------------------------------------
  // SEGURIDAD
  // --------------------------------------------------------------

  securityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },

  securityText: {
    flex: 1,
    color: '#166534',
    fontSize: 12,
    lineHeight: 18,
  },

  // --------------------------------------------------------------
  // VOLVER
  // --------------------------------------------------------------

  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 13,
  },

  backButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
});