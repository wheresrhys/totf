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
          proven_age: number
          ring_index: number | null
          ring_no: string
          ring_prefix: string | null
          ringing_group_ids: number[]
          species_id: number
        }
        Insert: {
          id?: number
          last_encountered_timestamp?: string
          proven_age?: number
          ring_index?: number | null
          ring_no: string
          ring_prefix?: string | null
          ringing_group_ids?: number[]
          species_id: number
        }
        Update: {
          id?: number
          last_encountered_timestamp?: string
          proven_age?: number
          ring_index?: number | null
          ring_no?: string
          ring_prefix?: string | null
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
          capture_method: string | null
          capture_time: string
          extra_text: string | null
          fat: string | null
          finding_circumstances: string | null
          finding_condition: string | null
          id: number
          is_juv: boolean
          lure_code_1: string | null
          lure_code_2: string | null
          max_hatch_year: number
          min_hatch_year: number
          moult_code: string | null
          old_greater_coverts: number | null
          pectoral_muscle: number | null
          primary_moult: string | null
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
          capture_method?: string | null
          capture_time: string
          extra_text?: string | null
          fat?: string | null
          finding_circumstances?: string | null
          finding_condition?: string | null
          id?: number
          is_juv?: boolean
          lure_code_1?: string | null
          lure_code_2?: string | null
          max_hatch_year: number
          min_hatch_year: number
          moult_code?: string | null
          old_greater_coverts?: number | null
          pectoral_muscle?: number | null
          primary_moult?: string | null
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
          capture_method?: string | null
          capture_time?: string
          extra_text?: string | null
          fat?: string | null
          finding_circumstances?: string | null
          finding_condition?: string | null
          id?: number
          is_juv?: boolean
          lure_code_1?: string | null
          lure_code_2?: string | null
          max_hatch_year?: number
          min_hatch_year?: number
          moult_code?: string | null
          old_greater_coverts?: number | null
          pectoral_muscle?: number | null
          primary_moult?: string | null
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
      GroupDataSharing: {
        Row: {
          created_at: string
          granter_group_id: number
          id: number
          recipient_group_id: number
        }
        Insert: {
          created_at?: string
          granter_group_id: number
          id?: number
          recipient_group_id: number
        }
        Update: {
          created_at?: string
          granter_group_id?: number
          id?: number
          recipient_group_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_data_sharing_granter_group_id_fkey"
            columns: ["granter_group_id"]
            isOneToOne: false
            referencedRelation: "RingingGroups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_data_sharing_recipient_group_id_fkey"
            columns: ["recipient_group_id"]
            isOneToOne: false
            referencedRelation: "RingingGroups"
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
          password_hash: string | null
          password_salt: string | null
          public_areas: string[]
          slug: string
        }
        Insert: {
          group_name: string
          id?: number
          password_hash?: string | null
          password_salt?: string | null
          public_areas?: string[]
          slug: string
        }
        Update: {
          group_name?: string
          id?: number
          password_hash?: string | null
          password_salt?: string | null
          public_areas?: string[]
          slug?: string
        }
        Relationships: []
      }
      RingSequences: {
        Row: {
          first_index: number | null
          first_ring: string | null
          id: number
          last_index: number | null
          last_ring: string | null
          owned_by_group: boolean
          prefix: string
          ringing_group_id: number
          size: Database["public"]["Enums"]["ring_size"] | null
        }
        Insert: {
          first_index?: number | null
          first_ring?: string | null
          id?: number
          last_index?: number | null
          last_ring?: string | null
          owned_by_group?: boolean
          prefix: string
          ringing_group_id: number
          size?: Database["public"]["Enums"]["ring_size"] | null
        }
        Update: {
          first_index?: number | null
          first_ring?: string | null
          id?: number
          last_index?: number | null
          last_ring?: string | null
          owned_by_group?: boolean
          prefix?: string
          ringing_group_id?: number
          size?: Database["public"]["Enums"]["ring_size"] | null
        }
        Relationships: [
          {
            foreignKeyName: "ring_sequences_ringing_group_id_fkey"
            columns: ["ringing_group_id"]
            isOneToOne: false
            referencedRelation: "RingingGroups"
            referencedColumns: ["id"]
          },
        ]
      }
      RingSequences_Birds: {
        Row: {
          bird_id: number
          id: number
          ring_sequence_id: number
          ringing_group_id: number
        }
        Insert: {
          bird_id: number
          id?: number
          ring_sequence_id: number
          ringing_group_id: number
        }
        Update: {
          bird_id?: number
          id?: number
          ring_sequence_id?: number
          ringing_group_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "ring_sequences_birds_bird_id_fkey"
            columns: ["bird_id"]
            isOneToOne: false
            referencedRelation: "Birds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ring_sequences_birds_ring_sequence_id_fkey"
            columns: ["ring_sequence_id"]
            isOneToOne: false
            referencedRelation: "RingSequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ring_sequences_birds_ringing_group_id_fkey"
            columns: ["ringing_group_id"]
            isOneToOne: false
            referencedRelation: "RingingGroups"
            referencedColumns: ["id"]
          },
        ]
      }
      Sessions: {
        Row: {
          id: number
          location_id: number
          ringing_group_id: number
          session_type: string
          visit_date: string
        }
        Insert: {
          id?: number
          location_id: number
          ringing_group_id: number
          session_type?: string
          visit_date: string
        }
        Update: {
          id?: number
          location_id?: number
          ringing_group_id?: number
          session_type?: string
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
      core_stats: {
        Args: {
          from_date?: string
          group_by_species?: boolean
          group_by_time_period?: string
          ringing_group_filter?: number
          species_name_filter?: string
          to_date?: string
        }
        Returns: Database["public"]["CompositeTypes"]["core_stats_result"][]
        SetofOptions: {
          from: "*"
          to: "core_stats_result"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      aggregate_stats: {
        Args: {
          from_date?: string
          group_by_species?: boolean
          group_by_time_period?: string
          ringing_group_filter?: number
          species_name_filter?: string
          to_date?: string
        }
        Returns: Database["public"]["CompositeTypes"]["aggregate_stats_result"][]
        SetofOptions: {
          from: "*"
          to: "aggregate_stats_result"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      biometrics_stats: {
        Args: {
          from_date?: string
          group_by_species?: boolean
          group_by_time_period?: string
          ringing_group_filter?: number
          species_name_filter?: string
          to_date?: string
        }
        Returns: Database["public"]["CompositeTypes"]["biometrics_stats_result"][]
        SetofOptions: {
          from: "*"
          to: "biometrics_stats_result"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      daitch_mokotoff: { Args: { "": string }; Returns: string[] }
      dmetaphone: { Args: { "": string }; Returns: string }
      dmetaphone_alt: { Args: { "": string }; Returns: string }
      find_discrepencies: {
        Args: { ringing_group_filter?: number }
        Returns: {
          bird_id: number
          discrepency_type: string
          last_encounter_date: string
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
      group_ticks: {
        Args: {
          location_filter?: number
          result_limit?: number
          ringing_group_filter?: number
        }
        Returns: {
          first_encounter_date: string
          species_name: string
        }[]
      }
      long_absence_retraps: {
        Args: {
          min_gap_days?: number
          ringing_group_filter: number
          session_date: string
        }
        Returns: {
          gap_days: number
          previous_date: string
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
      notable_retraps: {
        Args: {
          from_date?: string
          min_encounter_count?: number
          min_proven_age?: number
          result_limit?: number
          result_limit_per_species?: number
          ringing_group_filter?: number
          species_filter?: string
          to_date?: string
        }
        Returns: {
          encounter_count: number
          encounter_dates: string[]
          proven_age: number
          ring_no: string
          species_name: string
        }[]
      }
      population_stats: {
        Args: {
          from_date?: string
          group_by_species?: boolean
          group_by_time_period?: string
          ringing_group_filter?: number
          species_name_filter?: string
          to_date?: string
        }
        Returns: Database["public"]["CompositeTypes"]["population_stats_result"][]
        SetofOptions: {
          from: "*"
          to: "population_stats_result"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      public_core_stats: {
        Args: {
          from_date?: string
          group_by_species?: boolean
          group_by_time_period?: string
          ringing_group_filter?: number
          species_name_filter?: string
          to_date?: string
        }
        Returns: Database["public"]["CompositeTypes"]["core_stats_result"][]
        SetofOptions: {
          from: "*"
          to: "core_stats_result"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      public_aggregate_stats: {
        Args: {
          from_date?: string
          group_by_species?: boolean
          group_by_time_period?: string
          ringing_group_filter?: number
          species_name_filter?: string
          to_date?: string
        }
        Returns: Database["public"]["CompositeTypes"]["aggregate_stats_result"][]
        SetofOptions: {
          from: "*"
          to: "aggregate_stats_result"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      ring_sequence_controls: {
        Args: { ringing_group_filter?: number }
        Returns: {
          first_date: string
          ring_no: string
          species_name: string
        }[]
      }
      soundex: { Args: { "": string }; Returns: string }
      stats_bird_age_bucket: {
        Args: {
          from_date?: string
          group_by_species?: boolean
          group_by_time_period?: string
          ringing_group_filter?: number
          species_name_filter?: string
          to_date?: string
        }
        Returns: {
          age_bucket: string
          bird_id: number
          has_new: boolean
          species_id: number
          time_period: string
        }[]
      }
      stats_encounter_age_classification: {
        Args: {
          from_date?: string
          group_by_species?: boolean
          group_by_time_period?: string
          ringing_group_filter?: number
          species_name_filter?: string
          to_date?: string
        }
        Returns: {
          age_bucket: string
          age_code: number
          bird_id: number
          encounter_id: number
          is_juv: boolean
          record_type: string
          species_id: number
          time_period: string
          visit_date: string
        }[]
      }
      stats_per_day_and_species: {
        Args: { ringing_group_filter: number }
        Returns: {
          encounter_count: number
          juv_count: number
          max_weight: number
          min_weight: number
          postjuv_count: number
          pullus_count: number
          species_name: string
          visit_date: string
          weighed_birds_count: number
        }[]
      }
      stats_raw_encounters: {
        Args: {
          from_date?: string
          ringing_group_filter?: number
          species_name_filter?: string
          to_date?: string
        }
        Returns: {
          age_code: number
          bird_id: number
          capture_time: string
          encounter_id: number
          is_juv: boolean
          max_hatch_year: number
          record_type: string
          ring_no: string
          session_day: string
          session_id: number
          session_month: string
          session_type: string
          session_year: string
          species_id: number
          species_name: string
          visit_date: string
          weight: number
          wing_length: number
        }[]
      }
      stats_spine: {
        Args: {
          from_date?: string
          group_by_species?: boolean
          group_by_time_period?: string
          ringing_group_filter?: number
          species_name_filter?: string
          to_date?: string
        }
        Returns: {
          species_id: number
          species_name: string
          time_period: string
        }[]
      }
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
      ring_size:
        | "AA"
        | "A"
        | "A2"
        | "B"
        | "B+"
        | "B2"
        | "SO"
        | "C"
        | "C2"
        | "CC"
        | "D2"
        | "E"
        | "Fc"
        | "Fv"
        | "G"
        | "H"
        | "J"
        | "K"
        | "L"
        | "L+"
        | "MI"
        | "MS"
    }
    CompositeTypes: {
      core_stats_result: {
        species_name: string | null
        time_period: string | null
        session_count: number | null
        total_effort: string | null
        effort_per_session: string | null
        effort_per_encounter: string | null
        avg_encounters_per_session: number | null
        max_per_session: number | null
        species_count: number | null
        bird_count: number | null
        encounter_count: number | null
        new_bird_count: number | null
        pullus_bird_count: number | null
        juv_bird_count: number | null
        postjuv_bird_count: number | null
        adult_bird_count: number | null
        unknown_age_bird_count: number | null
        pullus_enc_count: number | null
        juv_enc_count: number | null
        postjuv_enc_count: number | null
        adult_enc_count: number | null
        unknown_age_enc_count: number | null
        max_new_per_session: number | null
      }
      aggregate_stats_result: {
        species_name: string | null
        time_period: string | null
        session_count: number | null
        total_effort: string | null
        effort_per_session: string | null
        effort_per_encounter: string | null
        avg_encounters_per_session: number | null
        max_per_session: number | null
        species_count: number | null
        bird_count: number | null
        encounter_count: number | null
        new_bird_count: number | null
        pullus_bird_count: number | null
        juv_bird_count: number | null
        postjuv_bird_count: number | null
        adult_bird_count: number | null
        unknown_age_bird_count: number | null
        pullus_enc_count: number | null
        juv_enc_count: number | null
        postjuv_enc_count: number | null
        adult_enc_count: number | null
        unknown_age_enc_count: number | null
        max_new_per_session: number | null
      }
      biometrics_stats_result: {
        species_name: string | null
        time_period: string | null
        max_weight: number | null
        avg_weight: number | null
        min_weight: number | null
        median_weight: number | null
        max_wing: number | null
        avg_wing: number | null
        min_wing: number | null
        median_wing: number | null
      }
      population_stats_result: {
        species_name: string | null
        time_period: string | null
        adult_bird_count: number | null
        juv_bird_count: number | null
        juv_enc_count: number | null
        postjuv_enc_count: number | null
        new_young_bird_count: number | null
        new_adult_bird_count: number | null
        first_summer_bird_count: number | null
        postjuv_juv_enc_count: number | null
        new_postjuv_juv_enc_count: number | null
        new_postjuv_enc_count: number | null
        old_timers_bird_count: number | null
      }
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
    Enums: {
      ring_size: [
        "AA",
        "A",
        "A2",
        "B",
        "B+",
        "B2",
        "SO",
        "C",
        "C2",
        "CC",
        "D2",
        "E",
        "Fc",
        "Fv",
        "G",
        "H",
        "J",
        "K",
        "L",
        "L+",
        "MI",
        "MS",
      ],
    },
  },
} as const

