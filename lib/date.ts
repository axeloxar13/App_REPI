export function formatDate(value: string | null) {
  if (!value) {
    return 'Sin definir';
  }

  const [year, month, day] = value.split('-').map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return 'Sin definir';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Sin definir';
  }

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
