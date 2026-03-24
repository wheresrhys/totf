export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      Birds: {
        Row: {
          id: number
          last_encountered_timestamp: string
          ring_no: string
          ringing_group_ids: number[]
          species_id: number
        }
        Insert: {
          id?: number
          last_encountered_timestamp?: string
          ring_no: string
          ringing_group_ids?: number[]
          species_id: number
        }
        Update: {
          id?: number
          last_encountered_timestamp?: string
          ring_no?: string
          ringing_group_ids?: number[]
          species_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "birds_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "Species"
            referencedColumns: ["id"]
          },
        ]
      }
      Encounters: {
        Row: {
          age_code: number
          bird_id: number
          breeding_condition: string | null
          capture_time: string
          extra_text: string | null
          id: number
          is_juv: boolean
          max_hatch_year: number
          min_hatch_year: number
          moult_code: string | null
          old_greater_coverts: number | null
          record_type: string
          ringing_group_id: number
          scheme: string
          session_id: number
          sex: string
          sexing_method: string | null
          weight: number | null
          wing_length: number | null
        }
        Insert: {
          age_code: number
          bird_id: number
          breeding_condition?: string | null
          capture_time: string
          extra_text?: string | null
          id?: number
          is_juv?: boolean
          max_hatch_year: number
          min_hatch_year: number
          moult_code?: string | null
          old_greater_coverts?: number | null
          record_type: string
          ringing_group_id: number
          scheme: string
          session_id: number
          sex: string
          sexing_method?: string | null
          weight?: number | null
          wing_length?: number | null
        }
        Update: {
          age_code?: number
          bird_id?: number
          breeding_condition?: string | null
          capture_time?: string
          extra_text?: string | null
          id?: number
          is_juv?: boolean
          max_hatch_year?: number
          min_hatch_year?: number
          moult_code?: string | null
          old_greater_coverts?: number | null
          record_type?: string
          ringing_group_id?: number
          scheme?: string
          session_id?: number
          sex?: string
          sexing_method?: string | null
          weight?: number | null
          wing_length?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "encounters_bird_id_fkey"
            columns: ["bird_id"]
            isOneToOne: false
            referencedRelation: "Birds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounters_ringing_group_id_fkey"
            columns: ["ringing_group_id"]
            isOneToOne: false
            referencedRelation: "RingingGroups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounters_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "Sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      Locations: {
        Row: {
          id: number
          location_name: string
          ringing_group_id: number
        }
        Insert: {
          id?: number
          location_name: string
          ringing_group_id: number
        }
        Update: {
          id?: number
          location_name?: string
          ringing_group_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "locations_ringing_group_id_fkey"
            columns: ["ringing_group_id"]
            isOneToOne: false
            referencedRelation: "RingingGroups"
            referencedColumns: ["id"]
          },
        ]
      }
      RingingGroups: {
        Row: {
          group_name: string
          id: number
        }
        Insert: {
          group_name: string
          id?: number
        }
        Update: {
          group_name?: string
          id?: number
        }
        Relationships: []
      }
      Sessions: {
        Row: {
          id: number
          location_id: number
          ringing_group_id: number
          visit_date: string
        }
        Insert: {
          id?: number
          location_id: number
          ringing_group_id: number
          visit_date: string
        }
        Update: {
          id?: number
          location_id?: number
          ringing_group_id?: number
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "Locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_ringing_group_id_fkey"
            columns: ["ringing_group_id"]
            isOneToOne: false
            referencedRelation: "RingingGroups"
            referencedColumns: ["id"]
          },
        ]
      }
      Species: {
        Row: {
          id: number
          species_name: string
        }
        Insert: {
          id?: number
          species_name: string
        }
        Update: {
          id?: number
          species_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aggregate_stats: {
        Args: {
          from_date?: string
          group_by_species?: boolean
          group_by_time_period?: string
          ringing_group_filter?: number
          species_name_filter?: string
          to_date?: string
        }
        Returns: {
          "3_count": number
          "3j_count": number
          avg_encounters_per_session: number
          avg_weight: number
          avg_wing: number
          bird_count: number
          effort_per_encounter: string
          effort_per_session: string
          encounter_count: number
          max_new_per_session: number
          max_per_session: number
          max_weight: number
          max_wing: number
          median_weight: number
          median_wing: number
          min_weight: number
          min_wing: number
          new_3_count: number
          new_bird_count: number
          session_count: number
          species_count: number
          species_name: string
          time_period: string
          total_effort: string
        }[]
      }
      daitch_mokotoff: { Args: { "": string }; Returns: string[] }
      dmetaphone: { Args: { "": string }; Returns: string }
      dmetaphone_alt: { Args: { "": string }; Returns: string }
      find_discrepencies: {
        Args: { ringing_group_filter?: number }
        Returns: {
          bird_id: number
          discrepency_type: string
          ring_no: string
          species_name: string
        }[]
      }
      fuzzy_search_rings: {
        Args: { q: string }
        Returns: {
          closeness_score: number
          ring_no: string
          species_name: string
        }[]
      }
      metrics_by_period_and_species: {
        Args: {
          filters?: Database["public"]["CompositeTypes"]["top_metrics_filter_params"]
          metric_name: string
          temporal_unit: string
        }
        Returns: {
          metric_value: number
          species_name: string
          visit_date: string
        }[]
      }
      most_caught_birds: {
        Args: {
          max_per_species?: number
          result_limit?: number
          ringing_group_filter?: number
          significance_threshold?: number
          species_filter?: string
          year_filter?: number
        }
        Returns: {
          encounter_count: number
          encounter_dates: string[]
          ring_no: string
          species_name: string
        }[]
      }
      soundex: { Args: { "": string }; Returns: string }
      text_soundex: { Args: { "": string }; Returns: string }
      top_metrics_by_period: {
        Args: {
          filters?: Database["public"]["CompositeTypes"]["top_metrics_filter_params"]
          metric_name: string
          result_limit: number
          temporal_unit: string
        }
        Returns: {
          metric_value: number
          visit_date: string
        }[]
      }
      top_metrics_by_species_and_period: {
        Args: {
          filters?: Database["public"]["CompositeTypes"]["top_metrics_filter_params"]
          metric_name: string
          result_limit: number
          temporal_unit: string
        }
        Returns: {
          metric_value: number
          species_name: string
          visit_date: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      top_metrics_filter_params: {
        month_filter: number | null
        year_filter: number | null
        exact_months_filter: string[] | null
        months_filter: number[] | null
        species_filter: string | null
        ringing_group_filter: number | null
      }
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

