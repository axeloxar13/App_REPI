import type { PhotoCategory } from '../types/photos';
import {
  getPathDiagnosticDetails,
  logPhotoDiagnostic,
} from './photoDiagnostics';

export const INSTALLATION_PHOTOS_BUCKET = 'installation-photos';

export const SIGNED_URL_EXPIRES_IN_SECONDS = 30 * 60;

export type PhotoStoragePathDetails = {
  storagePath: string;
  organizationId: string;
  installationId: string;
  installationItemId: string | null;
  technicianMembershipId: string;
  category: PhotoCategory;
  startsWithSlash: boolean;
  bucketIncluded: boolean;
  segmentCount: number;
  extension: string;
};

/**
 * Ruta utilizada por el sistema EXISTENTE de evidencia fotográfica.
 *
 * NO MODIFICAR.
 *
 * before / during / after
 */
export function buildPhotoStoragePath(
  organizationId: string,
  installationId: string,
  installationItemId: string | null,
  technicianMembershipId: string,
  category: PhotoCategory,
  photoId: string,
) {
  const storagePath = installationItemId
    ? `${organizationId}/${installationId}/${installationItemId}/${technicianMembershipId}/${category}/${photoId}.jpg`
    : `${organizationId}/${installationId}/${technicianMembershipId}/${category}/${photoId}.jpg`;

  const details = getPhotoStoragePathDetails(
    storagePath,
    organizationId,
    installationId,
    installationItemId,
    technicianMembershipId,
    category,
  );

  logPhotoDiagnostic('UPLOAD_STORAGE', {
    ...getPathDiagnosticDetails(details),
    operation: 'BUILD_STORAGE_PATH',
  });

  return storagePath;
}

/**
 * Ruta utilizada EXCLUSIVAMENTE por Recabar fotografías.
 *
 * Estructura:
 *
 * organization/
 * installation/
 * PMI/
 * technicianMembership/
 * recabacion/
 * photoId.jpg
 */
export function buildPhotoCollectionStoragePath(
  organizationId: string,
  installationId: string,
  installationItemId: string,
  technicianMembershipId: string,
  photoId: string,
) {
  const storagePath =
    `${organizationId}/` +
    `${installationId}/` +
    `${installationItemId}/` +
    `${technicianMembershipId}/` +
    `recabacion/` +
    `${photoId}.jpg`;

  return storagePath;
}

export function getPhotoStoragePathDetails(
  storagePath: string,
  organizationId: string,
  installationId: string,
  installationItemId: string | null,
  technicianMembershipId: string,
  category: PhotoCategory,
): PhotoStoragePathDetails {
  const parts = storagePath.split('/');

  return {
    storagePath,
    organizationId,
    installationId,
    installationItemId,
    technicianMembershipId,
    category,
    startsWithSlash: storagePath.startsWith('/'),
    segmentCount: parts.length,
    bucketIncluded:
      parts[0] === INSTALLATION_PHOTOS_BUCKET,
    extension:
      parts[parts.length - 1]?.split('.').pop() ??
      'missing',
  };
}