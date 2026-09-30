// mobile-app/types/installation.ts

export interface PhotoWithLocation {
  id: string;
  installation_id: string;
  equipment_id?: string | null;
  image_url: string;
  description?: string;
  latitude?: number | null;      // ← CAMPO EXISTENTE
  longitude?: number | null;     // ← CAMPO EXISTENTE
  has_location: boolean;         // ← CAMPO EXISTENTE
  uploaded_by: string;
  created_at: string;
  updated_at?: string;
}


export interface InstallationWithClient {
  id: string;
  organizationId: string;
  projectName: string;
  clientId: string;
  address: string;
  installationType: string;
  technicianId: string;
  technicianMembershipId: string;
  assignedDate: string;
  startDate: string | null;
  startedAt: string | null;
  estimatedCompletionDate: string | null;
  completedAt: string | null;
  status: string;
  observations: string | null;
  items: InstallationItem[];
  client: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
  };
}

export interface InstallationItem {
  // ... tus campos existentes ...
  activeLocation: InstallationItemLocationPin | null;
  latestLocation: InstallationItemLocationPin | null;
}

export interface InstallationItemLocationPin {
  id: string;
  organizationId: string;
  installationId: string;
  installationItemId: string;
  technicianUserId: string;
  technicianMembershipId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  recordedAt: string;
  createdAt: string;
  reviewStatus: string;
  approvedAt: string | null;
  approvedByUserId: string | null;
  approvedByMembershipId: string | null;
  invalidatedAt: string | null;
  invalidationReason: string | null;
}