import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { logPhotoDiagnostic } from './photoDiagnostics';
import type { LocalSelectedPhoto } from '../types/photos';

const MAX_IMAGE_SIDE = 1920;
const JPEG_QUALITY = 0.82;

export type ProcessedImage = {
  uri: string;
  base64: string;
  width: number;
  height: number;
  mimeType: 'image/jpeg';
  fileName: string;
  fileSizeBytes: number | null;
};

function getResizeAction(width: number, height: number) {
  const longestSide = Math.max(width, height);

  if (longestSide <= MAX_IMAGE_SIDE) {
    return null;
  }

  if (width >= height) {
    return { resize: { width: MAX_IMAGE_SIDE } };
  }

  return { resize: { height: MAX_IMAGE_SIDE } };
}

export async function optimizeSelectedPhoto(
  photo: LocalSelectedPhoto,
): Promise<ProcessedImage> {
  try {
    logPhotoDiagnostic('PREPARE_IMAGE', {
      category: photo.category,
      mimeType: photo.mimeType,
      source: photo.source,
      width: photo.width,
      height: photo.height,
      storageCompleted: false,
      postgresCompleted: false,
    });

    const resizeAction = getResizeAction(photo.width, photo.height);
    const result = await manipulateAsync(
      photo.uri,
      resizeAction ? [resizeAction] : [],
      {
        compress: JPEG_QUALITY,
        format: SaveFormat.JPEG,
        base64: true,
      },
    );

    if (!result.base64) {
      throw new Error('No se pudo preparar la imagen para subirla');
    }

    const info = await FileSystem.getInfoAsync(result.uri);
    const fileSizeBytes = info.exists && 'size' in info ? info.size ?? null : null;

    logPhotoDiagnostic('PREPARE_IMAGE', {
      category: photo.category,
      mimeType: 'image/jpeg',
      base64Length: result.base64.length,
      fileSizeBytes,
      width: result.width,
      height: result.height,
      storageCompleted: false,
      postgresCompleted: false,
    });

    return {
      uri: result.uri,
      base64: result.base64,
      width: result.width,
      height: result.height,
      mimeType: 'image/jpeg',
      fileName: `${photo.id}.jpg`,
      fileSizeBytes,
    };
  } catch (error) {
    logPhotoDiagnostic('PREPARE_IMAGE', {
      category: photo.category,
      mimeType: photo.mimeType,
      width: photo.width,
      height: photo.height,
      storageCompleted: false,
      postgresCompleted: false,
    }, error);

    throw error;
  }
}
