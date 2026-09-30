import { useCallback, useState } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';
import { useAuth, type TechnicianMembership } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { fetchInstallationById, mapInstallationRow } from './useInstallations';
import type { InstallationRow, InstallationWithClient } from '../types/database';

type InstallationActionResult =
  | {
      ok: true;
      installation: InstallationWithClient;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

type RpcInstallationRow = Omit<InstallationRow, 'clients'> & {
  clients?: InstallationRow['clients'];
};

type RpcInstallationResponse = RpcInstallationRow | RpcInstallationRow[] | null;
type ActionRpcName = 'start_installation' | 'start_installation_item';
type InstallationActionStage =
  | 'START_INSTALLATION_RPC'
  | 'REFRESH_INSTALLATION'
  | 'NORMALIZE_INSTALLATION_RPC'
  | 'UNEXPECTED_ACTION_ERROR';

function sanitizeDiagnosticText(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  return value
    .replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]')
    .replace(/refresh_token=[^&\s]+/gi, 'refresh_token=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9._-]+/g, '[redacted-jwt]');
}

function shortId(value: string | null | undefined) {
  return value ? `${value.slice(0, 8)}...` : null;
}

function getErrorValue(
  error: unknown,
  key: 'code' | 'details' | 'hint' | 'message' | 'name' | 'status',
) {
  if (!error || typeof error !== 'object' || !(key in error)) {
    return null;
  }

  return (error as Record<string, unknown>)[key] ?? null;
}

function logInstallationActionDiagnostic({
  stage,
  rpcName,
  installationId,
  installationItemId,
  membership,
  error,
  note,
}: {
  stage: InstallationActionStage;
  rpcName?: ActionRpcName;
  installationId: string;
  installationItemId?: string;
  membership: TechnicianMembership;
  error?: unknown;
  note?: string;
}) {
  if (!__DEV__) {
    return;
  }

  console.info('[mobile-installation-action]', {
    stage,
    rpc: rpcName ?? null,
    installationId: shortId(installationId),
    installationItemId: shortId(installationItemId),
    organizationId: shortId(membership.organizationId),
    technicianMembershipId: shortId(membership.id),
    code: sanitizeDiagnosticText(getErrorValue(error, 'code')),
    status: sanitizeDiagnosticText(getErrorValue(error, 'status')),
    name: sanitizeDiagnosticText(getErrorValue(error, 'name')),
    message: sanitizeDiagnosticText(getErrorValue(error, 'message')),
    details: sanitizeDiagnosticText(getErrorValue(error, 'details')),
    hint: sanitizeDiagnosticText(getErrorValue(error, 'hint')),
    note,
  });
}

function normalizeRpcInstallation(data: RpcInstallationResponse) {
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }

  return data;
}

function mapActionError(error: PostgrestError | Error | null) {
  const message = error?.message?.toLowerCase() ?? '';
  const code = String(getErrorValue(error, 'code') ?? '');
  const status = String(getErrorValue(error, 'status') ?? '');

  if (
    code === 'PGRST301' ||
    message.includes('jwt') ||
    message.includes('sesion') ||
    message.includes('session')
  ) {
    return 'Tu sesión terminó. Inicia sesión nuevamente.';
  }

  if (
    code === '42501' ||
    message.includes('permiso') ||
    message.includes('permission')
  ) {
    return 'No tienes permiso para modificar esta unidad.';
  }

  if (
    message.includes('partida no encontrada') ||
    message.includes('unidad operativa no encontrada') ||
    message.includes('not found')
  ) {
    return 'No encontramos la unidad operativa. Actualiza la información e inténtalo nuevamente.';
  }

  if (
    code === 'PGRST202' ||
    message.includes('function') ||
    message.includes('schema cache')
  ) {
    return 'No pudimos iniciar la unidad por una configuración del servidor.';
  }

  if (
    status === '429' ||
    message.includes('rate limit') ||
    message.includes('too many requests')
  ) {
    return 'El servidor está recibiendo demasiadas solicitudes. Inténtalo más tarde.';
  }

  if (
    message.includes('cambio de estado') ||
    message.includes('estado') ||
    message.includes('invalid')
  ) {
    return 'La unidad cambió de estado. Actualiza la información e inténtalo nuevamente.';
  }

  if (message.includes('network') || message.includes('fetch')) {
    return 'No pudimos conectar con el servidor. Inténtalo nuevamente.';
  }

  return 'No pudimos actualizar la instalación. Inténtalo nuevamente.';
}

async function runInstallationRpc(
  rpcName: 'start_installation',
  installationId: string,
  successMessage: string,
  membership: TechnicianMembership,
  installationItemId?: string,
): Promise<InstallationActionResult> {
  if (!supabase) {
    return {
      ok: false,
      message: 'No pudimos actualizar la instalación. Inténtalo nuevamente.',
    };
  }

  if (!membership.isActive) {
    return {
      ok: false,
      message: 'Tu acceso a esta empresa está desactivado.',
    };
  }

  const rpcNameToCall: ActionRpcName = installationItemId
    ? 'start_installation_item'
    : rpcName;

  try {
    const { data, error } = installationItemId
      ? await supabase.rpc(rpcNameToCall, {
          p_installation_id: installationId,
          p_installation_item_id: installationItemId,
        })
      : await supabase.rpc(rpcNameToCall, {
          p_installation_id: installationId,
        });

    if (error) {
      logInstallationActionDiagnostic({
        stage: 'START_INSTALLATION_RPC',
        rpcName: rpcNameToCall,
        installationId,
        installationItemId,
        membership,
        error,
      });

      return {
        ok: false,
        message: mapActionError(error),
      };
    }

    const row = normalizeRpcInstallation(data as RpcInstallationResponse);

    if (!row) {
      logInstallationActionDiagnostic({
        stage: 'NORMALIZE_INSTALLATION_RPC',
        rpcName: rpcNameToCall,
        installationId,
        installationItemId,
        membership,
        note: 'RPC returned an empty installation payload.',
      });

      return {
        ok: false,
        message: 'No pudimos actualizar la instalación. Inténtalo nuevamente.',
      };
    }

    const refreshed = await fetchInstallationById(row.id, membership);

    if (refreshed.error) {
      logInstallationActionDiagnostic({
        stage: 'REFRESH_INSTALLATION',
        rpcName: rpcNameToCall,
        installationId,
        installationItemId,
        membership,
        note: refreshed.error,
      });
    }

    return {
      ok: true,
      installation:
        refreshed.data ??
        mapInstallationRow({
          ...row,
          clients: row.clients ?? null,
          installation_items: row.installation_items ?? null,
        }),
      message: successMessage,
    };
  } catch (error) {
    logInstallationActionDiagnostic({
      stage: 'UNEXPECTED_ACTION_ERROR',
      rpcName: rpcNameToCall,
      installationId,
      installationItemId,
      membership,
      error,
    });

    return {
      ok: false,
      message: mapActionError(error instanceof Error ? error : null),
    };
  }
}

export function useInstallationActions() {
  const { selectedMembership } = useAuth();
  const [isStarting, setIsStarting] = useState(false);
  const isCompleting = false;
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const clearMessage = useCallback(() => {
    setMessage('');
    setIsError(false);
  }, []);

  const startInstallation = useCallback(
    async (installationId: string, installationItemId?: string) => {
      if (isStarting || isCompleting || !selectedMembership) {
        return null;
      }

      setIsStarting(true);
      clearMessage();

      const result = await runInstallationRpc(
        'start_installation',
        installationId,
        'Instalación iniciada correctamente.',
        selectedMembership,
        installationItemId,
      );

      setIsStarting(false);
      setMessage(result.message);
      setIsError(!result.ok);

      return result;
    },
    [clearMessage, isCompleting, isStarting, selectedMembership],
  );

  return {
    startInstallation,
    clearMessage,
    isStarting,
    isCompleting,
    message,
    isError,
  };
}
