import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type {
  InstallationActivity,
  InstallationActivityRow,
} from '../types/database';

const activityColumns = `
  id,
  organization_id,
  installation_id,
  installation_item_id,
  actor_id,
  actor_membership_id,
  activity_type,
  previous_status,
  new_status,
  metadata,
  created_at
`;

function mapActivityRow(row: InstallationActivityRow): InstallationActivity {
  return {
    id: row.id,
    organizationId: row.organization_id,
    installationId: row.installation_id,
    installationItemId: row.installation_item_id,
    actorId: row.actor_id,
    actorMembershipId: row.actor_membership_id,
    activityType: row.activity_type,
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    createdAt: row.created_at,
  };
}

export function useInstallationActivity(
  organizationId: string | null,
  installationId: string | null,
  installationItemId: string | null,
) {
  const [activities, setActivities] = useState<InstallationActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchActivity = useCallback(async () => {
    if (!organizationId || !installationId || !supabase) {
      setActivities([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');

    let query = supabase
      .from('installation_activity')
      .select(activityColumns)
      .eq('organization_id', organizationId)
      .eq('installation_id', installationId);

    if (installationItemId) {
      query = query.eq('installation_item_id', installationItemId);
    }

    const { data, error: queryError } = await query
      .order('created_at', { ascending: false })
      .returns<InstallationActivityRow[]>();

    if (queryError) {
      setActivities([]);
      setError('No pudimos cargar la actividad.');
    } else {
      setActivities((data ?? []).map(mapActivityRow));
    }

    setIsLoading(false);
  }, [installationId, installationItemId, organizationId]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  return {
    activities,
    isLoading,
    error,
    refresh: fetchActivity,
  };
}
