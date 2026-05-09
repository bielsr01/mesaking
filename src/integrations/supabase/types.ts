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
      bulk_campaign_recipients: {
        Row: {
          campaign_id: string
          created_at: string
          customer_id: string | null
          error: string | null
          id: string
          name: string | null
          phone: string
          sent_at: string | null
          status: Database["public"]["Enums"]["bulk_recipient_status"]
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_id?: string | null
          error?: string | null
          id?: string
          name?: string | null
          phone: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["bulk_recipient_status"]
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_id?: string | null
          error?: string | null
          id?: string
          name?: string | null
          phone?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["bulk_recipient_status"]
        }
        Relationships: [
          {
            foreignKeyName: "bulk_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "bulk_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          failed: number
          finished_at: string | null
          id: string
          interval_seconds: number
          is_admin: boolean
          last_run_at: string | null
          media_url: string | null
          message_text: string
          name: string
          pause_after_messages: number
          pause_duration_minutes: number
          paused_until: string | null
          restaurant_id: string | null
          sent: number
          sent_in_block: number
          started_at: string | null
          status: Database["public"]["Enums"]["bulk_campaign_status"]
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          interval_seconds?: number
          is_admin?: boolean
          last_run_at?: string | null
          media_url?: string | null
          message_text: string
          name: string
          pause_after_messages?: number
          pause_duration_minutes?: number
          paused_until?: string | null
          restaurant_id?: string | null
          sent?: number
          sent_in_block?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["bulk_campaign_status"]
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          interval_seconds?: number
          is_admin?: boolean
          last_run_at?: string | null
          media_url?: string | null
          message_text?: string
          name?: string
          pause_after_messages?: number
          pause_duration_minutes?: number
          paused_until?: string | null
          restaurant_id?: string | null
          sent?: number
          sent_in_block?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["bulk_campaign_status"]
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          restaurant_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          restaurant_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          restaurant_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          apply_to: string
          code: string
          created_at: string
          customer_type: string
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          is_active: boolean
          min_order_value: number
          name: string
          product_ids: string[]
          restaurant_id: string
          service_delivery: boolean
          service_pickup: boolean
          show_on_menu: boolean
          starts_at: string | null
          updated_at: string
          usage_limit_per_customer: number
          usage_limit_total: number | null
          uses_count: number
        }
        Insert: {
          apply_to?: string
          code: string
          created_at?: string
          customer_type?: string
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          min_order_value?: number
          name: string
          product_ids?: string[]
          restaurant_id: string
          service_delivery?: boolean
          service_pickup?: boolean
          show_on_menu?: boolean
          starts_at?: string | null
          updated_at?: string
          usage_limit_per_customer?: number
          usage_limit_total?: number | null
          uses_count?: number
        }
        Update: {
          apply_to?: string
          code?: string
          created_at?: string
          customer_type?: string
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          min_order_value?: number
          name?: string
          product_ids?: string[]
          restaurant_id?: string
          service_delivery?: boolean
          service_pickup?: boolean
          show_on_menu?: boolean
          starts_at?: string | null
          updated_at?: string
          usage_limit_per_customer?: number
          usage_limit_total?: number | null
          uses_count?: number
        }
        Relationships: []
      }
      customers: {
        Row: {
          address_cep: string | null
          address_city: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          created_at: string
          email: string | null
          id: string
          last_order_at: string | null
          name: string
          notes: string | null
          orders_count: number
          phone: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          address_cep?: string | null
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_order_at?: string | null
          name: string
          notes?: string | null
          orders_count?: number
          phone: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          address_cep?: string | null
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_order_at?: string | null
          name?: string
          notes?: string | null
          orders_count?: number
          phone?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      evolution_integrations: {
        Row: {
          api_key: string
          api_url: string
          created_at: string
          enabled: boolean
          id: string
          instance_name: string
          is_admin: boolean
          last_check_at: string | null
          last_status: string | null
          restaurant_id: string | null
          updated_at: string
        }
        Insert: {
          api_key: string
          api_url: string
          created_at?: string
          enabled?: boolean
          id?: string
          instance_name: string
          is_admin?: boolean
          last_check_at?: string | null
          last_status?: string | null
          restaurant_id?: string | null
          updated_at?: string
        }
        Update: {
          api_key?: string
          api_url?: string
          created_at?: string
          enabled?: boolean
          id?: string
          instance_name?: string
          is_admin?: boolean
          last_check_at?: string | null
          last_status?: string | null
          restaurant_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          description: string
          expense_date: string
          id: string
          notes: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          expense_date?: string
          id?: string
          notes?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          expense_date?: string
          id?: string
          notes?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      ifood_sales: {
        Row: {
          created_at: string
          created_by: string | null
          date_from: string
          date_to: string
          fees: number
          gross_revenue: number
          id: string
          net_revenue: number
          notes: string | null
          orders_count: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_from: string
          date_to: string
          fees?: number
          gross_revenue?: number
          id?: string
          net_revenue?: number
          notes?: string | null
          orders_count?: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_from?: string
          date_to?: string
          fees?: number
          gross_revenue?: number
          id?: string
          net_revenue?: number
          notes?: string | null
          orders_count?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      ihub_events: {
        Row: {
          code: string | null
          created_at: string
          error: string | null
          event_id: string | null
          full_code: string | null
          id: string
          integration_id: string | null
          merchant_id: string | null
          order_id: string | null
          payload: Json
          processed: boolean
          restaurant_id: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          error?: string | null
          event_id?: string | null
          full_code?: string | null
          id?: string
          integration_id?: string | null
          merchant_id?: string | null
          order_id?: string | null
          payload: Json
          processed?: boolean
          restaurant_id?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          error?: string | null
          event_id?: string | null
          full_code?: string | null
          id?: string
          integration_id?: string | null
          merchant_id?: string | null
          order_id?: string | null
          payload?: Json
          processed?: boolean
          restaurant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ihub_events_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "ihub_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ihub_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      ihub_integrations: {
        Row: {
          created_at: string
          domain: string
          enabled: boolean
          id: string
          last_event_at: string | null
          last_event_code: string | null
          merchant_id: string | null
          merchant_name: string | null
          restaurant_id: string
          secret_token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain: string
          enabled?: boolean
          id?: string
          last_event_at?: string | null
          last_event_code?: string | null
          merchant_id?: string | null
          merchant_name?: string | null
          restaurant_id: string
          secret_token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain?: string
          enabled?: boolean
          id?: string
          last_event_at?: string | null
          last_event_code?: string | null
          merchant_id?: string | null
          merchant_name?: string | null
          restaurant_id?: string
          secret_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ihub_integrations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_members: {
        Row: {
          created_at: string
          id: string
          name: string
          phone: string
          points: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          phone: string
          points?: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          phone?: string
          points?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_rewards: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          points_cost: number
          product_id: string | null
          restaurant_id: string
          stock: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          points_cost?: number
          product_id?: string | null
          restaurant_id: string
          stock?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          points_cost?: number
          product_id?: string | null
          restaurant_id?: string
          stock?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_settings: {
        Row: {
          created_at: string
          enabled: boolean
          points_per_real: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          points_per_real?: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          points_per_real?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_transactions: {
        Row: {
          created_at: string
          credited_at: string | null
          id: string
          member_id: string
          order_id: string | null
          points: number
          restaurant_id: string
          status: string
          type: string
        }
        Insert: {
          created_at?: string
          credited_at?: string | null
          id?: string
          member_id: string
          order_id?: string | null
          points?: number
          restaurant_id: string
          status?: string
          type?: string
        }
        Update: {
          created_at?: string
          credited_at?: string | null
          id?: string
          member_id?: string
          order_id?: string | null
          points?: number
          restaurant_id?: string
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "loyalty_members"
            referencedColumns: ["id"]
          },
        ]
      }
      option_groups: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          max_select: number
          min_select: number
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          max_select?: number
          min_select?: number
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          max_select?: number
          min_select?: number
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      option_items: {
        Row: {
          created_at: string
          extra_price: number
          group_id: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          extra_price?: number
          group_id: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          extra_price?: number
          group_id?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "option_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "option_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address_cep: string | null
          address_city: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_notes: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          change_for: number | null
          coupon_code: string | null
          created_at: string
          customer_name: string
          customer_phone: string
          delivery_distance_km: number | null
          delivery_fee: number
          delivery_latitude: number | null
          delivery_longitude: number | null
          discount: number
          external_order_id: string | null
          external_source: string | null
          id: string
          loyalty_opt_in: boolean
          order_number: number
          order_type: Database["public"]["Enums"]["order_type"]
          payment_method: Database["public"]["Enums"]["payment_method"]
          public_token: string
          restaurant_id: string
          service_fee: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          address_cep?: string | null
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_notes?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          change_for?: number | null
          coupon_code?: string | null
          created_at?: string
          customer_name: string
          customer_phone: string
          delivery_distance_km?: number | null
          delivery_fee?: number
          delivery_latitude?: number | null
          delivery_longitude?: number | null
          discount?: number
          external_order_id?: string | null
          external_source?: string | null
          id?: string
          loyalty_opt_in?: boolean
          order_number: number
          order_type?: Database["public"]["Enums"]["order_type"]
          payment_method: Database["public"]["Enums"]["payment_method"]
          public_token?: string
          restaurant_id: string
          service_fee?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at?: string
        }
        Update: {
          address_cep?: string | null
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_notes?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          change_for?: number | null
          coupon_code?: string | null
          created_at?: string
          customer_name?: string
          customer_phone?: string
          delivery_distance_km?: number | null
          delivery_fee?: number
          delivery_latitude?: number | null
          delivery_longitude?: number | null
          discount?: number
          external_order_id?: string | null
          external_source?: string | null
          id?: string
          loyalty_opt_in?: boolean
          order_number?: number
          order_type?: Database["public"]["Enums"]["order_type"]
          payment_method?: Database["public"]["Enums"]["payment_method"]
          public_token?: string
          restaurant_id?: string
          service_fee?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_groups: {
        Row: {
          group_id: string
          product_id: string
          sort_order: number
        }
        Insert: {
          group_id: string
          product_id: string
          sort_order?: number
        }
        Update: {
          group_id?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_option_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "option_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_option_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price: number
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price: number
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price?: number
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      restaurant_members: {
        Row: {
          created_at: string
          id: string
          restaurant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          restaurant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          restaurant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_members_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          address_cep: string | null
          address_city: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          cover_url: string | null
          created_at: string
          delivery_fee_mode: string
          delivery_fixed_fee: number
          delivery_time_max: number | null
          delivery_time_min: number | null
          delivery_zones: Json
          description: string | null
          facebook_url: string | null
          id: string
          instagram_url: string | null
          is_open: boolean
          kitchen_print_settings: Json
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          manual_override: Json | null
          name: string
          opening_hours: Json
          order_acceptance_mode: string
          order_receive_mode: string
          owner_id: string | null
          phone: string | null
          print_settings: Json
          service_delivery: boolean
          service_pickup: boolean
          slug: string
          updated_at: string
          whatsapp_url: string | null
        }
        Insert: {
          address_cep?: string | null
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          cover_url?: string | null
          created_at?: string
          delivery_fee_mode?: string
          delivery_fixed_fee?: number
          delivery_time_max?: number | null
          delivery_time_min?: number | null
          delivery_zones?: Json
          description?: string | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          is_open?: boolean
          kitchen_print_settings?: Json
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          manual_override?: Json | null
          name: string
          opening_hours?: Json
          order_acceptance_mode?: string
          order_receive_mode?: string
          owner_id?: string | null
          phone?: string | null
          print_settings?: Json
          service_delivery?: boolean
          service_pickup?: boolean
          slug: string
          updated_at?: string
          whatsapp_url?: string | null
        }
        Update: {
          address_cep?: string | null
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          cover_url?: string | null
          created_at?: string
          delivery_fee_mode?: string
          delivery_fixed_fee?: number
          delivery_time_max?: number | null
          delivery_time_min?: number | null
          delivery_zones?: Json
          description?: string | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          is_open?: boolean
          kitchen_print_settings?: Json
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          manual_override?: Json | null
          name?: string
          opening_hours?: Json
          order_acceptance_mode?: string
          order_receive_mode?: string
          owner_id?: string | null
          phone?: string | null
          print_settings?: Json
          service_delivery?: boolean
          service_pickup?: boolean
          slug?: string
          updated_at?: string
          whatsapp_url?: string | null
        }
        Relationships: []
      }
      supply_order_item_options: {
        Row: {
          created_at: string
          id: string
          option_name: string
          quantity: number
          supply_order_item_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_name: string
          quantity: number
          supply_order_item_id: string
        }
        Update: {
          created_at?: string
          id?: string
          option_name?: string
          quantity?: number
          supply_order_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_order_item_options_supply_order_item_id_fkey"
            columns: ["supply_order_item_id"]
            isOneToOne: false
            referencedRelation: "supply_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_order_items: {
        Row: {
          created_at: string
          id: string
          product_id: string | null
          product_name: string
          quantity: number
          supply_order_id: string
          unit: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id?: string | null
          product_name: string
          quantity: number
          supply_order_id: string
          unit?: string | null
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          supply_order_id?: string
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "supply_order_items_supply_order_id_fkey"
            columns: ["supply_order_id"]
            isOneToOne: false
            referencedRelation: "supply_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_orders: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          id: string
          notes: string | null
          restaurant_id: string
          shipped_at: string | null
          status: Database["public"]["Enums"]["supply_order_status"]
          total: number
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          id?: string
          notes?: string | null
          restaurant_id: string
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["supply_order_status"]
          total?: number
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          id?: string
          notes?: string | null
          restaurant_id?: string
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["supply_order_status"]
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      supply_product_options: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          product_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          product_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "supply_product_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "supply_products"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_products: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price: number
          quantity_step: number
          sort_order: number
          total_quantity: number | null
          unit: string
          updated_at: string
          variant_group_name: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price?: number
          quantity_step?: number
          sort_order?: number
          total_quantity?: number | null
          unit?: string
          updated_at?: string
          variant_group_name?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price?: number
          quantity_step?: number
          sort_order?: number
          total_quantity?: number | null
          unit?: string
          updated_at?: string
          variant_group_name?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      credit_loyalty_points: { Args: { _tx_id: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_restaurant_manager: {
        Args: { _restaurant_id: string; _user_id: string }
        Returns: boolean
      }
      redeem_loyalty_points: {
        Args: { _member_id: string; _restaurant_id: string; _reward_id: string }
        Returns: string
      }
      upsert_customer_on_order: {
        Args: {
          _address_cep?: string
          _address_city?: string
          _address_complement?: string
          _address_neighborhood?: string
          _address_number?: string
          _address_state?: string
          _address_street?: string
          _name: string
          _phone: string
          _restaurant_id: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "master_admin" | "manager" | "customer"
      bulk_campaign_status:
        | "draft"
        | "running"
        | "paused"
        | "completed"
        | "failed"
      bulk_recipient_status: "pending" | "sent" | "failed"
      order_status:
        | "pending"
        | "accepted"
        | "preparing"
        | "out_for_delivery"
        | "delivered"
        | "cancelled"
        | "awaiting_pickup"
      order_type: "delivery" | "pickup" | "pdv"
      payment_method: "cash" | "pix" | "card_on_delivery"
      supply_order_status: "pending" | "accepted" | "shipped" | "delivered"
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
      app_role: ["master_admin", "manager", "customer"],
      bulk_campaign_status: [
        "draft",
        "running",
        "paused",
        "completed",
        "failed",
      ],
      bulk_recipient_status: ["pending", "sent", "failed"],
      order_status: [
        "pending",
        "accepted",
        "preparing",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "awaiting_pickup",
      ],
      order_type: ["delivery", "pickup", "pdv"],
      payment_method: ["cash", "pix", "card_on_delivery"],
      supply_order_status: ["pending", "accepted", "shipped", "delivered"],
    },
  },
} as const
