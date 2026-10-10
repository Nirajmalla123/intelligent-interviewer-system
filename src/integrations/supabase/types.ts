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
      answers: {
        Row: {
          analysis_error: string | null
          analysis_status: Database["public"]["Enums"]["analysis_status"]
          candidate_id: string
          created_at: string
          duration_seconds: number
          id: string
          interview_id: string
          question_id: string
          updated_at: string
          video_path: string | null
        }
        Insert: {
          analysis_error?: string | null
          analysis_status?: Database["public"]["Enums"]["analysis_status"]
          candidate_id: string
          created_at?: string
          duration_seconds?: number
          id?: string
          interview_id: string
          question_id: string
          updated_at?: string
          video_path?: string | null
        }
        Update: {
          analysis_error?: string | null
          analysis_status?: Database["public"]["Enums"]["analysis_status"]
          candidate_id?: string
          created_at?: string
          duration_seconds?: number
          id?: string
          interview_id?: string
          question_id?: string
          updated_at?: string
          video_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "answers_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      emotion_analysis: {
        Row: {
          angry: number
          answer_id: string
          created_at: string
          dominant_emotion: string
          fear: number
          happy: number
          id: string
          neutral: number
          sad: number
          surprise: number
        }
        Insert: {
          angry?: number
          answer_id: string
          created_at?: string
          dominant_emotion?: string
          fear?: number
          happy?: number
          id?: string
          neutral?: number
          sad?: number
          surprise?: number
        }
        Update: {
          angry?: number
          answer_id?: string
          created_at?: string
          dominant_emotion?: string
          fear?: number
          happy?: number
          id?: string
          neutral?: number
          sad?: number
          surprise?: number
        }
        Relationships: [
          {
            foreignKeyName: "emotion_analysis_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: true
            referencedRelation: "answers"
            referencedColumns: ["id"]
          },
        ]
      }
      face_analysis: {
        Row: {
          answer_id: string
          blink_rate_per_min: number
          created_at: string
          eye_contact_ratio: number
          face_detected_ratio: number
          head_stability: number
          id: string
          landmark_samples: number
          pitch_avg: number
          yaw_avg: number
        }
        Insert: {
          answer_id: string
          blink_rate_per_min?: number
          created_at?: string
          eye_contact_ratio?: number
          face_detected_ratio?: number
          head_stability?: number
          id?: string
          landmark_samples?: number
          pitch_avg?: number
          yaw_avg?: number
        }
        Update: {
          answer_id?: string
          blink_rate_per_min?: number
          created_at?: string
          eye_contact_ratio?: number
          face_detected_ratio?: number
          head_stability?: number
          id?: string
          landmark_samples?: number
          pitch_avg?: number
          yaw_avg?: number
        }
        Relationships: [
          {
            foreignKeyName: "face_analysis_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: true
            referencedRelation: "answers"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_verifications: {
        Row: {
          confidence: number
          created_at: string
          id: string
          matched: boolean
          reason: string | null
          user_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          id?: string
          matched: boolean
          reason?: string | null
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          matched?: boolean
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      interview_scores: {
        Row: {
          communication_score: number
          confidence_score: number
          created_at: string
          emotion_score: number
          eye_contact_score: number
          grammar_score: number
          id: string
          interview_id: string
          overall_score: number
          technical_score: number
          updated_at: string
          voice_score: number
        }
        Insert: {
          communication_score?: number
          confidence_score?: number
          created_at?: string
          emotion_score?: number
          eye_contact_score?: number
          grammar_score?: number
          id?: string
          interview_id: string
          overall_score?: number
          technical_score?: number
          updated_at?: string
          voice_score?: number
        }
        Update: {
          communication_score?: number
          confidence_score?: number
          created_at?: string
          emotion_score?: number
          eye_contact_score?: number
          grammar_score?: number
          id?: string
          interview_id?: string
          overall_score?: number
          technical_score?: number
          updated_at?: string
          voice_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "interview_scores_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: true
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          candidate_id: string
          completed_at: string | null
          created_at: string
          id: string
          job_role: string
          planned_questions: number
          seniority: string
          started_at: string
          status: Database["public"]["Enums"]["interview_status"]
          updated_at: string
        }
        Insert: {
          candidate_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          job_role: string
          planned_questions?: number
          seniority?: string
          started_at?: string
          status?: Database["public"]["Enums"]["interview_status"]
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          job_role?: string
          planned_questions?: number
          seniority?: string
          started_at?: string
          status?: Database["public"]["Enums"]["interview_status"]
          updated_at?: string
        }
        Relationships: []
      }
      llm_evaluations: {
        Row: {
          answer_id: string
          communication_score: number
          created_at: string
          evaluation: string
          follow_up_question: string | null
          grammar_score: number
          id: string
          model: string
          provider: string
          relevance_score: number
          strengths: Json
          technical_score: number
          weaknesses: Json
        }
        Insert: {
          answer_id: string
          communication_score?: number
          created_at?: string
          evaluation?: string
          follow_up_question?: string | null
          grammar_score?: number
          id?: string
          model?: string
          provider?: string
          relevance_score?: number
          strengths?: Json
          technical_score?: number
          weaknesses?: Json
        }
        Update: {
          answer_id?: string
          communication_score?: number
          created_at?: string
          evaluation?: string
          follow_up_question?: string | null
          grammar_score?: number
          id?: string
          model?: string
          provider?: string
          relevance_score?: number
          strengths?: Json
          technical_score?: number
          weaknesses?: Json
        }
        Relationships: [
          {
            foreignKeyName: "llm_evaluations_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: true
            referencedRelation: "answers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          headline: string | null
          id: string
          location: string | null
          phone: string | null
          target_role: string | null
          updated_at: string
          years_experience: number
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          headline?: string | null
          id: string
          location?: string | null
          phone?: string | null
          target_role?: string | null
          updated_at?: string
          years_experience?: number
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          headline?: string | null
          id?: string
          location?: string | null
          phone?: string | null
          target_role?: string | null
          updated_at?: string
          years_experience?: number
        }
        Relationships: []
      }
      questions: {
        Row: {
          category: string
          created_at: string
          id: string
          interview_id: string
          is_followup: boolean
          order_index: number
          parent_question_id: string | null
          text: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          interview_id: string
          is_followup?: boolean
          order_index?: number
          parent_question_id?: string | null
          text: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          interview_id?: string
          is_followup?: boolean
          order_index?: number
          parent_question_id?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_parent_question_id_fkey"
            columns: ["parent_question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          chart_data: Json
          created_at: string
          id: string
          interview_id: string
          recommendation: string
          strengths: Json
          summary: string
          weaknesses: Json
        }
        Insert: {
          chart_data?: Json
          created_at?: string
          id?: string
          interview_id: string
          recommendation?: string
          strengths?: Json
          summary?: string
          weaknesses?: Json
        }
        Update: {
          chart_data?: Json
          created_at?: string
          id?: string
          interview_id?: string
          recommendation?: string
          strengths?: Json
          summary?: string
          weaknesses?: Json
        }
        Relationships: [
          {
            foreignKeyName: "reports_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: true
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      resumes: {
        Row: {
          created_at: string
          extracted_text: string | null
          file_name: string
          file_path: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          extracted_text?: string | null
          file_name: string
          file_path: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          extracted_text?: string | null
          file_name?: string
          file_path?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      speech_analysis: {
        Row: {
          answer_id: string
          confidence: number | null
          created_at: string
          id: string
          language: string | null
          speech_duration_seconds: number | null
          transcript: string
          word_count: number
        }
        Insert: {
          answer_id: string
          confidence?: number | null
          created_at?: string
          id?: string
          language?: string | null
          speech_duration_seconds?: number | null
          transcript?: string
          word_count?: number
        }
        Update: {
          answer_id?: string
          confidence?: number | null
          created_at?: string
          id?: string
          language?: string | null
          speech_duration_seconds?: number | null
          transcript?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "speech_analysis_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: true
            referencedRelation: "answers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      voice_analysis: {
        Row: {
          answer_id: string
          created_at: string
          energy_rms: number
          id: string
          pause_count: number
          pitch_hz: number
          pitch_variance: number
          speech_rate_wpm: number
          total_pause_seconds: number
          voice_confidence: number
          volume_db: number
        }
        Insert: {
          answer_id: string
          created_at?: string
          energy_rms?: number
          id?: string
          pause_count?: number
          pitch_hz?: number
          pitch_variance?: number
          speech_rate_wpm?: number
          total_pause_seconds?: number
          voice_confidence?: number
          volume_db?: number
        }
        Update: {
          answer_id?: string
          created_at?: string
          energy_rms?: number
          id?: string
          pause_count?: number
          pitch_hz?: number
          pitch_variance?: number
          speech_rate_wpm?: number
          total_pause_seconds?: number
          voice_confidence?: number
          volume_db?: number
        }
        Relationships: [
          {
            foreignKeyName: "voice_analysis_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: true
            referencedRelation: "answers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      owns_answer: { Args: { _answer_id: string }; Returns: boolean }
      owns_interview: { Args: { _interview_id: string }; Returns: boolean }
    }
    Enums: {
      analysis_status: "pending" | "processing" | "complete" | "failed"
      app_role: "candidate" | "admin"
      interview_status: "in_progress" | "completed" | "abandoned"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      analysis_status: ["pending", "processing", "complete", "failed"],
      app_role: ["candidate", "admin"],
      interview_status: ["in_progress", "completed", "abandoned"],
    },
  },
} as const
