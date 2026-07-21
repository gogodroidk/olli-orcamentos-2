/**
 * Teste do LADO DO APP do "a que horas eu preciso SAIR" (Fase 1).
 *
 *     node scripts/teste-eta-saida-app.ts
 * Exit 0 = passou; 1 = falhou. O exit code é a prova.
 *
 * A Fase 0 (worker) já tem `teste-eta-saida.ts`. Este arquivo cobre a metade
 * que o outro não alcança: o que o APP faz com a resposta, de onde ele tira os
 * endereços, e o que ele mostra quando não dá para calcular.
 *
 * POR QUE ELE EXISTE — três coisas quebram aqui, e as três quebram CALADAS:
 *
 *  (a) **Uma hora de sair inventada.** Se um `ok:true` sem número virar
 *      `estado:'ok'`, o app agenda "Saia às 14:23" em cima de nada e o
 *      prestador chega atrasado no cliente confiando na OLLI. É pior do que
 *      não ter a função. A seção 3 existe só para prender isso.
 *
 *  (b) **"Não sei" virando "não tem".** `endereco_insuficiente` (corrija o
 *      endereço) e `indisponivel` (espere) levam a ações OPOSTAS. Achatar um
 *      no outro manda o prestador reescrever um endereço que estava certo —
 *      o bug recorrente `olli-gate-erro-vira-vazio`.
 *
 *  (c) **A origem errada com cara de certa.** Se a visita anterior tem
 *      endereço ilegível e o código "salva" o cálculo caindo para o endereço
 *      da empresa, sai um horário perfeitamente formatado, perfeitamente
 *      errado — calculado de um lugar de onde ele não vai sair. A seção 1
 *      prende exatamente esse ramo.
 *
 * COMO: o miolo mora em `src/services/saidaCalculo.ts`, que não importa nada em
 * runtime justamente para o `node` poder executá-lo. Então aqui há
 * COMPORTAMENTO de verdade, não só busca de string no fonte. As buscas no
 * fonte ficam para o que só dá para provar lendo (ordem das operações, gate de
 * permissão, ausência de `expo-location`) — e removem comentários antes,
 * senão o teste ateste a prosa em vez do código.
 */
import { readFileSync } from 'node:fs';
import {
  cacheValido,
  carimboCurto,
  chaveTrajeto,
  enderecoDaEmpresa,
  enderecoDoAgendamento,
  enderecoDoCliente,
  fraseSaida,
  hhmm,
  interpretarResposta,
  janelaChegada,
  linhaBomDiaSaida,
  montarSaida,
  origemParaVisita,
  rotuloTransito,
  textoEnderecoInsuficiente,
  textoIndisponivel,
  textoNotificacaoSaida,
  type DuracaoCacheada,
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

/**
 * "`a` aparece no fonte, `b` também, e `a` vem antes".
 *
 * Existe porque a versão ingênua (`src.indexOf(a) < src.indexOf(b)`) tem um
 * buraco que o mutation check encontrou: quando `a` é APAGADO, `indexOf`
 * devolve -1, `-1 < qualquer coisa` é verdadeiro, e a asserção passa
 * comemorando justamente a remoção da regra que ela deveria proteger. Ordem só
 * significa alguma coisa se as duas pontas existirem.
 */
function checarOrdem(nome: string, src: string, a: string, b: string): void {
  const ia = src.indexOf(a);
  const ib = src.indexOf(b);
  checar(nome, ia >= 0 && ib >= 0 && ia < ib, true);
}

/**
 * Tira comentários. Comentário NÃO é código — e aqui isso não é preciosismo:
 * estes arquivos são densos de comentário (a regra mora no comentário), e quase
 * toda busca por `'ok'`, `modo` ou `expo-location` casaria primeiro com a prosa
 * que descreve a regra, atestando o texto em vez do comportamento. Simplório de
 * propósito (não é um parser): serve para os trechos analisados aqui.
 */
function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// ─── Cenário fixo ──────────────────────────────────────────────────────────
// SÁBADO, 18/07/2026 (conferido com `new Date(2026,6,18).getDay() === 6`, não
// presumido — a primeira versão deste arquivo dizia "sexta" e a asserção de
// tipo de dia caiu por isso; o mesmo engano está no comentário de
// `teste-eta-saida.ts`, do worker). "Agora" são 10h; a visita é às 15h. É o
// caso do documento: de manhã, decidir a que horas sair para a tarde — e
// sábado é dia de trabalho para boa parte do público.
const AGORA = new Date(2026, 6, 18, 10, 0, 0);
const VISITA_15H = new Date(2026, 6, 18, 15, 0, 0);

function ag(over: Partial<Record<string, unknown>> = {}): any {
  return {
    id: 'a1', clienteNome: 'João Silva', titulo: 'Manutenção', tipo: 'manutencao',
    inicio: VISITA_15H.toISOString(), status: 'agendado',
    criadoEm: AGORA.toISOString(), atualizadoEm: AGORA.toISOString(),
    endereco: 'Rua das Flores, 123', ...over,
  };
}

function cli(over: Partial<Record<string, unknown>> = {}): any {
  return { id: 'c1', nome: 'João Silva', telefone: '11999999999', criadoEm: AGORA.toISOString(), ...over };
}

const EMPRESA: any = {
  id: 'e1', nome: 'GR Tech', especialidade: '', slogan: '', cnpj: '', cpf: '',
  endereco: 'Av. Paulista, 1000', cidade: 'São Paulo', estado: 'SP',
  telefone: '', whatsapp: '', site: '', email: '', chavePix: '', normas: '', nomePrestador: '',
};

/** Duração como se tivesse acabado de vir da Routes API. */
function dur(over: Partial<DuracaoCacheada> = {}): DuracaoCacheada {
  return {
    minutos: 32, minutosSemTransito: 27, distanciaKm: 18.4, folgaMin: 5,
    comTransito: true, calculadoEm: AGORA.toISOString(), ...over,
  };
}

console.log('\n1) DE ONDE ELE SAI — sem GPS, sem permissão nova (Desenho A)');
// A feature inteira depende disto: se a origem vier errada, o horário sai
// errado e o app não tem como saber.
checar(
  'primeira visita do dia → sai do endereço da EMPRESA',
  origemParaVisita(ag(), [ag()], EMPRESA, []),
  { endereco: 'Av. Paulista, 1000, São Paulo/SP', de: 'empresa' },
);
checar(
  'com visita anterior no mesmo dia → sai de LÁ, não da empresa',
  origemParaVisita(
    ag({ id: 'a2', inicio: new Date(2026, 6, 18, 15, 0).toISOString() }),
    [ag({ id: 'a1', inicio: new Date(2026, 6, 18, 13, 0).toISOString(), endereco: 'Rua A, 10, Santo André/SP' })],
    EMPRESA, [],
  ),
  { endereco: 'Rua A, 10, Santo André/SP', de: 'visita_anterior' },
);
checar(
  'entre duas anteriores, vale a MAIS RECENTE (é de onde ele sai de fato)',
  origemParaVisita(
    ag({ id: 'a3', inicio: new Date(2026, 6, 18, 15, 0).toISOString() }),
    [
      ag({ id: 'a1', inicio: new Date(2026, 6, 18, 9, 0).toISOString(), endereco: 'Rua Cedo, 1, São Paulo/SP' }),
      ag({ id: 'a2', inicio: new Date(2026, 6, 18, 13, 0).toISOString(), endereco: 'Rua Tarde, 2, São Paulo/SP' }),
    ],
    EMPRESA, [],
  ),
  { endereco: 'Rua Tarde, 2, São Paulo/SP', de: 'visita_anterior' },
);
checar(
  'visita anterior CANCELADA não é origem (ele não foi lá)',
  origemParaVisita(
    ag({ id: 'a2', inicio: new Date(2026, 6, 18, 15, 0).toISOString() }),
    [ag({ id: 'a1', inicio: new Date(2026, 6, 18, 13, 0).toISOString(), endereco: 'Rua A, 10', status: 'cancelado' })],
    EMPRESA, [],
  ),
  { endereco: 'Av. Paulista, 1000, São Paulo/SP', de: 'empresa' },
);
// ESTE É O RAMO (c) DO CABEÇALHO. Cair para a empresa aqui produziria um
// horário calculado de um lugar de onde ele comprovadamente não vai sair.
checar(
  'anterior existe mas com endereço ilegível → NULL (jamais cai para a empresa)',
  origemParaVisita(
    ag({ id: 'a2', inicio: new Date(2026, 6, 18, 15, 0).toISOString() }),
    [ag({ id: 'a1', inicio: new Date(2026, 6, 18, 13, 0).toISOString(), endereco: 'ali', clienteId: undefined })],
    EMPRESA, [],
  ),
  null,
);
checar(
  'endereço da anterior vem do CLIENTE quando o agendamento não tem',
  origemParaVisita(
    ag({ id: 'a2', inicio: new Date(2026, 6, 18, 15, 0).toISOString() }),
    [ag({ id: 'a1', inicio: new Date(2026, 6, 18, 13, 0).toISOString(), endereco: '', clienteId: 'c9' })],
    EMPRESA,
    [cli({ id: 'c9', endereco: 'Rua do Cliente, 55', cidade: 'Osasco', estado: 'SP' })],
  ),
  { endereco: 'Rua do Cliente, 55, Osasco/SP', de: 'visita_anterior' },
);
// Cidade/UF sem rua geocodifica para o centroide do município: um ponto que
// existe, responde `ok`, e está a quilômetros de onde ele dorme.
checar('empresa só com cidade/UF (sem rua) → null', enderecoDaEmpresa({ ...EMPRESA, endereco: '' }), null);
checar('empresa sem nada → null', enderecoDaEmpresa(null), null);
checar('visita com início ilegível → null', origemParaVisita(ag({ inicio: 'ontem' }), [], EMPRESA, []), null);

console.log('\n2) ENDEREÇO — o CEP entra, o complemento não');
checar(
  'CEP formatado entra no meio (desambiguador mais forte do Brasil)',
  enderecoDoCliente(cli({ endereco: 'Rua São João, 100', cep: '01310100', cidade: 'São Paulo', estado: 'SP' })),
  'Rua São João, 100, 01310-100, São Paulo/SP',
);
// "fundos", "casa 2", "perto do mercado": não desambiguam nada e derrubam a
// confiança do geocoder.
checar(
  'complemento NÃO entra',
  enderecoDoCliente(cli({ endereco: 'Rua X, 1', complemento: 'fundos, casa 2', cidade: 'Sorocaba', estado: 'SP' })),
  'Rua X, 1, Sorocaba/SP',
);
checar('CEP com dígitos a menos é ignorado (não inventa)', enderecoDoCliente(cli({ endereco: 'Rua X, 1', cep: '0131' })), 'Rua X, 1');
checar('cliente sem rua → null', enderecoDoCliente(cli({ cidade: 'São Paulo', estado: 'SP' })), null);
checar('agendamento prefere o endereço dele mesmo', enderecoDoAgendamento(ag({ endereco: 'Rua Própria, 9' }), [cli({ id: 'c1', endereco: 'Rua do Cadastro, 1' })]), 'Rua Própria, 9');
checar('sem endereço e sem clienteId → null', enderecoDoAgendamento(ag({ endereco: '', clienteId: undefined }), []), null);
checar('sem endereço, clienteId que não existe na lista → null', enderecoDoAgendamento(ag({ endereco: '', clienteId: 'sumiu' }), []), null);

console.log('\n3) OS TRÊS ESTADOS — nenhum caminho produz "ok" sem número da Routes API');
const okCorpo = {
  ok: true, estado: 'ok', minutos: 32, minutosSemTransito: 27, distanciaKm: 18.4,
  folgaMin: 5, comTransito: true, calculadoEm: AGORA.toISOString(),
};
const rOk = interpretarResposta(okCorpo, 200, VISITA_15H, AGORA);
checar('resposta boa → estado ok', rOk.resultado.estado, 'ok');
checar('resposta boa → cacheia a duração', rOk.cachear?.minutos, 32);
// (a) do cabeçalho: um `ok:true` sem número não pode virar sucesso.
for (const [nome, corpo] of [
  ['sem minutos', { ...okCorpo, minutos: undefined }],
  ['minutos = 0', { ...okCorpo, minutos: 0 }],
  ['minutos negativo', { ...okCorpo, minutos: -5 }],
  ['minutos como texto', { ...okCorpo, minutos: '32' }],
  ['minutos NaN', { ...okCorpo, minutos: NaN }],
  ['sem folgaMin', { ...okCorpo, folgaMin: undefined }],
  ['sem calculadoEm', { ...okCorpo, calculadoEm: undefined }],
  ['calculadoEm ilegível', { ...okCorpo, calculadoEm: 'sexta de manhã' }],
] as const) {
  const r = interpretarResposta(corpo, 200, VISITA_15H, AGORA);
  checar(`ok:true ${nome} → NÃO vira ok`, r.resultado.estado, 'indisponivel');
  checar(`ok:true ${nome} → não cacheia lixo`, r.cachear, null);
}
checar('ok:true sem estado:"ok" → indisponivel', interpretarResposta({ ok: true, minutos: 32 }, 200, VISITA_15H, AGORA).resultado.estado, 'indisponivel');
checar('estado:"ok" sem ok:true → indisponivel', interpretarResposta({ estado: 'ok', minutos: 32 }, 200, VISITA_15H, AGORA).resultado.estado, 'indisponivel');

// (b) do cabeçalho: os dois estados de falha NÃO se confundem.
for (const qual of ['origem', 'destino', 'ambos'] as const) {
  checar(
    `endereco_insuficiente(${qual}) preserva QUAL (a ação depende disso)`,
    interpretarResposta({ ok: false, estado: 'endereco_insuficiente', qual }, 200, VISITA_15H, AGORA).resultado,
    { estado: 'endereco_insuficiente', qual },
  );
}
checar(
  'qual desconhecido cai em "ambos", nunca em indisponivel',
  interpretarResposta({ ok: false, estado: 'endereco_insuficiente', qual: 'xpto' }, 200, VISITA_15H, AGORA).resultado,
  { estado: 'endereco_insuficiente', qual: 'ambos' },
);
checar(
  'endereço insuficiente com HTTP 200 continua sendo endereço insuficiente',
  interpretarResposta({ estado: 'endereco_insuficiente', qual: 'destino' }, 200, VISITA_15H, AGORA).resultado.estado,
  'endereco_insuficiente',
);
// O nome do erro é o que a UI usa para saber se dá para tentar de novo.
for (const erro of ['muitas_requisicoes', 'limite_indisponivel', 'cota_mensal', 'geocode_indisponivel', 'eta_nao_configurado']) {
  checar(`erro "${erro}" chega inteiro na UI`, interpretarResposta({ ok: false, estado: 'indisponivel', erro }, 429, VISITA_15H, AGORA).resultado, { estado: 'indisponivel', erro });
}
for (const [nome, corpo, status] of [
  ['corpo null (JSON ilegível)', null, 502],
  ['corpo vazio', {}, 500],
  ['HTML de proxy', 'entre em contato', 503],
  ['array', [], 200],
] as const) {
  const r = interpretarResposta(corpo, status, VISITA_15H, AGORA);
  checar(`${nome} → indisponivel`, r.resultado.estado, 'indisponivel');
  checar(`${nome} → nada cacheado`, r.cachear, null);
}
checar('sem erro nomeado, o status vira o motivo', (interpretarResposta({}, 502, VISITA_15H, AGORA).resultado as any).erro, 'http_502');

console.log('\n4) A CONTA — a que horas sair');
const saida = montarSaida(dur(), VISITA_15H, AGORA, false) as any;
// 15:00 − 32 min de viagem − 5 min de folga = 14:23.
checar('sairEm = chegada − viagem − folga', hhmm(saida.sairEm), '14:23');
checar('chegarEm é o horário marcado', hhmm(saida.chegarEm), '15:00');
checar('atrasado = false quando ainda dá tempo', saida.atrasado, false);
// Chegar 5 min antes é profissional; 10 min atrasado é uma reclamação.
checar('a folga do WORKER é respeitada, não recalculada', saida.folgaMin, 5);
checar('sairAgoraChegaEm = agora + viagem (10:00 + 32)', hhmm(saida.sairAgoraChegaEm), '10:32');
const atrasado = montarSaida(dur({ minutos: 400 }), VISITA_15H, AGORA, false) as any;
checar('hora de sair já passada → atrasado = true', atrasado.atrasado, true);
checar('atrasado NÃO é um quarto estado: continua ok', atrasado.estado, 'ok');
checar('atrasado traz a chegada real se sair agora', hhmm(atrasado.sairAgoraChegaEm), '16:40');
for (const [nome, d] of [
  ['duração 0', dur({ minutos: 0 })],
  ['duração negativa', dur({ minutos: -3 })],
  ['duração ilegível', dur({ minutos: NaN })],
  ['folga negativa', dur({ folgaMin: -1 })],
  ['carimbo ilegível', dur({ calculadoEm: 'agorinha' })],
] as const) {
  checar(`${nome} → indisponivel, nunca um horário`, montarSaida(d, VISITA_15H, AGORA, false).estado, 'indisponivel');
}
// Um valor guardado às 08h não pode dizer às 14h que a chegada é 08h32.
const doCache = montarSaida(dur({ calculadoEm: new Date(2026, 6, 18, 8, 0).toISOString() }), VISITA_15H, AGORA, true) as any;
checar('cache: sairAgoraChegaEm é recalculado a partir de AGORA', hhmm(doCache.sairAgoraChegaEm), '10:32');
checar('cache: o carimbo continua sendo o do cálculo ORIGINAL', hhmm(doCache.calculadoEm), '08:00');
checar('cache: sinalizado como cache', doCache.doCache, true);

console.log('\n5) CACHE — TTL assimétrico de propósito (30 dias × 10 min)');
const h = (n: number) => new Date(AGORA.getTime() - n * 3600 * 1000).toISOString();
checar('planejamento (sem trânsito) de 20 dias ainda vale', cacheValido(h(24 * 20), 'planejamento', AGORA), true);
checar('planejamento de 31 dias não vale mais', cacheValido(h(24 * 31), 'planejamento', AGORA), false);
// Servir trânsito de horas atrás como se fosse o de agora é a forma sofisticada
// de "erro vira vazio" — por isso 10 minutos, não 30.
checar('confirmação (com trânsito) de 5 min vale', cacheValido(new Date(AGORA.getTime() - 5 * 60000).toISOString(), 'confirmacao', AGORA), true);
checar('confirmação de 11 min NÃO vale', cacheValido(new Date(AGORA.getTime() - 11 * 60000).toISOString(), 'confirmacao', AGORA), false);
checar('carimbo no futuro (relógio torto) → inválido', cacheValido(new Date(AGORA.getTime() + 60000).toISOString(), 'confirmacao', AGORA), false);
checar('carimbo ilegível → inválido', cacheValido('ontem', 'planejamento', AGORA), false);

console.log('\n6) CHAVE DO CACHE — o que pode e o que não pode compartilhar balde');
const base = { origem: 'Av. São João, 100', destino: 'Rua B, 2', chegarEm: VISITA_15H, modo: 'confirmacao' as const };
checar(
  'acento e caixa não criam balde novo (pagar 2× pelo mesmo trajeto)',
  chaveTrajeto(base) === chaveTrajeto({ ...base, origem: 'AV. SAO JOAO, 100' }),
  true,
);
// "Av." ≠ "Avenida" fica como miss de propósito: expandir abreviatura é
// adivinhar endereço, e adivinhar endereço é como se chega no lugar errado.
checar('abreviatura NÃO é expandida (miss honesto)', chaveTrajeto(base) === chaveTrajeto({ ...base, origem: 'Avenida São João, 100' }), false);
checar('hora diferente → balde diferente (18h não é 10h)', chaveTrajeto(base) === chaveTrajeto({ ...base, chegarEm: new Date(2026, 6, 18, 18, 0) }), false);
// Sem isto, um número calculado SEM trânsito seria servido como se tivesse
// trânsito — o mesmo defeito de (a), pela porta do cache.
checar('modo diferente → balde diferente (Essentials nunca serve como Pro)', chaveTrajeto(base) === chaveTrajeto({ ...base, modo: 'planejamento' }), false);
// Sábado (18/07) × segunda (20/07): o trânsito das 15h de um não é o do outro.
checar('fim de semana não compartilha balde com dia útil', chaveTrajeto(base) === chaveTrajeto({ ...base, chegarEm: new Date(2026, 6, 20, 15, 0) }), false);
// Já sábado × domingo compartilham de propósito: dois baldes para o mesmo
// padrão de trânsito só fariam o cache errar duas vezes antes de acertar.
checar('sábado e domingo dividem o mesmo balde', chaveTrajeto(base) === chaveTrajeto({ ...base, chegarEm: new Date(2026, 6, 19, 15, 0) }), true);
checar('origem e destino trocados → chave diferente', chaveTrajeto(base) === chaveTrajeto({ ...base, origem: base.destino, destino: base.origem }), false);

console.log('\n7) O QUE ELE LÊ NA TELA — copy derivada da fonte');
checar('a frase que o dono pediu', fraseSaida(saida, AGORA), 'Saia às 14:23 para chegar às 15:00 · 32 min com trânsito');
// O modo barato NÃO olha o trânsito. Dizer isso na cara do usuário é o que
// torna a economia honesta em vez de uma mentira por omissão.
const planejado = montarSaida(dur({ comTransito: false, minutosSemTransito: null }), VISITA_15H, AGORA, false) as any;
checar('sem trânsito é rotulado como tal', rotuloTransito(planejado), 'sem trânsito');
checar('a frase carrega o rótulo', fraseSaida(planejado, AGORA).includes('sem trânsito'), true);
checar('atrasado muda o tempo verbal e oferece a chegada real', fraseSaida(atrasado, AGORA), 'Era para sair às 08:15 · saindo agora você chega 16:40');
// Um ETA de 6 horas atrás mostrado como atual é mentira em potência; um carimbo
// em toda linha treina o olho a ignorá-lo. Daí o corte em 3h.
checar('cálculo fresco não polui a frase com carimbo', carimboCurto(AGORA, AGORA), '');
checar('cálculo de 2h atrás ainda não carimba', carimboCurto(new Date(AGORA.getTime() - 2 * 3600 * 1000), AGORA), '');
checar('cálculo de 6h atrás carimba a hora', carimboCurto(new Date(AGORA.getTime() - 6 * 3600 * 1000), AGORA), 'calculado às 04:00');
checar('cálculo de outro dia carimba a data', carimboCurto(new Date(2026, 6, 15, 9, 0), AGORA), 'calculado 15/07');
checar('a frase mostra o carimbo quando o número é velho', fraseSaida(montarSaida(dur({ calculadoEm: new Date(2026, 6, 15, 9, 0).toISOString() }), VISITA_15H, AGORA, true) as any, AGORA).includes('calculado 15/07'), true);

console.log('\n8) O "BOM DIA" — enriquece quando dá, e nunca piora quando não dá');
checar('com número, ganha a linha de saída', linhaBomDiaSaida(saida, AGORA), 'saia às 14:23 (32 min, com trânsito)');
checar('modo planejamento diz "sem trânsito"', linhaBomDiaSaida(planejado, AGORA), 'saia às 14:23 (32 min, sem trânsito)');
// Falha de trânsito não pode piorar uma notificação que já funciona sozinha.
checar('indisponível → null (o Bom dia sai como já saía)', linhaBomDiaSaida({ estado: 'indisponivel', erro: 'rede' }, AGORA), null);
checar('endereço insuficiente → null', linhaBomDiaSaida({ estado: 'endereco_insuficiente', qual: 'origem' }, AGORA), null);
checar('nada calculado → null', linhaBomDiaSaida(null, AGORA), null);
checar('já atrasado às 7h da manhã → null (não é notícia de "bom dia")', linhaBomDiaSaida(atrasado, AGORA), null);

console.log('\n9) A NOTIFICAÇÃO "hora de sair"');
const notif = textoNotificacaoSaida(saida, { clienteNome: 'João Silva', titulo: 'Manutenção' }, AGORA);
checar('título responde a pergunta em 3 palavras', notif.titulo, 'Saia às 14:23');
checar('corpo diz para quem, quando chega e com que trânsito', notif.corpo, 'João Silva às 15:00 · 32 min com trânsito');
checar('sem nome de cliente, o corpo não fica com um "·" solto', textoNotificacaoSaida(saida, { clienteNome: '', titulo: '' }, AGORA).corpo, 'Chegada às 15:00 · 32 min com trânsito');

console.log('\n10) AVISAR O CLIENTE — janela em vez de ponto (item 7.2a)');
// "Chego às 15:00" é uma promessa exata que o primeiro semáforo quebra.
checar('viagem de 32 min → janela de ±5 min', (() => { const j = janelaChegada(VISITA_15H, 32)!; return `${hhmm(j.de)}–${hhmm(j.ate)}`; })(), '14:55–15:05');
checar('viagem longa (90 min) → ±14, não uma janela de uma hora', (() => { const j = janelaChegada(VISITA_15H, 90)!; return `${hhmm(j.de)}–${hhmm(j.ate)}`; })(), '14:46–15:14');
checar('viagem de 200 min → teto de ±20', (() => { const j = janelaChegada(VISITA_15H, 200)!; return `${hhmm(j.de)}–${hhmm(j.ate)}`; })(), '14:40–15:20');
checar('minutos ilegíveis → null (a mensagem cai no texto sem horário)', janelaChegada(VISITA_15H, NaN), null);
checar('minutos 0 → null', janelaChegada(VISITA_15H, 0), null);

console.log('\n10b) "NÃO RECONHECI O ENDEREÇO" — precisa dizer QUAL, senão ele conserta o que estava certo');
// Mandar "endereço inválido" genérico faz o prestador abrir o cadastro do
// cliente quando o problema estava no endereço da própria empresa: ele mexe no
// que estava certo e o erro continua lá.
checar('destino aponta para o agendamento', textoEnderecoInsuficiente('destino'), 'Não reconheci o endereço desta visita. Confira no agendamento.');
checar('origem aponta para a visita anterior OU o cadastro', textoEnderecoInsuficiente('origem'), 'Não sei de onde você sai. Confira o endereço da visita anterior — ou o do seu cadastro, se esta for a primeira do dia.');
checar('ambos manda conferir os dois', textoEnderecoInsuficiente('ambos'), 'Não reconheci nem o endereço de saída nem o de chegada. Confira os dois.');
checar('os três textos são DIFERENTES entre si', new Set([textoEnderecoInsuficiente('origem'), textoEnderecoInsuficiente('destino'), textoEnderecoInsuficiente('ambos')]).size, 3);

console.log('\n10c) "NÃO DEU PRA CHECAR" — apontar para o fallback que REALMENTE existe');
// Assim que um cálculo dá certo, o aviso calculado substitui o lembrete fixo de
// 1h. A partir daí, dizer "vale o lembrete de 1h antes" aponta para um lembrete
// que foi cancelado — o app mandaria o prestador contar com um aviso que não vai
// tocar. Mentira pequena, consequência grande: ele não sai.
checar('sem aviso calculado na fila → o lembrete fixo é o que vale', textoIndisponivel(false), 'Não deu para checar o trânsito agora. Vale o lembrete de 1h antes.');
checar('com aviso calculado na fila → é ELE que vale', textoIndisponivel(true), 'Não deu para checar o trânsito agora. Vale o horário calculado antes.');
checar('os dois textos são diferentes', textoIndisponivel(true) === textoIndisponivel(false), false);

// ─── Asserções sobre o FONTE ───────────────────────────────────────────────
// Daqui para baixo é o que não dá para provar rodando: ordem das operações,
// gate de permissão, e ausências (que são o mais fácil de reintroduzir sem
// querer). Não é prova de runtime — é a rede que pega "alguém mexeu e a regra
// não seguiu junto".

const aviso = semComentarios(ler('../src/services/avisoSaida.ts'));
const etaSaidaSrc = semComentarios(ler('../src/services/etaSaida.ts'));
const calculoSrc = semComentarios(ler('../src/services/saidaCalculo.ts'));
const agendaSrc = semComentarios(ler('../src/services/agenda.ts'));
const ritualSrc = semComentarios(ler('../src/services/ritualDiario.ts'));
const cardSrc = semComentarios(ler('../src/components/AvisoSaidaCard.tsx'));

console.log('\n11) NÃO PEDE LOCALIZAÇÃO — permissão nova é passo de loja, e a feature não precisa');
// `expo-location` não está instalado; pedir permissão nova custa manifest,
// texto de propósito, Data safety, política de privacidade e uma rodada de
// review — para responder PIOR a pergunta. A origem vem do cadastro.
for (const [nome, src] of [
  ['saidaCalculo', calculoSrc], ['etaSaida', etaSaidaSrc], ['avisoSaida', aviso], ['AvisoSaidaCard', cardSrc],
] as const) {
  checar(`${nome} não importa expo-location`, src.includes('expo-location'), false);
  checar(`${nome} não pede permissão de localização`, /requestForegroundPermissions|getCurrentPositionAsync|navigator\.geolocation/.test(src), false);
}
// O miolo precisa continuar sem import de runtime, senão o node não roda e
// TODO o arquivo acima vira teatro: sobrariam só buscas de string.
checar('saidaCalculo não tem import de runtime (só `import type`)', /^\s*import\s+(?!type\b)/m.test(calculoSrc), false);

console.log('\n12) A CHAMADA PAGA — quem escolhe o SKU é o call site');
// Sem `modo` o worker recusa e nenhuma chamada paga acontece. Um default aqui
// esconderia uma decisão de dinheiro (Essentials × Pro = metade do preço e o
// dobro da franquia grátis).
checar('etaSaida manda `modo` no corpo', /modo:\s*p\.modo/.test(etaSaidaSrc), true);
checar('a rota é /eta/saida (não o /eta antigo, que ignora departureTime)', etaSaidaSrc.includes('/eta/saida'), true);
// "2026-07-18T15:00:00" sem fuso pode ser 15h em qualquer lugar do planeta.
checar('chegarEm vai com fuso (toISOString), não montado à mão', /chegarEm:\s*new Date\(chegarMs\)\.toISOString\(\)/.test(etaSaidaSrc), true);
checar('o aviso da próxima parada paga o SKU Pro (trânsito de verdade)', /modo:\s*'confirmacao'/.test(aviso), true);
checar('o Bom dia usa o SKU barato', /modo:\s*'planejamento'/.test(ritualSrc), true);
checar('a chave da Routes API não aparece no app (ela é secret do worker)', /OLLI_ROUTES_API_KEY|googleapis\.com/.test(etaSaidaSrc + aviso + calculoSrc), false);
// Um `useEffect` que recalcula a cada foco de tela é como se abre uma conta na
// Google. O card é presentacional; a única chamada paga é sob toque.
checar('o card da Home não chama o cálculo sozinho', /calcularSaida|reagendarAvisoSaida/.test(cardSrc), false);

console.log('\n13) O FALLBACK — o lembrete fixo de 1h só cai quando há número');
const corpoOkAviso = (() => {
  const i = aviso.indexOf("if (resultado.estado === 'ok'");
  return i < 0 ? '' : aviso.slice(i, aviso.indexOf('await gravarRegistro', i));
})();
checar('o ramo de sucesso foi localizado', corpoOkAviso.length > 0, true);
// Se `substituirLembreteFixo` sair deste ramo, o app cancela o lembrete honesto
// e não põe nada no lugar: o prestador fica SEM aviso nenhum.
checar('o lembrete fixo só é substituído DENTRO do ramo ok', corpoOkAviso.includes('substituirLembreteFixo'), true);
checar('e em nenhum outro lugar', aviso.split('substituirLembreteFixo(').length - 1, 2); // 1 definição + 1 uso
checar('agendar notificação também só acontece no ramo ok', aviso.split('scheduleNotificationAsync').length - 1, 1);
checarOrdem('só substitui DEPOIS de o aviso novo estar agendado', corpoOkAviso, 'scheduleNotificationAsync', 'substituirLembreteFixo');
checar('não notifica quando a hora de sair já passou', /!resultado\.atrasado/.test(corpoOkAviso), true);
// O BUG QUE ESTE BLOCO EXISTE PARA IMPEDIR: cancelar o aviso bom ANTES de saber
// se o novo cálculo dá certo. Como um cálculo bem-sucedido já cancelou o
// lembrete fixo, um recálculo que caísse offline deixava o prestador sem aviso
// NENHUM — o pior desfecho possível desta feature.
checar('só cancela em bloco quando a parada MUDOU', /if \(!mesmaParada\) await cancelarAvisoSaida\(\);/.test(aviso), true);
checar('o aviso da mesma parada é HERDADO enquanto não há número novo', /notifId: mesmaParada \? anterior\?\.notifId : undefined/.test(aviso), true);
checarOrdem('o antigo só é cancelado DEPOIS de o novo estar na fila', corpoOkAviso, 'scheduleNotificationAsync', 'cancelScheduledNotificationAsync');
checar('este módulo nunca PEDE permissão de notificação', /requestPermissionsAsync|pedirPermissaoNotificacao/.test(aviso), false);
// Editar a visita das 15h para as 17h sem isto deixaria um "Saia às 14:23"
// agendado para a hora velha — um aviso errado, pior do que aviso nenhum.
checar('salvar um agendamento derruba o aviso calculado para o horário antigo', /saveAgendamento[\s\S]{0,900}cancelarAvisoSaida\(a\.id\)/.test(agendaSrc), true);
checar('excluir também', /deleteAgendamento[\s\S]{0,400}cancelarAvisoSaida\(id\)/.test(agendaSrc), true);
checar('o logout (cancelarTodosLembretes) leva o aviso junto', /cancelarTodosLembretes[\s\S]{0,900}await cancelarAvisoSaida\(\)/.test(agendaSrc), true);
// O lembrete fixo é o CHÃO da feature: funciona offline, sem API e sem custo.
checar('o lembrete fixo de 1h continua existindo', /MINUTOS_ANTECEDENCIA_LEMBRETE = 60/.test(agendaSrc), true);

console.log('\n14) CUSTO — a alavanca é chamar menos, não cachear mais');
// O documento (12.4b) é explícito: o lado caro (Pro/TRAFFIC_AWARE) é
// incompressível por cache sem mentir. Só a PRÓXIMA parada, com throttle.
// A constante EXISTIR não prova nada — o que segura o custo é a comparação
// dentro do `if`, e foi exatamente isso que o mutation check pegou passando
// batido quando a asserção só procurava o nome da constante.
checar('o throttle é COMPARADO, não só declarado', /idade\s*<\s*THROTTLE_MS/.test(aviso), true);
checar('e o recálculo antecipado retorna sem chamar nada', /idade < THROTTLE_MS\)\s*\{\s*return reviver/.test(aviso), true);
checar('o throttle só é ignorado sob toque explícito (`forcar`)', /!d\.forcar\s*&&\s*mesmaParada/.test(aviso), true);
checar('só calcula dentro de uma janela de horas antes da visita', /JANELA_H/.test(aviso), true);
checarOrdem('endereço faltando reprova ANTES do fetch (chamada paga é o último recurso)', etaSaidaSrc, 'endereco_insuficiente', 'fetch(');
checarOrdem('horário no passado reprova antes do fetch', etaSaidaSrc, 'chegar_em_passado', 'fetch(');
checarOrdem('o cache é consultado antes do fetch', etaSaidaSrc, 'cacheValido', 'fetch(');
// Os três guards de endereço precisam existir separados: sem o `qual` certo, a
// tela manda o prestador corrigir o endereço errado.
checar('os três casos de endereço faltando são distinguidos', /qual: 'ambos' \}[\s\S]{0,200}qual: 'origem' \}[\s\S]{0,200}qual: 'destino' \}/.test(etaSaidaSrc), true);

console.log('\n15) A TELA — três estados, e o quarto caso que não é erro');
checar('o card trata os três estados', /estado === 'ok'/.test(cardSrc) && /endereco_insuficiente/.test(cardSrc) && /textoIndisponivel/.test(cardSrc), true);
// Sem registro nenhum, nada foi tentado: escrever "não deu pra checar" sem ter
// checado inventa um erro do mesmo jeito que inventar um número.
checar('sem registro, o card não aparece (nada foi tentado)', /if \(!aviso\) return null;/.test(cardSrc), true);
checar('o card usa a copy testável de saidaCalculo', cardSrc.includes('textoEnderecoInsuficiente'), true);
// A copy da falha depende de um FATO (existe ou não aviso na fila), então mora
// em saidaCalculo e é testada por comportamento na seção 10c — aqui só se
// prende que o card consulta esse fato em vez de cravar uma das duas frases.
checar('a falha de rede consulta se há aviso agendado antes de falar', /textoIndisponivel\(aviso\.avisoAgendado\)/.test(cardSrc), true);
// Regra de movimento do projeto: só transform/opacity, e caminho sem movimento.
checar('anima só opacity', /Animated\.timing\(opacity/.test(cardSrc) && /translate|scale/.test(cardSrc) === false, true);
checar('respeita prefers-reduced-motion com caminho sem movimento', /if \(reduzirMovimento\)[\s\S]{0,80}opacity\.setValue\(1\)/.test(cardSrc), true);
checar('área de toque de 44px no botão', /minHeight: 44/.test(cardSrc), true);
checar('usa token de duração, não número mágico', /Motion\.dur\./.test(cardSrc), true);

console.log('\n16) O RITUAL — reusa o mecanismo, não cria um novo');
checar('o aviso roda no reagendamento do ritual que já existe', /reagendarAvisoSaidaDoDia\(\)/.test(ritualSrc), true);
// Ele SUBSTITUI o lembrete de agenda, não é um terceiro canal de engajamento:
// por isso não obedece aos toggles de "Bom dia"/"Fechar o dia".
checarOrdem('roda ANTES do return dos toggles do ritual', ritualSrc, 'reagendarAvisoSaidaDoDia()', 'if (!bomDiaAtivo && !fecharDiaAtivo) return');
checarOrdem('e antes do gate de permissão (a Home mostra mesmo sem notificação)', ritualSrc, 'reagendarAvisoSaidaDoDia()', 'await temPermissaoNotificacao()');
checar('o Bom dia não ganha notificação nova, só uma linha a mais', ritualSrc.split('scheduleNotificationAsync').length - 1, 2); // bomDia + fecharDia, como antes

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'} — ${passes} asserções ok, ${falhas} falhas`);
process.exit(falhas === 0 ? 0 : 1);
