export const TECHNICAL_LABELS_BUCKET = 'installation-technical-labels';

export function getTechnicalLabelExtension(mimeType?: string | null) {
  if (mimeType === 'image/png') {
    return 'png';
  }

  if (mimeType === 'image/webp') {
    return 'webp';
  }

  return 'jpg';
}

export function buildTechnicalLabelStoragePath({
  organizationId,
  installationId,
  installationItemId,
  equipmentId,
  photoId,
  extension,
}: {
  organizationId: string;
  installationId: string;
  installationItemId: string;
  equipmentId: string;
  photoId: string;
  extension: string;
}) {
  return `${organizationId}/${installationId}/${installationItemId}/${equipmentId}/${photoId}.${extension}`;
}
