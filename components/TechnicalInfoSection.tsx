import { useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
  type BarcodeType,
} from 'expo-camera';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../constants/theme';
import { useTechnicalInfo } from '../hooks/useTechnicalInfo';
import type {
  InstallationEquipment,
  InstallationItem,
  ServiceFieldDefinition,
} from '../types/database';

type TechnicalInfoSectionProps = {
  organizationId: string;
  installationId: string;
  item: InstallationItem;
};

const WORK_TYPE_LABELS = {
  installation: 'Instalación',
  maintenance: 'Mantenimiento',
};

const RECORD_STATUS_LABELS = {
  draft: 'Borrador',
  submitted: 'En revisión',
  verified: 'Verificada',
  correction_required: 'Corrección requerida',
};

const SCANNER_BARCODE_TYPES: BarcodeType[] = [
  'qr',
  'code128',
  'code39',
  'code93',
  'codabar',
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'itf14',
];

const SCANNER_FORMAT_LABELS: Record<string, string> = {
  qr: 'QR',
  code128: 'Code 128',
  code39: 'Code 39',
  code93: 'Code 93',
  codabar: 'Codabar',
  ean13: 'EAN-13',
  ean8: 'EAN-8',
  upc_a: 'UPC-A',
  upc_e: 'UPC-E',
  itf14: 'ITF-14',
};

// ---------------------------------------------------------------------------
// Parser de datos de etiqueta (SN / MARCA / MODELO)
// ---------------------------------------------------------------------------

type ParsedLabelData = {
  serialNumber: string;
  brand?: string;
  model?: string;
};

const SERIAL_KEYS = ['sn', 'serial', 'serialnumber', 'serie', 'noserie', 'numserie', 'nserie', 'nodeserie'];
const BRAND_KEYS = ['marca', 'brand', 'fabricante', 'manufacturer'];
const MODEL_KEYS = ['modelo', 'model', 'mod'];

function normalizeKey(key: string) {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function extractFromRecord(record: Record<string, unknown>): ParsedLabelData {
  let serialNumber = '';
  let brand: string | undefined;
  let model: string | undefined;

  for (const [key, rawValue] of Object.entries(record)) {
    if (rawValue === null || rawValue === undefined) continue;
    const value = String(rawValue).trim();
    if (!value) continue;

    const normalizedKey = normalizeKey(key);

    if (!serialNumber && SERIAL_KEYS.includes(normalizedKey)) {
      serialNumber = value;
    } else if (!brand && BRAND_KEYS.includes(normalizedKey)) {
      brand = value;
    } else if (!model && MODEL_KEYS.includes(normalizedKey)) {
      model = value;
    }
  }

  return { serialNumber, brand, model };
}

function extractLabeledFields(raw: string): ParsedLabelData {
  const pattern =
    /(S\/?N|SERIAL(?:\s*NUMBER)?|SERIE|N[°ºo]?\.?\s*(?:DE\s*)?SERIE|MARCA|BRAND|FABRICANTE|MODELO|MODEL|MOD)\s*[:#=\-]\s*([^\n;,|]+)/gi;

  let match: RegExpExecArray | null;
  let serialNumber = '';
  let brand: string | undefined;
  let model: string | undefined;

  while ((match = pattern.exec(raw)) !== null) {
    const label = normalizeKey(match[1]);
    const value = match[2].trim();
    if (!value) continue;

    if (!serialNumber && SERIAL_KEYS.includes(label)) {
      serialNumber = value;
    } else if (!brand && BRAND_KEYS.includes(label)) {
      brand = value;
    } else if (!model && MODEL_KEYS.includes(label)) {
      model = value;
    }
  }

  return { serialNumber, brand, model };
}

function parseEquipmentLabelData(raw: string): ParsedLabelData {
  const value = raw.trim();

  // 1. JSON
  try {
    const parsedJson = JSON.parse(value);
    if (parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
      const extracted = extractFromRecord(parsedJson as Record<string, unknown>);
      if (extracted.serialNumber) {
        return extracted;
      }
    }
  } catch {
    // No es JSON
  }

  // 2. URL con parámetros
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const record: Record<string, unknown> = {};
      url.searchParams.forEach((paramValue, paramKey) => {
        record[paramKey] = paramValue;
      });
      const extracted = extractFromRecord(record);
      if (extracted.serialNumber) {
        return extracted;
      }
    } catch {
      // URL inválida
    }
  }

  // 3. Texto con etiquetas
  const labeled = extractLabeledFields(value);
  if (labeled.serialNumber) {
    return labeled;
  }

  // 4. Fallback: el QR solo trae el serial
  return { serialNumber: value };
}

type PendingScan = {
  equipmentId: string;
  value: string;
  format: string;
  parsed: ParsedLabelData;
};

function normalizeScannerFormat(format: string) {
  const normalized = format.toLowerCase().replace(/[\s-]/g, '_');
  const aliases: Record<string, string> = {
    code_128: 'code128',
    code_39: 'code39',
    code_93: 'code93',
    ean_13: 'ean13',
    ean_8: 'ean8',
    upca: 'upc_a',
    upc_a: 'upc_a',
    upce: 'upc_e',
    upc_e: 'upc_e',
    itf_14: 'itf14',
    qr_code: 'qr',
  };

  return aliases[normalized] ?? normalized;
}

function getScannerFormatLabel(format: string) {
  const normalized = normalizeScannerFormat(format);
  return SCANNER_FORMAT_LABELS[normalized] ?? format;
}

function getOptions(definition: ServiceFieldDefinition) {
  return Array.isArray(definition.options)
    ? definition.options.filter((option): option is string => typeof option === 'string')
    : [];
}

function shouldShowField(
  definition: ServiceFieldDefinition,
  fieldValues: Record<string, string>,
  definitions: ServiceFieldDefinition[],
) {
  if (definition.code !== 'route') {
    return true;
  }

  const vehicleTypeDefinition = definitions.find((field) => field.code === 'vehicle_type');
  const vehicleType = vehicleTypeDefinition ? fieldValues[vehicleTypeDefinition.id] : '';
  return vehicleType === 'Colectivo';
}

function getFieldRequiredLabel(
  definition: ServiceFieldDefinition,
  fieldValues: Record<string, string>,
  definitions: ServiceFieldDefinition[],
) {
  if (definition.is_required) {
    return 'Requerido';
  }

  if (definition.code === 'route') {
    const vehicleTypeDefinition = definitions.find((field) => field.code === 'vehicle_type');
    const vehicleType = vehicleTypeDefinition ? fieldValues[vehicleTypeDefinition.id] : '';
    return vehicleType === 'Colectivo' ? 'Requerido' : 'Opcional';
  }

  return 'Opcional';
}

function hasEquipmentCapturedData(
  entry: InstallationEquipment,
  labelPhotoCount: number,
) {
  return Boolean(
    entry.serial_number?.trim() ||
      entry.brand?.trim() ||
      entry.model?.trim() ||
      entry.observations?.trim() ||
      entry.detected_value?.trim() ||
      entry.confirmed_value?.trim() ||
      labelPhotoCount > 0,
  );
}

export function TechnicalInfoSection({
  organizationId,
  installationId,
  item,
}: TechnicalInfoSectionProps) {
  const [scannerTargetId, setScannerTargetId] = useState<string | null>(null);
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null);
  const fieldInputRefs = useRef<Record<string, TextInput | null>>({});
  const equipmentInputRefs = useRef<Record<string, TextInput | null>>({});
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const {
    category,
    fieldDefinitions,
    record,
    fieldValues,
    equipment,
    equipmentLabelPhotoCounts,
    validationErrors,
    isLoading,
    isSaving,
    message,
    isError,
    canEdit,
    requiresEquipment,
    requiresEquipmentSerial,
    setFieldValue,
    saveProgress,
    addEquipment,
    updateEquipmentDraft,
    updateEquipment,
    removeEquipment,
    saveScannedValue,
    uploadLabelPhoto,
  } = useTechnicalInfo({
    organizationId,
    installationId,
    item,
  });

  async function openScanner(equipmentId: string) {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();

      if (!permission.granted) {
        return;
      }
    }

    setPendingScan(null);
    setScannerTargetId(equipmentId);
  }

  async function takeLabelPhoto(equipmentId: string) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
      exif: false,
      base64: false,
    });

    if (!result.canceled) {
      await uploadLabelPhoto(equipmentId, result.assets[0]);
    }
  }

  function confirmSaveProgress() {
    Alert.alert(
      'Guardar información técnica',
      'Confirma que los datos capturados son correctos para esta unidad.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Guardar', onPress: () => void saveProgress() },
      ],
    );
  }

  function focusValidationTarget(target: { type: 'field' | 'equipment'; id: string } | null) {
    if (!target) {
      return;
    }

    setTimeout(() => {
      if (target.type === 'field') {
        fieldInputRefs.current[target.id]?.focus();
        return;
      }

      equipmentInputRefs.current[target.id]?.focus();
    }, 120);
  }

  function handleScan(result: BarcodeScanningResult) {
    const scannedValue = result.data?.trim();

    if (!scannerTargetId || pendingScan || !scannedValue) {
      return;
    }

    const normalizedFormat = normalizeScannerFormat(result.type);
    const parsed = parseEquipmentLabelData(scannedValue);

    console.info(
      '[technical-scanner]',
      JSON.stringify({
        event: 'barcode_detected',
        format: normalizedFormat,
        valueLength: scannedValue.length,
        hasBrand: Boolean(parsed.brand),
        hasModel: Boolean(parsed.model),
      }),
    );

    setPendingScan({
      equipmentId: scannerTargetId,
      value: scannedValue,
      format: normalizedFormat,
      parsed,
    });
  }

  async function confirmScanValue() {
    if (!pendingScan) {
      return;
    }

    const { equipmentId, value, parsed } = pendingScan;
    const source = normalizeScannerFormat(pendingScan.format) === 'qr' ? 'qr' : 'barcode';

    await saveScannedValue(equipmentId, parsed.serialNumber || value, source);

    if (parsed.brand || parsed.model) {
      updateEquipment(equipmentId, {
        ...(parsed.brand ? { brand: parsed.brand } : {}),
        ...(parsed.model ? { model: parsed.model } : {}),
      });
    }

    setPendingScan(null);
    setScannerTargetId(null);
  }

  function closeScanner() {
    setPendingScan(null);
    setScannerTargetId(null);
  }

  function confirmRemoveEquipment(entry: InstallationEquipment, index: number) {
    if (index === 0 || !canEdit || isSaving) {
      return;
    }

    const equipmentLabel = `Equipo ${index + 1}`;
    const labelPhotoCount = equipmentLabelPhotoCounts[entry.id] ?? 0;
    const remove = () => void removeEquipment(entry.id);

    if (!hasEquipmentCapturedData(entry, labelPhotoCount)) {
      remove();
      return;
    }

    Alert.alert(
      'Eliminar equipo',
      `${equipmentLabel} tiene datos capturados${labelPhotoCount > 0 ? ' o foto de etiqueta' : ''}. Si lo eliminas, desaparecerá únicamente este equipo de la captura técnica.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar equipo', style: 'destructive', onPress: remove },
      ],
    );
  }

  function updateEquipmentField(
    entry: InstallationEquipment,
    field: keyof Pick<InstallationEquipment, 'serial_number' | 'brand' | 'model' | 'observations' | 'confirmed_value'>,
    value: string,
  ) {
    const nextValues: Partial<InstallationEquipment> = { [field]: value };

    if (field === 'serial_number') {
      nextValues.confirmed_value = value;
    }

    updateEquipment(entry.id, nextValues);
  }

  if (!item.serviceCategoryId) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Información técnica</Text>
        <Text style={styles.description}>
          Esta unidad fue creada antes del catálogo de servicios. Actualiza el servicio desde el
          panel administrativo para habilitar la captura técnica.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Información técnica</Text>
          <Text style={styles.description}>
            {category?.name ?? item.serviceType} · {WORK_TYPE_LABELS[item.workType ?? 'installation']}
          </Text>
        </View>
        {record ? (
          <View style={[styles.statusPill, record.status === 'verified' ? styles.statusPillSuccess : null]}>
            <Text style={styles.statusPillText}>{RECORD_STATUS_LABELS[record.status]}</Text>
          </View>
        ) : null}
      </View>

      {isLoading ? (
        <Text style={styles.description}>Cargando campos técnicos...</Text>
      ) : null}

      {fieldDefinitions.map((definition) => {
        if (!shouldShowField(definition, fieldValues, fieldDefinitions)) {
          return null;
        }

        const options = getOptions(definition);
        const value = fieldValues[definition.id] ?? '';
        const fieldError = validationErrors.fieldErrors[definition.id];

        return (
          <View style={styles.fieldBlock} key={definition.id}>
            <View style={styles.fieldHeader}>
              <Text style={styles.fieldLabel}>{definition.label}</Text>
              <Text style={styles.fieldMeta}>
                {getFieldRequiredLabel(definition, fieldValues, fieldDefinitions)}
              </Text>
            </View>
            {definition.field_type === 'select' ? (
              <View style={[styles.optionRow, fieldError ? styles.optionRowError : null]}>
                {options.map((option) => {
                  const selected = value === option;

                  return (
                    <Pressable
                      key={option}
                      style={[styles.optionChip, selected ? styles.optionChipActive : null]}
                      onPress={() => canEdit && setFieldValue(definition.id, option)}
                      disabled={!canEdit}
                      accessibilityRole="button"
                    >
                      <Text
                        style={[
                          styles.optionChipText,
                          selected ? styles.optionChipTextActive : null,
                        ]}
                      >
                        {option}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <TextInput
                ref={(input) => {
                  fieldInputRefs.current[definition.id] = input;
                }}
                value={value}
                onChangeText={(nextValue) => setFieldValue(definition.id, nextValue)}
                editable={canEdit}
                placeholder="Captura el dato"
                placeholderTextColor={colors.placeholder}
                multiline={definition.field_type === 'textarea'}
                keyboardType={definition.field_type === 'email' ? 'email-address' : 'default'}
                autoCapitalize={definition.field_type === 'email' ? 'none' : 'sentences'}
                style={[
                  styles.input,
                  fieldError ? styles.inputError : null,
                  definition.field_type === 'textarea' ? styles.textarea : null,
                ]}
              />
            )}
            {fieldError ? <Text style={styles.errorText}>{fieldError}</Text> : null}
          </View>
        );
      })}

      
        <View style={styles.equipmentSection}>
          <View style={styles.fieldHeader}>
            <Text style={styles.subtitle}>Equipos</Text>
            <Text style={styles.fieldMeta}>
              {requiresEquipmentSerial ? 'Serial requerido' : 'Serial opcional'}
            </Text>
          </View>

          {equipment.map((entry, index) => {
            const equipmentError = validationErrors.equipmentErrors[entry.id];

            return (
            <View style={styles.equipmentCard} key={entry.id}>
              <View style={styles.equipmentCardHeader}>
                <Text style={styles.equipmentTitle}>Equipo {index + 1}</Text>
                {index > 0 && canEdit ? (
                  <Pressable
                    style={styles.removeEquipmentButton}
                    onPress={() => confirmRemoveEquipment(entry, index)}
                    disabled={isSaving}
                    accessibilityRole="button"
                    accessibilityLabel={`Eliminar Equipo ${index + 1}`}
                    hitSlop={8}
                  >
                    <MaterialCommunityIcons name="close" size={18} color={colors.error} />
                    <Text style={styles.removeEquipmentText}>Eliminar</Text>
                  </Pressable>
                ) : null}
              </View>

              {/* 🔥 SN - CON KEY PARA QUE SE ACTUALICE BIEN */}
              <TextInput
                key={`serial-${entry.id}-${entry.serial_number ?? ''}`}
                ref={(input) => {
                  equipmentInputRefs.current[entry.id] = input;
                }}
                defaultValue={entry.serial_number ?? ''}
                editable={canEdit}
                placeholder="Serial confirmado"
                placeholderTextColor={colors.placeholder}
                onChangeText={(value) =>
                  updateEquipmentDraft(entry.id, {
                    serial_number: value,
                    confirmed_value: value,
                  })
                }
                onEndEditing={(event) =>
                  updateEquipmentField(entry, 'serial_number', event.nativeEvent.text)
                }
                style={[styles.input, equipmentError ? styles.inputError : null]}
              />
              {equipmentError ? <Text style={styles.errorText}>{equipmentError}</Text> : null}

              {/* 🔥 MARCA Y MODELO - SIN KEY PARA QUE EL TECLADO NO SE CIERRE */}
              <View style={styles.inlineInputs}>
                <TextInput
                  defaultValue={entry.brand ?? ''}
                  editable={canEdit}
                  placeholder="Marca"
                  placeholderTextColor={colors.placeholder}
                  onChangeText={(value) => updateEquipmentDraft(entry.id, { brand: value })}
                  onEndEditing={(event) =>
                    updateEquipmentField(entry, 'brand', event.nativeEvent.text)
                  }
                  style={[styles.input, styles.inlineInput]}
                />
                <TextInput
                  defaultValue={entry.model ?? ''}
                  editable={canEdit}
                  placeholder="Modelo"
                  placeholderTextColor={colors.placeholder}
                  onChangeText={(value) => updateEquipmentDraft(entry.id, { model: value })}
                  onEndEditing={(event) =>
                    updateEquipmentField(entry, 'model', event.nativeEvent.text)
                  }
                  style={[styles.input, styles.inlineInput]}
                />
              </View>

              {entry.detected_value ? (
                <Text style={styles.description}>Valor detectado: {entry.detected_value}</Text>
              ) : null}

              <View style={styles.actionRow}>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => openScanner(entry.id)}
                  disabled={!canEdit}
                  accessibilityRole="button"
                >
                  <MaterialCommunityIcons name="barcode-scan" size={17} color={colors.primary} />
                  <Text style={styles.secondaryButtonText}>Escanear</Text>
                </Pressable>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => takeLabelPhoto(entry.id)}
                  disabled={!canEdit}
                  accessibilityRole="button"
                >
                  <MaterialCommunityIcons name="camera-outline" size={17} color={colors.primary} />
                  <Text style={styles.secondaryButtonText}>Foto etiqueta</Text>
                </Pressable>
              </View>
            </View>
            );
          })}

          {canEdit ? (
            <Pressable
              style={styles.addButton}
              onPress={addEquipment}
              disabled={isSaving}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="plus" size={18} color={colors.primary} />
              <Text style={styles.addButtonText}>Agregar equipo</Text>
            </Pressable>
          ) : null}
        </View>

      {validationErrors.summary.length > 0 ? (
        <View style={styles.errorSummary}>
          <Text style={styles.errorSummaryTitle}>Revisa estos datos antes de enviar:</Text>
          {validationErrors.summary.map((entry) => (
            <Text style={styles.errorText} key={entry}>
              {entry}
            </Text>
          ))}
        </View>
      ) : null}

      {canEdit ? (
        <>
          <Pressable
            style={[styles.primaryButton, isSaving ? styles.primaryButtonDisabled : null]}
            onPress={confirmSaveProgress}
            disabled={isSaving}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>
              {isSaving ? 'Guardando...' : 'Guardar información técnica'}
            </Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.description}>
          La información técnica ya fue enviada o la unidad no permite edición.
        </Text>
      )}

      {message ? (
        <Text style={[styles.message, isError ? styles.messageError : null]}>{message}</Text>
      ) : null}

      <Modal
        visible={Boolean(scannerTargetId)}
        animationType="slide"
        onRequestClose={closeScanner}
      >
        <View style={styles.scannerScreen}>
          <CameraView
            style={styles.camera}
            facing="back"
            active={!pendingScan}
            autofocus="off"
            onBarcodeScanned={pendingScan ? undefined : handleScan}
            barcodeScannerSettings={{
              barcodeTypes: SCANNER_BARCODE_TYPES,
            }}
          />
          <View style={styles.scannerOverlay}>
            <Text style={styles.scannerTitle}>Escanear etiqueta</Text>
            <Text style={styles.scannerText}>
              Apunta al código QR o código de barras de la etiqueta.
            </Text>
            {pendingScan ? (
              <View style={styles.scanResultBox}>
                <Text style={styles.scanResultLabel}>Datos detectados</Text>

                <Text style={styles.scanResultValue}>
                  SN: {pendingScan.parsed.serialNumber || pendingScan.value}
                </Text>
                {pendingScan.parsed.brand ? (
                  <Text style={styles.scanResultValue}>Marca: {pendingScan.parsed.brand}</Text>
                ) : null}
                {pendingScan.parsed.model ? (
                  <Text style={styles.scanResultValue}>Modelo: {pendingScan.parsed.model}</Text>
                ) : null}
                {!pendingScan.parsed.brand && !pendingScan.parsed.model ? (
                  <Text style={styles.scannerText}>
                    El QR solo trajo el número de serie. Marca y modelo se capturan manualmente.
                  </Text>
                ) : null}

                <Text style={styles.scannerText}>
                  Formato detectado: {getScannerFormatLabel(pendingScan.format)}
                </Text>
                <View style={styles.scanResultActions}>
                  <Pressable
                    style={[styles.scannerClose, styles.scanSecondaryAction]}
                    onPress={() => setPendingScan(null)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.scannerCloseText}>Volver a escanear</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.scannerClose, styles.scanPrimaryAction]}
                    onPress={() => void confirmScanValue()}
                    accessibilityRole="button"
                  >
                    <Text style={styles.scanPrimaryActionText}>Confirmar datos</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                style={styles.scannerClose}
                onPress={closeScanner}
                accessibilityRole="button"
              >
                <Text style={styles.scannerCloseText}>Cancelar</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  subtitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  description: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  statusPill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  statusPillSuccess: {
    backgroundColor: '#ebf8ef',
  },
  statusPillText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 15,
  },
  fieldBlock: {
    gap: spacing.xs,
  },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fieldLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  fieldMeta: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
  inputError: {
    borderColor: colors.error,
    backgroundColor: colors.errorSoft,
  },
  textarea: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  optionRowError: {
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radius.sm,
    backgroundColor: colors.errorSoft,
    padding: spacing.xs,
  },
  optionChip: {
    minHeight: 38,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  optionChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  optionChipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  optionChipTextActive: {
    color: colors.primary,
  },
  equipmentSection: {
    gap: spacing.sm,
  },
  equipmentCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  equipmentCardHeader: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  equipmentTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  removeEquipmentButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#ffd4cf',
    borderRadius: radius.sm,
    backgroundColor: colors.errorSoft,
    paddingHorizontal: spacing.sm,
  },
  removeEquipmentText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: '800',
  },
  inlineInputs: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  inlineInput: {
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  secondaryButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  addButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  addButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  primaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '800',
  },
  errorSummary: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: '#ffd4cf',
    borderRadius: radius.sm,
    backgroundColor: colors.errorSoft,
    padding: spacing.md,
  },
  errorSummaryTitle: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  errorText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  message: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  messageError: {
    color: colors.error,
  },
  scannerScreen: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  scannerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  scannerTitle: {
    color: colors.background,
    fontSize: 20,
    fontWeight: '800',
  },
  scannerText: {
    color: '#dbeafe',
    fontSize: 14,
    lineHeight: 20,
  },
  scannerClose: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    marginTop: spacing.sm,
  },
  scannerCloseText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  scanResultBox: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  scanResultLabel: {
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  scanResultValue: {
    color: colors.background,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 23,
  },
  scanResultActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  scanSecondaryAction: {
    flex: 1,
    minWidth: 148,
  },
  scanPrimaryAction: {
    flex: 1,
    minWidth: 148,
    backgroundColor: colors.primary,
  },
  scanPrimaryActionText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '800',
  },
});