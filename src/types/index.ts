import type { UserRole, ProspectStatus, CallResult, RdvStatus, RdvType, DevisStatus, ProjectStatus, ProspectSource, ClientStatus } from './enums'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  phone: string | null
  avatar_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Prospect {
  id: string
  company_name: string
  contact_name: string | null
  contact_firstname: string | null
  contact_email: string | null
  phone: string
  phone_secondary: string | null
  google_maps_url: string | null
  website: string | null
  profession: string | null
  city: string | null
  zone: string | null
  address: string | null
  status: ProspectStatus
  commercial_id: string
  import_id: string | null
  source: ProspectSource
  call_count: number
  last_called_at: string | null
  next_reminder_at: string | null
  converted_at: string | null
  client_id: string | null
  notes: string | null
  custom_fields: Record<string, unknown>
  created_at: string
  updated_at: string
  deleted_at: string | null
  // Joined
  commercial?: Profile
}

export interface Call {
  id: string
  prospect_id: string
  commercial_id: string
  called_at: string
  duration_seconds: number | null
  result: CallResult
  previous_status: ProspectStatus
  new_status: ProspectStatus
  note: string | null
  created_at: string
  // Joined
  commercial?: Profile
  prospect?: Prospect
}

export interface Reminder {
  id: string
  prospect_id: string
  commercial_id: string
  remind_at: string
  note: string | null
  is_completed: boolean
  completed_at: string | null
  created_at: string
  updated_at: string
  // Joined
  prospect?: Prospect
}

export interface RendezVous {
  id: string
  prospect_id: string
  commercial_id: string
  scheduled_at: string
  duration_minutes: number
  type: RdvType
  status: RdvStatus
  result: string | null
  location: string | null
  meeting_url: string | null
  notes: string | null
  no_show_reason: string | null
  created_from_call_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  // Joined
  prospect?: Prospect
  commercial?: Profile
}

export interface Client {
  id: string
  prospect_id: string
  company_name: string
  contact_name: string | null
  contact_firstname: string | null
  contact_email: string | null
  phone: string
  profession: string | null
  city: string | null
  address: string | null
  website: string | null
  commercial_id: string
  source: ProspectSource
  converted_at: string
  status: ClientStatus
  notes: string | null
  custom_fields: Record<string, unknown>
  created_at: string
  updated_at: string
  deleted_at: string | null
  // Joined
  commercial?: Profile
  prospect?: Prospect
  project?: Project
}

export interface Project {
  id: string
  client_id: string
  name: string
  description: string | null
  status: ProjectStatus
  start_date: string | null
  end_date: string | null
  monthly_amount: number | null
  total_amount: number | null
  notes: string | null
  custom_fields: Record<string, unknown>
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ProjectNote {
  id: string
  project_id: string
  author_id: string
  content: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  // Joined
  author?: Profile
}

export interface ProjectDocument {
  id: string
  project_id: string
  uploaded_by: string
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
  created_at: string
  deleted_at: string | null
}

export interface Devis {
  id: string
  client_id: string
  project_id: string | null
  reference: string
  amount_ht: number
  tax_rate: number
  amount_ttc: number
  status: DevisStatus
  sent_at: string | null
  signed_at: string | null
  refused_at: string | null
  valid_until: string | null
  file_path: string | null
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  // Joined
  client?: Client
}

export interface CsvImport {
  id: string
  uploaded_by: string
  original_filename: string
  row_count: number
  imported_count: number
  skipped_count: number
  column_mapping: Record<string, string>
  assigned_commercial_id: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error_log: Record<string, unknown>[] | null
  created_at: string
}

export interface CsvMappingPreset {
  id: string
  name: string
  mapping: Record<string, string>
  created_by: string
  is_default: boolean
  created_at: string
}

export interface EventLog {
  id: string
  event_type: string
  entity_type: string
  entity_id: string
  actor_id: string
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface SavedView {
  id: string
  name: string
  module: string
  filters: Record<string, unknown>
  sort: Record<string, unknown> | null
  columns: Record<string, unknown> | null
  created_by: string
  is_shared: boolean
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  message: string | null
  link: string | null
  is_read: boolean
  created_at: string
}

// Pagination
export interface PaginatedResponse<T> {
  data: T[]
  count: number
  page: number
  pageSize: number
  totalPages: number
}

// Filters
export interface ProspectFilters {
  search?: string
  status?: ProspectStatus[]
  profession?: string[]
  city?: string[]
  commercial_id?: string
  import_id?: string
  has_reminder_today?: boolean
  has_overdue_reminder?: boolean
  never_called?: boolean
  date_from?: string
  date_to?: string
  last_called_from?: string
  last_called_to?: string
}
