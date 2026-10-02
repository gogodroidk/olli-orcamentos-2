/**
 * Onda I5 — "explicação por explicação":
 *   1. o roteiro de 18 dicas por evento (src/services/dicasRoteiro.ts);
 *   2. o onboarding em 4 telas que termina no 1º orçamento (src/services/onboardingRapido.ts);
 *   3. a central "Como funciona" por tela (src/content/comoFunciona.ts).
 *
 *     node scripts/teste-dicas-roteiro.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Além das regras puras, confere o ENCAIXE: todo evento do roteiro é registrado
 * por alguma tela, todo lugar tem uma <DicaDoRoteiro>, toda tela da central tem
 * o "?" no cabeçalho. Dica sem gatilho é dica que nunca aparece (o erro vira vazio).
 */
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROTEIRO_DICAS,
  completouTrintaDias,
  diaLocal,
  diasEntre,
  dicaPorId,
  escolherDica,
  estadoDeJson,
  estadoInicial,
  eventoDoStatusOrcamento,
  jaApresentouNovaHoje,
  marcarApresentada,
  registrarEvento,
  registrarPrimeiroUso,
  type EstadoRoteiro,
} from '../src/services/dicasRoteiro.ts';
import { ORDEM_COMO_FUNCIONA, VERBETES_COMO_FUNCIONA, verbeteDaTela } from '../src/content/comoFunciona.ts';
import {
  OFICIOS_ONBOARDING,
  camposDoOficio,
  itensIniciais,
  nomeDoNegocio,
  oficioPorVertical,
  paramsPrimeiroOrcamento,
  telefoneNormalizado,
  totalRascunho,
  validarBase,
  type DadosBase,
} from '../src/services/onboardingRapido.ts';
import { EXEMPLOS_POR_VERTICAL, totalDoExemplo } from '../src/services/ativacao.ts';
import { VERTICAIS, VERTICAL_GERAL } from '../src/services/verticais.ts';

let ok = 0;
function caso(nome: string, fn: () => void): void {
  fn();
  ok++;
  console.log(`ok - ${nome}`);
}

const RAIZ = new URL('..', import.meta.url);
const ler = (rel: string) => readFileSync(new URL(rel, RAIZ), 'utf8');

function arquivos(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...arquivos(p));
    else if (/\.(ts|tsx)$/.test(nome)) out.push(p);
  }
  return out;
}
const SRC = arquivos(fileURLToPath(new URL('src', RAIZ)));
const TODO_SRC = SRC.map((p) => readFileSync(p, 'utf8')).join('\n');

// ─── 1. O roteiro ─────────────────────────────────────────────────────────────

caso('o roteiro tem 18 dicas, com id, número e evento únicos', () => {
  assert.equal(ROTEIRO_DICAS.length, 18);
  assert.equal(new Set(ROTEIRO_DICAS.map((d) => d.id)).size, 18);
  assert.equal(new Set(ROTEIRO_DICAS.map((d) => d.evento)).size, 18);
  assert.deepEqual(ROTEIRO_DICAS.map((d) => d.numero), Array.from({ length: 18 }, (_, i) => i + 1));
  for (const d of ROTEIRO_DICAS) {
    assert.match(d.id, /^roteiro\.[a-z0-9.-]+$/, `${d.id}: id estável com prefixo`);
    assert.equal(dicaPorId(d.id), d);
  }
});

caso('textos curtos, humanos e sem promessa do que o app não faz', () => {
  for (const d of ROTEIRO_DICAS) {
    assert.ok(d.titulo.length > 0 && d.titulo.length <= 28, `${d.id}: título curto (${d.titulo.length})`);
    assert.ok(d.texto.length >= 30 && d.texto.length <= 190, `${d.id}: texto curto (${d.texto.length})`);
    assert.doesNotMatch(d.texto, /\s—\s|—/, `${d.id}: sem travessão`);
    // Recursos do plano que AINDA não existem no app não podem virar promessa.
    assert.doesNotMatch(d.texto, /dossi|lucro real|trânsito|acompanha você|mapa ordena|lista do que levar/i, `${d.id}: só o que existe`);
  }
});

const HOJE = '2026-10-01';
const AMANHA = '2026-10-02';
const nada = new Set<string>();

caso('sem evento, nenhuma dica; ajuda desligada, nenhuma dica', () => {
  const e = estadoInicial();
  assert.equal(escolherDica({ estado: e, local: 'detalhe', hoje: HOJE, vistas: nada, ajudaAtiva: true }), null);
  const comEvento = registrarEvento(e, 'primeiro_envio', HOJE);
  assert.equal(escolherDica({ estado: comEvento, local: 'detalhe', hoje: HOJE, vistas: nada, ajudaAtiva: false }), null);
});

caso('o evento destrava a dica do lugar certo, como NOVA', () => {
  const e = registrarEvento(estadoInicial(), 'primeiro_envio', HOJE);
  const r = escolherDica({ estado: e, local: 'detalhe', hoje: HOJE, vistas: nada, ajudaAtiva: true });
  assert.ok(r);
  assert.equal(r.dica.id, 'roteiro.orcamento.primeiro-envio');
  assert.equal(r.nova, true);
  assert.equal(escolherDica({ estado: e, local: 'agenda', hoje: HOJE, vistas: nada, ajudaAtiva: true }), null);
});

caso('no máximo UMA dica nova por dia; a já apresentada continua até o "Entendi"', () => {
  let e: EstadoRoteiro = registrarEvento(estadoInicial(), 'primeiro_envio', HOJE);
  e = registrarEvento(e, 'primeira_visita_agendada', HOJE);
  const primeira = escolherDica({ estado: e, local: 'detalhe', hoje: HOJE, vistas: nada, ajudaAtiva: true });
  assert.ok(primeira?.nova);
  e = marcarApresentada(e, primeira.dica.id, HOJE);
  assert.ok(jaApresentouNovaHoje(e, HOJE));
  // Mesmo dia, outro lugar: segura a segunda.
  assert.equal(escolherDica({ estado: e, local: 'agenda', hoje: HOJE, vistas: nada, ajudaAtiva: true }), null);
  // A apresentada volta no lugar dela, sem contar como nova.
  const deNovo = escolherDica({ estado: e, local: 'detalhe', hoje: HOJE, vistas: nada, ajudaAtiva: true });
  assert.equal(deNovo?.dica.id, primeira.dica.id);
  assert.equal(deNovo?.nova, false);
  // No dia seguinte, a da agenda entra.
  const amanha = escolherDica({ estado: e, local: 'agenda', hoje: AMANHA, vistas: nada, ajudaAtiva: true });
  assert.equal(amanha?.dica.id, 'roteiro.agenda.primeira-visita');
  assert.equal(amanha?.nova, true);
});

caso('"Entendi" nunca repete; ordem do roteiro desempata no mesmo lugar', () => {
  let e = registrarEvento(estadoInicial(), 'cliente_abriu_link', HOJE);
  e = registrarEvento(e, 'primeiro_envio', HOJE);
  const r = escolherDica({ estado: e, local: 'detalhe', hoje: HOJE, vistas: nada, ajudaAtiva: true });
  assert.equal(r?.dica.numero, 2, 'a de número menor vem primeiro');
  const vistas = new Set(['roteiro.orcamento.primeiro-envio']);
  const seguinte = escolherDica({ estado: e, local: 'detalhe', hoje: AMANHA, vistas, ajudaAtiva: true });
  assert.equal(seguinte?.dica.numero, 3);
  const todas = new Set(ROTEIRO_DICAS.map((d) => d.id));
  assert.equal(escolherDica({ estado: e, local: 'detalhe', hoje: AMANHA, vistas: todas, ajudaAtiva: true }), null);
});

caso('contexto: o detalhe de um aprovado não mostra "agora é com o cliente"', () => {
  let e = registrarEvento(estadoInicial(), 'primeiro_envio', HOJE);
  e = registrarEvento(e, 'primeira_aprovacao', HOJE);
  const r = escolherDica({ estado: e, local: 'detalhe', hoje: HOJE, vistas: nada, ajudaAtiva: true, contexto: ['primeira_aprovacao'] });
  assert.equal(r?.dica.evento, 'primeira_aprovacao');
});

caso('status do orçamento → evento mais avançado (rascunho/recusado não destravam)', () => {
  assert.equal(eventoDoStatusOrcamento('enviado'), 'primeiro_envio');
  assert.equal(eventoDoStatusOrcamento('visualizado'), 'cliente_abriu_link');
  assert.equal(eventoDoStatusOrcamento('em_negociacao'), 'cliente_abriu_link');
  assert.equal(eventoDoStatusOrcamento('aguardando_assinatura'), 'cliente_abriu_link');
  assert.equal(eventoDoStatusOrcamento('aprovado'), 'primeira_aprovacao');
  assert.equal(eventoDoStatusOrcamento('convertido'), 'primeira_aprovacao');
  for (const s of ['rascunho', 'recusado', 'expirado', 'cancelado', null, undefined, 'xyz']) {
    assert.equal(eventoDoStatusOrcamento(s), null, String(s));
  }
});

caso('eventos e primeiro uso: só a primeira vez conta (mesmo objeto quando nada muda)', () => {
  const e = registrarEvento(estadoInicial(), 'primeiro_qr', HOJE);
  assert.equal(registrarEvento(e, 'primeiro_qr', AMANHA), e);
  assert.equal(e.eventos.primeiro_qr, HOJE);
  const u = registrarPrimeiroUso(estadoInicial(), HOJE);
  assert.equal(registrarPrimeiroUso(u, AMANHA), u);
  assert.equal(marcarApresentada(marcarApresentada(e, 'x', HOJE), 'x', AMANHA).apresentadas.x, HOJE);
});

caso('30 dias de uso contam pela data do primeiro uso', () => {
  assert.equal(diasEntre('2026-09-01', '2026-10-01'), 30);
  assert.equal(diasEntre('lixo', '2026-10-01'), 0);
  const u = registrarPrimeiroUso(estadoInicial(), '2026-09-02');
  assert.equal(completouTrintaDias(u, '2026-10-01'), false);
  assert.equal(completouTrintaDias(u, '2026-10-02'), true);
  assert.equal(completouTrintaDias(estadoInicial(), '2030-01-01'), false, 'sem registro, nunca');
  assert.match(diaLocal(new Date(2026, 0, 5)), /^2026-01-05$/);
});

caso('estado salvo corrompido vira estado limpo, nunca exceção', () => {
  assert.deepEqual(estadoDeJson(null), estadoInicial());
  assert.deepEqual(estadoDeJson('{lixo'), estadoInicial());
  assert.deepEqual(estadoDeJson('42'), estadoInicial());
  const r = estadoDeJson(JSON.stringify({ eventos: { primeiro_qr: HOJE, inventado: HOJE, primeiro_envio: 3 }, apresentadas: { a: HOJE, b: 1 }, primeiroUso: HOJE }));
  assert.deepEqual(r.eventos, { primeiro_qr: HOJE });
  assert.deepEqual(r.apresentadas, { a: HOJE });
  assert.equal(r.primeiroUso, HOJE);
});

caso('encaixe: todo evento do roteiro é registrado por alguma tela', () => {
  for (const d of ROTEIRO_DICAS) {
    if (d.evento === 'uso_30_dias') {
      assert.match(ler('src/services/dicasRoteiroStore.ts'), /registrarEvento\(comUso, 'uso_30_dias'/);
      assert.match(ler('src/screens/ContaScreen.tsx'), /registrarUsoDiario\(\)/);
      continue;
    }
    if (['primeiro_envio', 'cliente_abriu_link', 'primeira_aprovacao'].includes(d.evento)) {
      assert.match(ler('src/screens/VisualizarOrcamentoScreen.tsx'), /registrarEventoDica\(eventoDica\)/);
      continue;
    }
    assert.ok(TODO_SRC.includes(`registrarEventoDica('${d.evento}')`), `${d.evento}: ninguém registra`);
  }
});

caso('encaixe: todo lugar do roteiro tem uma <DicaDoRoteiro>', () => {
  for (const local of new Set(ROTEIRO_DICAS.map((d) => d.local))) {
    assert.ok(TODO_SRC.includes(`<DicaDoRoteiro local="${local}"`) || TODO_SRC.includes(`<DicaDoRoteiro\n              local="${local}"`), `${local}: sem DicaDoRoteiro`);
  }
});

caso('"Rever apresentação e dicas" zera também o roteiro; "Não mostrar mais" desliga a ajuda', () => {
  assert.match(ler('src/screens/ContaScreen.tsx'), /await resetarAjuda\(\);\s*await resetarRoteiro\(\);/);
  const store = ler('src/services/dicasRoteiroStore.ts');
  assert.match(store, /await desligarAjuda\(\)/);
  assert.match(store, /marcarDicaVista\(id\)/, 'o "Entendi" usa o mesmo conjunto do DicaContextual');
  const comp = ler('src/components/ajuda/DicaDoRoteiro.tsx');
  assert.match(comp, /Não mostrar mais/);
  assert.match(comp, /Entendi/);
  assert.match(comp, /<Aparecer/, 'entrada pelo motion da casa (respeita reduzir movimento)');
});

// ─── 2. Central "Como funciona" ──────────────────────────────────────────────

const ajudaFonte = ler('src/content/ajuda/index.ts');

caso('um verbete por tela principal, curto, com 3 ou 4 passos', () => {
  assert.equal(ORDEM_COMO_FUNCIONA.length, Object.keys(VERBETES_COMO_FUNCIONA).length);
  for (const tela of ORDEM_COMO_FUNCIONA) {
    const v = verbeteDaTela(tela);
    assert.equal(v.tela, tela);
    assert.ok(v.resumo.length <= 110, `${tela}: resumo curto`);
    assert.ok(v.passos.length >= 3 && v.passos.length <= 4, `${tela}: 3 ou 4 passos`);
    for (const p of v.passos) {
      assert.ok(p.texto.length <= 110, `${tela}: passo curto (${p.texto})`);
      assert.ok(p.icone.length > 2);
    }
    if (v.artigoId) assert.ok(ajudaFonte.includes(`id: '${v.artigoId}'`), `${tela}: guia ${v.artigoId} existe`);
    if (v.videoUrl) assert.match(v.videoUrl, /^https:\/\//, `${tela}: vídeo só com URL real`);
  }
});

caso('encaixe: cada tela da central tem o "?" no cabeçalho', () => {
  for (const tela of ORDEM_COMO_FUNCIONA) {
    assert.ok(
      TODO_SRC.includes(`comoFunciona="${tela}"`) || TODO_SRC.includes(`tela="${tela}"`),
      `${tela}: sem o botão "Como funciona"`,
    );
  }
  assert.match(ler('src/components/GradientHeader.tsx'), /comoFunciona \? <BotaoComoFunciona tela=\{comoFunciona\}/);
  assert.match(ler('src/screens/AjudaScreen.tsx'), /ORDEM_COMO_FUNCIONA/, 'a Central de Ajuda lista os verbetes');
});

// ─── 3. Onboarding em 4 telas ────────────────────────────────────────────────

caso('todo ofício tem ícone grande e um exemplo de orçamento', () => {
  const ids = [...VERTICAIS, VERTICAL_GERAL].map((v) => v.id).sort();
  assert.deepEqual(OFICIOS_ONBOARDING.map((o) => o.vertical).sort(), ids);
  for (const o of OFICIOS_ONBOARDING) {
    assert.ok(EXEMPLOS_POR_VERTICAL[o.vertical], `${o.vertical}: exemplo`);
    assert.equal(oficioPorVertical(o.vertical), o);
    const c = camposDoOficio(o.vertical);
    assert.deepEqual(c.verticais, [o.vertical]);
    assert.ok(c.segmento);
  }
  assert.equal(oficioPorVertical(null), undefined);
});

const BASE_OK: DadosBase = {
  tipoNegocio: 'autonomo', nomePrestador: 'João', nomeNegocio: '', whatsapp: '(11) 98888-7777', cnpj: '', cidade: 'São Paulo', estado: 'SP',
};
const cnpjSempreValido = () => true;

caso('tela 3: só o necessário, com a mesma exigência do perfil operacional', () => {
  assert.deepEqual(validarBase(BASE_OK, cnpjSempreValido), {});
  const vazio = validarBase({ ...BASE_OK, tipoNegocio: undefined, nomePrestador: ' ', whatsapp: '123', cidade: '', estado: 'S' }, cnpjSempreValido);
  assert.deepEqual(Object.keys(vazio).sort(), ['cidade', 'estado', 'nomePrestador', 'tipoNegocio', 'whatsapp']);
  const empresa = validarBase({ ...BASE_OK, tipoNegocio: 'empresa' }, cnpjSempreValido);
  assert.ok(empresa.cnpj && empresa.nomeNegocio, 'empresa exige CNPJ e nome');
  assert.ok(validarBase({ ...BASE_OK, cnpj: '11.111.111/1111-11' }, () => false).cnpj, 'CNPJ inválido barra');
  assert.equal(telefoneNormalizado('+55 (11) 98888-7777'), '11988887777');
  assert.equal(nomeDoNegocio(BASE_OK), 'João', 'autônomo sem nome de negócio usa o próprio nome');
  assert.equal(nomeDoNegocio({ ...BASE_OK, nomeNegocio: ' Clima Frio ' }), 'Clima Frio');
});

caso('tela 4: o orçamento nasce do ofício, editável, e o total soma em centavos', () => {
  for (const o of OFICIOS_ONBOARDING) {
    const { exemplo, itens } = itensIniciais(o.vertical);
    assert.ok(exemplo);
    assert.equal(itens.length, exemplo.itens.length);
    assert.equal(totalRascunho(itens), totalDoExemplo(exemplo), `${o.vertical}: total igual ao do exemplo`);
  }
  assert.deepEqual(itensIniciais(null), { exemplo: null, itens: [] });
  const itens = [
    { tipo: 'servico' as const, nome: 'A', quantidade: 3, unidade: 'un', preco: 0.1 },
    { tipo: 'servico' as const, nome: 'B', quantidade: 1, unidade: 'un', preco: Number.NaN },
  ];
  assert.equal(totalRascunho(itens), 0.3);
});

caso('tela 4 → editor: preço editado, cliente digitado e a marca de exemplo', () => {
  const { itens } = itensIniciais('pintura');
  const editados = itens.map((i, n) => (n === 0 ? { ...i, preco: 31.456 } : i));
  const p = paramsPrimeiroOrcamento('pintura', editados, '  Maria  ');
  assert.equal(p.exemploVertical, 'pintura');
  assert.equal(p.clienteNome, 'Maria');
  assert.equal(p.prefillItems[0].precoSugerido, 31.46);
  assert.equal(p.prefillItems.length, itens.length);
  assert.equal('clienteNome' in paramsPrimeiroOrcamento('pintura', editados, '   '), false, 'sem nome, o editor pergunta');
});

caso('a tela: 4 passos, primeiro orçamento no fim, importar como saída, sem logo/assinatura', () => {
  const tela = ler('src/screens/OnboardingScreen.tsx');
  assert.match(tela, /const TOTAL_TELAS = 4;/);
  assert.match(tela, /irParaApp\('orcamento', paramsPrimeiroOrcamento\(vertical, itens, clienteNome\)\)/);
  assert.match(tela, /registrarEventoDica\('onboarding_primeiro_orcamento'\)/);
  assert.match(tela, /<ConviteImportar onAbrir=\{\(\) => \{ void concluir\('importar'\); \}\} \/>/);
  assert.match(tela, /AVISO_EXEMPLO/, 'o valor de exemplo é dito em voz alta');
  assert.match(tela, /resolverEstadoEmpresaDaSessao/, 'o portão de 3 estados continua');
  assert.doesNotMatch(tela, /ImagePicker/);
  assert.match(tela, /useReduzirMovimento/, 'motion respeita reduzir movimento');
});

console.log(`\n${ok} casos — roteiro de dicas, central "Como funciona" e onboarding em 4 telas ok.`);
