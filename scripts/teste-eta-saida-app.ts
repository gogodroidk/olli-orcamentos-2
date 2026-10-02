/**
 * Teste do LADO DO APP do "a que horas eu preciso SAIR" — versão GRÁTIS (Onda I2).
 *
 *     node scripts/teste-eta-saida-app.ts
 * Exit 0 = passou; 1 = falhou. O exit code é a prova.
 *
 * Desde 01/10/2026 a hora de sair é ESTIMADA no aparelho (`etaEstimado.ts`), sem
 * Google: as coordenadas dos clientes + a base da empresa localizada uma vez pelo
 * serviço grátis. O que quebra CALADO aqui, e por isso está preso:
 *
 *  (a) **Um número sem rótulo.** Toda frase com horário diz "estimativa, sem
 *      trânsito". Nunca "com trânsito".
 *  (b) **"Não sei" virando "não tem".** Falta de local (`endereco_insuficiente`,
 *      dizendo QUAL) e falha de cálculo (`indisponivel`) são estados diferentes.
 *  (c) **A origem errada com cara de certa.** Visita anterior sem local NÃO cai
 *      para a base; visita marcada em OUTRO endereço não usa o ponto do cliente.
 *
 * O miolo (`saidaCalculo.ts`) só importa módulos puros: aqui roda COMPORTAMENTO.
 * As buscas no fonte ficam para o que só dá para provar lendo, sem comentários.
 */
import { readFileSync } from 'node:fs';
import {
  enderecoDaEmpresa,
  enderecoDoAgendamento,
  enderecoDoCliente,
  estimarSaida,
  fraseSaida,
  hhmm,
  janelaChegada,
  linhaBomDiaSaida,
  origemParaVisita,
  pontoDoAgendamento,
  pontoDoCliente,
  rotuloEstimativa,
  textoEnderecoInsuficiente,
  textoIndisponivel,
  textoNotificacaoSaida,
  type PontoVisita,
  type SaidaOk,
} from '../src/services/saidaCalculo.ts';

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

function ler(caminho: string): string {
  return readFileSync(new URL(caminho, import.meta.url), 'utf8');
}

/** "a" e "b" existem no fonte e "a" vem antes (as duas pontas precisam existir). */
function checarOrdem(nome: string, src: string, a: string, b: string): void {
  const ia = src.indexOf(a);
  const ib = src.indexOf(b);
  checar(nome, ia >= 0 && ib >= 0 && ia < ib, true);
}

function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// ─── Cenário: quarta 07/10/2026, 10h; visita às 15h ────────────────────────
const AGORA = new Date(2026, 9, 7, 10, 0, 0);
const VISITA_15H = new Date(2026, 9, 7, 15, 0, 0);

function ag(over: Partial<Record<string, unknown>> = {}): any {
  return {
    id: 'a1', clienteId: 'c1', clienteNome: 'João Silva', titulo: 'Manutenção', tipo: 'manutencao',
    inicio: VISITA_15H.toISOString(), status: 'agendado',
    criadoEm: AGORA.toISOString(), atualizadoEm: AGORA.toISOString(), ...over,
  };
}

function cli(over: Partial<Record<string, unknown>> = {}): any {
  return {
    id: 'c1', nome: 'João Silva', telefone: '11999999999', endereco: 'Rua das Flores, 123',
    cidade: 'Santo André', estado: 'SP', lat: -23.6639, lon: -46.5383, geoPrecisao: 'numero',
    criadoEm: AGORA.toISOString(), ...over,
  };
}

const BASE: PontoVisita = { lat: -23.5505, lon: -46.6333, precisao: 'rua' }; // centro de SP
const EMPRESA: any = { endereco: 'Av. Paulista, 1000', cidade: 'São Paulo', estado: 'SP' };

console.log('\n1) DE ONDE ELE SAI — visita anterior ou base, sem GPS');
{
  const c1 = cli();
  const c2 = cli({ id: 'c2', endereco: 'Rua B, 20', lat: -23.6, lon: -46.6 });
  const manha = ag({ id: 'm', clienteId: 'c2', inicio: new Date(2026, 9, 7, 9, 0).toISOString() });
  const alvo = ag();
  const o = origemParaVisita(alvo, [manha, alvo], BASE, [c1, c2]);
  checar('visita anterior do dia é a origem', o?.de, 'visita_anterior');
  checar('e o ponto é o do cliente anterior', [o?.ponto.lat, o?.ponto.lon], [-23.6, -46.6]);
  checar('primeira do dia sai da base', origemParaVisita(alvo, [alvo], BASE, [c1])?.de, 'base');
  checar('sem base e primeira do dia → null', origemParaVisita(alvo, [alvo], null, [c1]), null);
  const semLocal = ag({ id: 'm', clienteId: 'c3', inicio: new Date(2026, 9, 7, 9, 0).toISOString() });
  checar('visita anterior SEM local → null (não cai para a base)', origemParaVisita(alvo, [semLocal, alvo], BASE, [c1, cli({ id: 'c3', lat: undefined, lon: undefined })]), null);
  const cancelada = ag({ id: 'x', status: 'cancelado', clienteId: 'c2', inicio: new Date(2026, 9, 7, 9, 0).toISOString() });
  checar('visita cancelada não é origem', origemParaVisita(alvo, [cancelada, alvo], BASE, [c1, c2])?.de, 'base');
}

console.log('\n2) O PONTO DA VISITA — nunca o lugar errado');
checar('cliente com coordenada → ponto', pontoDoAgendamento(ag(), [cli()]), { lat: -23.6639, lon: -46.5383, precisao: 'numero' });
checar('cliente sem coordenada → null', pontoDoAgendamento(ag(), [cli({ lat: undefined, lon: undefined })]), null);
checar('ponto só da cidade não serve para hora de sair', pontoDoCliente(cli({ geoPrecisao: 'cidade' })), null);
checar('ponto pelo CEP serve (é aproximado)', pontoDoCliente(cli({ geoPrecisao: 'cep' }))?.precisao, 'cep');
checar('visita em OUTRO endereço não usa o ponto do cliente', pontoDoAgendamento(ag({ endereco: 'Av. Brasil, 500' }), [cli()]), null);
checar('visita no mesmo endereço (com complemento) usa o ponto', pontoDoAgendamento(ag({ endereco: 'Rua das Flores, 123 - fundos' }), [cli()])?.precisao, 'numero');
checar('sem cliente → null', pontoDoAgendamento(ag({ clienteId: undefined }), [cli()]), null);
checar('visita com endereço próprio sem logradouro não herda o ponto do cadastro', pontoDoAgendamento(ag({ endereco: ', Centro, Santo André' }), [cli()]), null);

console.log('\n3) A CONTA — estimativa com folga');
const destino = pontoDoAgendamento(ag(), [cli()]);
const r = estimarSaida({ origem: { ponto: BASE, de: 'base' }, destino, chegarEm: VISITA_15H, agora: AGORA });
checar('estado ok', r.estado, 'ok');
const ok = r as SaidaOk;
checar('é estimativa', ok.estimado, true);
checar('sai = chega − viagem − folga', ok.sairEm.getTime(), VISITA_15H.getTime() - (ok.minutos + ok.folgaMin) * 60_000);
checar('folga >= 8 min', ok.folgaMin >= 8, true);
checar('não atrasado', ok.atrasado, false);
checar('origem dita', ok.origemDe, 'base');
checar('pontos exatos → não aproximado', ok.aproximado, false);
const tarde = estimarSaida({ origem: { ponto: BASE, de: 'base' }, destino, chegarEm: new Date(2026, 9, 7, 10, 15), agora: AGORA });
checar('visita daqui a 15 min → atrasado (sucesso desconfortável, não erro)', tarde.estado === 'ok' && tarde.atrasado, true);
const aprox = estimarSaida({ origem: { ponto: BASE, de: 'base' }, destino: { ...BASE, lat: -23.6, precisao: 'cep' }, chegarEm: VISITA_15H, agora: AGORA });
checar('ponto pelo CEP marca aproximado', aprox.estado === 'ok' && aprox.aproximado, true);

console.log('\n4) OS TRÊS ESTADOS — nenhum número sem local');
checar('sem origem → origem', estimarSaida({ origem: null, destino, chegarEm: VISITA_15H, agora: AGORA }), { estado: 'endereco_insuficiente', qual: 'origem' });
checar('sem destino → destino', estimarSaida({ origem: { ponto: BASE, de: 'base' }, destino: null, chegarEm: VISITA_15H, agora: AGORA }), { estado: 'endereco_insuficiente', qual: 'destino' });
checar('sem os dois → ambos', estimarSaida({ origem: null, destino: null, chegarEm: VISITA_15H, agora: AGORA }), { estado: 'endereco_insuficiente', qual: 'ambos' });
checar('visita no passado → indisponivel', estimarSaida({ origem: { ponto: BASE, de: 'base' }, destino, chegarEm: new Date(2026, 9, 7, 9), agora: AGORA }), { estado: 'indisponivel', erro: 'chegar_em_passado' });
checar('horário ilegível → indisponivel', estimarSaida({ origem: { ponto: BASE, de: 'base' }, destino, chegarEm: new Date(Number.NaN), agora: AGORA }), { estado: 'indisponivel', erro: 'horario_invalido' });
checar('2.700 km entre visitas → endereço errado, não viagem', estimarSaida({ origem: { ponto: BASE, de: 'base' }, destino: { lat: -3.1, lon: -60, precisao: 'rua' }, chegarEm: VISITA_15H, agora: AGORA }), { estado: 'endereco_insuficiente', qual: 'ambos' });

console.log('\n5) O QUE ELE LÊ — sempre "estimativa, sem trânsito"');
checar('rótulo', rotuloEstimativa({ aproximado: false }), 'estimativa, sem trânsito');
checar('rótulo aproximado', rotuloEstimativa({ aproximado: true }), 'estimativa, sem trânsito, local aproximado');
checar('frase', fraseSaida(ok), `Saia às ${hhmm(ok.sairEm)} para chegar às 15:00 · ~${ok.minutos} min (estimativa, sem trânsito)`);
checar('frase atrasada fala da chegada real', tarde.estado === 'ok' && fraseSaida(tarde).startsWith('Era para sair às'), true);
checar('nenhuma frase diz "com trânsito"', /com trânsito/.test(fraseSaida(ok) + linhaBomDiaSaida(ok) + textoNotificacaoSaida(ok, ag()).corpo), false);
checar('notificação', textoNotificacaoSaida(ok, ag()), { titulo: `Saia às ${hhmm(ok.sairEm)}`, corpo: `João Silva às 15:00 · ~${ok.minutos} min, estimativa, sem trânsito` });
checar('Bom dia ganha a linha', linhaBomDiaSaida(ok), `saia às ${hhmm(ok.sairEm)} (~${ok.minutos} min, estimativa, sem trânsito)`);
checar('Bom dia sem número sai como antes', linhaBomDiaSaida({ estado: 'indisponivel', erro: 'x' }), null);
checar('Bom dia não manda sair no passado', tarde.estado === 'ok' ? linhaBomDiaSaida(tarde) : 'x', null);
checar('falha com aviso na fila aponta para ele', textoIndisponivel(true), 'Não deu para estimar agora. Vale o horário calculado antes.');
checar('falha sem aviso aponta para o lembrete de 1h', textoIndisponivel(false), 'Não deu para estimar a hora de sair. Vale o lembrete de 1h antes.');
checar('diz QUAL local falta (destino)', textoEnderecoInsuficiente('destino').includes('Esta visita'), true);
checar('diz QUAL local falta (origem)', textoEnderecoInsuficiente('origem').includes('Meu negócio'), true);

console.log('\n6) AVISAR O CLIENTE — janela larga (é estimativa)');
{
  const j = janelaChegada(VISITA_15H, 30);
  checar('30 min de viagem → ±10 min (piso)', j ? [hhmm(j.de), hhmm(j.ate)] : null, ['14:50', '15:10']);
  const j2 = janelaChegada(VISITA_15H, 200);
  checar('teto de 30 min', j2 ? [hhmm(j2.de), hhmm(j2.ate)] : null, ['14:30', '15:30']);
  checar('minutos ilegíveis → sem janela', janelaChegada(VISITA_15H, Number.NaN), null);
}

console.log('\n7) ENDEREÇO EM TEXTO — continua servindo o link do Maps e a base');
checar('empresa com rua', enderecoDaEmpresa(EMPRESA), 'Av. Paulista, 1000, São Paulo/SP');
checar('empresa sem rua → null (centro da cidade não é a base)', enderecoDaEmpresa({ ...EMPRESA, endereco: '' }), null);
checar('cliente com CEP no meio', enderecoDoCliente(cli({ cep: '09010000' })), 'Rua das Flores, 123, 09010-000, Santo André/SP');
checar('o próprio endereço da visita vence', enderecoDoAgendamento(ag({ endereco: 'Av. Brasil, 500' }), [cli()]), 'Av. Brasil, 500');

const aviso = semComentarios(ler('../src/services/avisoSaida.ts'));
const etaSaidaSrc = semComentarios(ler('../src/services/etaSaida.ts'));
const calculoSrc = semComentarios(ler('../src/services/saidaCalculo.ts'));
const etaSrc = semComentarios(ler('../src/services/eta.ts'));
const agendaSrc = semComentarios(ler('../src/services/agenda.ts'));
const ritualSrc = semComentarios(ler('../src/services/ritualDiario.ts'));
const cardSrc = semComentarios(ler('../src/components/AvisoSaidaCard.tsx'));
const chipSrc = semComentarios(ler('../src/components/EtaChip.tsx'));

console.log('\n8) GRÁTIS — nada de Google, nada de chamada paga');
for (const [nome, src] of [['saidaCalculo', calculoSrc], ['etaSaida', etaSaidaSrc], ['avisoSaida', aviso], ['eta', etaSrc], ['ritualDiario', ritualSrc]] as const) {
  checar(`${nome} não fala com o Google`, /googleapis\.com|OLLI_ROUTES_API_KEY|\/eta\/saida|\/geocodificar/.test(src), false);
}
checar('eta.ts não chama o worker para ETA', /fetch\(/.test(etaSrc), false);
checar('a base é localizada pelo /geo grátis (cep.ts)', /geocodificarEndereco/.test(etaSaidaSrc) && etaSaidaSrc.includes("from './cep'"), true);
checar('o miolo só importa módulos puros', /^\s*import\s+(?!type\b)[^\n]*from '(?!\.\.\/utils\/geoCliente\.ts|\.\/etaEstimado\.ts)/m.test(calculoSrc), false);

console.log('\n9) NÃO PEDE LOCALIZAÇÃO — a origem vem do cadastro');
for (const [nome, src] of [['saidaCalculo', calculoSrc], ['etaSaida', etaSaidaSrc], ['avisoSaida', aviso], ['AvisoSaidaCard', cardSrc]] as const) {
  checar(`${nome} não importa expo-location`, src.includes('expo-location'), false);
  checar(`${nome} não pede permissão de localização`, /requestForegroundPermissions|getCurrentPositionAsync|navigator\.geolocation/.test(src), false);
}
checar('eta.ts só importa expo-location de forma dinâmica', /^import[^\n]*expo-location/m.test(etaSrc), false);

console.log('\n10) O FALLBACK — o lembrete fixo de 1h só cai quando há número');
const corpoOkAviso = (() => {
  const i = aviso.indexOf("if (resultado.estado === 'ok'");
  return i < 0 ? '' : aviso.slice(i, aviso.indexOf('await gravarRegistro', i));
})();
checar('o ramo de sucesso foi localizado', corpoOkAviso.length > 0, true);
checar('o lembrete fixo só é substituído DENTRO do ramo ok', corpoOkAviso.includes('substituirLembreteFixo'), true);
checar('e em nenhum outro lugar', aviso.split('substituirLembreteFixo(').length - 1, 2);
checar('agendar notificação só no ramo ok', aviso.split('scheduleNotificationAsync').length - 1, 1);
checarOrdem('só substitui DEPOIS de o aviso novo estar agendado', corpoOkAviso, 'scheduleNotificationAsync', 'substituirLembreteFixo');
checar('não notifica quando a hora de sair já passou', /!resultado\.atrasado/.test(corpoOkAviso), true);
checar('só cancela em bloco quando a parada MUDOU', /if \(!mesmaParada\) await cancelarAvisoSaida\(\);/.test(aviso), true);
checar('o aviso da mesma parada é HERDADO enquanto não há número novo', /notifId: mesmaParada \? anterior\?\.notifId : undefined/.test(aviso), true);
checar('este módulo nunca PEDE permissão de notificação', /requestPermissionsAsync|pedirPermissaoNotificacao/.test(aviso), false);
checar('salvar um agendamento derruba o aviso calculado', /saveAgendamento[\s\S]{0,900}cancelarAvisoSaida\(a\.id\)/.test(agendaSrc), true);
checar('excluir também', /deleteAgendamento[\s\S]{0,400}cancelarAvisoSaida\(id\)/.test(agendaSrc), true);
checar('o lembrete fixo de 1h continua existindo', /MINUTOS_ANTECEDENCIA_LEMBRETE = 60/.test(agendaSrc), true);
checar('o throttle é COMPARADO, não só declarado', /idade\s*<\s*THROTTLE_MS/.test(aviso), true);
checar('o throttle só é ignorado sob toque explícito (`forcar`)', /!d\.forcar\s*&&\s*mesmaParada/.test(aviso), true);

console.log('\n11) A TELA — três estados, rótulo e gate Pro');
checar('o card trata os três estados', /estado === 'ok'/.test(cardSrc) && /endereco_insuficiente/.test(cardSrc) && /textoIndisponivel/.test(cardSrc), true);
checar('sem registro, o card não aparece (nada foi tentado)', /if \(!aviso\) return null;/.test(cardSrc), true);
checar('a falha consulta se há aviso agendado antes de falar', /textoIndisponivel\(aviso\.avisoAgendado\)/.test(cardSrc), true);
checar('o card não calcula sozinho', /calcularSaida|reagendarAvisoSaida/.test(cardSrc), false);
checar('o chip do ETA mostra o rótulo de estimativa', chipSrc.includes('ROTULO_ESTIMATIVA'), true);
checar('o chip trata "visita sem local no mapa"', chipSrc.includes("'sem_destino'"), true);
checar('os dois passam pelo gate de hora de sair', /RecursoPlanoChip recurso="hora_de_sair"/.test(cardSrc) && /RecursoPlanoChip recurso="hora_de_sair"/.test(chipSrc), true);
checar('ETA sem o recurso confirmado não estima', /acessoRecursoAgora\('hora_de_sair'\)\)\s*!==\s*'liberado'\) return \{ estado: 'indisponivel' \}/.test(etaSrc), true);

console.log('\n12) O RITUAL — reusa o mecanismo, com a base');
checar('o aviso roda no reagendamento do ritual', /reagendarAvisoSaidaDoDia\(\)/.test(ritualSrc), true);
checar('o ritual localiza a base antes de calcular', /pontoDaBase\(empresa\)/.test(ritualSrc), true);
checarOrdem('roda ANTES do return dos toggles do ritual', ritualSrc, 'reagendarAvisoSaidaDoDia()', 'if (!bomDiaAtivo && !fecharDiaAtivo) return');
checar('o Bom dia não ganha notificação nova', ritualSrc.split('scheduleNotificationAsync').length - 1, 2);
const bomDiaSrc = (() => {
  const i = ritualSrc.indexOf('async function linhaDeSaidaParaBomDia');
  return i < 0 ? '' : ritualSrc.slice(i, ritualSrc.indexOf('export async function reagendarAvisoSaidaDoDia', i));
})();
checar('a linha "saia às" do Bom dia passa pelo gate Pro (hora_de_sair)', /acessoRecursoAgora\('hora_de_sair'\)\)\s*!==\s*'liberado'\) return null/.test(bomDiaSrc), true);
checar('clientes ilegíveis não viram "sem local no mapa" (ritual)', /getClientes\(\)\.catch\(\(\) => \[\]/.test(ritualSrc), false);
checar('base offline vira indisponível, não "falta endereço"', /baseIndisponivel: base\.estado === 'indisponivel'/.test(ritualSrc) && /base_indisponivel/.test(etaSaidaSrc), true);

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'} — ${passes} asserções ok, ${falhas} falhas`);
process.exit(falhas === 0 ? 0 : 1);
