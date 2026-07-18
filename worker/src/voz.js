// VOZ → ITENS DE ORÇAMENTO — módulo próprio (extraído de index.js) pra poder
// ser testado sem arrastar @sentry/cloudflare (só instalado em
// worker/node_modules, fora do `npm ci` da raiz — mesma razão pela qual
// creditos.js/rateLimit.js já são módulos-folha testáveis isoladamente; ver
// scripts/teste-voz-conversa.ts).
//
// Dois modos, dois formatos de entrada, MESMO destino no app (montarOrcamento):
//   - handleVoz          — tiro único: transcript pronto → itens (hoje).
//   - handleVozConversa  — conversa (Tier B, docs/ENXAME/OLLI_VOZ_CONVERSA.md):
//                          N turnos até a Olli ter cliente+item, perguntando
//                          de volta quando falta algo.

import { gemini } from './gemini.js';
import { cobrarCreditoVoz } from './creditos.js';
import { parseJsonBody, parseJsonLoose, cortar } from './util.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
  'Access-Control-Max-Age': '86400',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

// ─── VOZ → ITENS (tiro único) ────────────────────────────────
// Contexto do OFÍCIO por vertical (personalização — a IA fala a língua do segmento).
// DEFAULT = ar-condicionado/refrigeração: cliente antigo que NÃO manda `vertical` mantém
// EXATAMENTE o comportamento atual (backward-compat). Ver src/services/verticais.ts.
export function rotuloVertical(vertical) {
  switch (vertical) {
    case 'eletrica': return 'instalações elétricas (NR-10, NBR 5410, quadros, disjuntores, aterramento)';
    case 'hidraulica': return 'hidráulica e encanamento (vazamentos, pressão, NBR 5626)';
    case 'pintura': return 'pintura e acabamento (cálculo de tinta, superfícies, demãos)';
    case 'dedetizacao': return 'controle de pragas / dedetização (RDC 622, produtos, responsável técnico)';
    case 'jardinagem': return 'jardinagem e paisagismo (poda, irrigação, manutenção)';
    case 'geral': return 'serviços de campo em geral';
    case 'refrigeracao':
    default: return 'ar-condicionado e refrigeração (split, multi-split, VRF)';
  }
}
export function vozSystem(vertical) {
  return `Você é a OLLI, assistente de um prestador de serviços de ${rotuloVertical(vertical)} no Brasil. O técnico fala em voz alta o que vai fazer e você transforma isso em itens de orçamento. Use o catálogo quando o item casar. Responda SOMENTE com JSON válido em pt-BR.`;
}

// `linhaFala` permite trocar a 1ª linha do prompt: por padrão cita o
// transcript em texto (rota /voz); /transcrever (modo orcamento) passa o
// áudio como anexo em vez de transcript, então usa uma linha própria e exige
// o campo extra "texto" (a transcrição) no JSON de saída.
export function vozPrompt(transcript, catalogo, { linhaFala, exigirTexto = false } = {}) {
  const cat = Array.isArray(catalogo) && catalogo.length
    ? `\nCatálogo do prestador (use o preço quando o item casar):\n${catalogo.map((c) => `- ${c.nome}${c.preco ? ` = R$ ${c.preco}` : ''}`).join('\n')}`
    : '';
  const fala = linhaFala || `Fala do técnico: "${transcript}"`;
  const campoTexto = exigirTexto ? '\n  "texto": "transcrição fiel da fala do técnico em português do Brasil",' : '';
  return `${fala}${cat}

Monte os itens no JSON EXATO:
{${campoTexto}
  "titulo": "título curto do serviço (opcional)",
  "clienteNome": "nome do cliente, se ele falou (opcional)",
  "itens": [
    { "descricao": "descrição do item", "quantidade": 1, "valorUnitario": 0, "tipo": "servico" }
  ],
  "observacao": "observação opcional"
}
Regras: "tipo" é "servico" ou "peca". Se não der pra estimar o preço, use null em "valorUnitario". Quantidade é número.`;
}

// Limites de sanitização da rota /voz: sem isto, um transcript ou catálogo
// gigante (dentro dos 20 req/min da IA_RL) queima cota do Gemini e vira vetor
// de prompt injection direto no prompt.
export const VOZ_MAX = { transcript: 4000, catalogoItens: 100, nome: 120 };

// Cobrança de crédito (confirmarCredito/creditoRef) é responsabilidade de
// creditos.js — `cobrarCreditoVoz` (regra de rocha, fail-open de infra,
// idempotência por ref — ver o doc lá). Handlers abaixo só chamam.

export async function handleVoz(bodyText, env, user) {
  const { transcript: rawTranscript, catalogo: rawCatalogo, vertical, confirmarCredito, creditoRef } = parseJsonBody(bodyText);
  const transcript = cortar(rawTranscript, VOZ_MAX.transcript);
  if (!transcript) return json({ ok: false, erro: 'sem_transcript' });
  const catalogo = Array.isArray(rawCatalogo)
    ? rawCatalogo.slice(0, VOZ_MAX.catalogoItens).map((c) => ({
        nome: cortar(c && c.nome, VOZ_MAX.nome),
        preco: c && typeof c.preco === 'number' ? c.preco : undefined,
      }))
    : undefined;
  const text = await gemini(env, { system: vozSystem(vertical), user: vozPrompt(transcript, catalogo), wantJson: true, temperature: 0.3 });
  const parsed = parseJsonLoose(text);
  if (!parsed || !Array.isArray(parsed.itens)) {
    console.error('[olli-voz] parse do Gemini falhou; texto recebido:', (text || '').slice(0, 300));
    return json({ ok: false, erro: 'resposta_invalida' });
  }

  // `conteudo: transcript` é o fallback de idempotência quando o corpo não traz
  // `creditoRef` (o app hoje não manda) — ver o doc de cobrarCreditoVoz em creditos.js.
  const cobranca = await cobrarCreditoVoz(env, user, { confirmarCredito, creditoRef, conteudo: transcript });
  if (cobranca.bloqueado) return json({ ok: false, erro: 'sem_creditos' });

  return json({
    ok: true,
    titulo: typeof parsed.titulo === 'string' ? parsed.titulo : undefined,
    clienteNome: typeof parsed.clienteNome === 'string' ? parsed.clienteNome : undefined,
    itens: parsed.itens,
    observacao: typeof parsed.observacao === 'string' ? parsed.observacao : undefined,
  });
}

// ─── VOZ EM CONVERSA (Tier B) ────────────────────────────────
// Mesmo destino (montarOrcamento no app), formato de entrada diferente: em
// vez de um transcript pronto, o app manda o HISTÓRICO da conversa (papel
// 'user'|'olli' — o técnico e a Olli se revezando) e a Olli decide, a cada
// turno, se já tem cliente+item pra montar o orçamento ou se precisa
// perguntar mais um dado. Ver docs/ENXAME/OLLI_VOZ_CONVERSA.md (Fase 3).
//
// Contrato de saída (2 formas, NUNCA as duas juntas):
//   - falta dado obrigatório → { ok:true, pronto:false, pergunta:"..." }
//   - já dá pra montar       → { ok:true, pronto:true, titulo?, clienteNome?, itens:[...], observacao? }
//     (MESMO shape do handleVoz acima + `pronto:true` — o app reusa
//     montarOrcamento sem precisar de um parser novo.)
//
// Entrada aceita os DOIS nomes de campo pro histórico — `conversa` (contrato
// original deste cluster) OU `historico` (nome usado pelo cluster T3b em
// src/services/olliAssistente.ts, cujo próprio comentário já previa "ajustar
// aqui se o T3a fechar diferente" — em vez de forçar o ajuste do lado do app,
// o worker aceita os dois, sem custo de compatibilidade). Idem pra rota: tanto
// `POST /voz` com esse campo quanto `POST /voz/conversa` dedicado chegam aqui
// (ver o roteador em index.js).
//
// `conversa`/`historico` vira contents[] (histórico real, papel→role) pro
// gemini(); o catálogo/vertical/contrato ficam no systemInstruction
// (vozConversaSystem), que não muda de turno pra turno — só o histórico cresce.
export const VOZ_CONVERSA_MAX = { turnos: 6, mensagens: 40, texto: 4000 };

/**
 * `forcarPronto` = true no teto de turnos OU quando o app pede `fechar:true`
 * ("montar com o que tem", ver ConversarVozOpts.fechar em olliAssistente.ts):
 * instrui o Gemini a fechar o orçamento com o que tiver, sem mais perguntas.
 * Isto é só a INSTRUÇÃO pro modelo — o fechamento é ENFORÇADO de verdade no
 * servidor (handleVozConversa ignora um "pergunta" teimoso quando
 * `forcarPronto` é true), porque um modelo de linguagem não é uma trava
 * confiável sozinho.
 */
export function vozConversaSystem(vertical, catalogo, forcarPronto) {
  const cat = Array.isArray(catalogo) && catalogo.length
    ? `\nCatálogo do prestador (use o preço quando o item casar):\n${catalogo.map((c) => `- ${c.nome}${c.preco ? ` = R$ ${c.preco}` : ''}`).join('\n')}`
    : '';
  const regraTeto = forcarPronto
    ? '\n\nATENÇÃO: feche a conversa AGORA — NÃO faça nenhuma pergunta. Responda IMEDIATAMENTE com o JSON de "pronto":true, montando o orçamento com o que você já sabe até agora (use null no que não souber; se não souber o nome do cliente, use "Cliente").'
    : '';
  return `Você é a OLLI, assistente de um prestador de serviços de ${rotuloVertical(vertical)} no Brasil. Você está CONVERSANDO por voz com o técnico pra montar um orçamento aos poucos: ele fala, você entende, e se faltar algo essencial você pergunta de volta — uma pergunta curta por vez, como um funcionário faria.${cat}

A cada turno, responda com SOMENTE UM destes dois formatos de JSON (nunca os dois juntos, nunca texto fora do JSON):

1. Se AINDA faltar um dado OBRIGATÓRIO — o nome do cliente OU pelo menos 1 item com o que fazer — devolva:
{ "pergunta": "sua pergunta curta e objetiva, em pt-BR" }

2. Se já der pra montar um orçamento útil (cliente E pelo menos 1 item), devolva o JSON EXATO:
{
  "pronto": true,
  "titulo": "título curto do serviço (opcional)",
  "clienteNome": "nome do cliente",
  "itens": [
    { "descricao": "descrição do item", "quantidade": 1, "valorUnitario": 0, "tipo": "servico" }
  ],
  "observacao": "observação opcional"
}
Regras: "tipo" é "servico" ou "peca". Se não der pra estimar o preço, use null em "valorUnitario" (NUNCA invente um valor). Quantidade é número. Nunca invente cliente ou item que o técnico não mencionou.${regraTeto}`;
}

export async function handleVozConversa(bodyText, env, user) {
  const raw = parseJsonBody(bodyText);
  const {
    conversa: rawConversa,
    historico: rawHistorico, // alias aceito — ver comentário acima de VOZ_CONVERSA_MAX
    catalogo: rawCatalogo,
    vertical,
    conversationId,
    confirmarCredito,
    fechar,
  } = raw;
  const rawTurnos = Array.isArray(rawConversa) ? rawConversa : rawHistorico;

  const conversa = Array.isArray(rawTurnos)
    ? rawTurnos
        .slice(-VOZ_CONVERSA_MAX.mensagens)
        .filter((m) => m && (m.papel === 'user' || m.papel === 'olli') && typeof m.texto === 'string' && m.texto.trim())
        .map((m) => ({ papel: m.papel, texto: cortar(m.texto, VOZ_CONVERSA_MAX.texto) }))
        .filter((m) => m.texto)
    : [];
  if (!conversa.length) return json({ ok: false, erro: 'sem_conversa' });

  // Teto de turnos conta só as falas do TÉCNICO ('user') — cada pergunta da
  // Olli é resposta a um turno dele, não um turno a mais. `fechar:true` força
  // o mesmo fechamento por pedido explícito do usuário ("montar com o que tem"),
  // independente do teto — ver ConversarVozOpts.fechar em olliAssistente.ts.
  const turnosUsuario = conversa.filter((m) => m.papel === 'user').length;
  const forcarPronto = fechar === true || turnosUsuario >= VOZ_CONVERSA_MAX.turnos;

  const catalogo = Array.isArray(rawCatalogo)
    ? rawCatalogo.slice(0, VOZ_MAX.catalogoItens).map((c) => ({
        nome: cortar(c && c.nome, VOZ_MAX.nome),
        preco: c && typeof c.preco === 'number' ? c.preco : undefined,
      }))
    : undefined;

  const contents = conversa.map((m) => ({
    role: m.papel === 'olli' ? 'model' : 'user',
    parts: [{ text: m.texto }],
  }));

  const text = await gemini(env, {
    system: vozConversaSystem(vertical, catalogo, forcarPronto),
    user: contents,
    wantJson: true,
    temperature: 0.3,
  });
  const parsed = parseJsonLoose(text);

  if (!forcarPronto) {
    if (!parsed) {
      console.error('[olli-voz-conversa] parse do Gemini falhou; texto recebido:', (text || '').slice(0, 300));
      return json({ ok: false, erro: 'resposta_invalida' });
    }
    if (parsed.pronto !== true) {
      if (typeof parsed.pergunta !== 'string' || !parsed.pergunta.trim()) {
        console.error('[olli-voz-conversa] resposta sem pergunta nem pronto; texto recebido:', (text || '').slice(0, 300));
        return json({ ok: false, erro: 'resposta_invalida' });
      }
      // Pergunta NUNCA cobra — só o turno que fecha (pronto:true) passa por
      // cobrarCreditoVoz, mais abaixo.
      return json({ ok: true, pronto: false, pergunta: parsed.pergunta.trim() });
    }
    if (!Array.isArray(parsed.itens)) {
      console.error('[olli-voz-conversa] pronto:true sem itens; texto recebido:', (text || '').slice(0, 300));
      return json({ ok: false, erro: 'resposta_invalida' });
    }
  }
  // forcarPronto === true: fecha com o que tiver, MESMO que o Gemini tenha
  // devolvido um "pergunta" teimoso ou um JSON incompleto — o teto de turnos
  // é ENFORÇADO aqui, não é só uma instrução de prompt. O app cai no wizard
  // de revisão de qualquer jeito (regra de rocha: nada salva sozinho).
  const itens = Array.isArray(parsed && parsed.itens) ? parsed.itens : [];

  // COBRANÇA: no máximo 1 crédito por `conversationId` A CADA JANELA DE
  // IDEMPOTÊNCIA (JANELA_IDEM_MS = 10 min, creditos.js). NÃO é "1 crédito por
  // conversa" — este comentário já disse isso e estava errado nas DUAS pontas:
  //
  //   • conversa que fecha mais de uma vez DENTRO da janela → 1 crédito só. O
  //     retry de rede do turno final é o caso que a idempotência existe para
  //     cobrir, mas quem repetir o fechamento de propósito também não paga: o
  //     teto real ali é o rate limit (IA_RL, 20 req/min por usuário em
  //     wrangler.jsonc), ou seja ~200 chamadas ao Gemini por crédito.
  //   • conversa que ainda está aberta DEPOIS da janela e fecha de novo → 2º
  //     crédito. Mais de 1 por conversa, portanto.
  //
  // Os dois números acima não são estimativa: estão MEDIDOS e travados por teste
  // (seção F3 de scripts/teste-creditos-voz.ts — 100 fechamentos do mesmo convId
  // dentro da janela = 1 lançamento no ledger; 1 crédito cobre 10 chamadas
  // espalhadas por 1h e então bloqueia). Mudar o desenho quebra aquele teste.
  //
  // POR QUE O CÓDIGO NÃO PASSA A GARANTIR O QUE O COMENTÁRIO PROMETIA. Garantir
  // "1 por conversa" seria dar idempotência SEM PRAZO a uma string escolhida
  // pelo cliente — e é exatamente o furo que a janela fecha: `conversationId`
  // fixo viraria passe livre para IA infinita na conta do dono (o raciocínio
  // inteiro está em JANELA_IDEM_MS, creditos.js). Um teto de verdade por
  // conversa exigiria estado por `conversationId` no servidor (tabela nova,
  // migration), e não uma chave mais frouxa. Entre um comentário que promete
  // garantia inexistente e um que descreve o mecanismo real, o segundo — o
  // primeiro é pior que comentário nenhum, porque o próximo leitor confia nele.
  //
  // A chave aqui é só o `conversationId` (sem hash de conteúdo, ao contrário de
  // /voz e /transcrever): a conversa não manda `conteudo`, e o histórico cresce
  // a cada turno, então hash faria cada fechamento parecer trabalho novo.
  // Pergunta nunca chega aqui (retorna antes, acima) — só o fechamento cobra.
  const convId = typeof conversationId === 'string' ? conversationId.trim().slice(0, 200) : '';
  const cobranca = await cobrarCreditoVoz(env, user, {
    confirmarCredito,
    creditoRef: convId || undefined,
  });
  if (cobranca.bloqueado) return json({ ok: false, erro: 'sem_creditos' });

  return json({
    ok: true,
    pronto: true,
    titulo: typeof (parsed && parsed.titulo) === 'string' ? parsed.titulo : undefined,
    clienteNome: typeof (parsed && parsed.clienteNome) === 'string' ? parsed.clienteNome : undefined,
    itens,
    observacao: typeof (parsed && parsed.observacao) === 'string' ? parsed.observacao : undefined,
  });
}
