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
    PostgrestVersion: "14.4"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
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
      course_events: {
        Row: {
          created_at: string | null
          description: string | null
          end_date: string | null
          event_type: string
          id: string
          start_date: string | null
          syllabus_id: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          event_type: string
          id?: string
          start_date?: string | null
          syllabus_id: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          event_type?: string
          id?: string
          start_date?: string | null
          syllabus_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_events_syllabus_id_fkey"
            columns: ["syllabus_id"]
            isOneToOne: false
            referencedRelation: "syllabi"
            referencedColumns: ["id"]
          },
        ]
      }
      course_textbooks: {
        Row: {
          author: string | null
          created_at: string | null
          edition: string | null
          id: string
          is_required: boolean | null
          isbn: string | null
          syllabus_id: string
          title: string
          user_id: string
        }
        Insert: {
          author?: string | null
          created_at?: string | null
          edition?: string | null
          id?: string
          is_required?: boolean | null
          isbn?: string | null
          syllabus_id: string
          title: string
          user_id: string
        }
        Update: {
          author?: string | null
          created_at?: string | null
          edition?: string | null
          id?: string
          is_required?: boolean | null
          isbn?: string | null
          syllabus_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_textbooks_syllabus_id_fkey"
            columns: ["syllabus_id"]
            isOneToOne: false
            referencedRelation: "syllabi"
            referencedColumns: ["id"]
          },
        ]
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
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          university_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          university_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
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
      syllabi: {
        Row: {
          class_id: string | null
          content: string
          file_name: string | null
          id: string
          is_archived: boolean
          processed: boolean | null
          title: string
          topics_extracted: Json | null
          uploaded_at: string
          user_id: string
        }
        Insert: {
          class_id?: string | null
          content: string
          file_name?: string | null
          id?: string
          is_archived?: boolean
          processed?: boolean | null
          title: string
          topics_extracted?: Json | null
          uploaded_at?: string
          user_id: string
        }
        Update: {
          class_id?: string | null
          content?: string
          file_name?: string | null
          id?: string
          is_archived?: boolean
          processed?: boolean | null
          title?: string
          topics_extracted?: Json | null
          uploaded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "syllabi_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "user_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      syllabus_topics: {
        Row: {
          blooms_taxonomy_level: string | null
          created_at: string | null
          description: string | null
          end_date: string | null
          id: string
          learning_objectives: Json | null
          mastery_percent: number | null
          module_title: string | null
          start_date: string | null
          subtopics: Json | null
          syllabus_id: string
          textbook_chapters: Json | null
          title: string
          topic_order: number
          user_id: string
          week_number: number | null
        }
        Insert: {
          blooms_taxonomy_level?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          learning_objectives?: Json | null
          mastery_percent?: number | null
          module_title?: string | null
          start_date?: string | null
          subtopics?: Json | null
          syllabus_id: string
          textbook_chapters?: Json | null
          title: string
          topic_order?: number
          user_id: string
          week_number?: number | null
        }
        Update: {
          blooms_taxonomy_level?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          learning_objectives?: Json | null
          mastery_percent?: number | null
          module_title?: string | null
          start_date?: string | null
          subtopics?: Json | null
          syllabus_id?: string
          textbook_chapters?: Json | null
          title?: string
          topic_order?: number
          user_id?: string
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "syllabus_topics_syllabus_id_fkey"
            columns: ["syllabus_id"]
            isOneToOne: false
            referencedRelation: "syllabi"
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
          professor: string | null
          semester: string | null
          user_id: string
          year: number | null
        }
        Insert: {
          class_name: string
          created_at?: string | null
          id?: string
          professor?: string | null
          semester?: string | null
          user_id: string
          year?: number | null
        }
        Update: {
          class_name?: string
          created_at?: string | null
          id?: string
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
