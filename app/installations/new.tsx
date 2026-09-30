// app/installations/new.tsx
import React, { useState, useEffect } from 'react';
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
  BackHandler,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, radius, spacing } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { InstallationStatus, WorkType } from '../../types/database';

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

type FormItem = {
  key: string;
  id: string;
  itemRole: 'primary' | 'partition';
  name: string;
  serviceType: string;
  serviceCategoryId: string;
  workType: WorkType;
  specificLocation: string;
  assignedDate: Date;
  estimatedCompletionDate: Date | null;
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

export default function NewInstallationScreen() {
  const { selectedMembership } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Datos del formulario principal
  const [projectName, setProjectName] = useState('');
  const [address, setAddress] = useState('');
  const [technicianId, setTechnicianId] = useState('');

  // Cliente
  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing');
  const [clientId, setClientId] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');

  // Items (instalación principal + particiones)
  const [items, setItems] = useState<FormItem[]>([
    {
      key: generateId(),
      id: '',
      itemRole: 'primary',
      name: '',
      serviceType: '',
      serviceCategoryId: '',
      workType: 'installation',
      specificLocation: '',
      assignedDate: new Date(),
      estimatedCompletionDate: null,
      observations: '',
    },
  ]);

  // Datos cargados
  const [clients, setClients] = useState<Client[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Modal para seleccionar servicio
  const [serviceModalVisible, setServiceModalVisible] = useState(false);
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);

  // DatePicker
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [datePickerItemKey, setDatePickerItemKey] = useState<string | null>(null);
  const [datePickerField, setDatePickerField] = useState<
    'assignedDate' | 'estimatedCompletionDate'
  >('assignedDate');

  const organizationId = selectedMembership?.organizationId;

  // ============================================
  // CONTROL DE SALIDA / DATOS NO GUARDADOS
  // ============================================

  // Indica que la instalación ya se creó correctamente.
  // En ese caso, salir de la pantalla no debe mostrar advertencia.
  const [installationCreated, setInstallationCreated] = useState(false);

  const hasFormData = () => {
    const hasGeneralData =
      projectName.trim() !== '' ||
      address.trim() !== '' ||
      technicianId !== '' ||
      (clientMode === 'new' &&
        (newClientName.trim() !== '' ||
          newClientPhone.trim() !== '' ||
          newClientEmail.trim() !== ''));

    const hasItemData = items.some(
      (item) =>
        item.name.trim() !== '' ||
        item.serviceCategoryId !== '' ||
        item.serviceType.trim() !== '' ||
        item.specificLocation.trim() !== '' ||
        item.observations.trim() !== '' ||
        item.workType !== 'installation' ||
        item.estimatedCompletionDate !== null
    );

    // Si agregaron particiones, también consideramos que hay cambios.
    const hasPartitions = items.length > 1;

    return hasGeneralData || hasItemData || hasPartitions;
  };

  const resetForm = () => {
    setProjectName('');
    setAddress('');
    setTechnicianId('');
    setClientMode('existing');
    setClientId(clients[0]?.id || '');
    setNewClientName('');
    setNewClientPhone('');
    setNewClientEmail('');
    setItems([
      {
        key: generateId(),
        id: '',
        itemRole: 'primary',
        name: '',
        serviceType: '',
        serviceCategoryId: '',
        workType: 'installation',
        specificLocation: '',
        assignedDate: new Date(),
        estimatedCompletionDate: null,
        observations: '',
      },
    ]);
    setError(null);
    setServiceModalVisible(false);
    setSelectedItemKey(null);
    setDatePickerVisible(false);
    setDatePickerItemKey(null);
    setSaving(false);
  };

  // ============================================
  // MANEJAR SALIDA DE LA PANTALLA
  // ============================================

  const handleExit = () => {
    // Después de crear correctamente la instalación, salir normalmente.
    if (installationCreated) {
      router.back();
      return;
    }

    // Si no se ha escrito/agregado nada, salir normalmente.
    if (!hasFormData()) {
      router.back();
      return;
    }

    Alert.alert(
      'Salir de Nueva Instalación',
      'Se borrarán los datos insertados si sales de esta interfaz. ¿Deseas continuar?',
      [
        {
          text: 'No',
          style: 'cancel',
        },
        {
          text: 'Sí, salir',
          style: 'destructive',
          onPress: () => {
            resetForm();
            router.back();
          },
        },
      ]
    );
  };

  // Botón físico "Atrás" de Android.
  // En iOS utilizamos el botón personalizado del encabezado.
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        handleExit();
        return true;
      }
    );

    return () => subscription.remove();
  }, [
    installationCreated,
    projectName,
    address,
    technicianId,
    clientMode,
    clientId,
    newClientName,
    newClientPhone,
    newClientEmail,
    items,
  ]);

  // ============================================
  // CARGAR DATOS
  // ============================================

  useEffect(() => {
    async function loadData() {
      if (!organizationId) return;

      try {
        setLoadingData(true);
        setError(null);

        // 1. Clientes
        const { data: clientsData } = await supabase
          .from('clients')
          .select('id, name, phone, email')
          .eq('organization_id', organizationId)
          .order('name');

        setClients(clientsData || []);

        // 2. Técnicos
        const { data: techniciansData } = await supabase
          .from('profiles')
          .select('id, full_name, active')
          .eq('role', 'technician')
          .eq('active', true);

        setTechnicians(techniciansData || []);

        // 3. Categorías de servicio
        const { data: categoriesData } = await supabase
          .from('service_categories')
          .select('id, name, code, description, active')
          .eq('active', true)
          .order('sort_order', { ascending: true });

        setServiceCategories(categoriesData || []);

        // Seleccionar primer cliente por defecto
        if (clientsData && clientsData.length > 0) {
          setClientId(clientsData[0].id);
        }
      } catch (err) {
        console.error('Error loading data:', err);
        setError((err as Error).message);
      } finally {
        setLoadingData(false);
      }
    }

    loadData();
  }, [organizationId]);

  // ============================================
  // MANEJAR ITEMS
  // ============================================

  const addPartition = () => {
    if (items.length >= 10) {
      Alert.alert(
        'Límite alcanzado',
        'Máximo 10 instalaciones por trabajo'
      );
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
      assignedDate: new Date(),
      estimatedCompletionDate: null,
      observations: '',
    };

    setItems((currentItems) => [...currentItems, newItem]);
  };

  const removePartition = (key: string) => {
    const item = items.find((i) => i.key === key);

    if (!item) return;

    if (item.itemRole === 'primary') {
      Alert.alert(
        'No se puede eliminar',
        'La instalación principal es obligatoria'
      );
      return;
    }

    if (items.length <= 1) {
      Alert.alert(
        'No se puede eliminar',
        'Debe haber al menos una instalación'
      );
      return;
    }

    Alert.alert(
      'Eliminar partición',
      '¿Estás seguro de eliminar esta partición?',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            setItems((currentItems) =>
              currentItems.filter((i) => i.key !== key)
            );
          },
        },
      ]
    );
  };

  // ============================================
  // ACTUALIZAR ITEM
  // ============================================

  const updateItem = (
    key: string,
    field: keyof FormItem,
    value: any
  ) => {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.key === key
          ? {
              ...item,
              [field]: value,
            }
          : item
      )
    );
  };

  const getUnitLabel = (item: FormItem, index: number) => {
    if (item.itemRole === 'primary') {
      return 'Instalación principal';
    }

    const partitionIndex = items
      .filter((i) => i.itemRole === 'partition')
      .indexOf(item);

    return `Partición ${partitionIndex + 1}`;
  };

  // ============================================
  // MANEJAR FECHAS
  // ============================================

  const formatDate = (date: Date | null) => {
    if (!date) return 'No seleccionada';

    return date.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatDateForDB = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const showDatePicker = (
    itemKey: string,
    field: 'assignedDate' | 'estimatedCompletionDate'
  ) => {
    setDatePickerItemKey(itemKey);
    setDatePickerField(field);
    setDatePickerVisible(true);
  };

  const handleDateChange = (
    event: any,
    selectedDate?: Date
  ) => {
    setDatePickerVisible(false);

    if (selectedDate && datePickerItemKey) {
      updateItem(
        datePickerItemKey,
        datePickerField,
        selectedDate
      );
    }
  };

  // ============================================
  // MANEJAR SELECCIÓN DE SERVICIO
  // ============================================

  const handleSelectService = (category: ServiceCategory) => {
    if (!selectedItemKey) {
      return;
    }

    // IMPORTANTE:
    // Actualizamos ambos valores en una sola operación
    // usando el estado más reciente de React.
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.key === selectedItemKey
          ? {
              ...item,
              serviceCategoryId: category.id,
              serviceType: category.name,
            }
          : item
      )
    );

    setServiceModalVisible(false);
    setSelectedItemKey(null);
  };

  // ============================================
  // MANEJAR ENVÍO
  // ============================================

  const handleSubmit = async () => {
    // Validaciones
    if (!projectName.trim()) {
      Alert.alert(
        'Error',
        'El nombre del proyecto es obligatorio'
      );
      return;
    }

    if (!address.trim()) {
      Alert.alert(
        'Error',
        'La dirección es obligatoria'
      );
      return;
    }

    if (!technicianId) {
      Alert.alert(
        'Error',
        'Debes seleccionar un técnico'
      );
      return;
    }

    // Validar cliente
    if (clientMode === 'existing' && !clientId) {
      Alert.alert(
        'Error',
        'Debes seleccionar un cliente'
      );
      return;
    }

    if (clientMode === 'new' && !newClientName.trim()) {
      Alert.alert(
        'Error',
        'Debes ingresar el nombre del cliente'
      );
      return;
    }

    // Validar items
    for (const item of items) {
      const index = items.indexOf(item);

      if (!item.name.trim()) {
        Alert.alert(
          'Error',
          `La ${getUnitLabel(item, index)} debe tener un nombre`
        );
        return;
      }

      if (!item.serviceCategoryId) {
        Alert.alert(
          'Error',
          `La ${getUnitLabel(item, index)} debe tener un servicio`
        );
        return;
      }

      if (!item.specificLocation.trim()) {
        Alert.alert(
          'Error',
          `La ${getUnitLabel(item, index)} debe tener una ubicación`
        );
        return;
      }
    }

    try {
      setSaving(true);
      setError(null);

      let finalClientId = clientId;

      // Si es cliente nuevo, crearlo primero
      if (clientMode === 'new') {
        const { data: newClient, error: clientError } =
          await supabase
            .from('clients')
            .insert({
              organization_id: organizationId,
              name: newClientName.trim(),
              phone: newClientPhone.trim() || null,
              email: newClientEmail.trim() || null,
            })
            .select()
            .single();

        if (clientError) {
          throw clientError;
        }

        finalClientId = newClient.id;
      }

      // Crear instalación
      const {
        data: installation,
        error: installError,
      } = await supabase
        .from('installations')
        .insert({
          organization_id: organizationId,
          project_name: projectName.trim(),
          address: address.trim(),
          client_id: finalClientId,
          technician_id: technicianId,
          assigned_date: formatDateForDB(
            items[0]?.assignedDate || new Date()
          ),
          installation_type:
            items[0]?.serviceType || 'No especificado',
          status: 'pending' as InstallationStatus,
        })
        .select()
        .single();

      if (installError) {
        console.error(
          'Installation insert error:',
          installError
        );
        throw installError;
      }

      // Crear items
      const itemsToInsert = items.map((item, index) => ({
        organization_id: organizationId,
        installation_id: installation.id,
        position: index + 1,
        item_role: item.itemRole,
        name: item.name.trim(),
        service_type:
          item.serviceType || 'No especificado',
        service_category_id:
          item.serviceCategoryId || null,
        work_type: item.workType,
        specific_location:
          item.specificLocation.trim(),
        status: 'pending' as InstallationStatus,
        assigned_date:
          formatDateForDB(item.assignedDate),
        estimated_completion_date:
          item.estimatedCompletionDate
            ? formatDateForDB(
                item.estimatedCompletionDate
              )
            : null,
        observations:
          item.observations.trim() || null,
      }));

      const { error: itemsError } =
        await supabase
          .from('installation_items')
          .insert(itemsToInsert);

      if (itemsError) {
        console.error(
          'Items insert error:',
          itemsError
        );
        throw itemsError;
      }

      // La instalación ya fue creada correctamente.
      // A partir de aquí, salir de esta pantalla no debe borrar ni advertir
      // sobre los datos del formulario.
      setInstallationCreated(true);

      Alert.alert(
        '¡Éxito!',
        'Instalación creada correctamente',
        [
          {
            text: 'Ver instalación',
            onPress: () =>
              router.push(
                `/installations/${installation.id}`
              ),
          },
          {
            text: 'Volver al listado',
            onPress: () =>
              router.push('/installations'),
          },
        ]
      );
    } catch (err) {
      console.error(
        'Error creating installation:',
        err
      );

      setError((err as Error).message);

      Alert.alert(
        'Error',
        'No se pudo crear la instalación. Intenta nuevamente.'
      );
    } finally {
      setSaving(false);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  if (loadingData) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerScreen}>
          <ActivityIndicator
            size="large"
            color={colors.primary}
          />

          <Text style={styles.loadingText}>
            Cargando datos...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      <Stack.Screen
        options={{
          title: 'Nueva Instalación',
          headerShown: true,
          headerBackTitle: 'Volver',
          // Desactivamos el gesto de volver para que la salida siempre pase
          // por nuestra confirmación.
          gestureEnabled: false,
          headerLeft: () => (
            <Pressable
              onPress={handleExit}
              hitSlop={8}
              style={{ paddingRight: 12 }}
            >
              <Text
                style={{
                  fontSize: 30,
                  lineHeight: 32,
                  color: colors.primary,
                  fontWeight: '400',
                }}
              >
                ‹
              </Text>
            </Pressable>
          ),
        }}
      />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : 'height'
        }
        keyboardVerticalOffset={100}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Error banner */}
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>
                {error}
              </Text>
            </View>
          )}

          {/* ========================================== */}
          {/* INFORMACIÓN COMPARTIDA */}
          {/* ========================================== */}

          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionEyebrow}>
                Datos generales del trabajo
              </Text>

              <Text style={styles.sectionTitle}>
                Información compartida
              </Text>
            </View>

            {/* Nombre del proyecto */}
            <View style={styles.field}>
              <Text style={styles.label}>
                Nombre del proyecto
              </Text>

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
              <Text style={styles.label}>
                Cliente
              </Text>

              <View style={styles.segmentedControl}>
                <Pressable
                  style={[
                    styles.segmentButton,
                    clientMode === 'existing' &&
                      styles.segmentButtonActive,
                  ]}
                  onPress={() =>
                    setClientMode('existing')
                  }
                >
                  <Text
                    style={[
                      styles.segmentText,
                      clientMode === 'existing' &&
                        styles.segmentTextActive,
                    ]}
                  >
                    Cliente existente
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.segmentButton,
                    clientMode === 'new' &&
                      styles.segmentButtonActive,
                  ]}
                  onPress={() =>
                    setClientMode('new')
                  }
                >
                  <Text
                    style={[
                      styles.segmentText,
                      clientMode === 'new' &&
                        styles.segmentTextActive,
                    ]}
                  >
                    Cliente nuevo
                  </Text>
                </Pressable>
              </View>

              {clientMode === 'existing' ? (
                <View style={styles.selectWrapper}>
                  <ScrollView
                    style={styles.optionsContainer}
                    nestedScrollEnabled
                  >
                    {clients.map((client) => (
                      <Pressable
                        key={client.id}
                        style={[
                          styles.optionItem,
                          clientId === client.id &&
                            styles.optionItemSelected,
                        ]}
                        onPress={() =>
                          setClientId(client.id)
                        }
                      >
                        <Text
                          style={[
                            styles.optionText,
                            clientId === client.id &&
                              styles.optionTextSelected,
                          ]}
                        >
                          {client.name}
                        </Text>

                        {client.phone && (
                          <Text
                            style={
                              styles.optionSubtext
                            }
                          >
                            📞 {client.phone}
                          </Text>
                        )}
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : (
                <View>
                  <TextInput
                    style={styles.input}
                    placeholder="Nombre del cliente"
                    placeholderTextColor={
                      colors.muted
                    }
                    value={newClientName}
                    onChangeText={setNewClientName}
                  />

                  <TextInput
                    style={[
                      styles.input,
                      styles.inputMarginTop,
                    ]}
                    placeholder="Teléfono (opcional)"
                    placeholderTextColor={
                      colors.muted
                    }
                    value={newClientPhone}
                    onChangeText={setNewClientPhone}
                    keyboardType="phone-pad"
                  />

                  <TextInput
                    style={[
                      styles.input,
                      styles.inputMarginTop,
                    ]}
                    placeholder="Correo (opcional)"
                    placeholderTextColor={
                      colors.muted
                    }
                    value={newClientEmail}
                    onChangeText={setNewClientEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              )}
            </View>

            {/* Dirección */}
            <View style={styles.field}>
              <Text style={styles.label}>
                Dirección general
              </Text>

              <TextInput
                style={[
                  styles.input,
                  styles.textArea,
                ]}
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
              <Text style={styles.label}>
                Técnico responsable
              </Text>

              <View style={styles.selectWrapper}>
                <ScrollView
                  style={styles.optionsContainer}
                  nestedScrollEnabled
                >
                  {technicians.map((tech) => (
                    <Pressable
                      key={tech.id}
                      style={[
                        styles.optionItem,
                        technicianId === tech.id &&
                          styles.optionItemSelected,
                      ]}
                      onPress={() =>
                        setTechnicianId(tech.id)
                      }
                    >
                      <Text
                        style={[
                          styles.optionText,
                          technicianId === tech.id &&
                            styles.optionTextSelected,
                        ]}
                      >
                        {tech.full_name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>
          </View>

          {/* ========================================== */}
          {/* INSTALACIÓN PRINCIPAL Y PARTICIONES */}
          {/* ========================================== */}

          <View style={styles.card}>
            <View style={styles.itemsHeader}>
              <View>
                <Text style={styles.sectionTitle}>
                  Instalación principal y particiones
                </Text>

                <Text style={styles.itemsCounter}>
                  {items.length} de 10 instalaciones
                  utilizadas
                </Text>
              </View>

              <Pressable
                style={[
                  styles.addButton,
                  items.length >= 10 &&
                    styles.addButtonDisabled,
                ]}
                onPress={addPartition}
                disabled={items.length >= 10}
              >
                <Text style={styles.addButtonText}>
                  + 
                </Text>
              </Pressable>
            </View>

            {items.map((item, index) => (
              <View
                key={item.key}
                style={styles.itemCard}
              >
                <View style={styles.itemHeader}>
                  <View>
                    <Text style={styles.itemTitle}>
                      {getUnitLabel(item, index)}
                    </Text>

                    <Text
                      style={styles.itemSubtitle}
                    >
                      {item.itemRole === 'primary'
                        ? 'Obligatoria e independiente'
                        : 'Unidad operativa adicional'}
                    </Text>
                  </View>

                  {item.itemRole !== 'primary' && (
                    <Pressable
                      style={styles.deleteButton}
                      onPress={() =>
                        removePartition(item.key)
                      }
                    >
                      <Text
                        style={
                          styles.deleteButtonText
                        }
                      >
                        🗑️
                      </Text>
                    </Pressable>
                  )}
                </View>

                {/* Nombre */}
                <View style={styles.field}>
                  <Text style={styles.label}>
                    Nombre o descripción del trabajo
                  </Text>

                  <TextInput
                    style={styles.input}
                    placeholder={
                      item.itemRole === 'primary'
                        ? 'Ej. Aire acondicionado'
                        : 'Ej. Cámara de vigilancia'
                    }
                    placeholderTextColor={
                      colors.muted
                    }
                    value={item.name}
                    onChangeText={(value) =>
                      updateItem(
                        item.key,
                        'name',
                        value
                      )
                    }
                  />
                </View>

                {/* Servicio */}
                <View style={styles.field}>
                  <Text style={styles.label}>
                    Servicio
                  </Text>

                  <Pressable
                    style={styles.serviceSelector}
                    onPress={() => {
                      setSelectedItemKey(item.key);
                      setServiceModalVisible(true);
                    }}
                  >
                    <Text
                      style={
                        item.serviceCategoryId
                          ? styles.serviceSelected
                          : styles.servicePlaceholder
                      }
                    >
                      {item.serviceCategoryId
                        ? serviceCategories.find(
                            (c) =>
                              c.id ===
                              item.serviceCategoryId
                          )?.name ||
                          'Seleccionar servicio'
                        : 'Selecciona un servicio'}
                    </Text>

                    <Text
                      style={styles.serviceArrow}
                    >
                      ▼
                    </Text>
                  </Pressable>
                </View>

                {/* Tipo de trabajo */}
                <View style={styles.field}>
                  <Text style={styles.label}>
                    Tipo de trabajo
                  </Text>

                  <View style={styles.segmentedControl}>
                    <Pressable
                      style={[
                        styles.segmentButton,
                        item.workType ===
                          'installation' &&
                          styles.segmentButtonActive,
                      ]}
                      onPress={() =>
                        updateItem(
                          item.key,
                          'workType',
                          'installation'
                        )
                      }
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          item.workType ===
                            'installation' &&
                            styles.segmentTextActive,
                        ]}
                      >
                        Instalación
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[
                        styles.segmentButton,
                        item.workType ===
                          'maintenance' &&
                          styles.segmentButtonActive,
                      ]}
                      onPress={() =>
                        updateItem(
                          item.key,
                          'workType',
                          'maintenance'
                        )
                      }
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          item.workType ===
                            'maintenance' &&
                            styles.segmentTextActive,
                        ]}
                      >
                        Mantenimiento
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {/* Ubicación específica */}
                <View style={styles.field}>
                  <Text style={styles.label}>
                    Ubicación o área específica
                  </Text>

                  <TextInput
                    style={styles.input}
                    placeholder="Ej. Oficina número 4"
                    placeholderTextColor={
                      colors.muted
                    }
                    value={item.specificLocation}
                    onChangeText={(value) =>
                      updateItem(
                        item.key,
                        'specificLocation',
                        value
                      )
                    }
                  />
                </View>

                {/* Fechas */}
                <View style={styles.rowFields}>
                  <View
                    style={[
                      styles.field,
                      styles.halfField,
                    ]}
                  >
                    <Text style={styles.label}>
                      Fecha asignada
                    </Text>

                    <Pressable
                      style={styles.dateButton}
                      onPress={() =>
                        showDatePicker(
                          item.key,
                          'assignedDate'
                        )
                      }
                    >
                      <Text
                        style={styles.dateButtonText}
                      >
                        {formatDate(
                          item.assignedDate
                        )}
                      </Text>
                    </Pressable>
                  </View>

                  <View
                    style={[
                      styles.field,
                      styles.halfField,
                    ]}
                  >
                    <Text style={styles.label}>
                      Fecha de termino
                    </Text>

                    <Pressable
                      style={styles.dateButton}
                      onPress={() =>
                        showDatePicker(
                          item.key,
                          'estimatedCompletionDate'
                        )
                      }
                    >
                      <Text
                        style={styles.dateButtonText}
                      >
                        {formatDate(
                          item.estimatedCompletionDate
                        )}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {/* Observaciones */}
                <View style={styles.field}>
                  <Text style={styles.label}>
                    Observaciones de la unidad
                  </Text>

                  <TextInput
                    style={[
                      styles.input,
                      styles.textArea,
                    ]}
                    placeholder="Notas particulares de esta instalación o partición"
                    placeholderTextColor={
                      colors.muted
                    }
                    value={item.observations}
                    onChangeText={(value) =>
                      updateItem(
                        item.key,
                        'observations',
                        value
                      )
                    }
                    multiline
                    numberOfLines={3}
                  />
                </View>
              </View>
            ))}
          </View>

          {/* Botón submit */}
          <Pressable
            style={[
              styles.submitButton,
              saving &&
                styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator
                size="small"
                color="white"
              />
            ) : (
              <Text
                style={styles.submitButtonText}
              >
                Crear instalación
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ========================================== */}
      {/* MODAL DE SELECCIÓN DE SERVICIO */}
      {/* ========================================== */}

      <Modal
        visible={serviceModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setServiceModalVisible(false);
          setSelectedItemKey(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Seleccionar servicio
              </Text>

              <Pressable
                onPress={() => {
                  setServiceModalVisible(false);
                  setSelectedItemKey(null);
                }}
              >
                <Text style={styles.modalClose}>
                  ✕
                </Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalList}
              showsVerticalScrollIndicator={false}
            >
              {serviceCategories.map((category) => {
                const currentItem =
                  selectedItemKey
                    ? items.find(
                        (i) =>
                          i.key === selectedItemKey
                      )
                    : null;

                const isSelected =
                  currentItem?.serviceCategoryId ===
                  category.id;

                return (
                  <Pressable
                    key={category.id}
                    style={[
                      styles.modalItem,
                      isSelected &&
                        styles.modalItemSelected,
                    ]}
                    onPress={() =>
                      handleSelectService(category)
                    }
                  >
                    <Text
                      style={[
                        styles.modalItemName,
                        isSelected &&
                          styles.modalItemNameSelected,
                      ]}
                    >
                      {category.name}
                    </Text>

                    <Text
                      style={[
                        styles.modalItemCode,
                        isSelected &&
                          styles.modalItemCodeSelected,
                      ]}
                    >
                      {category.code}
                    </Text>

                    {isSelected && (
                      <Text
                        style={
                          styles.modalItemCheck
                        }
                      >
                        ✓
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========================================== */}
      {/* DATE PICKER */}
      {/* ========================================== */}

      {datePickerVisible && (
        <DateTimePicker
          value={
            datePickerItemKey
              ? datePickerField ===
                'assignedDate'
                ? items.find(
                    (i) =>
                      i.key === datePickerItemKey
                  )?.assignedDate || new Date()
                : items.find(
                    (i) =>
                      i.key === datePickerItemKey
                  )?.estimatedCompletionDate ||
                  new Date()
              : new Date()
          }
          mode="date"
          display="default"
          onChange={handleDateChange}
          positiveButtonLabel="Aceptar"
          negativeButtonLabel="Cancelar"
        />
      )}
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

  inputMarginTop: {
    marginTop: spacing.sm,
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

  // ==========================================
  // SELECTOR DE SERVICIO
  // ==========================================

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
    fontWeight: '500',
    flex: 1,
  },

  servicePlaceholder: {
    fontSize: 16,
    color: colors.muted,
    flex: 1,
  },

  serviceArrow: {
    fontSize: 14,
    color: colors.muted,
    marginLeft: spacing.sm,
  },

  dateButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'white',
    minHeight: 44,
    justifyContent: 'center',
  },

  dateButtonText: {
    fontSize: 16,
    color: colors.text,
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

  // ==========================================
  // MODAL
  // ==========================================

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
    borderColor: colors.primary,
    borderWidth: 1,
  },

  modalItemName: {
    fontSize: 16,
    color: colors.text,
    flex: 1,
  },

  modalItemNameSelected: {
    color: colors.primary,
    fontWeight: '600',
  },

  modalItemCode: {
    fontSize: 14,
    color: colors.muted,
    marginLeft: spacing.sm,
  },

  modalItemCodeSelected: {
    color: colors.primary,
  },

  modalItemCheck: {
    fontSize: 18,
    color: colors.primary,
    fontWeight: '700',
    marginLeft: spacing.sm,
  },
});