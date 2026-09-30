import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ImagePickerAsset } from 'expo-image-picker';
import { randomUUID } from 'expo-crypto';
import { useAuth } from '../context/AuthContext';
import {
  buildTechnicalLabelStoragePath,
  getTechnicalLabelExtension,
  TECHNICAL_LABELS_BUCKET,
} from '../lib/technicalStorage';
import { supabase } from '../lib/supabase';
import type {
  InstallationEquipment,
  InstallationItem,
  InstallationTechnicalFieldValue,
  InstallationTechnicalRecord,
  ServiceCategory,
  ServiceFieldDefinition,
  WorkType,
} from '../types/database';

type FieldValueMap = Record<string, string>;

type UseTechnicalInfoParams = {
  organizationId: string | null;
  installationId: string | null;
  item: InstallationItem | null;
};

export type TechnicalInfoValidationTarget =
  | { type: 'field'; id: string }
  | { type: 'equipment'; id: string }
  | null;

export type TechnicalInfoValidationErrors = {
  summary: string[];
  fieldErrors: Record<string, string>;
  equipmentErrors: Record<string, string>;
};

type EquipmentLabelPhotoRow = {
  equipment_id: string;
};

function createEmptyValidationErrors(): TechnicalInfoValidationErrors {
  return {
    summary: [],
    fieldErrors: {},
    equipmentErrors: {},
  };
}

function hasValidationErrors(errors: TechnicalInfoValidationErrors) {
  return (
    errors.summary.length > 0 ||
    Object.keys(errors.fieldErrors).length > 0 ||
    Object.keys(errors.equipmentErrors).length > 0
  );
}

function normalizeFieldDefinitions(rows: ServiceFieldDefinition[]) {
  return [...rows].sort((left, right) => left.sort_order - right.sort_order);
}

function getWorkType(item: InstallationItem | null): WorkType {
  return item?.workType ?? 'installation';
}

function shouldRequireField(
  definition: ServiceFieldDefinition,
  fieldValues: FieldValueMap,
  definitions: ServiceFieldDefinition[],
) {
  if (definition.is_required) {
    return true;
  }

  if (definition.code !== 'route') {
    return false;
  }

  const vehicleTypeDefinition = definitions.find((field) => field.code === 'vehicle_type');
  const vehicleType = vehicleTypeDefinition ? fieldValues[vehicleTypeDefinition.id] : '';

  return vehicleType.trim().toLowerCase() === 'colectivo';
}

function validateTechnicalInfoValues({
  fieldDefinitions,
  fieldValues,
  equipment,
  requiresEquipment,
  requiresEquipmentSerial,
}: {
  fieldDefinitions: ServiceFieldDefinition[];
  fieldValues: FieldValueMap;
  equipment: InstallationEquipment[];
  requiresEquipment: boolean;
  requiresEquipmentSerial: boolean;
}) {
  const errors = createEmptyValidationErrors();
  let firstErrorTarget: TechnicalInfoValidationTarget = null;

  for (const definition of fieldDefinitions) {
    if (!shouldRequireField(definition, fieldValues, fieldDefinitions)) {
      continue;
    }

    const value = fieldValues[definition.id]?.trim() ?? '';

    if (!value) {
      const message = `${definition.label} es obligatorio.`;
      errors.fieldErrors[definition.id] = message;
      errors.summary.push(message);
      firstErrorTarget ??= { type: 'field', id: definition.id };
    }
  }

  if (requiresEquipment && equipment.length === 0) {
    const message = 'Debes registrar al menos un equipo.';
    errors.summary.push(message);
  }

  if (requiresEquipmentSerial) {
    equipment.forEach((entry, index) => {
      const serial = entry.serial_number?.trim() ?? '';

      if (!serial) {
        const message = `Equipo ${index + 1}: falta el número de serie.`;
        errors.equipmentErrors[entry.id] = message;
        errors.summary.push(message);
        firstErrorTarget ??= { type: 'equipment', id: entry.id };
      }
    });
  }

  return {
    errors,
    firstErrorTarget,
    isValid: !hasValidationErrors(errors),
  };
}

function getTechnicalMessage(error: unknown) {
  if (!error || typeof error !== 'object') {
    return 'No pudimos guardar la información técnica. Intenta nuevamente.';
  }

  const message =
    'message' in error ? String((error as { message?: unknown }).message ?? '') : '';
  const normalized = message.toLowerCase();

  if (normalized.includes('technical information is incomplete')) {
    return 'Faltan campos técnicos obligatorios antes de enviar a revisión.';
  }

  if (normalized.includes('permission') || normalized.includes('policy')) {
    return 'No tienes permiso para modificar la información técnica de esta unidad.';
  }

  return 'No pudimos guardar la información técnica. Intenta nuevamente.';
}

export function useTechnicalInfo({
  organizationId,
  installationId,
  item,
}: UseTechnicalInfoParams) {
  const { selectedMembership, user } = useAuth();
  const [category, setCategory] = useState<ServiceCategory | null>(null);
  const [fieldDefinitions, setFieldDefinitions] = useState<ServiceFieldDefinition[]>([]);
  const [record, setRecord] = useState<InstallationTechnicalRecord | null>(null);
  const [fieldValues, setFieldValues] = useState<FieldValueMap>({});
  const [equipment, setEquipment] = useState<InstallationEquipment[]>([]);
  const [equipmentLabelPhotoCounts, setEquipmentLabelPhotoCounts] = useState<Record<string, number>>({});
  const [validationErrors, setValidationErrors] = useState<TechnicalInfoValidationErrors>(
    createEmptyValidationErrors,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const canEdit = useMemo(() => {
    if (!item || !selectedMembership?.isActive) {
      return false;
    }

    if (record?.status === 'verified' || record?.status === 'submitted') {
      return false;
    }

    return item.status === 'pending' || item.status === 'in_progress' || record?.status === 'correction_required';
  }, [item, record?.status, selectedMembership?.isActive]);

  const requiresEquipment = Boolean(category?.capture_rules?.requiresEquipment);
  const requiresEquipmentSerial = Boolean(category?.capture_rules?.equipmentSerialRequired);

  const load = useCallback(async () => {
    if (!supabase || !organizationId || !installationId || !item?.serviceCategoryId) {
      setCategory(null);
      setFieldDefinitions([]);
      setRecord(null);
      setFieldValues({});
      setEquipment([]);
      setEquipmentLabelPhotoCounts({});
      setValidationErrors(createEmptyValidationErrors());
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setMessage('');

    const [{ data: categoryRow }, { data: definitionRows }, { data: recordRow }] =
      await Promise.all([
        supabase
          .from('service_categories')
          .select('id, code, name, description, capture_rules, sort_order')
          .eq('id', item.serviceCategoryId)
          .maybeSingle<ServiceCategory>(),
        supabase
          .from('service_field_definitions')
          .select('id, service_category_id, code, label, field_type, is_required, options, sort_order, capture_methods, visible_work_types, conditional_rule')
          .eq('service_category_id', item.serviceCategoryId)
          .eq('active', true)
          .order('sort_order', { ascending: true })
          .returns<ServiceFieldDefinition[]>(),
        supabase
          .from('installation_technical_records')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('installation_id', installationId)
          .eq('installation_item_id', item.id)
          .maybeSingle<InstallationTechnicalRecord>(),
      ]);

    setCategory(categoryRow ?? null);
    setFieldDefinitions(normalizeFieldDefinitions(definitionRows ?? []));
    setRecord(recordRow ?? null);

    if (!recordRow) {
      setFieldValues({});
      setEquipment([]);
      setEquipmentLabelPhotoCounts({});
      setIsLoading(false);
      return;
    }

    const [{ data: valueRows }, { data: equipmentRows }, { data: labelPhotoRows }] = await Promise.all([
      supabase
        .from('installation_technical_field_values')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('technical_record_id', recordRow.id)
        .returns<InstallationTechnicalFieldValue[]>(),
      supabase
        .from('installation_equipment')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('technical_record_id', recordRow.id)
        .order('created_at', { ascending: true })
        .returns<InstallationEquipment[]>(),
      supabase
        .from('installation_equipment_label_photos')
        .select('equipment_id')
        .eq('organization_id', organizationId)
        .eq('installation_item_id', item.id)
        .returns<EquipmentLabelPhotoRow[]>(),
    ]);

    const nextValues: FieldValueMap = {};
    for (const value of valueRows ?? []) {
      nextValues[value.field_definition_id] = value.value_text ?? '';
    }

    setFieldValues(nextValues);
    setEquipment(equipmentRows ?? []);
    setEquipmentLabelPhotoCounts(
      (labelPhotoRows ?? []).reduce<Record<string, number>>((counts, row) => {
        counts[row.equipment_id] = (counts[row.equipment_id] ?? 0) + 1;
        return counts;
      }, {}),
    );
    setIsLoading(false);
  }, [installationId, item, organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const ensureRecord = useCallback(async () => {
    if (!supabase || !organizationId || !installationId || !item?.serviceCategoryId || !user || !selectedMembership) {
      throw new Error('Missing technical context');
    }

    const payload = {
      organization_id: organizationId,
      installation_id: installationId,
      installation_item_id: item.id,
      service_category_id: item.serviceCategoryId,
      work_type: getWorkType(item),
      submitted_by_user_id: user.id,
      submitted_by_membership_id: selectedMembership.id,
    };

    const { data, error } = await supabase
      .from('installation_technical_records')
      .upsert(payload, { onConflict: 'organization_id,installation_item_id' })
      .select('*')
      .single<InstallationTechnicalRecord>();

    if (error || !data) {
      throw error ?? new Error('Technical record was not saved');
    }

    setRecord(data);
    return data;
  }, [installationId, item, organizationId, selectedMembership, user]);

  const setFieldValue = useCallback((fieldDefinitionId: string, value: string) => {
    setFieldValues((current) => ({
      ...current,
      [fieldDefinitionId]: value,
    }));
    setValidationErrors((current) => {
      if (!current.fieldErrors[fieldDefinitionId]) {
        return current;
      }

      const nextFieldErrors = { ...current.fieldErrors };
      delete nextFieldErrors[fieldDefinitionId];

      return {
        ...current,
        fieldErrors: nextFieldErrors,
        summary: current.summary.filter((entry) => entry !== current.fieldErrors[fieldDefinitionId]),
      };
    });
  }, []);

  const updateEquipmentDraft = useCallback(
    (equipmentId: string, values: Partial<InstallationEquipment>) => {
      setEquipment((current) =>
        current.map((entry) => (entry.id === equipmentId ? { ...entry, ...values } : entry)),
      );
      setValidationErrors((current) => {
        if (!current.equipmentErrors[equipmentId]) {
          return current;
        }

        const nextEquipmentErrors = { ...current.equipmentErrors };
        delete nextEquipmentErrors[equipmentId];

        return {
          ...current,
          equipmentErrors: nextEquipmentErrors,
          summary: current.summary.filter((entry) => entry !== current.equipmentErrors[equipmentId]),
        };
      });
    },
    [],
  );

  const saveProgress = useCallback(async () => {
    if (!supabase || !item || !selectedMembership || !user) {
      return { ok: false, message: 'No pudimos guardar la información técnica.' };
    }

    setIsSaving(true);
    setMessage('');

    try {
      const currentRecord = await ensureRecord();
      const rows = fieldDefinitions.map((definition) => ({
        organization_id: currentRecord.organization_id,
        installation_id: currentRecord.installation_id,
        installation_item_id: currentRecord.installation_item_id,
        technical_record_id: currentRecord.id,
        service_category_id: currentRecord.service_category_id,
        field_definition_id: definition.id,
        value_text: fieldValues[definition.id]?.trim() ?? '',
        value_json: null,
        technician_user_id: user.id,
        technician_membership_id: selectedMembership.id,
      }));

      if (rows.length) {
        const { error } = await supabase
          .from('installation_technical_field_values')
          .upsert(rows, { onConflict: 'technical_record_id,field_definition_id' });

        if (error) {
          throw error;
        }
      }

      const client = supabase;
      const equipmentUpdates = equipment.map((entry) =>
        client
          .from('installation_equipment')
          .update({
            equipment_type: entry.equipment_type,
            serial_number: entry.serial_number?.trim() || null,
            brand: entry.brand?.trim() || null,
            model: entry.model?.trim() || null,
            observations: entry.observations?.trim() || null,
            detected_value: entry.detected_value?.trim() || null,
            confirmed_value: entry.confirmed_value?.trim() || null,
            capture_method: entry.capture_method,
          })
          .eq('id', entry.id)
          .eq('technical_record_id', currentRecord.id),
      );

      const equipmentResults = await Promise.all(equipmentUpdates);
      const equipmentError = equipmentResults.find((result) => result.error)?.error;

      if (equipmentError) {
        throw equipmentError;
      }

      setIsSaving(false);
      setIsError(false);
      setValidationErrors(createEmptyValidationErrors());
      setMessage('Información técnica guardada.');
      await load();
      return { ok: true, message: 'Información técnica guardada.' };
    } catch (error) {
      const nextMessage = getTechnicalMessage(error);
      setIsSaving(false);
      setIsError(true);
      setMessage(nextMessage);
      return { ok: false, message: nextMessage };
    }
  }, [ensureRecord, equipment, fieldDefinitions, fieldValues, item, load, selectedMembership, user]);

  const addEquipment = useCallback(async () => {
    if (!supabase || !selectedMembership || !user) {
      return;
    }

    setIsSaving(true);
    setMessage('');

    try {
      const currentRecord = await ensureRecord();
      const { error } = await supabase.from('installation_equipment').insert({
        organization_id: currentRecord.organization_id,
        installation_id: currentRecord.installation_id,
        installation_item_id: currentRecord.installation_item_id,
        technical_record_id: currentRecord.id,
        service_category_id: currentRecord.service_category_id,
        equipment_type: 'Equipo',
        capture_method: 'manual',
        technician_user_id: user.id,
        technician_membership_id: selectedMembership.id,
      });

      if (error) {
        throw error;
      }

      setValidationErrors((current) => ({
        ...current,
        summary: current.summary.filter((entry) => entry !== 'Debes registrar al menos un equipo.'),
      }));
      await load();
      setIsSaving(false);
    } catch (error) {
      setIsError(true);
      setMessage(getTechnicalMessage(error));
      setIsSaving(false);
    }
  }, [ensureRecord, load, selectedMembership, user]);

  const updateEquipment = useCallback(
    async (equipmentId: string, values: Partial<InstallationEquipment>) => {
      if (!supabase) {
        return;
      }

      setEquipment((current) =>
        current.map((entry) => (entry.id === equipmentId ? { ...entry, ...values } : entry)),
      );
      setValidationErrors((current) => {
        if (!current.equipmentErrors[equipmentId]) {
          return current;
        }

        const nextEquipmentErrors = { ...current.equipmentErrors };
        delete nextEquipmentErrors[equipmentId];

        return {
          ...current,
          equipmentErrors: nextEquipmentErrors,
          summary: current.summary.filter((entry) => entry !== current.equipmentErrors[equipmentId]),
        };
      });

      const { error } = await supabase
        .from('installation_equipment')
        .update(values)
        .eq('id', equipmentId);

      if (error) {
        setIsError(true);
        setMessage(getTechnicalMessage(error));
        await load();
      }
    },
    [load],
  );

  const removeEquipment = useCallback(
    async (equipmentId: string) => {
      if (!supabase || !record) {
        return { ok: false, message: 'No pudimos eliminar el equipo.' };
      }

      setIsSaving(true);
      setMessage('');

      const { error } = await supabase
        .from('installation_equipment')
        .delete()
        .eq('id', equipmentId)
        .eq('technical_record_id', record.id);

      if (error) {
        const nextMessage = getTechnicalMessage(error);
        setIsSaving(false);
        setIsError(true);
        setMessage(nextMessage);
        return { ok: false, message: nextMessage };
      }

      setEquipment((current) => current.filter((entry) => entry.id !== equipmentId));
      setEquipmentLabelPhotoCounts((current) => {
        const nextCounts = { ...current };
        delete nextCounts[equipmentId];
        return nextCounts;
      });
      setValidationErrors((current) => {
        if (!current.equipmentErrors[equipmentId]) {
          return current;
        }

        const nextEquipmentErrors = { ...current.equipmentErrors };
        delete nextEquipmentErrors[equipmentId];

        return {
          ...current,
          equipmentErrors: nextEquipmentErrors,
          summary: current.summary.filter((entry) => entry !== current.equipmentErrors[equipmentId]),
        };
      });
      setIsSaving(false);
      setIsError(false);
      setMessage('Equipo eliminado.');
      await load();

      return { ok: true, message: 'Equipo eliminado.' };
    },
    [load, record],
  );

  const saveScannedValue = useCallback(
    async (equipmentId: string, value: string, method: 'qr' | 'barcode') => {
      await updateEquipment(equipmentId, {
        detected_value: value,
        confirmed_value: value,
        serial_number: value,
        capture_method: method,
      });
    },
    [updateEquipment],
  );

  const uploadLabelPhoto = useCallback(
    async (equipmentId: string, asset: ImagePickerAsset) => {
      if (!supabase || !organizationId || !installationId || !item || !user || !selectedMembership) {
        return;
      }

      setIsSaving(true);
      setMessage('');

      try {
        const currentRecord = await ensureRecord();
        const photoId = randomUUID();
        const mimeType = asset.mimeType ?? 'image/jpeg';
        const extension = getTechnicalLabelExtension(mimeType);
        const storagePath = buildTechnicalLabelStoragePath({
          organizationId,
          installationId,
          installationItemId: item.id,
          equipmentId,
          photoId,
          extension,
        });
        const bytes = await fetch(asset.uri).then((response) => response.arrayBuffer());
        const { error: uploadError } = await supabase.storage
          .from(TECHNICAL_LABELS_BUCKET)
          .upload(storagePath, bytes, {
            contentType: mimeType,
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          throw uploadError;
        }

        const { error: insertError } = await supabase
          .from('installation_equipment_label_photos')
          .insert({
            id: photoId,
            organization_id: organizationId,
            installation_id: installationId,
            installation_item_id: item.id,
            equipment_id: equipmentId,
            service_category_id: currentRecord.service_category_id,
            technician_user_id: user.id,
            technician_membership_id: selectedMembership.id,
            storage_bucket: TECHNICAL_LABELS_BUCKET,
            storage_path: storagePath,
            mime_type: mimeType,
            file_size_bytes: asset.fileSize ?? null,
            captured_at: new Date().toISOString(),
          });

        if (insertError) {
          await supabase.storage.from(TECHNICAL_LABELS_BUCKET).remove([storagePath]);
          throw insertError;
        }

        setEquipmentLabelPhotoCounts((current) => ({
          ...current,
          [equipmentId]: (current[equipmentId] ?? 0) + 1,
        }));
        setIsSaving(false);
        setIsError(false);
        setMessage('Foto de etiqueta guardada.');
      } catch (error) {
        setIsSaving(false);
        setIsError(true);
        setMessage(getTechnicalMessage(error));
      }
    },
    [ensureRecord, installationId, item, organizationId, selectedMembership, user],
  );

  const submitForReview = useCallback(async () => {
    if (!supabase || !installationId || !item) {
      return { ok: false, message: 'No pudimos enviar la información técnica.' };
    }

    const validation = validateTechnicalInfoValues({
      fieldDefinitions,
      fieldValues,
      equipment,
      requiresEquipment,
      requiresEquipmentSerial,
    });

    if (!validation.isValid) {
      const nextMessage =
        'Completa la información técnica requerida antes de enviar la entrega a revisión.';
      setValidationErrors(validation.errors);
      setIsSaving(false);
      setIsError(true);
      setMessage(nextMessage);
      return {
        ok: false,
        message: nextMessage,
        firstErrorTarget: validation.firstErrorTarget,
      };
    }

    setIsSaving(true);
    setMessage('');

    const saved = await saveProgress();

    if (!saved.ok) {
      setIsSaving(false);
      return saved;
    }

    const { error } = await supabase.rpc('submit_installation_technical_info', {
      p_installation_id: installationId,
      p_installation_item_id: item.id,
    });

    if (error) {
      const nextMessage = getTechnicalMessage(error);
      setIsSaving(false);
      setIsError(true);
      setMessage(nextMessage);
      return { ok: false, message: nextMessage };
    }

    setIsSaving(false);
    setIsError(false);
    setValidationErrors(createEmptyValidationErrors());
    setMessage('Información técnica enviada a revisión.');
    await load();
    return { ok: true, message: 'Información técnica enviada a revisión.' };
  }, [
    equipment,
    fieldDefinitions,
    fieldValues,
    installationId,
    item,
    load,
    requiresEquipment,
    requiresEquipmentSerial,
    saveProgress,
  ]);

  return {
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
    submitForReview,
    addEquipment,
    updateEquipmentDraft,
    updateEquipment,
    removeEquipment,
    saveScannedValue,
    uploadLabelPhoto,
    refresh: load,
  };
}
