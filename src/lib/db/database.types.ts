// Generated from the live schema via the Supabase Management API. Do not edit by
// hand; regenerate after schema changes. Reflects migrations 0001-0004.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      org_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          org_id: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          expires_at?: string
          id?: string
          org_id: string
          role?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          org_id?: string
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_settings: {
        Row: {
          company_name: string
          contact_email: string
          contact_name: string
          contact_phone: string
          floor_height: number
          footprint_aspect: number
          home_base: string
          lift_fee_per_floor: number
          local_city: string
          local_state: string
          local_zip_prefix: string
          max_floors: number
          min_floors: number
          min_job: number
          monthly_discount_pct: number
          org_id: string
          panes_per_window: number
          quarterly_discount_pct: number
          rate_per_sqft: number
          region_state: string
          res_price_per_window: number
          res_sqft_per_window: number
          res_upper_story_pct: number
          service_mode: string
          updated_at: string
          value_ceil: number
          value_floor: number
          weight_buyer: number
          weight_density: number
          weight_fit: number
          weight_portfolio: number
          weight_value: number
          window_size: number
          window_to_wall_pct: number
        }
        Insert: {
          company_name?: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          floor_height?: number
          footprint_aspect?: number
          home_base?: string
          lift_fee_per_floor?: number
          local_city?: string
          local_state?: string
          local_zip_prefix?: string
          max_floors?: number
          min_floors?: number
          min_job?: number
          monthly_discount_pct?: number
          org_id: string
          panes_per_window?: number
          quarterly_discount_pct?: number
          rate_per_sqft?: number
          region_state?: string
          res_price_per_window?: number
          res_sqft_per_window?: number
          res_upper_story_pct?: number
          service_mode?: string
          updated_at?: string
          value_ceil?: number
          value_floor?: number
          weight_buyer?: number
          weight_density?: number
          weight_fit?: number
          weight_portfolio?: number
          weight_value?: number
          window_size?: number
          window_to_wall_pct?: number
        }
        Update: {
          company_name?: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          floor_height?: number
          footprint_aspect?: number
          home_base?: string
          lift_fee_per_floor?: number
          local_city?: string
          local_state?: string
          local_zip_prefix?: string
          max_floors?: number
          min_floors?: number
          min_job?: number
          monthly_discount_pct?: number
          org_id?: string
          panes_per_window?: number
          quarterly_discount_pct?: number
          rate_per_sqft?: number
          region_state?: string
          res_price_per_window?: number
          res_sqft_per_window?: number
          res_upper_story_pct?: number
          service_mode?: string
          updated_at?: string
          value_ceil?: number
          value_floor?: number
          weight_buyer?: number
          weight_density?: number
          weight_fit?: number
          weight_portfolio?: number
          weight_value?: number
          window_size?: number
          window_to_wall_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "org_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          id: string
          name: string
          plan: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
        }
        Relationships: []
      }
      parcels: {
        Row: {
          address: string
          bldg_sqft: number | null
          city: string | null
          created_at: string
          id: number
          land_use: string | null
          lat: number | null
          lon: number | null
          market_value: number | null
          org_id: string
          owner_key: string | null
          owner_mailing: string | null
          owner_name: string | null
          parcel_number: string | null
          stories: number | null
          year_built: number | null
          zip: string | null
        }
        Insert: {
          address: string
          bldg_sqft?: number | null
          city?: string | null
          created_at?: string
          id?: never
          land_use?: string | null
          lat?: number | null
          lon?: number | null
          market_value?: number | null
          org_id: string
          owner_key?: string | null
          owner_mailing?: string | null
          owner_name?: string | null
          parcel_number?: string | null
          stories?: number | null
          year_built?: number | null
          zip?: string | null
        }
        Update: {
          address?: string
          bldg_sqft?: number | null
          city?: string | null
          created_at?: string
          id?: never
          land_use?: string | null
          lat?: number | null
          lon?: number | null
          market_value?: number | null
          org_id?: string
          owner_key?: string | null
          owner_mailing?: string | null
          owner_name?: string | null
          parcel_number?: string | null
          stories?: number | null
          year_built?: number | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parcels_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_state: {
        Row: {
          due: string | null
          last_touch: string | null
          notes: string
          org_id: string
          parcel_id: number
          status: string
          touch: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          due?: string | null
          last_touch?: string | null
          notes?: string
          org_id: string
          parcel_id: number
          status?: string
          touch?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          due?: string | null
          last_touch?: string | null
          notes?: string
          org_id?: string
          parcel_id?: number
          status?: string
          touch?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospect_state_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_state_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: true
            referencedRelation: "parcels"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          created_by: string | null
          id: string
          name: string
          org_id: string
          stops: number[]
          updated_at: string
        }
        Insert: {
          created_by?: string | null
          id?: string
          name?: string
          org_id: string
          stops?: number[]
          updated_at?: string
        }
        Update: {
          created_by?: string | null
          id?: string
          name?: string
          org_id?: string
          stops?: number[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: { Args: { invite_token: string }; Returns: string }
      clear_org_parcels: { Args: { target_org: string }; Returns: undefined }
      create_invite: {
        Args: { invite_email: string; invite_role?: string; target_org: string }
        Returns: {
          accepted_at: string | null
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          org_id: string
          role: string
          token: string
        }
        SetofOptions: {
          from: "*"
          to: "org_invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_org: {
        Args: { company?: string; org_name: string }
        Returns: string
      }
      invite_preview: {
        Args: { invite_token: string }
        Returns: {
          email: string
          expired: boolean
          org_name: string
        }[]
      }
      is_org_admin: { Args: { check_org: string }; Returns: boolean }
      is_org_member: { Args: { check_org: string }; Returns: boolean }
      org_seat_limit: { Args: { target_org: string }; Returns: number }
      org_seats_used: { Args: { target_org: string }; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
