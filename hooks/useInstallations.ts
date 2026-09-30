import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth, type TechnicianMembership } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import type {
  ClientRow,
  InstallationItem,
  InstallationItemLocationPin,
  InstallationItemLocationPinRow,
  InstallationItemRow,
  InstallationRow,
  InstallationWithClient,
} from '../types/database';

const installationColumns = `
  id,
  organization_id,
  project_name,
  client_id,
  address,
  installation_type,
  technician_id,
  technician_membership_id,
  assigned_date,
  start_date,
  started_at,
  estimated_completion_date,
  completed_at,
  status,
  observations,
  installation_items (
    id,
    organization_id,
    installation_id,
    position,
    item_role,
    name,
    service_type,
    service_category_id,
    work_type,
    work_description,
    specific_location,
    status,
    observations,
    assigned_date,
    start_date,
    started_at,
    estimated_completion_date,
    completed_at
  ),
  clients!installations_client_organization_fkey (
    id,
    name,
    phone,
    email
  ),
  technician_membership:organization_memberships!installations_technician_membership_organization_fkey (
    id,
    full_name,
    email_snapshot,
    role,
    status,
    active
  )
`;

const locationPinColumns = `
  id,
  organization_id,
  installation_id,
  installation_item_id,
  technician_user_id,
  technician_membership_id,
  latitude,
  longitude,
  accuracy_meters,
  recorded_at,
  created_at,
  review_status,
  approved_at,
  approved_by_user_id,
  approved_by_membership_id,
  invalidated_at,
  invalidation_reason
`;

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

function logInstallationsDiagnostic({
  stage,
  error,
  organizationId,
  membershipId,
}: {
  stage: 'LOAD_INSTALLATIONS';
  error: {
    code?: string;
    message?: string;
    details?: unknown;
    hint?: string;
  };
  organizationId: string;
  membershipId: string;
}) {
  if (!__DEV__) {
    return;
  }

  console.info('[mobile-installations]', {
    stage,
    table: 'installations',
    organizationId: `${organizationId.slice(0, 8)}...`,
    technicianMembershipId: `${membershipId.slice(0, 8)}...`,
    code: error.code ?? null,
    message: sanitizeDiagnosticText(error.message) ?? null,
    details: sanitizeDiagnosticText(error.details) ?? null,
    hint: sanitizeDiagnosticText(error.hint) ?? null,
  });
}

function firstClient(client: ClientRow | ClientRow[] | null) {
  if (Array.isArray(client)) {
    return client[0] ?? null;
  }

  return client;
}

/**
 * Supabase puede devolver una relación como objeto o como arreglo,
 * dependiendo de la relación y de cómo esté inferida por el cliente.
 */
function firstTechnicianMembership(value: any) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function mapLocationPinRow(
  row: InstallationItemLocationPinRow,
): InstallationItemLocationPin {
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

function getActiveLocationPin(
  rows: InstallationItemLocationPinRow[] | null,
): InstallationItemLocationPin | null {
  const activeRows = (rows ?? [])
    .filter((row) => row.invalidated_at === null)
    .sort(
      (left, right) =>
        new Date(right.recorded_at).getTime() -
        new Date(left.recorded_at).getTime(),
    );

  return activeRows[0] ? mapLocationPinRow(activeRows[0]) : null;
}

function mapInstallationItemRow(
  row: InstallationItemRow,
  pinsByItemId: Map<string, InstallationItemLocationPinRow[]>,
): InstallationItem {
  const locationRows =
    row.location_pins ?? pinsByItemId.get(row.id) ?? [];

  return {
    id: row.id,
    organizationId: row.organization_id,
    installationId: row.installation_id,
    position: row.position,
    itemRole: row.item_role,
    name: row.name,
    serviceType: row.service_type,
    serviceCategoryId: row.service_category_id,
    workType: row.work_type,
    workDescription: row.work_description,
    specificLocation: row.specific_location,
    status: row.status,
    observations: row.observations,
    assignedDate: row.assigned_date,
    startDate: row.start_date,
    startedAt: row.started_at,
    estimatedCompletionDate: row.estimated_completion_date,
    completedAt: row.completed_at,
    activeLocation: getActiveLocationPin(locationRows),
    latestLocation: locationRows[0]
      ? mapLocationPinRow(locationRows[0])
      : null,
  };
}

function getInstallationItems(
  row: InstallationRow,
  pinsByItemId: Map<string, InstallationItemLocationPinRow[]>,
): InstallationItem[] {
  const rows = row.installation_items ?? [];

  const items = rows
    .map((item) => mapInstallationItemRow(item, pinsByItemId))
    .sort((left, right) => {
      if (left.itemRole !== right.itemRole) {
        return left.itemRole === 'primary' ? -1 : 1;
      }

      return left.position - right.position;
    });

  if (items.length > 0) {
    return items;
  }

  return [
    {
      id: row.id,
      organizationId: row.organization_id,
      installationId: row.id,
      position: 1,
      itemRole: 'primary',
      name: row.project_name,
      serviceType: row.installation_type,
      serviceCategoryId: null,
      workType: 'installation',
      workDescription: row.project_name,
      specificLocation: row.address,
      status: row.status,
      observations: row.observations,
      assignedDate: row.assigned_date,
      startDate: row.start_date,
      startedAt: row.started_at,
      estimatedCompletionDate: row.estimated_completion_date,
      completedAt: row.completed_at,
      activeLocation: null,
      latestLocation: null,
    },
  ];
}

export function mapInstallationRow(
  row: InstallationRow,
  pinsByItemId = new Map<string, InstallationItemLocationPinRow[]>(),
): InstallationWithClient {
  const client = firstClient(row.clients);

  // La relación viene desde:
  // installations.technician_membership_id
  // ->
  // organization_memberships.id
  const technicianMembership = firstTechnicianMembership(
    (row as any).technician_membership,
  );

  const items = getInstallationItems(row, pinsByItemId);

  return {
    id: row.id,
    organizationId: row.organization_id,
    projectName: row.project_name,
    clientId: row.client_id,
    address: row.address,
    installationType: row.installation_type,

    technicianId: row.technician_id ?? '',
    technicianMembershipId: row.technician_membership_id ?? '',

    technician: technicianMembership
      ? {
          id: technicianMembership.id,
          full_name: technicianMembership.full_name ?? '',
          email:
            technicianMembership.email_snapshot ?? null,
          role: technicianMembership.role ?? null,
          status: technicianMembership.status ?? null,
          active: technicianMembership.active ?? null,
        }
      : null,

    assignedDate: row.assigned_date,
    startDate: row.start_date,
    startedAt: row.started_at,
    estimatedCompletionDate: row.estimated_completion_date,
    completedAt: row.completed_at,
    status: row.status,
    observations: row.observations,

    items,

    client: {
      id: client?.id ?? row.client_id,
      name: client?.name ?? 'Cliente sin definir',
      phone: client?.phone ?? null,
      email: client?.email ?? null,
    },
  };
}

function groupLocationPinsByItemId(
  rows: InstallationItemLocationPinRow[] | null,
) {
  const pinsByItemId =
    new Map<string, InstallationItemLocationPinRow[]>();

  (rows ?? []).forEach((pin) => {
    const current =
      pinsByItemId.get(pin.installation_item_id) ?? [];

    current.push(pin);
    pinsByItemId.set(pin.installation_item_id, current);
  });

  return pinsByItemId;
}

async function fetchLocationPinsByItemId(
  organizationId: string,
  installationIds: string[],
) {
  if (!supabase || installationIds.length === 0) {
    return new Map<string, InstallationItemLocationPinRow[]>();
  }

  const { data, error } = await supabase
    .from('installation_item_location_pins')
    .select(locationPinColumns)
    .eq('organization_id', organizationId)
    .in('installation_id', installationIds)
    .order('recorded_at', { ascending: false })
    .returns<InstallationItemLocationPinRow[]>();

  if (error) {
    if (__DEV__) {
      console.info('[mobile-installations]', {
        stage: 'LOAD_LOCATION_PINS',
        table: 'installation_item_location_pins',
        organizationId: `${organizationId.slice(0, 8)}...`,
        code: error.code ?? null,
        message: sanitizeDiagnosticText(error.message) ?? null,
        details: sanitizeDiagnosticText(error.details) ?? null,
        hint: sanitizeDiagnosticText(error.hint) ?? null,
      });
    }

    return new Map<string, InstallationItemLocationPinRow[]>();
  }

  return groupLocationPinsByItemId(data ?? []);
}

export function useInstallations() {
  const {
    status,
    selectedMembership,
    signOut,
  } = useAuth();

  const [installations, setInstallations] =
    useState<InstallationWithClient[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadedKeyRef = useRef('');

  const fetchInstallations = useCallback(
    async (mode: 'loading' | 'refresh' = 'loading') => {
      if (
        status !== 'authenticated' ||
        !selectedMembership ||
        !supabase
      ) {
        loadedKeyRef.current = '';

        setInstallations([]);
        setIsLoading(false);
        setIsRefreshing(false);

        return;
      }

      if (!selectedMembership.isActive) {
        loadedKeyRef.current = '';

        setInstallations([]);
        setError('');
        setIsLoading(false);
        setIsRefreshing(false);

        return;
      }

      const currentKey =
        `${selectedMembership.organizationId}:${selectedMembership.id}`;

      const hasLoadedCurrentKey =
        loadedKeyRef.current === currentKey;

      if (!hasLoadedCurrentKey) {
        setInstallations([]);
      }

      if (mode === 'refresh') {
        setIsRefreshing(true);
      } else if (hasLoadedCurrentKey) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setError('');

      const { data, error: queryError } = await supabase
        .from('installations')
        .select(installationColumns)
        .eq(
          'organization_id',
          selectedMembership.organizationId,
        )
        .eq(
          'technician_membership_id',
          selectedMembership.id,
        )
        .order('assigned_date', { ascending: false })
        .returns<InstallationRow[]>();

      if (queryError) {
        logInstallationsDiagnostic({
          stage: 'LOAD_INSTALLATIONS',
          error: queryError,
          organizationId:
            selectedMembership.organizationId,
          membershipId: selectedMembership.id,
        });

        if (queryError.code === 'PGRST301') {
          await signOut();
          return;
        }

        setError(
          'No pudimos cargar tus instalaciones. Intenta nuevamente.',
        );

        if (!hasLoadedCurrentKey) {
          loadedKeyRef.current = '';
          setInstallations([]);
        }
      } else {
        const rows = data ?? [];

        const pinsByItemId =
          await fetchLocationPinsByItemId(
            selectedMembership.organizationId,
            rows.map((row) => row.id),
          );

        setInstallations(
          rows.map((row) =>
            mapInstallationRow(row, pinsByItemId),
          ),
        );

        loadedKeyRef.current = currentKey;
      }

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [selectedMembership, signOut, status],
  );

  useEffect(() => {
    fetchInstallations();
  }, [fetchInstallations]);

  const refresh = useCallback(
    () => fetchInstallations('refresh'),
    [fetchInstallations],
  );

  return {
    installations,
    isLoading,
    isRefreshing,
    error,
    retry: fetchInstallations,
    refresh,
  };
}

export async function fetchInstallationById(
  id: string,
  membership: TechnicianMembership,
) {
  if (!supabase) {
    return {
      data: null,
      error: 'Supabase no esta configurado.',
    };
  }

  if (!membership.isActive) {
    return {
      data: null,
      error: 'Tu acceso a esta empresa esta desactivado.',
    };
  }

  const { data, error } = await supabase
    .from('installations')
    .select(installationColumns)
    .eq('id', id)
    .eq('organization_id', membership.organizationId)
    .eq('technician_membership_id', membership.id)
    .maybeSingle<InstallationRow>();

  if (error) {
    return {
      data: null,
      error: 'No pudimos cargar la instalacion.',
    };
  }

  const pinsByItemId = data
    ? await fetchLocationPinsByItemId(
        membership.organizationId,
        [data.id],
      )
    : new Map<
        string,
        InstallationItemLocationPinRow[]
      >();

  return {
    data: data
      ? mapInstallationRow(data, pinsByItemId)
      : null,
    error: '',
  };
}

// hooks/useInstallations.ts
// Carga una instalación para el panel administrativo.

export async function fetchInstallationByIdAdmin(
  id: string,
  organizationId: string,
) {
  if (!supabase) {
    return {
      data: null,
      error: 'Supabase no esta configurado.',
    };
  }

  const { data, error } = await supabase
    .from('installations')
    .select(installationColumns)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle<InstallationRow>();

  if (error) {
    return {
      data: null,
      error: 'No pudimos cargar la instalacion.',
    };
  }

  const pinsByItemId = data
    ? await fetchLocationPinsByItemId(
        organizationId,
        [data.id],
      )
    : new Map<
        string,
        InstallationItemLocationPinRow[]
      >();

  return {
    data: data
      ? mapInstallationRow(data, pinsByItemId)
      : null,
    error: '',
  };
}