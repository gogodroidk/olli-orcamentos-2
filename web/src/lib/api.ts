/**
 * Typed CRUD helpers, one group per table.
 *
 * The Supabase client is untyped (see supabase.ts); typing lives here. Generic
 * builders below take the table name and the row/input types as parameters, so
 * every table gets list/get/upsert/remove without repetition while call sites
 * stay fully typed.
 *
 * Conventions:
 *  - We never send `user_id` on writes — RLS fills it from auth.uid(). The
 *    Input types are `Omit<Row, 'user_id'>`, so callers pass the row without it.
 *  - Upsert uses the correct conflict target per table:
 *      empresa     -> user_id (one row per user)
 *      contadores  -> user_id,chave (composite key)
 *      everything else -> id (TEXT PK)
 */
import { supabase } from './supabase';
import type {
  ClienteRow,
  ClienteInput,
  ServicoRow,
  ServicoInput,
  ProdutoRow,
  ProdutoInput,
  OrcamentoRow,
  OrcamentoInput,
  ReciboRow,
  ReciboInput,
  ModeloRow,
  ModeloInput,
  DepoimentoRow,
  DepoimentoInput,
  EmpresaRow,
  EmpresaInput,
  ContadorRow,
  ContadorInput,
} from './types';

type SupaResult<T> = { data: T; error: { message: string } | null };

/** Throw on a Supabase error; otherwise return the data. */
function unwrap<T>(res: SupaResult<T>): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Order spec: a column and direction for list() ordering. */
interface ListOrder {
  column: string;
  ascending: boolean;
}

/**
 * Builds list/get/upsert/remove for a standard id-keyed table.
 * `Row` is the full row type; `Input` is the writable shape (no user_id).
 */
function makeTableApi<Row, Input>(table: string, order: ListOrder) {
  return {
    async list(): Promise<Row[]> {
      const res = (await supabase
        .from(table)
        .select('*')
        .order(order.column, { ascending: order.ascending })) as SupaResult<Row[] | null>;
      return unwrap(res) ?? [];
    },
    async get(id: string): Promise<Row | null> {
      const res = (await supabase
        .from(table)
        .select('*')
        .eq('id', id)
        .maybeSingle()) as SupaResult<Row | null>;
      return unwrap(res);
    },
    async upsert(record: Input): Promise<Row> {
      // The untyped client can't infer single-vs-array from a generic Input,
      // so we widen the argument here. The public signature stays typed.
      const res = (await supabase
        .from(table)
        .upsert(record as Record<string, unknown>, { onConflict: 'id' })
        .select()
        .single()) as SupaResult<Row>;
      return unwrap(res);
    },
    async remove(id: string): Promise<void> {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
  };
}

// ─── Standard id-keyed tables ────────────────────────────────────────────────
export const clientesApi = makeTableApi<ClienteRow, ClienteInput>('clientes', {
  column: 'nome',
  ascending: true,
});

export const servicosApi = makeTableApi<ServicoRow, ServicoInput>('servicos', {
  column: 'nome',
  ascending: true,
});

export const produtosApi = makeTableApi<ProdutoRow, ProdutoInput>('produtos', {
  column: 'nome',
  ascending: true,
});

export const orcamentosApi = makeTableApi<OrcamentoRow, OrcamentoInput>('orcamentos', {
  column: 'criado_em',
  ascending: false,
});

export const recibosApi = makeTableApi<ReciboRow, ReciboInput>('recibos', {
  column: 'criado_em',
  ascending: false,
});

export const modelosApi = makeTableApi<ModeloRow, ModeloInput>('modelos', {
  column: 'criado_em',
  ascending: false,
});

export const depoimentosApi = makeTableApi<DepoimentoRow, DepoimentoInput>('depoimentos', {
  column: 'criado_em',
  ascending: false,
});

// ─── empresa (one row per user; conflict on user_id) ─────────────────────────
export const empresaApi = {
  /** The current user's company profile, or null if not set up yet. */
  async get(): Promise<EmpresaRow | null> {
    const res = (await supabase
      .from('empresa')
      .select('*')
      .maybeSingle()) as SupaResult<EmpresaRow | null>;
    return unwrap(res);
  },
  /** Upsert the single company row. user_id is filled by RLS default. */
  async upsert(empresa: EmpresaInput): Promise<EmpresaRow> {
    const res = (await supabase
      .from('empresa')
      .upsert(empresa, { onConflict: 'user_id' })
      .select()
      .single()) as SupaResult<EmpresaRow>;
    return unwrap(res);
  },
};

// ─── contadores (composite key user_id,chave) ────────────────────────────────
export const contadoresApi = {
  async list(): Promise<ContadorRow[]> {
    const res = (await supabase.from('contadores').select('*')) as SupaResult<
      ContadorRow[] | null
    >;
    return unwrap(res) ?? [];
  },
  async get(chave: string): Promise<ContadorRow | null> {
    const res = (await supabase
      .from('contadores')
      .select('*')
      .eq('chave', chave)
      .maybeSingle()) as SupaResult<ContadorRow | null>;
    return unwrap(res);
  },
  async upsert(contador: ContadorInput): Promise<ContadorRow> {
    const res = (await supabase
      .from('contadores')
      .upsert(contador, { onConflict: 'user_id,chave' })
      .select()
      .single()) as SupaResult<ContadorRow>;
    return unwrap(res);
  },
  async remove(chave: string): Promise<void> {
    const { error } = await supabase.from('contadores').delete().eq('chave', chave);
    if (error) throw new Error(error.message);
  },
};
