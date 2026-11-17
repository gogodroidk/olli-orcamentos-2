/**
 *     node scripts/teste-ui-v2-nav.ts
 * Exit 0 = passou; 1 = falhou. v1.3: flag ui_v2_nav (abas, filtros, barra lateral),
 * validação do Entrar no campo e o comentário do limite do Grátis.
 */
import { readFileSync } from 'node:fs';
import {
  abasMobile, rotuloAbaMobile, resolverUiV2Nav, statusDoGrupo, STATUS_DO_GRUPO, dividirSidebar, GRUPOS_ORCAMENTOS,
} from '../src/services/uiFlags.ts';
import { validarCampo, validarTudo, erroAuthNoCampo } from '../src/utils/validarCadastro.ts';

let falhas = 0;
const ok = (nome: string, cond: boolean) => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${nome}`);
  if (!cond) falhas++;
};
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ─── Flag desligada = app de hoje ─────────────────────────────────────────
ok('flag OFF: abas de hoje (Início, Agenda, +, Hoje, Conta)', igual(abasMobile(false, true), ['Home', 'Agenda', 'Orcar', 'Hoje', 'Conta']));
ok('flag OFF: técnico sem o +', igual(abasMobile(false, false), ['Home', 'Agenda', 'Hoje', 'Conta']));
ok('flag OFF: Conta continua "Conta"', rotuloAbaMobile('Conta', false) === 'Conta');
const itens = ['Home', 'OrcamentosTab', 'ClientesTab', 'Prospeccao', 'ServicosTab', 'Agenda', 'RelatoriosTab', 'AjudaTab'].map((rota) => ({ rota }));
ok('flag OFF: barra lateral inteira, sem "Mais"', igual(dividirSidebar(itens, false), { principais: itens, mais: [] }));
ok('padrão do build = desligada', resolverUiV2Nav(undefined, null) === false);

// ─── Flag ligada ──────────────────────────────────────────────────────────
ok('flag ON: Início · Orçamentos · + · Agenda · Mais', igual(abasMobile(true, true), ['Home', 'OrcamentosLista', 'Orcar', 'Agenda', 'Conta']));
ok('flag ON: rótulo "Mais"', rotuloAbaMobile('Conta', true) === 'Mais');
ok('flag ON: Hoje não é aba', !abasMobile(true, true).includes('Hoje'));
const div = dividirSidebar(itens, true);
ok('flag ON: 5 itens à vista', igual(div.principais.map((i) => i.rota), ['Home', 'OrcamentosTab', 'ClientesTab', 'Agenda', 'RelatoriosTab']));
ok('flag ON: resto no "Mais"', igual(div.mais.map((i) => i.rota), ['Prospeccao', 'ServicosTab', 'AjudaTab']));
ok('env=1 liga', resolverUiV2Nav('1', null) === true);

const mem = new Map<string, string>();
const janela = (search: string) => ({ location: { search }, localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } } });
ok('web ?ui_v2_nav=1 liga', resolverUiV2Nav(undefined, janela('?ui_v2_nav=1')) === true);
ok('web lembra a escolha', resolverUiV2Nav(undefined, janela('')) === true);
ok('web ?ui_v2_nav=0 desliga', resolverUiV2Nav('1', janela('?x=1&ui_v2_nav=0')) === false);

// ─── Filtros ──────────────────────────────────────────────────────────────
ok('3 filtros + Todos', igual(GRUPOS_ORCAMENTOS.map((g) => g.label), ['Todos', 'Com o cliente', 'Aprovados', 'Rascunhos']));
ok('Todos = sem filtro', statusDoGrupo('todos') === null);
ok('Rascunhos = rascunho', igual(statusDoGrupo('rascunhos'), ['rascunho']));
const todos = Object.values(STATUS_DO_GRUPO).flat();
ok('grupos não se repetem', new Set(todos).size === todos.length);
ok('Com o cliente inclui visualizado', STATUS_DO_GRUPO.com_cliente.includes('visualizado'));

// ─── Entrar: erro no campo ────────────────────────────────────────────────
const oito = 'x'.repeat(8);
const curta = 'x'.repeat(3);
const vazio = { nome: '', email: '', telefone: '', senha: '', confirmar: '' };
ok('login: só e-mail e senha', igual(Object.keys(validarTudo(vazio, 'login')).sort(), ['email', 'senha']));
ok('signup: nome, e-mail, telefone e senha vazios', igual(Object.keys(validarTudo(vazio, 'signup')).sort(), ['email', 'nome', 'senha', 'telefone']));
ok('e-mail sem domínio', !!validarCampo('email', { ...vazio, email: 'joao@gmail' }, 'signup'));
ok('e-mail ok', validarCampo('email', { ...vazio, email: 'joao@gmail.com' }, 'signup') === undefined);
ok('senha curta no cadastro', !!validarCampo('senha', { ...vazio, senha: curta }, 'signup'));
ok('senha curta no login passa (servidor decide)', validarCampo('senha', { ...vazio, senha: curta }, 'login') === undefined);
ok('confirmação diferente', !!validarCampo('confirmar', { ...vazio, senha: oito, confirmar: `${oito}y` }, 'signup'));
ok('telefone sem DDD', !!validarCampo('telefone', { ...vazio, telefone: '9999-9999' }, 'signup'));
const completo = { nome: 'João', email: 'joao@gmail.com', telefone: '(11) 99999-9999', senha: oito, confirmar: oito };
ok('cadastro completo sem erro', Object.keys(validarTudo(completo, 'signup')).length === 0);
ok('rate limit no cadastro = texto humano', erroAuthNoCampo(new Error('email rate limit exceeded'), 'signup').geral === 'Não deu para criar a conta agora. Tente em 1 minuto.');
ok('e-mail já cadastrado vai pro campo e-mail', !!erroAuthNoCampo(new Error('User already registered'), 'signup').email);
ok('credencial inválida vai pro campo senha', !!erroAuthNoCampo(new Error('Invalid login credentials'), 'login').senha);
ok('erro desconhecido não vaza inglês', !/[a-z]+ [a-z]+ exceeded|Error/.test(erroAuthNoCampo(new Error('weird internal thing'), 'login').geral ?? ''));

// ─── Fontes: telas com o código ───────────────────────────────────────────
const entrar = readFileSync(new URL('../src/screens/EntrarScreen.tsx', import.meta.url), 'utf8');
ok('Entrar não usa Alert.alert', !/Alert\.alert/.test(entrar));
const limites = readFileSync(new URL('../src/services/limitesComerciais.ts', import.meta.url), 'utf8');
ok('limitesComerciais não chama o Grátis de ilimitado', !/ilimitad/i.test(limites));
ok('limitesComerciais cita os 5 envios/mês', /5 ORÇAMENTOS ENVIADOS POR MÊS/.test(limites));
const nav = readFileSync(new URL('../src/navigation/AppNavigator.tsx', import.meta.url), 'utf8');
ok('navegador: Hoje só vira tela com a flag', /uiV2Nav\(\) && <Stack\.Screen name="HojeDia"/.test(nav));
ok('navegador: aba Hoje some só com a flag', /!ehDesktop && !navV2 && \(/.test(nav));

if (falhas) { console.error(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\nTudo certo.');

// ─── CQ-APP-13-B: chave remota (servidor só DESLIGA, sem versão nova) ─────
{
  const { chaveRemotaDesliga, aplicarChaveRemotaSalva, uiV2Nav, UI_V2_NAV } = await import('../src/services/uiFlags.ts');
  const { chaveUiV2Nav } = await import('../worker/src/versaoMinima.js');
  const assert = (await import('node:assert/strict')).default;
  assert.equal(chaveUiV2Nav({}), true, 'sem var = build decide');
  assert.equal(chaveUiV2Nav({ APP_UI_V2_NAV: '0' }), false, 'APP_UI_V2_NAV=0 desliga');
  assert.equal(chaveUiV2Nav({ APP_UI_V2_NAV: ' 1 ' }), true);
  assert.equal(chaveRemotaDesliga({ ok: true, android: 0, ui_v2_nav: false }), true);
  assert.equal(chaveRemotaDesliga({ ok: true, android: 0, ui_v2_nav: true }), false);
  assert.equal(chaveRemotaDesliga({ ok: true, android: 0 }), null, 'Worker antigo = não mexe');
  assert.equal(chaveRemotaDesliga(null), null);
  aplicarChaveRemotaSalva('desligada');
  assert.equal(uiV2Nav(), false, 'desligada remotamente vence o build');
  aplicarChaveRemotaSalva('ligada');
  assert.equal(uiV2Nav(), UI_V2_NAV, 'ligada remotamente = valor do build (nunca liga sozinho)');
  aplicarChaveRemotaSalva(null);
  assert.equal(uiV2Nav(), UI_V2_NAV);
  console.log('  ✓ chave remota: APP_UI_V2_NAV=0 no Worker desliga a v1.3 no próximo boot, sem versão nova');
}
