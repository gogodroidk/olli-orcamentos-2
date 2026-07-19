/**
 * Teste do GET /cep/<8 dígitos> e do GET /feriados/<ano> (worker/src/brasil.js),
 * mais os três estados do /cnpj (worker/src/util.js).
 *
 *     node scripts/teste-brasil-dados.ts
 * Exit 0 = passou; 1 = falhou. O exit code é a prova.
 *
 * POR QUE ESTE ARQUIVO EXISTE — três coisas quebram aqui, e as três quebram
 * CALADAS:
 *
 *  (a) **"Não sei" virando "não tem".** O bug recorrente da casa
 *      (`olli-gate-erro-vira-vazio`). Aqui ele tem uma porta de entrada que não
 *      é nossa: a BrasilAPI CEP v2 devolve **404 com corpo idêntico** para "CEP
 *      não existe" e para "todos os provedores caíram" (`type:"service_error"`,
 *      "Todos os serviços de CEP retornaram erro." — verificado ao vivo em
 *      2026-07-18, comando reproduzido no fim deste arquivo). Traduzir aquele
 *      404 em `nao_encontrado` faria o app dizer "esse CEP não existe" quando a
 *      verdade é "a internet piscou", e o prestador ligaria pro cliente por
 *      nada, na frente do cliente. O bloco 9 existe só para prender isso.
 *
 *  (b) **Cache que guarda erro.** Guardar um `indisponivel` de 3 segundos por
 *      30 dias transforma uma falha passageira num CEP permanentemente quebrado
 *      para aquele isolate. O bloco 11 conta as chamadas e prova que não guarda.
 *
 *  (c) **Feriado errado.** Uma agenda que marca visita em 7 de setembro custa
 *      uma viagem perdida. Os feriados aqui são CALCULADOS (zero rede), então a
 *      única prova possível é aritmética conferida contra o calendário oficial —
 *      Portaria MGI nº 11.460/2025. O bloco 6 faz isso data por data, e o bloco
 *      13 prova que nenhuma chamada de rede acontece.
 *
 * Exercita o módulo REAL do worker com os upstreams MOCKADOS — nenhuma rede,
 * nenhuma chave, roda offline. No molde de scripts/teste-eta-saida.ts, incluindo
 * a camada de asserção sobre o FONTE para o que só dá para provar lendo (ordem
 * do rate limit, quem tem autoridade para dizer "não existe").
 */
import { readFileSync } from 'node:fs';
import {
  handleCep,
  handleFeriados,
  limparCacheCep,
  normalizarCep,
  lerCoordenada,
  lerBrasilApiCep,
  lerViaCep,
  domingoDePascoa,
  feriadosDoAno,
  FERIADO_ANO_MIN,
  FERIADO_ANO_MAX,
  CEP_TTL_OK_MS,
  CEP_TTL_NAO_MS,
  // @ts-expect-error — worker é JS puro, sem tipos; roda por type stripping.
} from '../worker/src/brasil.js';
// @ts-expect-error
import { tresEstados, empresaAtiva } from '../worker/src/util.js';

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

const AGORA = Date.parse('2026-07-18T10:00:00-03:00');

function respJson(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

// ─── Corpos REAIS, copiados das respostas ao vivo de 2026-07-18 ────────────
// Não são invenções: são o que os dois serviços devolveram de verdade. Testar
// contra um mock inventado prova que o código concorda com a minha imaginação.

/** BrasilAPI CEP v2, CEP 01001000. Note `coordinates: {}` — veio vazio nas 5 amostras. */
const BRASILAPI_SE = {
  cep: '01001000',
  state: 'SP',
  city: 'São Paulo',
  neighborhood: 'Sé',
  street: 'Praça da Sé',
  service: 'open-cep',
  timezoneName: null,
  location: { type: 'Point', coordinates: {} },
};

/** BrasilAPI CEP v2, corpo do 404. É ESTE corpo que serve para os dois casos opostos. */
const BRASILAPI_404 = {
  name: 'CepPromiseError',
  message: 'Todos os serviços de CEP retornaram erro.',
  type: 'service_error',
  errors: [
    { name: 'ServiceError', message: 'Não foi possível interpretar o XML de resposta.', service: 'correios' },
    { name: 'ServiceError', message: 'Erro ao se conectar com o serviço ViaCEP.', service: 'viacep' },
  ],
};

/** ViaCEP, CEP 01001000. */
const VIACEP_SE = {
  cep: '01001-000',
  logradouro: 'Praça da Sé',
  complemento: 'lado ímpar',
  unidade: '',
  bairro: 'Sé',
  localidade: 'São Paulo',
  uf: 'SP',
  estado: 'São Paulo',
  regiao: 'Sudeste',
  ibge: '3550308',
  ddd: '11',
};

/** ViaCEP para CEP inexistente: HTTP 200 e `erro` como STRING. É a marca de ausência. */
const VIACEP_INEXISTENTE = { erro: 'true' };

type Chamada = { url: string };
type Mocks = { brasilapi?: () => Response; viacep?: () => Response };

function montarFetch(m: Mocks) {
  const chamadas: Chamada[] = [];
  const f = async (url: unknown): Promise<Response> => {
    const u = String(url);
    chamadas.push({ url: u });
    if (u.includes('brasilapi.com.br')) {
      if (!m.brasilapi) throw new Error('rede caiu');
      return m.brasilapi();
    }
    if (u.includes('viacep.com.br')) {
      if (!m.viacep) throw new Error('rede caiu');
      return m.viacep();
    }
    throw new Error('URL inesperada no mock: ' + u);
  };
  return { f, chamadas };
}

type Opcoes = { env?: Record<string, unknown>; agora?: number; semUsuario?: boolean };

async function chamarCep(cep: string, mocks: Mocks = {}, opts: Opcoes = {}) {
  const { f, chamadas } = montarFetch(mocks);
  const env = { CEP_RL: { limit: async () => ({ success: true }) }, ...(opts.env || {}) };
  const request = new Request(`https://olli-diagnostico/cep/${cep}`, {
    headers: { Authorization: 'Bearer token-de-teste' },
  });
  const resp: Response = await handleCep(request, env, cep, {
    fetch: f,
    agora: () => opts.agora ?? AGORA,
    getUser: async () => (opts.semUsuario ? null : { id: 'usuario-de-teste' }),
  });
  return { status: resp.status, corpo: JSON.parse(await resp.text()) as any, chamadas };
}

const pediuBrasilApi = (c: Chamada[]) => c.filter((x) => x.url.includes('brasilapi.com.br')).length;
const pediuViaCep = (c: Chamada[]) => c.filter((x) => x.url.includes('viacep.com.br')).length;

const okBrasilApi = () => () => respJson(BRASILAPI_SE);
const naoAchouBrasilApi = () => () => respJson(BRASILAPI_404, 404);
const okViaCep = () => () => respJson(VIACEP_SE);
const naoAchouViaCep = () => () => respJson(VIACEP_INEXISTENTE);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n1) normalizarCep — "inválido" é um estado, não um erro genérico');

checar('8 dígitos limpos passam', normalizarCep('01001000'), '01001000');
checar('máscara é aceita (o campo do app tem máscara)', normalizarCep('01001-000'), '01001000');
checar('espaço e ponto são aceitos', normalizarCep(' 01.001-000 '), '01001000');
checar('7 dígitos = null', normalizarCep('0100100'), null);
checar('9 dígitos = null', normalizarCep('010010001'), null);
checar('texto = null', normalizarCep('meu cep'), null);
checar('vazio = null', normalizarCep(''), null);
checar('undefined = null (nunca "undefined" virando string)', normalizarCep(undefined), null);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n2) lerCoordenada — a coordenada é bônus, e bônus ausente não vira 0,0');

checar('coordenada válida em número', lerCoordenada({ coordinates: { latitude: -23.55, longitude: -46.63 } }), { lat: -23.55, lng: -46.63 });
// A API documenta string; o dado real veio vazio. Aceitar os dois é barato.
checar('coordenada válida em string', lerCoordenada({ coordinates: { latitude: '-23.55', longitude: '-46.63' } }), { lat: -23.55, lng: -46.63 });
// ESTE é o caso real: nas 5 consultas ao vivo, `coordinates` veio `{}` em todas.
checar('coordinates vazio (o caso REAL) = null', lerCoordenada({ type: 'Point', coordinates: {} }), null);
checar('location ausente = null', lerCoordenada(undefined), null);
checar('coordenada não-numérica = null', lerCoordenada({ coordinates: { latitude: 'norte', longitude: 'x' } }), null);
// 0,0 é um ponto no Atlântico. Se ele passasse, o ETA calcularia rota pro mar.
checar('0,0 é ausência de dado, não endereço', lerCoordenada({ coordinates: { latitude: 0, longitude: 0 } }), null);
checar('latitude fora do planeta = null', lerCoordenada({ coordinates: { latitude: 91, longitude: 0 } }), null);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n3) leitura dos dois provedores — endereço pela metade é pior que campo vazio');

checar('BrasilAPI: corpo real vira endereço do OLLI', lerBrasilApiCep(BRASILAPI_SE, '01001000'), {
  cep: '01001000', logradouro: 'Praça da Sé', bairro: 'Sé', cidade: 'São Paulo', uf: 'SP',
});
checar('BrasilAPI: sem coordenada, o campo nem aparece', 'lat' in (lerBrasilApiCep(BRASILAPI_SE, '01001000') as any), false);
checar('BrasilAPI: com coordenada, ela entra',
  lerBrasilApiCep({ ...BRASILAPI_SE, location: { coordinates: { latitude: -23.55, longitude: -46.63 } } }, '01001000'),
  { cep: '01001000', logradouro: 'Praça da Sé', bairro: 'Sé', cidade: 'São Paulo', uf: 'SP', lat: -23.55, lng: -46.63 });
// Sem cidade/UF o formulário seria preenchido com meia verdade — e meia verdade
// num endereço é o técnico indo pro lugar errado.
checar('BrasilAPI: sem cidade = null (não é endereço)', lerBrasilApiCep({ ...BRASILAPI_SE, city: '' }, '01001000'), null);
checar('BrasilAPI: sem UF = null', lerBrasilApiCep({ ...BRASILAPI_SE, state: '' }, '01001000'), null);
checar('BrasilAPI: o corpo do 404 NÃO é lido como endereço', lerBrasilApiCep(BRASILAPI_404, '00000000'), null);

checar('ViaCEP: corpo real vira endereço', lerViaCep(VIACEP_SE, '01001000'), {
  estado: 'ok',
  endereco: { cep: '01001000', logradouro: 'Praça da Sé', bairro: 'Sé', cidade: 'São Paulo', uf: 'SP' },
});
// A doc antiga mostra booleano; o serviço devolve string. Comparar com `=== true`
// deixaria o inexistente passar como endereço vazio — cliente com rua em branco.
checar('ViaCEP: erro como STRING (o que o serviço devolve de verdade)', lerViaCep({ erro: 'true' }, '99999999').estado, 'nao_encontrado');
checar('ViaCEP: erro como booleano (o que a doc antiga diz)', lerViaCep({ erro: true }, '99999999').estado, 'nao_encontrado');
checar('ViaCEP: lixo não vira nao_encontrado', lerViaCep(null, '01001000').estado, 'indisponivel');
checar('ViaCEP: corpo sem cidade não vira nao_encontrado', lerViaCep({ uf: 'SP' }, '01001000').estado, 'indisponivel');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n4) CEP: o caminho feliz');
{
  limparCacheCep();
  const r = await chamarCep('01001000', { brasilapi: okBrasilApi() });
  checar('estado ok', r.corpo.estado, 'ok');
  checar('ok:true', r.corpo.ok, true);
  checar('endereço completo', r.corpo.endereco.cidade, 'São Paulo');
  checar('fonte declarada', r.corpo.fonte, 'brasilapi');
  checar('diz que NÃO veio de cache', r.corpo.cache, false);
  checar('1 chamada à BrasilAPI', pediuBrasilApi(r.chamadas), 1);
  // ViaCEP só é acionado se a primeira porta falhar. Consultar as duas sempre
  // dobraria a carga em serviço comunitário de graça.
  checar('ViaCEP nem é chamado quando a primeira porta resolve', pediuViaCep(r.chamadas), 0);
}

console.log('\n5) CEP: máscara na URL e CEP inválido');
{
  limparCacheCep();
  const r = await chamarCep('01001-000', { brasilapi: okBrasilApi() });
  checar('máscara na rota funciona', r.corpo.estado, 'ok');

  const inv = await chamarCep('123', { brasilapi: okBrasilApi() });
  checar('CEP curto = invalido (não é "não encontrado")', inv.corpo.estado, 'invalido');
  checar('status 400', inv.status, 400);
  // Recusar antes de sair da porta: erro de digitação não deve gastar upstream
  // nem balde de rate limit de quem vai corrigir em seguida.
  checar('CEP inválido não consulta ninguém', inv.chamadas.length, 0);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n6) FERIADOS — conferidos contra a Portaria MGI nº 11.460/2025 (calendário oficial 2026)');

// Páscoa: aritmética fechada. Se isto errar, todo feriado móvel erra junto.
checar('Páscoa 2024 = 31/03', domingoDePascoa(2024), { mes: 3, dia: 31 });
checar('Páscoa 2025 = 20/04', domingoDePascoa(2025), { mes: 4, dia: 20 });
checar('Páscoa 2026 = 05/04', domingoDePascoa(2026), { mes: 4, dia: 5 });
checar('Páscoa 2027 = 28/03', domingoDePascoa(2027), { mes: 3, dia: 28 });
checar('Páscoa 2030 = 21/04', domingoDePascoa(2030), { mes: 4, dia: 21 });

{
  const f2026 = feriadosDoAno(2026);
  const acha = (data: string) => f2026.find((x: any) => x.data === data);

  // As cinco datas móveis do calendário oficial de 2026.
  checar('Carnaval (segunda) 16/02 e é FACULTATIVO', acha('2026-02-16')?.tipo, 'facultativo');
  checar('Carnaval (terça) 17/02 e é FACULTATIVO', acha('2026-02-17')?.tipo, 'facultativo');
  checar('Quarta-feira de Cinzas 18/02', acha('2026-02-18')?.nome, 'Quarta-feira de Cinzas (até 14h)');
  // A BrasilAPI chama Carnaval e Corpus Christi de "national". A portaria não.
  checar('Sexta-feira Santa 03/04 e é NACIONAL', acha('2026-04-03')?.tipo, 'nacional');
  checar('Corpus Christi 04/06 e é FACULTATIVO', acha('2026-06-04')?.tipo, 'facultativo');

  // Datas fixas + contagem: a portaria de 2026 diz "dez feriados nacionais".
  checar('7 de setembro está lá', acha('2026-09-07')?.nome, 'Independência do Brasil');
  checar('2026 tem exatamente 10 feriados NACIONAIS (como a portaria)',
    f2026.filter((x: any) => x.tipo === 'nacional').length, 10);
  // Quatro, não nove: a portaria lista nove pontos facultativos, mas os outros
  // cinco (Dia do Servidor Público, 24 e 31/12 após as 14h, e as emendas) são
  // facultativo de SERVIDOR FEDERAL. Não mudam se o cliente do prestador vai
  // estar em casa. Ficaram de fora de propósito — ver o comentário de MOVEIS.
  checar('e 4 facultativos, os que de fato fecham comércio',
    f2026.filter((x: any) => x.tipo === 'facultativo').length, 4);

  // Dia da semana conferido contra a resposta ao vivo da BrasilAPI para 2026.
  checar('01/01/2026 é quinta-feira', acha('2026-01-01')?.diaSemana, 'quinta-feira');
  checar('07/09/2026 é segunda-feira', acha('2026-09-07')?.diaSemana, 'segunda-feira');
  checar('25/12/2026 é sexta-feira', acha('2026-12-25')?.diaSemana, 'sexta-feira');

  // Ordenado por data: a agenda mostra na ordem, sem reordenar do lado do app.
  const datas = f2026.map((x: any) => x.data);
  checar('lista vem ordenada por data', datas.join() === [...datas].sort().join(), true);

  // A Páscoa NÃO entra: é domingo e não está na portaria. A BrasilAPI lista.
  checar('Páscoa não é listada como feriado (é domingo, não está na portaria)', acha('2026-04-05'), undefined);
}

console.log('\n7) FERIADOS — o passado também precisa estar certo');
{
  // Lei 14.759/2023: Consciência Negra virou nacional a partir de 2024. Marcar
  // 20/11/2022 como feriado nacional reescreveria o relatório daquele mês.
  const em2023 = feriadosDoAno(2023).find((x: any) => x.data === '2023-11-20');
  const em2024 = feriadosDoAno(2024).find((x: any) => x.data === '2024-11-20');
  checar('20/11/2023 NÃO era feriado nacional', em2023, undefined);
  checar('20/11/2024 já era', em2024?.tipo, 'nacional');
  checar('2023 tem 9 nacionais', feriadosDoAno(2023).filter((x: any) => x.tipo === 'nacional').length, 9);

  // Lei 6.802/1980 — Aparecida.
  checar('12/10/1979 ainda não era feriado nacional',
    feriadosDoAno(1979).find((x: any) => x.data === '1979-10-12'), undefined);
  checar('12/10/1980 já era',
    feriadosDoAno(1980).find((x: any) => x.data === '1980-10-12')?.tipo, 'nacional');

  // Pureza: mesma entrada, mesma saída, sem relógio e sem rede.
  checar('feriadosDoAno é pura (2 chamadas idênticas)',
    JSON.stringify(feriadosDoAno(2027)) === JSON.stringify(feriadosDoAno(2027)), true);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n8) CEP: a segunda porta (ViaCEP) quando a primeira falha');
{
  limparCacheCep();
  // BrasilAPI fora do ar (exceção de rede), ViaCEP responde.
  const r = await chamarCep('01001000', { viacep: okViaCep() });
  checar('endereço vem mesmo com a BrasilAPI caída', r.corpo.estado, 'ok');
  checar('fonte é o ViaCEP', r.corpo.fonte, 'viacep');
  checar('tentou a primeira porta antes', pediuBrasilApi(r.chamadas), 1);
  checar('e caiu pra segunda', pediuViaCep(r.chamadas), 1);
}
{
  limparCacheCep();
  // BrasilAPI 500: nem por isso o CEP "não existe".
  const r = await chamarCep('01001000', { brasilapi: () => respJson({ erro: 'ops' }, 500), viacep: okViaCep() });
  checar('500 da primeira porta não vira ausência', r.corpo.estado, 'ok');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n9) O CORAÇÃO: só o ViaCEP tem autoridade para dizer "não existe"');
{
  limparCacheCep();
  // Caso A — o CEP realmente não existe: BrasilAPI 404 E ViaCEP confirma.
  const a = await chamarCep('00000000', { brasilapi: naoAchouBrasilApi(), viacep: naoAchouViaCep() });
  checar('[A] confirmado pelos dois → nao_encontrado', a.corpo.estado, 'nao_encontrado');
  checar('[A] status 404', a.status, 404);
  checar('[A] não devolve endereço nenhum', a.corpo.endereco, undefined);
  checar('[A] consultou as duas portas antes de afirmar ausência', a.chamadas.length, 2);
}
{
  limparCacheCep();
  // Caso B — O CASO QUE DERRUBA IMPLEMENTAÇÃO INGÊNUA. A BrasilAPI devolve o
  // MESMO 404 do caso A, mas o ViaCEP está fora do ar. Quem confia no 404 da
  // BrasilAPI responde "esse CEP não existe" com a internet piscando.
  const b = await chamarCep('01001000', { brasilapi: naoAchouBrasilApi() });
  checar('[B] 404 da BrasilAPI + ViaCEP mudo → indisponivel, NUNCA nao_encontrado', b.corpo.estado, 'indisponivel');
  checar('[B] ok:false', b.corpo.ok, false);
  checar('[B] status 200 (é conselho, não erro de rota)', b.status, 200);
  checar('[B] não devolve endereço', b.corpo.endereco, undefined);
}
{
  limparCacheCep();
  // Caso C — mesma ambiguidade, mas o ViaCEP está VIVO e tem o endereço. Aqui a
  // BrasilAPI errou (ou seus 4 upstreams caíram) e o CEP existe.
  const c = await chamarCep('01001000', { brasilapi: naoAchouBrasilApi(), viacep: okViaCep() });
  checar('[C] 404 da BrasilAPI + ViaCEP com o endereço → ok', c.corpo.estado, 'ok');
  checar('[C] fonte viacep', c.corpo.fonte, 'viacep');
}
{
  limparCacheCep();
  // Caso D — tudo fora do ar. É "não sei", e sai como "não sei".
  const d = await chamarCep('01001000', {});
  checar('[D] as duas portas caídas → indisponivel', d.corpo.estado, 'indisponivel');
  checar('[D] erro nomeado', d.corpo.erro, 'cep_indisponivel');
}
{
  limparCacheCep();
  // Caso E — ViaCEP devolve HTTP 400 (formato recusado). Problema DELE nunca
  // vira "esse CEP não existe".
  const e = await chamarCep('01001000', {
    brasilapi: naoAchouBrasilApi(),
    viacep: () => new Response('<html>Http 400</html>', { status: 400 }),
  });
  checar('[E] 400 do ViaCEP não vira nao_encontrado', e.corpo.estado, 'indisponivel');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n10) CEP: autenticação e rate limit');
{
  limparCacheCep();
  const semLogin = await chamarCep('01001000', { brasilapi: okBrasilApi() }, { semUsuario: true });
  checar('sem login = 401', semLogin.status, 401);
  checar('sem login = indisponivel (não é "cep não existe")', semLogin.corpo.estado, 'indisponivel');
  checar('sem login não gasta upstream', semLogin.chamadas.length, 0);
}
{
  limparCacheCep();
  const barrado = await chamarCep('01001000', { brasilapi: okBrasilApi() }, {
    env: { CEP_RL: { limit: async () => ({ success: false }) } },
  });
  checar('limiter disse NÃO = 429', barrado.status, 429);
  // A ordem é o que importa: o teto tem que valer ANTES da chamada, senão é
  // decoração — o upstream já foi consumido quando o 429 sai.
  checar('barrado ANTES de consultar ninguém', barrado.chamadas.length, 0);
}
{
  limparCacheCep();
  // Binding ausente (o estado real até o próximo deploy provisionar CEP_RL).
  // Política `sensivel:false` de rateLimit.js: rota que não gasta dinheiro segue.
  const semBinding = await chamarCep('01001000', { brasilapi: okBrasilApi() }, { env: { CEP_RL: undefined } });
  checar('sem binding, a rota SEGUE (upstream é grátis)', semBinding.corpo.estado, 'ok');
}
{
  limparCacheCep();
  // Limiter que explode também é "indisponivel" — e continua não derrubando o
  // cadastro do cliente.
  const explodiu = await chamarCep('01001000', { brasilapi: okBrasilApi() }, {
    env: { CEP_RL: { limit: async () => { throw new Error('limiter caiu'); } } },
  });
  checar('limiter que lança não derruba o cadastro', explodiu.corpo.estado, 'ok');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n11) CACHE: a economia é contada em chamadas, não estimada em porcentagem');
{
  limparCacheCep();
  const primeira = await chamarCep('01001000', { brasilapi: okBrasilApi() });
  const segunda = await chamarCep('01001000', { brasilapi: okBrasilApi() });
  checar('a 1ª consulta custa 1 chamada', pediuBrasilApi(primeira.chamadas), 1);
  checar('a 2ª custa ZERO', pediuBrasilApi(segunda.chamadas), 0);
  checar('e devolve o mesmo endereço', segunda.corpo.endereco.cidade, 'São Paulo');
  checar('marcada como cache (o app pode mostrar que é reuso)', segunda.corpo.cache, true);
}
{
  limparCacheCep();
  // Negativo também é cacheado — senão o dedo tremido repetindo o mesmo CEP
  // errado bate nos dois serviços a cada tecla.
  let chamadas = 0;
  for (let i = 0; i < 10; i++) {
    const r = await chamarCep('00000000', { brasilapi: naoAchouBrasilApi(), viacep: naoAchouViaCep() });
    chamadas += r.chamadas.length;
    if (i > 0) checar(`repetição ${i} continua nao_encontrado`, r.corpo.estado, 'nao_encontrado');
  }
  checar('10 consultas de CEP inexistente custam 2 chamadas, não 20', chamadas, 2);
}
{
  limparCacheCep();
  // E O QUE NÃO PODE SER CACHEADO: guardar um erro de 3s por 30 dias transforma
  // uma falha passageira num CEP morto para aquele isolate.
  const a = await chamarCep('01001000', {});
  const b = await chamarCep('01001000', { brasilapi: okBrasilApi() });
  checar('a falha não foi guardada', a.corpo.estado, 'indisponivel');
  checar('a consulta seguinte tenta de novo e acha', b.corpo.estado, 'ok');
  checar('e realmente foi à rede', pediuBrasilApi(b.chamadas), 1);
}
{
  limparCacheCep();
  // TTL: o positivo dura 30 dias, o negativo 24h. O negativo é curto de
  // propósito — loteamento novo ganha CEP, e insistir que "não existe" por 30
  // dias faria o app afirmar que o endereço do cliente é inválido.
  await chamarCep('01001000', { brasilapi: okBrasilApi() });
  const dentro = await chamarCep('01001000', {}, { agora: AGORA + CEP_TTL_OK_MS - 1000 });
  checar('positivo ainda vale às vésperas dos 30 dias', dentro.corpo.cache, true);
  const fora = await chamarCep('01001000', { brasilapi: okBrasilApi() }, { agora: AGORA + CEP_TTL_OK_MS + 1000 });
  checar('positivo expira depois dos 30 dias', fora.corpo.cache, false);

  limparCacheCep();
  await chamarCep('00000000', { brasilapi: naoAchouBrasilApi(), viacep: naoAchouViaCep() });
  const negFora = await chamarCep('00000000', { brasilapi: naoAchouBrasilApi(), viacep: okViaCep() }, { agora: AGORA + CEP_TTL_NAO_MS + 1000 });
  checar('negativo expira em 24h e o CEP novo passa a ser encontrado', negFora.corpo.estado, 'ok');
  checar('TTL do negativo é MUITO menor que o do positivo', CEP_TTL_NAO_MS < CEP_TTL_OK_MS, true);
}
{
  limparCacheCep();
  // Acerto de cache não toca a rede de ninguém → não deve competir por balde.
  // Sem isto, quem revisita o mesmo cliente leva 429 por consulta que custou zero.
  await chamarCep('01001000', { brasilapi: okBrasilApi() });
  const comLimiteEstourado = await chamarCep('01001000', {}, {
    env: { CEP_RL: { limit: async () => ({ success: false }) } },
  });
  checar('cache responde mesmo com o rate limit estourado', comLimiteEstourado.corpo.estado, 'ok');
  checar('e sem ir à rede', comLimiteEstourado.chamadas.length, 0);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n12) /feriados — contrato');
{
  const req = new Request('https://olli-diagnostico/feriados/2026', { headers: { Authorization: 'Bearer t' } });
  const resp: Response = await handleFeriados(req, {}, '2026', { getUser: async () => ({ id: 'u' }) });
  const corpo = JSON.parse(await resp.text());
  checar('ok', corpo.estado, 'ok');
  checar('ano ecoado', corpo.ano, 2026);
  checar('fonte declarada como cálculo local (não é proxy)', corpo.fonte, 'calculo_local');
  // Sem este campo, a ausência do feriado da cidade vira afirmação de que não
  // existe nenhum — e é justo o feriado municipal que esvazia a agenda dele.
  checar('declara que NÃO inclui feriado municipal', corpo.municipaisIncluidos, false);
  checar('nem estadual', corpo.estaduaisIncluidos, false);
  checar('14 datas em 2026 (10 nacionais + 4 facultativos)', corpo.feriados.length, 14);

  const semLogin: Response = await handleFeriados(req, {}, '2026', { getUser: async () => null });
  checar('sem login = 401', semLogin.status, 401);

  for (const ruim of ['abacaxi', '', '1899', '2200', '2026.5', '-2026']) {
    const r: Response = await handleFeriados(req, {}, ruim, { getUser: async () => ({ id: 'u' }) });
    const c = JSON.parse(await r.text());
    checar(`ano "${ruim}" = invalido`, c.estado, 'invalido');
    checar(`ano "${ruim}" = 400`, r.status, 400);
  }
  const borda1: Response = await handleFeriados(req, {}, String(FERIADO_ANO_MIN), { getUser: async () => ({ id: 'u' }) });
  const borda2: Response = await handleFeriados(req, {}, String(FERIADO_ANO_MAX), { getUser: async () => ({ id: 'u' }) });
  checar('a borda de baixo é aceita', borda1.status, 200);
  checar('a borda de cima é aceita', borda2.status, 200);
}

console.log('\n13) /feriados NÃO toca a rede — é a razão de existir (agenda no meio do mato)');
{
  const original = globalThis.fetch;
  let tentativas = 0;
  globalThis.fetch = (async () => { tentativas++; throw new Error('a rota de feriados foi à rede'); }) as any;
  try {
    const req = new Request('https://olli-diagnostico/feriados/2026', { headers: { Authorization: 'Bearer t' } });
    const resp: Response = await handleFeriados(req, {}, '2026', { getUser: async () => ({ id: 'u' }) });
    const corpo = JSON.parse(await resp.text());
    checar('respondeu com a rede proibida', corpo.estado, 'ok');
    checar('ZERO chamadas de rede', tentativas, 0);
  } finally {
    globalThis.fetch = original;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n14) /cnpj — os três estados que o `!!` apagava');

checar('true = sim', tresEstados(true), 'sim');
checar('false = nao', tresEstados(false), 'nao');
// ESTE é o caso real: a BrasilAPI devolveu `opcao_pelo_mei: null` num CNPJ
// existente e ativo. `!!null` dizia "não é MEI" — afirmação sem base.
checar('null = desconhecido (o estado que sumia)', tresEstados(null), 'desconhecido');
checar('undefined = desconhecido', tresEstados(undefined), 'desconhecido');

checar('código 2 = ATIVA', empresaAtiva({ situacao_cadastral: 2 }), true);
checar('código 8 (BAIXADA) = não ativa', empresaAtiva({ situacao_cadastral: 8 }), false);
checar('código 4 (INAPTA) = não ativa', empresaAtiva({ situacao_cadastral: 4 }), false);
checar('só o texto também serve', empresaAtiva({ descricao_situacao_cadastral: 'ATIVA' }), true);
checar('texto BAIXADA', empresaAtiva({ descricao_situacao_cadastral: 'BAIXADA' }), false);
// "Não consegui confirmar" e "foi baixada" pedem coisas opostas de quem vai
// emitir nota. `null` é obrigatório aqui.
checar('sem nenhum dos dois = null, NUNCA false', empresaAtiva({}), null);
checar('objeto ausente = null', empresaAtiva(undefined), null);
checar('código 0/lixo não afirma nada pelo número', empresaAtiva({ situacao_cadastral: 0 }), null);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n15) O FONTE — o que só dá para provar lendo');
{
  const src = readFileSync(new URL('../worker/src/brasil.js', import.meta.url), 'utf8');
  const idx = readFileSync(new URL('../worker/src/index.js', import.meta.url), 'utf8');

  // (1) `nao_encontrado` só pode nascer da leitura do ViaCEP.
  //
  // Esta asserção é escopada de propósito, e a versão anterior dela (que só
  // varria linhas soltas) foi apagada por um mutation check: a mutação que
  // enfiava `if (r.status === 404) return { estado: 'nao_encontrado' }` DENTRO
  // de `consultarBrasilApi` sobreviveu inteira. Sobreviveu porque hoje é
  // inofensiva — `handleCep` só ramifica em `'ok'`, então aquele valor morre sem
  // ser lido. Mas é uma armadilha carregada: no dia em que alguém acrescentar um
  // `if (viaBrasil.estado === 'nao_encontrado')` achando que está só "tratando
  // um caso que faltava", o app passa a dizer "esse CEP não existe" toda vez que
  // a internet piscar. Nenhum teste de comportamento consegue pegar código que
  // ainda não é lido — só o fonte pega.
  const corpoBrasilApi = src.slice(
    src.indexOf('async function consultarBrasilApi'),
    src.indexOf('async function consultarViaCep'),
  );
  checar('o leitor da BrasilAPI foi localizado no fonte', corpoBrasilApi.length > 100, true);
  checar('a BrasilAPI NÃO pode sequer pronunciar nao_encontrado', corpoBrasilApi.includes('nao_encontrado'), false);
  checar('nao_encontrado nasce dentro do leitor do ViaCEP', src.includes("if (d.erro === true || d.erro === 'true') return { estado: 'nao_encontrado' };"), true);
  // E o consumo: `handleCep` só pode aceitar `ok` da primeira porta. Qualquer
  // outra ramificação sobre `viaBrasil` é a armadilha acima sendo armada.
  const ramosViaBrasil = src.split('\n').filter((l) => l.includes('viaBrasil.estado'));
  checar('handleCep ramifica em UMA condição sobre a BrasilAPI', ramosViaBrasil.length, 1);
  checar('e essa condição é "ok"', ramosViaBrasil[0].includes("=== 'ok'"), true);

  // (2) O rate limit tem que vir ANTES do primeiro fetch. Se alguém mover a
  // checagem para depois, o teto vira decoração: o upstream já foi consumido.
  const iLimite = src.indexOf('checarLimite(env.CEP_RL');
  const iFetch = src.indexOf('consultarBrasilApi(fetchFn, cep)');
  checar('a checagem de limite existe', iLimite > 0, true);
  checar('rate limit vem ANTES da primeira consulta', iLimite < iFetch, true);

  // (3) …e o cache vem antes do rate limit, porque acerto de cache não gasta
  // upstream e não deve competir por balde.
  const iCache = src.indexOf('const guardado = cacheCep.get(cep);');
  checar('cache é conferido antes do rate limit', iCache > 0 && iCache < iLimite, true);

  // (4) `indisponivel` nunca pode passar pelo gravador de cache.
  const gravacoes = src.split('\n').filter((l) => l.includes('guardarEResponder(') && !l.trim().startsWith('*') && !l.trim().startsWith('//') && !l.includes('function guardarEResponder'));
  checar('só 3 pontos gravam cache (2 ok + 1 nao_encontrado)', gravacoes.length, 3);
  checar('nenhum deles grava indisponivel', gravacoes.filter((l) => l.includes('indisponivel')), []);

  // (5) O campo legado `mei` continua existindo (src/services/cnpj.ts lê ele) e
  // os campos honestos foram somados, não trocados. Trocar quebraria o app de
  // outro agente; não somar deixaria o bug de pé.
  checar('handleCnpj mantém o campo legado mei', idx.includes('mei: !!d.opcao_pelo_mei'), true);
  checar('handleCnpj passou a mandar meiEstado', idx.includes('meiEstado: tresEstados(d.opcao_pelo_mei)'), true);
  checar('handleCnpj passou a mandar simplesEstado', idx.includes('simplesEstado: tresEstados(d.opcao_pelo_simples)'), true);
  checar('handleCnpj passou a mandar a situação cadastral', idx.includes('ativa: empresaAtiva(d)'), true);

  // (6) O cache de CNPJ tem 30 dias de vida e o formato mudou. Sem versão, uma
  // linha gravada ontem devolveria hoje um objeto SEM os campos novos, e
  // `undefined` viraria um quarto estado silencioso — o oposto do objetivo.
  checar('o cache de CNPJ é versionado', idx.includes('if (dados._v !== CNPJ_CACHE_V) return null;'), true);
  checar('e a versão de controle não vaza pro app', idx.includes('const { _v, ...empresa } = dados;'), true);

  // (7) Nenhuma chave PAGA nestas rotas — os dois upstreams são abertos, sem
  // cadastro. A única credencial tolerada é a `SUPABASE_ANON_KEY`, que é
  // pública por definição e serve só para validar o login. Se um dia alguém
  // trocar por um provedor com chave de verdade, este teste obriga a revisão —
  // e a revisão é sobre custo: chave paga muda a política de rate limit de
  // `sensivel:false` para `sensivel:true`.
  const credenciais = (src.match(/env\.[A-Z_]*(?:KEY|SECRET|TOKEN)/g) || []);
  checar('a única credencial usada é a anon key do Supabase (login)',
    [...new Set(credenciais)], ['env.SUPABASE_ANON_KEY']);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);

/*
 * ─── PROCEDÊNCIA DOS CORPOS MOCKADOS (reproduza antes de duvidar) ──────────
 *
 *   curl -s https://brasilapi.com.br/api/cep/v2/01001000
 *   curl -s -w "%{http_code}" https://brasilapi.com.br/api/cep/v2/00000000
 *   curl -s https://viacep.com.br/ws/01001000/json/
 *   curl -s https://viacep.com.br/ws/99999999/json/     → {"erro":"true"}, HTTP 200
 *   curl -s -w "%{http_code}" https://viacep.com.br/ws/123/json/   → HTTP 400, HTML
 *   curl -s https://brasilapi.com.br/api/feriados/v1/2026
 *
 * Rodados em 2026-07-18. O 404 da BrasilAPI para 00000000 traz
 * `"type":"service_error"` e "Todos os serviços de CEP retornaram erro." — o
 * mesmo corpo que ela daria com os quatro upstreams fora do ar. É a razão do
 * bloco 9 existir.
 *
 * Calendário oficial de 2026: Portaria MGI nº 11.460/2025 — dez feriados
 * nacionais e nove pontos facultativos. Carnaval (16 e 17/02), Quarta-feira de
 * Cinzas (18/02, até 14h) e Corpus Christi (04/06) são FACULTATIVOS;
 * Sexta-feira Santa (03/04) é feriado NACIONAL.
 * https://www.gov.br/gestao/pt-br/assuntos/noticias/2025/dezembro/confira-o-calendario-oficial-de-feriados-nacionais-e-pontos-facultativos-em-2026
 */
