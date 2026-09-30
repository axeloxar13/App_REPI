export const INSTALLATION_SIGNATURES_BUCKET = 'installation-signatures';
export const HANDOFF_SIGNED_URL_EXPIRES_IN_SECONDS = 30 * 60;

export function buildHandoffSignatureStoragePath(
  organizationId: string,
  installationId: string,
  installationItemId: string | null,
  handoffId: string,
) {
  return installationItemId
    ? `${organizationId}/${installationId}/${installationItemId}/${handoffId}/signature.png`
    : `${organizationId}/${installationId}/${handoffId}/signature.png`;
}
