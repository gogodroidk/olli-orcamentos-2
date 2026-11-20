// Núcleo puro (sem rede) do Chatwoot+Claude: configuração, preços, travas de texto, parar, tipo de pergunta, teto diário.
// Credenciais SÓ por variável de ambiente; nada aqui imprime token ou chave.
import { readFileSync, appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

export const DIR = fileURLToPath(new URL('.', import.meta.url));
export const CFG = JSON.parse(readFileSync(`${DIR}config.json`, 'utf8'));
export const DADOS = process.env.CWC_DADOS || '/home/igor/chatwoot-central/data/chatwoot-claude';

/** Carrega NOMES pedidos do arquivo de credenciais para process.env (só as variáveis listadas; nunca imprime). */
export function carregarVariaveis(nomes, arq = process.env.CREDENCIAIS_ENV || '/home/igor/Desktop/Sistema/credenciais-locais.env') {
  let txt = '';
  try { txt = readFileSync(arq, 'utf8'); } catch { return; }
  for (const linha of txt.split(/\r?\n/)) {
    const m = linha.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || !nomes.includes(m[1]) || process.env[m[1]] !== undefined) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

export const hojeSP = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d); // AAAA-MM-DD

// ---------- caixas ----------
export const caixaProibida = (id, cfg = CFG) => cfg.caixas_proibidas.includes(Number(id));
export const caixaPermitida = (id, cfg = CFG) => !caixaProibida(id, cfg) && cfg.caixas_permitidas.includes(Number(id));

// ---------- preços (única fonte) ----------
export function itensVigentes(data = hojeSP(), tabela = JSON.parse(readFileSync(`${DIR}precos.json`, 'utf8'))) {
  return tabela.itens.filter((i) => (!i.de || data >= i.de) && (!i.ate || data <= i.ate));
}
export function textoTabela(data, tabela) {
  return itensVigentes(data, tabela).map((i) => `- ${i.nome}: ${i.texto}${i.prazo_dias_uteis ? ` (prazo: ${i.prazo_dias_uteis} dias úteis)` : ''}`).join('\n');
}
const num = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));
export function valoresEmReais(texto) {
  return [...String(texto ?? '').matchAll(/R\$\s*([\d.]+(?:,\d{1,2})?)/g)].map((m) => num(m[1]));
}

// ---------- travas de texto (o que a resposta pode conter) ----------
const FINGIR_PESSOA = [
  /\bn[aã]o\s+sou\s+(um\s+)?(rob[oô]|bot|ia|intelig[eê]ncia artificial)(?![a-zà-ú])/i,
  /\bsou\s+(uma\s+pessoa|humano|humana|gente de verdade)(?![a-zà-ú])/i,
  /\b(estou|t[oô])\s+(no\s+escrit[oó]rio|no\s+tr[aâ]nsito|almo[cç]ando|em\s+casa)(?![a-zà-ú])/i,
  /\bminha\s+(esposa|filha|m[aã]e)\b/i, /\bmeu\s+(filho|marido|pai)\b/i,
];
const SAIDA = [/responda\s+sair/i, /digite\s+sair/i, /n[aã]o\s+te\s+(chamo|incomodo|procuro)\s+mais/i, /quer\s+continuar\s*\?/i];
const PROMESSA = [/\bgaranto\b/i, /garantid[oa]/i, /100\s*%/i, /primeir[ao]\s+(p[aá]gina|lugar)\s+do\s+google/i, /sem\s+risco/i];
const RESULTADO = [/\b\d+\s*(clientes|vendas|or[cç]amentos|pedidos|leads)\b/i, /\baumenta(r|mos)?\s+(suas\s+)?(vendas|faturamento)\b/i, /\b\d+\s*%/];
const DADOS_SENS = [/(manda|envia|passa|informe?|me\s+diz)\s+(o\s+|a\s+)?(seu|sua)\s+(cpf|senha|cart[aã]o)/i];
const INTERNO = [/\bSalom[aã]o\b/i, /\bMaestro\b/i, /\bMaestri\b/i, /\bClaude\b/i, /\bAnthropic\b/i, /\bterminal\b/i, /\bprompt\b/i];

/** Motivos para BARRAR um texto que sairia ao cliente. Vazio = pode. `data` escolhe a tabela de preços. */
export function motivosDeBarrar(texto, { data = hojeSP(), tabela } = {}) {
  const t = String(texto ?? '').trim();
  const m = [];
  if (!t) return ['texto vazio'];
  if (FINGIR_PESSOA.some((r) => r.test(t))) m.push('finge ser pessoa (nunca negar ser IA)');
  if (SAIDA.some((r) => r.test(t))) m.push('porta de saída/fala de vendedor (D-2233)');
  if (PROMESSA.some((r) => r.test(t))) m.push('promessa sem lastro (CDC)');
  if (RESULTADO.some((r) => r.test(t))) m.push('resultado/número de clientes inventado');
  if (DADOS_SENS.some((r) => r.test(t))) m.push('pede senha/CPF/cartão');
  if (INTERNO.some((r) => r.test(t))) m.push('nome interno da casa');
  const vig = itensVigentes(data, tabela);
  const ok = new Set(vig.flatMap((i) => i.valores));
  const fora = valoresEmReais(t).filter((v) => !ok.has(v));
  if (fora.length) m.push(`preço fora da tabela: ${fora.map((v) => `R$ ${v}`).join(', ')}`);
  const prazosOk = new Set(vig.map((i) => i.prazo_dias_uteis).filter(Boolean));
  for (const x of t.matchAll(/\b(\d+)\s*(dias?|horas?|semanas?|meses|minutos?)\b/gi)) {
    const unidade = x[2].toLowerCase();
    if (/^dias?$/.test(unidade) && prazosOk.has(Number(x[1]))) continue;
    if (/^(minutos?)$/.test(unidade) && Number(x[1]) <= 2) continue; // "em 2 minutos" do guia
    if (/^dias?$/.test(unidade) && Number(x[1]) === 7) continue;       // dica do guia: validade de 7 dias no orçamento
    m.push(`prazo inventado: "${x[0]}"`);
  }
  if (t.split(/\n/).filter((l) => l.trim()).length > 4 || t.length > 600) m.push('longo demais para WhatsApp (até 3 linhas)');
  if (/^\s*[-•*]\s/m.test(t)) m.push('lista no WhatsApp');
  return m;
}

// ---------- parar ----------
const PARAR = [
  /\b(pare|parar|para)\s+(de\s+)?(me\s+)?(mandar|enviar|chamar|escrever|falar|ligar)/i,
  /\bpara\s+(com\s+)?isso\b/i, /\bn[aã]o\s+(quero|desejo)\s+(mais\s+)?(receber|mensagem|contato|saber)/i,
  /\b(me\s+)?(tira|tire|remove|remova|exclui|exclua)\s+(da\s+lista|meu\s+(n[uú]mero|contato)|de\s+voc[eê]s)/i,
  /\bdescadastr/i, /\bsair-?lgpd\b/i, /^\s*(sair|pare|parar|stop)\s*[.!]?\s*$/i, /\bn[aã]o\s+me\s+(chame|chama|procure|procura|mande|manda)\b/i,
  /\bapag(ue|ar)\s+(meus\s+)?dados\b/i,
];
export const pedidoDeParar = (texto) => PARAR.some((r) => r.test(String(texto ?? '')));

// ---------- tipo de pergunta (heurística; o modelo também classifica e os dois precisam concordar para responder sozinho) ----------
export function tipoPorTexto(texto) {
  const t = String(texto ?? '').toLowerCase();
  if (/(quanto\s+(custa|sai|é|fica)|pre[cç]o|valor|mensalidade|plano|r\$)/.test(t)) return 'preco';
  if (/(como\s+funciona|o\s+que\s+(é|faz)|pra\s+que\s+serve|funciona\s+como)/.test(t)) return 'como-funciona';
  if (/(n[aã]o\s+consigo|erro|travou|login|senha|n[aã]o\s+abre|bug|baixar|instalar|cancelar)/.test(t)) return 'suporte-app';
  if (/^\s*(oi|ol[aá]|bom\s+dia|boa\s+tarde|boa\s+noite|e\s+a[ií]|opa)[\s!.,?]*$/.test(t)) return 'saudacao';
  return 'outro';
}

// ---------- gasto / teto diário ----------
export const arqGasto = () => `${DADOS}/gasto.jsonl`;
export function registrarGasto(reg, arq = arqGasto()) {
  mkdirSync(dirname(arq), { recursive: true });
  appendFileSync(arq, `${JSON.stringify(reg)}\n`);
}
export function lerGasto(arq = arqGasto()) {
  if (!existsSync(arq)) return [];
  return readFileSync(arq, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
export function gastoDoDia(dia = hojeSP(), arq = arqGasto()) {
  return lerGasto(arq).filter((r) => r.dia === dia).reduce((s, r) => s + (r.reais || 0), 0);
}
export function gastoPorConversa(arq = arqGasto()) {
  const o = {};
  for (const r of lerGasto(arq)) { const k = r.conversa ?? '?'; o[k] = (o[k] || 0) + (r.reais || 0); }
  return o;
}
export const tetoAtingido = (cfg = CFG, arq = arqGasto(), dia = hojeSP()) => gastoDoDia(dia, arq) >= cfg.teto_diario_reais;
export function custoReais(uso, cfg = CFG) {
  const usd = ((uso.input_tokens || 0) * cfg.tarifa_usd_por_milhao.entrada + (uso.output_tokens || 0) * cfg.tarifa_usd_por_milhao.saida) / 1e6;
  return usd * cfg.dolar_em_reais;
}

// ---------- parar: lista persistente ----------
export const arqParar = () => `${DADOS}/parar.json`;
export function lerParar(arq = arqParar()) {
  try { return new Set(JSON.parse(readFileSync(arq, 'utf8'))); } catch { return new Set(); }
}
export function gravarParar(chave, arq = arqParar()) {
  const s = lerParar(arq); s.add(String(chave));
  mkdirSync(dirname(arq), { recursive: true });
  writeFileSync(arq, JSON.stringify([...s]));
}
