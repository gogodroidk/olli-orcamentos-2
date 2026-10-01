/**
 * Teste do clima do dia, lado do app (item 2.5 da Onda 2).
 *
 *     node scripts/teste-clima-app.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * `src/services/climaTexto.ts` não importa nada em runtime, então aqui há
 * COMPORTAMENTO de verdade: validação da resposta do worker, texto curto
 * ("Chuva às 15h — leve capa"), e a regra dura — hora sem probabilidade NUNCA
 * vira "sem chuva". As buscas no fonte de `clima.ts` ficam para o que só dá
 * para provar lendo (3 estados, nada de prompt de permissão, nada de
 * `expo-location` em module-scope) e removem comentários antes.
 */
import { readFileSync } from 'node:fs';
import {
  codigoEhChuva,
  coordenadaValida,
  descricaoTempo,
  horaCurta,
  motivoDeFalha,
  normalizarRespostaClima,
  resumoClima,
  textoClima,
  type HoraChuva,
} from '../src/services/climaTexto.ts';

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

function horas(probs: (number | null)[], inicioHora = 14, codigos?: (number | null)[]): HoraChuva[] {
  return probs.map((p, i) => {
    const h = String((inicioHora + i) % 24).padStart(2, '0');
    return { inicio: `2026-10-01T${h}:00`, hora: `${h}:00`, probabilidade: p, codigo: codigos?.[i] ?? 2 };
  });
}

/** Resposta do worker como `worker/src/clima.js` monta (ver teste-clima.js). */
function respostaWorker(probs: (number | null)[]) {
  return {
    ok: true,
    local: { geohash: '6gycf', lat: -23.55, lon: -46.63 },
    fuso: 'America/Sao_Paulo',
    atual: { temperatura: 27.4, codigo: 2, ehDia: true, medidoEm: '2026-10-01T14:15' },
    hoje: { data: '2026-10-01', max: 31.2, min: 18.6 },
    chuvaPorHora: horas(probs),
    atualizadoEm: '2026-10-01T17:20:00.000Z',
    cache: false,
  };
}

const DOZE_SECAS = [5, 5, 10, 5, 0, 0, 5, 5, 10, 5, 0, 0];

console.log('\n1) texto curto');
checar('chuva ≥50% → "Chuva às 15h — leve capa"',
  resumoClima({ temperatura: 27, codigo: 2, max: 31, chuvaPorHora: horas([10, 60, 80]) }),
  'Chuva às 15h — leve capa');
checar('30–49% → "Pode chover às 16h (35%)"',
  resumoClima({ temperatura: 27, codigo: 2, max: 31, chuvaPorHora: horas([10, 20, 35]) }),
  'Pode chover às 16h (35%)');
checar('chovendo agora (código atual) → "Chovendo agora — leve capa"',
  resumoClima({ temperatura: 21, codigo: 63, max: 24, chuvaPorHora: horas([90]) }),
  'Chovendo agora — leve capa');
checar('janela inteira conhecida e seca → "Sem chuva nas próximas 12h · 27°"',
  resumoClima({ temperatura: 27.4, codigo: 1, max: 31, chuvaPorHora: horas(DOZE_SECAS) }),
  'Sem chuva nas próximas 12h · 27°');
checar('REGRA DURA: uma hora sem dado → NÃO afirma "sem chuva", fala só a temperatura',
  resumoClima({ temperatura: 27.4, codigo: 1, max: 31.2, chuvaPorHora: horas([5, null, 5]) }),
  '27° agora · máx 31°');
checar('janela vazia não vira "sem chuva"',
  resumoClima({ temperatura: 27.4, codigo: 1, max: null, chuvaPorHora: [] }),
  '27° agora');
checar('código WMO de chuva com % baixa NÃO vira "Sem chuva nas próximas 12h"',
  resumoClima({
    temperatura: 27.4, codigo: 1, max: 31,
    chuvaPorHora: horas(DOZE_SECAS, 14, [2, 2, 2, 2, 61, 2, 2, 2, 2, 2, 2, 2]),
  }),
  'Pode chover às 18h');
checar('null de probabilidade não conta como 0 para o limiar',
  resumoClima({ temperatura: 20, codigo: 1, max: 22, chuvaPorHora: horas([null, null, 55]) }),
  'Chuva às 16h — leve capa');

console.log('\n2) peças do texto');
checar('horaCurta 15:00 → 15h', horaCurta('15:00'), '15h');
checar('horaCurta 09:30 → 9h30', horaCurta('09:30'), '9h30');
checar('WMO 2 → Parcialmente nublado', descricaoTempo(2), 'Parcialmente nublado');
checar('WMO 95 → Trovoada', descricaoTempo(95), 'Trovoada');
checar('WMO desconhecido NÃO vira "Céu limpo"', descricaoTempo(42), 'Tempo variável');
checar('garoa/chuva/pancada/trovoada são chuva', [51, 61, 65, 80, 82, 95, 99].every(codigoEhChuva), true);
checar('limpo/nublado/neblina/null não são chuva', [0, 1, 2, 3, 45].some(codigoEhChuva) || codigoEhChuva(null), false);

console.log('\n3) resposta do worker');
{
  const d = normalizarRespostaClima(respostaWorker([10, 60, 80, 20, 5, 5, 5, 5, 5, 5, 5, 5]));
  checar('resposta válida vira DadosClima ok', d?.ok, true);
  checar('temperatura/máx/mín preservadas', [d?.temperatura, d?.max, d?.min], [27.4, 31.2, 18.6]);
  checar('12 horas de chuva', d?.chuvaPorHora.length, 12);
  checar('resumo pronto', d?.resumo, 'Chuva às 15h — leve capa');
  checar('descrição derivada do código', d?.descricao, 'Parcialmente nublado');
}
{
  const d = normalizarRespostaClima(respostaWorker([5, null, 5]));
  checar('probabilidade null sobrevive como null (não 0)', d?.chuvaPorHora[1].probabilidade, null);
}
checar('ok:false não vira dado', normalizarRespostaClima({ ok: false, motivo: 'clima_indisponivel' }), null);
checar('sem temperatura não vira dado', normalizarRespostaClima({ ...respostaWorker([]), atual: { codigo: 1 } }), null);
checar('chuvaPorHora ausente não vira "sem chuva"', normalizarRespostaClima({ ...respostaWorker([]), chuvaPorHora: undefined }), null);
checar('hora malformada derruba a resposta inteira',
  normalizarRespostaClima({ ...respostaWorker([]), chuvaPorHora: [{ inicio: 'ontem', hora: 'x', probabilidade: 0 }] }), null);
checar('lixo vira null', normalizarRespostaClima('oi'), null);

console.log('\n4) três estados na tela — nunca some calado');
checar('carregando tem texto', textoClima('carregando'), 'Carregando clima…');
checar('falha mostra "Clima indisponível"', textoClima({ ok: false, motivo: 'offline' }), 'Clima indisponível');
checar('sem localização também mostra "Clima indisponível"', textoClima({ ok: false, motivo: 'sem_localizacao' }), 'Clima indisponível');
checar('motivo desconhecido do worker vira clima_indisponivel', motivoDeFalha('xpto'), 'clima_indisponivel');
checar('motivo conhecido passa', motivoDeFalha('muitas_requisicoes'), 'muitas_requisicoes');

console.log('\n5) coordenadas (mesma régua do worker)');
checar('válida', coordenadaValida(-23.55, -46.63), true);
checar('0,0 recusado (GPS sem fix)', coordenadaValida(0, 0), false);
checar('fora do intervalo recusado', coordenadaValida(91, 10), false);
checar('string/NaN/undefined recusados', [coordenadaValida('1' as any, 2), coordenadaValida(NaN, 2), coordenadaValida(undefined, 2)], [false, false, false]);

console.log('\n6) clima.ts — o que só dá para provar lendo');
{
  const bruto = readFileSync(new URL('../src/services/clima.ts', import.meta.url), 'utf8');
  const fonte = bruto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  checar('exporta buscarClima(lat, lon)', /export async function buscarClima\(lat: number, lon: number\)/.test(fonte), true);
  checar('exporta useClimaDoDia', /export function useClimaDoDia\(/.test(fonte), true);
  checar('hook começa em \'carregando\'', /useState<EstadoClima>\('carregando'\)/.test(fonte), true);
  checar('catch do hook leva a falha visível (não fica carregando)', /\.catch\(\(\) => \{\s*if \(vivo\) setEstado\(\{ ok: false/.test(fonte), true);
  checar('sem coordenada → sem_localizacao', /motivo: 'sem_localizacao'/.test(fonte), true);
  checar('nunca PEDE permissão (só consulta)', /requestForegroundPermissionsAsync|requestPermissions/.test(fonte), false);
  checar('consulta permissão já concedida no nativo', /getForegroundPermissionsAsync/.test(fonte), true);
  checar('web só usa geolocalização com permissão granted', /st\.state !== 'granted'/.test(fonte), true);
  checar('expo-location nunca em module-scope', /^import .*expo-location/m.test(fonte), false);
  checar('expo-location só atrás de LOCALIZACAO_DISPONIVEL', fonte.indexOf('if (!LOCALIZACAO_DISPONIVEL) return null') < fonte.indexOf("import('expo-location'"), true);
  checar('chama a rota GET /clima do worker', /\/clima\?\$\{qs\}/.test(fonte), true);
  checar('exporta textoClima para a UI', /export \{ textoClima/.test(fonte), true);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  checar('nenhuma dependência nativa nova (expo-location fora do package.json)',
    'expo-location' in { ...pkg.dependencies, ...pkg.devDependencies }, false);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
if (falhas > 0) process.exit(1);
