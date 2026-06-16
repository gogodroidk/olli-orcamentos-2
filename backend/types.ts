// Tipos gerados automaticamente a partir do schema do Supabase (projeto OLLI ORCAMENTOS).
// Fonte canônica do schema. Regere após mudanças (Supabase CLI: `supabase gen types typescript`).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      backups: {
        Row: {
          data: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          data?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          data?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          cep: string | null
          cidade: string | null
          cnpj: string | null
          complemento: string | null
          cpf: string | null
          criado_em: string
          endereco: string | null
          estado: string | null
          id: string
          nome: string
          telefone: string | null
          user_id: string
        }
        Insert: {
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          complemento?: string | null
          cpf?: string | null
          criado_em?: string
          endereco?: string | null
          estado?: string | null
          id: string
          nome: string
          telefone?: string | null
          user_id?: string
        }
        Update: {
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          complemento?: string | null
          cpf?: string | null
          criado_em?: string
          endereco?: string | null
          estado?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      contadores: {
        Row: {
          chave: string
          user_id: string
          valor: number
        }
        Insert: {
          chave: string
          user_id?: string
          valor?: number
        }
        Update: {
          chave?: string
          user_id?: string
          valor?: number
        }
        Relationships: []
      }
      depoimentos: {
        Row: {
          criado_em: string
          estrelas: number
          id: string
          nome_cliente: string
          texto: string | null
          user_id: string
        }
        Insert: {
          criado_em?: string
          estrelas?: number
          id: string
          nome_cliente: string
          texto?: string | null
          user_id?: string
        }
        Update: {
          criado_em?: string
          estrelas?: number
          id?: string
          nome_cliente?: string
          texto?: string | null
          user_id?: string
        }
        Relationships: []
      }
      empresa: {
        Row: {
          atualizado_em: string
          dados: Json
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          dados: Json
          user_id?: string
        }
        Update: {
          atualizado_em?: string
          dados?: Json
          user_id?: string
        }
        Relationships: []
      }
      modelos: {
        Row: {
          criado_em: string
          dados: Json
          descricao: string | null
          id: string
          nome: string
          user_id: string
        }
        Insert: {
          criado_em?: string
          dados: Json
          descricao?: string | null
          id: string
          nome: string
          user_id?: string
        }
        Update: {
          criado_em?: string
          dados?: Json
          descricao?: string | null
          id?: string
          nome?: string
          user_id?: string
        }
        Relationships: []
      }
      orcamentos: {
        Row: {
          atualizado_em: string
          cliente_id: string | null
          cliente_nome: string | null
          criado_em: string
          dados: Json
          data_emissao: string | null
          desconto: number
          id: string
          numero: string
          status: string
          subtotal: number
          user_id: string
          valor_total: number
        }
        Insert: {
          atualizado_em?: string
          cliente_id?: string | null
          cliente_nome?: string | null
          criado_em?: string
          dados: Json
          data_emissao?: string | null
          desconto?: number
          id: string
          numero: string
          status?: string
          subtotal?: number
          user_id?: string
          valor_total?: number
        }
        Update: {
          atualizado_em?: string
          cliente_id?: string | null
          cliente_nome?: string | null
          criado_em?: string
          dados?: Json
          data_emissao?: string | null
          desconto?: number
          id?: string
          numero?: string
          status?: string
          subtotal?: number
          user_id?: string
          valor_total?: number
        }
        Relationships: []
      }
      produtos: {
        Row: {
          criado_em: string
          custo: number | null
          descricao: string | null
          foto_uri: string | null
          id: string
          marca: string | null
          modelo: string | null
          nome: string
          preco: number
          unidade: string | null
          user_id: string
        }
        Insert: {
          criado_em?: string
          custo?: number | null
          descricao?: string | null
          foto_uri?: string | null
          id: string
          marca?: string | null
          modelo?: string | null
          nome: string
          preco?: number
          unidade?: string | null
          user_id?: string
        }
        Update: {
          criado_em?: string
          custo?: number | null
          descricao?: string | null
          foto_uri?: string | null
          id?: string
          marca?: string | null
          modelo?: string | null
          nome?: string
          preco?: number
          unidade?: string | null
          user_id?: string
        }
        Relationships: []
      }
      recibos: {
        Row: {
          cliente_id: string | null
          cliente_nome: string | null
          criado_em: string
          dados: Json
          data_recebimento: string | null
          forma_pagamento: string | null
          id: string
          numero: string
          orcamento_id: string | null
          user_id: string
          valor_recebido: number
        }
        Insert: {
          cliente_id?: string | null
          cliente_nome?: string | null
          criado_em?: string
          dados: Json
          data_recebimento?: string | null
          forma_pagamento?: string | null
          id: string
          numero: string
          orcamento_id?: string | null
          user_id?: string
          valor_recebido?: number
        }
        Update: {
          cliente_id?: string | null
          cliente_nome?: string | null
          criado_em?: string
          dados?: Json
          data_recebimento?: string | null
          forma_pagamento?: string | null
          id?: string
          numero?: string
          orcamento_id?: string | null
          user_id?: string
          valor_recebido?: number
        }
        Relationships: []
      }
      servicos: {
        Row: {
          criado_em: string
          custo: number | null
          descricao: string | null
          foto_uri: string | null
          id: string
          nome: string
          preco: number
          unidade: string | null
          user_id: string
        }
        Insert: {
          criado_em?: string
          custo?: number | null
          descricao?: string | null
          foto_uri?: string | null
          id: string
          nome: string
          preco?: number
          unidade?: string | null
          user_id?: string
        }
        Update: {
          criado_em?: string
          custo?: number | null
          descricao?: string | null
          foto_uri?: string | null
          id?: string
          nome?: string
          preco?: number
          unidade?: string | null
          user_id?: string
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
