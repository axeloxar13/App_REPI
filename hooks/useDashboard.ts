// mobile-app/hooks/useDashboard.ts
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import type { DashboardMetrics } from '../types/database';

interface DashboardData {
  metrics: DashboardMetrics;
  recentInstallations: any[];
  recentPhotos: any[];
}

const emptyMetrics: DashboardMetrics = {
  active_installations: 0,
  completed_installations: 0,
  pending_installations: 0,
  photos_uploaded_today: 0,
  active_technicians: 0,
};

export function useDashboard() {
  const { supabase, selectedMembership } = useAuth();

  const [data, setData] = useState<DashboardData>({
    metrics: emptyMetrics,
    recentInstallations: [],
    recentPhotos: [],
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const organizationId = selectedMembership?.organizationId;

  const loadDashboard = useCallback(async () => {
    if (!organizationId || !supabase) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // ------------------------------------------------------------
      // 1. Métricas
      // ------------------------------------------------------------
      const { data: metricsData, error: metricsError } = await supabase
        .rpc('admin_dashboard_metrics', {
          p_organization_id: organizationId,
        });

      if (metricsError) {
        throw metricsError;
      }

      const metrics = metricsData?.[0] ?? emptyMetrics;

      // ------------------------------------------------------------
      // 2. Instalaciones recientes
      // ------------------------------------------------------------
      const {
        data: recentInstallations,
        error: installsError,
      } = await supabase
        .from('installations')
        .select(`
          id,
          project_name,
          status,
          address,
          assigned_date,
          client:client_id (id, name, phone, email),
          technician:technician_id (id, full_name, role)
        `)
        .eq('organization_id', organizationId)
        .order('updated_at', { ascending: false })
        .limit(5);

      if (installsError) {
        throw installsError;
      }

      // ------------------------------------------------------------
      // 3. Fotos recientes
      // ------------------------------------------------------------
      const {
        data: recentPhotos,
        error: photosError,
      } = await supabase
        .from('installation_photos')
        .select(`
          id,
          category,
          file_name,
          storage_path,
          comment,
          uploaded_at,
          installation:installation_id (id, project_name, status),
          technician:technician_id (id, full_name)
        `)
        .eq('organization_id', organizationId)
        .order('uploaded_at', { ascending: false })
        .limit(4);

      if (photosError) {
        throw photosError;
      }

      // ------------------------------------------------------------
      // 4. Generar URLs firmadas sin permitir que una foto
      //    con problemas de red bloquee todo el dashboard.
      // ------------------------------------------------------------
      const photosWithUrls = await Promise.all(
        (recentPhotos ?? []).map(async (photo) => {
          // Si la foto no tiene ruta, no intentamos consultar Storage.
          if (!photo?.storage_path) {
            return {
              ...photo,
              signedUrl: null,
            };
          }

          try {
            const {
              data: signedUrlData,
              error: signedUrlError,
            } = await supabase.storage
              .from('installation-photos')
              .createSignedUrl(photo.storage_path, 60);

            // Un error al obtener una imagen NO debe detener
            // la carga del resto del dashboard.
            if (signedUrlError) {
              console.warn(
                'No se pudo generar la URL de la foto:',
                photo.id,
                signedUrlError.message || signedUrlError,
              );

              return {
                ...photo,
                signedUrl: null,
              };
            }

            return {
              ...photo,
              signedUrl: signedUrlData?.signedUrl ?? null,
            };
          } catch (photoError) {
            console.warn(
              'Error de red al cargar la foto:',
              photo.id,
              photoError,
            );

            return {
              ...photo,
              signedUrl: null,
            };
          }
        }),
      );

      // ------------------------------------------------------------
      // 5. Actualizar dashboard
      // ------------------------------------------------------------
      setData({
        metrics: {
          active_installations:
            Number(metrics.active_installations) || 0,
          completed_installations:
            Number(metrics.completed_installations) || 0,
          pending_installations:
            Number(metrics.pending_installations) || 0,
          photos_uploaded_today:
            Number(metrics.photos_uploaded_today) || 0,
          active_technicians:
            Number(metrics.active_technicians) || 0,
        },

        recentInstallations: recentInstallations ?? [],
        recentPhotos: photosWithUrls,
      });
    } catch (err) {
      console.error('Error loading dashboard:', err);

      const normalizedError =
        err instanceof Error
          ? err
          : new Error(
              typeof err === 'string'
                ? err
                : 'No se pudo cargar el dashboard.',
            );

      setError(normalizedError);
    } finally {
      setLoading(false);
    }
  }, [supabase, organizationId]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  return {
    ...data,
    loading,
    error,
    refresh: loadDashboard,
  };
}
