import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  INSTALLATION_PHOTOS_BUCKET,
  SIGNED_URL_EXPIRES_IN_SECONDS,
} from '../lib/photoStorage';
import { logPhotoDiagnostic } from '../lib/photoDiagnostics';
import { getCachedSignedStorageUrls } from '../lib/privateStorageUrls';
import { photoCategories } from '../lib/photoCategories';
import type {
  InstallationPhotoRow,
  InstallationPhotoWithProfile,
  PhotoCategory,
} from '../types/photos';

const emptyPhotoCounts = {
  before: 0,
  during: 0,
  after: 0,
} satisfies Record<PhotoCategory, number>;

const photoColumns = `
  id,
  organization_id,
  installation_id,
  installation_item_id,
  technician_id,
  uploader_membership_id,
  category,
  storage_path,
  file_name,
  mime_type,
  file_size_bytes,
  width,
  height,
  source,
  comment,
  captured_at,
  uploaded_at,
  created_at,
  organization_memberships!installation_photos_uploader_membership_id_fkey (
    full_name
  )
`;

function firstProfile(
  profile: { full_name: string } | { full_name: string }[] | null,
) {
  if (Array.isArray(profile)) {
    return profile[0] ?? null;
  }

  return profile;
}

function mapPhotoRow(
  row: InstallationPhotoRow,
  signedUrl: string | null,
): InstallationPhotoWithProfile {
  return {
    id: row.id,
    organizationId: row.organization_id,
    installationId: row.installation_id,
    installationItemId: row.installation_item_id,
    technicianId: row.technician_id,
    uploaderMembershipId: row.uploader_membership_id,
    category: row.category,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    width: row.width,
    height: row.height,
    source: row.source,
    comment: row.comment,
    capturedAt: row.captured_at,
    uploadedAt: row.uploaded_at,
    createdAt: row.created_at,
    technicianName: firstProfile(row.organization_memberships)?.full_name ?? null,
    signedUrl,
  };
}

export function useInstallationPhotos(
  organizationId: string | null,
  installationId: string | null,
  installationItemId: string | null,
  category: PhotoCategory,
) {
  const [photos, setPhotos] = useState<InstallationPhotoWithProfile[]>([]);
  const [photoCounts, setPhotoCounts] =
    useState<Record<PhotoCategory, number>>(emptyPhotoCounts);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const loadedKeyRef = useRef('');

  const fetchPhotos = useCallback(
    async (mode: 'loading' | 'refresh' = 'loading') => {
      if (!organizationId || !installationId || !supabase) {
        loadedKeyRef.current = '';
        setPhotos([]);
        setPhotoCounts(emptyPhotoCounts);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      const client = supabase;
      const currentKey = `${organizationId}:${installationId}:${installationItemId ?? 'all'}:${category}`;
      const hasLoadedCurrentKey = loadedKeyRef.current === currentKey;

      if (!hasLoadedCurrentKey) {
        setPhotos([]);
      }

      if (mode === 'refresh') {
        setIsRefreshing(true);
      } else if (hasLoadedCurrentKey) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setError('');

      logPhotoDiagnostic('REFRESH_GALLERY', {
        installationId,
        category,
        storageCompleted: null,
        postgresCompleted: false,
      });

      let query = client
        .from('installation_photos')
        .select(photoColumns)
        .eq('organization_id', organizationId)
        .eq('installation_id', installationId)
        .eq('category', category);

      if (installationItemId) {
        query = query.eq('installation_item_id', installationItemId);
      }

      const { data, error: queryError } = await query
        .order('uploaded_at', { ascending: false })
        .returns<InstallationPhotoRow[]>();

      let countQuery = client
        .from('installation_photos')
        .select('category')
        .eq('organization_id', organizationId)
        .eq('installation_id', installationId);

      if (installationItemId) {
        countQuery = countQuery.eq('installation_item_id', installationItemId);
      }

      const { data: countRows, error: countError } = await countQuery
        .returns<Array<{ category: PhotoCategory }>>();

      if (queryError || countError) {
        logPhotoDiagnostic('REFRESH_GALLERY', {
          installationId,
          category,
          storageCompleted: null,
          postgresCompleted: false,
        }, queryError ?? countError);

        if (!hasLoadedCurrentKey) {
          loadedKeyRef.current = '';
          setPhotos([]);
        }
        setError('No pudimos cargar las fotografías. Intenta nuevamente.');
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      const rows = data ?? [];
      const nextCounts: Record<PhotoCategory, number> = { ...emptyPhotoCounts };

      for (const row of countRows ?? []) {
        if (photoCategories.includes(row.category)) {
          nextCounts[row.category] += 1;
        }
      }

      setPhotoCounts(nextCounts);

      rows.forEach((row) => {
        logPhotoDiagnostic('CREATE_SIGNED_URL', {
          bucket: INSTALLATION_PHOTOS_BUCKET,
          storagePath: row.storage_path,
          mimeType: row.mime_type,
          installationId: row.installation_id,
          technicianId: row.technician_id,
          category: row.category,
          storageCompleted: true,
          postgresCompleted: true,
        });
      });

      const signedUrls = await getCachedSignedStorageUrls({
        client,
        bucket: INSTALLATION_PHOTOS_BUCKET,
        organizationId,
        storagePaths: rows.map((row) => row.storage_path),
        expiresInSeconds: SIGNED_URL_EXPIRES_IN_SECONDS,
      });

      const signedPhotos = rows.map((row) => {
        logPhotoDiagnostic('CREATE_SIGNED_URL', {
          bucket: INSTALLATION_PHOTOS_BUCKET,
          storagePath: row.storage_path,
          mimeType: row.mime_type,
          installationId: row.installation_id,
          technicianId: row.technician_id,
          category: row.category,
          storageCompleted: true,
          postgresCompleted: true,
          signedUrlCreated: signedUrls.has(row.storage_path),
        });

        return mapPhotoRow(row, signedUrls.get(row.storage_path) ?? null);
      });

      logPhotoDiagnostic('REFRESH_GALLERY', {
        installationId,
        category,
        photoCount: signedPhotos.length,
        storageCompleted: true,
        postgresCompleted: true,
      });

      setPhotos(signedPhotos);
      loadedKeyRef.current = currentKey;
      setIsLoading(false);
      setIsRefreshing(false);
    },
    [category, installationId, installationItemId, organizationId],
  );

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  return {
    photos,
    photoCounts,
    isLoading,
    isRefreshing,
    error,
    refresh: () => fetchPhotos('refresh'),
    retry: fetchPhotos,
  };
}

export async function fetchInstallationPhotoById(
  photoId: string,
  organizationId: string,
) {
  if (!supabase) {
    return {
      data: null,
      error: 'Supabase no está configurado.',
    };
  }

  const { data, error } = await supabase
    .from('installation_photos')
    .select(photoColumns)
    .eq('organization_id', organizationId)
    .eq('id', photoId)
    .maybeSingle<InstallationPhotoRow>();

  if (error) {
    return {
      data: null,
      error: 'No pudimos cargar la fotografía.',
    };
  }

  if (!data) {
    return {
      data: null,
      error: '',
    };
  }

  const signedUrls = await getCachedSignedStorageUrls({
    client: supabase,
    bucket: INSTALLATION_PHOTOS_BUCKET,
    organizationId,
    storagePaths: [data.storage_path],
    expiresInSeconds: SIGNED_URL_EXPIRES_IN_SECONDS,
  });

  return {
    data: mapPhotoRow(data, signedUrls.get(data.storage_path) ?? null),
    error: '',
  };
}
