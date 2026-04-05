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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      assignments: {
        Row: {
          assessment_metadata: Json | null
          assessment_type: Database["public"]["Enums"]["assessment_type"] | null
          assignment_title: string
          class_name: string
          difficulty_analyzed_at: string | null
          difficulty_level: string | null
          due_date: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          irt_parameters: Json | null
          knowledge_dependencies: string[] | null
          learning_objectives: string[] | null
          parsed_content: string | null
          uploaded_at: string
          user_id: string
        }
        Insert: {
          assessment_metadata?: Json | null
          assessment_type?:
            | Database["public"]["Enums"]["assessment_type"]
            | null
          assignment_title: string
          class_name: string
          difficulty_analyzed_at?: string | null
          difficulty_level?: string | null
          due_date?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          irt_parameters?: Json | null
          knowledge_dependencies?: string[] | null
          learning_objectives?: string[] | null
          parsed_content?: string | null
          uploaded_at?: string
          user_id: string
        }
        Update: {
          assessment_metadata?: Json | null
          assessment_type?:
            | Database["public"]["Enums"]["assessment_type"]
            | null
          assignment_title?: string
          class_name?: string
          difficulty_analyzed_at?: string | null
          difficulty_level?: string | null
          due_date?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          irt_parameters?: Json | null
          knowledge_dependencies?: string[] | null
          learning_objectives?: string[] | null
          parsed_content?: string | null
          uploaded_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      bias_audits: {
        Row: {
          auto_fixed: boolean
          content_id: string
          created_at: string
          flags: Json
          gender_score: number
          id: string
          language_score: number
          overall_score: number
          racial_score: number
          socioeconomic_score: number
          status: string
          suggestions: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_fixed?: boolean
          content_id: string
          created_at?: string
          flags?: Json
          gender_score?: number
          id?: string
          language_score?: number
          overall_score?: number
          racial_score?: number
          socioeconomic_score?: number
          status?: string
          suggestions?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_fixed?: boolean
          content_id?: string
          created_at?: string
          flags?: Json
          gender_score?: number
          id?: string
          language_score?: number
          overall_score?: number
          racial_score?: number
          socioeconomic_score?: number
          status?: string
          suggestions?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          created_at: string | null
          description: string | null
          end_time: string | null
          event_date: string
          event_type: string | null
          id: string
          start_time: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          end_time?: string | null
          event_date: string
          event_type?: string | null
          id?: string
          start_time?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          end_time?: string | null
          event_date?: string
          event_type?: string | null
          id?: string
          start_time?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      consent_records: {
        Row: {
          consent_type: string
          consent_version: string
          granted: boolean
          granted_at: string
          id: string
          metadata: Json | null
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          consent_type: string
          consent_version?: string
          granted?: boolean
          granted_at?: string
          id?: string
          metadata?: Json | null
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          consent_type?: string
          consent_version?: string
          granted?: boolean
          granted_at?: string
          id?: string
          metadata?: Json | null
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      content_reviews: {
        Row: {
          accuracy_score: number | null
          alignment_score: number | null
          bloom_match_score: number | null
          content_id: string
          created_at: string
          id: string
          inclusivity_score: number | null
          inline_annotations: Json | null
          objectives_covered: number | null
          objectives_total: number | null
          overall_comments: string | null
          pedagogy_score: number | null
          reviewer_id: string
          revision_notes: string | null
          status: string
          syllabus_objectives_checked: string[] | null
          updated_at: string
        }
        Insert: {
          accuracy_score?: number | null
          alignment_score?: number | null
          bloom_match_score?: number | null
          content_id: string
          created_at?: string
          id?: string
          inclusivity_score?: number | null
          inline_annotations?: Json | null
          objectives_covered?: number | null
          objectives_total?: number | null
          overall_comments?: string | null
          pedagogy_score?: number | null
          reviewer_id: string
          revision_notes?: string | null
          status?: string
          syllabus_objectives_checked?: string[] | null
          updated_at?: string
        }
        Update: {
          accuracy_score?: number | null
          alignment_score?: number | null
          bloom_match_score?: number | null
          content_id?: string
          created_at?: string
          id?: string
          inclusivity_score?: number | null
          inline_annotations?: Json | null
          objectives_covered?: number | null
          objectives_total?: number | null
          overall_comments?: string | null
          pedagogy_score?: number | null
          reviewer_id?: string
          revision_notes?: string | null
          status?: string
          syllabus_objectives_checked?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      course_content: {
        Row: {
          bloom_level: string | null
          class_name: string
          created_at: string
          exercises: Json | null
          generation_status: string
          id: string
          lesson_content: string | null
          quiz_questions: Json | null
          study_resources: Json | null
          topic: string
          topic_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bloom_level?: string | null
          class_name: string
          created_at?: string
          exercises?: Json | null
          generation_status?: string
          id?: string
          lesson_content?: string | null
          quiz_questions?: Json | null
          study_resources?: Json | null
          topic: string
          topic_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bloom_level?: string | null
          class_name?: string
          created_at?: string
          exercises?: Json | null
          generation_status?: string
          id?: string
          lesson_content?: string | null
          quiz_questions?: Json | null
          study_resources?: Json | null
          topic?: string
          topic_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      course_textbooks: {
        Row: {
          author: string | null
          class_name: string
          created_at: string
          id: string
          isbn: string | null
          requirement_type: string
          source: string
          title: string
          user_id: string
        }
        Insert: {
          author?: string | null
          class_name: string
          created_at?: string
          id?: string
          isbn?: string | null
          requirement_type?: string
          source?: string
          title: string
          user_id: string
        }
        Update: {
          author?: string | null
          class_name?: string
          created_at?: string
          id?: string
          isbn?: string | null
          requirement_type?: string
          source?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      generated_resources: {
        Row: {
          content: string
          created_at: string
          id: string
          learning_styles: string[]
          resource_title: string
          resource_type: string
          topic: string
          updated_at: string
          usage_count: number | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          learning_styles: string[]
          resource_title: string
          resource_type: string
          topic: string
          updated_at?: string
          usage_count?: number | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          learning_styles?: string[]
          resource_title?: string
          resource_type?: string
          topic?: string
          updated_at?: string
          usage_count?: number | null
        }
        Relationships: []
      }
      learning_resources: {
        Row: {
          content: string
          created_at: string | null
          difficulty_level: string | null
          id: string
          resource_type: string
          subject: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          difficulty_level?: string | null
          id?: string
          resource_type: string
          subject?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          difficulty_level?: string | null
          id?: string
          resource_type?: string
          subject?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      practice_history: {
        Row: {
          class_name: string
          completed_at: string
          id: string
          metadata: Json | null
          practice_type: string
          score: number | null
          topics_practiced: string[] | null
          total: number | null
          user_id: string
        }
        Insert: {
          class_name: string
          completed_at?: string
          id?: string
          metadata?: Json | null
          practice_type: string
          score?: number | null
          topics_practiced?: string[] | null
          total?: number | null
          user_id: string
        }
        Update: {
          class_name?: string
          completed_at?: string
          id?: string
          metadata?: Json | null
          practice_type?: string
          score?: number | null
          topics_practiced?: string[] | null
          total?: number | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          canvas_access_token: string | null
          canvas_connected_at: string | null
          canvas_domain: string | null
          canvas_refresh_token: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          learning_styles: string[] | null
          university_id: string | null
          updated_at: string | null
        }
        Insert: {
          canvas_access_token?: string | null
          canvas_connected_at?: string | null
          canvas_domain?: string | null
          canvas_refresh_token?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          learning_styles?: string[] | null
          university_id?: string | null
          updated_at?: string | null
        }
        Update: {
          canvas_access_token?: string | null
          canvas_connected_at?: string | null
          canvas_domain?: string | null
          canvas_refresh_token?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          learning_styles?: string[] | null
          university_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_results: {
        Row: {
          class_name: string
          completed_objectives: number[] | null
          created_at: string
          id: string
          objectives: Json | null
          resources: Json | null
          score: number
          strong_areas: string[]
          total_questions: number
          updated_at: string
          user_id: string
          weak_areas: string[]
        }
        Insert: {
          class_name: string
          completed_objectives?: number[] | null
          created_at?: string
          id?: string
          objectives?: Json | null
          resources?: Json | null
          score: number
          strong_areas?: string[]
          total_questions: number
          updated_at?: string
          user_id: string
          weak_areas?: string[]
        }
        Update: {
          class_name?: string
          completed_objectives?: number[] | null
          created_at?: string
          id?: string
          objectives?: Json | null
          resources?: Json | null
          score?: number
          strong_areas?: string[]
          total_questions?: number
          updated_at?: string
          user_id?: string
          weak_areas?: string[]
        }
        Relationships: []
      }
      study_focus_areas: {
        Row: {
          class_name: string
          created_at: string
          estimated_time_minutes: number | null
          id: string
          is_unlocked: boolean
          quiz_passed: boolean
          quiz_score: number | null
          quiz_threshold: number
          topic: string
          topic_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          class_name: string
          created_at?: string
          estimated_time_minutes?: number | null
          id?: string
          is_unlocked?: boolean
          quiz_passed?: boolean
          quiz_score?: number | null
          quiz_threshold?: number
          topic: string
          topic_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          class_name?: string
          created_at?: string
          estimated_time_minutes?: number | null
          id?: string
          is_unlocked?: boolean
          quiz_passed?: boolean
          quiz_score?: number | null
          quiz_threshold?: number
          topic?: string
          topic_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      study_modules: {
        Row: {
          completed_at: string | null
          content: string | null
          created_at: string
          description: string | null
          estimated_time_minutes: number | null
          focus_area_id: string
          id: string
          is_completed: boolean
          module_order: number
          module_type: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          content?: string | null
          created_at?: string
          description?: string | null
          estimated_time_minutes?: number | null
          focus_area_id: string
          id?: string
          is_completed?: boolean
          module_order?: number
          module_type?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          content?: string | null
          created_at?: string
          description?: string | null
          estimated_time_minutes?: number | null
          focus_area_id?: string
          id?: string
          is_completed?: boolean
          module_order?: number
          module_type?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_modules_focus_area_id_fkey"
            columns: ["focus_area_id"]
            isOneToOne: false
            referencedRelation: "study_focus_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      syllabi: {
        Row: {
          bloom_classifications: Json | null
          class_name: string
          course_description: string | null
          file_name: string
          file_path: string
          file_size: number | null
          grading_policy: Json | null
          id: string
          learning_objectives: string[] | null
          parsed_at: string | null
          parsed_content: string | null
          required_materials: string[] | null
          uploaded_at: string
          user_id: string
          weekly_schedule: Json | null
        }
        Insert: {
          bloom_classifications?: Json | null
          class_name: string
          course_description?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          grading_policy?: Json | null
          id?: string
          learning_objectives?: string[] | null
          parsed_at?: string | null
          parsed_content?: string | null
          required_materials?: string[] | null
          uploaded_at?: string
          user_id: string
          weekly_schedule?: Json | null
        }
        Update: {
          bloom_classifications?: Json | null
          class_name?: string
          course_description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          grading_policy?: Json | null
          id?: string
          learning_objectives?: string[] | null
          parsed_at?: string | null
          parsed_content?: string | null
          required_materials?: string[] | null
          uploaded_at?: string
          user_id?: string
          weekly_schedule?: Json | null
        }
        Relationships: []
      }
      transit_arrivals: {
        Row: {
          created_at: string
          data_source: string
          estimated_minutes: number
          id: string
          predicted_arrival_time: string
          route_id: string
          status: string
          stop_id: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          data_source?: string
          estimated_minutes?: number
          id?: string
          predicted_arrival_time: string
          route_id: string
          status?: string
          stop_id: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          data_source?: string
          estimated_minutes?: number
          id?: string
          predicted_arrival_time?: string
          route_id?: string
          status?: string
          stop_id?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transit_arrivals_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transit_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transit_arrivals_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "transit_stops"
            referencedColumns: ["id"]
          },
        ]
      }
      transit_routes: {
        Row: {
          color: string
          created_at: string
          days_of_week: string[]
          frequency_minutes: number
          id: string
          is_active: boolean
          operating_hours: string
          route_name: string
          route_type: string
          university_id: string | null
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          days_of_week?: string[]
          frequency_minutes?: number
          id?: string
          is_active?: boolean
          operating_hours?: string
          route_name: string
          route_type?: string
          university_id?: string | null
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          days_of_week?: string[]
          frequency_minutes?: number
          id?: string
          is_active?: boolean
          operating_hours?: string
          route_name?: string
          route_type?: string
          university_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transit_routes_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      transit_stops: {
        Row: {
          arrival_offset_minutes: number
          created_at: string
          id: string
          latitude: number
          longitude: number
          route_id: string
          stop_name: string
          stop_order: number
        }
        Insert: {
          arrival_offset_minutes?: number
          created_at?: string
          id?: string
          latitude: number
          longitude: number
          route_id: string
          stop_name: string
          stop_order?: number
        }
        Update: {
          arrival_offset_minutes?: number
          created_at?: string
          id?: string
          latitude?: number
          longitude?: number
          route_id?: string
          stop_name?: string
          stop_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "transit_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transit_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      universities: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_classes: {
        Row: {
          class_name: string
          created_at: string | null
          id: string
          is_archived: boolean
          professor: string | null
          semester: string | null
          user_id: string
          year: number | null
        }
        Insert: {
          class_name: string
          created_at?: string | null
          id?: string
          is_archived?: boolean
          professor?: string | null
          semester?: string | null
          user_id: string
          year?: number | null
        }
        Update: {
          class_name?: string
          created_at?: string | null
          id?: string
          is_archived?: boolean
          professor?: string | null
          semester?: string | null
          user_id?: string
          year?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      assessment_type:
        | "summative"
        | "formative"
        | "pre_assessment"
        | "benchmark"
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
    Enums: {
      assessment_type: [
        "summative",
        "formative",
        "pre_assessment",
        "benchmark",
      ],
    },
  },
} as const
