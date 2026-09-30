export type Range = [number, number];

const normalizeChar = (ch: string) =>
  ch
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX');

// Normaliza (sin acentos, minúsculas) y guarda a qué índice del texto
// original corresponde cada carácter, para poder resaltar el texto real.
function normalizeWithMap(value: unknown) {
  const text = String(value ?? '');
  let normalized = '';
  const map: number[] = [];

  for (let i = 0; i < text.length; i++) {
    const n = normalizeChar(text[i]);
    for (let j = 0; j < n.length; j++) {
      normalized += n[j];
      map.push(i);
    }
  }
  return { normalized, map };
}

export const normalizeSearchText = (value: unknown) =>
  normalizeWithMap(value).normalized.trim();

export function getSearchTerms(query: string): string[] {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  return Array.from(new Set(terms));
}

/** Rangos (en el texto ORIGINAL) que coinciden con cualquiera de los términos. */
export function findRanges(text: unknown, terms: string[]): Range[] {
  if (!terms.length) return [];
  const { normalized, map } = normalizeWithMap(text);
  const ranges: Range[] = [];

  for (const term of terms) {
    let from = 0;
    while (true) {
      const idx = normalized.indexOf(term, from);
      if (idx === -1) break;
      ranges.push([map[idx], map[idx + term.length - 1] + 1]);
      from = idx + term.length;
    }
  }

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Range[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

export type SearchField = { value: unknown; weight: number };

/**
 * Devuelve un puntaje, o null si alguna palabra no aparece en ningún campo
 * (AND entre palabras, OR entre campos).
 */
export function scoreFields(fields: SearchField[], terms: string[]): number | null {
  const prepared = fields
    .filter((f) => f.value !== null && f.value !== undefined && f.value !== '')
    .map((f) => ({ text: normalizeSearchText(f.value), weight: f.weight }));

  let total = 0;

  for (const term of terms) {
    let best = 0;
    for (const { text, weight } of prepared) {
      if (!text.includes(term)) continue;
      let factor = 1;
      if (text === term) factor = 2;
      else if (` ${text}`.includes(` ${term}`)) factor = 1.5; // inicio de palabra
      best = Math.max(best, weight * factor);
    }
    if (best === 0) return null;
    total += best;
  }
  return total;
}