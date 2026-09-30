import type { PhotoCategory } from '../types/photos';

const DEFAULT_PHOTO_BUCKET = 'installation-photos';

export type PhotoDiagnosticStage =
  | 'PREPARE_IMAGE'
  | 'READ_SESSION'
  | 'RESOLVE_MEMBERSHIP'
  | 'VALIDATE_INSTALLATION'
  | 'UPLOAD_STORAGE'
  | 'INSERT_DATABASE'
  | 'CREATE_SIGNED_URL'
  | 'REFRESH_GALLERY';

export type PhotoDiagnosticCode =
  | 'PHOTO_PREPARE_FAILED'
  | 'PHOTO_SESSION_MISSING'
  | 'PHOTO_MEMBERSHIP_INVALID'
  | 'PHOTO_INSTALLATION_INVALID'
  | 'PHOTO_PATH_POLICY_REJECTED'
  | 'PHOTO_STORAGE_RLS'
  | 'PHOTO_STORAGE_UPLOAD'
  | 'PHOTO_DATABASE_INSERT'
  | 'PHOTO_SIGNED_URL'
  | 'PHOTO_UNKNOWN';

type DiagnosticValue = string | number | boolean | null | undefined;

type PhotoDiagnosticDetails = {
  bucket?: string;
  storagePath?: string | null;
  mimeType?: string | null;
  byteLength?: number | null;
  organizationId?: string | null;
  installationId?: string | null;
  technicianId?: string | null;
  technicianMembershipId?: string | null;
  category?: PhotoCategory | string | null;
  storageCompleted?: boolean | null;
  postgresCompleted?: boolean | null;
  [key: string]: DiagnosticValue;
};

type PhotoStoragePathDetails = {
  storagePath: string;
  organizationId?: string;
  installationId: string;
  technicianId?: string;
  technicianMembershipId?: string;
  category: PhotoCategory;
  startsWithSlash: boolean;
  bucketIncluded: boolean;
  segmentCount: number;
  extension: string;
};

function getErrorValue(error: unknown, key: 'name' | 'message' | 'code' | 'status' | 'statusCode') {
  if (error instanceof Error && key in error) {
    return String(error[key as keyof Error]);
  }

  if (typeof error === 'object' && error && key in error) {
    return String(error[key as keyof typeof error]);
  }

  return null;
}

function sanitizeErrorMessage(message: string | null) {
  if (!message) {
    return null;
  }

  return message
    .replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]')
    .replace(/refresh_token=[^&\s]+/gi, 'refresh_token=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9._-]+/g, '[redacted-jwt]');
}

function maskIdentifier(value: DiagnosticValue) {
  if (typeof value !== 'string') {
    return value;
  }

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return `${value.slice(0, 8)}...`;
  }

  return value;
}

export function maskStoragePath(storagePath: string | null | undefined) {
  if (!storagePath) {
    return null;
  }

  const parts = storagePath.split('/');

  if (parts.length === 6) {
    const [organizationId, installationId, itemId, membershipId, category, fileName] = parts;
    const maskedOrganizationId = organizationId ? `${organizationId.slice(0, 8)}...` : 'missing';
    const maskedInstallationId = installationId ? `${installationId.slice(0, 8)}...` : 'missing';
    const maskedItemId = itemId ? `${itemId.slice(0, 8)}...` : 'missing';
    const maskedMembershipId = membershipId ? `${membershipId.slice(0, 8)}...` : 'missing';
    const maskedFileName = fileName ? `${fileName.slice(0, 8)}...${fileName.slice(-4)}` : 'missing';

    return `${maskedOrganizationId}/${maskedInstallationId}/${maskedItemId}/${maskedMembershipId}/${category ?? 'missing'}/${maskedFileName}`;
  }

  if (parts.length === 5) {
    const [organizationId, installationId, membershipId, category, fileName] = parts;
    const maskedOrganizationId = organizationId ? `${organizationId.slice(0, 8)}...` : 'missing';
    const maskedInstallationId = installationId ? `${installationId.slice(0, 8)}...` : 'missing';
    const maskedMembershipId = membershipId ? `${membershipId.slice(0, 8)}...` : 'missing';
    const maskedFileName = fileName ? `${fileName.slice(0, 8)}...${fileName.slice(-4)}` : 'missing';

    return `${maskedOrganizationId}/${maskedInstallationId}/${maskedMembershipId}/${category ?? 'missing'}/${maskedFileName}`;
  }

  const [installationId, technicianId, category, fileName] = parts;
  const maskedInstallationId = installationId ? `${installationId.slice(0, 8)}...` : 'missing';
  const maskedTechnicianId = technicianId ? `${technicianId.slice(0, 8)}...` : 'missing';
  const maskedFileName = fileName ? `${fileName.slice(0, 8)}...${fileName.slice(-4)}` : 'missing';

  return `${maskedInstallationId}/${maskedTechnicianId}/${category ?? 'missing'}/${maskedFileName}`;
}

export function getPhotoDiagnosticError(error: unknown) {
  return {
    errorName: getErrorValue(error, 'name'),
    errorMessage: sanitizeErrorMessage(getErrorValue(error, 'message')),
    errorCode: getErrorValue(error, 'code'),
    status: getErrorValue(error, 'status'),
    statusCode: getErrorValue(error, 'statusCode'),
  };
}

export function getPhotoDiagnosticCode(
  stage: PhotoDiagnosticStage,
  error: unknown,
): PhotoDiagnosticCode {
  const errorDetails = getPhotoDiagnosticError(error);
  const message = (errorDetails.errorMessage ?? '').toLowerCase();
  const code = (errorDetails.errorCode ?? '').toLowerCase();
  const status = errorDetails.status ?? errorDetails.statusCode;

  if (stage === 'PREPARE_IMAGE') {
    return 'PHOTO_PREPARE_FAILED';
  }

  if (stage === 'READ_SESSION') {
    return 'PHOTO_SESSION_MISSING';
  }

  if (stage === 'RESOLVE_MEMBERSHIP') {
    return 'PHOTO_MEMBERSHIP_INVALID';
  }

  if (stage === 'VALIDATE_INSTALLATION') {
    return 'PHOTO_INSTALLATION_INVALID';
  }

  if (stage === 'UPLOAD_STORAGE') {
    if (
      status === '403' ||
      message.includes('row-level security') ||
      message.includes('violates row-level security') ||
      code.includes('rls')
    ) {
      return 'PHOTO_STORAGE_RLS';
    }

    if (
      status === '400' ||
      status === '403' ||
      message.includes('path') ||
      message.includes('policy')
    ) {
      return 'PHOTO_PATH_POLICY_REJECTED';
    }

    return 'PHOTO_STORAGE_UPLOAD';
  }

  if (stage === 'INSERT_DATABASE') {
    return 'PHOTO_DATABASE_INSERT';
  }

  if (stage === 'CREATE_SIGNED_URL') {
    return 'PHOTO_SIGNED_URL';
  }

  return 'PHOTO_UNKNOWN';
}

export function getPathDiagnosticDetails(
  details: PhotoStoragePathDetails,
) {
  return {
    bucket: DEFAULT_PHOTO_BUCKET,
    storagePath: details.storagePath,
    organizationId: details.organizationId ?? null,
    installationId: details.installationId,
    technicianId: details.technicianId ?? null,
    technicianMembershipId: details.technicianMembershipId ?? null,
    category: details.category,
    startsWithSlash: details.startsWithSlash,
    bucketIncluded: details.bucketIncluded,
    segmentCount: details.segmentCount,
    extension: details.extension,
  };
}

export function logPhotoDiagnostic(
  stage: PhotoDiagnosticStage,
  details: PhotoDiagnosticDetails = {},
  error?: unknown,
) {
  if (!__DEV__) {
    return;
  }

  const safeDetails = {
    ...details,
    bucket: details.bucket ?? DEFAULT_PHOTO_BUCKET,
    storagePath: maskStoragePath(details.storagePath),
    organizationId: maskIdentifier(details.organizationId),
    installationId: maskIdentifier(details.installationId),
    technicianId: maskIdentifier(details.technicianId),
    technicianMembershipId: maskIdentifier(details.technicianMembershipId),
  };

  console.info('[photo-upload]', {
    stage,
    ...safeDetails,
    ...(error ? getPhotoDiagnosticError(error) : {
      errorName: null,
      errorMessage: null,
      errorCode: null,
      status: null,
      statusCode: null,
    }),
  });
}
