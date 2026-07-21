/**
 * Teste do ISOLAMENTO ENTRE CONTAS e do PAYWALL do Empresa — execução dos
 * achados A1, A2, A3, A4 e A7 de docs/ENXAME/AUDITORIA_BANCO.md.
 *
 *     node scripts/teste-isolamento-tenant.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * POR QUE ESTE TESTE OLHA O **ESTADO FINAL**, E NÃO UM ARQUIVO
 * Uma policy não é o que a última migration escreveu: é o que sobra depois de
 * TODAS elas rodarem em ordem de nome. `membros_admin_insert` já foi criada em
 * 20260707 e recriada em 20260718 — um `drop` numa migration nova não prova nada
 * se alguém, amanhã, recriar a policy num arquivo de nome maior. Por isso
 * `estadoFinalPolicy` REPRODUZ a aplicação sequencial e afirma sobre o resultado.
 * É a diferença entre testar o diff e testar o banco.
 *
 * O que está em jogo, em ordem de dano:
 *  1. A1 — plantar um membro fazia o aparelho da VÍTIMA empurrar a base dela para
 *     o tenant do atacante. Vazamento de posse, não de cópia. Já houve vazamento
 *     real neste projeto duas vezes; isto não é exercício.
 *  2. Paywall — o plano de R$ 99/mês era liberável por DOIS caminhos de 1 linha.
 *  3. A3/A4 — exclusão definitiva que ressuscita e numeração duplicada.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  if (Object.is(real, esperado)) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${String(esperado)}\n        recebido: ${String(real)}`);
  }
}

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR_MIGRATIONS = join(AQUI, '..', 'supabase', 'migrations');

/** As migrations que REALMENTE rodam, na ordem em que rodam (nome do arquivo). */
function migrationsEmOrdem(): string[] {
  return readdirSync(DIR_MIGRATIONS)
    .filter((f) => f.endsWith('.sql')) // exclui .sql.pendente de propósito: ela não roda
    .sort();
}

const SQL_EM_ORDEM: { arquivo: string; sql: string }[] = migrationsEmOrdem().map((f) => ({
  arquivo: f,
  sql: readFileSync(join(DIR_MIGRATIONS, f), 'utf8'),
}));

/**
 * Estado de uma policy DEPOIS de aplicar todas as migrations em ordem.
 * Varre cada arquivo na ordem e guarda a ÚLTIMA operação vista.
 */
function estadoFinalPolicy(nome: string): 'existe' | 'removida' | 'nunca' {
  let estado: 'existe' | 'removida' | 'nunca' = 'nunca';
  for (const { sql } of SQL_EM_ORDEM) {
    const re = new RegExp(
      `(drop\\s+policy\\s+if\\s+exists\\s+${nome}\\b)|(create\\s+policy\\s+${nome}\\b)`,
      'gi',
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) estado = m[1] ? 'removida' : 'existe';
  }
  return estado;
}

/**
 * O TEXTO da policy como ela fica DEPOIS de todas as migrations — o último
 * `create policy <nome> … ;` que sobrevive. `estadoFinalPolicy` só responde
 * "existe"; para afirmar sobre o CONTEÚDO de um `with check` é preciso o corpo.
 * Mesma razão de ser: uma policy recriada num arquivo de nome maior manda.
 */
function corpoFinalPolicy(nome: string): string {
  let corpo = '';
  for (const { sql } of SQL_EM_ORDEM) {
    const limpo = sql.replace(/--[^\n]*/g, '');
    const re = new RegExp(`create\\s+policy\\s+${nome}\\b`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(limpo)) !== null) {
      const resto = limpo.slice(m.index);
      const fim = resto.indexOf(';');
      corpo = fim === -1 ? resto : resto.slice(0, fim);
    }
  }
  return corpo;
}

/** Idem para índice: `create unique index ... <nome>` vs `drop index ... <nome>`. */
function estadoFinalIndice(nome: string): 'existe' | 'removida' | 'nunca' {
  let estado: 'existe' | 'removida' | 'nunca' = 'nunca';
  for (const { sql } of SQL_EM_ORDEM) {
    const re = new RegExp(`(drop\\s+index\\s+if\\s+exists\\s+(?:public\\.)?${nome}\\b)|(index\\s+if\\s+not\\s+exists\\s+${nome}\\b)`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) estado = m[1] ? 'removida' : 'existe';
  }
  return estado;
}

/** Texto de UMA migration (para afirmar sobre a forma do conserto). */
function mig(nome: string): string {
  const achado = SQL_EM_ORDEM.find((x) => x.arquivo === nome);
  if (!achado) throw new Error(`migration ausente: ${nome}`);
  return achado.sql;
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n1) A1 (P0) — entrar numa org exige ter aceitado um convite');

checar(
  'NÃO existe mais policy de INSERT direto em organizacao_membros',
  estadoFinalPolicy('membros_admin_insert'),
  'removida',
);
// A porta que continua aberta é a certa: aceitar_convite é SECURITY DEFINER,
// exige o token de 128 bits e é chamada PELO PRÓPRIO convidado.
checar(
  'aceitar_convite (o caminho COM consentimento) continua existindo',
  /create\s+or\s+replace\s+function\s+public\.aceitar_convite/i.test(
    SQL_EM_ORDEM.map((x) => x.sql).join('\n'),
  ),
  true,
);
// Sem isto, a MESMA exfiltração volta por UPDATE: a PK é (org_id,user_id) e o
// admin pode alterar qualquer linha não-owner da própria org.
const a1 = mig('20260729_membro_consentimento.sql');
checar(
  'trigger congela organizacao_membros.user_id',
  /new\.user_id\s+is\s+distinct\s+from\s+old\.user_id[\s\S]{0,120}raise\s+exception/i.test(a1),
  true,
);
checar(
  'trigger congela também org_id (a outra metade da PK)',
  /new\.org_id\s+is\s+distinct\s+from\s+old\.org_id[\s\S]{0,120}raise\s+exception/i.test(a1),
  true,
);
checar(
  'o trigger é BEFORE UPDATE em organizacao_membros',
  /create\s+trigger\s+organizacao_membros_chave_imutavel[\s\S]{0,120}before\s+update\s+on\s+public\.organizacao_membros/i.test(a1),
  true,
);
// A função existente NÃO servia: ela mexe em `old.criado_por`, coluna que
// organizacao_membros não tem — reusá-la quebraria todo UPDATE de membro.
checar(
  'não reusa bloquear_troca_user_id (que referencia criado_por, coluna inexistente aqui)',
  /bloquear_troca_user_id\s*\(\s*\)\s*;/i.test(a1.replace(/--[^\n]*/g, '')),
  false,
);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n2) Paywall do Empresa — os DOIS bypasses de uma linha');

const a2 = mig('20260730_paywall_empresa_selado.sql');
checar(
  'caminho 2: não existe mais INSERT do client em convites',
  estadoFinalPolicy('convites_gestao_insert'),
  'removida',
);
checar(
  'o gate de plano continua no worker (é ele quem cria convite agora)',
  /orgTemEmpresaAtivo/.test(readFileSync(join(AQUI, '..', 'worker', 'src', 'equipe.js'), 'utf8')),
  true,
);
checar(
  'caminho 1: trigger bloqueia troca de equipe_grandfathered',
  /new\.equipe_grandfathered\s+is\s+distinct\s+from\s+old\.equipe_grandfathered/i.test(a2),
  true,
);
checar(
  'e bloqueia exatamente os papéis que o PostgREST expõe ao client',
  /current_user\s+in\s*\(\s*'authenticated'\s*,\s*'anon'\s*\)/i.test(a2),
  true,
);
// A ARMADILHA DESTE ARQUIVO: dentro de SECURITY DEFINER, current_user é o DONO da
// função (postgres) — nunca o chamador. O teste de papel viraria sempre falso e o
// trigger não bloquearia NADA, parecendo correto na revisão.
const corpoCongelar = a2.slice(a2.indexOf('function public.congelar_equipe_grandfathered'));
const corpoCongelarSemComentario = corpoCongelar.replace(/--[^\n]*/g, '');
checar(
  'a função NÃO é security definer (senão current_user seria sempre postgres)',
  /security\s+definer/i.test(corpoCongelarSemComentario.slice(0, corpoCongelarSemComentario.indexOf('$$'))),
  false,
);
checar(
  'a violação LEVANTA erro (não vira sucesso silencioso)',
  /raise\s+exception/i.test(corpoCongelar),
  true,
);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n3) A3/A4 — tombstone e contador enxergam a equipe');

const a34 = mig('20260731_exclusoes_contadores_equipe.sql');
const DV = /user_id\s+in\s*\(\s*select\s+public\.donos_visiveis\(\)\s*\)/i;

checar('exclusoes: SELECT ampliado para a equipe', estadoFinalPolicy('exclusoes_equipe_select'), 'existe');
checar('exclusoes: INSERT no tenant do dono habilitado', estadoFinalPolicy('exclusoes_equipe_insert'), 'existe');
checar('contadores: SELECT ampliado', estadoFinalPolicy('contadores_equipe_select'), 'existe');
// O upsert do app é `onConflict: user_id,chave` = INSERT ... ON CONFLICT DO
// UPDATE. Faltar UMA das duas policies faz a escrita falhar — e syncContadores
// engole erro, então falharia CALADA.
checar('contadores: INSERT habilitado', estadoFinalPolicy('contadores_equipe_insert'), 'existe');
checar('contadores: UPDATE habilitado (o upsert precisa das duas)', estadoFinalPolicy('contadores_equipe_update'), 'existe');
// Afirmação auto-sustentável: em vez de conferir uma contagem (que envelhece a
// cada policy nova), exige que TODA cláusula `using`/`with check` deste arquivo
// use o grão de tenant. Uma policy nova com grão errado quebra o teste sozinha.
// (Por LINHA: cada cláusula deste arquivo cabe em uma. Se alguém quebrar uma em
// várias linhas, o teste FALHA em vez de passar — erra para o lado seguro.)
const clausulas = a34
  .replace(/--[^\n]*/g, '')
  .split('\n')
  .filter((l) => /\b(?:using|with\s+check)\s*\(/i.test(l));
checar('há cláusulas de policy para conferir', clausulas.length > 0, true);
checar(
  'TODA cláusula usa donos_visiveis() (o mesmo grão de clientes/orcamentos)',
  clausulas.every((c) => DV.test(c)),
  true,
);

// ── O DEPUTADO CONFUSO (rodapé da 20260731, "CONFERÊNCIA") ─────────────────
// O grão de TENANT sozinho NÃO fecha `exclusoes`: ele diz em nome de QUEM se
// apaga, não O QUE se apaga. Sem a lista de tabelas no `with check`, um técnico
// ATIVO插 planta `(user_id=<dono>, tabela='recibos')`; no sync seguinte o
// ATIVO planta `(user_id=<dono>, tabela='recibos')`; no sync seguinte o
// `applyCloudTombstones` do DONO lê a linha (a self-only devolve, o user_id é
// dele), `localDeleteById` + `removeRow` rodam COM A SESSÃO DO DONO e passam em
// `recibos_owner_write`. Quem executa o DELETE é o dono, autorizado, a mando de
// uma linha que o técnico plantou.
//
// POR QUE A ASSERÇÃO TEM DE VIVER AQUI, E NÃO NO APP: não existe coluna de
// autoria em `exclusoes`. O aparelho do dono não tem como distinguir o tombstone
// que ele criou do que plantaram no tenant dele — e filtrar por tabela no app
// quebraria o próprio A3 (o técnico PRECISA aplicar localmente a exclusão de
// `clientes`/`recibos` feita pelo dono, senão o registro ressuscita). A policy é
// o ÚNICO lugar onde isso pode ser barrado, então este teste é o único guarda.
const checkInsertExclusoes = corpoFinalPolicy('exclusoes_equipe_insert');
const listaTabelas = /\btabela\s+in\s*\(([^)]*)\)/i.exec(checkInsertExclusoes);
checar('exclusoes: o INSERT restringe também a TABELA, não só o tenant', !!listaTabelas, true);

const tabelasPermitidas = new Set(
  [...(listaTabelas?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]),
);
// As 6 de escrita reservada ao dono (levantamento tabela a tabela no cabeçalho
// da 20260731). Nenhuma pode entrar na lista: são exatamente as que o membro NÃO
// consegue apagar direto, e portanto as que a procuração escalaria.
for (const reservada of ['clientes', 'servicos', 'produtos', 'recibos', 'modelos', 'depoimentos']) {
  checar(`  e NÃO deixa plantar tombstone de '${reservada}' (escrita é do dono)`, tabelasPermitidas.has(reservada), false);
}
// A outra ponta: a lista não pode conter nome que o app não saiba apagar — seria
// uma permissão que não compra nada e mascara erro de digitação ('orcamento').
const DELETABLE_APP = new Set(
  [...(/const DELETABLE_TABLES = new Set<string>\(\[([\s\S]*?)\]\)/.exec(
    readFileSync(join(AQUI, '..', 'src', 'services', 'cloudSync.ts'), 'utf8'),
  )?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]),
);
checar('a allow-list do app foi lida (DELETABLE_TABLES)', DELETABLE_APP.size > 0, true);
checar(
  'toda tabela permitida na policy existe em DELETABLE_TABLES do app',
  [...tabelasPermitidas].every((t) => DELETABLE_APP.has(t)),
  true,
);
checar('e a lista não está vazia (senão o INSERT não serve para nada)', tabelasPermitidas.size > 0, true);

// DELIBERADAMENTE fora: quem apaga o tombstone do dono ressuscita o registro.
checar(
  'exclusoes NÃO ganhou DELETE para a equipe',
  estadoFinalPolicy('exclusoes_equipe_delete'),
  'nunca',
);
checar(
  'exclusoes NÃO ganhou UPDATE para a equipe',
  estadoFinalPolicy('exclusoes_equipe_update'),
  'nunca',
);
// A policy self-only original continua de pé: as novas são PERMISSIVAS (OR).
checar('a policy self-only de exclusoes segue existindo', estadoFinalPolicy('exclusoes_owner'), 'existe');
checar('a policy self-only de contadores segue existindo', estadoFinalPolicy('contadores_owner'), 'existe');
checar(
  'a migration avisa que a .pendente continua NÃO aplicável',
  /n[ãa]o\s+aplicar/i.test(a34),
  true,
);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n4) A7 — unicidade por TENANT, não global');

checar('orcamento_versoes: índice global removido', estadoFinalIndice('orcamento_versoes_orc_num_uidx'), 'removida');
checar('orcamento_versoes: índice por tenant no lugar', estadoFinalIndice('orcamento_versoes_tenant_orc_num_uidx'), 'existe');
checar('service_contract_versions: global removido', estadoFinalIndice('service_contract_versions_num_uidx'), 'removida');
checar('service_contract_versions: por tenant', estadoFinalIndice('service_contract_versions_tenant_num_uidx'), 'existe');
checar('pmoc_plan_versions: global removido', estadoFinalIndice('pmoc_plan_versions_num_uidx'), 'removida');
checar('pmoc_plan_versions: por tenant', estadoFinalIndice('pmoc_plan_versions_tenant_num_uidx'), 'existe');
checar('pmoc_ordens_geradas: global removido', estadoFinalIndice('pmoc_ordens_geradas_unica'), 'removida');
checar('pmoc_ordens_geradas: por tenant', estadoFinalIndice('pmoc_ordens_geradas_tenant_unica'), 'existe');

const a7 = mig('20260732_unicidade_por_tenant.sql');
for (const idx of [
  'orcamento_versoes_tenant_orc_num_uidx',
  'service_contract_versions_tenant_num_uidx',
  'pmoc_plan_versions_tenant_num_uidx',
  'pmoc_ordens_geradas_tenant_unica',
]) {
  const linha = a7.split('\n').find((l) => l.includes(idx) && l.includes('index'));
  const corpo = linha ? a7.slice(a7.indexOf(linha)).split(';')[0] : '';
  checar(`${idx} tem user_id na chave`, /\(\s*user_id\s*,/.test(corpo), true);
}
// Trocar o grão só seria perigoso se alguma escrita usasse esses índices como
// alvo de ON CONFLICT. Nenhuma usa — os alvos do app/painel são `id`/`user_id`.
const cloudSync = readFileSync(join(AQUI, '..', 'src', 'services', 'cloudSync.ts'), 'utf8');
checar(
  'nenhum onConflict do app aponta para numero_versao',
  /onConflict:\s*'[^']*numero_versao/.test(cloudSync),
  false,
);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n5) worker: o gate de dinheiro não pode variar sozinho');

// @ts-expect-error — o worker é JS puro, sem tipos; roda por type stripping.
const { handleConvite } = await import('../worker/src/equipe.js');

const env: Record<string, unknown> = {
  SUPABASE_URL: 'https://falso.supabase.co',
  SUPABASE_ANON_KEY: 'anon-falsa',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-falsa',
  EQUIPE_RL: { limit: async () => ({ success: true }) },
};

let urlsVistas: string[] = [];

/** Encena o Supabase. `org` = o que a leitura de organizacoes devolve. */
function fingirSupabase(org: unknown, assinatura?: unknown) {
  urlsVistas = [];
  (globalThis as any).fetch = async (url: string, init?: { method?: string }) => {
    urlsVistas.push(String(url));
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      return { ok: true, json: async () => ({ id: 'uid-dono' }) } as unknown as Response;
    }
    if (u.includes('/rest/v1/organizacao_membros')) {
      return { ok: true, json: async () => [{ org_id: 'org-1', papel: 'owner' }] } as unknown as Response;
    }
    if (u.includes('/rest/v1/organizacoes')) {
      if (org === 'falha') return { ok: false, status: 500 } as Response;
      return { ok: true, json: async () => [org] } as unknown as Response;
    }
    if (u.includes('/rest/v1/assinaturas')) {
      return { ok: true, json: async () => (assinatura ? [assinatura] : []) } as unknown as Response;
    }
    if (u.includes('/rest/v1/convites') && (init?.method ?? 'GET') === 'POST') {
      return { ok: true, status: 201 } as Response;
    }
    return { ok: false, status: 404 } as Response;
  };
}

function pedido() {
  return new Request('https://worker.olli/equipe/convite', {
    method: 'POST',
    headers: { Authorization: 'Bearer jwt-falso', 'Content-Type': 'application/json' },
    body: JSON.stringify({ papel: 'tecnico' }),
  });
}

// A membresia decide EM QUAL ORG o convite nasce e QUAL plano é cobrado. Sem
// ordenação, duas requisições idênticas podiam responder coisas diferentes.
fingirSupabase({ owner_user_id: 'uid-dono', equipe_grandfathered: true });
const r1 = await handleConvite(pedido(), env);
checar('convite de org grandfathered é aceito', r1.status, 200);
checar(
  'a leitura de membresia é DETERMINÍSTICA (order=criado_em.asc)',
  urlsVistas.some((u) => u.includes('organizacao_membros') && u.includes('order=criado_em.asc')),
  true,
);
// F0d: para a conta grandfathered o plano é irrelevante — e uma falha ao lê-lo
// não pode virar 402 na cara de quem sempre pôde usar.
checar(
  'org grandfathered nem consulta assinaturas',
  urlsVistas.some((u) => u.includes('/rest/v1/assinaturas')),
  false,
);

fingirSupabase({ owner_user_id: 'uid-dono', equipe_grandfathered: false });
const r2 = await handleConvite(pedido(), env);
checar('org NOVA sem plano Empresa: 402 (é quem o paywall cobra)', r2.status, 402);

fingirSupabase({ owner_user_id: 'uid-dono', equipe_grandfathered: false }, { plano: 'empresa', status: 'active' });
const r3 = await handleConvite(pedido(), env);
checar('org NOVA com Empresa ativo: passa', r3.status, 200);

// "Não sei" nunca vira "pode" nem "não tem": falha FECHADO em 503.
fingirSupabase('falha');
const r4 = await handleConvite(pedido(), env);
checar('falha ao ler a org NÃO concede equipe de graça (503, não 200)', r4.status, 503);

// Limiter indisponível numa rota que dá ACESSO ao tenant = não passa.
fingirSupabase({ owner_user_id: 'uid-dono', equipe_grandfathered: true });
const r5 = await handleConvite(pedido(), { ...env, EQUIPE_RL: undefined, STRIPE_RL: undefined });
checar('sem rate limiter, o convite é NEGADO (fail-closed)', r5.status, 429);

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
