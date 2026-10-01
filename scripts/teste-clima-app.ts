/**
 * Teste do clima do dia, lado do app (item 2.5 da Onda 2).
 *
 *     node scripts/teste-clima-app.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * `src/services/climaTexto.ts` não importa nada em runtime, então aqui há
 * COMPORTAMENTO de verdade: validação da resposta do worker (formato MET
 * Norway: mm previstos + símbolo por hora), texto curto ("Chuva prevista às
 * 15h — leve capa"), a atribuição exigida pela CC BY 4.0 ("Previsão: MET
 * Norway") e a regra dura — hora sem mm NUNCA vira "sem chuva". As buscas no
 * fonte de `clima.ts` ficam para o que só dá para provar lendo (3 estados, nada
 * de prompt de permissão, nada de `expo-location` em module-scope) e removem
 * comentários antes.
 */
import { readFileSync } from 'node:fs';
import {
  ATRIBUICAO_CLIMA,
  atribuicaoClima,
  coordenadaValida,
  descricaoTempo,
  horaCurta,
  mmCurto,
  motivoDeFalha,
  normalizarRespostaClima,
  resumoClima,
  simboloEhChuva,
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

/** Horas a partir das 14h local; símbolo padrão 'partlycloudy_day' (null quando mm é null). */
function horas(mms: (number | null)[], inicioHora = 14, simbolos?: (string | null)[]): HoraChuva[] {
  return mms.map((mm, i) => {
    const h = String((inicioHora + i) % 24).padStart(2, '0');
    const simbolo = simbolos ? (simbolos[i] ?? null) : mm === null ? null : 'partlycloudy_day';
    return { inicio: `2026-10-01T${h}:00`, hora: `${h}:00`, mm, simbolo };
  });
}

/** Resposta do worker como `worker/src/clima.js` monta (ver teste-clima.js). */
function respostaWorker(mms: (number | null)[], simbolos?: (string | null)[]) {
  return {
    ok: true,
    fonte: 'MET Norway',
    licenca: 'CC BY 4.0',
    local: { geohash: '6gycf', lat: -23.55, lon: -46.63 },
    fuso: 'America/Sao_Paulo',
    atual: { temperatura: 27.4, simbolo: 'partlycloudy_day', ehDia: true, medidoEm: '2026-10-01T14:00' },
    hoje: { data: '2026-10-01', max: 31.2, min: 18.6 },
    chuvaPorHora: horas(mms, 14, simbolos),
    atualizadoEm: '2026-10-01T17:20:00.000Z',
    cache: false,
  };
}

const DOZE_SECAS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const NUBLADO = (n: number) => Array.from({ length: n }, () => 'cloudy');

console.log('\n1) texto curto (mm previstos + símbolo, nunca "%")');
checar('≥0,5 mm → "Chuva prevista às 15h — leve capa"',
  resumoClima({ temperatura: 27, simbolo: 'cloudy', max: 31, chuvaPorHora: horas([0, 1.2, 3], 14, NUBLADO(3)) }),
  'Chuva prevista às 15h — leve capa');
checar('símbolo de chuva (mesmo com pouco mm) → "Chuva prevista às 16h — leve capa"',
  resumoClima({ temperatura: 27, simbolo: 'cloudy', max: 31, chuvaPorHora: horas([0, 0, 0.1], 14, ['cloudy', 'cloudy', 'lightrainshowers_day']) }),
  'Chuva prevista às 16h — leve capa');
checar('0,1–0,4 mm sem símbolo de chuva → "Pode chover às 16h (0,2 mm)"',
  resumoClima({ temperatura: 27, simbolo: 'cloudy', max: 31, chuvaPorHora: horas([0, 0, 0.2], 14, NUBLADO(3)) }),
  'Pode chover às 16h (0,2 mm)');
checar('símbolo de agora é chuva → "Chuva prevista agora — leve capa"',
  resumoClima({ temperatura: 21, simbolo: 'rain', max: 24, chuvaPorHora: horas([2.5], 14, ['rain']) }),
  'Chuva prevista agora — leve capa');
checar('trovoada também é chuva',
  resumoClima({ temperatura: 21, simbolo: 'heavyrainandthunder', max: 24, chuvaPorHora: horas([0]) }),
  'Chuva prevista agora — leve capa');
checar('janela inteira com mm conhecido e seca → "Sem chuva prevista nas próximas 12h · 27°"',
  resumoClima({ temperatura: 27.4, simbolo: 'fair_day', max: 31, chuvaPorHora: horas(DOZE_SECAS) }),
  'Sem chuva prevista nas próximas 12h · 27°');
checar('REGRA DURA: uma hora sem mm → NÃO afirma "sem chuva", fala só a temperatura',
  resumoClima({ temperatura: 27.4, simbolo: 'fair_day', max: 31.2, chuvaPorHora: horas([0, null, 0]) }),
  '27° agora · máx 31°');
checar('janela vazia não vira "sem chuva"',
  resumoClima({ temperatura: 27.4, simbolo: 'fair_day', max: null, chuvaPorHora: [] }),
  '27° agora');
checar('null de mm não conta como 0 para o limiar',
  resumoClima({ temperatura: 20, simbolo: 'cloudy', max: 22, chuvaPorHora: horas([null, null, 0.8], 14, [null, null, 'cloudy']) }),
  'Chuva prevista às 16h — leve capa');
checar('símbolo de chuva com 0 mm NÃO vira "Sem chuva prevista"',
  resumoClima({
    temperatura: 27.4, simbolo: 'fair_day', max: 31,
    chuvaPorHora: horas(DOZE_SECAS, 14, ['fair_day', 'fair_day', 'fair_day', 'fair_day', 'rainshowers_day', ...NUBLADO(7)]),
  }),
  'Chuva prevista às 18h — leve capa');
checar('o texto nunca fala em porcentagem',
  /%/.test(resumoClima({ temperatura: 27, simbolo: 'cloudy', max: 31, chuvaPorHora: horas([0, 0.3], 14, NUBLADO(2)) })),
  false);

console.log('\n2) peças do texto');
checar('horaCurta 15:00 → 15h', horaCurta('15:00'), '15h');
checar('horaCurta 09:30 → 9h30', horaCurta('09:30'), '9h30');
checar('mmCurto 0.2 → "0,2 mm"', mmCurto(0.2), '0,2 mm');
checar('partlycloudy_day → Parcialmente nublado', descricaoTempo('partlycloudy_day'), 'Parcialmente nublado');
checar('clearsky_night → Céu limpo', descricaoTempo('clearsky_night'), 'Céu limpo');
checar('lightrain → Chuva fraca', descricaoTempo('lightrain'), 'Chuva fraca');
checar('heavyrainshowers_day → Pancadas fortes', descricaoTempo('heavyrainshowers_day'), 'Pancadas fortes');
checar('rainandthunder → Trovoada', descricaoTempo('rainandthunder'), 'Trovoada');
checar('fog → Neblina', descricaoTempo('fog'), 'Neblina');
checar('símbolo desconhecido NÃO vira "Céu limpo"', descricaoTempo('xpto'), 'Tempo variável');
checar('rain/shower/thunder/sleet são chuva',
  ['rain', 'lightrain', 'heavyrainshowers_day', 'rainandthunder', 'lightsleet', 'sleetshowers_night'].every(simboloEhChuva), true);
checar('limpo/nublado/neblina/null não são chuva',
  ['clearsky_day', 'fair_night', 'partlycloudy_day', 'cloudy', 'fog'].some(simboloEhChuva) || simboloEhChuva(null), false);

console.log('\n3) resposta do worker');
{
  const d = normalizarRespostaClima(respostaWorker([0, 1.4, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  checar('resposta válida vira DadosClima ok', d?.ok, true);
  checar('temperatura/máx/mín preservadas', [d?.temperatura, d?.max, d?.min], [27.4, 31.2, 18.6]);
  checar('12 horas de chuva', d?.chuvaPorHora.length, 12);
  checar('resumo pronto', d?.resumo, 'Chuva prevista às 15h — leve capa');
  checar('descrição derivada do símbolo', d?.descricao, 'Parcialmente nublado');
  checar('ehDia preservado', d?.ehDia, true);
  checar('atribuição CC BY 4.0 na resposta', d?.atribuicao, 'Previsão: MET Norway');
}
{
  const d = normalizarRespostaClima(respostaWorker([0, null, 0]));
  checar('mm null sobrevive como null (não 0)', d?.chuvaPorHora[1].mm, null);
  checar('símbolo null sobrevive como null', d?.chuvaPorHora[1].simbolo, null);
}
{
  const r = respostaWorker([0]);
  const d = normalizarRespostaClima({ ...r, atual: { ...r.atual, simbolo: 'rain', ehDia: null } });
  checar('ehDia desconhecido fica null (não chuta dia)', d?.ehDia, null);
  const neg = normalizarRespostaClima({ ...r, chuvaPorHora: [{ inicio: '2026-10-01T14:00', hora: '14:00', mm: -1, simbolo: 'cloudy' }] });
  checar('mm negativo vira null, não "seco"', neg?.chuvaPorHora[0].mm, null);
}
checar('ok:false não vira dado', normalizarRespostaClima({ ok: false, motivo: 'clima_indisponivel' }), null);
checar('sem temperatura não vira dado', normalizarRespostaClima({ ...respostaWorker([]), atual: { simbolo: 'cloudy' } }), null);
checar('sem símbolo não vira dado', normalizarRespostaClima({ ...respostaWorker([]), atual: { temperatura: 20 } }), null);
checar('worker antigo (codigo/probabilidade) não vira previsão fantasma',
  normalizarRespostaClima({ ...respostaWorker([]), atual: { temperatura: 20, codigo: 2, ehDia: true } }), null);
checar('chuvaPorHora ausente não vira "sem chuva"', normalizarRespostaClima({ ...respostaWorker([]), chuvaPorHora: undefined }), null);
checar('hora malformada derruba a resposta inteira',
  normalizarRespostaClima({ ...respostaWorker([]), chuvaPorHora: [{ inicio: 'ontem', hora: 'x', mm: 0 }] }), null);
checar('lixo vira null', normalizarRespostaClima('oi'), null);

console.log('\n4) três estados na tela — nunca some calado');
checar('carregando tem texto', textoClima('carregando'), 'Carregando clima…');
checar('falha mostra "Clima indisponível"', textoClima({ ok: false, motivo: 'offline' }), 'Clima indisponível');
checar('sem localização também mostra "Clima indisponível"', textoClima({ ok: false, motivo: 'sem_localizacao' }), 'Clima indisponível');
checar('motivo desconhecido do worker vira clima_indisponivel', motivoDeFalha('xpto'), 'clima_indisponivel');
checar('motivo conhecido passa', motivoDeFalha('muitas_requisicoes'), 'muitas_requisicoes');

console.log('\n5) atribuição (CC BY 4.0)');
checar('constante "Previsão: MET Norway"', ATRIBUICAO_CLIMA, 'Previsão: MET Norway');
checar('sem argumento devolve o crédito', atribuicaoClima(), 'Previsão: MET Norway');
{
  const d = normalizarRespostaClima(respostaWorker(DOZE_SECAS));
  checar('com previsão na tela devolve o crédito', d ? atribuicaoClima(d) : 'sem dados', 'Previsão: MET Norway');
}
checar('carregando/falha não creditam dado que não está na tela',
  [atribuicaoClima('carregando'), atribuicaoClima({ ok: false, motivo: 'offline' })], [null, null]);

console.log('\n6) coordenadas (mesma régua do worker)');
checar('válida', coordenadaValida(-23.55, -46.63), true);
checar('0,0 recusado (GPS sem fix)', coordenadaValida(0, 0), false);
checar('fora do intervalo recusado', coordenadaValida(91, 10), false);
checar('string/NaN/undefined recusados', [coordenadaValida('1' as any, 2), coordenadaValida(NaN, 2), coordenadaValida(undefined, 2)], [false, false, false]);

console.log('\n7) clima.ts — o que só dá para provar lendo');
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
  checar('exporta textoClima para a UI', /export \{\s*textoClima/.test(fonte), true);
  checar('exporta atribuicaoClima para a UI', /export \{[^}]*\batribuicaoClima\b[^}]*\} from '\.\/climaTexto'/.test(fonte), true);
  checar('nada de Open-Meteo no app', /open-meteo/i.test(bruto), false);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  checar('nenhuma dependência nativa nova (expo-location fora do package.json)',
    'expo-location' in { ...pkg.dependencies, ...pkg.devDependencies }, false);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
if (falhas > 0) process.exit(1);
