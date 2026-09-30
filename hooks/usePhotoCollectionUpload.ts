import { useCallback, useState } from 'react';
import type { ImagePickerAsset } from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { randomUUID } from 'expo-crypto';

import { supabase } from '../lib/supabase';

import { optimizeSelectedPhoto } from '../lib/imageProcessing';

import {
  buildPhotoCollectionStoragePath,
  INSTALLATION_PHOTOS_BUCKET,
  SIGNED_URL_EXPIRES_IN_SECONDS,
} from '../lib/photoStorage';

import {
  logPhotoDiagnostic,
} from '../lib/photoDiagnostics';

import type {
  LocalSelectedPhoto,
  PhotoCollectionLocation,
  PhotoCollectionMetadata,
  PhotoCollectionSource,
} from '../types/photos';

type UploadProgress = {
  current: number;
  total: number;
  label: string;
};

type UsePhotoCollectionUploadOptions = {
  organizationId: string;
  installationId: string;
  installationItemId: string;

  technicianId: string;
  technicianMembershipId: string;

  metadata: PhotoCollectionMetadata;

  photo: ImagePickerAsset | null;

  source: PhotoCollectionSource;

  location: PhotoCollectionLocation | null;

  onUploaded?: (
    photoId: string,
  ) => Promise<void> | void;
};

type PhotoCollectionUploadResult = {
  photoId: string;
  ok: boolean;
  error: string | null;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error
  ) {
    return String(error.message);
  }

  return 'Error desconocido.';
}

async function cleanupStorageObject(
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

function getAssetMimeType(
  asset: ImagePickerAsset,
) {
  if (asset.mimeType?.startsWith('image/')) {
    return asset.mimeType;
  }

  return 'image/jpeg';
}

export function usePhotoCollectionUpload({
  organizationId,
  installationId,
  installationItemId,
  technicianId,
  technicianMembershipId,
  metadata,
  photo,
  source,
  location,
  onUploaded,
}: UsePhotoCollectionUploadOptions) {
  const [isUploading, setIsUploading] =
    useState(false);

  const [progress, setProgress] =
    useState<UploadProgress | null>(null);

  const [message, setMessage] =
    useState('');

  const uploadPhoto = useCallback(
    async (): Promise<
      PhotoCollectionUploadResult | null
    > => {
      if (!supabase) {
        setMessage(
          'Supabase no está configurado.',
        );
        return null;
      }

      if (isUploading) {
        return null;
      }

      if (!photo) {
        setMessage(
          'Primero selecciona una fotografía.',
        );
        return null;
      }

      if (!organizationId) {
        setMessage(
          'No se encontró la organización.',
        );
        return null;
      }

      if (!installationId) {
        setMessage(
          'No se encontró la instalación.',
        );
        return null;
      }

      if (!installationItemId) {
        setMessage(
          'Primero selecciona un PMI.',
        );
        return null;
      }

      if (!technicianId) {
        setMessage(
          'No se encontró el técnico actual.',
        );
        return null;
      }

      if (!technicianMembershipId) {
        setMessage(
          'No se encontró la membresía del técnico.',
        );
        return null;
      }

      if (!metadata.serviceCode) {
        setMessage(
          'No se encontró el servicio de la fotografía.',
        );
        return null;
      }

      if (!metadata.photoGroupId) {
        setMessage(
          'Selecciona qué fotografía estás recabando.',
        );
        return null;
      }

      if (!metadata.photoTypeId) {
        setMessage(
          'Selecciona el tipo específico de fotografía.',
        );
        return null;
      }

      const client = supabase;

      const photoId = randomUUID();

      setIsUploading(true);
      setMessage('');

      try {
        /* ======================================================
         * 1. VALIDAR SESIÓN
         * ====================================================== */

        setProgress({
          current: 1,
          total: 5,
          label: 'Validando sesión…',
        });

        const {
          data: sessionData,
          error: sessionError,
        } = await client.auth.getSession();

        if (sessionError) {
          throw new Error(
            `No se pudo validar la sesión: ${getErrorMessage(
              sessionError,
            )}`,
          );
        }

        const session =
          sessionData.session;

        if (!session?.user) {
          throw new Error(
            'Tu sesión terminó. Inicia sesión nuevamente.',
          );
        }

        if (
          session.user.id !== technicianId
        ) {
          throw new Error(
            'La sesión no corresponde al técnico actual.',
          );
        }

        /* ======================================================
         * 2. PREPARAR IMAGEN
         * ====================================================== */

        setProgress({
          current: 2,
          total: 5,
          label: 'Procesando fotografía…',
        });

        const localPhoto: LocalSelectedPhoto = {
          id: photoId,

          uri: photo.uri,

          source,

          /*
           * Compatibilidad interna con optimizeSelectedPhoto.
           *
           * Esto NO determina el category que se almacena.
           */
          category: 'before',

          width: photo.width,
          height: photo.height,

          mimeType:
            getAssetMimeType(photo),

          fileName:
            photo.fileName ?? null,

          createdAt:
            location?.capturedAt ??
            new Date().toISOString(),

          uploadStatus: 'pending',

          error: null,
        };

        const processed =
          await optimizeSelectedPhoto(
            localPhoto,
          );

        /* ======================================================
         * 3. CONSTRUIR RUTA
         * ====================================================== */

        const storagePath =
          buildPhotoCollectionStoragePath(
            organizationId,
            installationId,
            installationItemId,
            technicianMembershipId,
            photoId,
          );

        logPhotoDiagnostic(
          'UPLOAD_STORAGE',
          {
            bucket:
              INSTALLATION_PHOTOS_BUCKET,

            storagePath,

            organizationId,

            installationId,

            installationItemId,

            technicianId,

            category: 'recabacion',

            operation:
              'BUILD_COLLECTION_STORAGE_PATH',
          },
        );

        /* ======================================================
         * 4. VALIDAR PMI
         * ====================================================== */

        setProgress({
          current: 3,
          total: 5,
          label:
            'Validando instalación y PMI…',
        });

        const {
          data:
            installationAllowsPhotos,
          error: installationError,
        } = await client.rpc(
          'installation_item_allows_photo_insert',
          {
            target_installation_id:
              installationId,

            target_installation_item_id:
              installationItemId,

            target_technician_membership_id:
              technicianMembershipId,
          },
        );

        if (installationError) {
          throw new Error(
            `No se pudo validar la instalación: ${getErrorMessage(
              installationError,
            )}`,
          );
        }

        if (!installationAllowsPhotos) {
          throw new Error(
            'La instalación o el PMI no permiten subir fotografías.',
          );
        }

        /* ======================================================
         * 5. VALIDAR STORAGE
         * ====================================================== */

        const {
          data: pathAllowed,
          error: pathError,
        } = await client.rpc(
          'can_insert_installation_photo_storage',
          {
            target_path:
              storagePath,
          },
        );

        if (pathError) {
          throw new Error(
            `No se pudo validar la ruta de Storage: ${getErrorMessage(
              pathError,
            )}`,
          );
        }

        if (!pathAllowed) {
          throw new Error(
            'La ruta de Storage no está autorizada para esta instalación.',
          );
        }

        /* ======================================================
         * 6. CONVERTIR A BINARIO
         * ====================================================== */

        const arrayBuffer =
          decode(processed.base64);

        /* ======================================================
         * 7. SUBIR STORAGE
         * ====================================================== */

        setProgress({
          current: 4,
          total: 5,
          label:
            'Subiendo fotografía…',
        });

        const {
          error: storageError,
        } = await client.storage
          .from(
            INSTALLATION_PHOTOS_BUCKET,
          )
          .upload(
            storagePath,
            arrayBuffer,
            {
              contentType:
                processed.mimeType,

              cacheControl:
                '3600',

              upsert: false,
            },
          );

        if (storageError) {
          throw new Error(
            `No se pudo subir la fotografía: ${getErrorMessage(
              storageError,
            )}`,
          );
        }

        /* ======================================================
         * 8. INSERTAR POSTGRESQL
         * ====================================================== */

        setProgress({
          current: 5,
          total: 5,
          label:
            'Guardando información…',
        });

        const {
          error: insertError,
        } = await client
          .from('installation_photos')
          .insert({
            id: photoId,

            organization_id:
              organizationId,

            installation_id:
              installationId,

            installation_item_id:
              installationItemId,

            technician_id:
              technicianId,

            uploader_membership_id:
              technicianMembershipId,

            category:
              'recabacion',

            storage_path:
              storagePath,

            file_name:
              processed.fileName,

            mime_type:
              processed.mimeType,

            file_size_bytes:
              processed.fileSizeBytes,

            width:
              processed.width,

            height:
              processed.height,

            source,

            comment: null,

            captured_at:
              location?.capturedAt ??
              new Date().toISOString(),

            latitud:
              location?.latitude ?? null,

            longitud:
              location?.longitude ?? null,

            tiene_ubicacion:
              location?.latitude !== null &&
              location?.latitude !== undefined &&
              location?.longitude !== null &&
              location?.longitude !== undefined,

            collection_service_code:
              metadata.serviceCode,

            collection_service_name:
              metadata.serviceName,

            collection_group_id:
              metadata.photoGroupId,

            collection_group_label:
              metadata.photoGroupLabel,

            collection_photo_type_id:
              metadata.photoTypeId,

            collection_photo_type_label:
              metadata.photoTypeLabel,
          });

        if (insertError) {
          await cleanupStorageObject(
            client,
            storagePath,
          );

          throw new Error(
            `No se pudo guardar la información de la fotografía: ${getErrorMessage(
              insertError,
            )}`,
          );
        }

        /* ======================================================
         * 9. VERIFICAR POSTGRESQL
         * ====================================================== */

        const {
          data: insertedPhoto,
          error: verificationError,
        } = await client
          .from('installation_photos')
          .select('id')
          .eq(
            'organization_id',
            organizationId,
          )
          .eq('id', photoId)
          .maybeSingle<{
            id: string;
          }>();

        if (
          verificationError ||
          !insertedPhoto
        ) {
          await cleanupStorageObject(
            client,
            storagePath,
          );

          throw new Error(
            'La fotografía se subió, pero PostgreSQL no confirmó su registro.',
          );
        }

        /* ======================================================
         * 10. URL FIRMADA
         * ====================================================== */

        const {
          data: signedData,
          error: signedError,
        } = await client.storage
          .from(
            INSTALLATION_PHOTOS_BUCKET,
          )
          .createSignedUrl(
            storagePath,
            SIGNED_URL_EXPIRES_IN_SECONDS,
          );

        /*
         * La fotografía ya está correctamente
         * almacenada si falla la URL firmada.
         *
         * No eliminamos el registro.
         */
        if (
          signedError ||
          !signedData?.signedUrl
        ) {
          console.warn(
            '[photo-collection] No se pudo generar URL firmada:',
            signedError,
          );
        }

        logPhotoDiagnostic(
          'CREATE_SIGNED_URL',
          {
            bucket:
              INSTALLATION_PHOTOS_BUCKET,

            photoId,

            storagePath,

            mimeType:
              processed.mimeType,

            byteLength:
              arrayBuffer.byteLength,

            installationId,

            technicianId,

            category:
              'recabacion',

            storageCompleted:
              true,

            postgresCompleted:
              true,

            signedUrlCreated:
              Boolean(
                signedData?.signedUrl,
              ),
          },
        );

        /* ======================================================
         * 11. ÉXITO
         * ====================================================== */

        const result: PhotoCollectionUploadResult =
          {
            photoId,

            ok: true,

            error: null,
          };

        setProgress(null);

        setMessage(
          location
            ? 'Fotografía guardada correctamente con ubicación.'
            : 'Fotografía guardada correctamente.',
        );

        await onUploaded?.(
          photoId,
        );

        return result;
      } catch (error) {
        console.error(
          '[photo-collection] Error subiendo fotografía:',
          error,
        );

        const message =
          getErrorMessage(error);

        setProgress(null);
        setMessage(message);

        return {
          photoId,

          ok: false,

          error: message,
        };
      } finally {
        setIsUploading(false);
      }
    },
    [
      installationId,
      installationItemId,
      isUploading,
      location,
      metadata,
      onUploaded,
      organizationId,
      photo,
      source,
      technicianId,
      technicianMembershipId,
    ],
  );

  return {
    uploadPhoto,

    isUploading,

    progress,

    message,
  };
}