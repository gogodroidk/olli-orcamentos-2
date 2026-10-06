/**
 * O EMPURRÃO DO ENVIO no painel (06/10/2026).
 *
 *     node scripts/teste-empurrao-envio.ts
 * Exit 0 = passou; qualquer assert que falha derruba o processo.
 *
 * Por quê: 8 de 11 contas que orçaram só têm rascunho e, no banco, 7 dessas 8 não mostram NENHUM
 * sinal de envio. São orçamentos completos parados. Tranca a regra de quem é lembrado (conservadora,
 * para o lembrete não virar ruído) e a fiação: faixa na lista + "Já enviei"/"Enviar pelo WhatsApp"
 * depois do PDF, tudo pela MESMA porta de status (`useMarcarEnviado`).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HORAS_DISPENSA, MINUTOS_PARADO, prontoEParado, prontosParados } from '../webapp/src/pages/olli/orcamentos/orcamentosParados.ts';

let checks = 0;
const eq = (atual: unknown, esperado: unknown, msg: string) => {
  assert.deepEqual(atual, esperado, `FALHA: ${msg}`);
  checks++;
};
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, `FALHA: ${msg}`);
  checks++;
};

const AGORA = Date.parse('2026-10-06T15:00:00Z');
const minAtras = (m: number) => new Date(AGORA - m * 60_000).toISOString();
const linha = (extra: Record<string, unknown> = {}, dados: Record<string, unknown> = {}, id = 'o1'): any => ({
  id,
  status: 'rascunho',
  criado_em: minAtras(120),
  dados: {
    numero: '00126', clienteNome: 'Maria Souza', clienteTelefone: '(11) 98123-4567', valorTotal: 245,
    itens: [{ nome: 'Troca de disjuntor' }], status: 'rascunho', criadoEm: minAtras(120), atualizadoEm: minAtras(90), ...dados,
  },
  ...extra,
});

eq(MINUTOS_PARADO, 60, 'o lembrete espera 60 min sem mexer');
eq(HORAS_DISPENSA, 24, '"Agora não" cala por 24 h');

// o caso que importa
ok(prontoEParado(linha(), AGORA), 'rascunho completo, WhatsApp válido, parado há 90 min → lembra');
// quem está editando agora não é lembrado
ok(!prontoEParado(linha({}, { atualizadoEm: minAtras(10) }), AGORA), 'mexido há 10 min NÃO lembra (a pessoa está editando)');
ok(!prontoEParado(linha({}, { atualizadoEm: minAtras(59) }), AGORA), '59 min ainda não');
ok(prontoEParado(linha({}, { atualizadoEm: minAtras(61) }), AGORA), '61 min já');
// só rascunho
for (const st of ['enviado', 'aprovado', 'em_negociacao', 'cancelado', 'recusado']) ok(!prontoEParado(linha({ status: st }), AGORA), `${st} nunca é lembrado`);
ok(!prontoEParado(linha({ status: null }), AGORA), 'status desconhecido não é lembrado');
// documento incompleto
ok(!prontoEParado(linha({ dados: null }), AGORA), 'sem o documento não lembra');
ok(!prontoEParado(linha({}, { itens: [] }), AGORA), 'sem itens não lembra');
ok(!prontoEParado(linha({}, { valorTotal: 0 }), AGORA), 'valor zero não lembra');
ok(!prontoEParado(linha({}, { clienteNome: '  ' }), AGORA), 'sem nome de cliente não lembra');
// sem WhatsApp válido a ação oferecida não funcionaria
ok(!prontoEParado(linha({}, { clienteTelefone: '' }), AGORA), 'sem WhatsApp não lembra');
ok(!prontoEParado(linha({}, { clienteTelefone: '98123-4567' }), AGORA), 'WhatsApp sem DDD não lembra');
// data ilegível não vira "parado há muito tempo"
ok(!prontoEParado(linha({ criado_em: 'xx' }, { criadoEm: 'yy', atualizadoEm: 'zz' }), AGORA), 'sem data legível não lembra (erro nunca vira "parado")');
// dispensa
ok(!prontoEParado(linha(), AGORA, { o1: AGORA - 5 * 3_600_000 }), '"Agora não" há 5 h ainda cala');
ok(prontoEParado(linha(), AGORA, { o1: AGORA - 25 * 3_600_000 }), 'passadas 24 h a faixa volta');
ok(prontoEParado(linha(), AGORA, { outro: AGORA - 1 }), 'dispensar OUTRO orçamento não cala este');

// ordem: o mexido por último primeiro
const a = linha({}, { atualizadoEm: minAtras(300), numero: 'A' }, 'a');
const b = linha({}, { atualizadoEm: minAtras(70), numero: 'B' }, 'b');
const c = linha({ status: 'enviado' }, {}, 'c');
eq(prontosParados([a, b, c], AGORA).map((l: any) => l.id), ['b', 'a'], 'ordena pelo mexido por último e ignora os já enviados');
eq(prontosParados([], AGORA), [], 'lista vazia = nada a lembrar');

// ─── fiação ──────────────────────────────────────────────────────────────────
const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const lista = ler('webapp/src/pages/olli/orcamentos/index.tsx');
const faixa = ler('webapp/src/pages/olli/orcamentos/FaixaOrcamentoParado.tsx');
const marcar = ler('webapp/src/pages/olli/orcamentos/useMarcarEnviado.ts');
const whats = ler('webapp/src/pages/olli/orcamentos/useEnviarWhatsApp.tsx');

ok(/<FaixaOrcamentoParado/.test(lista) && /!isLoading && !isError && paradas\.length > 0/.test(lista), 'a faixa só aparece com a lista carregada e sem erro (erro nunca vira "nada parado")');
ok(/prontosParados\(data \?\? \[\], agoraMs, dispensados\)/.test(lista), 'a faixa usa a regra pura com o relógio do estado');
ok(/setInterval\(\(\) => setAgoraMs\(Date\.now\(\)\), 60_000\)/.test(lista) && /clearInterval/.test(lista), 'o relógio anda (tick de 1 min) e é limpo ao sair: o rascunho que completa 60 min com a aba aberta vira faixa');
ok(/Enviar pelo WhatsApp/.test(faixa) && /Agora não/.test(faixa), 'a faixa oferece enviar e dispensar');
ok(/label: "Enviar pelo WhatsApp"/.test(lista) && /label: "Já enviei"/.test(lista), 'depois do PDF a pessoa escolhe: enviar com link ou "Já enviei"');
ok(/if \(linha\.status !== "rascunho"\) return;/.test(lista), 'a pergunta pós-PDF só aparece para rascunho');
ok(/fresco\.status !== "rascunho"\) return "ja_avancado"/.test(marcar), 'marcar enviado nunca rebaixa quem já avançou');
ok(/return "falhou"/.test(marcar), 'falha ao ler/gravar volta "falhou" (o chamador avisa)');
ok(/useMarcarEnviado\(\)/.test(whats) && !/\.from\("orcamentos"\)\.select/.test(whats), 'o "Já enviei" do WhatsApp usa a MESMA porta de status (sem 2ª cópia da regra)');

console.log(`PASSOU: ${checks} verificações — rascunho completo parado vira faixa e o PDF pergunta "já enviou?".`);
