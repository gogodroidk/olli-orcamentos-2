#!/usr/bin/env node
// CQ-CHATWOOT-ORGANIZAR (18/11/2026) — organiza a conta 2 (Central OLLI) do Chatwoot CE.
// Regra: só ACRESCENTA. Não renomeia nem apaga nada que o robô, as campanhas ou o painel usam.
// Não manda mensagem a cliente. Não imprime token (usa o wrapper `cw-api`, que esconde segredos).
//
// Uso:
//   node aplicar.mjs              # aplica (idempotente: pode rodar de novo)
//   node aplicar.mjs --conferir   # só lê e mostra o que está/ não está aplicado
//   node aplicar.mjs --desfazer   # remove só o que este script criou e devolve o que ele mudou
//   node aplicar.mjs --ligar-ausencia-grtech   # NÃO roda sozinho: liga a mensagem fora do horário na GR Tech
//                                              # (manda WhatsApp automático a cliente; só com OK do Igor)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';

const REGISTRO = process.env.CQ_REGISTRO
  || '/home/igor/Desktop/Entregas Claude/OLLI/2026-11-18-chatwoot-organizado/backup/registro-aplicar.json';
const OFERTA = '/home/igor/chatwoot-central/bot/ofertaServicos.js';
const CONTA = 2;
const USUARIOS_VISOES = [1, 2]; // 1 = Admin Demo OLLI, 2 = Igor
const IGOR = 2;
const CAIXA = { olli: 4, grtech: 2, segundoandar: 3 };

// ─── textos: só os que já estão em produção no robô (fonte anotada) ─────────
const FRASE_PARAR = 'Pronto, parei. Você não recebe mais mensagem nossa por aqui.'; // bot/prospeccaoModo.js:168 e ativacaoModo.js:143
const FRASE_SENSIVEL = 'Por segurança não me manda senha, CPF nem número de cartão por aqui. Me conta o que travou, sem esses dados, que eu te ajudo.'; // ativacaoModo.js:151
const LINK_APP = 'https://olliorcamentos.online';
const FRASE_PEDE = `Me fala o serviço e o valor que eu monto com você agora. O app está em ${LINK_APP}`; // ativacaoModo.js:153
const TEXTO_PRECO_OLLI = 'Hoje são três planos: Grátis (R$ 0, até 5 orçamentos enviados por mês, sem cartão), Pro por R$ 39/mês (sem o selo "Feito com OLLI", follow-up automático do orçamento, link com pagamento na hora, termômetro do orçamento) e Empresa por R$ 99/mês (tudo do Pro, mais vários técnicos com permissões, PMOC e contratos de manutenção). Pro e Empresa têm opção anual com desconto, que aparece na tela Planos do navegador, em https://olliorcamentos.online .'; // atendenteSdr.js:221
const GR_PEDE_DADOS = 'Entendi. Me passa o bairro, o tipo de equipamento e o que ele está fazendo (não gela, vaza, barulho, cheiro). Se puder, manda foto da etiqueta. A visita é R$ 150, abatida se fechar o serviço.'; // resposta pronta gr-nao-gela (13/11)
const AUSENCIA_GR = 'A GR Tech atende de segunda a sábado, das 8h às 18h. Deixa o bairro e o que aconteceu com o aparelho que o time responde no próximo horário.'; // resposta pronta ausencia-gr (13/11)

// ─── utilidades ─────────────────────────────────────────────────────────────
function cw(method, path, body) {
  const args = [method, path];
  if (body !== undefined) args.push(JSON.stringify(body));
  let out;
  try {
    out = execFileSync('cw-api', args, { encoding: 'utf8', timeout: 30000, maxBuffer: 8_000_000 });
  } catch {
    throw new Error(`${method} ${path} falhou`);
  }
  const t = String(out || '').trim();
  if (!t) return null;
  let r;
  try { r = JSON.parse(t); } catch { throw new Error(`${method} ${path}: resposta inválida`); }
  if (r && (r.error || r.errors || r.message === 'Not Found')) throw new Error(`${method} ${path}: ${JSON.stringify(r).slice(0, 300)}`);
  return r;
}
const lista = (r) => (Array.isArray(r) ? r : Array.isArray(r?.payload) ? r.payload : Array.isArray(r?.data?.payload) ? r.data.payload : []);
function psql(sql) {
  return execFileSync('docker', ['exec', 'chatwoot-demo-postgres-1', 'psql', '-U', 'postgres', '-d', 'chatwoot', '-Atc', sql], { encoding: 'utf8' }).trim();
}
function rails(codigo) {
  const out = execFileSync('docker', ['exec', '-i', 'chatwoot-demo-rails-1', 'bundle', 'exec', 'rails', 'runner', '-'], {
    input: codigo, encoding: 'utf8', timeout: 180000, maxBuffer: 2_000_000,
  });
  return out.trim().split('\n').filter((l) => l.startsWith('{')).pop() || '{}';
}
const reg = existsSync(REGISTRO) ? JSON.parse(readFileSync(REGISTRO, 'utf8')) : { criado: {}, mudado: {} };
function anotar(tipo, valor) {
  reg.criado[tipo] ||= [];
  reg.criado[tipo].push(valor);
  salvar();
}
function salvar() {
  mkdirSync(dirname(REGISTRO), { recursive: true });
  writeFileSync(REGISTRO, `${JSON.stringify(reg, null, 2)}\n`, { mode: 0o600 });
  chmodSync(REGISTRO, 0o600);
}
const log = (...a) => console.log(...a);

// ─── 1. Times (sem "vendas" no nome: o robô e o vigia acham o time por /vendas/i) ──
// allow_auto_assign = false: pôr o time NÃO põe uma pessoa na conversa (pessoa na conversa cala o robô).
const TIMES = [
  { name: 'OLLI Orçamentos', description: 'App OLLI Orçamentos (caixa OLLI Orçamentos, robô Lívia). Planos Pro R$ 39 e Empresa R$ 99.', caixa: CAIXA.olli },
  { name: 'OLLI Serviços', description: 'Segundo Andar: site, atendente com IA e simulador da Reforma (caixa Segundo Andar, robô Rafa).', caixa: CAIXA.segundoandar },
  { name: 'GR Tech', description: 'GR Tech Refrigeração: visita, preventiva e instalação (caixa GR Tech, sem robô hoje).', caixa: CAIXA.grtech },
];
function times() {
  const existentes = lista(cw('GET', '/teams'));
  const ids = {};
  for (const t of TIMES) {
    let x = existentes.find((e) => e.name.toLowerCase() === t.name.toLowerCase());
    if (!x) {
      x = cw('POST', '/teams', { name: t.name, description: t.description, allow_auto_assign: false });
      anotar('times', x.id);
      log('time criado', t.name, x.id);
    } else log('time já existe', t.name, x.id);
    if (x.allow_auto_assign) throw new Error(`time ${t.name} com auto-atribuição ligada: pararia o robô`);
    cw('POST', `/teams/${x.id}/team_members`, { user_ids: [1, 2] });
    ids[t.caixa] = x.id;
  }
  if (/vendas/i.test(TIMES.map((t) => t.name).join(' '))) throw new Error('nome de time com "vendas"');
  return ids;
}

// ─── 2. Etiquetas: cria as que o robô/campanhas já usam e não existiam + taxonomia na descrição ──
const GRUPO = {
  Empresa: ['empresa-grtech', 'empresa-olli', 'empresa-segundoandar', 'gr-tech', 'olli-orcamentos', 'segundo-andar'],
  Origem: ['fonte-receita', 'fonte-maps', 'prospeccao', 'ativacao', 'cliente-antigo', 'reforma-contadores'],
  Etapa: ['funil-novo', 'funil-em-conversa', 'funil-orcamento-enviado', 'interessado', 'lead-quente'],
  Resultado: ['funil-fechado', 'funil-perdido', 'pedido-fechado', 'pendencia-casa', 'sem-interesse', 'parar-contato', 'sair'],
  Atenção: ['precisa-de-voce', 'pediu-humano', 'humano', 'reclamacao', 'cobranca', 'lgpd', 'fora-da-tabela', 'venda-grande', 'sem-fonte', 'sinalizar', 'fora-do-horario'],
  Robô: ['caso-bot', 'resposta-automatica', 'teste-casa'],
};
const NOVAS = {
  'pedido-fechado': ['#15803D', 'Cliente disse SIM ao pedido (robô Rafa). Conferir e cobrar.'],
  'pendencia-casa': ['#B45309', 'Cliente esperando resposta da equipe (o robô prometeu retorno).'],
  'fonte-maps': ['#0F766E', 'Contato achado no Google Maps (prospecção).'],
  'resposta-automatica': ['#64748B', 'A outra empresa respondeu com mensagem automática; o robô espera a pessoa.'],
  'sem-interesse': ['#6B7280', 'Disse que não tem interesse. Não insistir.'],
  'teste-casa': ['#94A3B8', 'Conversa de teste interno da casa. Não é cliente.'],
  humano: ['#DC2626', 'Pediu ou precisa de uma pessoa (motivo geral).'],
  sair: ['#7F1D1D', 'Pediu para sair. Não mandar mais nada (LGPD).'],
};
const DESC_VAZIA = {
  'caso-bot': 'Caso para revisar o robô.',
  'fora-do-horario': 'Chegou fora do horário do time humano.',
  'gr-tech': 'Conversa da GR Tech.', 'olli-orcamentos': 'Conversa da OLLI Orçamentos.', 'segundo-andar': 'Conversa do Segundo Andar (OLLI Serviços).',
};
function etiquetas() {
  const atuais = lista(cw('GET', '/labels'));
  const porNome = Object.fromEntries(atuais.map((l) => [l.title, l]));
  for (const [titulo, [cor, desc]] of Object.entries(NOVAS)) {
    if (porNome[titulo]) continue;
    const grupo = Object.keys(GRUPO).find((g) => GRUPO[g].includes(titulo));
    const x = cw('POST', '/labels', { title: titulo, color: cor, description: `[${grupo}] ${desc}`, show_on_sidebar: false });
    anotar('etiquetas', x.id);
    porNome[titulo] = x;
    log('etiqueta criada', titulo);
  }
  reg.mudado.etiquetas ||= {};
  for (const [grupo, nomes] of Object.entries(GRUPO)) {
    for (const n of nomes) {
      const l = porNome[n];
      if (!l) continue;
      const antiga = l.description || '';
      if (antiga.startsWith('[')) continue; // já organizada
      const nova = `[${grupo}] ${antiga || DESC_VAZIA[n] || ''}`.trim();
      if (!(l.id in reg.mudado.etiquetas)) reg.mudado.etiquetas[l.id] = antiga;
      salvar();
      cw('PATCH', `/labels/${l.id}`, { description: nova }); // só a descrição; título e cor ficam iguais
    }
  }
  log('etiquetas organizadas por grupo');
}

// ─── 3. Atributos de contato (as chaves fonte/campanha já são gravadas pelas campanhas) ──
const ATRIBUTOS = [
  { attribute_key: 'fonte', attribute_display_name: 'Origem', attribute_description: 'De onde veio o contato: receita, maps, site (gravado pelas campanhas).' },
  { attribute_key: 'campanha', attribute_display_name: 'Campanha', attribute_description: 'Campanha que trouxe o contato (gravado pelas campanhas).' },
  { attribute_key: 'empresa', attribute_display_name: 'Empresa', attribute_description: 'Nome da empresa do contato.' },
];
function atributos() {
  const chaves = new Set(psql(`select attribute_key from custom_attribute_definitions where account_id=${CONTA} and attribute_model=1`).split('\n'));
  for (const a of ATRIBUTOS) {
    if (chaves.has(a.attribute_key)) continue;
    const x = cw('POST', '/custom_attribute_definitions', { ...a, attribute_display_type: 'text', attribute_model: 'contact_attribute' });
    anotar('atributos', x.id);
    log('atributo criado', a.attribute_key);
  }
}

// ─── 4. Respostas prontas (textos já em produção no robô) ──
async function respostas() {
  const of = await import(OFERTA);
  const NOVAS_R = [
    ['sair-lgpd', FRASE_PARAR],
    ['seguranca-dados', FRASE_SENSIVEL],
    ['olli-planos', TEXTO_PRECO_OLLI],
    ['olli-pedir-orcamento', FRASE_PEDE],
    ['sa-site', of.TEXTO_PRECO_SITE],
    ['sa-atendente', of.TEXTO_PRECO_ATENDENTE],
    ['sa-reforma', of.TEXTO_PRECO_REFORMA],
  ];
  const atuais = new Set(lista(cw('GET', '/canned_responses')).map((c) => c.short_code));
  for (const [codigo, texto] of NOVAS_R) {
    if (atuais.has(codigo)) continue;
    if (codigo.startsWith('olli-') && /R\$/.test(texto) && !(texto.includes('R$ 39') && texto.includes('R$ 99'))) throw new Error(`preço da OLLI fora da tabela em ${codigo}`);
    const x = cw('POST', '/canned_responses', { short_code: codigo, content: texto });
    anotar('respostas', x.id);
    log('resposta criada', codigo);
  }
}

// ─── 5. Macros ──
function macros() {
  const tirarFunil = (manter) => ['funil-novo', 'funil-em-conversa', 'funil-orcamento-enviado', 'funil-fechado', 'funil-perdido']
    .filter((l) => l !== manter).map((l) => ({ action_name: 'remove_label', action_params: [l] }));
  const M = [
    { name: 'Venda fechada', actions: [
      ...tirarFunil('funil-fechado'),
      { action_name: 'add_label', action_params: ['funil-fechado', 'pedido-fechado'] },
      { action_name: 'add_private_note', action_params: ['Venda fechada. Próximo passo: conferir pagamento e entregar.'] },
    ] },
    { name: 'Pedir dados — OLLI', actions: [
      { action_name: 'send_message', action_params: [FRASE_PEDE] },
      { action_name: 'add_label', action_params: ['funil-em-conversa'] },
    ] },
    { name: 'Pedir dados — GR Tech', actions: [
      { action_name: 'send_message', action_params: [GR_PEDE_DADOS] },
      { action_name: 'add_label', action_params: ['funil-em-conversa'] },
    ] },
    { name: 'Passar para humano (pausa o robô)', actions: [
      { action_name: 'assign_agent', action_params: [IGOR] },
      { action_name: 'change_status', action_params: ['open'] },
      { action_name: 'add_label', action_params: ['pediu-humano'] },
      { action_name: 'add_private_note', action_params: ['Uma pessoa assumiu. Com alguém atribuído, o robô não responde mais nesta conversa.'] },
    ] },
    { name: 'Parar contato (LGPD)', actions: [
      { action_name: 'send_message', action_params: [FRASE_PARAR] },
      { action_name: 'add_label', action_params: ['parar-contato'] },
      { action_name: 'add_private_note', action_params: ['Pediu para parar (LGPD art. 18). Não mandar mais nada. Campanhas pulam quem tem parar-contato.'] },
      { action_name: 'resolve_conversation', action_params: [] },
    ] },
  ];
  const atuais = new Set(lista(cw('GET', '/macros')).map((m) => m.name));
  for (const m of M) {
    if (atuais.has(m.name)) continue;
    const x = cw('POST', '/macros', { ...m, visibility: 'global' });
    anotar('macros', (x.payload || x).id);
    log('macro criada', m.name);
  }
}

// ─── 6. Automações (novas; as 5 antigas ficam como estão) ──
function automacoes(timeDe) {
  const NOMES = { [CAIXA.olli]: 'OLLI Orçamentos', [CAIXA.segundoandar]: 'OLLI Serviços', [CAIXA.grtech]: 'GR Tech' };
  const A = Object.entries(timeDe).map(([caixa, time]) => ({
    name: `Central: conversa nova da caixa vai para o time ${NOMES[caixa]}`,
    description: 'CQ-CHATWOOT-ORGANIZAR. Só põe o time (sem pessoa), o robô continua.',
    event_name: 'conversation_created',
    conditions: [{ attribute_key: 'inbox_id', filter_operator: 'equal_to', values: [String(caixa)], query_operator: null }],
    actions: [{ action_name: 'assign_team', action_params: [time] }],
    active: true,
  }));
  A.push({
    name: 'Central: pedido fechado ou pendência da casa fica urgente',
    description: 'CQ-CHATWOOT-ORGANIZAR. Quando o robô marca pedido-fechado ou pendencia-casa.',
    event_name: 'conversation_updated',
    conditions: [{ attribute_key: 'labels', filter_operator: 'equal_to', values: ['pedido-fechado', 'pendencia-casa'], query_operator: null }],
    actions: [{ action_name: 'change_priority', action_params: ['urgent'] }],
    active: true,
  });
  const atuais = new Set(lista(cw('GET', '/automation_rules')).map((r) => r.name));
  for (const r of A) {
    if (atuais.has(r.name)) continue;
    const x = cw('POST', '/automation_rules', r);
    anotar('automacoes', (x.payload || x).id);
    log('automação criada', r.name);
  }
}

// ─── 7. Visões salvas (pastas) para o Igor e o Admin ──
const VISOES = [
  ['Vendas fechadas', 'pedido-fechado'],
  ['Pendência da casa', 'pendencia-casa'],
  ['Pediram para parar (LGPD)', 'parar-contato'],
  ['Interessados', 'interessado'],
];
function visoes() {
  const codigo = `
    require 'json'
    criados = []
    conta = Account.find(${CONTA})
    ${JSON.stringify(USUARIOS_VISOES)}.each do |uid|
      ${JSON.stringify(VISOES)}.each do |nome, etiqueta|
        next if CustomFilter.exists?(account_id: conta.id, user_id: uid, name: nome)
        f = CustomFilter.create!(account: conta, user_id: uid, name: nome, filter_type: :conversation,
          query: { payload: [{ attribute_key: 'labels', filter_operator: 'equal_to', values: [etiqueta], query_operator: nil }] })
        criados << f.id
      end
    end
    puts({ criados: criados }.to_json)`;
  const r = JSON.parse(rails(codigo));
  for (const id of r.criados || []) anotar('visoes', id);
  log('visões criadas', (r.criados || []).length);
}

// ─── 8. Avisos do Igor no navegador: atribuída a ele, mensagem nova na dele, menção ──
function avisos() {
  const atual = Number(psql(`select push_flags from notification_settings where account_id=${CONTA} and user_id=${IGOR}`));
  const novo = atual | 2 | 4 | 8; // 2 = atribuída, 4 = nova mensagem na conversa dele, 8 = menção
  if (novo === atual) return log('avisos do Igor já ligados');
  if (!('avisos_igor' in reg.mudado)) { reg.mudado.avisos_igor = atual; salvar(); }
  rails(`NotificationSetting.find_by!(account_id: ${CONTA}, user_id: ${IGOR}).update_columns(push_flags: ${novo}); puts({ok: true}.to_json)`);
  log('avisos do Igor', atual, '->', novo);
}

// ─── conferir / desfazer / ausência ──
function conferir() {
  const q = (s) => psql(s);
  log('times:', q(`select string_agg(name||'(auto='||allow_auto_assign||')', ', ') from teams where account_id=${CONTA}`));
  log('etiquetas:', q(`select count(*) from labels where account_id=${CONTA}`));
  log('respostas:', q(`select count(*) from canned_responses where account_id=${CONTA}`));
  log('macros:', q(`select count(*) from macros where account_id=${CONTA}`));
  log('automações ativas:', q(`select count(*) from automation_rules where account_id=${CONTA} and active`));
  log('atributos contato:', q(`select string_agg(attribute_key, ', ' order by attribute_key) from custom_attribute_definitions where account_id=${CONTA} and attribute_model=1`));
  log('visões:', q(`select count(*) from custom_filters where account_id=${CONTA}`));
  log('robôs nas caixas:', q(`select string_agg(i.name||'='||coalesce(b.name,'-'), ', ') from inboxes i left join agent_bot_inboxes x on x.inbox_id=i.id left join agent_bots b on b.id=x.agent_bot_id where i.account_id=${CONTA}`));
  log('CSAT ligado em:', q(`select coalesce(string_agg(name, ', '), 'nenhuma') from inboxes where account_id=${CONTA} and csat_survey_enabled`));
  log('ausência com texto em:', q(`select coalesce(string_agg(name, ', '), 'nenhuma') from inboxes where account_id=${CONTA} and coalesce(out_of_office_message,'')<>''`));
}
function desfazer() {
  const c = reg.criado || {};
  for (const id of c.automacoes || []) { try { cw('DELETE', `/automation_rules/${id}`); } catch (e) { log(e.message); } }
  for (const id of c.macros || []) { try { cw('DELETE', `/macros/${id}`); } catch (e) { log(e.message); } }
  for (const id of c.respostas || []) { try { cw('DELETE', `/canned_responses/${id}`); } catch (e) { log(e.message); } }
  for (const id of c.atributos || []) { try { cw('DELETE', `/custom_attribute_definitions/${id}`); } catch (e) { log(e.message); } }
  for (const id of c.times || []) { try { cw('DELETE', `/teams/${id}`); } catch (e) { log(e.message); } }
  // etiquetas novas ficam (o robô já grava esses nomes; apagar só tiraria a cor/descrição)
  for (const [id, antiga] of Object.entries(reg.mudado?.etiquetas || {})) { try { cw('PATCH', `/labels/${id}`, { description: antiga }); } catch (e) { log(e.message); } }
  if (c.visoes?.length) rails(`CustomFilter.where(id: ${JSON.stringify(c.visoes)}).destroy_all; puts({ok: true}.to_json)`);
  if ('avisos_igor' in (reg.mudado || {})) rails(`NotificationSetting.find_by!(account_id: ${CONTA}, user_id: ${IGOR}).update_columns(push_flags: ${Number(reg.mudado.avisos_igor)}); puts({ok: true}.to_json)`);
  if ('ausencia_grtech' in (reg.mudado || {})) cw('PATCH', `/inboxes/${CAIXA.grtech}`, { out_of_office_message: reg.mudado.ausencia_grtech });
  log('desfeito. Registro mantido em', REGISTRO);
}
function ligarAusenciaGrtech() {
  const antiga = psql(`select coalesce(out_of_office_message,'') from inboxes where id=${CAIXA.grtech}`);
  if (!('ausencia_grtech' in reg.mudado)) { reg.mudado.ausencia_grtech = antiga; salvar(); }
  cw('PATCH', `/inboxes/${CAIXA.grtech}`, { out_of_office_message: AUSENCIA_GR });
  log('ausência da GR Tech ligada (1 vez por dia por conversa, só fora de seg–sáb 8h–18h)');
}

const arg = process.argv[2] || '';
if (arg === '--conferir') conferir();
else if (arg === '--desfazer') desfazer();
else if (arg === '--ligar-ausencia-grtech') ligarAusenciaGrtech();
else if (arg === '') {
  const timeDe = times();
  etiquetas();
  atributos();
  await respostas();
  macros();
  automacoes(timeDe);
  visoes();
  avisos();
  conferir();
} else { console.error('argumento desconhecido'); process.exit(2); }
