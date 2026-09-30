import type { PhotoCategory } from '../types/photos';

type PhotoCategoryConfig = {
  label: string;
  description: string;
};

export const PHOTO_LIMIT_PER_CATEGORY = 10;

export const photoCategoryConfig: Record<
  PhotoCategory,
  PhotoCategoryConfig
> = {
  before: {
    label: 'Antes',
    description: 'Evidencia inicial de la instalación.',
  },

  during: {
    label: 'Durante',
    description: 'Avance, cableado y configuración.',
  },

  after: {
    label: 'Después',
    description: 'Resultado final y equipos funcionando.',
  },
};

export const photoCategories: PhotoCategory[] = [
  'before',
  'during',
  'after',
];

/**
 * Obtiene la etiqueta de una categoría de fotografía.
 *
 * before / during / after pertenecen al sistema tradicional
 * de evidencia fotográfica.
 *
 * Recabar fotografías utiliza "recabacion" como una categoría
 * adicional almacenada en installation_photos, pero no forma
 * parte del tipo PhotoCategory tradicional.
 *
 * Por eso esta función acepta string y maneja categorías
 * adicionales de forma segura.
 */
export function getPhotoCategoryLabel(
  category: PhotoCategory | string,
): string {
  const config =
    photoCategoryConfig[
      category as PhotoCategory
    ];

  if (config) {
    return config.label;
  }

  if (category === 'recabacion') {
    return 'Fotografía recabada';
  }

  return 'Fotografía';
}