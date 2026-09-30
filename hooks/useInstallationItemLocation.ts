import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import type { PostgrestError } from '@supabase/supabase-js';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import type {
  InstallationItemLocationPin,
  InstallationItemLocationPinRow,
} from '../types/database';

const MAX_ACCURACY_METERS = 15;
const EXCELLENT_ACCURACY_METERS = 5;
const MAX_SAMPLING_MS = 20_000;
const MIN_SAMPLING_MS = 4_000;
const SAMPLE_DELAY_MS = 1_100;
const STALE_READING_MS = 30_000;

const INSUFFICIENT_PRECISION_MESSAGE =
  'No fue posible obtener una ubicación suficientemente precisa. Acércate a una ventana o área abierta, activa la ubicación precisa y vuelve a intentarlo.';

type LocationPermissionWithAccuracy = Location.LocationPermissionResponse & {
  accuracy?: 'full' | 'reduced';
};

type RegisterLocationResult =
  | {
      ok: true;
      location: InstallationItemLocationPin;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isValidLocationReading(
  reading: Location.LocationObject,
  startedAt: number,
) {
  const { latitude, longitude, accuracy } = reading.coords;

  return (
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    typeof accuracy === 'number' &&
    Number.isFinite(accuracy) &&
    accuracy > 0 &&
    reading.timestamp >= startedAt - STALE_READING_MS
  );
}

function betterReading(
  current: Location.LocationObject | null,
  candidate: Location.LocationObject,
) {
  if (!current) {
    return candidate;
  }

  const currentAccuracy = current.coords.accuracy ?? Number.POSITIVE_INFINITY;
  const candidateAccuracy = candidate.coords.accuracy ?? Number.POSITIVE_INFINITY;

  return candidateAccuracy < currentAccuracy ? candidate : current;
}

function mapLocationPinRow(row: InstallationItemLocationPinRow): InstallationItemLocationPin {
  return {
    id: row.id,
    organizationId: row.organization_id,
    installationId: row.installation_id,
    installationItemId: row.installation_item_id,
    technicianUserId: row.technician_user_id,
    technicianMembershipId: row.technician_membership_id,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyMeters: row.accuracy_meters,
    recordedAt: row.recorded_at,
    createdAt: row.created_at,
    reviewStatus: row.review_status,
    approvedAt: row.approved_at,
    approvedByUserId: row.approved_by_user_id,
    approvedByMembershipId: row.approved_by_membership_id,
    invalidatedAt: row.invalidated_at,
    invalidationReason: row.invalidation_reason,
  };
}

function mapLocationError(error: PostgrestError | Error | null) {
  const message = error?.message?.toLowerCase() ?? '';
  const code = 'code' in (error ?? {}) ? String((error as PostgrestError).code) : '';

  if (code === '23505' || message.includes('ya tiene una ubicacion')) {
    return 'Esta partida ya tiene una ubicación registrada.';
  }

  if (code === '42501' || message.includes('permiso') || message.includes('permission')) {
    return 'No tienes permiso para registrar esta ubicación.';
  }

  if (message.includes('iniciada') || message.includes('estado')) {
    return 'Disponible después de iniciar esta instalación.';
  }

  if (message.includes('precision') || message.includes('15 metros')) {
    return INSUFFICIENT_PRECISION_MESSAGE;
  }

  if (message.includes('network') || message.includes('fetch')) {
    return 'No pudimos guardar la ubicación. Revisa tu conexión y vuelve a intentarlo.';
  }

  return 'No pudimos registrar la ubicación. Inténtalo nuevamente.';
}

async function readBestPreciseLocation() {
  const startedAt = Date.now();
  const deadline = startedAt + MAX_SAMPLING_MS;
  let best: Location.LocationObject | null = null;

  while (Date.now() < deadline) {
    const remainingMs = Math.max(1, deadline - Date.now());

    try {
      const reading = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
          mayShowUserSettingsDialog: true,
        }),
        delay(remainingMs).then(() => null),
      ]);

      if (reading && isValidLocationReading(reading, startedAt)) {
        best = betterReading(best, reading);
      }
    } catch {
      // Keep sampling until the deadline. The user-facing result is decided below.
    }

    const bestAccuracy = best?.coords.accuracy ?? Number.POSITIVE_INFINITY;
    const elapsedMs = Date.now() - startedAt;

    if (bestAccuracy <= EXCELLENT_ACCURACY_METERS && elapsedMs >= MIN_SAMPLING_MS) {
      break;
    }

    await delay(Math.min(SAMPLE_DELAY_MS, Math.max(0, deadline - Date.now())));
  }

  return best;
}

export function useInstallationItemLocation() {
  const { selectedMembership } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const clearMessage = useCallback(() => {
    setMessage('');
    setIsError(false);
  }, []);

  const registerLocation = useCallback(async ({
    installationId,
    installationItemId,
    isReregistration = false,
  }: {
    installationId: string;
    installationItemId: string;
    isReregistration?: boolean;
  }): Promise<RegisterLocationResult> => {
    if (isRegistering) {
      return { ok: false, message: 'Ya estamos obteniendo la ubicación.' };
    }

    if (!supabase || !selectedMembership?.isActive) {
      return { ok: false, message: 'No pudimos validar tu acceso.' };
    }

    setIsRegistering(true);
    setIsError(false);
    setMessage('Obteniendo ubicación precisa…');

    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();

      if (!servicesEnabled) {
        return {
          ok: false,
          message: 'Activa la ubicación del dispositivo y vuelve a intentarlo.',
        };
      }

      const permission =
        (await Location.requestForegroundPermissionsAsync()) as LocationPermissionWithAccuracy;

      if (!permission.granted) {
        return {
          ok: false,
          message:
            'Para registrar la ubicación, permite el acceso a la ubicación precisa desde los ajustes del dispositivo.',
        };
      }

      if (permission.accuracy === 'reduced') {
        return {
          ok: false,
          message: 'Activa la ubicación precisa para registrar esta instalación.',
        };
      }

      const bestLocation = await readBestPreciseLocation();
      const accuracy = bestLocation?.coords.accuracy ?? Number.POSITIVE_INFINITY;

      if (!bestLocation || accuracy > MAX_ACCURACY_METERS) {
        return {
          ok: false,
          message: INSUFFICIENT_PRECISION_MESSAGE,
        };
      }

      const { data, error } = await supabase
        .rpc('register_installation_item_location', {
          p_installation_id: installationId,
          p_installation_item_id: installationItemId,
          p_latitude: bestLocation.coords.latitude,
          p_longitude: bestLocation.coords.longitude,
          p_accuracy_meters: accuracy,
        })
        .single<InstallationItemLocationPinRow>();

      if (error || !data) {
        return {
          ok: false,
          message: mapLocationError(error),
        };
      }

      return {
        ok: true,
        location: mapLocationPinRow(data),
        message: isReregistration
          ? 'Ubicaci\u00f3n registrada nuevamente. Est\u00e1 pendiente de aprobaci\u00f3n por un administrador.'
          : 'Ubicaci\u00f3n registrada. Est\u00e1 pendiente de aprobaci\u00f3n por un administrador.',
      };
    } catch (error) {
      return {
        ok: false,
        message: mapLocationError(error instanceof Error ? error : null),
      };
    } finally {
      setIsRegistering(false);
    }
  }, [isRegistering, selectedMembership]);

  const setResultMessage = useCallback((result: RegisterLocationResult) => {
    setMessage(result.message);
    setIsError(!result.ok);
  }, []);

  return {
    registerLocation,
    clearMessage,
    setResultMessage,
    isRegistering,
    message,
    isError,
  };
}

export { INSUFFICIENT_PRECISION_MESSAGE, MAX_ACCURACY_METERS };
