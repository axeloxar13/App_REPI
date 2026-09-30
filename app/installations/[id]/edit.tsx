// app/installations/[id]/edit.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors, radius, spacing } from '../../../constants/theme';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabase';
import type { InstallationStatus, WorkType } from '../../../types/database';

// ============================================
// TIPOS
// ============================================

type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

type Technician = {
  id: string;
  full_name: string;
  active: boolean;
};

type ServiceCategory = {
  id: string;
  name: string;
  code: string;
  description: string;
  active: boolean;
};

type InstallationItem = {
  id: string;
  installation_id: string;
  position: number;
  item_role: 'primary' | 'partition';
  name: string;
  service_type: string;
  service_category_id: string | null;
  work_type: WorkType;
  specific_location: string;
  status: InstallationStatus;
  observations: string | null;
  assigned_date: string | null;
  estimated_completion_date: string | null;
};

type InstallationDetail = {
  id: string;
  organization_id: string;
  project_name: string;
  client_id: string;
  address: string;
  technician_id: string | null;
  assigned_date: string;
  installation_type: string;
  status: InstallationStatus;
  observations: string | null;
  items: InstallationItem[];
};

type FormItem = {
  key: string;
  id: string;
  itemRole: 'primary' | 'partition';
  name: string;
  serviceType: string;
  serviceCategoryId: string;
  workType: WorkType;
  specificLocation: string;
  assignedDate: string;
  estimatedCompletionDate: string;
  observations: string;
};

// ============================================
// FUNCIÓN PARA GENERAR ID ÚNICO
// ============================================

function generateId() {
  return `item-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export default function EditInstallationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selectedMembership } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Datos del formulario principal
  const [projectName, setProjectName] = useState('');
  const [address, setAddress] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [clientId, setClientId] = useState('');
  const [installationType, setInstallationType] = useState('');

  // Items (instalación principal + particiones)
  const [items, setItems] = useState<FormItem[]>([]);

  // Datos cargados
  const [clients, setClients] = useState<Client[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Modal para seleccionar servicio
  const [serviceModalVisible, setServiceModalVisible] = useState(false);
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);

  // Original items para comparar
  const [originalItems, setOriginalItems] = useState<FormItem[]>([]);

  const organizationId = selectedMembership?.organizationId;

  // ============================================
  // CARGAR DATOS
  // ============================================

  const loadData = useCallback(async () => {
    if (!organizationId || !supabase || !id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1. Cargar instalación con items
      const { data: installationData, error: installError } = await supabase
        .from('installations')
        .select(`
          *,
          items:installation_items (*)
        `)
        .eq('id', id)
        .eq('organization_id', organizationId)
        .single();

      if (installError) throw installError;
      if (!installationData) {
        setError('Instalación no encontrada');
        setLoading(false);
        return;
      }

      const installation = installationData as InstallationDetail;

      // 2. Cargar clientes
      const { data: clientsData } = await supabase
        .from('clients')
        .select('id, name, phone, email')
        .eq('organization_id', organizationId)
        .order('name');
      setClients(clientsData || []);

      // 3. Cargar técnicos
      const { data: techniciansData } = await supabase
        .from('profiles')
        .select('id, full_name, active')
        .eq('role', 'technician')
        .eq('active', true);
      setTechnicians(techniciansData || []);

      // 4. Cargar categorías de servicio
      const { data: categoriesData } = await supabase
        .from('service_categories')
        .select('id, name, code, description, active')
        .eq('active', true)
        .order('sort_order', { ascending: true });
      setServiceCategories(categoriesData || []);

      // 5. Llenar formulario
      setProjectName(installation.project_name);
      setAddress(installation.address);
      setTechnicianId(installation.technician_id || '');
      setClientId(installation.client_id);
      setInstallationType(installation.installation_type || '');

      // 6. Convertir items a FormItem
      const formItems: FormItem[] = installation.items.map((item) => ({
        key: item.id,
        id: item.id,
        itemRole: item.item_role,
        name: item.name,
        serviceType: item.service_type || '',
        serviceCategoryId: item.service_category_id || '',
        workType: item.work_type || 'installation',
        specificLocation: item.specific_location || '',
        assignedDate: item.assigned_date || '',
        estimatedCompletionDate: item.estimated_completion_date || '',
        observations: item.observations || '',
      }));

      setItems(formItems);
      setOriginalItems(formItems);

    } catch (err) {
      console.error('Error loading installation:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setLoadingData(false);
    }
  }, [supabase, organizationId, id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ============================================
  // MANEJAR ITEMS
  // ============================================

  const addPartition = () => {
    if (items.length >= 10) {
      Alert.alert('Límite alcanzado', 'Máximo 10 instalaciones por trabajo');
      return;
    }

    const newItem: FormItem = {
      key: generateId(),
      id: '',
      itemRole: 'partition',
      name: '',
      serviceType: '',
      serviceCategoryId: '',
      workType: 'installation',
      specificLocation: '',
      assignedDate: new Date().toISOString().split('T')[0],
      estimatedCompletionDate: '',
      observations: '',
    };

    setItems([...items, newItem]);
  };

  const removePartition = (key: string) => {
    const item = items.find((i) => i.key === key);
    if (!item) return;

    if (item.itemRole === 'primary') {
      Alert.alert('No se puede eliminar', 'La instalación principal es obligatoria');
      return;
    }

    if (items.length <= 1) {
      Alert.alert('No se puede eliminar', 'Debe haber al menos una instalación');
      return;
    }

    Alert.alert(
      'Eliminar partición',
      '¿Estás seguro de eliminar esta partición? Las fotos y firmas asociadas se perderán.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            setItems(items.filter((i) => i.key !== key));
          },
        },
      ]
    );
  };

  const updateItem = (key: string, field: keyof FormItem, value: any) => {
    setItems(items.map((item) =>
      item.key === key ? { ...item, [field]: value } : item
    ));
  };

  const getUnitLabel = (item: FormItem, index: number) => {
    if (item.itemRole === 'primary') return 'Instalación principal';
    const partitionIndex = items.filter((i) => i.itemRole === 'partition').indexOf(item);
    return `Partición ${partitionIndex + 1}`;
  };

  // ============================================
  // MANEJAR ENVÍO
  // ============================================

  const handleSubmit = async () => {
    // Validaciones
    if (!projectName.trim()) {
      Alert.alert('Error', 'El nombre del proyecto es obligatorio');
      return;
    }

    if (!address.trim()) {
      Alert.alert('Error', 'La dirección es obligatoria');
      return;
    }

    if (!technicianId) {
      Alert.alert('Error', 'Debes seleccionar un técnico');
      return;
    }

    if (!clientId) {
      Alert.alert('Error', 'Debes seleccionar un cliente');
      return;
    }

    // Validar items
    for (const item of items) {
      const index = items.indexOf(item);
      if (!item.name.trim()) {
        Alert.alert('Error', `La ${getUnitLabel(item, index)} debe tener un nombre`);
        return;
      }
      if (!item.serviceCategoryId) {
        Alert.alert('Error', `La ${getUnitLabel(item, index)} debe tener un servicio`);
        return;
      }
      if (!item.specificLocation.trim()) {
        Alert.alert('Error', `La ${getUnitLabel(item, index)} debe tener una ubicación`);
        return;
      }
    }

    try {
      setSaving(true);
      setError(null);

      // 1. Actualizar instalación
      const { error: updateError } = await supabase
        .from('installations')
        .update({
          project_name: projectName.trim(),
          address: address.trim(),
          client_id: clientId,
          technician_id: technicianId,
          installation_type: installationType.trim() || 'No especificado',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('organization_id', organizationId);

      if (updateError) throw updateError;

      // 2. Obtener items existentes para comparar
      const existingItemIds = originalItems.map((item) => item.id).filter((id) => id);
      const currentItemIds = items.map((item) => item.id).filter((id) => id);

      // 3. Eliminar items que ya no existen
      const itemsToDelete = existingItemIds.filter((id) => !currentItemIds.includes(id));
      if (itemsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('installation_items')
          .delete()
          .in('id', itemsToDelete)
          .eq('installation_id', id);
        if (deleteError) throw deleteError;
      }

      // 4. Actualizar o insertar items
      for (const item of items) {
        const itemData = {
          installation_id: id,
          organization_id: organizationId,
          position: items.indexOf(item) + 1,
          item_role: item.itemRole,
          name: item.name.trim(),
          service_type: item.serviceType || 'No especificado',
          service_category_id: item.serviceCategoryId || null,
          work_type: item.workType,
          specific_location: item.specificLocation.trim(),
          assigned_date: item.assignedDate || null,
          estimated_completion_date: item.estimatedCompletionDate || null,
          observations: item.observations.trim() || null,
        };

        if (item.id) {
          // Actualizar existente
          const { error: itemUpdateError } = await supabase
            .from('installation_items')
            .update(itemData)
            .eq('id', item.id)
            .eq('installation_id', id);
          if (itemUpdateError) throw itemUpdateError;
        } else {
          // Insertar nuevo
          const { error: itemInsertError } = await supabase
            .from('installation_items')
            .insert({
              ...itemData,
              status: 'pending',
            });
          if (itemInsertError) throw itemInsertError;
        }
      }

      Alert.alert(
        '¡Éxito!',
        'Instalación actualizada correctamente',
        [
          {
            text: 'Ver instalación',
            onPress: () => router.push(`/installations/${id}`),
          },
          {
            text: 'Volver al listado',
            onPress: () => router.push('/installations'),
          },
        ]
      );

    } catch (err) {
      console.error('Error updating installation:', err);
      setError((err as Error).message);
      Alert.alert('Error', 'No se pudo actualizar la instalación. Intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  if (loading || loadingData) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerScreen}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Cargando instalación...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <Stack.Screen
        options={{
          title: 'Editar Instalación',
          headerShown: true,
          headerBackTitle: 'Volver',
        }}
      />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={100}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Error banner */}
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{error}</Text>
            </View>
          )}

          {/* ========================================== */}
          {/* INFORMACIÓN COMPARTIDA */}
          {/* ========================================== */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionEyebrow}>Editar trabajo</Text>
              <Text style={styles.sectionTitle}>Información compartida</Text>
            </View>

            {/* Nombre del proyecto */}
            <View style={styles.field}>
              <Text style={styles.label}>Nombre del proyecto</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. Trabajo sucursal norte"
                placeholderTextColor={colors.muted}
                value={projectName}
                onChangeText={setProjectName}
              />
            </View>

            {/* Cliente */}
            <View style={styles.field}>
              <Text style={styles.label}>Cliente</Text>
              <View style={styles.selectWrapper}>
                <ScrollView style={styles.optionsContainer} nestedScrollEnabled>
                  {clients.map((client) => (
                    <Pressable
                      key={client.id}
                      style={[
                        styles.optionItem,
                        clientId === client.id && styles.optionItemSelected,
                      ]}
                      onPress={() => setClientId(client.id)}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          clientId === client.id && styles.optionTextSelected,
                        ]}
                      >
                        {client.name}
                      </Text>
                      {client.phone && (
                        <Text style={styles.optionSubtext}>📞 {client.phone}</Text>
                      )}
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>

            {/* Dirección */}
            <View style={styles.field}>
              <Text style={styles.label}>Dirección general</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Dirección completa"
                placeholderTextColor={colors.muted}
                value={address}
                onChangeText={setAddress}
                multiline
                numberOfLines={2}
              />
            </View>

            {/* Técnico */}
            <View style={styles.field}>
              <Text style={styles.label}>Técnico responsable</Text>
              <View style={styles.selectWrapper}>
                <ScrollView style={styles.optionsContainer} nestedScrollEnabled>
                  {technicians.map((tech) => (
                    <Pressable
                      key={tech.id}
                      style={[
                        styles.optionItem,
                        technicianId === tech.id && styles.optionItemSelected,
                      ]}
                      onPress={() => setTechnicianId(tech.id)}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          technicianId === tech.id && styles.optionTextSelected,
                        ]}
                      >
                        {tech.full_name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>

            {/* Tipo de instalación */}
            <View style={styles.field}>
              <Text style={styles.label}>Tipo de instalación</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. GPS vehicular, Alarmas, etc."
                placeholderTextColor={colors.muted}
                value={installationType}
                onChangeText={setInstallationType}
              />
            </View>
          </View>

          {/* ========================================== */}
          {/* INSTALACIÓN PRINCIPAL Y PARTICIONES */}
          {/* ========================================== */}
          <View style={styles.card}>
            <View style={styles.itemsHeader}>
              <View>
                <Text style={styles.sectionTitle}>Instalación principal y particiones</Text>
                <Text style={styles.itemsCounter}>
                  {items.length} de 10 instalaciones utilizadas
                </Text>
              </View>
              <Pressable
                style={[styles.addButton, items.length >= 10 && styles.addButtonDisabled]}
                onPress={addPartition}
                disabled={items.length >= 10}
              >
                <Text style={styles.addButtonText}>+</Text>
              </Pressable>
            </View>

            {items.map((item, index) => (
              <View key={item.key} style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <View>
                    <Text style={styles.itemTitle}>{getUnitLabel(item, index)}</Text>
                    <Text style={styles.itemSubtitle}>
                      {item.itemRole === 'primary' ? 'Obligatoria e independiente' : 'Unidad operativa adicional'}
                    </Text>
                  </View>
                  {item.itemRole !== 'primary' && (
                    <Pressable
                      style={styles.deleteButton}
                      onPress={() => removePartition(item.key)}
                    >
                      <Text style={styles.deleteButtonText}>🗑️</Text>
                    </Pressable>
                  )}
                </View>

                {/* Nombre */}
                <View style={styles.field}>
                  <Text style={styles.label}>Nombre o descripción del trabajo</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={item.itemRole === 'primary' ? 'Ej. Aire acondicionado' : 'Ej. Cámara de vigilancia'}
                    placeholderTextColor={colors.muted}
                    value={item.name}
                    onChangeText={(value) => updateItem(item.key, 'name', value)}
                  />
                </View>

                {/* Servicio */}
                <View style={styles.field}>
                  <Text style={styles.label}>Servicio</Text>
                  <Pressable
                    style={styles.serviceSelector}
                    onPress={() => {
                      setSelectedItemKey(item.key);
                      setServiceModalVisible(true);
                    }}
                  >
                    <Text style={item.serviceCategoryId ? styles.serviceSelected : styles.servicePlaceholder}>
                      {item.serviceCategoryId
                        ? serviceCategories.find((c) => c.id === item.serviceCategoryId)?.name || 'Seleccionar servicio'
                        : 'Selecciona un servicio'}
                    </Text>
                    <Text style={styles.serviceArrow}>▼</Text>
                  </Pressable>
                </View>

                {/* Tipo de trabajo */}
                <View style={styles.field}>
                  <Text style={styles.label}>Tipo de trabajo</Text>
                  <View style={styles.segmentedControl}>
                    <Pressable
                      style={[
                        styles.segmentButton,
                        item.workType === 'installation' && styles.segmentButtonActive,
                      ]}
                      onPress={() => updateItem(item.key, 'workType', 'installation')}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          item.workType === 'installation' && styles.segmentTextActive,
                        ]}
                      >
                        Instalación
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.segmentButton,
                        item.workType === 'maintenance' && styles.segmentButtonActive,
                      ]}
                      onPress={() => updateItem(item.key, 'workType', 'maintenance')}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          item.workType === 'maintenance' && styles.segmentTextActive,
                        ]}
                      >
                        Mantenimiento
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {/* Ubicación específica */}
                <View style={styles.field}>
                  <Text style={styles.label}>Ubicación o área específica</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ej. Oficina número 4"
                    placeholderTextColor={colors.muted}
                    value={item.specificLocation}
                    onChangeText={(value) => updateItem(item.key, 'specificLocation', value)}
                  />
                </View>

                {/* Fechas */}
                <View style={styles.rowFields}>
                  <View style={[styles.field, styles.halfField]}>
                    <Text style={styles.label}>Fecha asignada</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="AAAA-MM-DD"
                      placeholderTextColor={colors.muted}
                      value={item.assignedDate}
                      onChangeText={(value) => updateItem(item.key, 'assignedDate', value)}
                    />
                  </View>
                  <View style={[styles.field, styles.halfField]}>
                    <Text style={styles.label}>Fecha estimada</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="AAAA-MM-DD"
                      placeholderTextColor={colors.muted}
                      value={item.estimatedCompletionDate}
                      onChangeText={(value) => updateItem(item.key, 'estimatedCompletionDate', value)}
                    />
                  </View>
                </View>

                {/* Observaciones */}
                <View style={styles.field}>
                  <Text style={styles.label}>Observaciones de la unidad</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Notas particulares de esta instalación o partición"
                    placeholderTextColor={colors.muted}
                    value={item.observations}
                    onChangeText={(value) => updateItem(item.key, 'observations', value)}
                    multiline
                    numberOfLines={3}
                  />
                </View>
              </View>
            ))}
          </View>

          {/* Botón submit */}
          <Pressable
            style={[styles.submitButton, saving && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.submitButtonText}>Guardar cambios</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal de selección de servicio */}
      <Modal
        visible={serviceModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setServiceModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccionar servicio</Text>
              <Pressable onPress={() => setServiceModalVisible(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.modalList}>
              {serviceCategories.map((category) => (
                <Pressable
                  key={category.id}
                  style={[
                    styles.modalItem,
                    selectedItemKey &&
                      items.find((i) => i.key === selectedItemKey)?.serviceCategoryId === category.id &&
                      styles.modalItemSelected,
                  ]}
                  onPress={() => {
                    if (selectedItemKey) {
                      updateItem(selectedItemKey, 'serviceCategoryId', category.id);
                      updateItem(selectedItemKey, 'serviceType', category.name);
                      setServiceModalVisible(false);
                    }
                  }}
                >
                  <Text style={styles.modalItemName}>{category.name}</Text>
                  <Text style={styles.modalItemCode}>{category.code}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  errorBanner: {
    backgroundColor: '#fee2e2',
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorBannerText: {
    color: '#991b1b',
    fontSize: 14,
  },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  sectionHeader: {
    marginBottom: spacing.md,
  },
  sectionEyebrow: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  field: {
    marginBottom: spacing.md,
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
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  rowFields: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  halfField: {
    flex: 1,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: 'white',
  },
  segmentButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: 'white',
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '500',
  },
  segmentTextActive: {
    color: 'white',
  },
  selectWrapper: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: 'white',
    maxHeight: 150,
  },
  optionsContainer: {
    padding: spacing.xs,
  },
  optionItem: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionItemSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  optionText: {
    fontSize: 14,
    color: colors.text,
  },
  optionTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  optionSubtext: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  itemsCounter: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  addButton: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  itemCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  itemSubtitle: {
    fontSize: 12,
    color: colors.muted,
  },
  deleteButton: {
    padding: spacing.xs,
  },
  deleteButtonText: {
    fontSize: 18,
  },
  serviceSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'white',
    minHeight: 44,
  },
  serviceSelected: {
    fontSize: 16,
    color: colors.text,
  },
  servicePlaceholder: {
    fontSize: 16,
    color: colors.muted,
  },
  serviceArrow: {
    fontSize: 14,
    color: colors.muted,
  },
  submitButton: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    marginTop: spacing.sm,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  // Modal de servicios
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '70%',
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
  modalList: {
    maxHeight: 400,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalItemSelected: {
    backgroundColor: colors.primarySoft,
  },
  modalItemName: {
    fontSize: 16,
    color: colors.text,
  },
  modalItemCode: {
    fontSize: 14,
    color: colors.muted,
  },
});