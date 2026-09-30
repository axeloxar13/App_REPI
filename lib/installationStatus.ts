import { colors } from '../constants/theme';
import type { InstallationStatus } from '../types/database';

type StatusConfig = {
  label: string;
  backgroundColor: string;
  color: string;
};

export const installationStatusConfig: Record<InstallationStatus, StatusConfig> = {
  pending: {
    label: 'Pendiente',
    backgroundColor: '#fff7df',
    color: '#8a5a00',
  },
  in_progress: {
    label: 'En proceso',
    backgroundColor: colors.primarySoft,
    color: colors.primary,
  },
  in_review: {
    label: 'En revisión',
    backgroundColor: '#eef2ff',
    color: '#3730a3',
  },
  completed: {
    label: 'Terminada',
    backgroundColor: '#e9f8ef',
    color: '#17663a',
  },
  cancelled: {
    label: 'Cancelada',
    backgroundColor: '#f2f4f7',
    color: '#667085',
  },
};

export function getInstallationStatusLabel(status: InstallationStatus) {
  return installationStatusConfig[status].label;
}
