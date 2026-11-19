/**
 * CQ-ATIVACAO-LOTE1 (19/11/2026) — o degrau "orçou → enviou" do painel.
 *
 *  1. criar → passo de envio: depois de "Criar orçamento" (rascunho novo) abre "Enviar para o
 *     cliente" com WhatsApp, Copiar link e Ver PDF;
 *  2. envio sem número → campo do WhatsApp ali mesmo (DDD + número, erro que diz o que fazer)
 *     + "Copiar link" que funciona sem número;
 *  3. eventos gravados: envio_barrado_cadastro, envio_barrado_sem_whatsapp e orcamento_salvar_barrado
 *     — e TODO evento do painel está na CHECK e na função da migration mais nova (lição de 19/11:
 *     evento fora da CHECK some sem erro).
 *
 * Roda com `node scripts/teste-ativacao-lote1.ts` (Node 24, sem dependência).
 */
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { abrePassoEnviarAposSalvar, conferirWhatsAppDigitado, proximoPassoDoEnvio } from '../webapp/src/olli/envioAtivacao.ts';
import { ETAPAS_ATIVACAO, ETAPAS_REPETIVEIS } from '../webapp/src/olli/etapasAtivacao.ts';

// Arquivo que ainda não existe vira texto vazio: o caso que depende dele FALHA com nome, em vez de
// o teste inteiro estourar na leitura (assim dá para ver o antes/depois caso a caso).
const ler = (p: string) => {
  try {
    return readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  } catch {
    return '';
  }
};
let casos = 0;
const falhas: string[] = [];
const caso = (nome: string, fn: () => void) => {
  try {
    fn();
    casos++;
  } catch (e) {
    falhas.push(nome);
    console.error(`FALHOU: ${nome}\n  ${(e as Error).message.split('\n')[0]}`);
  }
};

/* ───────────── 1. criar → passo de envio ───────────── */

caso('orçamento novo em rascunho abre o passo de envio', () => {
  assert.equal(abrePassoEnviarAposSalvar(true, 'rascunho'), true);
  assert.equal(abrePassoEnviarAposSalvar(true, undefined), true);
});
caso('editar um orçamento existente NÃO abre o passo de envio', () => {
  assert.equal(abrePassoEnviarAposSalvar(false, 'rascunho'), false);
  assert.equal(abrePassoEnviarAposSalvar(true, 'enviado'), false);
});

const form = ler('webapp/src/pages/olli/orcamentos/FormOrcamento.tsx');
const lista = ler('webapp/src/pages/olli/orcamentos/index.tsx');
const passo = ler('webapp/src/pages/olli/orcamentos/PassoEnviar.tsx');
const envio = ler('webapp/src/pages/olli/orcamentos/useEnviarWhatsApp.tsx');
const porta = ler('webapp/src/olli/exigirCadastro.ts');

caso('o editor entrega o orçamento SALVO ao criar (não só fecha e cai na lista)', () => {
  const trecho = form.slice(form.indexOf('const salvo = await salvar.mutateAsync(final);'));
  assert.ok(trecho.length > 0, 'o editor precisa usar o que foi gravado (número pode mudar na colisão)');
  const fim = trecho.indexOf('} catch (err)');
  const bloco = trecho.slice(0, fim);
  assert.match(bloco, /registrarEtapaAtivacao\("quote_create"\)/);
  assert.match(bloco, /abrePassoEnviarAposSalvar\(ehNovo, salvo\.status\)\) aoCriar\?\.\(salvo\)/);
});
caso('a lista liga o passo de envio com as 3 ações que já existem', () => {
  assert.match(lista, /aoCriar=\{setRecemCriado\}/);
  assert.match(lista, /<PassoEnviar[\s\S]*?aoWhatsApp=\{\(o\) => void enviarWhats\(o\.id, o, "whatsapp"\)\}/);
  assert.match(lista, /aoCopiarLink=\{\(o\) => void enviarWhats\(o\.id, o, "link"\)\}/);
  assert.match(lista, /aoVerPdf=\{\(o\) => void verPdf\(linhaDoOrcamento\(o\)\)\}/);
});
caso('o passo de envio mostra WhatsApp, Copiar link, Ver PDF e uma saída', () => {
  for (const rotulo of ['Enviar pelo WhatsApp', 'Copiar link', 'Ver PDF', 'Agora não']) assert.ok(passo.includes(rotulo), rotulo);
  // Alvo de toque: as 3 ações têm no mínimo 44 px (52 px) e a saída 44 px no celular.
  assert.match(passo, /min-h-\[52px\]/);
  assert.match(passo, /min-h-\[44px\]/);
});

/* ───────────── 2. envio sem número → campo + copiar link ───────────── */

caso('WhatsApp sem número válido pede o número; link não precisa de número', () => {
  assert.equal(proximoPassoDoEnvio('whatsapp', ''), 'pedir_numero');
  assert.equal(proximoPassoDoEnvio('whatsapp', null), 'pedir_numero');
  assert.equal(proximoPassoDoEnvio('whatsapp', '98123-4567'), 'pedir_numero');
  assert.equal(proximoPassoDoEnvio('whatsapp', '(11) 98123-4567'), 'preparar');
  assert.equal(proximoPassoDoEnvio('link', ''), 'preparar');
  assert.equal(proximoPassoDoEnvio('link', null), 'preparar');
});
caso('número bom passa (com máscara, espaço, +55 ou fixo)', () => {
  assert.deepEqual(conferirWhatsAppDigitado('(11) 98123-4567'), { ok: true, digitos: '11981234567' });
  assert.deepEqual(conferirWhatsAppDigitado('+55 21 99876 5432'), { ok: true, digitos: '21998765432' });
  assert.deepEqual(conferirWhatsAppDigitado('5531987654321'), { ok: true, digitos: '31987654321' });
  assert.deepEqual(conferirWhatsAppDigitado('(11) 3456-7890'), { ok: true, digitos: '1134567890' });
});
caso('cada erro diz o que consertar', () => {
  const erro = (t: string) => {
    const r = conferirWhatsAppDigitado(t);
    assert.equal(r.ok, false, t);
    return (r as { erro: string }).erro;
  };
  assert.match(erro(''), /com DDD/);
  assert.match(erro('98123-4567'), /Falta o DDD/);
  assert.match(erro('(10) 98123-4567'), /DDD não existe/);
  assert.match(erro('(11) 88123-4567'), /9 logo depois do DDD/);
  assert.match(erro('123'), /DDD e mais 8 ou 9 números/);
  assert.match(erro('(11) 98123-45678'), /DDD e mais 8 ou 9 números/);
});
caso('o envio sem número abre o campo no próprio diálogo (não é mais só um aviso vermelho)', () => {
  assert.doesNotMatch(envio, /toast\.error\(`Informe o WhatsApp/);
  assert.match(envio, /proximoPassoDoEnvio\(modo, blob\.clienteTelefone\) === "pedir_numero"/);
  assert.match(envio, /setSemNumero\(\{ orcamentoId, blob \}\)/);
  assert.match(envio, /Qual o WhatsApp de/);
  assert.match(envio, /conferirWhatsAppDigitado\(numero\)/);
  assert.match(envio, /aria-invalid=\{!!erroNumero\}/);
  assert.match(envio, /role="alert"/);
  assert.match(envio, /Salvar e continuar/);
});
caso('o número é salvo no orçamento (blob fresco) e no cliente sem número válido', () => {
  // Fora do hook do envio: lá o status só muda por useMarcarEnviado (teste-empurrao-envio).
  const salvaNum = ler('webapp/src/pages/olli/orcamentos/useSalvarWhatsAppDoCliente.ts');
  assert.match(envio, /await salvarWhatsApp\(alvo\.orcamentoId, telefone\)/);
  assert.match(salvaNum, /from\("orcamentos"\)\.select\("dados"\)\.eq\("id", orcamentoId\)/);
  assert.match(salvaNum, /mutateAsync\(\{ \.\.\.fresco, clienteTelefone: telefone/);
  assert.match(salvaNum, /if \(cli && !numeroParaWhatsApp\(cli\.telefone/);
  assert.match(salvaNum, /\.from\("clientes"\)\s*\.update\(\{ telefone/);
  assert.doesNotMatch(salvaNum, /status\s*:/);
});
caso('"Copiar link" sem número segue no modo link e só "Já enviei" marca como enviado', () => {
  assert.match(envio, /await enviar\(alvo\.orcamentoId, alvo\.blob, "link"\)/);
  assert.match(envio, /reservarEnvioOrcamento\(orcamentoId, modo\)/);
  assert.match(envio, /Copiar não é enviar/);
  const blocoLink = envio.slice(envio.indexOf('pendente?.modo === "link"'), envio.indexOf('pendente?.modo === "whatsapp" && !pendente.abriu'));
  assert.match(blocoLink, /void jaEnviei\(\)/);
  assert.match(blocoLink, /readOnly/);
});
caso('a porta do cadastro continua valendo para o link (não foi afrouxada)', () => {
  const preparar = envio.slice(envio.indexOf('setPreparando(orcamentoId);'), envio.indexOf('const salvarNumeroEEnviar'));
  assert.match(preparar, /const empresa = await exigirCadastro\("orcamento"\);\s*if \(!empresa\) return;/);
  assert.ok(preparar.indexOf('exigirCadastro("orcamento")') < preparar.indexOf('if (modo === "link")'));
});

/* ───────────── 3. eventos gravados ───────────── */

caso('os 3 eventos de envio barrado estão na lista do painel e podem repetir', () => {
  for (const ev of ['orcamento_salvar_barrado', 'envio_barrado_cadastro', 'envio_barrado_sem_whatsapp'] as const) {
    assert.ok((ETAPAS_ATIVACAO as readonly string[]).includes(ev), ev);
    assert.ok(ETAPAS_REPETIVEIS.has(ev), `${ev} repetível`);
  }
});
caso('cada barreira grava o seu evento onde antes só havia toast', () => {
  const semNumero = envio.slice(envio.indexOf('=== "pedir_numero"'), envio.indexOf('setSemNumero({ orcamentoId, blob })'));
  assert.match(semNumero, /registrarEtapaAtivacao\("envio_barrado_sem_whatsapp"\)/);
  for (const [nome, fonte] of [['WhatsApp', envio], ['PDF', lista]] as const) {
    const i = fonte.indexOf('if (!reserva.permitido) {');
    assert.ok(i > 0, nome);
    const bloco = fonte.slice(i, fonte.indexOf('avisoLimiteEnvios(reserva)', i));
    assert.match(bloco, /registrarEtapaAtivacao\("orcamento_salvar_barrado"\)/, nome);
  }
  const portaBloco = porta.slice(porta.indexOf('if (!aviso) {'), porta.indexOf('toast.error(aviso.titulo'));
  assert.match(portaBloco, /documento === "orcamento" && !decisao\.libera && decisao\.motivo !== "nao_sei"/);
  assert.match(portaBloco, /registrarEtapaAtivacao\("envio_barrado_cadastro"\)/);
});
caso('o painel usa a lista única de eventos (o tipo não pode divergir do valor)', () => {
  const store = ler('webapp/src/store/userStore.ts');
  assert.match(store, /import \{ ETAPAS_REPETIVEIS, type EtapaAtivacao \} from "@\/olli\/etapasAtivacao"/);
  assert.doesNotMatch(store, /export type EtapaAtivacao =/);
});
caso('TODO evento do painel está na CHECK e na função da migration mais nova (evento fora da CHECK some)', () => {
  const pasta = 'supabase/migrations';
  const arquivos = readdirSync(new URL(`../${pasta}`, import.meta.url))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const ultima = [...arquivos].reverse().find((f) => ler(`${pasta}/${f}`).includes('user_activity_log_evento_check'));
  assert.ok(ultima, 'nenhuma migration define a CHECK');
  const sql = ler(`${pasta}/${ultima}`);
  const check = sql.slice(sql.indexOf('user_activity_log_evento_check check'), sql.indexOf('));', sql.indexOf('user_activity_log_evento_check check')));
  const funcao = sql.slice(sql.indexOf('if evento_normalizado not in'), sql.indexOf("raise exception 'evento_invalido'"));
  assert.ok(check.length > 0 && funcao.length > 0, `${ultima}: CHECK e função precisam estar no mesmo arquivo`);
  for (const ev of ETAPAS_ATIVACAO) {
    assert.ok(check.includes(`'${ev}'`), `${ultima}: '${ev}' fora da CHECK de user_activity_log`);
    assert.ok(funcao.includes(`'${ev}'`), `${ultima}: '${ev}' fora da lista de registrar_atividade_usuario`);
  }
  // E nada de dado pessoal no evento: a função grava só user_id, evento, plataforma.
  assert.match(sql, /insert into public\.user_activity_log \(user_id, evento, plataforma\)/);
});

if (falhas.length > 0) {
  console.error(`teste-ativacao-lote1: ${falhas.length} caso(s) falharam, ${casos} passaram`);
  process.exit(1);
}
console.log(`teste-ativacao-lote1: ok (${casos} casos)`);
