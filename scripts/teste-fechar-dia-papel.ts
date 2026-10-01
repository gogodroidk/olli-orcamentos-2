/**
 * "FECHAR O DIA" E "COMO FOI SEU DIA?" SÓ PARA QUEM VÊ RELATÓRIOS.
 *
 *     node scripts/teste-fechar-dia-papel.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O relatório do dia (`gerarRelatorioDia`) soma orçamentos, recibos e clientes
 * novos da base local INTEIRA — valores agregados da empresa. Pela matriz de
 * `utils/permissoesPapel.ts` o técnico não tem `ver_relatorios` nem
 * `ver_valores_agregados`, e a `RelatorioDiaScreen` é guardada por
 * `<GuardaPapel acao="ver_relatorios">`. Este teste trava:
 *  1) a matriz: técnico e papel desconhecido NÃO veem relatórios; dono, admin,
 *     gestor e conta pessoal veem;
 *  2) o ritual: "Fechar o dia" só monta a prévia depois de `podeComPapel(
 *     'ver_relatorios', await lerTipoContaAtual())` — antes de ler o relatório;
 *  3) as portas para a tela: o card "Como foi seu dia?" do Hoje e o toggle
 *     "Fechar o dia" em Conta só aparecem com o papel conhecido e permitido.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { podeComPapel } from '../src/utils/permissoesPapel.ts';

let passos = 0;
function caso(nome: string, fn: () => void) {
  fn();
  passos++;
  console.log(`  ok  ${nome}`);
}

const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

type Conta = Parameters<typeof podeComPapel>[1];
const empresa = (papel: 'owner' | 'admin' | 'gestor' | 'tecnico'): Conta => ({
  tipo: 'empresa',
  org: { papel },
  resolvido: true,
});
const PESSOAL: Conta = { tipo: 'pessoal', org: null, resolvido: true };
// "Não sei": leitura da org falhou e não há cache. O tipo padrão é 'pessoal' — o
// mais permissivo —, então é aqui que um técnico seria promovido a dono.
const DESCONHECIDO: Conta = { tipo: 'pessoal', org: null, resolvido: false };
const TECNICO_SEM_CONFIRMAR: Conta = { tipo: 'empresa', org: { papel: 'tecnico' }, resolvido: false };

console.log('"Fechar o dia" e "Como foi seu dia?" respeitam o papel');

caso('matriz: técnico não vê relatórios nem valores agregados', () => {
  assert.equal(podeComPapel('ver_relatorios', empresa('tecnico')), false);
  assert.equal(podeComPapel('ver_valores_agregados', empresa('tecnico')), false);
});

caso('matriz: dono, admin, gestor e conta pessoal veem relatórios', () => {
  for (const papel of ['owner', 'admin', 'gestor'] as const) {
    assert.equal(podeComPapel('ver_relatorios', empresa(papel)), true, papel);
  }
  assert.equal(podeComPapel('ver_relatorios', PESSOAL), true);
});

caso('matriz: papel desconhecido nega, mesmo com o tipo padrão "pessoal"', () => {
  assert.equal(podeComPapel('ver_relatorios', DESCONHECIDO), false);
  assert.equal(podeComPapel('ver_relatorios', TECNICO_SEM_CONFIRMAR), false);
});

caso('matriz: quem vê relatórios também vê valores agregados (o relatório é agregado)', () => {
  for (const conta of [empresa('owner'), empresa('admin'), empresa('gestor'), PESSOAL, empresa('tecnico'), DESCONHECIDO]) {
    assert.equal(
      podeComPapel('ver_relatorios', conta),
      podeComPapel('ver_valores_agregados', conta),
      JSON.stringify(conta),
    );
  }
});

caso('ritual: "Fechar o dia" checa o papel ANTES de ler o relatório', () => {
  const src = ler('src/services/ritualDiario.ts');
  const corpo = src.slice(src.indexOf('async function montarFecharDia('));
  assert.ok(corpo.length > 0, 'montarFecharDia sumiu');
  const gate = corpo.indexOf("if (!podeComPapel('ver_relatorios', await lerTipoContaAtual())) return null;");
  const leitura = corpo.indexOf('gerarRelatorioDia()');
  assert.ok(gate >= 0, 'sem gate de ver_relatorios no "Fechar o dia"');
  assert.ok(leitura > gate, 'o relatório é lido antes de checar o papel');
  assert.match(src, /import \{ lerTipoContaAtual \} from '\.\.\/hooks\/useTipoConta';/);
  assert.match(src, /import \{ podeComPapel \} from '\.\.\/utils\/permissoesPapel';/);
});

caso('ritual: só agenda "Fechar o dia" quando montarFecharDia devolve conteúdo', () => {
  const src = ler('src/services/ritualDiario.ts');
  assert.match(src, /const conteudo = await montarFecharDia\(\);\s*if \(conteudo\) \{/);
  // Reagendar cancela antes de criar: o técnico que tinha um "Fechar o dia" antigo
  // agendado perde ele no próximo reagendamento.
  assert.match(src, /await cancelarRitualDiario\(\);/);
});

caso('ritual: o toque no "Fechar o dia" leva à tela guardada por ver_relatorios', () => {
  assert.match(ler('App.tsx'), /data\.ritual === 'fecharDia'\) navigationRef\.navigate\('RelatorioDia'/);
  assert.match(ler('src/screens/RelatorioDiaScreen.tsx'), /<GuardaPapel acao="ver_relatorios"/);
});

caso('Hoje: card "Como foi seu dia?" só com papel conhecido que vê relatórios', () => {
  const src = ler('src/screens/HojeScreen.tsx');
  assert.match(src, /const mostraRelatorioDia = !papelCarregando && pode\('ver_relatorios'\);/);
  const card = src.indexOf('>Como foi seu dia?</Text>');
  const gate = src.lastIndexOf('{mostraRelatorioDia && (', card);
  assert.ok(gate >= 0 && gate < card, 'o card não está dentro do gate');
});

caso('Conta: toggle "Fechar o dia" só com papel conhecido que vê relatórios', () => {
  const src = ler('src/screens/ContaScreen.tsx');
  const toggle = src.indexOf("handleToggleRitual('fecharDia', v)");
  const gate = src.lastIndexOf("{!carregandoPermissao && pode('ver_relatorios') && (", toggle);
  assert.ok(toggle >= 0, 'toggle sumiu');
  assert.ok(gate >= 0 && toggle - gate < 1500, 'o toggle não está dentro do gate');
});

caso('hook e serviços decidem pela mesma matriz', () => {
  const hook = ler('src/hooks/usePermissao.ts');
  assert.match(hook, /import \{ podeComPapel, type Acao \} from '\.\.\/utils\/permissoesPapel';/);
  assert.match(hook, /podeComPapel\(acao, \{ tipo, org, resolvido \}\)/);
  assert.doesNotMatch(hook, /const PERMISSOES/, 'matriz duplicada no hook');
});

console.log(`\n${passos} casos ok`);
