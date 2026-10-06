/**
 * "Enviar pelo WhatsApp" no PAINEL (06/10/2026) — fecha o buraco do envio.
 *
 *     node scripts/teste-enviar-whatsapp-painel.ts
 * Exit 0 = passou; qualquer assert que falha derruba o processo.
 *
 * Por quê: das contas reais, 10 PDFs "enviados" pelo painel: 0 com link /o/<token> e 4 em rascunho.
 * O painel só imprimia o PDF; o cliente nunca teve o que abrir.
 *
 * Tranca:
 *  • o número do WhatsApp: máscara, +55, fixo/celular, e número duvidoso NÃO vira link;
 *  • a publicação do link (a MESMA lógica do app, com cliente Supabase falso): token novo, reuso do
 *    token existente SEM tocar no status, retry em colisão 23505, erro de leitura LANÇA (não vira
 *    "não existe" → 2º link), recibos ilegíveis = `null` (a página não monta Pix);
 *  • app e painel montam o conteúdo do link pela MESMA função (`conteudoDoLink`);
 *  • a fiação: menu + botão, "abrir não é enviar", status só rascunho → enviado, só após "Já enviei".
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { linkWhatsApp, numeroParaWhatsApp } from '../webapp/src/olli/linkWhatsApp.ts';
import { publicarLinkOrcamento } from '../webapp/src/olli/publicarLink.ts';

let checks = 0;
const eq = (atual: unknown, esperado: unknown, msg: string) => {
  assert.deepEqual(atual, esperado, `FALHA: ${msg}`);
  checks++;
};
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, `FALHA: ${msg}`);
  checks++;
};

// ─── número do WhatsApp ──────────────────────────────────────────────────────
eq(numeroParaWhatsApp('(11) 98123-4567'), '5511981234567', 'celular com máscara ganha o 55');
eq(numeroParaWhatsApp('+55 11 98123-4567'), '5511981234567', '+55 já vem com DDI');
eq(numeroParaWhatsApp('11 3456-7890'), '551134567890', 'fixo (10 dígitos) ganha o 55');
eq(numeroParaWhatsApp('011981234567'), '5511981234567', 'zero à esquerda do DDD é ignorado');
eq(numeroParaWhatsApp('98123-4567'), null, 'sem DDD (9 dígitos) não vira link');
eq(numeroParaWhatsApp(''), null, 'vazio não vira link');
eq(numeroParaWhatsApp(undefined), null, 'ausente não vira link');
eq(numeroParaWhatsApp('abc'), null, 'texto não vira link');
eq(numeroParaWhatsApp('+1 415 555 0100'), null, 'número estrangeiro não é adivinhado');
eq(linkWhatsApp('(11) 98123-4567', 'Olá & tudo bem?\nSegue: https://x/o/abc'), 'https://wa.me/5511981234567?text=Ol%C3%A1%20%26%20tudo%20bem%3F%0ASegue%3A%20https%3A%2F%2Fx%2Fo%2Fabc', 'a mensagem vai codificada na URL');
eq(linkWhatsApp('123', 'oi'), null, 'número ruim = sem link (não abre conversa com desconhecido)');

// ─── publicação do link (cliente Supabase falso) ─────────────────────────────
type Op = { tabela: string; op: string; arg?: any; filtros: [string, unknown][] };
function falso(opts: { user?: any; existente?: string | null; erroLeitura?: boolean; colisoes?: number; erroInsert?: any; recibos?: any; updateVazio?: boolean } = {}) {
  const ops: Op[] = [];
  let colisoes = opts.colisoes ?? 0;
  const from = (tabela: string) => {
    const op: Op = { tabela, op: 'select', filtros: [] };
    let resposta: () => any = () => ({ data: null, error: null });
    const b: any = {
      select() { return b; },
      eq(c: string, v: unknown) { op.filtros.push([c, v]); return b; },
      is(c: string, v: unknown) { op.filtros.push([c, v]); return b; },
      limit() { return b; },
      maybeSingle() {
        ops.push(op);
        return Promise.resolve(opts.erroLeitura ? { data: null, error: { code: 'XX', message: 'leitura falhou' } } : { data: opts.existente ? { token: opts.existente } : null, error: null });
      },
      update(arg: any) { op.op = 'update'; op.arg = arg; resposta = () => ({ data: opts.updateVazio ? [] : [{ token: 'x' }], error: null }); return b; },
      insert(arg: any) {
        op.op = 'insert'; op.arg = arg; ops.push(op);
        if (colisoes > 0) { colisoes--; return Promise.resolve({ error: { code: '23505' } }); }
        return Promise.resolve({ error: opts.erroInsert ?? null });
      },
      // biome-ignore lint/suspicious/noThenProperty: o query builder do supabase-js é um thenable (`await builder`); o falso precisa ser igual.
      then(res: any, rej: any) {
        if (tabela === 'recibos') { ops.push(op); return Promise.resolve(opts.recibos ?? { data: [], error: null }).then(res, rej); }
        if (op.op === 'update' || op.op === 'select') ops.push(op);
        return Promise.resolve(resposta()).then(res, rej);
      },
    };
    return b;
  };
  const auth = { getUser: async () => (opts.user === undefined ? { data: { user: { id: 'u1' } }, error: null } : { data: { user: opts.user }, error: opts.user ? null : { message: 'sem sessão' } }) };
  return { cliente: { from, auth } as any, ops };
}

const orc: any = {
  id: 'orc-1', numero: '00126', clienteNome: 'Maria Souza', clienteTelefone: '(11) 98123-4567', valorTotal: 245, subtotal: 245,
  status: 'rascunho', itens: [{ nome: 'Troca de disjuntor', quantidade: 1, unidade: 'un', preco: 90, subtotal: 90, tipo: 'servico' }], criadoEm: '2026-10-06T00:00:00+00:00',
};
const emp: any = { nome: 'Eletro Rápido', whatsapp: '(11) 90000-1111', telefone: '(11) 90000-1111', especialidade: 'Elétrica' };

// token novo
{
  const f = falso();
  const url = await publicarLinkOrcamento(orc, emp, { supabase: f.cliente, baseUrl: 'https://link.exemplo.com/', novoToken: () => 'TOKEN_NOVO' });
  eq(url, 'https://link.exemplo.com/o/TOKEN_NOVO', 'link = base/o/<token> (barra final da base não duplica)');
  const ins = f.ops.find((o) => o.op === 'insert');
  ok(ins, 'sem token existente: insere');
  eq([ins?.arg.token, ins?.arg.user_id, ins?.arg.orcamento_id, ins?.arg.status], ['TOKEN_NOVO', 'u1', 'orc-1', 'enviado'], 'linha nova: token, dono, orçamento e status inicial');
  eq([ins?.arg.numero, ins?.arg.cliente_nome, ins?.arg.valor_total, ins?.arg.prestador_nome, ins?.arg.prestador_whatsapp], ['00126', 'Maria Souza', 245, 'Eletro Rápido', '11900001111'], 'colunas do portal preenchidas (whatsapp só dígitos)');
  eq(ins?.arg.dados.numero, '00126', 'snapshot `dados` vai junto');
}
// reuso: não muda o status, não insere
{
  const f = falso({ existente: 'TOKEN_VELHO' });
  const url = await publicarLinkOrcamento(orc, emp, { supabase: f.cliente, baseUrl: 'https://l.x', novoToken: () => 'NAO_USAR' });
  eq(url, 'https://l.x/o/TOKEN_VELHO', 'reenvio mantém o MESMO link');
  ok(!f.ops.some((o) => o.op === 'insert'), 'reenvio não insere 2º link');
  const upd = f.ops.find((o) => o.op === 'update');
  ok(upd && !('status' in upd.arg), 'reenvio NÃO escreve `status` (é a resposta do cliente; só o worker escreve)');
}
// linha sumiu entre a leitura e a escrita: cria
{
  const f = falso({ existente: 'T_SUMIU', updateVazio: true });
  const url = await publicarLinkOrcamento(orc, emp, { supabase: f.cliente, baseUrl: 'https://l.x', novoToken: () => 'T_CRIADO' });
  eq(url, 'https://l.x/o/T_CRIADO', 'update com 0 linhas cai na criação');
}
// colisão 23505: tenta outro token
{
  const f = falso({ colisoes: 2 });
  let n = 0;
  const url = await publicarLinkOrcamento(orc, emp, { supabase: f.cliente, baseUrl: 'https://l.x', novoToken: () => `T${++n}` });
  eq(url, 'https://l.x/o/T3', 'colisão de token tenta de novo (3ª tentativa vale)');
}
// outro erro de insert lança
{
  const f = falso({ erroInsert: { code: '42501', message: 'rls' } });
  await assert.rejects(() => publicarLinkOrcamento(orc, emp, { supabase: f.cliente, baseUrl: 'https://l.x', novoToken: () => 'T' }), (e: any) => e.code === '42501', 'FALHA: erro de RLS tem de lançar');
  checks++;
}
// erro de LEITURA lança (não vira "não existe" → 2º link)
{
  const f = falso({ erroLeitura: true });
  await assert.rejects(() => publicarLinkOrcamento(orc, emp, { supabase: f.cliente, baseUrl: 'https://l.x', novoToken: () => 'T' }), 'FALHA: erro ao ler o token existente tem de lançar');
  ok(!f.ops.some((o) => o.op === 'insert'), 'e não cria um 2º link às cegas');
}
// sem sessão lança
{
  const f = falso({ user: null });
  await assert.rejects(() => publicarLinkOrcamento(orc, emp, { supabase: f.cliente, baseUrl: 'https://l.x' }), /Entre de novo/, 'FALHA: sem sessão não publica');
  checks++;
}
// recibos ilegíveis ≠ zero recebido: o snapshot não promete cobrança de valor cheio
{
  const comErro = falso({ recibos: { data: null, error: { message: 'x' } } });
  await publicarLinkOrcamento({ ...orc, status: 'aprovado' }, emp, { supabase: comErro.cliente, baseUrl: 'https://l.x', novoToken: () => 'A' });
  const insErro = comErro.ops.find((o) => o.op === 'insert');
  const semRecibos = falso({ recibos: { data: [], error: null } });
  await publicarLinkOrcamento({ ...orc, status: 'aprovado' }, emp, { supabase: semRecibos.cliente, baseUrl: 'https://l.x', novoToken: () => 'B' });
  const insOk = semRecibos.ops.find((o) => o.op === 'insert');
  eq([insErro?.arg.dados.cobrarAgora, insErro?.arg.dados.valorACobrar], [false, null], 'recibos ilegíveis: não sei quanto foi pago → a página não monta Pix (não cobra o total)');
  eq([insOk?.arg.dados.cobrarAgora, insOk?.arg.dados.valorACobrar], [true, 245], 'recibos lidos e vazios = nada recebido → cobra o total');
}

// ─── app e painel: UMA definição do conteúdo do link ─────────────────────────
const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const appLink = ler('src/services/clienteLink.ts');
const painelLink = ler('webapp/src/olli/publicarLink.ts');
ok(/conteudoDoLink\(orc, empresa, cobranca\)/.test(appLink), 'app monta o conteúdo por conteudoDoLink');
ok(/conteudoDoLink\(orc, empresa, cobranca\)/.test(painelLink), 'painel monta o conteúdo por conteudoDoLink (mesma função)');
ok(/gerarTokenLink\(generateId\)/.test(appLink), 'app mantém o fallback de token que já tinha');

// ─── fiação da tela ──────────────────────────────────────────────────────────
const lista = ler('webapp/src/pages/olli/orcamentos/index.tsx');
const hook = ler('webapp/src/pages/olli/orcamentos/useEnviarWhatsApp.tsx');
ok((lista.match(/Enviar pelo WhatsApp/g) ?? []).length >= 2, 'menu e botão têm "Enviar pelo WhatsApp"');
ok(/onClick=\{\(\) => onEnviarWhatsApp\(linha\)\}/.test(lista), 'botão visível fora do menu "…" (ação primária)');
ok(/\{dialogoWhats\}/.test(lista), 'a página renderiza o diálogo do envio');
ok(/reservarEnvioOrcamento\(orcamentoId, "whatsapp"\)/.test(hook), 'registra o envio no canal whatsapp');
ok(/exigirCadastro\("orcamento"\)/.test(hook), 'passa pela porta do cadastro');
const iAbrir = hook.indexOf('Abrir o WhatsApp');
const iJa = hook.indexOf('const jaEnviei');
const iMarcar = hook.indexOf('await marcarEnviado(p.orcamentoId)');
ok(iAbrir > 0 && iJa > 0 && iMarcar > iJa, 'o status só muda dentro de "Já enviei", nunca ao abrir o WhatsApp');
// A regra do status mora em UM lugar (useMarcarEnviado), compartilhada com o "Já enviei" pós-PDF.
const marcar = ler('webapp/src/pages/olli/orcamentos/useMarcarEnviado.ts');
ok(/fresco\.status !== "rascunho"/.test(marcar),'só move rascunho → enviado (não rebaixa aprovado/negociação)');
ok(/await cancelarReservaEnvioOrcamento\(p\.orcamentoId/.test(hook), 'cancelar/“Ainda não” devolve a reserva do envio');
ok(/semLink|sem ele \(o cliente responde/.test(hook), 'sem link a mensagem sai sem link e o diálogo avisa');

console.log(`PASSOU: ${checks} verificações — painel envia o orçamento ao cliente com link e só marca "enviado" depois de confirmar.`);
