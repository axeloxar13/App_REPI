export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProfileRole = 'technician' | 'admin' | 'supervisor';
export type MembershipStatus = 'invited' | 'active' | 'archived';

export type InstallationStatus =
  | 'pending'
  | 'in_progress'
  | 'in_review'
  | 'completed'
  | 'cancelled';
export type InstallationItemRole = 'primary' | 'partition';
export type WorkType = 'installation' | 'maintenance';
export type TechnicalRecordStatus = 'draft' | 'submitted' | 'verified' | 'correction_required';

export type PhotoCategory = 'before' | 'during' | 'after';
export type PhotoSource = 'camera' | 'gallery';
export type OrganizationDeletionStatus = 'active' | 'deleting' | 'deletion_failed';
export type InstallationHandoffStatus = 'submitted' | 'approved' | 'rejected';
export type DeliverableFormatType = 'full_handover' | 'photo_report';
export type DeliverableStatus = 'generating' | 'ready' | 'failed';
export type LocationReviewStatus = 'pending_review' | 'approved' | 'rejected';

export type ActivityType =
  | 'installation_started'
  | 'installation_completed'
  | 'status_changed'
  | 'handoff_submitted'
  | 'handoff_approved'
  | 'handoff_rejected'
  | 'deliverable_generated'
  | 'location_registered'
  | 'location_reregistered'
  | 'location_approved'
  | 'location_invalidated';

export type Profile = {
  id: string;
  full_name: string;
  role: ProfileRole;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Organization = {
  id: string;
  name: string;
  normalized_name: string;
  slug: string;
  active: boolean;
  deletion_status: OrganizationDeletionStatus;
  deletion_started_at: string | null;
  deletion_started_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type OrganizationMembership = {
  id: string;
  organization_id: string;
  user_id: string;
  role: ProfileRole;
  status: MembershipStatus;
  active: boolean;
  full_name: string;
  email_snapshot: string;
  invited_at: string | null;
  joined_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminOrganization = {
  membershipId: string;
  organizationId: string;
  name: string;
  slug: string;
};

export type Client = {
  id: string;
  organization_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
};

export type Installation = {
  id: string;
  organization_id: string;
  project_name: string;
  client_id: string;
  address: string;
  installation_type: string;
  service_category_id: string | null;
  work_type: WorkType | null;
  work_description: string | null;
  legacy_installation_type: string | null;
  technician_id: string | null;
  technician_membership_id: string | null;
  technician_name_snapshot: string | null;
  technician_email_snapshot: string | null;
  assigned_date: string;
  start_date: string | null;
  estimated_completion_date: string | null;
  status: InstallationStatus;
  observations: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type InstallationItem = {
  id: string;
  organization_id: string;
  installation_id: string;
  position: number;
  item_role: InstallationItemRole;
  name: string;
  service_type: string;
  service_category_id: string | null;
  work_type: WorkType | null;
  work_description: string | null;
  legacy_service_type: string | null;
  specific_location: string;
  status: InstallationStatus;
  observations: string | null;
  assigned_date: string | null;
  start_date: string | null;
  estimated_completion_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ServiceCategory = {
  id: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
  sort_order: number;
  capture_rules: Json;
  created_at: string;
  updated_at: string;
};

export type ServiceFieldDefinition = {
  id: string;
  service_category_id: string;
  code: string;
  label: string;
  field_type: 'text' | 'textarea' | 'email' | 'select';
  is_required: boolean;
  options: Json;
  sort_order: number;
  capture_methods: string[];
  visible_work_types: WorkType[];
  conditional_rule: Json;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type InstallationTechnicalRecord = {
  id: string;
  organization_id: string;
  installation_id: string;
  installation_item_id: string;
  service_category_id: string;
  work_type: WorkType;
  status: TechnicalRecordStatus;
  observations: string | null;
  submitted_at: string | null;
  submitted_by_user_id: string | null;
  submitted_by_membership_id: string | null;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  reviewed_by_membership_id: string | null;
  review_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type InstallationTechnicalFieldValue = {
  id: string;
  organization_id: string;
  installation_id: string;
  installation_item_id: string;
  technical_record_id: string;
  service_category_id: string;
  field_definition_id: string;
  value_text: string | null;
  value_json: Json;
  technician_user_id: string | null;
  technician_membership_id: string | null;
  created_at: string;
  updated_at: string;
};

export type InstallationEquipment = {
  id: string;
  organization_id: string;
  installation_id: string;
  installation_item_id: string;
  technical_record_id: string;
  service_category_id: string;
  equipment_type: string;
  serial_number: string | null;
  brand: string | null;
  model: string | null;
  observations: string | null;
  detected_value: string | null;
  confirmed_value: string | null;
  capture_method: 'manual' | 'qr' | 'barcode' | 'ocr' | 'photo';
  technician_user_id: string | null;
  technician_membership_id: string | null;
  created_at: string;
  updated_at: string;
};

export type InstallationEquipmentLabelPhoto = {
  id: string;
  organization_id: string;
  installation_id: string;
  installation_item_id: string;
  equipment_id: string;
  service_category_id: string;
  technician_user_id: string | null;
  technician_membership_id: string | null;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  detected_value: string | null;
  confirmed_value: string | null;
  captured_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InstallationItemLocationPin = {
  id: string;
  organization_id: string;
  installation_id: string;
  installation_item_id: string;
  technician_user_id: string;
  technician_membership_id: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number;
  recorded_at: string;
  created_at: string;
  review_status: LocationReviewStatus;
  approved_at: string | null;
  approved_by_user_id: string | null;
  approved_by_membership_id: string | null;
  invalidated_at: string | null;
  invalidated_by_user_id: string | null;
  invalidated_by_membership_id: string | null;
  invalidation_reason: string | null;
};

export type InstallationPhoto = {
  id: string;
  organization_id: string;
  installation_id: string;
  installation_item_id: string | null;
  technician_id: string | null;
  uploader_membership_id: string | null;
  uploader_name_snapshot: string | null;
  uploader_email_snapshot: string | null;
  category: PhotoCategory;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number | null;
  width: number | null;
  height: number | null;
  source: PhotoSource;
  comment: string | null;
  captured_at: string | null;
  uploaded_at: string;
  created_at: string;
};

export type InstallationActivity = {
  id: string;
  organization_id: string;
  installation_id: string;
  installation_item_id: string | null;
  actor_id: string | null;
  actor_membership_id: string | null;
  actor_name_snapshot: string | null;
  actor_email_snapshot: string | null;
  activity_type: ActivityType;
  previous_status: InstallationStatus | null;
  new_status: InstallationStatus | null;
  metadata: Json;
  created_at: string;
};

export type InstallationHandoff = {
  id: string;
  organization_id: string;
  installation_id: string;
  installation_item_id: string | null;
  technician_membership_id: string;
  technician_user_id: string;
  recipient_name: string;
  signature_storage_path: string;
  acceptance_confirmed: boolean;
  final_notes: string | null;
  submitted_at: string;
  status: InstallationHandoffStatus;
  reviewed_by_membership_id: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  project_name_snapshot: string;
  client_name_snapshot: string;
  address_snapshot: string;
  technician_name_snapshot: string;
  organization_name_snapshot: string;
  created_at: string;
  updated_at: string;
};

export type InstallationDeliverable = {
  id: string;
  organization_id: string;
  installation_id: string;
  installation_item_id: string | null;
  handoff_id: string;
  format_type: DeliverableFormatType;
  folio: string;
  version: number;
  status: DeliverableStatus;
  storage_path: string | null;
  generated_by_membership_id: string;
  generated_at: string | null;
  snapshot_data: Json;
  file_size_bytes: number | null;
  generation_error_code: string | null;
  created_at: string;
};

export type DashboardMetrics = {
  active_installations: number;
  completed_installations: number;
  pending_installations: number;
  photos_uploaded_today: number;
  active_technicians: number;
};

export type TechnicianListItem = {
  id: string;
  user_id?: string;
  full_name: string;
  email: string;
  active: boolean;
  created_at: string;
  total_installations: number;
  active_installations: number;
  invitation_pending: boolean;
};

export type TechnicianDetail = TechnicianListItem & {
  pending_installations: number;
  in_progress_installations: number;
  in_review_installations: number;
  completed_installations: number;
  cancelled_installations: number;
};

export type TechnicianRecentInstallation = {
  id: string;
  project_name: string;
  status: string;
  client_name: string | null;
  updated_at: string;
};

export type TechnicianArchiveEligibility = {
  id: string;
  full_name: string;
  email: string;
  active: boolean;
  created_at: string;
  active_installations: number;
  historical_installations: number;
  photo_count: number;
  activity_count: number;
  can_archive: boolean;
  blocking_reason: string | null;
};

export type TechnicianArchivePrepared = {
  archive_id: string;
  full_name: string;
  email: string;
  installation_count: number;
  photo_count: number;
  activity_count: number;
};

export type AdministratorListItem = {
  id: string;
  user_id?: string;
  full_name: string;
  email: string;
  active: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  invitation_pending: boolean;
};

export type AdministratorDetail = AdministratorListItem;

export type AuthUserLookup = {
  user_id: string;
  email: string;
  profile_role: ProfileRole | null;
  profile_active: boolean | null;
  membership_id: string | null;
  membership_role: ProfileRole | null;
  membership_status: MembershipStatus | null;
  membership_active: boolean | null;
};

export type TechnicianSummary = {
  id: string;
  user_id: string;
  full_name: string;
  role: 'technician';
  active: boolean;
};

export type ClientSummary = Pick<Client, 'id' | 'name' | 'phone' | 'email'>;
export type ServiceCategorySummary = Pick<
  ServiceCategory,
  'id' | 'code' | 'name' | 'description' | 'capture_rules' | 'sort_order'
>;

export type LocationPinWithRelations = InstallationItemLocationPin & {
  technician:
    | Pick<OrganizationMembership, 'id' | 'full_name' | 'role'>
    | null;
  invalidatedBy:
    | Pick<OrganizationMembership, 'id' | 'full_name' | 'role'>
    | null;
  approvedBy:
    | Pick<OrganizationMembership, 'id' | 'full_name' | 'role'>
    | null;
};

export type InstallationItemWithLocation = InstallationItem & {
  locationPins: LocationPinWithRelations[];
  activeLocation: LocationPinWithRelations | null;
};

export type InstallationWithRelations = Installation & {
  client: ClientSummary | null;
  technician: TechnicianSummary | null;
  items: InstallationItemWithLocation[];
};

export type TechnicalFieldValueWithDefinition = InstallationTechnicalFieldValue & {
  definition: Pick<
    ServiceFieldDefinition,
    'id' | 'code' | 'label' | 'field_type' | 'sort_order'
  > | null;
};

export type EquipmentLabelPhotoWithUrl = InstallationEquipmentLabelPhoto & {
  signedUrl?: string | null;
  thumbnailUrl?: string | null;
};

export type TechnicalEquipmentWithPhotos = InstallationEquipment & {
  labelPhotos: EquipmentLabelPhotoWithUrl[];
};

export type TechnicalRecordWithRelations = InstallationTechnicalRecord & {
  serviceCategory: ServiceCategorySummary | null;
  fields: TechnicalFieldValueWithDefinition[];
  equipment: TechnicalEquipmentWithPhotos[];
  reviewer:
    | Pick<OrganizationMembership, 'id' | 'full_name' | 'role'>
    | null;
};

export type InstallationListItem = InstallationWithRelations & {
  photos_count?: number;
};

export type PhotoWithRelations = InstallationPhoto & {
  installation: (Pick<Installation, 'id' | 'project_name' | 'status'> & {
    client: ClientSummary | null;
  }) | null;
  technician: TechnicianSummary | null;
  thumbnailUrl?: string;
  signedUrl?: string;
};

export type ActivityWithActor = InstallationActivity & {
  actor:
    | Pick<OrganizationMembership, 'id' | 'full_name' | 'role'>
    | null;
};

export type HandoffWithReviewer = InstallationHandoff & {
  reviewer:
    | Pick<OrganizationMembership, 'id' | 'full_name' | 'role'>
    | null;
  item?: Pick<InstallationItem, 'id' | 'position' | 'name' | 'status'> | null;
  signedUrl?: string;
};

export type DeliverableWithGenerator = InstallationDeliverable & {
  generator:
    | Pick<OrganizationMembership, 'id' | 'full_name' | 'role'>
    | null;
};

export type AccountAdministrationActivity = {
  id: string;
  organization_id: string;
  actor_id: string | null;
  actor_membership_id: string | null;
  target_user_id: string | null;
  target_membership_id: string | null;
  target_name_snapshot: string;
  target_email_snapshot: string;
  action_type: string;
  metadata: Json;
  created_at: string;
};

export type ArchivedTechnician = {
  id: string;
  organization_id: string;
  membership_id: string | null;
  original_user_id: string;
  full_name: string;
  email: string;
  archived_at: string;
  archived_by: string | null;
  installation_count: number;
  photo_count: number;
  activity_count: number;
  metadata: Json;
};

export type OrganizationDeletionChallenge = {
  id: string;
  organization_id: string;
  requested_by: string;
  email_snapshot: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  max_attempts: number;
  resend_count: number;
  consumed_at: string | null;
  created_at: string;
};

export type ActionResult = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string[]>;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      organizations: {
        Row: Organization;
        Insert: Omit<
          Organization,
          | 'id'
          | 'created_at'
          | 'updated_at'
          | 'deletion_status'
          | 'deletion_started_at'
          | 'deletion_started_by'
        > & {
          id?: string;
          deletion_status?: OrganizationDeletionStatus;
          deletion_started_at?: string | null;
          deletion_started_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Organization, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      organization_memberships: {
        Row: OrganizationMembership;
        Insert: Omit<
          OrganizationMembership,
          'id' | 'created_at' | 'updated_at' | 'invited_at' | 'joined_at' | 'archived_at'
        > & {
          id?: string;
          invited_at?: string | null;
          joined_at?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Omit<OrganizationMembership, 'id' | 'organization_id' | 'user_id' | 'created_at' | 'updated_at'>
        >;
        Relationships: [];
      };
      clients: {
        Row: Client;
        Insert: Omit<Client, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Client, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      service_categories: {
        Row: ServiceCategory;
        Insert: Omit<ServiceCategory, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<ServiceCategory, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      service_field_definitions: {
        Row: ServiceFieldDefinition;
        Insert: Omit<ServiceFieldDefinition, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<ServiceFieldDefinition, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      installations: {
        Row: Installation;
        Insert: Omit<
          Installation,
          | 'id'
          | 'created_at'
          | 'updated_at'
          | 'started_at'
          | 'completed_at'
          | 'start_date'
          | 'service_category_id'
          | 'work_type'
          | 'work_description'
          | 'legacy_installation_type'
          | 'technician_name_snapshot'
          | 'technician_email_snapshot'
        > & {
          id?: string;
          start_date?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          service_category_id?: string | null;
          work_type?: WorkType | null;
          work_description?: string | null;
          legacy_installation_type?: string | null;
          technician_name_snapshot?: string | null;
          technician_email_snapshot?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Installation, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      installation_items: {
        Row: InstallationItem;
        Insert: Omit<
          InstallationItem,
          | 'id'
          | 'item_role'
          | 'created_at'
          | 'updated_at'
          | 'start_date'
          | 'started_at'
          | 'completed_at'
          | 'service_category_id'
          | 'work_type'
          | 'work_description'
          | 'legacy_service_type'
        > & {
          id?: string;
          item_role?: InstallationItemRole;
          start_date?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          service_category_id?: string | null;
          work_type?: WorkType | null;
          work_description?: string | null;
          legacy_service_type?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Omit<InstallationItem, 'id' | 'organization_id' | 'installation_id' | 'created_at' | 'updated_at'>
        >;
        Relationships: [];
      };
      installation_item_location_pins: {
        Row: InstallationItemLocationPin;
        Insert: Omit<
          InstallationItemLocationPin,
           | 'id'
           | 'recorded_at'
           | 'created_at'
           | 'review_status'
           | 'approved_at'
           | 'approved_by_user_id'
           | 'approved_by_membership_id'
           | 'invalidated_at'
           | 'invalidated_by_user_id'
           | 'invalidated_by_membership_id'
          | 'invalidation_reason'
        > & {
           id?: string;
           recorded_at?: string;
           created_at?: string;
           review_status?: LocationReviewStatus;
           approved_at?: string | null;
           approved_by_user_id?: string | null;
           approved_by_membership_id?: string | null;
           invalidated_at?: string | null;
           invalidated_by_user_id?: string | null;
          invalidated_by_membership_id?: string | null;
          invalidation_reason?: string | null;
        };
        Update: Partial<
          Pick<
             InstallationItemLocationPin,
             | 'review_status'
             | 'approved_at'
             | 'approved_by_user_id'
             | 'approved_by_membership_id'
             | 'invalidated_at'
             | 'invalidated_by_user_id'
             | 'invalidated_by_membership_id'
             | 'invalidation_reason'
           >
         >;
        Relationships: [];
      };
      installation_photos: {
        Row: InstallationPhoto;
        Insert: Omit<
          InstallationPhoto,
          | 'id'
          | 'installation_item_id'
          | 'created_at'
          | 'uploaded_at'
          | 'uploader_name_snapshot'
          | 'uploader_email_snapshot'
        > & {
          id?: string;
          installation_item_id?: string | null;
          uploaded_at?: string;
          uploader_name_snapshot?: string | null;
          uploader_email_snapshot?: string | null;
          created_at?: string;
        };
        Update: Partial<Omit<InstallationPhoto, 'id' | 'organization_id' | 'created_at'>>;
        Relationships: [];
      };
      installation_activity: {
        Row: InstallationActivity;
        Insert: Omit<
          InstallationActivity,
          'id' | 'installation_item_id' | 'created_at' | 'actor_name_snapshot' | 'actor_email_snapshot'
        > & {
          id?: string;
          installation_item_id?: string | null;
          actor_name_snapshot?: string | null;
          actor_email_snapshot?: string | null;
          created_at?: string;
        };
        Update: Partial<Omit<InstallationActivity, 'id' | 'organization_id' | 'created_at'>>;
        Relationships: [];
      };
      installation_handoffs: {
        Row: InstallationHandoff;
        Insert: Omit<
          InstallationHandoff,
          | 'installation_item_id'
          | 'created_at'
          | 'updated_at'
          | 'reviewed_at'
          | 'reviewed_by_membership_id'
          | 'rejection_reason'
        > & {
          installation_item_id?: string | null;
          created_at?: string;
          updated_at?: string;
          reviewed_at?: string | null;
          reviewed_by_membership_id?: string | null;
          rejection_reason?: string | null;
        };
        Update: Partial<Omit<InstallationHandoff, 'id' | 'organization_id' | 'installation_id' | 'created_at'>>;
        Relationships: [];
      };
      installation_deliverables: {
        Row: InstallationDeliverable;
        Insert: Omit<InstallationDeliverable, 'id' | 'installation_item_id' | 'created_at'> & {
          id?: string;
          installation_item_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Omit<InstallationDeliverable, 'id' | 'organization_id' | 'installation_id' | 'created_at'>>;
        Relationships: [];
      };
      installation_technical_records: {
        Row: InstallationTechnicalRecord;
        Insert: Omit<
          InstallationTechnicalRecord,
          | 'id'
          | 'status'
          | 'submitted_at'
          | 'submitted_by_user_id'
          | 'submitted_by_membership_id'
          | 'reviewed_at'
          | 'reviewed_by_user_id'
          | 'reviewed_by_membership_id'
          | 'review_reason'
          | 'created_at'
          | 'updated_at'
        > & {
          id?: string;
          status?: TechnicalRecordStatus;
          submitted_at?: string | null;
          submitted_by_user_id?: string | null;
          submitted_by_membership_id?: string | null;
          reviewed_at?: string | null;
          reviewed_by_user_id?: string | null;
          reviewed_by_membership_id?: string | null;
          review_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Omit<InstallationTechnicalRecord, 'id' | 'organization_id' | 'installation_id' | 'installation_item_id' | 'created_at'>
        >;
        Relationships: [];
      };
      installation_technical_field_values: {
        Row: InstallationTechnicalFieldValue;
        Insert: Omit<InstallationTechnicalFieldValue, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<InstallationTechnicalFieldValue, 'id' | 'organization_id' | 'created_at'>>;
        Relationships: [];
      };
      installation_equipment: {
        Row: InstallationEquipment;
        Insert: Omit<InstallationEquipment, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<InstallationEquipment, 'id' | 'organization_id' | 'created_at'>>;
        Relationships: [];
      };
      installation_equipment_label_photos: {
        Row: InstallationEquipmentLabelPhoto;
        Insert: Omit<InstallationEquipmentLabelPhoto, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<InstallationEquipmentLabelPhoto, 'id' | 'organization_id' | 'created_at'>>;
        Relationships: [];
      };
      account_administration_activity: {
        Row: AccountAdministrationActivity;
        Insert: Omit<AccountAdministrationActivity, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<AccountAdministrationActivity, 'id' | 'organization_id' | 'created_at'>>;
        Relationships: [];
      };
      archived_technicians: {
        Row: ArchivedTechnician;
        Insert: Omit<ArchivedTechnician, 'id' | 'archived_at'> & {
          id?: string;
          archived_at?: string;
        };
        Update: Partial<Omit<ArchivedTechnician, 'id' | 'organization_id' | 'archived_at'>>;
        Relationships: [];
      };
      organization_deletion_challenges: {
        Row: OrganizationDeletionChallenge;
        Insert: Omit<OrganizationDeletionChallenge, 'created_at' | 'attempts' | 'max_attempts' | 'resend_count' | 'consumed_at'> & {
          attempts?: number;
          max_attempts?: number;
          resend_count?: number;
          consumed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Omit<OrganizationDeletionChallenge, 'id' | 'organization_id' | 'requested_by' | 'created_at'>>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      admin_dashboard_metrics: {
        Args: { p_organization_id: string };
        Returns: DashboardMetrics[];
      };
      admin_set_installation_status: {
        Args: {
          p_installation_id: string;
          p_new_status: InstallationStatus;
          p_organization_id: string;
        };
        Returns: Installation;
      };
      admin_find_user_by_email: {
        Args: { p_email: string; p_organization_id: string };
        Returns: AuthUserLookup[];
      };
      admin_technician_directory: {
        Args: {
          p_organization_id: string;
          p_search?: string;
          p_status?: string;
        };
        Returns: TechnicianListItem[];
      };
      admin_get_technician_detail: {
        Args: { p_organization_id: string; p_technician_id: string };
        Returns: TechnicianDetail[];
      };
      admin_recent_technician_installations: {
        Args: {
          p_organization_id: string;
          p_technician_id: string;
          p_limit?: number;
        };
        Returns: TechnicianRecentInstallation[];
      };
      admin_get_technician_archive_eligibility: {
        Args: { p_organization_id: string; p_technician_id: string };
        Returns: TechnicianArchiveEligibility[];
      };
      admin_prepare_technician_archive: {
        Args: { p_organization_id: string; p_technician_id: string };
        Returns: TechnicianArchivePrepared[];
      };
      admin_update_technician_name: {
        Args: {
          p_organization_id: string;
          p_technician_id: string;
          p_full_name: string;
        };
        Returns: Profile;
      };
      admin_set_technician_active: {
        Args: {
          p_organization_id: string;
          p_technician_id: string;
          p_active: boolean;
        };
        Returns: Profile;
      };
      admin_administrator_directory: {
        Args: {
          p_organization_id: string;
          p_search?: string;
          p_status?: string;
        };
        Returns: AdministratorListItem[];
      };
      admin_get_administrator_detail: {
        Args: { p_organization_id: string; p_admin_id: string };
        Returns: AdministratorDetail[];
      };
      admin_set_administrator_active: {
        Args: {
          p_organization_id: string;
          p_admin_id: string;
          p_active: boolean;
        };
        Returns: Profile;
      };
      service_create_company_for_user: {
        Args: {
          p_user_id: string;
          p_company_name: string;
          p_full_name: string;
          p_email: string;
        };
        Returns: {
          organization_id: string;
          membership_id: string;
          normalized_name: string;
        }[];
      };
      service_delete_organization_after_challenge: {
        Args: {
          p_organization_id: string;
          p_requested_by: string;
          p_challenge_id: string;
        };
        Returns: Json;
      };
      start_installation: {
        Args: { p_installation_id: string };
        Returns: Installation;
      };
      start_installation_item: {
        Args: { p_installation_id: string; p_installation_item_id: string };
        Returns: Installation;
      };
      admin_set_installation_item_status: {
        Args: {
          p_organization_id: string;
          p_installation_id: string;
          p_installation_item_id: string;
          p_new_status: InstallationStatus;
        };
        Returns: InstallationItem;
      };
      register_installation_item_location: {
        Args: {
          p_installation_id: string;
          p_installation_item_id: string;
          p_latitude: number;
          p_longitude: number;
          p_accuracy_meters: number;
        };
        Returns: InstallationItemLocationPin;
      };
       admin_invalidate_installation_item_location: {
         Args: {
           p_organization_id: string;
           p_location_pin_id: string;
           p_reason?: string | null;
         };
         Returns: InstallationItemLocationPin;
       };
       admin_approve_installation_item_location: {
         Args: {
           p_organization_id: string;
           p_location_pin_id: string;
         };
         Returns: InstallationItemLocationPin;
       };
       installation_item_location_is_approved: {
         Args: {
           target_organization_id: string;
           target_installation_id: string;
           target_installation_item_id: string;
         };
         Returns: boolean;
       };
      complete_installation: {
        Args: { p_installation_id: string };
        Returns: Installation;
      };
      submit_installation_handoff: {
        Args: {
          p_installation_id: string;
          p_handoff_id: string;
          p_recipient_name: string;
          p_signature_storage_path: string;
          p_final_notes?: string | null;
        };
        Returns: Installation;
      };
      submit_installation_item_handoff: {
        Args: {
          p_installation_id: string;
          p_installation_item_id: string;
          p_handoff_id: string;
          p_recipient_name: string;
          p_signature_storage_path: string;
          p_final_notes?: string | null;
        };
        Returns: Installation;
      };
      admin_approve_installation_handoff: {
        Args: { p_organization_id: string; p_handoff_id: string };
        Returns: InstallationHandoff;
      };
      admin_reject_installation_handoff: {
        Args: {
          p_organization_id: string;
          p_handoff_id: string;
          p_rejection_reason: string;
        };
        Returns: InstallationHandoff;
      };
      admin_mark_installation_completed_after_deliverable: {
        Args: { p_organization_id: string; p_installation_id: string };
        Returns: Installation;
      };
      admin_mark_installation_item_completed_after_deliverable: {
        Args: {
          p_organization_id: string;
          p_installation_id: string;
          p_installation_item_id: string;
        };
        Returns: Installation;
      };
      submit_installation_technical_info: {
        Args: {
          p_installation_id: string;
          p_installation_item_id: string;
        };
        Returns: InstallationTechnicalRecord;
      };
      validate_installation_technical_record: {
        Args: { p_technical_record_id: string };
        Returns: Json;
      };
      admin_review_installation_technical_info: {
        Args: {
          p_organization_id: string;
          p_technical_record_id: string;
          p_status: 'verified' | 'correction_required';
          p_reason?: string | null;
        };
        Returns: InstallationTechnicalRecord;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
