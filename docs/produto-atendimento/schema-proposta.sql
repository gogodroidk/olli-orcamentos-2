-- NÃO APLICAR.
-- Proposta GV-PRODUTO-ATENDIMENTO, 13/11/2026. Fora da pasta de migrations de propósito.
-- Só entra no banco depois do parecer do Dr. Paulo, de ordem do Igor e de uma janela de migration.
-- Não guarda conversa, telefone, nome, chave Pix nem texto de cliente.
-- O número do WhatsApp, se um dia for preciso achar a instância, entra como hash fora desta tabela.

-- Uma conta de atendimento por cliente da OLLI. Não reutiliza a conta única
-- da Central de hoje (OLLI, GR Tech, Segundo Andar e Pessoal no mesmo lugar).
create table if not exists public.atendimento_conta (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 'qr_piloto' ou 'oficial_embedded'. Sem os dois, a linha não nasce.
  canal text not null check (canal in ('qr_piloto', 'oficial_embedded')),
  criado_em timestamptz not null default now(),
  encerrado_em timestamptz
);

-- Prova dos 9 aceites do QR. Oficial não usa esta tabela.
create table if not exists public.atendimento_aceite_qr (
  conta_id uuid not null references public.atendimento_conta (id) on delete cascade,
  item text not null check (item in (
    'nao_e_api_oficial',
    'numero_pode_ser_bloqueado',
    'olli_nao_desbloqueia',
    'sem_disparo',
    'ia_se_identifica',
    'sair',
    'arrependimento_7_dias',
    'preco_e_teto_antes',
    'lgpd_operador'
  )),
  aceito_em timestamptz not null default now(),
  primary key (conta_id, item)
);

-- Contagem do mês. Sem conteúdo. O teto mora no código (atendimentoCusto.ts), não aqui.
create table if not exists public.atendimento_uso_mes (
  conta_id uuid not null references public.atendimento_conta (id) on delete cascade,
  ano_mes date not null,
  respostas_ia integer not null default 0 check (respostas_ia >= 0),
  servico integer not null default 0 check (servico >= 0),
  utilidade integer not null default 0 check (utilidade >= 0),
  marketing integer not null default 0 check (marketing >= 0),
  primary key (conta_id, ano_mes)
);

alter table public.atendimento_conta enable row level security;
alter table public.atendimento_aceite_qr enable row level security;
alter table public.atendimento_uso_mes enable row level security;

revoke all on table public.atendimento_conta from anon, authenticated;
revoke all on table public.atendimento_aceite_qr from anon, authenticated;
revoke all on table public.atendimento_uso_mes from anon, authenticated;
