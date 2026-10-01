/**
 * Diagnóstico unificado (item 2.14): código → base offline → chat com contexto.
 *
 *     node scripts/teste-diagnostico-unificado.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que prende:
 *  - estado da busca: carregando | erro | resultado; resultado vazio = "não está
 *    na base"; resposta antiga não sobrescreve a nova (corrida do debounce);
 *  - o contexto montado no app leva marca, código, descrição e causas, dentro
 *    dos MESMOS limites do Worker, e passa pelo sanitizador do Worker intacto;
 *  - faltando marca/modelo, a abertura do caso PERGUNTA antes (sem gastar IA);
 *  - o repasse Diagnóstico → Chat é em memória e de uso único (nada na URL);
 *  - a tela, o chat e o serviço estão ligados a isso (contrato de código).
 */
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CodigoErro } from '../src/types/index.ts';
import {
  ESTADO_OCIOSO,
  LIMITES_CONTEXTO,
  aberturaDoCaso,
  criarSequenciaBusca,
  entregarCasoAoChat,
  faltandoNoContexto,
  iniciarCarregamento,
  itensVisiveis,
  marcaDoContexto,
  montarContextoDiagnostico,
  perguntaSugerida,
  retirarCasoDoDiagnostico,
  semResultadoNaBase,
  tituloDoCaso,
} from '../src/services/diagnosticoContexto.ts';
// @ts-ignore — módulo JS do Worker, sem tipos; o contrato é verificado em execução.
import { CONTEXTO_DIAGNOSTICO_LIMITES, sanitizarContextoDiagnostico } from '../worker/src/ai.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const ler = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8');

let verificacoes = 0;
function ok(nome: string, fn: () => void) {
  fn();
  verificacoes += 1;
  console.log(`  ok   ${nome}`);
}

const BASE = JSON.parse(ler('assets/codigos_erro.json')) as Array<Record<string, string>>;
function registro(r: Record<string, string>, id: number): CodigoErro {
  return {
    id,
    marca: r.marca ?? '', familia: r.familia ?? '', tipo: r.tipo ?? '', codigo: r.codigo ?? '',
    exibicao: r.exibicao ?? '', falha: r.falha ?? '', catBruta: r.catBruta ?? '', catApp: r.catApp ?? '',
    severidade: r.severidade ?? '', causa: r.causa ?? '', acao: r.acao ?? '', confianca: r.confianca ?? '',
    fonteId: r.fonteId ?? '', url: r.url ?? '', obs: r.obs ?? '',
  };
}
const daikinU0 = registro(BASE.find(r => r.marca === 'Daikin' && r.codigo === 'U0') as Record<string, string>, 1);

console.log('\n1) estado da busca: carregando | erro | resultado');
ok('ocioso não é "sem resultado"', () => {
  assert.equal(semResultadoNaBase(ESTADO_OCIOSO), false);
  assert.deepEqual(itensVisiveis(ESTADO_OCIOSO), []);
});
ok('resultado vazio = sem resultado na base (não é erro)', () => {
  assert.equal(semResultadoNaBase({ tipo: 'resultado', itens: [] }), true);
  assert.equal(semResultadoNaBase({ tipo: 'resultado', itens: [daikinU0] }), false);
  assert.equal(semResultadoNaBase({ tipo: 'erro' }), false);
  assert.equal(semResultadoNaBase({ tipo: 'carregando', itens: [] }), false);
});
ok('carregando mantém o resultado anterior na tela (não pisca)', () => {
  const c = iniciarCarregamento({ tipo: 'resultado', itens: [daikinU0] });
  assert.equal(c.tipo, 'carregando');
  assert.deepEqual(itensVisiveis(c), [daikinU0]);
  assert.deepEqual(itensVisiveis(iniciarCarregamento({ tipo: 'erro' })), []);
  assert.deepEqual(itensVisiveis(iniciarCarregamento(ESTADO_OCIOSO)), []);
});
ok('só a última busca escreve o estado (resposta antiga é descartada)', () => {
  const seq = criarSequenciaBusca();
  const antiga = seq.proxima();
  const nova = seq.proxima();
  assert.equal(seq.ehAtual(antiga), false);
  assert.equal(seq.ehAtual(nova), true);
});

console.log('\n2) contexto do caso (app → Worker)');
ok('registro da base vira marca, código, descrição e causas', () => {
  const ctx = montarContextoDiagnostico({ codigos: [daikinU0], marca: 'Daikin', codigoBuscado: 'U0' });
  assert.equal(ctx.encontradoNaBase, true);
  assert.deepEqual(ctx.codigos[0], {
    marca: 'Daikin',
    familia: daikinU0.familia,
    codigo: 'U0',
    descricao: daikinU0.falha,
    causas: [daikinU0.causa],
    acao: daikinU0.acao,
    severidade: daikinU0.severidade,
    confianca: daikinU0.confianca,
  });
  // URL/fonte/id não viajam: o Worker não precisa e não aceitaria.
  assert.equal(JSON.stringify(ctx).includes('http'), false);
});
ok(`no máximo ${LIMITES_CONTEXTO.codigos} códigos; campos cortados no limite`, () => {
  const muitos = BASE.slice(0, 40).map(registro);
  const ctx = montarContextoDiagnostico({ codigos: muitos, sintoma: 'x'.repeat(10_000), modelo: 'y'.repeat(500) });
  assert.equal(ctx.codigos.length, LIMITES_CONTEXTO.codigos);
  assert.ok((ctx.sintoma ?? '').length <= LIMITES_CONTEXTO.sintoma);
  assert.ok((ctx.modelo ?? '').length <= LIMITES_CONTEXTO.campoCurto);
});
ok('sem código na base: encontradoNaBase=false, codigos=[]', () => {
  const ctx = montarContextoDiagnostico({ codigos: [], codigoBuscado: 'EE:04', marca: 'Fujitsu' });
  assert.equal(ctx.encontradoNaBase, false);
  assert.deepEqual(ctx.codigos, []);
  assert.equal(ctx.codigoBuscado, 'EE:04');
});
ok('limites do app espelham os do Worker', () => {
  for (const [k, v] of Object.entries(LIMITES_CONTEXTO)) {
    assert.equal((CONTEXTO_DIAGNOSTICO_LIMITES as Record<string, number>)[k], v, k);
  }
});
ok('o que o app monta passa pelo sanitizador do Worker sem perder nada', () => {
  for (let i = 0; i < BASE.length; i += 5) {
    const grupo = BASE.slice(i, i + 5).map(registro);
    const ctx = montarContextoDiagnostico({ codigos: grupo, codigoBuscado: grupo[0].codigo });
    const srv = sanitizarContextoDiagnostico(ctx);
    assert.ok(srv, `grupo ${i}`);
    assert.deepEqual(srv.codigos, ctx.codigos, `grupo ${i}`);
    assert.deepEqual(srv.faltando, faltandoNoContexto(ctx), `faltando do grupo ${i}`);
  }
});

console.log('\n3) marca/modelo: perguntar antes de responder');
ok('marca única dos códigos conta como marca; modelo nunca vem da base', () => {
  const ctx = montarContextoDiagnostico({ codigos: [daikinU0] });
  assert.equal(marcaDoContexto(ctx), 'Daikin');
  assert.deepEqual(faltandoNoContexto(ctx), ['modelo']);
});
ok('marcas misturadas: marca falta', () => {
  const lg = registro({ ...BASE[0], marca: 'LG', codigo: 'CH05' }, 2);
  const ctx = montarContextoDiagnostico({ codigos: [daikinU0, lg] });
  assert.equal(marcaDoContexto(ctx), undefined);
  assert.deepEqual(faltandoNoContexto(ctx), ['marca', 'modelo']);
});
ok('abertura LOCAL pergunta marca e modelo antes, e não sugere pergunta pronta', () => {
  const ctx = montarContextoDiagnostico({ codigos: [], codigoBuscado: 'E4' });
  const txt = aberturaDoCaso(ctx);
  assert.match(txt, /não tem o código “E4”/);
  assert.match(txt, /Antes de eu responder: qual a marca e o modelo/);
  assert.equal(perguntaSugerida(ctx), '');
});
ok('abertura com registro achado cita código, descrição e causa', () => {
  const ctx = montarContextoDiagnostico({ codigos: [daikinU0] });
  const txt = aberturaDoCaso(ctx);
  assert.ok(txt.includes('U0'));
  assert.ok(txt.includes(daikinU0.falha));
  assert.ok(txt.includes(daikinU0.causa));
  assert.match(txt, /qual o modelo/);
});
ok('com marca e modelo: sem pergunta prévia, campo já sugere a pergunta', () => {
  const ctx = montarContextoDiagnostico({ codigos: [daikinU0], modelo: 'RXYQ8' });
  assert.deepEqual(faltandoNoContexto(ctx), []);
  assert.equal(aberturaDoCaso(ctx).includes('Antes de eu responder'), false);
  assert.equal(perguntaSugerida(ctx), 'Código U0 na Daikin RXYQ8: o que testo primeiro?');
  assert.equal(tituloDoCaso(ctx), 'Código U0 · Daikin · RXYQ8');
});

console.log('\n4) repasse Diagnóstico → Chat: memória, uso único');
ok('entregar e retirar uma vez; a segunda retirada vem vazia', () => {
  assert.equal(retirarCasoDoDiagnostico(), null);
  const ctx = montarContextoDiagnostico({ codigos: [daikinU0] });
  entregarCasoAoChat(ctx);
  assert.equal(retirarCasoDoDiagnostico(), ctx);
  assert.equal(retirarCasoDoDiagnostico(), null);
});

console.log('\n5) contrato de código: tela, rota, chat e serviço ligados');
const tela = ler('src/screens/DiagnosticoScreen.tsx');
const chat = ler('src/screens/OlliChatScreen.tsx');
const servico = ler('src/services/olliAssistente.ts');
const rotas = ler('src/navigation/AppNavigator.tsx');
ok('a rota Diagnostico é a DiagnosticoScreen (a tela antiga saiu)', () => {
  assert.equal(existsSync(join(RAIZ, 'src/screens/CodigosErroScreen.tsx')), false);
  assert.match(rotas, /import DiagnosticoScreen from '\.\.\/screens\/DiagnosticoScreen'/);
  assert.match(rotas, /const DiagnosticoCentro = comCentroDesktop\(DiagnosticoScreen\)/);
});
ok('a tela trata carregando, erro e "não está na base" e oferece perguntar à OLLI', () => {
  assert.match(tela, /estado\.tipo === 'carregando'/);
  assert.match(tela, /estado\.tipo === 'erro'/);
  assert.match(tela, /semResultadoNaBase\(estado\)/);
  assert.match(tela, /Não está na base offline/);
  assert.ok((tela.match(/Perguntar à OLLI sobre este caso/g) ?? []).length >= 2, 'no detalhe e no sem-resultado');
  assert.match(tela, /sequencia\.ehAtual\(id\)/);
});
ok('a tela entrega o caso em memória e abre o chat (sem params na rota)', () => {
  assert.match(tela, /entregarCasoAoChat\(montarContextoDiagnostico\(caso\)\)/);
  assert.match(tela, /nav\.navigate\('OlliChat'\)/);
  assert.equal(/navigate\('OlliChat',/.test(tela), false);
  assert.equal(/navigate\('DiagnosticoIA'/.test(tela), false, 'o caso não pula mais para outra tela');
});
ok('o chat retira o caso depois do histórico carregar e manda no modo consulta', () => {
  assert.match(chat, /if \(!carregado\) return;\s*const caso = retirarCasoDoDiagnostico\(\);/);
  assert.match(chat, /contextoDiagnostico: modo === 'consulta' \? casoDiag : null/);
  assert.match(chat, /aberturaDoCaso\(caso\), local: true/);
  assert.match(chat, /setCasoDiag\(null\)/);
});
ok('o serviço só envia contextoDiagnostico fora do modo de ação', () => {
  assert.match(
    servico,
    /if \(opcoesCredito\?\.modo === 'rascunho_acao'\) corpo\.modo = 'rascunho_acao';\s*else if \(opcoesCredito\?\.contextoDiagnostico\) corpo\.contextoDiagnostico = opcoesCredito\.contextoDiagnostico;/,
  );
});

console.log(`\nPASSOU: ${verificacoes} verificações\n`);
