/**
 * INÍCIO DO CELULAR: COBRANÇA, FOLLOW-UP, KPIs E PÓS-VENDA SÓ PARA QUEM VÊ.
 *
 *     node scripts/teste-home-cobranca-papel.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * A `HomeScreen` lê três radares da base local INTEIRA da empresa — dinheiro
 * parado (`orcamentosParaCobrar`), propostas sem resposta
 * (`orcamentosParaFollowUp`) e o cliente na hora da manutenção
 * (`clientesParaReconquistar`) — e mostra os KPIs do mês. O `Orcamento` não tem
 * responsável, então não dá para recortar "os do técnico": o recorte é por papel,
 * com a MESMA régua do "Bom dia" (`ACAO_SINAL`, utils/bomDiaSinais.ts). Este
 * teste trava:
 *  1) a régua: técnico e papel desconhecido não veem nada disso; dono, admin,
 *     gestor e conta pessoal veem; ritual e Home usam a mesma régua;
 *  2) a leitura: quem está fora da régua nem LÊ os radares (loader sai antes);
 *  3) a tela: palco, KPIs, selo do robô e radar de clientes só atrás da régua,
 *     com os 3 estados (carregando | erro | lista) intactos para quem vê;
 *  4) a navegação: o técnico do celular cai na TecnicoHomeScreen, que não lê
 *     radar comercial — a régua da Home é a 2ª camada, não a única.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { ACAO_SINAL, sinaisComerciaisPermitidos } from '../src/utils/bomDiaSinais.ts';
import { podeComPapel } from '../src/utils/permissoesPapel.ts';

let passos = 0;
function caso(nome: string, fn: () => void) {
  fn();
  passos++;
  console.log(`  ok  ${nome}`);
}

const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const semComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');

type Conta = Parameters<typeof podeComPapel>[1];
const empresa = (papel: 'owner' | 'admin' | 'gestor' | 'tecnico'): Conta => ({
  tipo: 'empresa',
  org: { papel },
  resolvido: true,
});
const PESSOAL: Conta = { tipo: 'pessoal', org: null, resolvido: true };
// "Não sei": o tipo padrão é 'pessoal' (o mais permissivo) — é aqui que um técnico
// seria promovido a dono se o gate olhasse só o tipo.
const DESCONHECIDO: Conta = { tipo: 'pessoal', org: null, resolvido: false };
const TECNICO_SEM_CONFIRMAR: Conta = { tipo: 'empresa', org: { papel: 'tecnico' }, resolvido: false };

const home = semComentarios(ler('src/screens/HomeScreen.tsx'));

/** Corpo de um `const nome = useCallback(async () => { ... }, [deps]);`. */
function corpoDoLoader(nome: string): string {
  const ini = home.indexOf(`const ${nome} = useCallback(async () => {`);
  assert.ok(ini >= 0, `${nome} sumiu da Home`);
  const fim = home.indexOf('\n  }, [', ini);
  assert.ok(fim > ini, `${nome} sem fim reconhecível`);
  return home.slice(ini, home.indexOf(']);', fim) + 3);
}

console.log('Início do celular: sinais comerciais respeitam o papel');

caso('régua: cobrança = valores agregados; pós-venda = gerenciar clientes', () => {
  assert.equal(ACAO_SINAL.cobranca, 'ver_valores_agregados');
  assert.equal(ACAO_SINAL.posVenda, 'gerenciar_clientes');
});

caso('régua: técnico não vê dinheiro nem pós-venda', () => {
  assert.equal(podeComPapel(ACAO_SINAL.cobranca, empresa('tecnico')), false);
  assert.equal(podeComPapel(ACAO_SINAL.posVenda, empresa('tecnico')), false);
});

caso('régua: papel desconhecido não vê nada (nunca vira dono)', () => {
  for (const conta of [DESCONHECIDO, TECNICO_SEM_CONFIRMAR]) {
    assert.notEqual(podeComPapel(ACAO_SINAL.cobranca, conta), true, JSON.stringify(conta)); // null = não sei: não libera
    assert.notEqual(podeComPapel(ACAO_SINAL.posVenda, conta), true, JSON.stringify(conta)); // null = não sei: não libera
  }
});

caso('régua: dono, admin, gestor e conta pessoal veem os dois', () => {
  for (const conta of [empresa('owner'), empresa('admin'), empresa('gestor'), PESSOAL]) {
    assert.equal(podeComPapel(ACAO_SINAL.cobranca, conta), true, JSON.stringify(conta));
    assert.equal(podeComPapel(ACAO_SINAL.posVenda, conta), true, JSON.stringify(conta));
  }
});

caso('régua: ritual ("Bom dia") e Home decidem igual para todo papel', () => {
  for (const conta of [empresa('owner'), empresa('admin'), empresa('gestor'), empresa('tecnico'), PESSOAL, DESCONHECIDO, TECNICO_SEM_CONFIRMAR]) {
    assert.deepEqual(
      sinaisComerciaisPermitidos(conta),
      { cobranca: podeComPapel(ACAO_SINAL.cobranca, conta) === true, posVenda: podeComPapel(ACAO_SINAL.posVenda, conta) === true },
      JSON.stringify(conta),
    );
  }
});

caso('Home: a régua exige papel conhecido e usa ACAO_SINAL', () => {
  assert.match(home, /const \{ papel, pode, carregando: papelCarregando \} = usePermissao\(\);/);
  assert.match(home, /const veDinheiro = !papelCarregando && pode\(ACAO_SINAL\.cobranca\);/);
  assert.match(home, /const vePosVenda = !papelCarregando && pode\(ACAO_SINAL\.posVenda\);/);
  // `ver_valores_agregados` só aparece solto no "Quanto sobrou" (lucro, Onda I4 — gate próprio).
  const soltosValores = home.match(/pode\('ver_valores_agregados'\)/g) ?? [];
  assert.ok(soltosValores.length <= 1, 'régua do dinheiro duplicada fora de ACAO_SINAL');
  if (soltosValores.length) assert.match(home, /pode\('ver_valores_agregados'\)[^\n]*\n[^\n]*\n\s*<QuantoSobrouCard/);
  // `gerenciar_clientes` só aparece solto no convite "Trazer meus dados" (não é sinal comercial).
  const soltos = home.match(/pode\('gerenciar_clientes'\)/g) ?? [];
  assert.ok(soltos.length <= 1, 'régua do pós-venda duplicada fora de ACAO_SINAL');
  if (soltos.length) assert.match(home, /const mostraConviteImportar = !papelCarregando && pode\('gerenciar_clientes'\)/);
});

caso('Home: fora da régua, os radares nem são LIDOS', () => {
  const casos: Array<[string, string, string]> = [
    ['loadCobranca', 'veDinheiro', 'orcamentosParaCobrar('],
    ['loadFollowUp', 'veDinheiro', 'orcamentosParaFollowUp('],
    ['loadRadar', 'vePosVenda', 'clientesParaReconquistar('],
  ];
  for (const [loader, flag, chamada] of casos) {
    const corpo = corpoDoLoader(loader);
    const guarda = corpo.indexOf(`if (!${flag}) return;`);
    assert.ok(guarda >= 0, `${loader} sem guarda de papel`);
    assert.ok(corpo.indexOf(chamada) > guarda, `${loader} lê o radar antes da guarda`);
    assert.ok(corpo.trimEnd().endsWith(`}, [${flag}]);`), `${loader} não depende de ${flag} (não relê quando o papel resolve)`);
    // Nenhuma outra chamada ao radar na tela: só dentro do loader guardado.
    assert.equal(home.split(chamada).length - 1, 1, `chamada solta a ${chamada}) na Home`);
  }
});

caso('Home: falha de leitura vira erro, nunca lista vazia (3 estados)', () => {
  assert.match(corpoDoLoader('loadCobranca'), /catch \{\s*setCobrancaErro\(true\);/);
  assert.match(corpoDoLoader('loadFollowUp'), /catch \{\s*setFollowUpErro\(true\);/);
  assert.match(corpoDoLoader('loadRadar'), /catch \{\s*setRadarErro\(true\);/);
  assert.doesNotMatch(home, /\.catch\(\(\) => \[\]\)/, 'erro virando [] na Home');
});

caso('Home: o papel resolvido com a tela focada relê só os radares', () => {
  // Foco: load() + rota num efeito; os radares (que mudam quando o papel resolve) noutro.
  assert.match(home, /useFocusEffect\(useCallback\(\(\) => \{ void load\(\); void loadRota\(\); \}, \[load, loadRota\]\)\);/);
  assert.match(
    home,
    /useFocusEffect\(useCallback\(\(\) => \{\s*void loadRadar\(\); void loadCobranca\(\); void loadFollowUp\(\);\s*\}, \[loadRadar, loadCobranca, loadFollowUp\]\)\);/,
  );
  // carregarTudo (puxar-para-atualizar / sync) não entra em useFocusEffect: senão o papel
  // resolvendo releria a Home inteira.
  assert.doesNotMatch(home, /useFocusEffect\(useCallback\(\(\) => \{ void carregarTudo\(\)/);
});

caso('Home: palco do dinheiro parado só para quem vê os valores', () => {
  assert.equal(home.split('<PainelDinheiroParado').length - 1, 1, 'mais de um palco na Home');
  assert.match(home, /\{veDinheiro && !esperandoDownload && \(\s*<>\s*<Text[^>]*>Dinheiro<\/Text>\s*<Aparecer indice=\{\d+\}>\s*<PainelDinheiroParado/);
});

caso('Home: KPIs do mês só para quem vê os valores', () => {
  const ini = home.indexOf('{!veDinheiro ? null : carregando || (esperandoDownload && download === \'baixando\') ? (');
  assert.ok(ini >= 0, 'KPIs sem a régua');
  for (const rotulo of ['Aprovado neste mês', 'Pedem follow-up', 'Conversão do mês']) {
    assert.ok(home.indexOf(rotulo) > ini, `KPI "${rotulo}" fora da régua`);
  }
});

caso('Home: selo do robô e item do menu contam só para quem vê (null = não mostra)', () => {
  assert.match(home, /const pedemFollowUp = !veDinheiro \|\| followUpCarregando \|\| followUpErro \? null : followUp\.length;/);
});

caso('Home: radar "Clientes para lembrar" só para quem cuida da carteira', () => {
  const ini = home.indexOf('{!vePosVenda ? null : radarCarregando ? (');
  assert.ok(ini >= 0, 'radar de clientes sem a régua');
  assert.ok(home.indexOf('Clientes para lembrar') > ini, '"Clientes para lembrar" fora da régua');
  assert.match(home, /if \(vePosVenda && !radarCarregando && radarBloqueados > 0\) \{\s*track\(Eventos\.gateVisto/, 'teaser do Pro contado para quem nem vê o radar');
});

caso('navegação: técnico do celular cai na TecnicoHomeScreen; papel desconhecido, na Home neutra', () => {
  const nav = semComentarios(ler('src/navigation/AppNavigator.tsx'));
  assert.match(nav, /const homeMobile = papelCarregando\s*\?\s*HomeCarregando\s*:\s*papel === 'tecnico'\s*\?\s*TecnicoHomeScreen\s*:\s*HomeComAvisoCadastro;/);
  // A Home neutra do celular é a HomeScreen com o aviso de cadastro por cima.
  assert.match(nav, /const HomeComAvisoCadastro = [^;]*HomeScreen/);
  const tecnico = ler('src/screens/TecnicoHomeScreen.tsx');
  for (const radar of ['radarCobranca', 'radarFollowUp', 'radarClientes', 'PainelDinheiroParado']) {
    assert.doesNotMatch(tecnico, new RegExp(radar), `TecnicoHomeScreen usa ${radar}`);
  }
});

console.log(`\n${passos} casos ok`);
