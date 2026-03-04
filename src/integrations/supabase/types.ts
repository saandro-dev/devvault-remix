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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          environment: Database["public"]["Enums"]["project_environment"]
          folder_id: string | null
          id: string
          key_value: string
          label: string
          project_id: string
          user_id: string
          vault_secret_id: string | null
        }
        Insert: {
          created_at?: string
          environment?: Database["public"]["Enums"]["project_environment"]
          folder_id?: string | null
          id?: string
          key_value: string
          label: string
          project_id: string
          user_id: string
          vault_secret_id?: string | null
        }
        Update: {
          created_at?: string
          environment?: Database["public"]["Enums"]["project_environment"]
          folder_id?: string | null
          id?: string
          key_value?: string
          label?: string
          project_id?: string
          user_id?: string
          vault_secret_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "key_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      bugs: {
        Row: {
          cause_code: string | null
          created_at: string
          id: string
          project_id: string | null
          solution: string | null
          status: Database["public"]["Enums"]["bug_status"]
          symptom: string
          tags: string[]
          title: string
          updated_at: string
          user_id: string
          vault_module_id: string | null
        }
        Insert: {
          cause_code?: string | null
          created_at?: string
          id?: string
          project_id?: string | null
          solution?: string | null
          status?: Database["public"]["Enums"]["bug_status"]
          symptom: string
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
          vault_module_id?: string | null
        }
        Update: {
          cause_code?: string | null
          created_at?: string
          id?: string
          project_id?: string | null
          solution?: string | null
          status?: Database["public"]["Enums"]["bug_status"]
          symptom?: string
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
          vault_module_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bugs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bugs_vault_module_id_fkey"
            columns: ["vault_module_id"]
            isOneToOne: false
            referencedRelation: "vault_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      devvault_api_audit_log: {
        Row: {
          action: string
          api_key_id: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          http_status: number | null
          id: number
          ip_address: string | null
          processing_time_ms: number | null
          request_body: Json | null
          success: boolean
          user_id: string
        }
        Insert: {
          action: string
          api_key_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: never
          ip_address?: string | null
          processing_time_ms?: number | null
          request_body?: Json | null
          success?: boolean
          user_id: string
        }
        Update: {
          action?: string
          api_key_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: never
          ip_address?: string | null
          processing_time_ms?: number | null
          request_body?: Json | null
          success?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devvault_api_audit_log_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "devvault_api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      devvault_api_keys: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          key_name: string
          key_prefix: string
          last_used_at: string | null
          revoked_at: string | null
          user_id: string
          vault_secret_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          key_name: string
          key_prefix: string
          last_used_at?: string | null
          revoked_at?: string | null
          user_id: string
          vault_secret_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          key_name?: string
          key_prefix?: string
          last_used_at?: string | null
          revoked_at?: string | null
          user_id?: string
          vault_secret_id?: string
        }
        Relationships: []
      }
      devvault_api_rate_limits: {
        Row: {
          action: string
          attempts: number
          blocked_until: string | null
          identifier: string
          last_attempt_at: string
        }
        Insert: {
          action: string
          attempts?: number
          blocked_until?: string | null
          identifier: string
          last_attempt_at?: string
        }
        Update: {
          action?: string
          attempts?: number
          blocked_until?: string | null
          identifier?: string
          last_attempt_at?: string
        }
        Relationships: []
      }
      domain_inference_keywords: {
        Row: {
          created_at: string | null
          domain: string
          id: string
          keyword: string
          priority: number | null
        }
        Insert: {
          created_at?: string | null
          domain: string
          id?: string
          keyword: string
          priority?: number | null
        }
        Update: {
          created_at?: string | null
          domain?: string
          id?: string
          keyword?: string
          priority?: number | null
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          user_id: string
          vault_module_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          vault_module_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          vault_module_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_vault_module_id_fkey"
            columns: ["vault_module_id"]
            isOneToOne: false
            referencedRelation: "vault_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      key_folders: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "key_folders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          color: string
          created_at: string
          description: string | null
          icon: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shared_snippets: {
        Row: {
          id: string
          shared_at: string
          user_id: string
          vault_module_id: string
        }
        Insert: {
          id?: string
          shared_at?: string
          user_id: string
          vault_module_id: string
        }
        Update: {
          id?: string
          shared_at?: string
          user_id?: string
          vault_module_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_snippets_vault_module_id_fkey"
            columns: ["vault_module_id"]
            isOneToOne: false
            referencedRelation: "vault_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vault_agent_tasks: {
        Row: {
          api_key_id: string | null
          completed_at: string | null
          context: Json
          duration_ms: number | null
          id: string
          modules_used: string[]
          objective: string
          outcome_notes: string | null
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          api_key_id?: string | null
          completed_at?: string | null
          context?: Json
          duration_ms?: number | null
          id?: string
          modules_used?: string[]
          objective: string
          outcome_notes?: string | null
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          api_key_id?: string | null
          completed_at?: string | null
          context?: Json
          duration_ms?: number | null
          id?: string
          modules_used?: string[]
          objective?: string
          outcome_notes?: string | null
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      vault_knowledge_gaps: {
        Row: {
          context: string | null
          created_at: string
          domain: string | null
          error_message: string
          hit_count: number
          id: string
          promoted_module_id: string | null
          reported_by: string | null
          resolution: string | null
          resolution_code: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          context?: string | null
          created_at?: string
          domain?: string | null
          error_message: string
          hit_count?: number
          id?: string
          promoted_module_id?: string | null
          reported_by?: string | null
          resolution?: string | null
          resolution_code?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          context?: string | null
          created_at?: string
          domain?: string | null
          error_message?: string
          hit_count?: number
          id?: string
          promoted_module_id?: string | null
          reported_by?: string | null
          resolution?: string | null
          resolution_code?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_knowledge_gaps_promoted_module_id_fkey"
            columns: ["promoted_module_id"]
            isOneToOne: false
            referencedRelation: "vault_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_mandatory_rules: {
        Row: {
          condition_description: string | null
          created_at: string
          enabled: boolean
          enforcement: Database["public"]["Enums"]["mandatory_enforcement"]
          id: string
          is_conditional: boolean
          layer: number
          layer_name: string
          module_id: string
          reason: string
          scope: Database["public"]["Enums"]["mandatory_scope"]
          scope_value: string | null
          updated_at: string
        }
        Insert: {
          condition_description?: string | null
          created_at?: string
          enabled?: boolean
          enforcement?: Database["public"]["Enums"]["mandatory_enforcement"]
          id?: string
          is_conditional?: boolean
          layer?: number
          layer_name?: string
          module_id: string
          reason: string
          scope?: Database["public"]["Enums"]["mandatory_scope"]
          scope_value?: string | null
          updated_at?: string
        }
        Update: {
          condition_description?: string | null
          created_at?: string
          enabled?: boolean
          enforcement?: Database["public"]["Enums"]["mandatory_enforcement"]
          id?: string
          is_conditional?: boolean
          layer?: number
          layer_name?: string
          module_id?: string
          reason?: string
          scope?: Database["public"]["Enums"]["mandatory_scope"]
          scope_value?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_mandatory_rules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: true
            referencedRelation: "vault_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_module_changelog: {
        Row: {
          changes: string[]
          created_at: string
          id: string
          module_id: string
          version: string
        }
        Insert: {
          changes?: string[]
          created_at?: string
          id?: string
          module_id: string
          version: string
        }
        Update: {
          changes?: string[]
          created_at?: string
          id?: string
          module_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_module_changelog_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "vault_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_module_dependencies: {
        Row: {
          created_at: string
          dependency_type: string
          depends_on_id: string
          id: string
          module_id: string
        }
        Insert: {
          created_at?: string
          dependency_type?: string
          depends_on_id: string
          id?: string
          module_id: string
        }
        Update: {
          created_at?: string
          dependency_type?: string
          depends_on_id?: string
          id?: string
          module_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_module_dependencies_depends_on_id_fkey"
            columns: ["depends_on_id"]
            isOneToOne: false
            referencedRelation: "vault_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_module_dependencies_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "vault_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_module_shares: {
        Row: {
          created_at: string
          module_id: string
          shared_by_user_id: string
          shared_with_user_id: string
        }
        Insert: {
          created_at?: string
          module_id: string
          shared_by_user_id: string
          shared_with_user_id: string
        }
        Update: {
          created_at?: string
          module_id?: string
          shared_by_user_id?: string
          shared_with_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_module_shares_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "vault_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_modules: {
        Row: {
          ai_metadata: Json
          category: Database["public"]["Enums"]["vault_category"]
          code: string
          code_example: string | null
          common_errors: Json | null
          context_markdown: string | null
          created_at: string
          database_schema: string | null
          dependencies: string | null
          description: string | null
          difficulty: string | null
          domain: Database["public"]["Enums"]["vault_domain"] | null
          embedding: string | null
          estimated_minutes: number | null
          id: string
          implementation_order: number | null
          language: string
          module_group: string | null
          module_type: Database["public"]["Enums"]["vault_module_type"] | null
          next_steps: Json[] | null
          phase_title: string | null
          prerequisites: Json[] | null
          related_modules: string[] | null
          saas_phase: number | null
          search_vector: unknown
          search_vector_en: unknown
          slug: string | null
          solves_problems: string[] | null
          source_project: string | null
          tags: string[]
          test_code: string | null
          title: string
          updated_at: string
          usage_hint: string | null
          user_id: string
          validation_status:
            | Database["public"]["Enums"]["vault_validation_status"]
            | null
          version: string | null
          visibility: Database["public"]["Enums"]["visibility_level"]
          why_it_matters: string | null
        }
        Insert: {
          ai_metadata?: Json
          category?: Database["public"]["Enums"]["vault_category"]
          code?: string
          code_example?: string | null
          common_errors?: Json | null
          context_markdown?: string | null
          created_at?: string
          database_schema?: string | null
          dependencies?: string | null
          description?: string | null
          difficulty?: string | null
          domain?: Database["public"]["Enums"]["vault_domain"] | null
          embedding?: string | null
          estimated_minutes?: number | null
          id?: string
          implementation_order?: number | null
          language?: string
          module_group?: string | null
          module_type?: Database["public"]["Enums"]["vault_module_type"] | null
          next_steps?: Json[] | null
          phase_title?: string | null
          prerequisites?: Json[] | null
          related_modules?: string[] | null
          saas_phase?: number | null
          search_vector?: unknown
          search_vector_en?: unknown
          slug?: string | null
          solves_problems?: string[] | null
          source_project?: string | null
          tags?: string[]
          test_code?: string | null
          title: string
          updated_at?: string
          usage_hint?: string | null
          user_id: string
          validation_status?:
            | Database["public"]["Enums"]["vault_validation_status"]
            | null
          version?: string | null
          visibility?: Database["public"]["Enums"]["visibility_level"]
          why_it_matters?: string | null
        }
        Update: {
          ai_metadata?: Json
          category?: Database["public"]["Enums"]["vault_category"]
          code?: string
          code_example?: string | null
          common_errors?: Json | null
          context_markdown?: string | null
          created_at?: string
          database_schema?: string | null
          dependencies?: string | null
          description?: string | null
          difficulty?: string | null
          domain?: Database["public"]["Enums"]["vault_domain"] | null
          embedding?: string | null
          estimated_minutes?: number | null
          id?: string
          implementation_order?: number | null
          language?: string
          module_group?: string | null
          module_type?: Database["public"]["Enums"]["vault_module_type"] | null
          next_steps?: Json[] | null
          phase_title?: string | null
          prerequisites?: Json[] | null
          related_modules?: string[] | null
          saas_phase?: number | null
          search_vector?: unknown
          search_vector_en?: unknown
          slug?: string | null
          solves_problems?: string[] | null
          source_project?: string | null
          tags?: string[]
          test_code?: string | null
          title?: string
          updated_at?: string
          usage_hint?: string | null
          user_id?: string
          validation_status?:
            | Database["public"]["Enums"]["vault_validation_status"]
            | null
          version?: string | null
          visibility?: Database["public"]["Enums"]["visibility_level"]
          why_it_matters?: string | null
        }
        Relationships: []
      }
      vault_playbook_modules: {
        Row: {
          created_at: string
          id: string
          module_id: string
          notes: string | null
          playbook_id: string
          position: number
        }
        Insert: {
          created_at?: string
          id?: string
          module_id: string
          notes?: string | null
          playbook_id: string
          position: number
        }
        Update: {
          created_at?: string
          id?: string
          module_id?: string
          notes?: string | null
          playbook_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "vault_playbook_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "vault_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_playbook_modules_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "vault_playbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_playbooks: {
        Row: {
          created_at: string
          description: string | null
          difficulty: string | null
          domain: Database["public"]["Enums"]["vault_domain"] | null
          id: string
          slug: string
          status: string
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          difficulty?: string | null
          domain?: Database["public"]["Enums"]["vault_domain"] | null
          id?: string
          slug: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          difficulty?: string | null
          domain?: Database["public"]["Enums"]["vault_domain"] | null
          id?: string
          slug?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vault_usage_events: {
        Row: {
          api_key_id: string | null
          created_at: string
          event_type: string
          id: string
          module_id: string | null
          query_text: string | null
          result_count: number | null
          tool_name: string
          user_id: string | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          module_id?: string | null
          query_text?: string | null
          result_count?: number | null
          tool_name: string
          user_id?: string | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          module_id?: string | null
          query_text?: string | null
          result_count?: number | null
          tool_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vault_usage_events_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "vault_modules"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bootstrap_vault_context: { Args: never; Returns: Json }
      check_duplicate_modules: {
        Args: { p_limit?: number; p_threshold?: number; p_title: string }
        Returns: {
          domain: string
          id: string
          module_type: string
          similarity_score: number
          slug: string
          title: string
        }[]
      }
      create_devvault_api_key: {
        Args: { p_key_name: string; p_raw_key: string; p_user_id: string }
        Returns: string
      }
      delete_project_api_key: {
        Args: { p_key_id: string; p_user_id: string }
        Returns: boolean
      }
      export_module_tree: { Args: { p_root_id: string }; Returns: Json }
      fetch_modules_without_changelog: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
          id: string
          title: string
          version: string
        }[]
      }
      find_similar_modules: {
        Args: { p_limit?: number; p_module_id: string; p_threshold?: number }
        Returns: {
          description: string
          domain: string
          id: string
          module_type: string
          similarity_score: number
          slug: string
          tags: string[]
          title: string
        }[]
      }
      get_domain_counts: {
        Args: { p_scope?: string; p_user_id: string }
        Returns: {
          count: number
          domain: string
          grand_total: number
        }[]
      }
      get_mandatory_modules: {
        Args: { p_layer?: number; p_scope?: string; p_scope_value?: string }
        Returns: Json
      }
      get_user_id_by_email: { Args: { p_email: string }; Returns: string }
      get_user_role: { Args: { _user_id: string }; Returns: string }
      get_vault_module: {
        Args: { p_id?: string; p_slug?: string }
        Returns: {
          ai_metadata: Json
          code: string
          code_example: string
          common_errors: Json
          context_markdown: string
          created_at: string
          database_schema: string
          description: string
          difficulty: string
          domain: string
          estimated_minutes: number
          id: string
          language: string
          module_type: string
          phase_title: string
          prerequisites: Json[]
          related_modules: string[]
          saas_phase: number
          slug: string
          solves_problems: string[]
          source_project: string
          tags: string[]
          test_code: string
          title: string
          updated_at: string
          usage_hint: string
          validation_status: string
          why_it_matters: string
        }[]
      }
      get_visible_modules: {
        Args: {
          p_domain?: string
          p_limit?: number
          p_module_type?: string
          p_offset?: number
          p_query?: string
          p_scope?: string
          p_user_id: string
        }
        Returns: {
          ai_metadata: Json
          code_example: string
          created_at: string
          description: string
          domain: string
          id: string
          language: string
          module_type: string
          phase_title: string
          related_modules: string[]
          saas_phase: number
          source_project: string
          tags: string[]
          title: string
          total_count: number
          updated_at: string
          usage_hint: string
          validation_status: string
          visibility: string
          why_it_matters: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hybrid_search_vault_modules: {
        Args: {
          p_domain?: string
          p_full_text_weight?: number
          p_match_count?: number
          p_module_type?: string
          p_query_embedding?: string
          p_query_text?: string
          p_semantic_weight?: number
          p_tags?: string[]
        }
        Returns: {
          ai_metadata: Json
          code: string
          code_example: string
          context_markdown: string
          created_at: string
          description: string
          difficulty: string
          domain: string
          estimated_minutes: number
          id: string
          language: string
          module_type: string
          phase_title: string
          related_modules: string[]
          relevance_score: number
          saas_phase: number
          slug: string
          source_project: string
          tags: string[]
          title: string
          updated_at: string
          usage_hint: string
          validation_status: string
          why_it_matters: string
        }[]
      }
      infer_domain_from_text: { Args: { p_text: string }; Returns: string }
      is_admin_or_owner: { Args: { _user_id: string }; Returns: boolean }
      list_vault_domains: {
        Args: never
        Returns: {
          domain: string
          module_types: string[]
          total: number
        }[]
      }
      match_common_errors: {
        Args: { p_domain?: string; p_error_text: string; p_limit?: number }
        Returns: {
          difficulty: string
          domain: string
          error_cause: string
          estimated_minutes: number
          id: string
          matched_error: string
          quick_fix: string
          slug: string
          title: string
        }[]
      }
      match_solves_problems: {
        Args: {
          p_domain?: string
          p_error_text: string
          p_limit?: number
          p_tokens?: string[]
        }
        Returns: {
          difficulty: string
          domain: string
          estimated_minutes: number
          id: string
          match_quality: string
          matched_problem: string
          slug: string
          title: string
        }[]
      }
      query_vault_modules: {
        Args: {
          p_domain?: string
          p_group?: string
          p_limit?: number
          p_module_type?: string
          p_offset?: number
          p_query?: string
          p_saas_phase?: number
          p_tags?: string[]
        }
        Returns: {
          ai_metadata: Json
          code: string
          code_example: string
          context_markdown: string
          created_at: string
          description: string
          difficulty: string
          domain: string
          estimated_minutes: number
          id: string
          language: string
          module_type: string
          phase_title: string
          related_modules: string[]
          relevance_score: number
          saas_phase: number
          slug: string
          source_project: string
          tags: string[]
          title: string
          total_count: number
          updated_at: string
          usage_hint: string
          validation_status: string
          why_it_matters: string
        }[]
      }
      read_project_api_key: {
        Args: { p_key_id: string; p_user_id: string }
        Returns: string
      }
      revoke_devvault_api_key: {
        Args: { p_key_id: string; p_user_id: string }
        Returns: boolean
      }
      search_vault_modules: {
        Args: {
          p_domain?: Database["public"]["Enums"]["vault_domain"]
          p_limit?: number
          p_module_type?: Database["public"]["Enums"]["vault_module_type"]
          p_offset?: number
          p_query?: string
          p_saas_phase?: number
          p_source?: string
          p_user_id: string
          p_validated?: boolean
        }
        Returns: {
          code_example: string
          created_at: string
          description: string
          domain: Database["public"]["Enums"]["vault_domain"]
          id: string
          language: string
          module_type: Database["public"]["Enums"]["vault_module_type"]
          phase_title: string
          related_modules: string[]
          saas_phase: number
          source_project: string
          tags: string[]
          title: string
          total_count: number
          updated_at: string
          validation_status: Database["public"]["Enums"]["vault_validation_status"]
          why_it_matters: string
        }[]
      }
      store_project_api_key: {
        Args: {
          p_environment?: string
          p_folder_id: string
          p_key_value: string
          p_label: string
          p_project_id: string
          p_user_id: string
        }
        Returns: string
      }
      validate_devvault_api_key: {
        Args: { p_raw_key: string }
        Returns: {
          key_id: string
          owner_id: string
        }[]
      }
      vault_module_completeness: {
        Args: { p_id: string }
        Returns: {
          missing_fields: string[]
          score: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "owner"
      bug_status: "open" | "resolved"
      mandatory_enforcement: "hard" | "soft"
      mandatory_scope: "global" | "domain" | "project_type"
      project_environment: "dev" | "staging" | "prod"
      vault_category: "frontend" | "backend" | "devops" | "security"
      vault_domain:
        | "security"
        | "backend"
        | "frontend"
        | "architecture"
        | "devops"
        | "saas_playbook"
      vault_module_type:
        | "code_snippet"
        | "full_module"
        | "sql_migration"
        | "architecture_doc"
        | "playbook_phase"
        | "pattern_guide"
      vault_validation_status: "draft" | "validated" | "deprecated"
      visibility_level: "private" | "shared" | "global"
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
      app_role: ["admin", "moderator", "user", "owner"],
      bug_status: ["open", "resolved"],
      mandatory_enforcement: ["hard", "soft"],
      mandatory_scope: ["global", "domain", "project_type"],
      project_environment: ["dev", "staging", "prod"],
      vault_category: ["frontend", "backend", "devops", "security"],
      vault_domain: [
        "security",
        "backend",
        "frontend",
        "architecture",
        "devops",
        "saas_playbook",
      ],
      vault_module_type: [
        "code_snippet",
        "full_module",
        "sql_migration",
        "architecture_doc",
        "playbook_phase",
        "pattern_guide",
      ],
      vault_validation_status: ["draft", "validated", "deprecated"],
      visibility_level: ["private", "shared", "global"],
    },
  },
} as const
