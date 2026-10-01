/**
 * Teste dos alertas oficiais (INMET + Defesa Civil), lado do app — Onda I1.
 *
 *     node scripts/teste-alertas-clima-app.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * `src/services/alertasClimaTexto.ts` não importa nada em runtime, então aqui
 * há COMPORTAMENTO de verdade: validação da resposta do worker (um aviso
 * malformado derruba a resposta — descartá-lo calado esconderia um alerta), a
 * regra dura "fonte fora NUNCA vira 'sem alertas'", alerta só-por-área não
 * conferido vira "Pode haver alerta…", frases com hora de parede do emissor e
 * o cruzamento com a janela de uma visita. As buscas no fonte de
 * `alertasClima.ts` ficam para o que só dá para provar lendo (3 estados, hook
 * que não fica preso em 'carregando', rota certa do worker).
 */
import { readFileSync } from 'node:fs';
import {
  ATRIBUICAO_ALERTAS,
  atribuicaoAlertas,
  avisosNoPeriodo,
  fraseDoAviso,
  horaDoAlerta,
  ibgeValido,
  motivoDeFalhaAlertas,
  nivelMaisGrave,
  normalizarRespostaAlertas,
  quandoDoAlerta,
  rotuloNivel,
  semAlertasConfirmado,
  textoAlertas,
  type AvisoOficial,
  type DadosAlertas,
} from '../src/services/alertasClimaTexto.ts';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

// 01/10/2026 12:00 em Brasília.
const AGORA = Date.parse('2026-10-01T12:00:00-03:00');

function aviso(over: Partial<AvisoOficial> = {}): AvisoOficial {
  return {
    id: 'inmet:55916',
    fonte: 'inmet',
    evento: 'Tempestade',
    titulo: 'Aviso de Tempestade. Perigo',
    descricao: 'Chuva entre 30 e 60 mm/h.',
    instrucao: 'Evite áreas alagadas.',
    nivel: 'laranja',
    severidade: 'Perigo',
    inicio: '2026-10-01T09:00:00-03:00',
    fim: '2026-10-01T23:59:00-03:00',
    area: 'São Paulo',
    emissor: 'INMET',
    link: 'https://avisos.inmet.gov.br/55916',
    conferidoPor: 'municipio',
    emVigor: true,
    ...over,
  };
}

/** Resposta do worker como `worker/src/alertas.js` monta (ver teste-alertas.js). */
function resposta(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    estado: 'ok',
    ibge: '3550308',
    fontes: {
      inmet: { nome: 'INMET', estado: 'ok', atualizadoEm: '2026-10-01T14:47:00.000Z' },
      defesaCivil: { nome: 'Defesa Civil', estado: 'ok', atualizadoEm: '2026-10-01T14:48:00.000Z' },
    },
    atribuicao: 'Alertas: INMET e Defesa Civil',
    consultadoEm: '2026-10-01T15:00:00.000Z',
    pontoConferido: false,
    avisos: [] as unknown[],
    naoConferidos: {},
    ...over,
  };
}

const dados = (over: Record<string, unknown> = {}) => normalizarRespostaAlertas(resposta(over), AGORA) as DadosAlertas;

console.log('\n1) validação');
checar('IBGE de 7 dígitos com UF válida', ibgeValido(3550308), '3550308');
checar('IBGE com UF inexistente', ibgeValido('9999999'), null);
checar('IBGE curto', ibgeValido('355030'), null);
checar('motivo desconhecido vira indisponível', motivoDeFalhaAlertas('xpto'), 'alertas_indisponiveis');
checar('motivo conhecido passa', motivoDeFalhaAlertas('alertas_desligados'), 'alertas_desligados');
checar('ok:false não vira dados', normalizarRespostaAlertas({ ok: false, motivo: 'alertas_indisponiveis' }), null);
checar('estado estranho não vira dados', normalizarRespostaAlertas(resposta({ estado: 'talvez' })), null);
checar('sem fontes não vira dados', normalizarRespostaAlertas(resposta({ fontes: null })), null);
checar(
  'UM aviso malformado derruba a resposta (não esconde alerta)',
  normalizarRespostaAlertas(resposta({ avisos: [aviso(), { ...aviso(), inicio: 'ontem' }] })),
  null,
);
checar('nível desconhecido continua aviso', dados({ avisos: [aviso({ nivel: 'roxo' as any })] }).avisos[0].nivel, 'desconhecido');

console.log('\n2) erro nunca vira vazio');
{
  const d = dados();
  checar('as duas fontes ok e nada: "Sem alertas oficiais agora"', textoAlertas(d), 'Sem alertas oficiais agora');
  checar('…e isso é "sem alertas" confirmado', semAlertasConfirmado(d), true);
}
{
  const d = dados({
    estado: 'parcial',
    fontes: {
      inmet: { nome: 'INMET', estado: 'ok' },
      defesaCivil: { nome: 'Defesa Civil', estado: 'indisponivel', motivo: 'http_500' },
    },
  });
  checar('Defesa Civil fora e nada no INMET: o "sem alertas" é SÓ do INMET', textoAlertas(d), 'Sem alertas do INMET agora');
  checar('nota diz qual fonte caiu', d.nota, 'Alertas da Defesa Civil indisponíveis agora');
  checar('NÃO é "sem alertas" confirmado', semAlertasConfirmado(d), false);
  checar('completo = false', d.completo, false);
  checar('atribuição só de quem respondeu', atribuicaoAlertas(d), 'Alertas: INMET');
}
{
  // Como o worker responde HOJE: Defesa Civil desligada (feed de ~24 MB não cabe no plano Free).
  const d = dados({
    estado: 'parcial',
    atribuicao: 'Alertas: INMET',
    fontes: {
      inmet: { nome: 'INMET', estado: 'ok' },
      defesaCivil: { nome: 'Defesa Civil', estado: 'indisponivel', motivo: 'fonte_desligada' },
    },
  });
  checar('Defesa Civil desligada: "Sem alertas do INMET agora"', textoAlertas(d), 'Sem alertas do INMET agora');
  checar('…nota honesta: não é consultada (não "fora agora")', d.nota, 'Alertas da Defesa Civil ainda não são consultados pelo OLLI');
  checar('…fontesDesligadas', d.fontesDesligadas, ['Defesa Civil']);
  checar('…NÃO é "sem alertas" confirmado', semAlertasConfirmado(d), false);
  checar('…atribuição só do INMET', atribuicaoAlertas(d), 'Alertas: INMET');
  const comAviso = dados({
    estado: 'parcial',
    avisos: [aviso()],
    fontes: {
      inmet: { nome: 'INMET', estado: 'ok' },
      defesaCivil: { nome: 'Defesa Civil', estado: 'indisponivel', motivo: 'fonte_desligada' },
    },
  });
  checar('…com aviso do INMET, o aviso manda na frase', textoAlertas(comAviso), 'Alerta INMET: Tempestade até hoje 23h59');
}
{
  const d = dados({
    estado: 'parcial',
    fontes: {
      inmet: { nome: 'INMET', estado: 'indisponivel', motivo: 'http_503' },
      defesaCivil: { nome: 'Defesa Civil', estado: 'indisponivel', motivo: 'fonte_desligada' },
    },
  });
  checar('as duas fora (mesmo em 200): "Alertas indisponíveis agora"', textoAlertas(d), 'Alertas indisponíveis agora');
  checar('…nota separa a caída da desligada', d.nota, 'Alertas do INMET indisponíveis agora · Alertas da Defesa Civil ainda não são consultados pelo OLLI');
}
{
  const d = dados({ fontes: { inmet: { estado: 'ok' } } });
  checar('fonte AUSENTE na resposta conta como fora', d.fontesIndisponiveis, ['Defesa Civil']);
}
{
  const d = dados({ naoConferidos: { defesaCivil: 2 } });
  checar('só-por-área não conferido: "Pode haver alerta…"', textoAlertas(d), 'Pode haver alerta da Defesa Civil na região');
  checar('…com o porquê', d.nota, 'Falta a localização do cliente para conferir');
  checar('…e não é "sem alertas"', semAlertasConfirmado(d), false);
}
checar('carregando', textoAlertas('carregando'), 'Buscando alertas oficiais…');
checar('desligado diz que está desligado', textoAlertas({ ok: false, motivo: 'alertas_desligados' }), 'Alertas oficiais desligados');
checar('falha genérica', textoAlertas({ ok: false, motivo: 'offline' }), 'Alertas indisponíveis agora');
checar('cliente sem cidade', textoAlertas({ ok: false, motivo: 'sem_municipio' }), 'Sem a cidade do cliente para checar alertas');
checar('falha não é "sem alertas"', semAlertasConfirmado({ ok: false, motivo: 'offline' }), false);
checar('carregando não é "sem alertas"', semAlertasConfirmado('carregando'), false);

console.log('\n3) frases');
checar('hora de parede do emissor', horaDoAlerta('2026-10-01T23:59:00-03:00'), '23h59');
checar('hora cheia', horaDoAlerta('2026-10-02T12:00:00-03:00'), '12h');
checar('fuso de outro estado não é convertido (vale o que o órgão anunciou)', horaDoAlerta('2026-10-01T18:00:00-04:00'), '18h');
checar('ISO inválido', horaDoAlerta('amanhã'), null);
checar('hoje', quandoDoAlerta('2026-10-01T23:59:00-03:00', AGORA), 'hoje 23h59');
checar('amanhã', quandoDoAlerta('2026-10-02T12:00:00-03:00', AGORA), 'amanhã 12h');
checar('outro dia', quandoDoAlerta('2026-10-04T08:30:00-03:00', AGORA), '04/10 8h30');
checar('em vigor: "até"', fraseDoAviso(aviso(), AGORA), 'Alerta INMET: Tempestade até hoje 23h59');
checar(
  'futuro: "a partir de"',
  fraseDoAviso(aviso({ emVigor: false, inicio: '2026-10-02T12:00:00-03:00' }), AGORA),
  'Alerta INMET: Tempestade a partir de amanhã 12h',
);
checar(
  'Defesa Civil em CAIXA ALTA vira frase',
  fraseDoAviso(aviso({ fonte: 'defesa_civil', evento: 'CHUVAS INTENSAS', fim: null }), AGORA),
  'Alerta Defesa Civil: Chuvas intensas',
);
checar('rótulo de nível', rotuloNivel('laranja'), 'Alerta laranja');
checar('rótulo de nível desconhecido não chuta cor', rotuloNivel('desconhecido'), 'Alerta (gravidade não informada)');
{
  const d = dados({
    avisos: [
      aviso({ id: 'a', nivel: 'amarelo' }),
      aviso({ id: 'b', nivel: 'vermelho', fonte: 'defesa_civil', evento: 'CHUVAS INTENSAS', fim: '2026-10-01T19:00:00-03:00' }),
    ],
  });
  checar('mais grave primeiro + contagem', textoAlertas(d), 'Alerta Defesa Civil: Chuvas intensas até hoje 19h (+1)');
  checar('nível mais grave para o chip', nivelMaisGrave(d), 'vermelho');
  checar('atribuição com dado na tela', atribuicaoAlertas(d), ATRIBUICAO_ALERTAS);
}
checar('sem dado na tela, sem atribuição', atribuicaoAlertas('carregando'), null);
checar('atribuição no rodapé', atribuicaoAlertas(), 'Alertas: INMET e Defesa Civil');

console.log('\n4) cruzamento com a hora da visita');
{
  const d = dados({
    avisos: [
      aviso({ id: 'manha', inicio: '2026-10-01T06:00:00-03:00', fim: '2026-10-01T10:00:00-03:00' }),
      aviso({ id: 'tarde', inicio: '2026-10-01T14:00:00-03:00', fim: '2026-10-01T18:00:00-03:00', emVigor: false }),
      aviso({ id: 'semFim', inicio: '2026-10-01T11:00:00-03:00', fim: null }),
    ],
  });
  const ids = (ini: string, fim: string) => avisosNoPeriodo(d, ini, fim).map((a) => a.id).sort();
  checar('visita 15h–16h pega o da tarde e o sem fim', ids('2026-10-01T15:00:00-03:00', '2026-10-01T16:00:00-03:00'), ['semFim', 'tarde']);
  checar('visita 10h–11h: fim exato não conta, início exato não conta', ids('2026-10-01T10:00:00-03:00', '2026-10-01T11:00:00-03:00'), []);
  checar('visita no dia seguinte 12h: sem fim vale 24 h', ids('2026-10-02T10:00:00-03:00', '2026-10-02T12:00:00-03:00'), ['semFim']);
  checar('janela inválida = nenhum', ids('2026-10-01T16:00:00-03:00', '2026-10-01T15:00:00-03:00'), []);
}

console.log('\n5) alertasClima.ts (fonte)');
{
  const bruto = readFileSync(new URL('../src/services/alertasClima.ts', import.meta.url), 'utf8');
  const fonte = bruto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  checar('exporta buscarAlertas', /export async function buscarAlertas\(/.test(fonte), true);
  checar('exporta useAlertasClima', /export function useAlertasClima\(/.test(fonte), true);
  checar("hook começa em 'carregando'", /useState<EstadoAlertas>\('carregando'\)/.test(fonte), true);
  checar('catch do hook leva a falha visível', /\.catch\(\(\) => \{\s*if \(vivo\) setEstado\(\{ ok: false/.test(fonte), true);
  checar('sem município → sem_municipio', /motivo: 'sem_municipio'/.test(fonte), true);
  checar('erro de rede → offline (não vazio)', /catch \{\s*return \{ ok: false, motivo: 'offline' \}/.test(fonte), true);
  checar('chama a rota GET /alertas do worker', /\/alertas\?ibge=\$\{ibge\}/.test(fonte), true);
  checar('só sucesso vai para a memória', fonte.indexOf('memoria.set(') > fonte.indexOf('if (!dados) return'), true);
  checar('nunca chama INMET/IDAP direto', /inmet\.gov\.br|mdr\.gov\.br/.test(fonte), false);
  checar('reexporta textoAlertas para a UI', /textoAlertas,/.test(fonte), true);
}

console.log(`\n${passes} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
