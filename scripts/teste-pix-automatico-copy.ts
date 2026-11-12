/**
 *     node scripts/teste-pix-automatico-copy.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Pix Automático (renova sozinho) — o que a tela PROMETE tem de ser verdade e estar completo (CDC art. 6º III e 31):
 *  - o texto diz preço, que cobra automaticamente todo mês e COMO cancelar;
 *  - o preço da tela é o do catálogo do worker (centavos iguais) — o produto na AbacatePay é conferido pelo worker;
 *  - o botão só nasce atrás da flag do servidor (`pixAutomatico:true` em /abacate/config), no app e no painel;
 *  - o botão do Pix Automático é SÓ do Pro mensal; Android da Play e iOS (sem compra no app) nunca o mostram.
 */
import { readFileSync } from 'node:fs';
import { ROTULO_CANCELAR_PIX_AUTOMATICO, ROTULO_PIX_AUTOMATICO, TEXTO_PIX_AUTOMATICO_ATIVO, textoAcordoPixAutomatico, textoCurtoPixAutomatico } from '../src/content/pixAutomatico.ts';
import { PRECO_PRO } from '../src/services/precosPlanos.ts';
import { PLANO_PIX } from '../worker/src/mercadopago.js';

let falhas = 0;
const ok = (nome: string, cond: boolean) => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${nome}`);
  if (!cond) falhas++;
};
const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const valor = 'R$ 39,00';
const acordo = textoAcordoPixAutomatico(valor);
ok('acordo traz o preço', acordo.includes(valor));
ok('acordo diz que debita automaticamente todo mês', /automaticamente/.test(acordo) && /todo mês/.test(acordo));
ok('acordo diz até quando: até cancelar', /até você cancelar/.test(acordo));
ok('acordo diz que o 1º débito é na hora', /primeiro débito é na hora/.test(acordo));
ok('acordo diz COMO cancelar (no OLLI e no banco)', acordo.includes('Cancelar renovação automática') && /app do seu banco/.test(acordo));
ok('acordo diz o que acontece ao cancelar (nada mais cobrado; Pro até o fim do período pago)', /nada mais é cobrado/.test(acordo) && /fim do período já pago/.test(acordo));
const curto = textoCurtoPixAutomatico(valor);
ok('linha curta: preço, mensal, como cancelar', curto.includes(valor) && /por mês/.test(curto) && /cancele quando quiser/i.test(curto) && /Planos/.test(curto));
ok('rótulo promete só o que é: renova sozinho todo mês', ROTULO_PIX_AUTOMATICO === 'Pix Automático: renova sozinho todo mês');
ok('rótulos de ativo/cancelar existem', TEXTO_PIX_AUTOMATICO_ATIVO.length > 10 && ROTULO_CANCELAR_PIX_AUTOMATICO === 'Cancelar renovação automática');
ok('nenhuma promessa que o servidor não cumpre (teste grátis, desconto, cupom, tentar de novo)', !/(grátis|desconto|cupom|tentaremos|tentar de novo)/i.test(acordo + curto));

ok('preço do Pro mensal: tela (centavos) = catálogo do worker (reais)', PRECO_PRO.mensalCentavos === Math.round(PLANO_PIX.pro_mensal.valor * 100));
ok('só existe Pix Automático do Pro mensal no worker', ler('worker/src/abacatePixAutomatico.js').includes("const PLANO_PA = 'pro_mensal'"));

const app = ler('src/screens/PlanosScreen.tsx');
ok('app: botão atrás de pixAutoLigado vindo de pixAutomaticoDisponivel()', app.includes('pixAutomaticoDisponivel().then') && /COMPRA_NO_APP && !BUILD_PLAY_SEM_COMPRA_EXTERNA && pixAutoLigado && !plano\.atual && plano\.id === 'pro' && periodo === 'mensal'/.test(app));
ok('app: confirmação com o texto do acordo ANTES de abrir o banco', app.indexOf('textoAcordoPixAutomatico(valor)') > 0 && app.indexOf('textoAcordoPixAutomatico(valor)') < app.indexOf('criarPixAutomatico()'));
ok('app: cancelar renovação existe', app.includes('cancelarPixAutomatico()') && app.includes('ROTULO_CANCELAR_PIX_AUTOMATICO'));
const web = ler('webapp/src/pages/olli/planos/index.tsx');
ok('painel: botão só com o worker confirmando e só no Pro mensal', web.includes('pixAutoLigado && !pixAutoAtiva && p.id === "pro" && periodo === "mensal"'));
ok('painel: "Pix não renova sozinho" some quando o Pix Automático está ativo', web.includes('renovaPorPixAutomatico') && web.includes('Pix Automático ativo: renova sozinho todo mês'));
const dlg = ler('webapp/src/pages/olli/planos/PixAutomatico.tsx');
ok('painel: diálogo mostra o acordo antes de autorizar', dlg.includes('textoAcordoPixAutomatico(valor)') && dlg.includes('Autorizar'));
const pix = ler('webapp/src/pages/olli/planos/pix.ts');
ok('painel: só `pixAutomatico === true` liga (falha = sem botão)', pix.includes('data.pixAutomatico === true'));
const svc = ler('src/services/pixAutomatico.ts');
ok('app: só `pixAutomatico === true` liga', svc.includes('d?.pixAutomatico === true'));

const w = ler('worker/src/abacate.js');
ok('worker: /abacate/config expõe pixAutomatico e o Pix avulso não depende dela', w.includes('pixAutomatico: pixAutomaticoLigado(env, PA)') && w.includes("pix: modo !== 'desligado'"));
const pa = ler('worker/src/abacatePixAutomatico.js');
ok('worker: flag exige valor exato "true" (padrão desligada)', pa.includes("env[ABACATE_PA_ENV.flag] !== 'true'"));

console.log(falhas ? `\n${falhas} falha(s)` : '\nPASSOU');
process.exit(falhas ? 1 : 0);
