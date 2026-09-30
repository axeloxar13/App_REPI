import { useCallback, useEffect, useState } from 'react';
import { decode } from 'base64-arraybuffer';
import { randomUUID } from 'expo-crypto';
import { useAuth, type TechnicianMembership } from '../context/AuthContext';
import {
  buildHandoffSignatureStoragePath,
  HANDOFF_SIGNED_URL_EXPIRES_IN_SECONDS,
  INSTALLATION_SIGNATURES_BUCKET,
} from '../lib/handoffStorage';
import { getCachedSignedStorageUrls } from '../lib/privateStorageUrls';
import { supabase } from '../lib/supabase';
import { fetchInstallationById, mapInstallationRow } from './useInstallations';
import type {
  InstallationHandoff,
  InstallationHandoffRow,
  InstallationRow,
  InstallationWithClient,
} from '../types/database';

type SubmitHandoffValues = {
  installationId: string;
  installationItemId: string | null;
  recipientName: string;
  signatureDataUrl: string;
  finalNotes: string;
};

type SubmitHandoffResult =
  | {
      ok: true;
      installation: InstallationWithClient;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

type RpcInstallationResponse = InstallationRow | InstallationRow[] | null;

function normalizeRpcInstallation(data: RpcInstallationResponse) {
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }

  return data;
}

function normalizeRecipientName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeFinalNotes(value: string) {
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : '';
}

function extractPngBase64(dataUrl: string) {
  const match = dataUrl.match(/^data:image\/png;base64,(.+)$/);
  return match?.[1] ?? '';
}

function getTechnicalValidationPayload(error: unknown) {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const candidates = [
    'details' in error ? String((error as { details?: unknown }).details ?? '') : '',
    'message' in error ? String((error as { message?: unknown }).message ?? '') : '',
  ];

  for (const candidate of candidates) {
    const match = candidate.match(/\{.*\}/s);

    if (!match) {
      continue;
    }

    try {
      return JSON.parse(match[0]) as {
        missingEquipment?: boolean;
        missingFields?: string[];
        missingSerials?: boolean;
      };
    } catch {
      // Keep the generic mapped message if Supabase returns a non-JSON detail.
    }
  }

  return null;
}

function mapHandoff(row: InstallationHandoffRow, signatureUrl: string | null): InstallationHandoff {
  return {
    id: row.id,
    organizationId: row.organization_id,
    installationId: row.installation_id,
    installationItemId: row.installation_item_id,
    technicianMembershipId: row.technician_membership_id,
    technicianUserId: row.technician_user_id,
    recipientName: row.recipient_name,
    signatureStoragePath: row.signature_storage_path,
    signatureUrl,
    acceptanceConfirmed: row.acceptance_confirmed,
    finalNotes: row.final_notes,
    submittedAt: row.submitted_at,
    status: row.status,
    reviewedAt: row.reviewed_at,
    rejectionReason: row.rejection_reason,
    projectNameSnapshot: row.project_name_snapshot,
    clientNameSnapshot: row.client_name_snapshot,
    addressSnapshot: row.address_snapshot,
    technicianNameSnapshot: row.technician_name_snapshot,
    organizationNameSnapshot: row.organization_name_snapshot,
  };
}

function mapSubmitError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return 'No pudimos enviar la entrega. Intenta nuevamente.';
  }

  const message =
    'message' in error ? String((error as { message?: unknown }).message ?? '') : '';
  const normalized = message.toLowerCase();

  if (
    normalized.includes('sesion') ||
    normalized.includes('session') ||
    normalized.includes('jwt')
  ) {
    return 'Tu sesión terminó. Inicia sesión nuevamente.';
  }

  if (
    normalized.includes('permiso') ||
    normalized.includes('permission') ||
    normalized.includes('policy') ||
    normalized.includes('firma no corresponde')
  ) {
    return 'No tienes permiso para enviar la entrega de esta instalación.';
  }

  if (normalized.includes('estado') || normalized.includes('ya tiene una entrega')) {
    return 'La instalación cambió de estado. Actualiza la información e inténtalo nuevamente.';
  }

  if (
    normalized.includes('technical information is incomplete') ||
    normalized.includes('service category is required')
  ) {
    const validation = getTechnicalValidationPayload(error);

    if (validation?.missingEquipment) {
      return 'Debes registrar al menos un equipo en Información técnica antes de enviar la entrega a revisión.';
    }

    if (validation?.missingSerials) {
      return 'Falta el número de serie en uno o más equipos. Regresa a Información técnica para ver el equipo marcado en rojo.';
    }

    if (validation?.missingFields?.length) {
      return `Falta completar: ${validation.missingFields.join(', ')}. Revisa Información técnica antes de enviar.`;
    }

    return 'Completa la información técnica requerida antes de enviar la entrega a revisión.';
  }

  return 'No pudimos enviar la entrega. Intenta nuevamente.';
}

async function createSignatureSignedUrls(
  organizationId: string,
  storagePaths: string[],
) {
  if (!supabase) {
    return new Map<string, string>();
  }

  return getCachedSignedStorageUrls({
    client: supabase,
    bucket: INSTALLATION_SIGNATURES_BUCKET,
    organizationId,
    storagePaths,
    expiresInSeconds: HANDOFF_SIGNED_URL_EXPIRES_IN_SECONDS,
  });
}

export function useInstallationHandoff(
  organizationId: string | null,
  installationId: string | null,
  installationItemId: string | null,
) {
  const [handoffs, setHandoffs] = useState<InstallationHandoff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchHandoffs = useCallback(async () => {
    if (!organizationId || !installationId || !supabase) {
      setHandoffs([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');

    let query = supabase
      .from('installation_handoffs')
      .select(
        `
        id,
        organization_id,
        installation_id,
        installation_item_id,
        technician_membership_id,
        technician_user_id,
        recipient_name,
        signature_storage_path,
        acceptance_confirmed,
        final_notes,
        submitted_at,
        status,
        reviewed_by_membership_id,
        reviewed_at,
        rejection_reason,
        project_name_snapshot,
        client_name_snapshot,
        address_snapshot,
        technician_name_snapshot,
        organization_name_snapshot,
        created_at,
        updated_at
      `,
      )
      .eq('organization_id', organizationId)
      .eq('installation_id', installationId);

    if (installationItemId) {
      query = query.eq('installation_item_id', installationItemId);
    }

    const { data, error: queryError } = await query
      .order('submitted_at', { ascending: false })
      .returns<InstallationHandoffRow[]>();

    if (queryError) {
      setHandoffs([]);
      setError('No pudimos cargar la entrega de instalación.');
      setIsLoading(false);
      return;
    }

    const rows = data ?? [];
    const signedUrls = await createSignatureSignedUrls(
      organizationId,
      rows.map((row) => row.signature_storage_path),
    );
    const signed = rows.map((row) =>
      mapHandoff(row, signedUrls.get(row.signature_storage_path) ?? null),
    );

    setHandoffs(signed);
    setIsLoading(false);
  }, [installationId, installationItemId, organizationId]);

  useEffect(() => {
    fetchHandoffs();
  }, [fetchHandoffs]);

  return {
    handoffs,
    latestHandoff: handoffs[0] ?? null,
    isLoading,
    error,
    refresh: fetchHandoffs,
  };
}

export function useHandoffSubmission() {
  const { selectedMembership } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitHandoff = useCallback(
    async (values: SubmitHandoffValues): Promise<SubmitHandoffResult> => {
      if (!supabase || !selectedMembership || isSubmitting) {
        return {
          ok: false,
          message: 'No pudimos enviar la entrega. Intenta nuevamente.',
        };
      }

      if (!selectedMembership.isActive) {
        return {
          ok: false,
          message: 'Tu acceso a esta empresa está desactivado.',
        };
      }

      const recipientName = normalizeRecipientName(values.recipientName);
      const finalNotes = normalizeFinalNotes(values.finalNotes);
      const signatureBase64 = extractPngBase64(values.signatureDataUrl);

      if (recipientName.length < 3 || /^\d+$/.test(recipientName)) {
        return {
          ok: false,
          message: 'Captura el nombre completo de quien recibe.',
        };
      }

      if (!signatureBase64) {
        return {
          ok: false,
          message: 'La firma de conformidad es obligatoria.',
        };
      }

      const handoffId = randomUUID();
      const storagePath = buildHandoffSignatureStoragePath(
        selectedMembership.organizationId,
        values.installationId,
        values.installationItemId,
        handoffId,
      );
      const signatureBytes = decode(signatureBase64);

      setIsSubmitting(true);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || sessionData.session?.user.id !== selectedMembership.userId) {
        setIsSubmitting(false);
        return {
          ok: false,
          message: 'Tu sesión terminó. Inicia sesión nuevamente.',
        };
      }

      const { data: activeMembershipId, error: membershipError } = await supabase.rpc(
        'get_active_technician_membership',
        { target_organization_id: selectedMembership.organizationId },
      );

      if (membershipError || activeMembershipId !== selectedMembership.id) {
        setIsSubmitting(false);
        return {
          ok: false,
          message: 'No pudimos validar tu acceso a esta empresa.',
        };
      }

      if (values.installationItemId) {
        const { error: technicalError } = await supabase.rpc('submit_installation_technical_info', {
          p_installation_id: values.installationId,
          p_installation_item_id: values.installationItemId,
        });

        if (technicalError) {
          setIsSubmitting(false);
          return {
            ok: false,
            message: mapSubmitError(technicalError),
          };
        }
      }

      const { error: uploadError } = await supabase.storage
        .from(INSTALLATION_SIGNATURES_BUCKET)
        .upload(storagePath, signatureBytes, {
          contentType: 'image/png',
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        setIsSubmitting(false);
        return {
          ok: false,
          message: mapSubmitError(uploadError),
        };
      }

      const { data, error } = values.installationItemId
        ? await supabase.rpc('submit_installation_item_handoff', {
            p_installation_id: values.installationId,
            p_installation_item_id: values.installationItemId,
            p_handoff_id: handoffId,
            p_recipient_name: recipientName,
            p_signature_storage_path: storagePath,
            p_final_notes: finalNotes || null,
          })
        : await supabase.rpc('submit_installation_handoff', {
            p_installation_id: values.installationId,
            p_handoff_id: handoffId,
            p_recipient_name: recipientName,
            p_signature_storage_path: storagePath,
            p_final_notes: finalNotes || null,
          });

      if (error) {
        await supabase.storage.from(INSTALLATION_SIGNATURES_BUCKET).remove([storagePath]);
        setIsSubmitting(false);
        return {
          ok: false,
          message: mapSubmitError(error),
        };
      }

      const row = normalizeRpcInstallation(data as RpcInstallationResponse);
      const refreshed = await fetchInstallationById(
        values.installationId,
        selectedMembership as TechnicianMembership,
      );

      setIsSubmitting(false);

      return {
        ok: true,
        installation:
          refreshed.data ??
          (row
            ? mapInstallationRow({ ...row, clients: row.clients ?? null, installation_items: row.installation_items ?? null })
            : {
                id: values.installationId,
                organizationId: selectedMembership.organizationId,
                projectName: '',
                clientId: '',
                address: '',
                installationType: '',
                technicianId: selectedMembership.userId,
                technicianMembershipId: selectedMembership.id,
                assignedDate: new Date().toISOString(),
                startDate: null,
                startedAt: null,
                estimatedCompletionDate: null,
                completedAt: null,
                status: 'in_review',
                observations: null,
                items: [],
                client: { id: '', name: 'Cliente', phone: null, email: null },
              }),
        message: 'La entrega fue enviada correctamente para revisión.',
      };
    },
    [isSubmitting, selectedMembership],
  );

  return {
    submitHandoff,
    isSubmitting,
  };
}
