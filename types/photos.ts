export type PhotoCategory =
  | 'before'
  | 'during'
  | 'after';

export type PhotoSource =
  | 'camera'
  | 'gallery';

export type PhotoUploadStatus =
  | 'pending'
  | 'uploading'
  | 'uploaded'
  | 'failed';

/**
 * Fotografía normal del sistema de evidencia.
 *
 * before / during / after
 */
export type InstallationPhoto = {
  id: string;

  organizationId: string;
  installationId: string;
  installationItemId: string | null;

  technicianId: string | null;
  uploaderMembershipId: string | null;

  category: PhotoCategory;

  storagePath: string;

  fileName: string;
  mimeType: string;

  fileSizeBytes: number | null;

  width: number | null;
  height: number | null;

  source: PhotoSource;

  comment: string | null;

  capturedAt: string | null;

  uploadedAt: string;
  createdAt: string;
};

export type InstallationPhotoWithProfile =
  InstallationPhoto & {
    technicianName: string | null;
    signedUrl: string | null;
  };

export type LocalSelectedPhoto = {
  id: string;

  uri: string;

  source: PhotoSource;

  category: PhotoCategory;

  width: number;
  height: number;

  mimeType: string | null;
  fileName: string | null;

  createdAt: string;

  uploadStatus: PhotoUploadStatus;

  error: string | null;
};

export type PhotoUploadResult = {
  photoId: string;
  ok: boolean;
  error: string | null;
};

export type InstallationPhotoRow = {
  id: string;

  organization_id: string;
  installation_id: string;
  installation_item_id: string | null;

  technician_id: string | null;
  uploader_membership_id: string | null;

  category: PhotoCategory;

  storage_path: string;

  file_name: string;
  mime_type: string;

  file_size_bytes: number | null;

  width: number | null;
  height: number | null;

  source: PhotoSource;

  comment: string | null;

  captured_at: string | null;

  uploaded_at: string;
  created_at: string;

  organization_memberships:
    | { full_name: string }
    | { full_name: string }[]
    | null;
};

/* ============================================================
 * RECABAR FOTOGRAFÍAS
 * ============================================================
 *
 * Estos tipos son independientes del sistema before/during/after.
 */

export type PhotoCollectionSource =
  | 'camera'
  | 'gallery';

export type PhotoCollectionLocation = {
  latitude: number | null;
  longitude: number | null;
  capturedAt: string;
};

export type PhotoCollectionMetadata = {
  serviceCode: string;
  serviceName: string;

  photoGroupId: string;
  photoGroupLabel: string;

  photoTypeId: string;
  photoTypeLabel: string;
};

export type LocalPhotoCollection = {
  id: string;

  uri: string;

  source: PhotoCollectionSource;

  organizationId: string;
  installationId: string;
  installationItemId: string;

  technicianId: string;
  technicianMembershipId: string;

  metadata: PhotoCollectionMetadata;

  width: number;
  height: number;

  mimeType: string | null;
  fileName: string | null;

  createdAt: string;

  location: PhotoCollectionLocation | null;

  uploadStatus: PhotoUploadStatus;

  error: string | null;
};

export type PhotoCollectionUploadResult = {
  photoId: string;
  ok: boolean;
  error: string | null;
};