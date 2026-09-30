import type { SupabaseClient } from '@supabase/supabase-js';

type CachedSignedUrl = {
  signedUrl: string;
  expiresAt: number;
};

const EXPIRATION_SAFETY_WINDOW_MS = 60 * 1000;
const signedUrlCache = new Map<string, CachedSignedUrl>();

function cacheKey(bucket: string, organizationId: string, storagePath: string) {
  return `${bucket}:${organizationId}:${storagePath}`;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function clearPrivateStorageUrlCache(organizationId?: string) {
  if (!organizationId) {
    signedUrlCache.clear();
    return;
  }

  const marker = `:${organizationId}:`;
  Array.from(signedUrlCache.keys()).forEach((key) => {
    if (key.includes(marker)) {
      signedUrlCache.delete(key);
    }
  });
}

export async function getCachedSignedStorageUrls({
  client,
  bucket,
  organizationId,
  storagePaths,
  expiresInSeconds,
}: {
  client: SupabaseClient;
  bucket: string;
  organizationId: string;
  storagePaths: string[];
  expiresInSeconds: number;
}) {
  const now = Date.now();
  const paths = uniqueValues(storagePaths);
  const signedUrls = new Map<string, string>();
  const missingPaths: string[] = [];

  paths.forEach((storagePath) => {
    const cached = signedUrlCache.get(cacheKey(bucket, organizationId, storagePath));

    if (cached && cached.expiresAt > now) {
      signedUrls.set(storagePath, cached.signedUrl);
    } else {
      missingPaths.push(storagePath);
    }
  });

  if (missingPaths.length === 0) {
    return signedUrls;
  }

  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrls(missingPaths, expiresInSeconds);
  if (error) {
    return signedUrls;
  }

  const expiresAt =
    now + Math.max(0, expiresInSeconds * 1000 - EXPIRATION_SAFETY_WINDOW_MS);

  (data ?? []).forEach((item) => {
    if (!item.path || !item.signedUrl) {
      return;
    }

    signedUrlCache.set(cacheKey(bucket, organizationId, item.path), {
      signedUrl: item.signedUrl,
      expiresAt,
    });
    signedUrls.set(item.path, item.signedUrl);
  });

  return signedUrls;
}
