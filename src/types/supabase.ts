// Supabase Database Types for Calibration Services CRM
// These match the schema defined in supabase/migrations

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ============================================
// ENUMS
// ============================================

export type StaffRole = 'admin' | 'management' | 'scheduler' | 'sales' | 'onboarding' | 'technician';
export type ClientRole = 'company_manager' | 'branch_manager';
export type JobStatus = 'new' | 'quoted' | 'accepted' | 'scheduled' | 'in_progress' | 'pending_review' | 'completed' | 'invoiced' | 'cancelled';
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type CertificateStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'superseded';
export type ServiceUnit = 'per_item' | 'per_hour' | 'flat_rate';
export type ActivityType = 'created' | 'updated' | 'deleted' | 'status_changed' | 'assigned' | 'commented' | 'uploaded' | 'emailed' | 'approved' | 'rejected';

// ============================================
// DATABASE INTERFACE
// ============================================

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          phone: string | null;
          avatar_url: string | null;
          staff_role: StaffRole | null;
          is_staff: boolean;
          client_role: ClientRole | null;
          company_id: string | null;
          branch_id: string | null;
          requires_2fa: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          phone?: string | null;
          avatar_url?: string | null;
          staff_role?: StaffRole | null;
          is_staff?: boolean;
          client_role?: ClientRole | null;
          company_id?: string | null;
          branch_id?: string | null;
          requires_2fa?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string;
          full_name?: string;
          phone?: string | null;
          avatar_url?: string | null;
          staff_role?: StaffRole | null;
          is_staff?: boolean;
          client_role?: ClientRole | null;
          company_id?: string | null;
          branch_id?: string | null;
          requires_2fa?: boolean;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      companies: {
        Row: {
          id: string;
          company_code: string;
          name: string;
          trading_name: string | null;
          abn: string | null;
          primary_contact_name: string | null;
          primary_contact_email: string | null;
          primary_contact_phone: string | null;
          billing_address_line1: string | null;
          billing_address_line2: string | null;
          billing_city: string | null;
          billing_state: string | null;
          billing_postcode: string | null;
          billing_country: string;
          default_calibration_interval_months: number;
          payment_terms_days: number;
          notes: string | null;
          tags: string[];
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_code?: string;
          name: string;
          trading_name?: string | null;
          abn?: string | null;
          primary_contact_name?: string | null;
          primary_contact_email?: string | null;
          primary_contact_phone?: string | null;
          billing_address_line1?: string | null;
          billing_address_line2?: string | null;
          billing_city?: string | null;
          billing_state?: string | null;
          billing_postcode?: string | null;
          billing_country?: string;
          default_calibration_interval_months?: number;
          payment_terms_days?: number;
          notes?: string | null;
          tags?: string[];
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          trading_name?: string | null;
          abn?: string | null;
          primary_contact_name?: string | null;
          primary_contact_email?: string | null;
          primary_contact_phone?: string | null;
          billing_address_line1?: string | null;
          billing_address_line2?: string | null;
          billing_city?: string | null;
          billing_state?: string | null;
          billing_postcode?: string | null;
          billing_country?: string;
          default_calibration_interval_months?: number;
          payment_terms_days?: number;
          notes?: string | null;
          tags?: string[];
          is_active?: boolean;
          updated_at?: string;
        };
      };
      branches: {
        Row: {
          id: string;
          company_id: string;
          branch_code: string;
          name: string;
          contact_name: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          state: string | null;
          postcode: string | null;
          country: string;
          latitude: number | null;
          longitude: number | null;
          region: string | null;
          operating_hours: Json;
          site_requirements: string | null;
          notes: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          branch_code?: string;
          name: string;
          contact_name?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          postcode?: string | null;
          country?: string;
          latitude?: number | null;
          longitude?: number | null;
          region?: string | null;
          operating_hours?: Json;
          site_requirements?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          name?: string;
          contact_name?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          postcode?: string | null;
          country?: string;
          latitude?: number | null;
          longitude?: number | null;
          region?: string | null;
          operating_hours?: Json;
          site_requirements?: string | null;
          notes?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      services: {
        Row: {
          id: string;
          service_code: string;
          model_number: string | null;
          name: string;
          description: string | null;
          category: string;
          base_price: number;
          price_min: number | null;
          price_max: number | null;
          unit: ServiceUnit;
          estimated_minutes: number;
          is_active: boolean;
          last_price_update: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          service_code: string;
          model_number?: string | null;
          name: string;
          description?: string | null;
          category: string;
          base_price: number;
          price_min?: number | null;
          price_max?: number | null;
          unit?: ServiceUnit;
          estimated_minutes?: number;
          is_active?: boolean;
          last_price_update?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          service_code?: string;
          model_number?: string | null;
          name?: string;
          description?: string | null;
          category?: string;
          base_price?: number;
          price_min?: number | null;
          price_max?: number | null;
          unit?: ServiceUnit;
          estimated_minutes?: number;
          is_active?: boolean;
          last_price_update?: string;
          updated_at?: string;
        };
      };
      equipment: {
        Row: {
          id: string;
          branch_id: string;
          equipment_code: string;
          description: string;
          manufacturer: string | null;
          model: string | null;
          serial_number: string | null;
          asset_number: string | null;
          category: string;
          sub_category: string | null;
          calibration_interval_months: number;
          last_calibration_date: string | null;
          next_calibration_due: string | null;
          primary_service_id: string | null;
          location_description: string | null;
          specifications: Json;
          notes: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          equipment_code?: string;
          description: string;
          manufacturer?: string | null;
          model?: string | null;
          serial_number?: string | null;
          asset_number?: string | null;
          category: string;
          sub_category?: string | null;
          calibration_interval_months?: number;
          last_calibration_date?: string | null;
          next_calibration_due?: string | null;
          primary_service_id?: string | null;
          location_description?: string | null;
          specifications?: Json;
          notes?: string | null;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          branch_id?: string;
          description?: string;
          manufacturer?: string | null;
          model?: string | null;
          serial_number?: string | null;
          asset_number?: string | null;
          category?: string;
          sub_category?: string | null;
          calibration_interval_months?: number;
          last_calibration_date?: string | null;
          next_calibration_due?: string | null;
          primary_service_id?: string | null;
          location_description?: string | null;
          specifications?: Json;
          notes?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      quotes: {
        Row: {
          id: string;
          branch_id: string;
          quote_number: string;
          status: QuoteStatus;
          valid_until: string | null;
          subtotal: number;
          discount_percent: number;
          discount_amount: number;
          tax_rate: number;
          tax_amount: number;
          total: number;
          notes: string | null;
          terms: string | null;
          converted_to_job_id: string | null;
          created_by: string | null;
          sent_at: string | null;
          accepted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          quote_number: string;
          status?: QuoteStatus;
          valid_until?: string | null;
          subtotal?: number;
          discount_percent?: number;
          discount_amount?: number;
          tax_rate?: number;
          tax_amount?: number;
          total?: number;
          notes?: string | null;
          terms?: string | null;
          converted_to_job_id?: string | null;
          created_by?: string | null;
          sent_at?: string | null;
          accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          branch_id?: string;
          status?: QuoteStatus;
          valid_until?: string | null;
          discount_percent?: number;
          notes?: string | null;
          terms?: string | null;
          converted_to_job_id?: string | null;
          sent_at?: string | null;
          accepted_at?: string | null;
          updated_at?: string;
        };
      };
      quote_line_items: {
        Row: {
          id: string;
          quote_id: string;
          service_id: string | null;
          description: string;
          quantity: number;
          unit_price: number;
          line_total: number;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          quote_id: string;
          service_id?: string | null;
          description: string;
          quantity?: number;
          unit_price: number;
          line_total: number;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          service_id?: string | null;
          description?: string;
          quantity?: number;
          unit_price?: number;
          line_total?: number;
          sort_order?: number;
        };
      };
      jobs: {
        Row: {
          id: string;
          branch_id: string;
          job_number: string;
          status: JobStatus;
          quote_id: string | null;
          assigned_to: string | null;
          scheduled_date: string | null;
          scheduled_time_start: string | null;
          scheduled_time_end: string | null;
          completed_at: string | null;
          completed_by: string | null;
          internal_notes: string | null;
          client_notes: string | null;
          priority: TaskPriority;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          job_number: string;
          status?: JobStatus;
          quote_id?: string | null;
          assigned_to?: string | null;
          scheduled_date?: string | null;
          scheduled_time_start?: string | null;
          scheduled_time_end?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          internal_notes?: string | null;
          client_notes?: string | null;
          priority?: TaskPriority;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          branch_id?: string;
          status?: JobStatus;
          quote_id?: string | null;
          assigned_to?: string | null;
          scheduled_date?: string | null;
          scheduled_time_start?: string | null;
          scheduled_time_end?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          internal_notes?: string | null;
          client_notes?: string | null;
          priority?: TaskPriority;
          updated_at?: string;
        };
      };
      job_equipment: {
        Row: {
          id: string;
          job_id: string;
          equipment_id: string;
          service_id: string | null;
          passed: boolean | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          job_id: string;
          equipment_id: string;
          service_id?: string | null;
          passed?: boolean | null;
          notes?: string | null;
        };
        Update: {
          service_id?: string | null;
          passed?: boolean | null;
          notes?: string | null;
        };
      };
      certificates: {
        Row: {
          id: string;
          job_id: string;
          equipment_id: string;
          certificate_number: string;
          status: CertificateStatus;
          calibration_date: string;
          expiry_date: string | null;
          results: Json;
          passed: boolean | null;
          pdf_url: string | null;
          issued_by: string | null;
          approved_by: string | null;
          approved_at: string | null;
          locked_at: string | null;
          superseded_by: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          equipment_id: string;
          certificate_number: string;
          status?: CertificateStatus;
          calibration_date: string;
          expiry_date?: string | null;
          results?: Json;
          passed?: boolean | null;
          pdf_url?: string | null;
          issued_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          locked_at?: string | null;
          superseded_by?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: CertificateStatus;
          calibration_date?: string;
          expiry_date?: string | null;
          results?: Json;
          passed?: boolean | null;
          pdf_url?: string | null;
          issued_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          locked_at?: string | null;
          superseded_by?: string | null;
          updated_at?: string;
        };
      };
      tasks: {
        Row: {
          id: string;
          company_id: string | null;
          branch_id: string | null;
          job_id: string | null;
          quote_id: string | null;
          title: string;
          description: string | null;
          status: TaskStatus;
          priority: TaskPriority;
          assigned_to: string | null;
          assigned_by: string | null;
          due_date: string | null;
          completed_at: string | null;
          completed_by: string | null;
          is_system_generated: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id?: string | null;
          branch_id?: string | null;
          job_id?: string | null;
          quote_id?: string | null;
          title: string;
          description?: string | null;
          status?: TaskStatus;
          priority?: TaskPriority;
          assigned_to?: string | null;
          assigned_by?: string | null;
          due_date?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          is_system_generated?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string | null;
          branch_id?: string | null;
          job_id?: string | null;
          quote_id?: string | null;
          title?: string;
          description?: string | null;
          status?: TaskStatus;
          priority?: TaskPriority;
          assigned_to?: string | null;
          due_date?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          updated_at?: string;
        };
      };
      activity_log: {
        Row: {
          id: string;
          user_id: string | null;
          entity_type: string;
          entity_id: string;
          activity_type: ActivityType;
          description: string | null;
          changes: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          entity_type: string;
          entity_id: string;
          activity_type: ActivityType;
          description?: string | null;
          changes?: Json | null;
          created_at?: string;
        };
        Update: never; // Immutable
      };
      documents: {
        Row: {
          id: string;
          entity_type: string;
          entity_id: string;
          file_name: string;
          file_type: string;
          file_size: number | null;
          storage_path: string;
          description: string | null;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          entity_type: string;
          entity_id: string;
          file_name: string;
          file_type: string;
          file_size?: number | null;
          storage_path: string;
          description?: string | null;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: {
          description?: string | null;
        };
      };
      settings: {
        Row: {
          key: string;
          value: Json;
          description: string | null;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Json;
          description?: string | null;
          updated_at?: string;
        };
        Update: {
          value?: Json;
          description?: string | null;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      generate_job_number: {
        Args: Record<string, never>;
        Returns: string;
      };
      generate_quote_number: {
        Args: Record<string, never>;
        Returns: string;
      };
      generate_certificate_number: {
        Args: Record<string, never>;
        Returns: string;
      };
      calculate_quote_totals: {
        Args: { quote_uuid: string };
        Returns: void;
      };
      is_staff: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_management_or_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      get_staff_role: {
        Args: Record<string, never>;
        Returns: StaffRole;
      };
      belongs_to_company: {
        Args: { company_uuid: string };
        Returns: boolean;
      };
      belongs_to_branch: {
        Args: { branch_uuid: string };
        Returns: boolean;
      };
    };
    Enums: {
      staff_role: StaffRole;
      client_role: ClientRole;
      job_status: JobStatus;
      quote_status: QuoteStatus;
      task_status: TaskStatus;
      task_priority: TaskPriority;
      certificate_status: CertificateStatus;
      service_unit: ServiceUnit;
      activity_type: ActivityType;
    };
  };
}

// ============================================
// HELPER TYPES
// ============================================

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];

// ============================================
// CONVENIENCE TYPES
// ============================================

export type Profile = Tables<'profiles'>;
export type Company = Tables<'companies'>;
export type Branch = Tables<'branches'>;
export type Service = Tables<'services'>;
export type Equipment = Tables<'equipment'>;
export type Quote = Tables<'quotes'>;
export type QuoteLineItem = Tables<'quote_line_items'>;
export type Job = Tables<'jobs'>;
export type JobEquipment = Tables<'job_equipment'>;
export type Certificate = Tables<'certificates'>;
export type Task = Tables<'tasks'>;
export type ActivityLog = Tables<'activity_log'>;
export type Document = Tables<'documents'>;
export type Setting = Tables<'settings'>;

// ============================================
// EXTENDED TYPES (with relations)
// ============================================

export interface CompanyWithBranches extends Company {
  branches?: Branch[];
}

export interface BranchWithCompany extends Branch {
  company?: Company;
}

export interface BranchWithEquipment extends Branch {
  company?: Company;
  equipment?: Equipment[];
}

export interface EquipmentWithBranch extends Equipment {
  branch?: BranchWithCompany;
  primary_service?: Service;
}

export interface JobWithRelations extends Job {
  branch?: BranchWithCompany;
  assigned_user?: Profile;
  quote?: Quote;
  job_equipment?: (JobEquipment & { equipment?: Equipment; service?: Service })[];
  certificates?: Certificate[];
}

export interface QuoteWithRelations extends Quote {
  branch?: BranchWithCompany;
  line_items?: QuoteLineItem[];
  created_by_user?: Profile;
}

export interface CertificateWithRelations extends Certificate {
  job?: Job;
  equipment?: Equipment;
  issued_by_user?: Profile;
  approved_by_user?: Profile;
}

export interface TaskWithRelations extends Task {
  company?: Company;
  branch?: Branch;
  job?: Job;
  quote?: Quote;
  assigned_user?: Profile;
}
