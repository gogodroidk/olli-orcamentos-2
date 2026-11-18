// CQ-ATENDENTE-SDR — 15 conversas por empresa, com resposta e nota de cada uma.
// Uso: node scripts/teste-atendente-sdr.js [--relatorio <pasta>]
// Nota mínima para ligar: nenhuma resposta inventada (preço fora da tabela, promessa, "sou humano").
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EMPRESAS, responderAtendente, validarRespostaModelo, redigirDadoSensivel, foraDoHorario } from '../src/atendenteSdr.js';

const SEG_UTIL = new Date('2026-11-16T15:00:00Z'); // segunda 12h BRT
const MADRUGADA_SAB = new Date('2026-11-14T06:00:00Z'); // sábado 03h BRT

const CASOS = {
  olli: [
    { n: 'lead frio', msg: 'Oi', acao: 'enviar', int: 'saudacao', deve: /Lívia/ },
    { n: 'preço', msg: 'quanto custa?', acao: 'enviar', int: 'preco', deve: /R\$ 39/, lead: 'quente' },
    { n: 'tá caro', msg: 'achei caro', acao: 'enviar', int: 'obj_caro', deve: /Grátis/ },
    { n: 'vou pensar', msg: 'vou pensar', acao: 'enviar', int: 'obj_pensar' },
    { n: 'já uso outro', msg: 'já uso uma planilha', acao: 'enviar', int: 'obj_concorrente' },
    { n: 'suporte: não consigo entrar', msg: 'não consigo entrar na minha conta', acao: 'enviar', int: 'login', deve: /Esqueci a senha/ },
    { n: 'suporte: PDF', msg: 'como mando o pdf do orçamento?', acao: 'enviar', int: 'pdf' },
    { n: 'suporte: Pix do Pro', msg: 'dá pra pagar o plano pelo pix?', acao: 'enviar', int: 'pix', deve: /AbacatePay/ },
    { n: 'quer assinar', msg: 'quero assinar o Pro, como pago?', acao: 'enviar_e_sinalizar', int: 'fechar', lead: 'quente' },
    { n: 'áudio sem transcrição', audio: true, msg: '', acao: 'enviar', int: 'audio' },
    { n: 'sair', msg: 'SAIR', acao: 'suprimir', int: 'sair' },
    { n: 'é robô?', msg: 'Você é um robô?', acao: 'enviar', int: 'robo', deve: /assistente virtual/ },
    { n: 'pede humano', msg: 'quero falar com um atendente humano', acao: 'humano', int: 'humano' },
    { n: 'reclamação', msg: 'Isso é um absurdo, vou no procon', acao: 'humano', int: 'reclamacao' },
    { n: 'fora do horário', msg: 'quero falar com uma pessoa', agora: MADRUGADA_SAB, acao: 'humano', int: 'humano', deve: /fora do horário/ },
  ],
  grtech: [
    { n: 'lead frio', msg: 'Oi, boa tarde', acao: 'enviar', int: 'saudacao', deve: /Caio/ },
    { n: 'preço da visita', msg: 'quanto custa a visita?', acao: 'enviar', int: 'preco', deve: /R\$ 150.*abatida/s },
    { n: 'tá caro', msg: 'achei caro', acao: 'enviar', int: 'obj_caro', deve: /abatida/ },
    { n: 'ar não gela (urgente)', msg: 'meu ar parou de gelar hoje', acao: 'enviar_e_sinalizar', int: 'corretiva', lead: 'quente' },
    { n: 'preventiva', msg: 'quero fazer a preventiva dos aparelhos', acao: 'enviar', int: 'preventiva', deve: /a partir de R\$ 450/ },
    { n: 'instalação', msg: 'quanto fica a instalação de um split?', acao: 'enviar', int: 'instalacao', deve: /9\.000 a 12\.000/ },
    { n: 'gás não cita valor', msg: 'quanto é a recarga de gás?', acao: 'enviar', int: 'gas', nao: /R\$/ },
    { n: 'PMOC/contrato passa ao Igor', msg: 'preciso de contrato de manutenção com PMOC', acao: 'humano', int: 'fora_tabela' },
    { n: 'desconto passa ao Igor', msg: 'faz desconto se eu fechar 5 aparelhos?', acao: 'humano', int: 'fora_tabela' },
    { n: 'já tenho técnico', msg: 'já tenho um técnico', acao: 'enviar', int: 'obj_concorrente' },
    { n: 'sair', msg: 'parar', acao: 'suprimir', int: 'sair' },
    { n: 'é robô?', msg: 'vc é robô?', acao: 'enviar', int: 'robo', deve: /assistente virtual/, nao: /sou (uma )?pessoa/i },
    { n: 'pede humano', msg: 'me passa pro técnico, quero falar com uma pessoa', acao: 'humano', int: 'humano' },
    { n: 'reclamação', msg: 'o técnico não veio, que descaso', acao: 'humano', int: 'reclamacao' },
    { n: 'fora do horário', msg: 'preciso de um técnico', agora: MADRUGADA_SAB, acao: 'enviar', int: 'saudacao' },
  ],
  segundoandar: [
    { n: 'lead frio', msg: 'Olá, vim pela página de serviços', acao: 'enviar', int: 'saudacao', deve: /Rafa/ },
    { n: 'preço (sem tabela)', msg: 'quanto custa fazer um site?', acao: 'enviar', int: 'preco', nao: /R\$/, deve: /proposta/ },
    { n: 'tá caro', msg: 'achei caro', acao: 'enviar', int: 'obj_caro', nao: /R\$/ },
    { n: 'prazo (sem promessa)', msg: 'qual o prazo pra ficar pronto?', acao: 'enviar', int: 'prazo', nao: /\d+ dias/ },
    { n: 'pacote presença', msg: 'preciso aparecer no google', acao: 'enviar', int: 'presenca', deve: /5 páginas/ },
    { n: 'atendimento automático', msg: 'perco cliente por demora de resposta no whatsapp', acao: 'enviar', int: 'atendimento' },
    { n: 'vou pensar', msg: 'vou pensar', acao: 'enviar', int: 'obj_pensar' },
    { n: 'já tenho site', msg: 'já tenho site', acao: 'enviar', int: 'obj_concorrente' },
    { n: 'quer contratar', msg: 'quero contratar, vamos fechar', acao: 'humano', int: 'fechar', lead: 'quente' },
    { n: 'sair', msg: 'descadastrar', acao: 'suprimir', int: 'sair' },
    { n: 'é robô?', msg: 'isso aqui é bot?', acao: 'enviar', int: 'robo', deve: /assistente virtual/ },
    { n: 'pede humano', msg: 'quero falar com o igor', acao: 'humano', int: 'humano' },
    { n: 'reembolso', msg: 'quero meu dinheiro de volta', acao: 'humano', int: 'reembolso_cobranca' },
    { n: 'fora do horário', msg: 'quero falar com uma pessoa', agora: MADRUGADA_SAB, acao: 'humano', int: 'humano', deve: /fora do horário/ },
    { n: 'sem fonte', msg: 'vocês fazem aplicativo de delivery igual ifood com blockchain?', acao: 'humano', int: 'incerteza' },
  ],
};

const falhas = [];
const linhas = [];
let total = 0;
let pontos = 0;

for (const [emp, casos] of Object.entries(CASOS)) {
  if (casos.length !== 15) throw new Error(`${emp}: precisa de 15 casos, tem ${casos.length}`);
  linhas.push(`\n## ${EMPRESAS[emp].marca} (atendente ${EMPRESAS[emp].atendente})\n`);
  let i = 0;
  for (const c of casos) {
    i += 1;
    const r = await responderAtendente({ empresa: emp, texto: c.msg, agora: c.agora ?? SEG_UTIL, audioSemTexto: c.audio, llm: c.llm, historico: [] });
    const erros = [];
    if (r.acao !== c.acao) erros.push(`acao ${r.acao} != ${c.acao}`);
    if (r.intencao !== c.int) erros.push(`intencao ${r.intencao} != ${c.int}`);
    if (c.deve && !c.deve.test(r.resposta)) erros.push(`falta ${c.deve}`);
    if (c.nao?.test(r.resposta)) erros.push(`proibido ${c.nao}`);
    if (c.lead && r.lead !== c.lead) erros.push(`lead ${r.lead} != ${c.lead}`);
    if (c.redigido && /abc12345|123\.456/.test(JSON.stringify(r.registro))) erros.push('dado sensível vazou no registro');
    // Nota mínima: nada inventado em NENHUMA resposta.
    const v = validarRespostaModelo(r.resposta || 'ok', EMPRESAS[emp]);
    if (!v.ok && r.resposta) erros.push(`resposta inventada: ${v.motivo}`);
    if (/(^|\W)(sou|somos) (uma )?(pessoa|humano)\b/i.test(r.resposta)) erros.push('nega ser IA');
    total += 1;
    const nota = erros.length ? 0 : 10;
    pontos += nota;
    if (erros.length) falhas.push(`${emp} #${i} ${c.n}: ${erros.join('; ')}`);
    linhas.push(`### ${emp} #${i} — ${c.n}  → nota ${nota}/10 ${erros.length ? '❌ ' + erros.join('; ') : '✅'}\n- Cliente: ${c.audio ? '(áudio)' : c.msg}\n- Ação: ${r.acao} · intenção: ${r.intencao} · lead: ${r.lead}${r.fonte ? ` · fonte: ${r.fonte}` : ''}\n- ${r.atendente}: ${r.resposta}\n`);
  }
}

// Testes unitários extras
const extras = [];
const ex = (nome, ok) => { extras.push([nome, ok]); if (!ok) falhas.push(`extra: ${nome}`); };
ex('redigir remove cpf/senha', !/123\.456|abc12345/.test(redigirDadoSensivel('cpf 123.456.789-09 senha abc12345')));
ex('fim de semana = fora do horário', foraDoHorario(MADRUGADA_SAB) && !foraDoHorario(SEG_UTIL));
ex('guarda barra link', !validarRespostaModelo('veja www.exemplo.com', EMPRESAS.olli).ok);
ex('guarda barra "garanto"', !validarRespostaModelo('eu garanto que funciona', EMPRESAS.olli).ok);
ex('guarda aceita R$ 39 na OLLI e barra na Segundo Andar', validarRespostaModelo('Pro custa R$ 39', EMPRESAS.olli).ok && !validarRespostaModelo('custa R$ 39', EMPRESAS.segundoandar).ok);
// Qualificação progressiva: 2ª mensagem de venda pergunta o que falta.
const q2 = await responderAtendente({ empresa: 'olli', texto: 'como funciona', historico: ['oi'], agora: SEG_UTIL });
ex('SDR faz pergunta de qualificação no 2º turno', /\?\s*$/.test(q2.resposta));
// Supressão não vaza resposta de venda
const s = await responderAtendente({ empresa: 'grtech', texto: 'não quero mais receber mensagem', agora: SEG_UTIL });
ex('opt-out por frase suprime', s.acao === 'suprimir' && s.registro.suprimir === true);

const nota = (pontos / total).toFixed(1);
const resumo = `\n# Resultado\n${total} conversas · nota média ${nota}/10 · ${falhas.length} falha(s)\nExtras: ${extras.filter((e) => e[1]).length}/${extras.length} ok\n${falhas.map((f) => `- ${f}`).join('\n')}\n`;
console.log(resumo);

const i = process.argv.indexOf('--relatorio');
if (i > 0 && process.argv[i + 1]) {
  mkdirSync(process.argv[i + 1], { recursive: true });
  writeFileSync(join(process.argv[i + 1], 'TESTE-45-CONVERSAS.md'), `# CQ-ATENDENTE-SDR — teste de 45 conversas (15 por empresa)\nGerado por worker/scripts/teste-atendente-sdr.js (motor determinístico + guarda; modelo simulado nos 2 casos com llm).\nCritério de nota: 10 = ação, intenção e conteúdo esperados E nenhuma resposta inventada (preço fora da tabela, promessa, nega ser IA, dado sensível no registro); 0 caso contrário.\n${resumo}${linhas.join('\n')}`);
}
if (falhas.length) process.exit(1);
console.log('teste-atendente-sdr: OK');
