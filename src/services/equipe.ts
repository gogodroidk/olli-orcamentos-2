import { supabase, getCurrentUser } from './supabase';
import { PAGAMENTOS_URL, LINK_BASE_URL } from '../config';

/**
 * Camada de dados da EQUIPE (multi-tenant — Onda 2).
 *
 * A organização é uma CAMADA sobre os dados single-tenant do owner (ver
 * docs/multi-tenant): tabelas organizacoes / organizacao_membros / convites e a
 * function SECURITY DEFINER aceitar_convite(token). Este serviço fala com o
 * Supabase sob RLS (chave anon, cada leitura já limitada à org do usuário) e, só
 * para CRIAR convite, chama o worker (que precisa do service role para gerar o
 * token e verificar o papel do solicitante server-side).
 *
 * Contrato consumido pelos hooks/telas da frente 1:
 *   - useTipoConta(): getMinhaOrganizacao()
 *   - usePermissao(): getMinhaOrganizacao().papel
 *   - EquipeScreen: listarMembros / definirAtivoMembro / criarConvite / criarOrganizacao
 *   - ContaScreen (aceite): aceitarConvite(token)
 *
 * Nenhuma função lança para fora sem necessidade: leituras à prova de falha
 * devolvem null/[] (o app degrada como conta pessoal); ações (criar org, aceitar
 * convite, criar convite) propagam Error com mensagem em PT-BR para a UI mostrar.
 */

// ─── tipos ───────────────────────────────────────────────────
export type Papel = 'owner' | 'admin' | 'gestor' | 'tecnico';

export const PAPEIS: Papel[] = ['owner', 'admin', 'gestor', 'tecnico'];

/** Papéis que um convite pode conceder (owner nunca — é quem cria a org). */
export const PAPEIS_CONVIDAVEIS: Exclude<Papel, 'owner'>[] = ['admin', 'gestor', 'tecnico'];

/** Rótulo humano do papel (PT-BR) para a UI. */
export const PAPEL_LABEL: Record<Papel, string> = {
  owner: 'Dono',
  admin: 'Administrador',
  gestor: 'Gestor',
  tecnico: 'Técnico',
};

/** Descrição curta do que cada papel pode fazer — mostrada ao convidar. */
export const PAPEL_DESCRICAO: Record<Exclude<Papel, 'owner'>, string> = {
  admin: 'Gerencia tudo, menos cobrança e exclusão da empresa',
  gestor: 'Vê relatórios, metas e a agenda de todos — sem mexer na equipe',
  tecnico: 'Cria orçamentos e vê a própria agenda',
};

export interface Organizacao {
  id: string;
  nome: string;
  papel: Papel;
  /** user_id do DONO da org — usado pelo cloudSync p/ o técnico gravar dados no tenant do dono. */
  ownerUserId: string;
  /**
   * F0d — esta org já existia quando o paywall do Empresa entrou, então usa
   * Equipe/Mapa sem assinar (ver `20260725_equipe_grandfathering.sql`). O worker
   * decide o mesmo em `orgTemEmpresaAtivo`; aqui é só para a UI não mostrar um muro
   * de pagamento a quem o servidor vai deixar passar.
   *
   * `undefined` = NÃO SEI (schema antigo, coluna ausente, leitura parcial) — e não
   * sei nunca vira "é grandfathered": sem certeza, o gate de plano normal decide.
   */
  equipeGrandfathered?: boolean;
}

export interface MembroEquipe {
  userId: string;
  papel: Papel;
  ativo: boolean;
  criadoEm?: string;
  /** Nome/e-mail quando disponível (best-effort — pode ser só o e-mail). */
  nome?: string;
  email?: string;
}

// ─── organização do usuário (deriva tipo de conta) ───────────
/**
 * Resultado EXPLÍCITO da leitura da organização. Distinguir "não tem org" de
 * "não consegui saber" é a diferença entre conceder e negar permissão: quem trata
 * falha de rede como `null` acaba tratando um TÉCNICO offline como conta pessoal —
 * e conta pessoal é o papel MAIS permissivo que existe (vê faturamento, relatórios,
 * valores agregados). Ver `normalizarPapel`, que já cai no papel mais restrito.
 */
export type LeituraOrganizacao =
  | { status: 'ok'; org: Organizacao | null } // resolvido: `null` = conta pessoal de verdade
  | { status: 'erro' }; // indeterminado (offline, RLS, servidor fora)

/**
 * Lê a organização do usuário logado SEM apagar a diferença entre "sem org" e
 * "falhou". Use esta quando a resposta decide permissão.
 *
 * A RLS de organizacao_membros já limita a leitura às linhas do próprio usuário,
 * então o filtro por user_id é só para pegar a linha certa (e ser explícito).
 */
export async function carregarMinhaOrganizacao(): Promise<LeituraOrganizacao> {
  try {
    if (!supabase) return { status: 'erro' };
    const user = await getCurrentUser();
    if (!user) return { status: 'erro' }; // sem sessão: indeterminado, não "pessoal"

    // limit(1) em vez de maybeSingle(): se o usuário for membro de mais de uma
    // org (edge case — o schema garante UNIQUE(org_id,user_id), não UNIQUE(user_id)),
    // pegamos UMA em vez de errar e cair como "pessoal".
    //
    // O `.order('criado_em')` NÃO é enfeite. Esta linha escolhe o TENANT DE
    // ESCRITA do app inteiro: `cloudSync` chama `carregarMinhaOrganizacao` e usa
    // o `ownerUserId` daqui para carimbar cada linha que sobe (ver
    // `resolverContextoEquipe`, cloudSync.ts:594-640). `limit(1)` sem `order by`
    // não é "a primeira": é a que o Postgres devolver naquele plano de execução,
    // que pode mudar entre duas chamadas do MESMO aparelho. Quem é membro
    // legítimo de duas orgs teria o orçamento gravado na org A hoje e na org B
    // amanhã — dado de uma empresa indo parar na outra, sem erro nenhum na tela.
    //
    // `criado_em` é `timestamptz not null default now()`
    // (20260707_multitenant.sql:47), então a ordenação é total e estável: a
    // membresia MAIS ANTIGA sempre vence, em qualquer aparelho, para sempre.
    //
    // Ascendente por `criado_em` é a MESMA regra do painel
    // (`webapp/src/olli/mutacoes.ts`, `opcoesContextoDeEscrita`). Isso é
    // deliberado e é o ponto todo: app e painel precisam concordar sobre em qual
    // empresa o usuário está gravando, senão o celular e o navegador do mesmo
    // dono escrevem em tenants diferentes — que é o bug que esta linha conserta,
    // só que pior, porque ninguém compara os dois.
    const { data: membros, error } = await supabase
      .from('organizacao_membros')
      .select('org_id, papel, ativo')
      .eq('user_id', user.id)
      .eq('ativo', true)
      .order('criado_em', { ascending: true })
      .limit(1);

    if (error) return { status: 'erro' }; // a consulta falhou: NÃO é "sem org"

    const membro = Array.isArray(membros) && membros.length ? membros[0] : null;
    if (!membro) return { status: 'ok', org: null }; // consultou e não é membro: pessoal

    const { data: orgs, error: erroOrg } = await supabase
      .from('organizacoes')
      .select('id, nome, owner_user_id, equipe_grandfathered')
      .eq('id', membro.org_id)
      .limit(1);

    if (erroOrg) return { status: 'erro' };

    const org = Array.isArray(orgs) && orgs.length ? orgs[0] : null;
    // É membro de uma org que não conseguimos ler: indeterminado, nunca "pessoal".
    if (!org) return { status: 'erro' };
    return {
      status: 'ok',
      org: {
        id: org.id,
        nome: org.nome ?? 'Minha empresa',
        papel: normalizarPapel(membro.papel),
        ownerUserId: (org as any).owner_user_id,
        // `=== true` de propósito: qualquer outra coisa (null, undefined, coluna
        // que não existe ainda no schema) NÃO é "grandfathered". Liberar por dúvida
        // seria dar o plano Empresa de graça — o inverso do bug da casa, mas o mesmo
        // erro: tratar "não sei" como um valor.
        equipeGrandfathered: (org as any).equipe_grandfathered === true,
      },
    };
  } catch {
    return { status: 'erro' };
  }
}

/**
 * Versão que colapsa erro em `null`. Mantida para os call-sites que só querem
 * exibir a org (nome/ id) e NÃO decidem permissão com o resultado. Para permissão
 * use `carregarMinhaOrganizacao`. Nunca lança.
 */
export async function getMinhaOrganizacao(): Promise<Organizacao | null> {
  const r = await carregarMinhaOrganizacao();
  return r.status === 'ok' ? r.org : null;
}

/** Garante um papel válido; qualquer valor desconhecido cai no mais restrito. */
function normalizarPapel(v: unknown): Papel {
  return v === 'owner' || v === 'admin' || v === 'gestor' || v === 'tecnico' ? v : 'tecnico';
}

// ─── criar organização (torna a conta "empresa") ─────────────
/**
 * Cria uma organização com o usuário logado como OWNER. Usa a function
 * SECURITY DEFINER `criar_organizacao(nome)` (frente 1) quando disponível —
 * ela cria a org e o vínculo owner numa transação. Retorna a Organizacao criada.
 *
 * Fallback: se a RPC não existir (schema antigo), tenta o insert direto (a RLS
 * da frente 1 deve permitir o owner_user_id = auth.uid()). Propaga Error em PT-BR.
 */
export async function criarOrganizacao(nome: string): Promise<Organizacao> {
  if (!supabase) throw new Error('Conecte-se à nuvem para criar a conta empresa.');
  const user = await getCurrentUser();
  if (!user) throw new Error('Sua sessão expirou. Entre de novo para continuar.');

  const nomeLimpo = (nome || '').trim().slice(0, 120);
  if (!nomeLimpo) throw new Error('Dê um nome para a sua empresa.');

  // RPC transacional (SECURITY DEFINER) — cria a org E inscreve o dono como
  // membro 'owner' numa transação. Nome do parâmetro DEVE bater com a assinatura
  // SQL criar_organizacao(p_nome text) — o PostgREST casa RPC por nome de arg.
  // Não há fallback de insert direto: sem a RPC, o insert do membro falharia
  // (a policy exige ser membro), deixando uma org órfã irrecuperável.
  const rpc = await supabase.rpc('criar_organizacao', { p_nome: nomeLimpo });
  if (rpc.error) throw new Error(mensagemAmigavel(rpc.error.message));

  const org = await getMinhaOrganizacao();
  if (org) return org;
  // RPC ok mas leitura ainda não propagou: retorno mínimo sem quebrar o fluxo.
  const id = typeof rpc.data === 'string' ? rpc.data : (rpc.data && (rpc.data as any).id) || '';
  return { id, nome: nomeLimpo, papel: 'owner', ownerUserId: user.id };
}

// ─── membros ─────────────────────────────────────────────────
/**
 * Lista os membros da org do usuário. A RLS já garante que só membros da MESMA
 * org (via policy da frente 1) enxergam essas linhas. [] em falha (nunca lança).
 * Tenta enriquecer com nome/e-mail via a view `organizacao_membros_perfil` se ela
 * existir (frente 1); senão devolve só papel/ativo (a UI mostra o papel).
 */
export async function listarMembros(orgId: string): Promise<MembroEquipe[]> {
  try {
    if (!supabase || !orgId) return [];

    // Caminho enriquecido: view com nome/e-mail (opcional na frente 1).
    const viewRes = await supabase
      .from('organizacao_membros_perfil')
      .select('user_id, papel, ativo, criado_em, nome, email')
      .eq('org_id', orgId);
    if (!viewRes.error && Array.isArray(viewRes.data)) {
      return viewRes.data.map(mapMembro);
    }

    const { data, error } = await supabase
      .from('organizacao_membros')
      .select('user_id, papel, ativo, criado_em')
      .eq('org_id', orgId);
    if (error || !Array.isArray(data)) return [];
    return data.map(mapMembro);
  } catch {
    return [];
  }
}

function mapMembro(r: any): MembroEquipe {
  return {
    userId: r.user_id,
    papel: normalizarPapel(r.papel),
    ativo: r.ativo !== false,
    criadoEm: typeof r.criado_em === 'string' ? r.criado_em : undefined,
    nome: typeof r.nome === 'string' && r.nome ? r.nome : undefined,
    email: typeof r.email === 'string' && r.email ? r.email : undefined,
  };
}

/**
 * Ativa/desativa um membro. Só owner/admin conseguem (RLS da frente 1). Não é
 * possível desativar o próprio owner por aqui. Propaga Error em PT-BR na falha.
 */
export async function definirAtivoMembro(orgId: string, userId: string, ativo: boolean): Promise<void> {
  if (!supabase) throw new Error('Conecte-se à nuvem para gerenciar a equipe.');
  const { error } = await supabase
    .from('organizacao_membros')
    .update({ ativo })
    .eq('org_id', orgId)
    .eq('user_id', userId);
  if (error) throw new Error(mensagemAmigavel(error.message));
}

// ─── convite (criação via worker) ────────────────────────────
export interface ConviteCriado {
  token: string;
  link: string;
}

/** Base do worker (mesma do diagnóstico/pagamentos). '' = worker não configurado. */
function workerBase(): string {
  return PAGAMENTOS_URL || '';
}

/** Monta o link público do convite a partir do token (fallback se o worker não devolver). */
export function linkDoConvite(token: string): string {
  return `${LINK_BASE_URL}/equipe/convite/${token}`;
}

/**
 * Cria um convite para a equipe. Chama o worker POST /equipe/convite (JWT do
 * owner/admin) — o worker gera o token, valida o papel do solicitante no servidor
 * e grava o convite. Retorna { token, link } para o app compartilhar.
 *
 * `papel` só pode ser admin/gestor/tecnico. `email` é opcional (só para lembrar
 * quem foi convidado). Propaga Error em PT-BR na falha.
 */
export async function criarConvite(papel: Exclude<Papel, 'owner'>, email?: string): Promise<ConviteCriado> {
  const base = workerBase();
  if (!base) throw new Error('O serviço de convites ainda não está ligado neste app.');
  if (!supabase) throw new Error('Conecte-se à nuvem para convidar sua equipe.');

  const token = await accessTokenAtual();
  if (!token) throw new Error('Sua sessão expirou. Entre de novo para convidar.');

  let resp: Response;
  try {
    resp = await fetch(`${base}/equipe/convite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ papel, email: email?.trim() || undefined }),
    });
  } catch {
    throw new Error('Sem conexão. Verifique a internet e tente de novo.');
  }

  const dados = await resp.json().catch(() => ({} as any));
  if (!resp.ok || !dados || dados.ok === false || !dados.token) {
    throw new Error(traduzirErroConvite(dados?.erro, resp.status));
  }
  return { token: dados.token, link: typeof dados.link === 'string' ? dados.link : linkDoConvite(dados.token) };
}

/**
 * O erro do worker vira frase em PT-BR. Cada caso conhecido diz O QUE ACONTECEU e
 * O QUE FAZER — porque o `default` ("Tente de novo") só está certo quando tentar de
 * novo pode de fato funcionar.
 *
 * `plano_requer_empresa` (402) é o caso que provou isso na prática. Ele NÃO caía em
 * nenhum `case`, então o dono lia "Não consegui criar o convite agora. Tente de
 * novo." — para sempre, porque nenhuma tentativa ia funcionar. E é alcançável hoje:
 * o `usePlano` cacheia o último plano bom de propósito (quem paga não perde acesso
 * numa oscilação de rede), então o dono de Empresa com o cartão vencido passa pelo
 * `GateEquipe`, abre a tela, clica em convidar — e só aí o worker lê o status REAL
 * da assinatura e recusa. A recusa é correta; a mensagem é que escondia o motivo:
 * ele nunca ficava sabendo que o problema era o pagamento.
 */
function traduzirErroConvite(erro: unknown, status: number): string {
  switch (erro) {
    case 'sem_permissao':
      return 'Só o dono ou um administrador pode convidar.';
    case 'sem_organizacao':
      return 'Crie a conta empresa antes de convidar sua equipe.';
    case 'papel_invalido':
      return 'Escolha um papel válido para o convite.';
    case 'muitas_requisicoes':
      return 'Muitos convites em pouco tempo. Aguarde um instante.';
    case 'nao_autorizado':
      return 'Sua sessão expirou. Entre de novo para convidar.';
    case 'plano_requer_empresa':
      // Não dizemos "seu plano venceu": o worker recusa tanto quem nunca assinou
      // quanto quem deixou vencer, e afirmar o motivo errado é pior que não afirmar.
      // Dizemos o que é verdade nos dois casos, e para onde ir.
      return 'Convidar técnicos faz parte do plano Empresa, e a assinatura não está ativa agora. Veja o seu plano em Conta › "Ver os planos". Quem já está na sua equipe continua com acesso normal.';
    default:
      return status >= 500
        ? 'O serviço de convites está indisponível agora. Tente de novo em instantes.'
        : 'Não consegui criar o convite agora. Tente de novo.';
  }
}

// ─── aceite do convite ───────────────────────────────────────
/**
 * Aceita um convite pelo token, via function SECURITY DEFINER
 * aceitar_convite(token) da frente 1 (valida expira_em/aceito e cria o vínculo do
 * usuário logado na org). Retorna a Organizacao à qual o usuário passou a
 * pertencer. Propaga Error em PT-BR na falha (token inválido/expirado/já aceito).
 */
export async function aceitarConvite(tokenBruto: string): Promise<Organizacao> {
  if (!supabase) throw new Error('Conecte-se à nuvem para entrar na equipe.');
  const user = await getCurrentUser();
  if (!user) throw new Error('Entre na sua conta antes de aceitar o convite.');

  const token = extrairToken(tokenBruto);
  if (!token) throw new Error('Código de convite inválido. Confira o que você recebeu.');

  const { error } = await supabase.rpc('aceitar_convite', { p_token: token });
  if (error) throw new Error(traduzirErroAceite(error.message));

  const org = await getMinhaOrganizacao();
  if (!org) {
    // Aceite gravou mas a leitura ainda não propagou: não é erro para o usuário.
    throw new Error('Convite aceito! Reabra a tela para ver sua equipe.');
  }
  return org;
}

/**
 * Extrai o token de um input que pode ser: o token puro, um deep link
 * (olliorcamentos://convite/<token>) ou a URL da página
 * (https://link.olliorcamentos.online/equipe/convite/<token>). Retorna o token
 * limpo (validado pelo formato) ou '' se não parecer um token.
 */
export function extrairToken(bruto: string): string {
  const s = (bruto || '').trim();
  if (!s) return '';
  // Se vier uma URL/deep link, pega o último segmento não vazio.
  const semQuery = s.split(/[?#]/)[0];
  const partes = semQuery.split('/').filter(Boolean);
  const candidato = partes.length ? partes[partes.length - 1] : semQuery;
  return /^[A-Za-z0-9_-]{20,64}$/.test(candidato) ? candidato : '';
}

function traduzirErroAceite(msg?: string): string {
  const m = (msg || '').toLowerCase();
  if (/expir/.test(m)) return 'Este convite expirou. Peça um novo para quem te chamou.';
  if (/aceito|used|já/.test(m)) return 'Este convite já foi usado.';
  if (/not found|não encontr|inexist|invalid/.test(m)) return 'Convite não encontrado. Confira o código.';
  return 'Não consegui aceitar o convite agora. Tente de novo.';
}

// ─── registro de acesso (acessos_equipe) ─────────────────────
/**
 * Registra um acesso do membro (evento 'login' / 'app_open') na org. É o que
 * alimenta "ver todos os acessos" no dashboard empresa. Best-effort e nunca
 * lança — se não houver org, se a tabela/policy negar ou se falhar a rede, apenas
 * não grava. A plataforma é derivada de Platform.OS.
 */
export async function registrarAcesso(
  orgId: string,
  evento: 'login' | 'app_open' = 'app_open',
): Promise<void> {
  try {
    if (!supabase || !orgId) return;
    const user = await getCurrentUser();
    if (!user) return;
    const { Platform } = require('react-native');
    await supabase.from('acessos_equipe').insert({
      org_id: orgId,
      user_id: user.id,
      evento,
      plataforma: Platform.OS,
    });
  } catch {
    // best-effort: registro de acesso jamais bloqueia o uso do app.
  }
}

// ─── helpers ─────────────────────────────────────────────────
/** Token de acesso da sessão atual (ou null). Nunca lança. */
async function accessTokenAtual(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Traduz mensagens cruas do PostgREST/RLS em algo apresentável ao usuário. */
function mensagemAmigavel(msg?: string): string {
  const m = (msg || '').toLowerCase();
  if (/duplicate|unique|already exists|já existe/.test(m)) return 'Você já tem uma empresa criada.';
  if (/permission|rls|not allowed|denied|policy/.test(m)) return 'Você não tem permissão para essa ação.';
  if (/network|fetch|timeout/.test(m)) return 'Sem conexão. Verifique a internet e tente de novo.';
  return 'Não consegui concluir agora. Tente de novo em instantes.';
}
