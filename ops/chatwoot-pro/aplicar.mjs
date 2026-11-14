// Liga a configuração da conta 2 (Central OLLI) pelo cw-api. Idempotente.
// Não imprime token. Não manda mensagem a cliente. Desligar: node aplicar.mjs --desligar
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const WEBHOOK = 'http://central-bot:3012/webhook';
const TOKENS = '/home/igor/chatwoot-central/data/bot-remetente.json';
const REGISTRO = '/home/igor/chatwoot-central/data/chatwoot-pro-registro.json';
const BOT_ANTIGO = 2;
const CAIXAS = {
  'GR Tech': { id: 2, bot: 'Caio', desc: 'Atendimento da GR Tech' },
  'Segundo Andar': { id: 3, bot: 'Rafa', desc: 'Atendimento do Segundo Andar' },
  'OLLI Orçamentos': { id: 4, bot: 'Lívia', desc: 'Atendimento da OLLI Orçamentos' },
};

const ETIQUETAS = [
  ['empresa-olli', 'Conversa da OLLI Orçamentos', '#16A34A', false],
  ['empresa-grtech', 'Conversa da GR Tech', '#EA580C', false],
  ['empresa-segundoandar', 'Conversa do Segundo Andar', '#7C3AED', false],
  ['lead-quente', 'Quer comprar, visitar ou seguir agora', '#DC2626', true],
  ['cliente-antigo', 'Já falava com a empresa antes da Central. O robô não responde na GR Tech.', '#0F766E', true],
  ['pediu-humano', 'Pediu pessoa ou o robô passou o caso', '#B45309', true],
  ['precisa-de-voce', 'Aberta há 2 horas, prioridade alta', '#B45309', true],
  ['reclamacao', 'Reclamação. Prioridade alta.', '#991B1B', false],
  ['cobranca', 'Pagamento, estorno ou cobrança', '#9A3412', false],
  ['lgpd', 'Pedido sobre dados pessoais', '#1E3A8A', false],
  ['fora-da-tabela', 'GR Tech: caso fora da tabela, passa ao Igor', '#C2410C', false],
  ['venda-grande', 'Fecha com pessoa, não com o robô', '#7C3AED', false],
  ['sem-fonte', 'O robô não tinha fonte e passou adiante', '#64748B', false],
  ['sinalizar', 'O robô pediu o time na conversa', '#0369A1', false],
];

const RESPOSTAS = [
  ['olli-preco', 'Hoje são três planos: Grátis (R$ 0, até 5 orçamentos enviados por mês, sem cartão), Pro por R$ 39/mês e Empresa por R$ 99/mês. Pro e Empresa têm opção anual com desconto, que aparece em Conta → Planos.'],
  ['olli-orcamento', 'É rápido: toque em "+ Orçar", escolha ou cadastre o cliente, adicione os itens, ajuste pagamento, garantia e validade e toque em enviar. Sai um PDF e um link que o cliente abre no celular e aprova na hora.'],
  ['olli-login', 'Na tela de login, toque em "Esqueci a senha" e use o e-mail do cadastro. Se entrou com o Google, use "Continuar com Google" com a mesma conta. Se o e-mail não chegar, olhe o spam. Não peça senha, CPF nem cartão.'],
  ['olli-pix', 'Dá para pagar o plano no Pix: em Conta → Planos toque em "Pagar com Pix" e escolha 1 mês ou 1 ano pelo mesmo preço. O Pix não renova sozinho; perto do vencimento o app avisa. O Pix é processado pela AbacatePay.'],
  ['olli-cancelar', 'Cancelar é sem multa: em Conta → "Gerenciar assinatura" (ou pela Google Play, se assinou no Android). O plano segue até o fim do período pago e depois volta para o Grátis, sem perder orçamento nem cliente.'],
  ['olli-nota', 'A OLLI não emite nota fiscal: ela guia até o portal oficial (NFS-e padrão nacional) para você emitir lá. Orçamento, recibo e PDF saem pela OLLI normalmente.'],
  ['gr-visita', 'A visita técnica é R$ 150 e esse valor é abatido se fechar o serviço. A preventiva começa em R$ 450 por aparelho e a instalação de split 9.000 a 12.000 BTU até 3 m começa em R$ 1.000. O valor final é confirmado na visita. Gás não tem preço por aqui: depende do equipamento.'],
  ['gr-nao-gela', 'Entendi. Me passa o bairro, o tipo de equipamento e o que ele está fazendo (não gela, vaza, barulho, cheiro). Se puder, manda foto da etiqueta. A visita é R$ 150, abatida se fechar o serviço.'],
  ['gr-regiao', 'A GR Tech atende São Paulo capital e Grande SP, de segunda a sábado, das 8h às 18h.'],
  ['sa-proposta', 'O Segundo Andar cuida de presença online, atendimento automático e sistema para pequeno negócio. O valor sai de uma proposta, depois de entender o negócio. O próximo passo é uma conversa com o Igor. Me conta qual é o negócio e o que você quer melhorar.'],
  ['ausencia-olli', 'O time da OLLI atende de segunda a sexta, das 9h às 18h. Pode deixar sua mensagem que respondemos no próximo horário.'],
  ['ausencia-gr', 'A GR Tech atende de segunda a sábado, das 8h às 18h. Deixa o bairro e o que aconteceu com o aparelho que o time responde no próximo horário.'],
  ['ausencia-sa', 'O Segundo Andar responde de segunda a sexta, das 9h às 18h. Pode contar o que você precisa que deixamos registrado.'],
  ['agradecer', 'Obrigado pelo contato. Qualquer coisa, é só chamar por aqui.'],
];

const LINK_APP = 'O app é este: https://olliorcamentos.online — a conta grátis leva uns 2 minutos e não pede cartão. O Pro (R$ 39) e o Empresa (R$ 99) ativam em Conta → Planos.';

function limpar(o) {
  if (Array.isArray(o)) return o.map(limpar);
  if (o && typeof o === 'object') {
    const r = {};
    for (const [k, v] of Object.entries(o)) r[k] = /token|secret|password|phone|email|identifier/i.test(k) ? '[redigido]' : limpar(v);
    return r;
  }
  return o;
}

function cw(method, path, body) {
  const args = [method, path];
  if (body !== undefined) args.push(JSON.stringify(body));
  let out = '';
  try {
    out = execFileSync('cw-api', args, { encoding: 'utf8', timeout: 30000, maxBuffer: 8_000_000 });
  } catch (e) {
    throw new Error(`${method} ${path} falhou`);
  }
  const t = String(out || '').trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    throw new Error(`${method} ${path} resposta invalida`);
  }
}

function exigirOk(res, oque) {
  if (res && (res.error || res.status >= 400)) {
    console.error(oque, JSON.stringify(limpar(res)).slice(0, 400));
    throw new Error(oque);
  }
  return res;
}

function lista(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.payload)) return res.payload;
  if (Array.isArray(res?.data?.payload)) return res.data.payload;
  return [];
}

function rails(codigo) {
  const out = execFileSync('docker', ['exec', '-i', 'chatwoot-demo-rails-1', 'bundle', 'exec', 'rails', 'runner', '-'], {
    input: codigo, encoding: 'utf8', timeout: 120000, maxBuffer: 2_000_000,
  });
  return out.trim().split('\n').filter((l) => l.startsWith('{')).pop() || '';
}

function statusDoToken(token) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `
    const res = await fetch('http://127.0.0.1:3010/api/v1/accounts/2/conversations/0', {
      headers: { api_access_token: process.env.CW_PROVA },
    });
    console.log(String(res.status));
  `], { env: { ...process.env, CW_PROVA: token }, encoding: 'utf8', timeout: 20000 });
  return String(r.stdout || '').trim().split('\n').pop();
}

function horas(abre, fecha, dias) {
  return [0, 1, 2, 3, 4, 5, 6].map((dia) => {
    const aberto = dias.includes(dia);
    return {
      day_of_week: dia,
      closed_all_day: !aberto,
      open_all_day: false,
      open_hour: aberto ? abre : null,
      open_minutes: aberto ? 0 : null,
      close_hour: aberto ? fecha : null,
      close_minutes: aberto ? 0 : null,
    };
  });
}

function gravarRegistro(extra) {
  mkdirSync(dirname(REGISTRO), { recursive: true });
  let atual = {};
  try { atual = JSON.parse(readFileSync(REGISTRO, 'utf8')); } catch { /* primeiro uso */ }
  const junto = { ...atual, ...extra, atualizado_em: new Date().toISOString() };
  writeFileSync(REGISTRO, JSON.stringify(junto, null, 2), { mode: 0o600 });
  chmodSync(REGISTRO, 0o600);
}

function etiquetas() {
  const tem = new Map(lista(cw('GET', '/labels')).map((l) => [l.title, l]));
  const criadas = [];
  for (const [title, description, color, show] of ETIQUETAS) {
    if (tem.has(title)) continue;
    const r = exigirOk(cw('POST', '/labels', { label: { title, description, color, show_on_sidebar: show } }), `etiqueta ${title}`);
    criadas.push(r?.title || title);
  }
  return criadas;
}

function atributos() {
  const tem = new Map(lista(cw('GET', '/custom_attribute_definitions')).map((a) => [a.attribute_key, a]));
  const desc = {
    especialidade: 'Ofício de quem atende.',
    cidade: 'Cidade ou bairro citado.',
    plano: 'Plano OLLI: gratis, trial, pro ou empresa.',
    etapa: 'Etapa no app OLLI.',
  };
  for (const [key, texto] of Object.entries(desc)) {
    const a = tem.get(key);
    if (a && !a.attribute_description) cw('PATCH', `/custom_attribute_definitions/${a.id}`, { custom_attribute_definition: { attribute_description: texto } });
  }
  const novos = [];
  if (!tem.has('etapa_funil')) {
    exigirOk(cw('POST', '/custom_attribute_definitions', { custom_attribute_definition: {
      attribute_display_name: 'Etapa do funil',
      attribute_key: 'etapa_funil',
      attribute_display_type: 'list',
      attribute_model: 'conversation_attribute',
      attribute_description: 'Etapa comercial da conversa.',
      attribute_values: ['novo', 'em_conversa', 'orcamento_enviado', 'fechado', 'perdido'],
    } }), 'atributo etapa_funil');
    novos.push('etapa_funil');
  }
  if (!tem.has('valor_estimado')) {
    exigirOk(cw('POST', '/custom_attribute_definitions', { custom_attribute_definition: {
      attribute_display_name: 'Valor estimado',
      attribute_key: 'valor_estimado',
      attribute_display_type: 'number',
      attribute_model: 'conversation_attribute',
      attribute_description: 'Valor estimado em reais. Não é preço prometido ao cliente.',
    } }), 'atributo valor_estimado');
    novos.push('valor_estimado');
  }
  return novos;
}

function respostas() {
  const tem = new Map(lista(cw('GET', '/canned_responses')).map((r) => [r.short_code, r]));
  const ids = [];
  for (const [short_code, content] of RESPOSTAS) {
    if (tem.has(short_code)) {
      cw('PATCH', `/canned_responses/${tem.get(short_code).id}`, { canned_response: { short_code, content } });
      ids.push(tem.get(short_code).id);
    } else {
      const r = exigirOk(cw('POST', '/canned_responses', { canned_response: { short_code, content } }), `resposta ${short_code}`);
      ids.push(r.id);
    }
  }
  return ids;
}

function macros() {
  const funil = ['funil-novo', 'funil-em-conversa', 'funil-orcamento-enviado', 'funil-fechado', 'funil-perdido'];
  const mover = (nome, etapa) => ({
    name: nome,
    visibility: 'global',
    actions: [
      ...funil.filter((f) => f !== etapa).map((f) => ({ action_name: 'remove_label', action_params: [f] })),
      { action_name: 'add_label', action_params: [etapa] },
    ],
  });
  const defs = [
    {
      name: 'Passar para Vendas',
      visibility: 'global',
      actions: [
        { action_name: 'assign_team', action_params: [1] },
        // O robô local só para quando o responsável deixa de ser o AgentBot.
        { action_name: 'assign_agent', action_params: [2] },
        { action_name: 'change_status', action_params: ['open'] },
        { action_name: 'add_label', action_params: ['pediu-humano'] },
        { action_name: 'add_private_note', action_params: ['Passado para o time de Vendas.'] },
      ],
    },
    {
      name: 'Marcar visita',
      visibility: 'global',
      actions: [
        { action_name: 'assign_team', action_params: [1] },
        { action_name: 'assign_agent', action_params: [2] },
        { action_name: 'change_priority', action_params: ['high'] },
        { action_name: 'add_label', action_params: ['funil-em-conversa'] },
        { action_name: 'remove_label', action_params: ['funil-novo'] },
        { action_name: 'add_private_note', action_params: ['Visita a confirmar: bairro, equipamento e período.'] },
        { action_name: 'send_message', action_params: ['Anotado. A visita técnica é o próximo passo. Me confirma o bairro, o tipo de equipamento e um período do dia, que o time confirma o horário.'] },
      ],
    },
    {
      name: 'Mandar link do app',
      visibility: 'global',
      actions: [
        { action_name: 'send_message', action_params: [LINK_APP] },
        { action_name: 'add_label', action_params: ['ativacao'] },
      ],
    },
    {
      name: 'Encerrar com agradecimento',
      visibility: 'global',
      actions: [
        { action_name: 'send_message', action_params: ['Obrigado pelo contato. Qualquer coisa, é só chamar por aqui.'] },
        { action_name: 'resolve_conversation', action_params: [] },
      ],
    },
    mover('Funil: Novo', 'funil-novo'),
    mover('Funil: Em conversa', 'funil-em-conversa'),
    mover('Funil: Orçamento enviado', 'funil-orcamento-enviado'),
    mover('Funil: Fechado', 'funil-fechado'),
    mover('Funil: Perdido', 'funil-perdido'),
  ];
  const tem = new Map(lista(cw('GET', '/macros')).map((m) => [m.name, m]));
  const ids = [];
  for (const def of defs) {
    if (tem.has(def.name)) {
      cw('PATCH', `/macros/${tem.get(def.name).id}`, def);
      ids.push(tem.get(def.name).id);
    } else {
      const r = exigirOk(cw('POST', '/macros', def), `macro ${def.name}`);
      ids.push(r.id);
    }
  }
  return ids;
}

function automacoes() {
  const regra = (name, event_name, conditions, actions, delay) => ({
    name, description: 'Central OLLI. Não envia mensagem ao cliente.', event_name, active: true,
    conditions, actions, ...(delay ? { execution_delay: delay } : {}),
  });
  const caixa = (nome, inbox, labels) => regra(
    nome,
    'conversation_created',
    [{ attribute_key: 'inbox_id', filter_operator: 'equal_to', values: [String(inbox)], query_operator: null }],
    [{ action_name: 'add_label', action_params: labels }],
  );
  const defs = [
    caixa('Central: caixa OLLI ganha etiqueta da empresa', 4, ['empresa-olli', 'olli-orcamentos', 'funil-novo']),
    caixa('Central: caixa GR Tech ganha etiqueta da empresa', 2, ['empresa-grtech', 'gr-tech', 'funil-novo']),
    caixa('Central: caixa Segundo Andar ganha etiqueta da empresa', 3, ['empresa-segundoandar', 'segundo-andar', 'funil-novo']),
    regra(
      'Central: aberto há 2 horas fica prioritário',
      'conversation_updated',
      [
        { attribute_key: 'status', filter_operator: 'equal_to', values: ['open'], query_operator: 'AND' },
        { attribute_key: 'inbox_id', filter_operator: 'equal_to', values: ['2', '3', '4'], query_operator: null },
      ],
      [
        { action_name: 'change_priority', action_params: ['high'] },
        { action_name: 'add_label', action_params: ['precisa-de-voce'] },
      ],
      120,
    ),
    regra(
      'Central: pedido humano fica urgente',
      'conversation_updated',
      [{ attribute_key: 'labels', filter_operator: 'equal_to', values: ['pediu-humano', 'reclamacao', 'cobranca', 'lgpd'], query_operator: null }],
      [{ action_name: 'change_priority', action_params: ['urgent'] }],
    ),
  ];
  const tem = new Map(lista(cw('GET', '/automation_rules')).map((r) => [r.name, r]));
  const ids = [];
  for (const def of defs) {
    if (tem.has(def.name)) {
      cw('PATCH', `/automation_rules/${tem.get(def.name).id}`, def);
      ids.push(tem.get(def.name).id);
    } else {
      const r = exigirOk(cw('POST', '/automation_rules', def), `automacao ${def.name}`);
      ids.push(r.id);
    }
  }
  return ids;
}

function horario() {
  const antes = {};
  for (const ib of lista(cw('GET', '/inboxes'))) {
    antes[ib.id] = { timezone: ib.timezone, working_hours_enabled: ib.working_hours_enabled, out_of_office_message: ib.out_of_office_message || '' };
  }
  const planos = [
    [2, horas(8, 18, [1, 2, 3, 4, 5, 6])],
    [4, horas(9, 18, [1, 2, 3, 4, 5])],
    [3, horas(9, 18, [1, 2, 3, 4, 5])],
  ];
  for (const [id, working_hours] of planos) {
    exigirOk(cw('PATCH', `/inboxes/${id}`, {
      timezone: 'America/Sao_Paulo',
      working_hours_enabled: true,
      out_of_office_message: '',
      working_hours,
    }), `horario caixa ${id}`);
  }
  exigirOk(cw('PATCH', '/inboxes/5', {
    timezone: 'America/Sao_Paulo',
    working_hours_enabled: false,
    out_of_office_message: '',
  }), 'fuso da caixa pessoal');
  return antes;
}

function robos() {
  let bots = lista(cw('GET', '/agent_bots'));
  for (const caixa of Object.values(CAIXAS)) {
    if (!bots.some((b) => b.name === caixa.bot)) {
      exigirOk(cw('POST', '/agent_bots', {
        name: caixa.bot, description: caixa.desc, outgoing_url: WEBHOOK, bot_type: 'webhook',
      }), `robo ${caixa.bot}`);
    }
  }
  bots = lista(cw('GET', '/agent_bots'));
  const mapa = {};
  const ids = {};
  for (const [nomeCaixa, caixa] of Object.entries(CAIXAS)) {
    const b = bots.find((x) => x.name === caixa.bot);
    if (!b?.id || !b.access_token) throw new Error(`robo ${caixa.bot} sem id`);
    if (b.outgoing_url !== WEBHOOK) cw('PATCH', `/agent_bots/${b.id}`, { outgoing_url: WEBHOOK });
    mapa[nomeCaixa] = b.access_token;
    ids[caixa.bot] = b.id;
    const codigo = statusDoToken(b.access_token);
    if (codigo !== '404') throw new Error(`token ${caixa.bot} recusado (${codigo})`);
    const ligou = cw('POST', `/inboxes/${caixa.id}/set_agent_bot`, { agent_bot: b.id });
    if (ligou && ligou.error) throw new Error(`ligar ${caixa.bot}`);
  }
  mkdirSync(dirname(TOKENS), { recursive: true });
  writeFileSync(TOKENS, JSON.stringify(mapa), { mode: 0o600 });
  chmodSync(TOKENS, 0o600);
  return ids;
}

function ajuda() {
  const artigos = [
    ['App OLLI', 'app-olli', 'Como criar e enviar um orçamento', 'orcamento', 'Toque em "+ Orçar", escolha ou cadastre o cliente, adicione os itens (dá para ditar por voz), ajuste pagamento, garantia e validade e toque em enviar. Sai um PDF e um link. O cliente abre no celular e aprova sem instalar nada.'],
    ['App OLLI', 'app-olli', 'Não consigo entrar ou esqueci a senha', 'login', 'Na tela de login, toque em "Esqueci a senha" e use o e-mail do cadastro. Se entrou com o Google, use "Continuar com Google" com a mesma conta. Olhe o spam se o e-mail não chegar. Nunca mande senha por WhatsApp.'],
    ['App OLLI', 'app-olli', 'Quanto custa a OLLI', 'planos', 'Grátis: R$ 0, até 5 orçamentos enviados por mês, sem cartão. Pro: R$ 39 por mês. Empresa: R$ 99 por mês. Há opção anual com desconto, e o valor aparece em Conta → Planos. Depois do primeiro envio dá para ativar 14 dias de Pro sem cobrança automática.'],
    ['App OLLI', 'app-olli', 'Como pagar o plano no Pix', 'pix', 'Em Conta → Planos, toque em "Pagar com Pix" e escolha 1 mês ou 1 ano pelo mesmo preço. O Pix não renova sozinho: perto do vencimento o app avisa. O processamento é da AbacatePay.'],
    ['App OLLI', 'app-olli', 'Como cancelar o plano', 'cancelar', 'Sem multa. Em Conta → "Gerenciar assinatura", ou pela Google Play se a assinatura foi no Android. O plano segue até o fim do período pago e volta para o Grátis. Orçamentos e clientes continuam na conta.'],
    ['App OLLI', 'app-olli', 'A OLLI emite nota fiscal?', 'nota', 'Não. A OLLI não emite nota fiscal. Ela indica o caminho do portal oficial da NFS-e padrão nacional, e a nota é emitida lá. Orçamento, recibo e PDF saem pelo app.'],
    ['GR Tech', 'gr-tech', 'Quanto custa visita, preventiva e instalação', 'visita', 'Visita técnica: R$ 150, abatida se o serviço fechar. Preventiva: a partir de R$ 450 por aparelho. Instalação de split de 9.000 a 12.000 BTU, até 3 metros: a partir de R$ 1.000, e a visita entra nesse total. O valor final é confirmado no local. Gás não tem preço de tabela: depende do equipamento, da carga e de vazamento.'],
    ['GR Tech', 'gr-tech', 'O ar não gela, vaza ou parou', 'corretiva', 'Passe o bairro, o tipo de equipamento e o sintoma. Uma foto da etiqueta ajuda. O próximo passo é a visita técnica de R$ 150, abatida se fechar o serviço. Atendemos São Paulo capital e Grande SP.'],
    ['GR Tech', 'gr-tech', 'Qual região e qual horário', 'regiao', 'São Paulo capital e Grande SP. Horário de atendimento: segunda a sábado, das 8h às 18h.'],
    ['Segundo Andar', 'segundo-andar', 'O que o Segundo Andar faz', 'proposta', 'Presença online (site, Google Meu Negócio, WhatsApp Business e formulário), atendimento automático e sistema sob medida para pequeno negócio. Não há tabela fechada: o valor sai de uma proposta depois de entender o negócio. O próximo passo é uma conversa com o Igor.'],
  ];
  let portais = lista(cw('GET', '/portals'));
  let portal = portais.find((p) => p.slug === 'ajuda');
  if (!portal) {
    portal = exigirOk(cw('POST', '/portals', { portal: {
      name: 'Ajuda da Central',
      slug: 'ajuda',
      page_title: 'Ajuda OLLI, GR Tech e Segundo Andar',
      header_text: 'Respostas curtas. O que não estiver aqui, o time responde no WhatsApp.',
      homepage_link: 'https://olliorcamentos.online',
      color: '#16A34A',
      archived: false,
      config: { default_locale: 'pt_BR', allowed_locales: ['pt_BR'] },
    } }), 'portal');
    if (portal?.payload) portal = portal.payload;
  }
  const pid = portal.slug || 'ajuda';
  let cats = lista(cw('GET', `/portals/${pid}/categories`));
  const catId = {};
  for (const [nome, slug] of [['App OLLI', 'app-olli'], ['GR Tech', 'gr-tech'], ['Segundo Andar', 'segundo-andar']]) {
    let c = cats.find((x) => x.slug === slug);
    if (!c) {
      c = exigirOk(cw('POST', `/portals/${pid}/categories`, { category: {
        name: nome, slug, locale: 'pt_BR', description: nome, position: Object.keys(catId).length + 1,
      } }), `categoria ${slug}`);
      if (c?.payload) c = c.payload;
    }
    catId[slug] = c.id;
  }
  const existentes = lista(cw('GET', `/portals/${pid}/articles?locale=pt_BR`));
  const porTitulo = new Map(existentes.map((a) => [a.title, a]));
  let rascunhos = 0;
  for (const [catNome, slug, title, articleSlug, texto] of artigos) {
    const content = `${texto}\n\nEsta resposta é da equipe. Não promete prazo, desconto nem resultado que não esteja escrito aqui.`;
    const body = {
      title, slug: articleSlug, content, locale: 'pt_BR', status: 'draft',
      category_id: catId[slug], author_id: 2, description: texto.slice(0, 140),
    };
    const ja = porTitulo.get(title);
    const r = ja
      ? cw('PATCH', `/portals/${pid}/articles/${ja.id}`, { article: body })
      : cw('POST', `/portals/${pid}/articles`, { article: body });
    exigirOk(r, `artigo ${title}`);
    rascunhos += 1;
    void catNome;
  }
  exigirOk(cw('PATCH', `/portals/${pid}`, { portal: { archived: true } }), 'arquivar portal');
  return { portal: pid, artigos: rascunhos, arquivado: true };
}

function ligarAtraso() {
  const linha = rails(`
a = Account.find(2)
antes = a.feature_enabled?('delayed_automations')
a.enable_features!('delayed_automations') unless antes
puts({ antes: antes, depois: a.reload.feature_enabled?('delayed_automations') }.to_json)
`);
  const j = JSON.parse(linha);
  if (!j.depois) throw new Error('atraso nao ligou');
  return j;
}

function reiniciarRobo() {
  const nomes = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' }).split('\n');
  const nome = nomes.find((n) => n.startsWith('central-bot'));
  if (!nome) throw new Error('container do robo nao encontrado');
  execFileSync('docker', ['restart', nome], { encoding: 'utf8', timeout: 60000 });
  let saude = '';
  for (let i = 0; i < 15; i += 1) {
    execFileSync('sleep', ['1']);
    try {
      saude = execFileSync('curl', ['-sf', '-m', '5', 'http://127.0.0.1:3012/health'], { encoding: 'utf8' });
      if (saude.includes('ok')) return nome;
    } catch { /* ainda subindo */ }
  }
  throw new Error('robo sem saude');
}

function conferir() {
  const linha = rails(`
acc = Account.find(2)
linhas = acc.inboxes.order(:id).map { |i| [i.id, i.name, i.timezone, i.working_hours_enabled, i.out_of_office_message.to_s == '', i.agent_bot&.name].join('|') }
pub = Portal.find_by(account_id: 2, slug: 'ajuda')
artigos = pub ? pub.articles.group(:status).count : {}
puts({ caixas: linhas, artigos: artigos, atraso: acc.feature_enabled?('delayed_automations'), visoes: CustomFilter.where(account_id: 2).count }.to_json)
`);
  return JSON.parse(linha);
}

const VISOES = [
  'Precisa de você', 'Leads quentes', 'Clientes antigos GR Tech', 'Ativação do app',
  'Funil: Novo', 'Funil: Em conversa', 'Funil: Orçamento enviado', 'Funil: Fechado', 'Funil: Perdido',
];

function desligar() {
  for (const id of [2, 3, 4]) cw('POST', `/inboxes/${id}/set_agent_bot`, { agent_bot: BOT_ANTIGO });
  let reg = {};
  try { reg = JSON.parse(readFileSync(REGISTRO, 'utf8')); } catch { /* sem registro */ }
  // O registro de horário foi gravado depois da primeira aplicação. Desligar volta a flag para off.
  for (const id of [2, 3, 4, 5]) {
    cw('PATCH', `/inboxes/${id}`, { working_hours_enabled: false, out_of_office_message: '' });
  }
  for (const id of reg.automacoes || []) cw('DELETE', `/automation_rules/${id}`);
  for (const id of reg.macros || []) cw('DELETE', `/macros/${id}`);
  for (const id of reg.respostas || []) cw('DELETE', `/canned_responses/${id}`);
  const nomes = JSON.stringify([...(reg.visoes || []), ...VISOES]);
  rails(`
a = Account.find(2)
a.disable_features!('delayed_automations')
n = CustomFilter.where(account_id: 2, name: ${nomes}).delete_all
puts({ ok: true, visoes: n }.to_json)
`);
  try { writeFileSync(TOKENS, '{}\n', { mode: 0o600 }); } catch { /* arquivo pode nao existir */ }
  reiniciarRobo();
  console.log('desligado: robôs voltaram para Atendimento OLLI; horário, atraso, automações, macros, respostas e visões criadas foram removidos');
}

function main() {
  if (process.argv.includes('--desligar')) {
    desligar();
    return;
  }
  const criadas = etiquetas();
  const attrs = atributos();
  const respostasIds = respostas();
  const macroIds = macros();
  const horarioAntes = horario();
  const atraso = ligarAtraso();
  const autoIds = automacoes();
  const bots = robos();
  const linhaVisoes = rails(readFileSync(join(AQUI, 'visoes.rb'), 'utf8'));
  const vis = JSON.parse(linhaVisoes);
  const portal = ajuda();
  gravarRegistro({
    etiquetas_criadas: criadas,
    atributos_criados: attrs,
    respostas: respostasIds,
    macros: macroIds,
    automacoes: autoIds,
    horario_antes: horarioAntes,
    atraso_era_falso: atraso.antes === false,
    robos: bots,
    portal,
    visoes_contagem: vis.visoes,
  });
  const container = reiniciarRobo();
  const prova = conferir();
  gravarRegistro({
    etiquetas_criadas: criadas,
    atributos_criados: attrs,
    respostas: respostasIds,
    macros: macroIds,
    automacoes: autoIds,
    horario_antes: horarioAntes,
    atraso_era_falso: atraso.antes === false,
    robos: bots,
    portal,
    visoes_contagem: vis.visoes,
  });
  console.log(JSON.stringify({ container, prova, etiquetas: criadas.length, atributos: attrs, macros: macroIds.length, automacoes: autoIds.length, portal }, null, 2));
}

main();
