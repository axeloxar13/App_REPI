// app/admin/devices/index.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  RefreshControl,
  Linking,
  Dimensions,
  Platform,
  Share,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../../constants/theme';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabase';
import { formatDate, formatDateTime } from '../../../lib/date';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const { width, height } = Dimensions.get('window');

type DeviceRow = {
  id: string;
  serial_number: string;
  brand: string;
  model: string;
  capture_method: string;
  created_at: string;
  installation_id: string;
  installation_number: string;
  installation_address: string;
  installation_status: string;
  client_name: string;
  client_phone: string;
  technician_name: string;
  technician_email: string;
  equipment_type: string;
  observations: string;
  latitud: number | null;
  longitud: number | null;
  tiene_ubicacion: boolean;
};

type ExportDateFilter =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last_week'
  | 'last_month'
  | 'last_3_months';

const CAPTURE_LABELS: Record<string, string> = {
  manual: 'Manual',
  qr: 'QR',
  barcode: 'Código de barras',
  ocr: 'OCR',
  photo: 'Foto',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  in_review: 'En revisión',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B',
  in_progress: '#3B82F6',
  in_review: '#8B5CF6',
  completed: '#10B981',
  cancelled: '#EF4444',
};

export default function AdminDevicesScreen() {
  const { selectedMembership } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [filteredDevices, setFilteredDevices] = useState<DeviceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [exporting, setExporting] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<DeviceRow | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportDateFilter, setExportDateFilter] = useState<ExportDateFilter>('all');
  const [exportClientFilter, setExportClientFilter] = useState<string>('all');

  const organizationId = selectedMembership?.organizationId;

  const loadDevices = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: equipmentData, error: equipmentError } = await supabase
        .from('installation_equipment')
        .select(`
          id,
          serial_number,
          brand,
          model,
          capture_method,
          equipment_type,
          observations,
          created_at,
          installation_id,
          technician_user_id
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (equipmentError) throw equipmentError;

      if (!equipmentData || equipmentData.length === 0) {
        setDevices([]);
        setFilteredDevices([]);
        setLoading(false);
        return;
      }

      const installationIds = [...new Set(equipmentData.map((e) => e.installation_id).filter(Boolean))];

      let installationsMap: Record<string, any> = {};
      if (installationIds.length > 0) {
        const { data: installationsData, error: installationsError } = await supabase
          .from('installations')
          .select(`
            id,
            project_name,
            address,
            status,
            technician_id,
            client_id,
            client:client_id (
              name,
              phone
            )
          `)
          .in('id', installationIds);

        if (!installationsError && installationsData) {
          installationsMap = installationsData.reduce((acc, inst) => {
            acc[inst.id] = inst;
            return acc;
          }, {} as Record<string, any>);
        }
      }

      let photosLocationMap: Record<string, { latitud: number; longitud: number }> = {};

      if (installationIds.length > 0) {
        const { data: photosData, error: photosError } = await supabase
          .from('installation_photos')
          .select('installation_id, latitud, longitud, tiene_ubicacion')
          .in('installation_id', installationIds)
          .eq('tiene_ubicacion', true)
          .not('latitud', 'is', null)
          .not('longitud', 'is', null);

        if (!photosError && photosData) {
          const locationsByInstallation: Record<string, { lat: number[]; lng: number[] }> = {};

          photosData.forEach((photo: any) => {
            if (photo.latitud && photo.longitud) {
              if (!locationsByInstallation[photo.installation_id]) {
                locationsByInstallation[photo.installation_id] = { lat: [], lng: [] };
              }
              locationsByInstallation[photo.installation_id].lat.push(Number(photo.latitud));
              locationsByInstallation[photo.installation_id].lng.push(Number(photo.longitud));
            }
          });

          Object.entries(locationsByInstallation).forEach(([installationId, coords]) => {
            const avgLat = coords.lat.reduce((a, b) => a + b, 0) / coords.lat.length;
            const avgLng = coords.lng.reduce((a, b) => a + b, 0) / coords.lng.length;
            photosLocationMap[installationId] = {
              latitud: avgLat,
              longitud: avgLng,
            };
          });
        }
      }

      const technicianIdsFromEquipment = equipmentData.map((e) => e.technician_user_id).filter(Boolean);
      const technicianIdsFromInstallations = Object.values(installationsMap)
        .map((inst: any) => inst.technician_id)
        .filter(Boolean);

      const allTechnicianIds = [...new Set([...technicianIdsFromEquipment, ...technicianIdsFromInstallations])];

      let techniciansMap: Record<string, any> = {};
      if (allTechnicianIds.length > 0) {
        const { data: techniciansData, error: techniciansError } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', allTechnicianIds);

        if (!techniciansError && techniciansData) {
          techniciansMap = techniciansData.reduce((acc, tech) => {
            acc[tech.id] = tech;
            return acc;
          }, {} as Record<string, any>);
        }
      }

      const formattedDevices: DeviceRow[] = equipmentData.map((item: any) => {
        const installation = installationsMap[item.installation_id] || {};
        const client = installation.client || {};
        const location = photosLocationMap[item.installation_id];

        const technicianId = item.technician_user_id || installation.technician_id;
        const technician = techniciansMap[technicianId] || {};

        return {
          id: item.id,
          serial_number: item.serial_number || 'Sin SN',
          brand: item.brand || 'Sin marca',
          model: item.model || 'Sin modelo',
          capture_method: item.capture_method || 'manual',
          equipment_type: item.equipment_type || 'Equipo',
          observations: item.observations || '',
          created_at: item.created_at,
          installation_id: item.installation_id,
          installation_number: installation.project_name || 'Sin instalación',
          installation_address: installation.address || 'Sin dirección',
          installation_status: installation.status || 'pending',
          client_name: client.name || 'Sin cliente',
          client_phone: client.phone || 'Sin teléfono',
          technician_name: technician.full_name || 'Sin asignar',
          technician_email: technician.email || '',
          latitud: location?.latitud || null,
          longitud: location?.longitud || null,
          tiene_ubicacion: !!location,
        };
      });

      setDevices(formattedDevices);
      setFilteredDevices(formattedDevices);
    } catch (err) {
      console.error('Error cargando dispositivos:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredDevices(devices);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const filtered = devices.filter(
      (device) =>
        device.serial_number.toLowerCase().includes(query) ||
        device.brand.toLowerCase().includes(query) ||
        device.model.toLowerCase().includes(query) ||
        device.technician_name.toLowerCase().includes(query) ||
        device.client_name.toLowerCase().includes(query) ||
        device.installation_number.toLowerCase().includes(query) ||
        device.installation_address.toLowerCase().includes(query)
    );

    setFilteredDevices(filtered);
  }, [devices, searchQuery]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadDevices();
  }, [loadDevices]);

  const openDeviceDetail = (device: DeviceRow) => {
    setSelectedDevice(device);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedDevice(null);
  };

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

  const uniqueClients = useMemo(() => {
    const clientSet = new Set<string>();
    devices.forEach((device) => {
      if (device.client_name && device.client_name !== 'Sin cliente') {
        clientSet.add(device.client_name);
      }
    });
    return Array.from(clientSet).sort();
  }, [devices]);

  const getDevicesForExport = useCallback((): DeviceRow[] => {
    let result = [...devices];

    if (exportDateFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      let startDate: Date | null = null;

      switch (exportDateFilter) {
        case 'today':
          startDate = today;
          break;
        case 'yesterday':
          startDate = new Date(today);
          startDate.setDate(startDate.getDate() - 1);
          break;
        case 'last_week':
          startDate = new Date(today);
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'last_month':
          startDate = new Date(today);
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case 'last_3_months':
          startDate = new Date(today);
          startDate.setMonth(startDate.getMonth() - 3);
          break;
      }

      if (startDate) {
        result = result.filter((device) => {
          const deviceDate = new Date(device.created_at);
          if (exportDateFilter === 'yesterday') {
            const endOfYesterday = new Date(today);
            return deviceDate >= startDate! && deviceDate < endOfYesterday;
          }
          return deviceDate >= startDate!;
        });
      }
    }

    if (exportClientFilter !== 'all') {
      result = result.filter((device) => device.client_name === exportClientFilter);
    }

    return result;
  }, [devices, exportDateFilter, exportClientFilter]);

  // 🔥🔥🔥 EXPORTACIÓN RÁPIDA — iOS + Android
  const exportToCSV = async () => {
    const t0 = Date.now();
    try {
      console.log('🚀 [EXPORT] Inicio');

      const devicesToExport = getDevicesForExport();
      console.log(`📊 [EXPORT] count: ${devicesToExport.length} (${Date.now() - t0}ms)`);

      if (devicesToExport.length === 0) {
        Alert.alert('Sin datos', 'No hay dispositivos que coincidan con los filtros.');
        return;
      }

      setExporting(true);

      // ✅ 1. Generar CSV en memoria (rápido)
      const headers = [
        'SN', 'Marca', 'Modelo', 'Tipo', 'Método Captura', 'Instalación',
        'Dirección', 'Ubicación GPS', 'Cliente', 'Teléfono', 'Técnico', 'Email Técnico',
        'Observaciones', 'Fecha Registro',
      ];

      const escapeCSV = (value: any) => {
        if (value === null || value === undefined) return '';
        const s = String(value);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      const rows = devicesToExport.map((d) => [
        escapeCSV(d.serial_number),
        escapeCSV(d.brand),
        escapeCSV(d.model),
        escapeCSV(d.equipment_type),
        escapeCSV(CAPTURE_LABELS[d.capture_method] || d.capture_method),
        escapeCSV(d.installation_number),
        escapeCSV(d.installation_address),
        escapeCSV(d.tiene_ubicacion ? `${d.latitud?.toFixed(6)}, ${d.longitud?.toFixed(6)}` : 'Sin ubicación'),
        escapeCSV(d.client_name),
        escapeCSV(d.client_phone),
        escapeCSV(d.technician_name),
        escapeCSV(d.technician_email),
        escapeCSV(d.observations),
        escapeCSV(formatDateTime(d.created_at)),
      ]);

      const BOM = '\uFEFF';
      const csvContent = BOM + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      console.log(`📝 [EXPORT] CSV construido (${Date.now() - t0}ms)`);

      const fileName = `Dispositivos_${Date.now()}.csv`;
      const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;

      if (!baseDir) {
        Alert.alert('Error', 'No se pudo acceder al sistema de archivos.');
        setExporting(false);
        return;
      }

      const filePath = `${baseDir}${fileName}`;

      // ✅ 2. Escribir archivo
      await FileSystem.writeAsStringAsync(filePath, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      console.log(`💾 [EXPORT] Archivo escrito (${Date.now() - t0}ms)`);

      const info = await FileSystem.getInfoAsync(filePath);
      if (!info.exists) {
        throw new Error('El archivo no se creó correctamente');
      }

      // ✅ 3. Cerrar modal DESPUÉS de tener el archivo listo
      setExportModalVisible(false);

      // ✅ 4. Delay mínimo (150ms)
      await new Promise((resolve) => setTimeout(resolve, 150));
      console.log(`⏱️ [EXPORT] Listo para compartir (${Date.now() - t0}ms)`);

      // ✅ 5. Compartir con timeout Y fallback
      let sharedOK = false;

      try {
        const sharingAvailable = await Sharing.isAvailableAsync();

        if (sharingAvailable) {
          console.log(`📤 [EXPORT] Abriendo share sheet... (${Date.now() - t0}ms)`);

          const sharePromise = Sharing.shareAsync(filePath, {
            mimeType: 'text/csv',
            dialogTitle: `Exportar ${devicesToExport.length} dispositivos`,
            UTI: 'public.comma-separated-values-text',
          });

          const timeoutPromise = new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('SHARE_TIMEOUT')), 10000)
          );

          await Promise.race([sharePromise, timeoutPromise]);
          sharedOK = true;
          console.log(`✅ [EXPORT] Compartido (${Date.now() - t0}ms)`);
        }
      } catch (shareErr: any) {
        console.warn('⚠️ [EXPORT] shareAsync falló:', shareErr?.message);
        try {
          const shareResult = await Share.share({
            title: `Exportar ${devicesToExport.length} dispositivos`,
            message:
              Platform.OS === 'ios'
                ? `Archivo: ${fileName}`
                : `Archivo: ${fileName}\n${filePath}`,
            url: Platform.OS === 'ios' ? filePath : undefined,
          });
          if (shareResult.action === Share.sharedAction) {
            sharedOK = true;
          }
        } catch (nativeShareErr: any) {
          console.warn('⚠️ [EXPORT] Share nativo falló:', nativeShareErr?.message);
        }
      }

      if (!sharedOK) {
        const hint =
          Platform.OS === 'ios'
            ? `Abre la app "Archivos" → "En mi iPhone" → busca "${fileName}".`
            : `El archivo se guardó en:\n${filePath}`;

        Alert.alert(
          '✅ Archivo generado',
          `${devicesToExport.length} dispositivos exportados.\n\n📄 ${fileName}\n\n${hint}`,
          [{ text: 'Entendido' }]
        );
      }
    } catch (err: any) {
      console.error(`❌ [EXPORT] Error a los ${Date.now() - t0}ms:`, err);
      Alert.alert('Error al exportar', `${err?.message || String(err)}`);
    } finally {
      setExporting(false);
    }
  };

  const stats = useMemo(() => {
    const brands = new Set(devices.map((d) => d.brand).filter((b) => b !== 'Sin marca'));
    const withLocation = devices.filter((d) => d.tiene_ubicacion).length;

    return {
      total: devices.length,
      brands: brands.size,
      withLocation,
    };
  }, [devices]);

  const exportPreviewCount = useMemo(() => {
    return getDevicesForExport().length;
  }, [getDevicesForExport]);

  const renderDeviceCard = ({ item }: { item: DeviceRow }) => {
    const statusColor = STATUS_COLORS[item.installation_status] || '#94A3B8';

    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => openDeviceDetail(item)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardIconContainer}>
            <Ionicons name="hardware-chip" size={20} color={colors.primary} />
          </View>
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardSN} numberOfLines={1}>
              {item.serial_number}
            </Text>
            <Text style={styles.cardModel} numberOfLines={1}>
              {item.brand} · {item.model}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
        </View>

        <View style={styles.cardInfo}>
          <View style={styles.cardInfoRow}>
            <Ionicons name="business-outline" size={14} color={colors.muted} />
            <Text style={styles.cardInfoText} numberOfLines={1}>
              {item.installation_number}
            </Text>
          </View>

          <View style={styles.cardInfoRow}>
            <Ionicons name="location-outline" size={14} color={colors.muted} />
            <Text style={styles.cardInfoText} numberOfLines={1}>
              {item.installation_address}
            </Text>
          </View>

          <View style={styles.cardInfoRow}>
            <Ionicons name="construct-outline" size={14} color={colors.muted} />
            <Text style={styles.cardInfoText} numberOfLines={1}>
              {item.technician_name}
            </Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.cardFooterLeft}>
            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}15` }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>
                {STATUS_LABELS[item.installation_status] || item.installation_status}
              </Text>
            </View>
            {item.tiene_ubicacion && (
              <View style={styles.gpsBadge}>
                <Ionicons name="navigate" size={10} color="#10B981" />
                <Text style={styles.gpsBadgeText}>GPS</Text>
              </View>
            )}
          </View>
          <Text style={styles.cardDate}>{formatDate(item.created_at)}</Text>
        </View>
      </Pressable>
    );
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerScreen}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Cargando dispositivos…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <Stack.Screen
        options={{
          title: 'Dispositivos instalados',
          headerShown: true,
          headerBackTitle: 'Volver',
          headerTitleStyle: { fontWeight: '600' },
        }}
      />

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitleGroup}>
            <Text style={styles.headerTitle}>Dispositivos instalados</Text>
            <Text style={styles.headerSubtitle}>
              Inventario de equipos capturados por los técnicos
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.exportButton,
              exporting && styles.exportButtonDisabled,
              pressed && !exporting && styles.exportButtonPressed,
            ]}
            onPress={() => setExportModalVisible(true)}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="download-outline" size={16} color="#fff" />
                <Text style={styles.exportButtonText}>Exportar</Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.total}</Text>
            <Text style={styles.statLabel}>Dispositivos</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.brands}</Text>
            <Text style={styles.statLabel}>Marcas</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.withLocation}</Text>
            <Text style={styles.statLabel}>Con GPS</Text>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color={colors.muted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por SN, marca, modelo, técnico o dirección"
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {searchQuery.length > 0 && (
          <Text style={styles.resultsCount}>
            {filteredDevices.length} de {devices.length} dispositivos
          </Text>
        )}
      </View>

      {error ? (
        <View style={styles.centerScreen}>
          <Ionicons name="alert-circle-outline" size={44} color="#DC2626" />
          <Text style={styles.errorTitle}>No se pudo cargar la información</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={loadDevices}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : filteredDevices.length === 0 ? (
        <View style={styles.centerScreen}>
          <Ionicons name="file-tray-outline" size={56} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>Sin resultados</Text>
          <Text style={styles.emptyText}>
            {searchQuery
              ? 'No se encontraron dispositivos que coincidan con tu búsqueda.'
              : 'Los dispositivos aparecerán aquí cuando los técnicos los registren.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredDevices}
          keyExtractor={(item) => item.id}
          renderItem={renderDeviceCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* MODAL DE DETALLE */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <Ionicons name="hardware-chip" size={24} color={colors.primary} />
                <Text style={styles.modalTitle}>Detalle del dispositivo</Text>
              </View>
              <Pressable onPress={closeModal} style={styles.modalCloseButton} hitSlop={10}>
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={styles.modalBodyContent}
              showsVerticalScrollIndicator={false}
            >
              {selectedDevice && (
                <>
                  <View style={styles.modalHeroCard}>
                    <Text style={styles.modalHeroLabel}>NÚMERO DE SERIE</Text>
                    <Text style={styles.modalHeroSN}>{selectedDevice.serial_number}</Text>
                    <View style={styles.modalHeroBadges}>
                      <View style={styles.modalHeroBadge}>
                        <Ionicons name="pricetag-outline" size={12} color="#fff" />
                        <Text style={styles.modalHeroBadgeText}>
                          {CAPTURE_LABELS[selectedDevice.capture_method] || selectedDevice.capture_method}
                        </Text>
                      </View>
                      {selectedDevice.tiene_ubicacion && (
                        <View style={[styles.modalHeroBadge, { backgroundColor: '#10B981' }]}>
                          <Ionicons name="navigate" size={12} color="#fff" />
                          <Text style={styles.modalHeroBadgeText}>GPS</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>📱 Información del equipo</Text>
                    <DetailRow icon="business-outline" label="Marca" value={selectedDevice.brand} />
                    <DetailRow icon="hardware-chip-outline" label="Modelo" value={selectedDevice.model} />
                    <DetailRow icon="apps-outline" label="Tipo" value={selectedDevice.equipment_type} />
                    {selectedDevice.observations ? (
                      <DetailRow icon="chatbubble-outline" label="Observaciones" value={selectedDevice.observations} />
                    ) : null}
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>📍 Ubicación de la instalación</Text>
                    <DetailRow
                      icon="location-outline"
                      label="Dirección"
                      value={selectedDevice.installation_address}
                    />

                    {selectedDevice.tiene_ubicacion ? (
                      <>
                        <DetailRow
                          icon="navigate-outline"
                          label="Coordenadas GPS"
                          value={`${selectedDevice.latitud?.toFixed(6)}, ${selectedDevice.longitud?.toFixed(6)}`}
                        />
                        <Pressable
                          style={styles.modalMapButton}
                          onPress={() => {
                            if (selectedDevice.latitud && selectedDevice.longitud) {
                              openMap(selectedDevice.latitud, selectedDevice.longitud);
                            }
                          }}
                        >
                          <Ionicons name="map-outline" size={18} color="#fff" />
                          <Text style={styles.modalMapButtonText}>Ver en Google Maps</Text>
                        </Pressable>
                      </>
                    ) : (
                      <View style={styles.noLocationBox}>
                        <Ionicons name="location-outline" size={16} color="#94A3B8" />
                        <Text style={styles.noLocationText}>
                          No se registró ubicación GPS para esta instalación
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>🏢 Instalación</Text>
                    <DetailRow icon="folder-outline" label="Proyecto" value={selectedDevice.installation_number} />
                    <DetailRow
                      icon="checkmark-circle-outline"
                      label="Estado"
                      value={STATUS_LABELS[selectedDevice.installation_status] || selectedDevice.installation_status}
                    />
                    <Pressable
                      style={styles.modalLinkButton}
                      onPress={() => {
                        closeModal();
                        router.push(`/installations/${selectedDevice.installation_id}`);
                      }}
                    >
                      <Text style={styles.modalLinkButtonText}>Ver instalación completa</Text>
                      <Ionicons name="arrow-forward" size={16} color={colors.primary} />
                    </Pressable>
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>👤 Cliente</Text>
                    <DetailRow icon="person-outline" label="Nombre" value={selectedDevice.client_name} />
                    <DetailRow icon="call-outline" label="Teléfono" value={selectedDevice.client_phone} />
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>🔧 Técnico responsable</Text>
                    <DetailRow icon="construct-outline" label="Nombre" value={selectedDevice.technician_name} />
                    {selectedDevice.technician_email ? (
                      <DetailRow icon="mail-outline" label="Email" value={selectedDevice.technician_email} />
                    ) : null}
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>📅 Registro</Text>
                    <DetailRow
                      icon="calendar-outline"
                      label="Fecha de registro"
                      value={formatDateTime(selectedDevice.created_at)}
                    />
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL DE EXPORTACIÓN */}
      <Modal
        visible={exportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setExportModalVisible(false)}
        statusBarTranslucent
      >
        <View style={styles.exportModalBackdrop}>
          <View style={styles.exportModalWindow}>
            <View style={styles.exportModalHeader}>
              <View style={styles.exportModalHeaderLeft}>
                <View style={styles.exportModalIcon}>
                  <Ionicons name="download-outline" size={24} color="#fff" />
                </View>
                <View style={styles.exportModalHeaderText}>
                  <Text style={styles.exportModalTitle}>Exportar dispositivos</Text>
                  <Text style={styles.exportModalSubtitle}>
                    Personaliza tu exportación
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => setExportModalVisible(false)}
                style={styles.exportModalClose}
                hitSlop={10}
              >
                <Ionicons name="close" size={22} color="#fff" />
              </Pressable>
            </View>

            <ScrollView
              style={styles.exportModalBody}
              contentContainerStyle={styles.exportModalBodyContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.exportSection}>
                <View style={styles.exportSectionHeader}>
                  <View style={styles.exportSectionIcon}>
                    <Ionicons name="calendar-outline" size={16} color="#2563EB" />
                  </View>
                  <Text style={styles.exportSectionTitle}>Rango de fecha</Text>
                </View>
                <View style={styles.exportOptionsGrid}>
                  <ExportOption
                    label="Todos"
                    icon="globe-outline"
                    active={exportDateFilter === 'all'}
                    onPress={() => setExportDateFilter('all')}
                  />
                  <ExportOption
                    label="Hoy"
                    icon="today-outline"
                    active={exportDateFilter === 'today'}
                    onPress={() => setExportDateFilter('today')}
                  />
                  <ExportOption
                    label="Ayer"
                    icon="time-outline"
                    active={exportDateFilter === 'yesterday'}
                    onPress={() => setExportDateFilter('yesterday')}
                  />
                  <ExportOption
                    label="Últ. semana"
                    icon="calendar-outline"
                    active={exportDateFilter === 'last_week'}
                    onPress={() => setExportDateFilter('last_week')}
                  />
                  <ExportOption
                    label="Últ. mes"
                    icon="calendar-number-outline"
                    active={exportDateFilter === 'last_month'}
                    onPress={() => setExportDateFilter('last_month')}
                  />
                  <ExportOption
                    label="Últ. 3 meses"
                    icon="calendar-clear-outline"
                    active={exportDateFilter === 'last_3_months'}
                    onPress={() => setExportDateFilter('last_3_months')}
                  />
                </View>
              </View>

              <View style={styles.exportSection}>
                <View style={styles.exportSectionHeader}>
                  <View style={styles.exportSectionIcon}>
                    <Ionicons name="people-outline" size={16} color="#2563EB" />
                  </View>
                  <Text style={styles.exportSectionTitle}>Cliente específico</Text>
                </View>
                {uniqueClients.length === 0 ? (
                  <Text style={styles.exportEmptyText}>No hay clientes registrados</Text>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.exportClientsScroll}
                  >
                    <Pressable
                      style={[
                        styles.exportClientChip,
                        exportClientFilter === 'all' && styles.exportClientChipActive,
                      ]}
                      onPress={() => setExportClientFilter('all')}
                    >
                      <Text
                        style={[
                          styles.exportClientChipText,
                          exportClientFilter === 'all' && styles.exportClientChipTextActive,
                        ]}
                      >
                        Todos
                      </Text>
                    </Pressable>
                    {uniqueClients.map((client) => (
                      <Pressable
                        key={client}
                        style={[
                          styles.exportClientChip,
                          exportClientFilter === client && styles.exportClientChipActive,
                        ]}
                        onPress={() => setExportClientFilter(client)}
                      >
                        <Text
                          style={[
                            styles.exportClientChipText,
                            exportClientFilter === client && styles.exportClientChipTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {client}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>

              <View style={styles.exportPreview}>
                <View style={styles.exportPreviewIcon}>
                  <Ionicons name="information-circle" size={22} color="#2563EB" />
                </View>
                <View style={styles.exportPreviewContent}>
                  <Text style={styles.exportPreviewLabel}>Dispositivos a exportar</Text>
                  <Text style={styles.exportPreviewValue}>
                    {exportPreviewCount} {exportPreviewCount === 1 ? 'dispositivo' : 'dispositivos'}
                  </Text>
                </View>
              </View>
            </ScrollView>

            <View style={styles.exportModalFooter}>
              <Pressable
                style={[styles.exportActionButton, styles.exportCancelButton]}
                onPress={() => setExportModalVisible(false)}
              >
                <Text style={styles.exportCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.exportActionButton,
                  styles.exportConfirmButton,
                  (exporting || exportPreviewCount === 0) && styles.exportConfirmButtonDisabled,
                ]}
                onPress={exportToCSV}
                disabled={exporting || exportPreviewCount === 0}
              >
                {exporting ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.exportConfirmText}>Preparando…</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="download-outline" size={18} color="#fff" />
                    <Text style={styles.exportConfirmText}>Exportar ahora</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon as any} size={18} color={colors.muted} style={styles.detailIcon} />
      <View style={styles.detailContent}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

function ExportOption({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.exportOption, active && styles.exportOptionActive]}
      onPress={onPress}
    >
      <View style={[styles.exportOptionIcon, active && styles.exportOptionIconActive]}>
        <Ionicons
          name={icon as any}
          size={18}
          color={active ? '#fff' : '#64748B'}
        />
      </View>
      <Text style={[styles.exportOptionLabel, active && styles.exportOptionLabelActive]}>
        {label}
      </Text>
      {active && (
        <View style={styles.exportOptionCheck}>
          <Ionicons name="checkmark-circle" size={16} color="#2563EB" />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
  centerScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  loadingText: { marginTop: spacing.md, color: colors.muted, fontSize: 15 },

  errorTitle: { marginTop: spacing.md, fontSize: 16, fontWeight: '600', color: colors.text },
  errorText: { marginTop: spacing.xs, color: colors.muted, fontSize: 13, textAlign: 'center', maxWidth: 280 },
  retryButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  emptyTitle: { marginTop: spacing.md, fontSize: 16, fontWeight: '600', color: colors.text },
  emptyText: { marginTop: spacing.xs, fontSize: 13, color: colors.muted, textAlign: 'center', maxWidth: 280 },

  header: {
    backgroundColor: '#fff',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  headerTitleGroup: { flex: 1 },
  headerTitle: { fontSize: 19, fontWeight: '700', color: colors.text, letterSpacing: -0.2 },
  headerSubtitle: { fontSize: 12.5, color: colors.muted, marginTop: 2 },

  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1E293B',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  exportButtonPressed: { opacity: 0.85 },
  exportButtonDisabled: { opacity: 0.5 },
  exportButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: spacing.md,
  },
  statCard: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center' },
  statDivider: { width: 1, height: 28, backgroundColor: '#E2E8F0' },
  statNumber: { fontSize: 18, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 11, color: colors.muted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchIcon: { marginRight: spacing.sm },
  searchInput: { flex: 1, paddingVertical: spacing.sm, fontSize: 14, color: colors.text },
  resultsCount: { fontSize: 12, color: colors.muted, marginTop: spacing.sm },

  listContent: { padding: spacing.lg, paddingBottom: spacing.xl },

  card: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderText: { flex: 1 },
  cardSN: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    fontFamily: 'Courier',
    letterSpacing: -0.3,
  },
  cardModel: { fontSize: 12, color: colors.muted, marginTop: 2 },

  cardInfo: {
    gap: 4,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cardInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardInfoText: { flex: 1, fontSize: 12.5, color: colors.text },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  cardFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  gpsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  gpsBadgeText: { fontSize: 10, color: '#10B981', fontWeight: '600' },
  cardDate: { fontSize: 11, color: colors.muted },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    minHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalCloseButton: { padding: 4 },

  modalBody: { flex: 1 },
  modalBodyContent: { padding: spacing.lg, paddingBottom: spacing.xl },

  modalHeroCard: {
    backgroundColor: '#EFF6FF',
    padding: spacing.lg,
    borderRadius: radius.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalHeroLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563EB',
    letterSpacing: 1,
    marginBottom: 4,
  },
  modalHeroSN: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E293B',
    fontFamily: 'Courier',
    textAlign: 'center',
  },
  modalHeroBadges: { flexDirection: 'row', gap: 6, marginTop: spacing.sm },
  modalHeroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  modalHeroBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  modalSection: {
    marginBottom: spacing.lg,
    backgroundColor: '#F8FAFC',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  detailIcon: { marginTop: 2 },
  detailContent: { flex: 1 },
  detailLabel: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  detailValue: { fontSize: 14, color: colors.text, fontWeight: '500', marginTop: 2 },

  modalMapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: '#10B981',
    borderRadius: radius.sm,
  },
  modalMapButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  noLocationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: spacing.sm,
    backgroundColor: '#F1F5F9',
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },
  noLocationText: { fontSize: 12, color: '#94A3B8', flex: 1 },

  modalLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: '#fff',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  modalLinkButtonText: { color: '#2563EB', fontSize: 13, fontWeight: '600' },

  // MODAL DE EXPORTACIÓN
  exportModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xl,
  },
  exportModalWindow: {
    width: '100%',
    maxWidth: 500,
    height: height * 0.82,
    maxHeight: height * 0.88,
    backgroundColor: '#fff',
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 20,
  },
  exportModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: '#1E293B',
  },
  exportModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  exportModalHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  exportModalIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportModalTitle: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  exportModalSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12.5, marginTop: 2 },
  exportModalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  exportModalBody: {
    flex: 1,
  },
  exportModalBodyContent: {
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },

  exportModalFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },

  exportSection: { marginBottom: spacing.lg },
  exportSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  exportSectionIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.2,
  },

  exportOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  exportOption: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  exportOptionActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  exportOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportOptionIconActive: {
    backgroundColor: '#2563EB',
  },
  exportOptionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    flex: 1,
  },
  exportOptionLabelActive: {
    color: '#2563EB',
    fontWeight: '700',
  },
  exportOptionCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
  },

  exportEmptyText: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
    padding: spacing.sm,
  },

  exportClientsScroll: {
    gap: 8,
    paddingRight: spacing.md,
    paddingVertical: 2,
  },
  exportClientChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  exportClientChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  exportClientChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  exportClientChipTextActive: {
    color: '#fff',
  },

  exportPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  exportPreviewIcon: { padding: 2 },
  exportPreviewContent: { flex: 1 },
  exportPreviewLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  exportPreviewValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 2,
    letterSpacing: -0.3,
  },

  exportActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: 14,
  },
  exportCancelButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  exportCancelText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '700',
  },
  exportConfirmButton: {
    backgroundColor: '#1E293B',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  exportConfirmButtonDisabled: {
    opacity: 0.5,
  },
  exportConfirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});