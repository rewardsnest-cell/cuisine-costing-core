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
      app_settings: {
        Row: {
          id: number
          revision_lock_days: number
          updated_at: string
        }
        Insert: {
          id?: number
          revision_lock_days?: number
          updated_at?: string
        }
        Update: {
          id?: number
          revision_lock_days?: number
          updated_at?: string
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
          current_stock: number
          id: string
          last_receipt_cost: number | null
          name: string
          par_level: number
          supplier_id: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          average_cost_per_unit?: number
          category?: string | null
          created_at?: string
          current_stock?: number
          id?: string
          last_receipt_cost?: number | null
          name: string
          par_level?: number
          supplier_id?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          average_cost_per_unit?: number
          category?: string | null
          created_at?: string
          current_stock?: number
          id?: string
          last_receipt_cost?: number | null
          name?: string
          par_level?: number
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
      price_history: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          notes: string | null
          observed_at: string
          source: string
          source_id: string | null
          supplier_id: string | null
          unit: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          notes?: string | null
          observed_at?: string
          source: string
          source_id?: string | null
          supplier_id?: string | null
          unit?: string | null
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          notes?: string | null
          observed_at?: string
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
      recipe_ingredients: {
        Row: {
          cost_per_unit: number | null
          id: string
          inventory_item_id: string | null
          name: string
          notes: string | null
          quantity: number
          recipe_id: string
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
        ]
      }
      recipes: {
        Row: {
          active: boolean
          allergens: string[] | null
          category: string | null
          cook_time: number | null
          cost_per_serving: number | null
          created_at: string
          cuisine: string | null
          description: string | null
          id: string
          image_url: string | null
          instructions: string | null
          is_gluten_free: boolean | null
          is_vegan: boolean | null
          is_vegetarian: boolean | null
          name: string
          prep_time: number | null
          seasonal_tags: string[] | null
          servings: number
          total_cost: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          allergens?: string[] | null
          category?: string | null
          cook_time?: number | null
          cost_per_serving?: number | null
          created_at?: string
          cuisine?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          instructions?: string | null
          is_gluten_free?: boolean | null
          is_vegan?: boolean | null
          is_vegetarian?: boolean | null
          name: string
          prep_time?: number | null
          seasonal_tags?: string[] | null
          servings?: number
          total_cost?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          allergens?: string[] | null
          category?: string | null
          cook_time?: number | null
          cost_per_serving?: number | null
          created_at?: string
          cuisine?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          instructions?: string | null
          is_gluten_free?: boolean | null
          is_vegan?: boolean | null
          is_vegetarian?: boolean | null
          name?: string
          prep_time?: number | null
          seasonal_tags?: string[] | null
          servings?: number
          total_cost?: number | null
          updated_at?: string
        }
        Relationships: []
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
      sale_flyer_items: {
        Row: {
          brand: string | null
          created_at: string
          id: string
          inventory_item_id: string | null
          name: string
          notes: string | null
          pack_size: string | null
          regular_price: number | null
          sale_flyer_id: string
          sale_price: number | null
          savings: number | null
          unit: string | null
        }
        Insert: {
          brand?: string | null
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          name: string
          notes?: string | null
          pack_size?: string | null
          regular_price?: number | null
          sale_flyer_id: string
          sale_price?: number | null
          savings?: number | null
          unit?: string | null
        }
        Update: {
          brand?: string | null
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          name?: string
          notes?: string | null
          pack_size?: string | null
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
      [_ in never]: never
    }
    Functions: {
      apply_po_to_inventory: { Args: { _po_id: string }; Returns: undefined }
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
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "employee"
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
      app_role: ["admin", "moderator", "user", "employee"],
    },
  },
} as const
