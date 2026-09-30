import { useCallback, useMemo, useState } from 'react';
import type { ImagePickerAsset } from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { randomUUID } from 'expo-crypto';
import { supabase } from '../lib/supabase';
import { optimizeSelectedPhoto } from '../lib/imageProcessing';
import {
  buildPhotoStoragePath,
  getPhotoStoragePathDetails,
  INSTALLATION_PHOTOS_BUCKET,
  SIGNED_URL_EXPIRES_IN_SECONDS,
} from '../lib/photoStorage';
import { PHOTO_LIMIT_PER_CATEGORY } from '../lib/photoCategories';
import {
  getPathDiagnosticDetails,
  getPhotoDiagnosticCode,
  logPhotoDiagnostic,
  type PhotoDiagnosticCode,
  type PhotoDiagnosticStage,
} from '../lib/photoDiagnostics';
import type {
  LocalSelectedPhoto,
  PhotoCategory,
  PhotoSource,
  PhotoUploadResult,
} from '../types/photos';
// 🔥🔥🔥 IMPORTAR UBICACIÓN 🔥🔥🔥
import * as Location from 'expo-location';

const MAX_BATCH_SIZE = 10;
const MAX_COMMENT_LENGTH = 500;

type UploadProgress = {
  current: number;
  total: number;
  label: string;
};

type UsePhotoUploadOptions = {
  organizationId: string;
  installationId: string;
  installationItemId: string | null;
  technicianId: string;
  technicianMembershipId: string;
  category: PhotoCategory;
  categoryLabel: string;
  existingCategoryCount: number;
  onUploaded: () => Promise<void> | void;
};

type PhotoUploadErrorKind =
  | 'preparation'
  | 'session'
  | 'permission'
  | 'storage'
  | 'database'
  | 'network';

// 🔥🔥🔥 TIPO PARA UBICACIÓN 🔥🔥🔥
type PhotoLocation = {
  latitude: number | null;
  longitude: number | null;
};

class PhotoUploadError extends Error {
  kind: PhotoUploadErrorKind;
  stage: PhotoDiagnosticStage;
  diagnosticCode: PhotoDiagnosticCode;
  cause?: unknown;

  constructor(
    kind: PhotoUploadErrorKind,
    stage: PhotoDiagnosticStage,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'PhotoUploadError';
    this.kind = kind;
    this.stage = stage;
    this.diagnosticCode = getPhotoDiagnosticCode(stage, cause ?? this);
    this.cause = cause;
  }
}

// 🔥🔥🔥 FUNCIÓN PARA OBTENER UBICACIÓN 🔥🔥🔥
async function getUploadLocation(): Promise<PhotoLocation> {
  try {
    // 1. Solicitar permisos
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== 'granted') {
      console.log('❌ Permiso de ubicación denegado');
      return { latitude: null, longitude: null };
    }

    // 2. Intentar obtener ubicación actual
    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      console.log('📍 Ubicación obtenida:', {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });

      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
    } catch (error) {
      // 3. Si falla, usar última ubicación conocida
      console.log('⚠️ Falló getCurrentPosition, intentando getLastKnownPosition');
      
      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 5 * 60 * 1000, // 5 minutos
      });

      if (lastKnown) {
        console.log('📍 Última ubicación conocida:', {
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
        });
        return {
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
        };
      }

      console.log('❌ No se pudo obtener ubicación');
      return { latitude: null, longitude: null };
    }
  } catch (error) {
    console.error('❌ Error al obtener ubicación:', error);
    return { latitude: null, longitude: null };
  }
}

function normalizeComment(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getSafeRouteShape(storagePath: string) {
  const parts = storagePath.split('/');

  return {
    startsWithSlash: storagePath.startsWith('/'),
    segmentCount: parts.length,
    bucketIncluded: parts[0] === INSTALLATION_PHOTOS_BUCKET,
    category: parts[3] ?? 'missing',
    extension: parts[4]?.split('.').pop() ?? 'missing',
  };
}

function isStorageDuplicateError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  const status = getErrorStatus(error);

  return (
    status === '409' ||
    message.includes('already exists') ||
    message.includes('duplicate') ||
    message.includes('resource already exists')
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error && 'message' in error) {
    return String(error.message);
  }

  return 'Error desconocido';
}

function getErrorName(error: unknown) {
  if (error instanceof Error) {
    return error.name;
  }

  if (typeof error === 'object' && error && 'name' in error) {
    return String(error.name);
  }

  return typeof error;
}

function getErrorStatus(error: unknown) {
  if (typeof error !== 'object' || !error) {
    return null;
  }

  if ('statusCode' in error) {
    return String(error.statusCode);
  }

  if ('status' in error) {
    return String(error.status);
  }

  if ('code' in error) {
    return String(error.code);
  }

  return null;
}

function isPhotoLimitError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes('10 fotograf') &&
    (message.includes('categor') || message.includes('category'))
  );
}

function getRemainingPhotoMessage(count: number, categoryLabel: string) {
  return count === 1
    ? `Solo puedes agregar 1 fotografía más en ${categoryLabel}.`
    : `Solo puedes agregar ${count} fotografías más en ${categoryLabel}.`;
}

function logUploadDiagnostic(
  stage: string,
  details: Record<string, string | number | boolean | null>,
  error?: unknown,
) {
  const diagnosticStage: PhotoDiagnosticStage = stage.startsWith('session')
    ? 'READ_SESSION'
    : stage.startsWith('membership')
      ? 'RESOLVE_MEMBERSHIP'
      : stage.startsWith('installation') || stage.startsWith('path_policy')
        ? 'VALIDATE_INSTALLATION'
    : stage.startsWith('image') || stage.startsWith('binary')
      ? 'PREPARE_IMAGE'
      : stage.startsWith('storage')
        ? 'UPLOAD_STORAGE'
        : 'INSERT_DATABASE';

  logPhotoDiagnostic(diagnosticStage, {
    ...details,
    operation: stage,
  }, error);
}

function getUserFacingError(error: unknown) {
  const diagnosticCode =
    error instanceof PhotoUploadError ? error.diagnosticCode : null;
  const diagnosticSuffix = __DEV__ && diagnosticCode ? ` (${diagnosticCode})` : '';

  if (
    isPhotoLimitError(error) ||
    (error instanceof PhotoUploadError && isPhotoLimitError(error.cause))
  ) {
    return 'Ya existen 10 fotografías en esta categoría.';
  }

  if (error instanceof PhotoUploadError) {
    if (error.kind === 'permission') {
      return `No tienes permiso para subir fotografías a esta instalación${diagnosticSuffix}`;
    }

    if (error.kind === 'session') {
      return `Tu sesión terminó. Inicia sesión nuevamente${diagnosticSuffix}`;
    }

    if (error.kind === 'network') {
      return `No pudimos conectar con el servidor. La fotografía permanece seleccionada${diagnosticSuffix}`;
    }
  }

  return `No se pudo subir esta fotografía. Intenta nuevamente.${diagnosticSuffix}`;
}

function classifySupabaseError(error: unknown, fallback: PhotoUploadErrorKind) {
  const message = getErrorMessage(error).toLowerCase();
  const status = getErrorStatus(error);

  if (
    status === '401' ||
    message.includes('jwt') ||
    message.includes('session')
  ) {
    return 'session';
  }

  if (
    status === '403' ||
    message.includes('row-level security') ||
    message.includes('permission denied') ||
    message.includes('not authorized')
  ) {
    return 'permission';
  }

  if (message.includes('network') || message.includes('fetch')) {
    return 'network';
  }

  return fallback;
}

async function cleanupUnregisteredStorageObject(
  client: NonNullable<typeof supabase>,
  storagePath: string,
) {
  const { error } = await client.storage
    .from(INSTALLATION_PHOTOS_BUCKET)
    .remove([storagePath]);

  return {
    removed: !error,
    error,
  };
}

function getAssetMimeType(asset: ImagePickerAsset) {
  if (asset.mimeType?.startsWith('image/')) {
    return asset.mimeType;
  }

  return null;
}

function buildSelectedPhoto(
  asset: ImagePickerAsset,
  source: PhotoSource,
  category: PhotoCategory,
): LocalSelectedPhoto {
  return {
    id: randomUUID(),
    uri: asset.uri,
    source,
    category,
    width: asset.width,
    height: asset.height,
    mimeType: getAssetMimeType(asset),
    fileName: asset.fileName ?? null,
    createdAt: new Date().toISOString(),
    uploadStatus: 'pending',
    error: null,
  };
}

export function usePhotoUpload({
  organizationId,
  installationId,
  installationItemId,
  technicianId,
  technicianMembershipId,
  category,
  categoryLabel,
  existingCategoryCount,
  onUploaded,
}: UsePhotoUploadOptions) {
  const [selectedPhotos, setSelectedPhotos] = useState<LocalSelectedPhoto[]>([]);
  const [comment, setComment] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [message, setMessage] = useState('');

  const currentCategoryPhotos = useMemo(
    () => selectedPhotos.filter((photo) => photo.category === category),
    [category, selectedPhotos],
  );

  const remainingSlots = Math.max(
    0,
    PHOTO_LIMIT_PER_CATEGORY - existingCategoryCount - currentCategoryPhotos.length,
  );
  const availableSlots = PHOTO_LIMIT_PER_CATEGORY - existingCategoryCount;
  const categoryLimitReached = existingCategoryCount >= PHOTO_LIMIT_PER_CATEGORY;
  const canUpload =
    currentCategoryPhotos.length > 0 &&
    currentCategoryPhotos.length <= availableSlots &&
    !isUploading;

  const addAssets = useCallback(
    (assets: ImagePickerAsset[], source: PhotoSource) => {
      setMessage('');

      setSelectedPhotos((current) => {
        const currentForCategory = current.filter(
          (photo) => photo.category === category,
        );
        const remaining = Math.min(
          MAX_BATCH_SIZE - currentForCategory.length,
          PHOTO_LIMIT_PER_CATEGORY - existingCategoryCount - currentForCategory.length,
        );

        if (remaining <= 0) {
          setMessage(
            `Has alcanzado el límite de ${PHOTO_LIMIT_PER_CATEGORY} fotografías en ${categoryLabel}.`,
          );
          return current;
        }

        const accepted = assets.slice(0, remaining);

        if (accepted.length < assets.length) {
          setMessage(getRemainingPhotoMessage(remaining, categoryLabel));
        }

        return [
          ...current,
          ...accepted.map((asset) => buildSelectedPhoto(asset, source, category)),
        ];
      });
    },
    [category, categoryLabel, existingCategoryCount],
  );

  const removeSelectedPhoto = useCallback((photoId: string) => {
    setSelectedPhotos((current) =>
      current.filter((photo) => photo.id !== photoId),
    );
  }, []);

  const updatePhotoStatus = useCallback(
    (
      photoId: string,
      status: LocalSelectedPhoto['uploadStatus'],
      error: string | null,
    ) => {
      setSelectedPhotos((current) =>
        current.map((photo) =>
          photo.id === photoId
            ? { ...photo, uploadStatus: status, error }
            : photo,
        ),
      );
    },
    [],
  );

  const uploadSelectedPhotos = useCallback(async () => {
    if (!supabase || isUploading || currentCategoryPhotos.length === 0) {
      return;
    }

    if (availableSlots <= 0) {
      setMessage('Ya existen 10 fotografías en esta categoría.');
      return;
    }

    if (currentCategoryPhotos.length > availableSlots) {
      setMessage(getRemainingPhotoMessage(availableSlots, categoryLabel));
      return;
    }

    const client = supabase;

    setIsUploading(true);
    setMessage('');

    // 🔥🔥🔥 CAPTURAR UBICACIÓN UNA SOLA VEZ PARA TODO EL LOTE 🔥🔥🔥
    const uploadLocation = await getUploadLocation();
    console.log('📍 Ubicación del lote:', uploadLocation);

    const uploadComment = normalizeComment(comment);
    const results: PhotoUploadResult[] = [];

    for (let index = 0; index < currentCategoryPhotos.length; index += 1) {
      const photo = currentCategoryPhotos[index];
      const currentStep = index + 1;
      setProgress({
        current: currentStep,
        total: currentCategoryPhotos.length,
        label: `Subiendo ${currentStep} de ${currentCategoryPhotos.length}…`,
      });
      updatePhotoStatus(photo.id, 'uploading', null);

      try {
        logUploadDiagnostic('session_check:start', {
          bucket: INSTALLATION_PHOTOS_BUCKET,
          photoId: photo.id,
          selectedCategory: photo.category,
        });

        const { data: sessionData, error: sessionError } =
          await client.auth.getSession();

        if (sessionError) {
          logUploadDiagnostic('session_check:error', {
            bucket: INSTALLATION_PHOTOS_BUCKET,
            photoId: photo.id,
          }, sessionError);
          throw new PhotoUploadError(
            'session',
            'READ_SESSION',
            'No se pudo validar la sesión',
            sessionError,
          );
        }

        let session = sessionData.session;

        if (!session?.user) {
          throw new PhotoUploadError(
            'session',
            'READ_SESSION',
            'No hay una sesión activa',
          );
        }

        const expiresAt = session.expires_at ?? 0;
        const shouldRefresh = expiresAt > 0 && expiresAt - Date.now() / 1000 < 60;

        if (shouldRefresh) {
          const { data: refreshed, error: refreshError } =
            await client.auth.refreshSession();

          if (refreshError || !refreshed.session?.user) {
            logUploadDiagnostic('session_refresh:error', {
              bucket: INSTALLATION_PHOTOS_BUCKET,
              photoId: photo.id,
            }, refreshError);
            throw new PhotoUploadError(
              'session',
              'READ_SESSION',
              'Tu sesión terminó',
              refreshError,
            );
          }

          session = refreshed.session;
        }

        const sessionMatchesTechnician = session.user.id === technicianId;

        if (!sessionMatchesTechnician) {
          throw new PhotoUploadError(
            'session',
            'READ_SESSION',
            'La sesión no corresponde al técnico actual',
          );
        }

        logUploadDiagnostic('session_check:ok', {
          bucket: INSTALLATION_PHOTOS_BUCKET,
          photoId: photo.id,
          hasSession: true,
          sessionMatchesTechnician,
        });

        logUploadDiagnostic('membership_resolve:start', {
          bucket: INSTALLATION_PHOTOS_BUCKET,
          photoId: photo.id,
          organizationId,
          technicianMembershipId,
        });

        const { data: activeMembershipId, error: membershipError } =
          await client.rpc('get_active_technician_membership', {
            target_organization_id: organizationId,
          });

        if (membershipError) {
          logUploadDiagnostic('membership_resolve:error', {
            bucket: INSTALLATION_PHOTOS_BUCKET,
            photoId: photo.id,
            organizationId,
            technicianMembershipId,
          }, membershipError);
          throw new PhotoUploadError(
            'permission',
            'RESOLVE_MEMBERSHIP',
            'No se pudo validar la membresía activa',
            membershipError,
          );
        }

        if (activeMembershipId !== technicianMembershipId) {
          throw new PhotoUploadError(
            'permission',
            'RESOLVE_MEMBERSHIP',
            'La membresía activa no corresponde a esta instalación',
          );
        }

        logUploadDiagnostic('membership_resolve:ok', {
          bucket: INSTALLATION_PHOTOS_BUCKET,
          photoId: photo.id,
          organizationId,
          technicianMembershipId,
          membershipMatches: true,
        });

        logUploadDiagnostic('image_processing:start', {
          bucket: INSTALLATION_PHOTOS_BUCKET,
          photoId: photo.id,
          source: photo.source,
          width: photo.width,
          height: photo.height,
        });

        const processed = await optimizeSelectedPhoto(photo);
        const storagePath = buildPhotoStoragePath(
          organizationId,
          installationId,
          installationItemId,
          technicianMembershipId,
          photo.category,
          photo.id,
        );

        logUploadDiagnostic('image_processing:ok', {
          bucket: INSTALLATION_PHOTOS_BUCKET,
          photoId: photo.id,
          mimeType: processed.mimeType,
          fileSizeBytes: processed.fileSizeBytes,
          width: processed.width,
          height: processed.height,
          hasBase64: Boolean(processed.base64),
        });

        const pathDetails = getPhotoStoragePathDetails(
          storagePath,
          organizationId,
          installationId,
          installationItemId,
          technicianMembershipId,
          photo.category,
        );
        const routeShape = getPathDiagnosticDetails(pathDetails);

        if (
          pathDetails.startsWithSlash ||
          pathDetails.bucketIncluded ||
          ![5, 6].includes(pathDetails.segmentCount) ||
          pathDetails.category !== photo.category ||
          pathDetails.extension !== 'jpg'
        ) {
          throw new PhotoUploadError(
            'preparation',
            'PREPARE_IMAGE',
            'La ruta de la fotografía no tiene el formato esperado',
          );
        }

        logUploadDiagnostic('installation_validate:start', {
          photoId: photo.id,
          ...routeShape,
          storagePath,
        });

        const { data: installationAllowsPhotos, error: installationError } =
          installationItemId
            ? await client.rpc('installation_item_allows_photo_insert', {
                target_installation_id: installationId,
                target_installation_item_id: installationItemId,
                target_technician_membership_id: technicianMembershipId,
              })
            : await client.rpc('installation_allows_photo_insert', {
                target_installation_id: installationId,
                target_technician_id: technicianMembershipId,
              });

        if (installationError) {
          logUploadDiagnostic('installation_validate:error', {
            photoId: photo.id,
            ...routeShape,
            storagePath,
          }, installationError);
          throw new PhotoUploadError(
            'permission',
            'VALIDATE_INSTALLATION',
            'No se pudo validar la instalación',
            installationError,
          );
        }

        if (!installationAllowsPhotos) {
          throw new PhotoUploadError(
            'permission',
            'VALIDATE_INSTALLATION',
            'La instalación no permite subir fotografías',
          );
        }

        const { data: pathAllowedByPolicy, error: pathPolicyError } =
          await client.rpc('can_insert_installation_photo_storage', {
            target_path: storagePath,
          });

        if (pathPolicyError) {
          logUploadDiagnostic('path_policy_validate:error', {
            photoId: photo.id,
            ...routeShape,
            storagePath,
          }, pathPolicyError);
          throw new PhotoUploadError(
            'permission',
            'UPLOAD_STORAGE',
            'No se pudo validar la ruta de Storage',
            pathPolicyError,
          );
        }

        if (!pathAllowedByPolicy) {
          throw new PhotoUploadError(
            'permission',
            'UPLOAD_STORAGE',
            'La ruta de Storage no corresponde a esta instalación',
          );
        }

        logUploadDiagnostic('installation_validate:ok', {
          photoId: photo.id,
          ...routeShape,
          storagePath,
          installationAllowsPhotos: true,
          pathAllowedByPolicy: true,
        });

        logUploadDiagnostic('binary_conversion:start', {
          photoId: photo.id,
          ...routeShape,
          mimeType: processed.mimeType,
        });

        const arrayBuffer = decode(processed.base64);

        logUploadDiagnostic('binary_conversion:ok', {
          bucket: INSTALLATION_PHOTOS_BUCKET,
          photoId: photo.id,
          byteLength: arrayBuffer.byteLength,
          mimeType: processed.mimeType,
        });

        const existingMetadata = await client
          .from('installation_photos')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('id', photo.id)
          .maybeSingle<{ id: string }>();

        if (existingMetadata.error) {
          const kind = classifySupabaseError(existingMetadata.error, 'database');
          logUploadDiagnostic('metadata_existing:error', {
            bucket: INSTALLATION_PHOTOS_BUCKET,
            photoId: photo.id,
          }, existingMetadata.error);
          throw new PhotoUploadError(
            kind,
            'INSERT_DATABASE',
            'No se pudo verificar la fotografía',
            existingMetadata.error,
          );
        }

        const metadataAlreadyExists = Boolean(existingMetadata.data);
        let fileArrivedToStorage = metadataAlreadyExists;
        let storageCreatedOrRecovered = false;

        logUploadDiagnostic('metadata_existing:checked', {
          bucket: INSTALLATION_PHOTOS_BUCKET,
          photoId: photo.id,
          metadataAlreadyExists,
          storagePath,
          storageCompleted: fileArrivedToStorage,
          postgresCompleted: metadataAlreadyExists,
        });

        if (!metadataAlreadyExists) {
          logUploadDiagnostic('storage_upload:start', {
            photoId: photo.id,
            ...routeShape,
            mimeType: processed.mimeType,
            byteLength: arrayBuffer.byteLength,
            storagePath,
            storageCompleted: false,
            postgresCompleted: metadataAlreadyExists,
          });

          const { error: uploadError } = await client.storage
            .from(INSTALLATION_PHOTOS_BUCKET)
            .upload(storagePath, arrayBuffer, {
              contentType: processed.mimeType,
              cacheControl: '3600',
              upsert: false,
            });

          if (uploadError) {
            if (isStorageDuplicateError(uploadError)) {
              fileArrivedToStorage = true;
              storageCreatedOrRecovered = true;
              logUploadDiagnostic('storage_upload:duplicate_recovered', {
                photoId: photo.id,
                ...routeShape,
                mimeType: processed.mimeType,
                byteLength: arrayBuffer.byteLength,
                storagePath,
                storageCompleted: true,
                postgresCompleted: metadataAlreadyExists,
              }, uploadError);
            } else {
              const kind = classifySupabaseError(uploadError, 'storage');
              logUploadDiagnostic('storage_upload:error', {
                photoId: photo.id,
                ...routeShape,
                mimeType: processed.mimeType,
                byteLength: arrayBuffer.byteLength,
                storagePath,
                storageCompleted: false,
                postgresCompleted: metadataAlreadyExists,
              }, uploadError);
              throw new PhotoUploadError(
                kind,
                'UPLOAD_STORAGE',
                'No se pudo subir la fotografía',
                uploadError,
              );
            }
          } else {
            fileArrivedToStorage = true;
            storageCreatedOrRecovered = true;
          }
        }

        logUploadDiagnostic('storage_upload:completed', {
          bucket: INSTALLATION_PHOTOS_BUCKET,
          photoId: photo.id,
          fileArrivedToStorage,
          storagePath,
          storageCompleted: fileArrivedToStorage,
          postgresCompleted: metadataAlreadyExists,
        });

        if (!fileArrivedToStorage) {
          throw new PhotoUploadError(
            'storage',
            'UPLOAD_STORAGE',
            'Storage no confirmó la fotografía subida',
          );
        }

        if (!metadataAlreadyExists) {
          logUploadDiagnostic('database_insert:start', {
            photoId: photo.id,
            ...routeShape,
            mimeType: processed.mimeType,
            fileSizeBytes: processed.fileSizeBytes,
            storagePath,
            storageCompleted: fileArrivedToStorage,
            postgresCompleted: false,
          });

          // 🔥🔥🔥 INSERT CON UBICACIÓN 🔥🔥🔥
          const { error: insertError } = await client
            .from('installation_photos')
            .insert({
              id: photo.id,
              organization_id: organizationId,
              installation_id: installationId,
              installation_item_id: installationItemId,
              technician_id: technicianId,
              uploader_membership_id: technicianMembershipId,
              category: photo.category,
              storage_path: storagePath,
              file_name: processed.fileName,
              mime_type: processed.mimeType,
              file_size_bytes: processed.fileSizeBytes,
              width: processed.width,
              height: processed.height,
              source: photo.source,
              comment: uploadComment,
              captured_at: photo.source === 'camera' ? photo.createdAt : null,
              // 🔥🔥🔥 UBICACIÓN 🔥🔥🔥
              latitud: uploadLocation.latitude,
              longitud: uploadLocation.longitude,
              tiene_ubicacion: uploadLocation.latitude !== null && uploadLocation.longitude !== null,
            });

          if (insertError) {
            const kind = classifySupabaseError(insertError, 'database');
            logUploadDiagnostic('database_insert:error', {
              bucket: INSTALLATION_PHOTOS_BUCKET,
              photoId: photo.id,
              fileArrivedToStorage,
              storagePath,
              storageCompleted: fileArrivedToStorage,
              postgresCompleted: false,
            }, insertError);

            if (storageCreatedOrRecovered) {
              const cleanup = await cleanupUnregisteredStorageObject(
                client,
                storagePath,
              );

              logUploadDiagnostic('storage_cleanup_after_database_error', {
                bucket: INSTALLATION_PHOTOS_BUCKET,
                photoId: photo.id,
                storagePath,
                storageCompleted: !cleanup.removed,
                postgresCompleted: false,
                cleanupRemoved: cleanup.removed,
              }, cleanup.error ?? undefined);
            }

            throw new PhotoUploadError(
              kind,
              'INSERT_DATABASE',
              'No se pudo registrar la fotografía',
              insertError,
            );
          }
        }

        const insertedMetadata = await client
          .from('installation_photos')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('id', photo.id)
          .maybeSingle<{ id: string }>();

        const recordArrivedToDatabase = Boolean(insertedMetadata.data);

        logUploadDiagnostic('database_insert:verified', {
          bucket: INSTALLATION_PHOTOS_BUCKET,
          photoId: photo.id,
          recordArrivedToDatabase,
          storagePath,
          storageCompleted: fileArrivedToStorage,
          postgresCompleted: recordArrivedToDatabase,
        }, insertedMetadata.error ?? undefined);

        if (!recordArrivedToDatabase) {
          throw new PhotoUploadError(
            'database',
            'INSERT_DATABASE',
            'PostgreSQL no confirmó la fotografía registrada',
            insertedMetadata.error,
          );
        }

        logPhotoDiagnostic('CREATE_SIGNED_URL', {
          bucket: INSTALLATION_PHOTOS_BUCKET,
          photoId: photo.id,
          storagePath,
          mimeType: processed.mimeType,
          byteLength: arrayBuffer.byteLength,
          installationId,
          technicianId,
          category: photo.category,
          storageCompleted: fileArrivedToStorage,
          postgresCompleted: recordArrivedToDatabase,
        });

        const { data: signedData, error: signedUrlError } = await client.storage
          .from(INSTALLATION_PHOTOS_BUCKET)
          .createSignedUrl(storagePath, SIGNED_URL_EXPIRES_IN_SECONDS);

        if (signedUrlError || !signedData?.signedUrl) {
          logPhotoDiagnostic('CREATE_SIGNED_URL', {
            bucket: INSTALLATION_PHOTOS_BUCKET,
            photoId: photo.id,
            storagePath,
            mimeType: processed.mimeType,
            byteLength: arrayBuffer.byteLength,
            installationId,
            technicianId,
            category: photo.category,
            storageCompleted: fileArrivedToStorage,
            postgresCompleted: recordArrivedToDatabase,
          }, signedUrlError);

          throw new PhotoUploadError(
            'storage',
            'CREATE_SIGNED_URL',
            'No se pudo generar la vista previa segura',
            signedUrlError,
          );
        }

        logPhotoDiagnostic('CREATE_SIGNED_URL', {
          bucket: INSTALLATION_PHOTOS_BUCKET,
          photoId: photo.id,
          storagePath,
          mimeType: processed.mimeType,
          byteLength: arrayBuffer.byteLength,
          installationId,
          technicianId,
          category: photo.category,
          storageCompleted: fileArrivedToStorage,
          postgresCompleted: recordArrivedToDatabase,
          signedUrlCreated: true,
        });

        updatePhotoStatus(photo.id, 'uploaded', null);
        results.push({
          photoId: photo.id,
          ok: true,
          error: null,
        });
      } catch (error) {
        const userFacingError = getUserFacingError(error);
        updatePhotoStatus(
          photo.id,
          'failed',
          userFacingError,
        );
        results.push({
          photoId: photo.id,
          ok: false,
          error: userFacingError,
        });
      }
    }

    const successfulIds = new Set(
      results.filter((result) => result.ok).map((result) => result.photoId),
    );
    const failedCount = results.filter((result) => !result.ok).length;
    const successCount = successfulIds.size;

    setSelectedPhotos((current) =>
      current.filter((photo) => !successfulIds.has(photo.id)),
    );

    if (successCount > 0) {
      await onUploaded();
    }

    if (failedCount === 0) {
      setComment('');
      const locationMsg = uploadLocation.latitude ? ' 📍 con ubicación' : '';
      setMessage(`Fotografías subidas correctamente${locationMsg}`);
    } else if (successCount > 0) {
      setMessage(
        `${successCount} fotografías se subieron correctamente. ${failedCount} no pudieron subirse y permanecen seleccionadas para reintentar`,
      );
    } else {
      setMessage(results.find((result) => result.error)?.error ?? 'No pudimos subir las fotografías. Permanecen seleccionadas para reintentar');
    }

    setProgress(null);
    setIsUploading(false);
  }, [
    comment,
    currentCategoryPhotos,
    categoryLabel,
    existingCategoryCount,
    organizationId,
    installationId,
    installationItemId,
    isUploading,
    onUploaded,
    technicianId,
    technicianMembershipId,
    updatePhotoStatus,
  ]);

  return {
    selectedPhotos: currentCategoryPhotos,
    comment,
    setComment: (value: string) =>
      setComment(value.slice(0, MAX_COMMENT_LENGTH)),
    commentLimit: MAX_COMMENT_LENGTH,
    addAssets,
    removeSelectedPhoto,
    uploadSelectedPhotos,
    isUploading,
    progress,
    message,
    canUpload,
    remainingSlots,
    limitPerCategory: PHOTO_LIMIT_PER_CATEGORY,
    categoryLimitReached,
  };
}