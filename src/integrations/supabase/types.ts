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
      access_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          created_at: string
          details: Json | null
          id: string
          target_email: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_email?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_email?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      admin_requests: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      affiliate_earnings: {
        Row: {
          amount: number
          created_at: string
          earned_on: string
          id: string
          notes: string | null
          paid_on: string | null
          program_id: string
          reference: string | null
          status: string
        }
        Insert: {
          amount?: number
          created_at?: string
          earned_on?: string
          id?: string
          notes?: string | null
          paid_on?: string | null
          program_id: string
          reference?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          earned_on?: string
          id?: string
          notes?: string | null
          paid_on?: string | null
          program_id?: string
          reference?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_earnings_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "affiliate_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_programs: {
        Row: {
          affiliate_id: string | null
          commission_rate: number | null
          commission_type: string
          created_at: string
          id: string
          name: string
          network: string | null
          notes: string | null
          referral_link: string | null
          status: string
          updated_at: string
        }
        Insert: {
          affiliate_id?: string | null
          commission_rate?: number | null
          commission_type?: string
          created_at?: string
          id?: string
          name: string
          network?: string | null
          notes?: string | null
          referral_link?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          affiliate_id?: string | null
          commission_rate?: number | null
          commission_type?: string
          created_at?: string
          id?: string
          name?: string
          network?: string | null
          notes?: string | null
          referral_link?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_kv: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          id: number
          markup_multiplier: number
          revision_lock_days: number
          updated_at: string
        }
        Insert: {
          id?: number
          markup_multiplier?: number
          revision_lock_days?: number
          updated_at?: string
        }
        Update: {
          id?: number
          markup_multiplier?: number
          revision_lock_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      brand_assets: {
        Row: {
          active: boolean
          asset_type: string
          asset_url: string
          created_at: string
          id: string
          notes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          asset_type: string
          asset_url: string
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          asset_type?: string
          asset_url?: string
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      brand_config: {
        Row: {
          accent_color: string | null
          background_color: string | null
          brand_display_name: string
          brand_name: string
          id: number
          primary_color: string | null
          secondary_color: string | null
          text_color: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accent_color?: string | null
          background_color?: string | null
          brand_display_name?: string
          brand_name?: string
          id?: number
          primary_color?: string | null
          secondary_color?: string | null
          text_color?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accent_color?: string | null
          background_color?: string | null
          brand_display_name?: string
          brand_name?: string
          id?: number
          primary_color?: string | null
          secondary_color?: string | null
          text_color?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      brand_config_history: {
        Row: {
          accent_color: string | null
          background_color: string | null
          brand_display_name: string
          brand_name: string
          change_note: string | null
          changed_at: string
          changed_by: string | null
          id: string
          primary_color: string | null
          secondary_color: string | null
          text_color: string | null
        }
        Insert: {
          accent_color?: string | null
          background_color?: string | null
          brand_display_name: string
          brand_name: string
          change_note?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          primary_color?: string | null
          secondary_color?: string | null
          text_color?: string | null
        }
        Update: {
          accent_color?: string | null
          background_color?: string | null
          brand_display_name?: string
          brand_name?: string
          change_note?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          primary_color?: string | null
          secondary_color?: string | null
          text_color?: string | null
        }
        Relationships: []
      }
      change_impact_analyses: {
        Row: {
          audit_export_id: string | null
          change_description: string
          executed_at: string
          executed_by: string | null
          id: string
          output_content: string
          output_filename: string
          prompt_version: string
        }
        Insert: {
          audit_export_id?: string | null
          change_description: string
          executed_at?: string
          executed_by?: string | null
          id?: string
          output_content: string
          output_filename: string
          prompt_version: string
        }
        Update: {
          audit_export_id?: string | null
          change_description?: string
          executed_at?: string
          executed_by?: string | null
          id?: string
          output_content?: string
          output_filename?: string
          prompt_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_impact_analyses_audit_export_id_fkey"
            columns: ["audit_export_id"]
            isOneToOne: false
            referencedRelation: "project_audit_exports"
            referencedColumns: ["id"]
          },
        ]
      }
      change_log_entries: {
        Row: {
          archived: boolean
          archived_at: string | null
          author_email: string | null
          author_user_id: string | null
          auto_generated: boolean
          created_at: string
          id: string
          linked_audit_event_ids: string[]
          status: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          archived_at?: string | null
          author_email?: string | null
          author_user_id?: string | null
          auto_generated?: boolean
          created_at?: string
          id?: string
          linked_audit_event_ids?: string[]
          status?: string
          summary?: string
          title: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          archived_at?: string | null
          author_email?: string | null
          author_user_id?: string | null
          auto_generated?: boolean
          created_at?: string
          id?: string
          linked_audit_event_ids?: string[]
          status?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      competitor_quote_pages: {
        Row: {
          competitor_quote_id: string
          created_at: string
          id: string
          image_url: string
          page_number: number
          storage_path: string | null
        }
        Insert: {
          competitor_quote_id: string
          created_at?: string
          id?: string
          image_url: string
          page_number?: number
          storage_path?: string | null
        }
        Update: {
          competitor_quote_id?: string
          created_at?: string
          id?: string
          image_url?: string
          page_number?: number
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_quote_pages_competitor_quote_id_fkey"
            columns: ["competitor_quote_id"]
            isOneToOne: false
            referencedRelation: "competitor_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_quotes: {
        Row: {
          analysis: Json
          archived: boolean
          archived_at: string | null
          client_email: string | null
          client_name: string | null
          client_user_id: string | null
          competitor_id: string | null
          competitor_name: string | null
          counter_quote_id: string | null
          created_at: string
          created_by: string | null
          event_date: string | null
          event_type: string | null
          gratuity: number | null
          guest_count: number | null
          id: string
          notes: string | null
          outcome: string
          per_guest_price: number | null
          service_style: string | null
          source_image_url: string | null
          subtotal: number | null
          taxes: number | null
          total: number | null
          updated_at: string
        }
        Insert: {
          analysis?: Json
          archived?: boolean
          archived_at?: string | null
          client_email?: string | null
          client_name?: string | null
          client_user_id?: string | null
          competitor_id?: string | null
          competitor_name?: string | null
          counter_quote_id?: string | null
          created_at?: string
          created_by?: string | null
          event_date?: string | null
          event_type?: string | null
          gratuity?: number | null
          guest_count?: number | null
          id?: string
          notes?: string | null
          outcome?: string
          per_guest_price?: number | null
          service_style?: string | null
          source_image_url?: string | null
          subtotal?: number | null
          taxes?: number | null
          total?: number | null
          updated_at?: string
        }
        Update: {
          analysis?: Json
          archived?: boolean
          archived_at?: string | null
          client_email?: string | null
          client_name?: string | null
          client_user_id?: string | null
          competitor_id?: string | null
          competitor_name?: string | null
          counter_quote_id?: string | null
          created_at?: string
          created_by?: string | null
          event_date?: string | null
          event_type?: string | null
          gratuity?: number | null
          guest_count?: number | null
          id?: string
          notes?: string | null
          outcome?: string
          per_guest_price?: number | null
          service_style?: string | null
          source_image_url?: string | null
          subtotal?: number | null
          taxes?: number | null
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_quotes_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_quotes_counter_quote_id_fkey"
            columns: ["counter_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      competitors: {
        Row: {
          created_at: string
          email: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          name: string
          name_normalized: string
          notes: string | null
          phone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          name: string
          name_normalized: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          name?: string
          name_normalized?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      cooking_guides: {
        Row: {
          body: string
          created_at: string
          id: string
          published_at: string | null
          related_ingredients: Json
          related_tools: Json
          slug: string
          status: Database["public"]["Enums"]["cooking_guide_status"]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          published_at?: string | null
          related_ingredients?: Json
          related_tools?: Json
          slug: string
          status?: Database["public"]["Enums"]["cooking_guide_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          published_at?: string | null
          related_ingredients?: Json
          related_tools?: Json
          slug?: string
          status?: Database["public"]["Enums"]["cooking_guide_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      cooking_lab_entries: {
        Row: {
          created_at: string
          description: string
          display_order: number
          id: string
          image_url: string | null
          primary_tool_name: string | null
          primary_tool_url: string | null
          qa_copy_reviewed: boolean
          qa_image_loads: boolean
          qa_links_tested: boolean
          qa_ready: boolean
          qa_video_loads: boolean
          secondary_tool_name: string | null
          secondary_tool_url: string | null
          status: string
          title: string
          updated_at: string
          updated_by: string | null
          video_url: string | null
          visible: boolean
        }
        Insert: {
          created_at?: string
          description?: string
          display_order?: number
          id?: string
          image_url?: string | null
          primary_tool_name?: string | null
          primary_tool_url?: string | null
          qa_copy_reviewed?: boolean
          qa_image_loads?: boolean
          qa_links_tested?: boolean
          qa_ready?: boolean
          qa_video_loads?: boolean
          secondary_tool_name?: string | null
          secondary_tool_url?: string | null
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          video_url?: string | null
          visible?: boolean
        }
        Update: {
          created_at?: string
          description?: string
          display_order?: number
          id?: string
          image_url?: string | null
          primary_tool_name?: string | null
          primary_tool_url?: string | null
          qa_copy_reviewed?: boolean
          qa_image_loads?: boolean
          qa_links_tested?: boolean
          qa_ready?: boolean
          qa_video_loads?: boolean
          secondary_tool_name?: string | null
          secondary_tool_url?: string | null
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          video_url?: string | null
          visible?: boolean
        }
        Relationships: []
      }
      cost_update_queue: {
        Row: {
          created_at: string
          current_cost: number | null
          final_applied_cost: number | null
          id: string
          percent_change: number | null
          proposed_cost: number
          proposed_historical_cost: number | null
          proposed_kroger_cost: number | null
          proposed_manual_cost: number | null
          reference_id: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_cost?: number | null
          final_applied_cost?: number | null
          id?: string
          percent_change?: number | null
          proposed_cost: number
          proposed_historical_cost?: number | null
          proposed_kroger_cost?: number | null
          proposed_manual_cost?: number | null
          reference_id: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_cost?: number | null
          final_applied_cost?: number | null
          id?: string
          percent_change?: number | null
          proposed_cost?: number
          proposed_historical_cost?: number | null
          proposed_kroger_cost?: number | null
          proposed_manual_cost?: number | null
          reference_id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_update_queue_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "ingredient_reference"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_logs: {
        Row: {
          created_at: string
          decision_rationale: string
          decision_title: string
          expected_impact: string
          final_decision: string
          id: string
          options_considered: string
          owner: string | null
          problem_statement: string
          status: string
        }
        Insert: {
          created_at?: string
          decision_rationale: string
          decision_title: string
          expected_impact: string
          final_decision: string
          id?: string
          options_considered: string
          owner?: string | null
          problem_statement: string
          status?: string
        }
        Update: {
          created_at?: string
          decision_rationale?: string
          decision_title?: string
          expected_impact?: string
          final_decision?: string
          id?: string
          options_considered?: string
          owner?: string | null
          problem_statement?: string
          status?: string
        }
        Relationships: []
      }
      e2e_audit_runs: {
        Row: {
          audit_markdown: string | null
          created_at: string
          created_by: string | null
          duration_ms: number
          failed: number
          id: string
          notes: string | null
          passed: number
          results: Json
          skipped: number
          total_routes: number
        }
        Insert: {
          audit_markdown?: string | null
          created_at?: string
          created_by?: string | null
          duration_ms?: number
          failed?: number
          id?: string
          notes?: string | null
          passed?: number
          results?: Json
          skipped?: number
          total_routes?: number
        }
        Update: {
          audit_markdown?: string | null
          created_at?: string
          created_by?: string | null
          duration_ms?: number
          failed?: number
          id?: string
          notes?: string | null
          passed?: number
          results?: Json
          skipped?: number
          total_routes?: number
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      employee_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          invited_by: string | null
          invited_user_id: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          invited_user_id?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          invited_user_id?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      employee_profiles: {
        Row: {
          active: boolean
          created_at: string
          hire_date: string | null
          hourly_rate: number | null
          id: string
          notes: string | null
          phone: string | null
          position: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          hire_date?: string | null
          hourly_rate?: number | null
          id?: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          hire_date?: string | null
          hourly_rate?: number | null
          id?: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      event_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          employee_user_id: string
          id: string
          notes: string | null
          quote_id: string
          role: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          employee_user_id: string
          id?: string
          notes?: string | null
          quote_id: string
          role?: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          employee_user_id?: string
          id?: string
          notes?: string | null
          quote_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_assignments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      event_prep_tasks: {
        Row: {
          completed: boolean
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          position: number
          quote_id: string
          quote_item_id: string | null
          source: string
          title: string
          updated_at: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          position?: number
          quote_id: string
          quote_item_id?: string | null
          source?: string
          title: string
          updated_at?: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          position?: number
          quote_id?: string
          quote_item_id?: string | null
          source?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_prep_tasks_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_prep_tasks_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items"
            referencedColumns: ["id"]
          },
        ]
      }
      event_time_entries: {
        Row: {
          approval_notes: string | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          clock_in_at: string
          clock_out_at: string | null
          created_at: string
          employee_user_id: string
          id: string
          notes: string | null
          quote_id: string
          updated_at: string
        }
        Insert: {
          approval_notes?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          clock_in_at?: string
          clock_out_at?: string | null
          created_at?: string
          employee_user_id: string
          id?: string
          notes?: string | null
          quote_id: string
          updated_at?: string
        }
        Update: {
          approval_notes?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          clock_in_at?: string
          clock_out_at?: string | null
          created_at?: string
          employee_user_id?: string
          id?: string
          notes?: string | null
          quote_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_time_entries_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_visibility: {
        Row: {
          feature_key: string
          nav_enabled: boolean
          notes: string | null
          phase: Database["public"]["Enums"]["visibility_phase"]
          seo_indexing_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          feature_key: string
          nav_enabled?: boolean
          notes?: string | null
          phase?: Database["public"]["Enums"]["visibility_phase"]
          seo_indexing_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          feature_key?: string
          nav_enabled?: boolean
          notes?: string | null
          phase?: Database["public"]["Enums"]["visibility_phase"]
          seo_indexing_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      feedback: {
        Row: {
          admin_notes: string | null
          created_at: string
          email: string | null
          id: string
          message: string
          page_url: string | null
          rating: number | null
          status: string
          updated_at: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          email?: string | null
          id?: string
          message: string
          page_url?: string | null
          rating?: number | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          email?: string | null
          id?: string
          message?: string
          page_url?: string | null
          rating?: number | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      fred_pull_log: {
        Row: {
          applied_count: number
          created_count: number
          errors: Json
          id: string
          matched_count: number
          notes: string | null
          pulled_at: string
          pulled_by: string | null
          series_count: number
          skipped_count: number
        }
        Insert: {
          applied_count?: number
          created_count?: number
          errors?: Json
          id?: string
          matched_count?: number
          notes?: string | null
          pulled_at?: string
          pulled_by?: string | null
          series_count?: number
          skipped_count?: number
        }
        Update: {
          applied_count?: number
          created_count?: number
          errors?: Json
          id?: string
          matched_count?: number
          notes?: string | null
          pulled_at?: string
          pulled_by?: string | null
          series_count?: number
          skipped_count?: number
        }
        Relationships: []
      }
      fred_series_map: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          id: string
          label: string
          match_keywords: string[]
          notes: string | null
          priority: Database["public"]["Enums"]["fred_priority"]
          series_id: string
          unit: string
          unit_conversion: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          id?: string
          label: string
          match_keywords?: string[]
          notes?: string | null
          priority?: Database["public"]["Enums"]["fred_priority"]
          series_id: string
          unit?: string
          unit_conversion?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          id?: string
          label?: string
          match_keywords?: string[]
          notes?: string | null
          priority?: Database["public"]["Enums"]["fred_priority"]
          series_id?: string
          unit?: string
          unit_conversion?: number
          updated_at?: string
        }
        Relationships: []
      }
      governance_prompts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          prompt_content: string
          prompt_name: string
          prompt_status: string
          prompt_version: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          prompt_content: string
          prompt_name: string
          prompt_status?: string
          prompt_version: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          prompt_content?: string
          prompt_name?: string
          prompt_status?: string
          prompt_version?: string
        }
        Relationships: []
      }
      ingredient_reference: {
        Row: {
          canonical_name: string
          canonical_normalized: string
          category: string | null
          created_at: string
          default_unit: string
          density_g_per_ml: number | null
          fred_series_id: string | null
          fred_unit: string | null
          historical_avg_unit_cost: number | null
          historical_avg_updated_at: string | null
          id: string
          internal_cost_weights: Json | null
          internal_estimated_unit_cost: number | null
          internal_estimated_unit_cost_updated_at: string | null
          inventory_item_id: string | null
          kroger_unit_cost: number | null
          kroger_unit_cost_updated_at: string | null
          manual_unit_cost: number | null
          manual_unit_cost_updated_at: string | null
          manual_unit_cost_updated_by: string | null
          notes: string | null
          updated_at: string
          waste_factor: number
        }
        Insert: {
          canonical_name: string
          canonical_normalized: string
          category?: string | null
          created_at?: string
          default_unit?: string
          density_g_per_ml?: number | null
          fred_series_id?: string | null
          fred_unit?: string | null
          historical_avg_unit_cost?: number | null
          historical_avg_updated_at?: string | null
          id?: string
          internal_cost_weights?: Json | null
          internal_estimated_unit_cost?: number | null
          internal_estimated_unit_cost_updated_at?: string | null
          inventory_item_id?: string | null
          kroger_unit_cost?: number | null
          kroger_unit_cost_updated_at?: string | null
          manual_unit_cost?: number | null
          manual_unit_cost_updated_at?: string | null
          manual_unit_cost_updated_by?: string | null
          notes?: string | null
          updated_at?: string
          waste_factor?: number
        }
        Update: {
          canonical_name?: string
          canonical_normalized?: string
          category?: string | null
          created_at?: string
          default_unit?: string
          density_g_per_ml?: number | null
          fred_series_id?: string | null
          fred_unit?: string | null
          historical_avg_unit_cost?: number | null
          historical_avg_updated_at?: string | null
          id?: string
          internal_cost_weights?: Json | null
          internal_estimated_unit_cost?: number | null
          internal_estimated_unit_cost_updated_at?: string | null
          inventory_item_id?: string | null
          kroger_unit_cost?: number | null
          kroger_unit_cost_updated_at?: string | null
          manual_unit_cost?: number | null
          manual_unit_cost_updated_at?: string | null
          manual_unit_cost_updated_by?: string | null
          notes?: string | null
          updated_at?: string
          waste_factor?: number
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_reference_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_synonym_dismissed: {
        Row: {
          alias_normalized: string
          created_at: string
          dismissed_by: string | null
          id: string
        }
        Insert: {
          alias_normalized: string
          created_at?: string
          dismissed_by?: string | null
          id?: string
        }
        Update: {
          alias_normalized?: string
          created_at?: string
          dismissed_by?: string | null
          id?: string
        }
        Relationships: []
      }
      ingredient_synonyms: {
        Row: {
          alias: string
          alias_normalized: string
          canonical: string
          created_at: string
          id: string
          reference_id: string | null
          source: string
          updated_at: string
        }
        Insert: {
          alias: string
          alias_normalized: string
          canonical: string
          created_at?: string
          id?: string
          reference_id?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          alias?: string
          alias_normalized?: string
          canonical?: string
          created_at?: string
          id?: string
          reference_id?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_synonyms_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "ingredient_reference"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_adjustments: {
        Row: {
          change_amount: number
          created_at: string
          id: string
          inventory_item_id: string
          new_stock: number
          previous_stock: number
          reason: string | null
          source: string
          user_id: string | null
        }
        Insert: {
          change_amount?: number
          created_at?: string
          id?: string
          inventory_item_id: string
          new_stock?: number
          previous_stock?: number
          reason?: string | null
          source?: string
          user_id?: string | null
        }
        Update: {
          change_amount?: number
          created_at?: string
          id?: string
          inventory_item_id?: string
          new_stock?: number
          previous_stock?: number
          reason?: string | null
          source?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          average_cost_per_unit: number
          category: string | null
          created_at: string
          created_source: string
          current_stock: number
          id: string
          last_receipt_cost: number | null
          name: string
          par_level: number
          pending_review: boolean
          supplier_id: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          average_cost_per_unit?: number
          category?: string | null
          created_at?: string
          created_source?: string
          current_stock?: number
          id?: string
          last_receipt_cost?: number | null
          name: string
          par_level?: number
          pending_review?: boolean
          supplier_id?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          average_cost_per_unit?: number
          category?: string | null
          created_at?: string
          created_source?: string
          current_stock?: number
          id?: string
          last_receipt_cost?: number | null
          name?: string
          par_level?: number
          pending_review?: boolean
          supplier_id?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      kroger_bootstrap_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          page: number
          products_seen: number
          run_id: string
          search_term: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          page?: number
          products_seen?: number
          run_id: string
          search_term: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          page?: number
          products_seen?: number
          run_id?: string
          search_term?: string
        }
        Relationships: [
          {
            foreignKeyName: "kroger_bootstrap_progress_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "kroger_ingest_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      kroger_ingest_runs: {
        Row: {
          created_at: string
          errors: Json
          finished_at: string | null
          id: string
          item_limit: number | null
          items_queried: number
          location_id: string | null
          message: string | null
          price_rows_written: number
          sku_map_rows_touched: number
          started_at: string | null
          status: string
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          errors?: Json
          finished_at?: string | null
          id?: string
          item_limit?: number | null
          items_queried?: number
          location_id?: string | null
          message?: string | null
          price_rows_written?: number
          sku_map_rows_touched?: number
          started_at?: string | null
          status?: string
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          errors?: Json
          finished_at?: string | null
          id?: string
          item_limit?: number | null
          items_queried?: number
          location_id?: string | null
          message?: string | null
          price_rows_written?: number
          sku_map_rows_touched?: number
          started_at?: string | null
          status?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      kroger_sku_map: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          last_seen_at: string
          match_confidence: number | null
          notes: string | null
          price_observed_at: string | null
          price_unit_size: string | null
          product_id: string | null
          product_name: string | null
          product_name_normalized: string | null
          promo_price: number | null
          reference_id: string | null
          regular_price: number | null
          review_state: string
          sku: string
          status: string
          upc: string | null
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          match_confidence?: number | null
          notes?: string | null
          price_observed_at?: string | null
          price_unit_size?: string | null
          product_id?: string | null
          product_name?: string | null
          product_name_normalized?: string | null
          promo_price?: number | null
          reference_id?: string | null
          regular_price?: number | null
          review_state?: string
          sku: string
          status?: string
          upc?: string | null
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          match_confidence?: number | null
          notes?: string | null
          price_observed_at?: string | null
          price_unit_size?: string | null
          product_id?: string | null
          product_name?: string | null
          product_name_normalized?: string | null
          promo_price?: number | null
          reference_id?: string | null
          regular_price?: number | null
          review_state?: string
          sku?: string
          status?: string
          upc?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kroger_sku_map_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "ingredient_reference"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_module_items: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          module_id: string
          position: number
          recipe_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          module_id: string
          position?: number
          recipe_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          module_id?: string
          position?: number
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_module_items_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "menu_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_module_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_modules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          position: number
          state: Database["public"]["Enums"]["menu_module_state"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          position?: number
          state?: Database["public"]["Enums"]["menu_module_state"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          position?: number
          state?: Database["public"]["Enums"]["menu_module_state"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      national_price_snapshots: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          month: string
          price: number
          region: string | null
          source: string
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          month: string
          price: number
          region?: string | null
          source: string
          unit: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          month?: string
          price?: number
          region?: string | null
          source?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "national_price_snapshots_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredient_reference"
            referencedColumns: ["id"]
          },
        ]
      }
      national_price_staging: {
        Row: {
          fetched_at: string
          id: string
          ingredient_id: string
          month: string
          price: number
          region: string | null
          source: string
          unit: string
        }
        Insert: {
          fetched_at?: string
          id?: string
          ingredient_id: string
          month: string
          price: number
          region?: string | null
          source: string
          unit: string
        }
        Update: {
          fetched_at?: string
          id?: string
          ingredient_id?: string
          month?: string
          price?: number
          region?: string | null
          source?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "national_price_staging_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredient_reference"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          source: string
          unsubscribed_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          source?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          source?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      price_history: {
        Row: {
          created_at: string
          id: string
          ingest_run_id: string | null
          inventory_item_id: string
          location_id: string | null
          notes: string | null
          observed_at: string
          promo: boolean
          raw_package_price: number | null
          source: string
          source_id: string | null
          supplier_id: string | null
          unit: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          ingest_run_id?: string | null
          inventory_item_id: string
          location_id?: string | null
          notes?: string | null
          observed_at?: string
          promo?: boolean
          raw_package_price?: number | null
          source: string
          source_id?: string | null
          supplier_id?: string | null
          unit?: string | null
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          ingest_run_id?: string | null
          inventory_item_id?: string
          location_id?: string | null
          notes?: string | null
          observed_at?: string
          promo?: boolean
          raw_package_price?: number | null
          source?: string
          source_id?: string | null
          supplier_id?: string | null
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_history_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_model_recipes: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          price_per_person: number
          pricing_model_id: string
          recipe_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          price_per_person: number
          pricing_model_id: string
          recipe_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          price_per_person?: number
          pricing_model_id?: string
          recipe_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_model_recipes_pricing_model_id_fkey"
            columns: ["pricing_model_id"]
            isOneToOne: false
            referencedRelation: "pricing_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_model_recipes_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_models: {
        Row: {
          activated_at: string | null
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          status: Database["public"]["Enums"]["pricing_model_status"]
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          status?: Database["public"]["Enums"]["pricing_model_status"]
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["pricing_model_status"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_audit_exports: {
        Row: {
          executed_at: string
          executed_by: string | null
          id: string
          output_content: string
          output_filename: string
          prompt_version: string
        }
        Insert: {
          executed_at?: string
          executed_by?: string | null
          id?: string
          output_content: string
          output_filename: string
          prompt_version: string
        }
        Update: {
          executed_at?: string
          executed_by?: string | null
          id?: string
          output_content?: string
          output_filename?: string
          prompt_version?: string
        }
        Relationships: []
      }
      purchase_order_items: {
        Row: {
          id: string
          inventory_item_id: string | null
          name: string
          purchase_order_id: string
          quantity: number
          total_price: number
          unit: string
          unit_price: number
        }
        Insert: {
          id?: string
          inventory_item_id?: string | null
          name: string
          purchase_order_id: string
          quantity: number
          total_price?: number
          unit: string
          unit_price?: number
        }
        Update: {
          id?: string
          inventory_item_id?: string | null
          name?: string
          purchase_order_id?: string
          quantity?: number
          total_price?: number
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          expected_delivery: string | null
          id: string
          notes: string | null
          order_date: string
          status: string
          supplier_id: string | null
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          status?: string
          supplier_id?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          status?: string
          supplier_id?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          id: string
          name: string
          quantity: number
          quote_id: string
          recipe_id: string | null
          total_price: number
          unit_price: number
        }
        Insert: {
          id?: string
          name: string
          quantity?: number
          quote_id: string
          recipe_id?: string | null
          total_price?: number
          unit_price?: number
        }
        Update: {
          id?: string
          name?: string
          quantity?: number
          quote_id?: string
          recipe_id?: string | null
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          actual_cost: number | null
          client_email: string | null
          client_name: string | null
          client_phone: string | null
          conversation: Json | null
          created_at: string
          dietary_preferences: Json | null
          event_date: string | null
          event_type: string | null
          guest_count: number
          id: string
          location_address: string | null
          location_name: string | null
          notes: string | null
          reference_number: string | null
          status: string
          subtotal: number | null
          tax_rate: number | null
          theoretical_cost: number | null
          total: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          actual_cost?: number | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          conversation?: Json | null
          created_at?: string
          dietary_preferences?: Json | null
          event_date?: string | null
          event_type?: string | null
          guest_count?: number
          id?: string
          location_address?: string | null
          location_name?: string | null
          notes?: string | null
          reference_number?: string | null
          status?: string
          subtotal?: number | null
          tax_rate?: number | null
          theoretical_cost?: number | null
          total?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          actual_cost?: number | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          conversation?: Json | null
          created_at?: string
          dietary_preferences?: Json | null
          event_date?: string | null
          event_type?: string | null
          guest_count?: number
          id?: string
          location_address?: string | null
          location_name?: string | null
          notes?: string | null
          reference_number?: string | null
          status?: string
          subtotal?: number | null
          tax_rate?: number | null
          theoretical_cost?: number | null
          total?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      receipts: {
        Row: {
          created_at: string
          extracted_line_items: Json | null
          id: string
          image_url: string | null
          linked_quote_id: string | null
          raw_ocr_text: string | null
          receipt_date: string
          status: string
          supplier_id: string | null
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          extracted_line_items?: Json | null
          id?: string
          image_url?: string | null
          linked_quote_id?: string | null
          raw_ocr_text?: string | null
          receipt_date?: string
          status?: string
          supplier_id?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          extracted_line_items?: Json | null
          id?: string
          image_url?: string | null
          linked_quote_id?: string | null
          raw_ocr_text?: string | null
          receipt_date?: string
          status?: string
          supplier_id?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_linked_quote_id_fkey"
            columns: ["linked_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_drip_jobs: {
        Row: {
          attempts: number
          created_at: string
          email: string
          id: string
          last_error: string | null
          recipe_id: string | null
          send_after: string
          sent_at: string | null
          signup_id: string
          status: string
          step: number
          template_name: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          email: string
          id?: string
          last_error?: string | null
          recipe_id?: string | null
          send_after: string
          sent_at?: string | null
          signup_id: string
          status?: string
          step: number
          template_name: string
        }
        Update: {
          attempts?: number
          created_at?: string
          email?: string
          id?: string
          last_error?: string | null
          recipe_id?: string | null
          send_after?: string
          sent_at?: string | null
          signup_id?: string
          status?: string
          step?: number
          template_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_drip_jobs_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_drip_jobs_signup_id_fkey"
            columns: ["signup_id"]
            isOneToOne: false
            referencedRelation: "recipe_email_signups"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_email_signups: {
        Row: {
          created_at: string
          email: string
          entry_source: string | null
          id: string
          ip_hash: string | null
          lead_magnet: string
          recipe_id: string | null
          source: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          email: string
          entry_source?: string | null
          id?: string
          ip_hash?: string | null
          lead_magnet?: string
          recipe_id?: string | null
          source?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          entry_source?: string | null
          id?: string
          ip_hash?: string | null
          lead_magnet?: string
          recipe_id?: string | null
          source?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_email_signups_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_favorites: {
        Row: {
          created_at: string
          id: string
          recipe_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          recipe_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          recipe_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_favorites_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          cost_per_unit: number | null
          id: string
          inventory_item_id: string | null
          name: string
          notes: string | null
          quantity: number
          recipe_id: string
          reference_id: string | null
          unit: string
        }
        Insert: {
          cost_per_unit?: number | null
          id?: string
          inventory_item_id?: string | null
          name: string
          notes?: string | null
          quantity: number
          recipe_id: string
          reference_id?: string | null
          unit: string
        }
        Update: {
          cost_per_unit?: number | null
          id?: string
          inventory_item_id?: string | null
          name?: string
          notes?: string | null
          quantity?: number
          recipe_id?: string
          reference_id?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "ingredient_reference"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_shop_items: {
        Row: {
          benefit: string | null
          created_at: string
          id: string
          image_url: string | null
          is_affiliate: boolean
          name: string
          position: number
          program_id: string | null
          recipe_id: string
          updated_at: string
          url: string | null
        }
        Insert: {
          benefit?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_affiliate?: boolean
          name: string
          position?: number
          program_id?: string | null
          recipe_id: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          benefit?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_affiliate?: boolean
          name?: string
          position?: number
          program_id?: string | null
          recipe_id?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_shop_items_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "affiliate_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_shop_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          active: boolean
          allergens: string[] | null
          calculated_cost_per_person: number | null
          category: string | null
          cook_time: number | null
          copycat_source: string | null
          cost_per_serving: number | null
          coupon_image_url: string | null
          coupon_text: string | null
          coupon_valid_until: string | null
          created_at: string
          created_source: string
          cta_type: string | null
          cuisine: string | null
          description: string | null
          hook: string | null
          id: string
          image_url: string | null
          ingredient_integrity: string
          inspired: boolean
          inspired_phase: Database["public"]["Enums"]["inspired_phase"]
          inspired_slug: string | null
          instructions: string | null
          is_copycat: boolean
          is_gluten_free: boolean | null
          is_premium: boolean
          is_standard: boolean
          is_vegan: boolean | null
          is_vegetarian: boolean | null
          markup_percentage: number | null
          menu_price: number | null
          name: string
          prep_time: number | null
          pricing_errors: Json
          pricing_status: string
          pro_tips: Json
          reheating_instructions: string | null
          scope: Database["public"]["Enums"]["recipe_scope"]
          score_affiliate: number
          score_event: number
          score_seasonal: number
          score_video: number
          seasonal_tags: string[] | null
          selling_price_per_person: number | null
          serving_size: string | null
          serving_suggestions: string | null
          servings: number
          skill_level: string | null
          social_image_url: string | null
          source_competitor_quote_id: string | null
          status: Database["public"]["Enums"]["recipe_status"]
          storage_instructions: string | null
          total_cost: number | null
          updated_at: string
          use_case: string | null
          video_embed_html: string | null
          video_url: string | null
        }
        Insert: {
          active?: boolean
          allergens?: string[] | null
          calculated_cost_per_person?: number | null
          category?: string | null
          cook_time?: number | null
          copycat_source?: string | null
          cost_per_serving?: number | null
          coupon_image_url?: string | null
          coupon_text?: string | null
          coupon_valid_until?: string | null
          created_at?: string
          created_source?: string
          cta_type?: string | null
          cuisine?: string | null
          description?: string | null
          hook?: string | null
          id?: string
          image_url?: string | null
          ingredient_integrity?: string
          inspired?: boolean
          inspired_phase?: Database["public"]["Enums"]["inspired_phase"]
          inspired_slug?: string | null
          instructions?: string | null
          is_copycat?: boolean
          is_gluten_free?: boolean | null
          is_premium?: boolean
          is_standard?: boolean
          is_vegan?: boolean | null
          is_vegetarian?: boolean | null
          markup_percentage?: number | null
          menu_price?: number | null
          name: string
          prep_time?: number | null
          pricing_errors?: Json
          pricing_status?: string
          pro_tips?: Json
          reheating_instructions?: string | null
          scope?: Database["public"]["Enums"]["recipe_scope"]
          score_affiliate?: number
          score_event?: number
          score_seasonal?: number
          score_video?: number
          seasonal_tags?: string[] | null
          selling_price_per_person?: number | null
          serving_size?: string | null
          serving_suggestions?: string | null
          servings?: number
          skill_level?: string | null
          social_image_url?: string | null
          source_competitor_quote_id?: string | null
          status?: Database["public"]["Enums"]["recipe_status"]
          storage_instructions?: string | null
          total_cost?: number | null
          updated_at?: string
          use_case?: string | null
          video_embed_html?: string | null
          video_url?: string | null
        }
        Update: {
          active?: boolean
          allergens?: string[] | null
          calculated_cost_per_person?: number | null
          category?: string | null
          cook_time?: number | null
          copycat_source?: string | null
          cost_per_serving?: number | null
          coupon_image_url?: string | null
          coupon_text?: string | null
          coupon_valid_until?: string | null
          created_at?: string
          created_source?: string
          cta_type?: string | null
          cuisine?: string | null
          description?: string | null
          hook?: string | null
          id?: string
          image_url?: string | null
          ingredient_integrity?: string
          inspired?: boolean
          inspired_phase?: Database["public"]["Enums"]["inspired_phase"]
          inspired_slug?: string | null
          instructions?: string | null
          is_copycat?: boolean
          is_gluten_free?: boolean | null
          is_premium?: boolean
          is_standard?: boolean
          is_vegan?: boolean | null
          is_vegetarian?: boolean | null
          markup_percentage?: number | null
          menu_price?: number | null
          name?: string
          prep_time?: number | null
          pricing_errors?: Json
          pricing_status?: string
          pro_tips?: Json
          reheating_instructions?: string | null
          scope?: Database["public"]["Enums"]["recipe_scope"]
          score_affiliate?: number
          score_event?: number
          score_seasonal?: number
          score_video?: number
          seasonal_tags?: string[] | null
          selling_price_per_person?: number | null
          serving_size?: string | null
          serving_suggestions?: string | null
          servings?: number
          skill_level?: string | null
          social_image_url?: string | null
          source_competitor_quote_id?: string | null
          status?: Database["public"]["Enums"]["recipe_status"]
          storage_instructions?: string | null
          total_cost?: number | null
          updated_at?: string
          use_case?: string | null
          video_embed_html?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipes_source_competitor_quote_id_fkey"
            columns: ["source_competitor_quote_id"]
            isOneToOne: false
            referencedRelation: "competitor_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      role_section_permissions: {
        Row: {
          enabled: boolean
          id: string
          role: Database["public"]["Enums"]["app_role"]
          section: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          section: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          section?: string
          updated_at?: string
        }
        Relationships: []
      }
      route_inventory: {
        Row: {
          created_at: string
          last_http_checked_at: string | null
          last_http_error: string | null
          last_http_status: number | null
          review_notes: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          route_path: string
          thumbnail_captured_at: string | null
          thumbnail_error: string | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          last_http_checked_at?: string | null
          last_http_error?: string | null
          last_http_status?: number | null
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          route_path: string
          thumbnail_captured_at?: string | null
          thumbnail_error?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          last_http_checked_at?: string | null
          last_http_error?: string | null
          last_http_status?: number | null
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          route_path?: string
          thumbnail_captured_at?: string | null
          thumbnail_error?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sale_flyer_items: {
        Row: {
          brand: string | null
          created_at: string
          flipp_generated_at: string | null
          flipp_image_url: string | null
          flipp_short_link: string | null
          id: string
          inventory_item_id: string | null
          name: string
          notes: string | null
          pack_size: string | null
          promo_image_url: string | null
          regular_price: number | null
          sale_flyer_id: string
          sale_price: number | null
          savings: number | null
          unit: string | null
        }
        Insert: {
          brand?: string | null
          created_at?: string
          flipp_generated_at?: string | null
          flipp_image_url?: string | null
          flipp_short_link?: string | null
          id?: string
          inventory_item_id?: string | null
          name: string
          notes?: string | null
          pack_size?: string | null
          promo_image_url?: string | null
          regular_price?: number | null
          sale_flyer_id: string
          sale_price?: number | null
          savings?: number | null
          unit?: string | null
        }
        Update: {
          brand?: string | null
          created_at?: string
          flipp_generated_at?: string | null
          flipp_image_url?: string | null
          flipp_short_link?: string | null
          id?: string
          inventory_item_id?: string | null
          name?: string
          notes?: string | null
          pack_size?: string | null
          promo_image_url?: string | null
          regular_price?: number | null
          sale_flyer_id?: string
          sale_price?: number | null
          savings?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_flyer_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_flyer_items_sale_flyer_id_fkey"
            columns: ["sale_flyer_id"]
            isOneToOne: false
            referencedRelation: "sale_flyers"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_flyer_pages: {
        Row: {
          created_at: string
          id: string
          image_url: string
          page_number: number
          sale_flyer_id: string
          storage_path: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          page_number: number
          sale_flyer_id: string
          storage_path?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          page_number?: number
          sale_flyer_id?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_flyer_pages_sale_flyer_id_fkey"
            columns: ["sale_flyer_id"]
            isOneToOne: false
            referencedRelation: "sale_flyers"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_flyers: {
        Row: {
          created_at: string
          flipp_generated_at: string | null
          flipp_image_url: string | null
          flipp_short_link: string | null
          id: string
          image_url: string | null
          notes: string | null
          processed_at: string | null
          raw_ocr_text: string | null
          sale_end_date: string | null
          sale_start_date: string | null
          status: string
          supplier_id: string | null
          title: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          flipp_generated_at?: string | null
          flipp_image_url?: string | null
          flipp_short_link?: string | null
          id?: string
          image_url?: string | null
          notes?: string | null
          processed_at?: string | null
          raw_ocr_text?: string | null
          sale_end_date?: string | null
          sale_start_date?: string | null
          status?: string
          supplier_id?: string | null
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          flipp_generated_at?: string | null
          flipp_image_url?: string | null
          flipp_short_link?: string | null
          id?: string
          image_url?: string | null
          notes?: string | null
          processed_at?: string | null
          raw_ocr_text?: string | null
          sale_end_date?: string | null
          sale_start_date?: string | null
          status?: string
          supplier_id?: string | null
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_flyers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          checked: boolean
          created_at: string
          id: string
          name: string
          notes: string | null
          quantity: number | null
          recipe_id: string | null
          unit: string | null
          user_id: string
        }
        Insert: {
          checked?: boolean
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          quantity?: number | null
          recipe_id?: string | null
          unit?: string | null
          user_id: string
        }
        Update: {
          checked?: boolean
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          quantity?: number | null
          recipe_id?: string | null
          unit?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      site_asset_manifest: {
        Row: {
          alt: string | null
          bytes: number | null
          category: string
          content_type: string | null
          created_at: string
          height: number | null
          id: string
          public_url: string
          slug: string
          source_url: string | null
          storage_path: string
          updated_at: string
          width: number | null
        }
        Insert: {
          alt?: string | null
          bytes?: number | null
          category?: string
          content_type?: string | null
          created_at?: string
          height?: number | null
          id?: string
          public_url: string
          slug: string
          source_url?: string | null
          storage_path: string
          updated_at?: string
          width?: number | null
        }
        Update: {
          alt?: string | null
          bytes?: number | null
          category?: string
          content_type?: string | null
          created_at?: string
          height?: number | null
          id?: string
          public_url?: string
          slug?: string
          source_url?: string | null
          storage_path?: string
          updated_at?: string
          width?: number | null
        }
        Relationships: []
      }
      sponsorship_deals: {
        Row: {
          brand_name: string
          contact_email: string | null
          contact_name: string | null
          created_at: string
          currency: string
          deal_type: string | null
          deal_value: number
          delivered_on: string | null
          id: string
          invoiced_on: string | null
          notes: string | null
          paid_on: string | null
          pitched_on: string | null
          signed_on: string | null
          status: string
          updated_at: string
        }
        Insert: {
          brand_name: string
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          currency?: string
          deal_type?: string | null
          deal_value?: number
          delivered_on?: string | null
          id?: string
          invoiced_on?: string | null
          notes?: string | null
          paid_on?: string | null
          pitched_on?: string | null
          signed_on?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          brand_name?: string
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          currency?: string
          deal_type?: string | null
          deal_value?: number
          delivered_on?: string | null
          id?: string
          invoiced_on?: string | null
          notes?: string | null
          paid_on?: string | null
          pitched_on?: string | null
          signed_on?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          account_number: string | null
          address: string | null
          api_endpoint: string | null
          api_key_secret_name: string | null
          api_username: string | null
          cellphone: string | null
          contact_name: string | null
          created_at: string
          delivery_days: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          office_phone: string | null
          payment_terms: string | null
          phone: string | null
          portal_url: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          account_number?: string | null
          address?: string | null
          api_endpoint?: string | null
          api_key_secret_name?: string | null
          api_username?: string | null
          cellphone?: string | null
          contact_name?: string | null
          created_at?: string
          delivery_days?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          office_phone?: string | null
          payment_terms?: string | null
          phone?: string | null
          portal_url?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          account_number?: string | null
          address?: string | null
          api_endpoint?: string | null
          api_key_secret_name?: string | null
          api_username?: string | null
          cellphone?: string | null
          contact_name?: string | null
          created_at?: string
          delivery_days?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          office_phone?: string | null
          payment_terms?: string | null
          phone?: string | null
          portal_url?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
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
      user_section_overrides: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          section: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled: boolean
          id?: string
          section: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          section?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      cost_health_summary: {
        Row: {
          inventory_items_count: number | null
          last_receipt_date: string | null
          recipes_servings_one: number | null
          recipes_zero_cost: number | null
          total_active_recipes: number | null
          total_ingredients: number | null
          unlinked_ingredients: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_po_to_inventory: { Args: { _po_id: string }; Returns: undefined }
      approve_cost_update: {
        Args: { _notes?: string; _queue_id: string }
        Returns: Json
      }
      compute_internal_estimated_cost: {
        Args: { _historical: number; _kroger: number; _manual: number }
        Returns: Json
      }
      compute_recipe_selling_price: {
        Args: { _cost_per_serving: number; _markup_percentage: number }
        Returns: number
      }
      convert_unit_factor: {
        Args: { density_g_per_ml?: number; from_unit: string; to_unit: string }
        Returns: number
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      find_ingredient_matches: {
        Args: { _limit?: number; _name: string }
        Returns: {
          inventory_item_id: string
          inventory_name: string
          inventory_unit: string
          reference_id: string
          similarity: number
          source: string
        }[]
      }
      get_active_flyer_for_supplier: {
        Args: { _supplier_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_assigned_to_quote: {
        Args: { _quote_id: string; _user_id: string }
        Returns: boolean
      }
      is_recipe_publicly_visible: {
        Args: { _recipe_id: string }
        Returns: boolean
      }
      kroger_price_signals: {
        Args: never
        Returns: {
          flag: string
          inventory_avg: number
          inventory_item_id: string
          inventory_last_update: string
          inventory_name: string
          inventory_unit: string
          kroger_30d_median: number
          kroger_last_observed: string
          kroger_sample_count: number
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      normalize_ingredient_name: { Args: { _name: string }; Returns: string }
      override_cost_update: {
        Args: { _manual_cost: number; _notes?: string; _queue_id: string }
        Returns: Json
      }
      propose_internal_cost_update: {
        Args: {
          _new_historical?: number
          _new_kroger?: number
          _new_manual?: number
          _reference_id: string
          _source: string
        }
        Returns: Json
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recipe_has_unresolved_ingredients: {
        Args: { _recipe_id: string }
        Returns: boolean
      }
      recipe_pricing_health: { Args: { _recipe_id: string }; Returns: Json }
      recipe_pricing_health_summary: {
        Args: never
        Returns: {
          health_status: string
          recipe_id: string
          stale_ingredient_count: number
        }[]
      }
      recompute_quote_totals: {
        Args: { _quote_id: string }
        Returns: undefined
      }
      recompute_recipe_cost: {
        Args: { _recipe_id: string }
        Returns: undefined
      }
      refresh_recipe_integrity_flag: {
        Args: { _recipe_id: string }
        Returns: undefined
      }
      reject_cost_update: {
        Args: { _notes?: string; _queue_id: string }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "employee" | "marketing"
      cooking_guide_status: "draft" | "published"
      fred_priority: "primary" | "fallback"
      inspired_phase: "off" | "admin_preview" | "soft_launch" | "public"
      menu_module_state: "active" | "seasonal" | "inactive"
      pricing_model_status: "draft" | "active" | "archived"
      recipe_scope: "home_public" | "catering_internal" | "shared_controlled"
      recipe_status: "draft" | "published"
      visibility_phase: "off" | "admin_preview" | "soft_launch" | "public"
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
      app_role: ["admin", "moderator", "user", "employee", "marketing"],
      cooking_guide_status: ["draft", "published"],
      fred_priority: ["primary", "fallback"],
      inspired_phase: ["off", "admin_preview", "soft_launch", "public"],
      menu_module_state: ["active", "seasonal", "inactive"],
      pricing_model_status: ["draft", "active", "archived"],
      recipe_scope: ["home_public", "catering_internal", "shared_controlled"],
      recipe_status: ["draft", "published"],
      visibility_phase: ["off", "admin_preview", "soft_launch", "public"],
    },
  },
} as const
