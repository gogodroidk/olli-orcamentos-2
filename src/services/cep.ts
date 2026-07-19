/**
 * cep.ts — CEP → endereço, app-side.
 *
 * Contrato do endpoint (worker `olli-diagnostico`, `GET /cep/<8 dígitos>` — ver
 * `worker/src/brasil.js` → `handleCep`): mesmo padrão de auth do `cnpj.ts`
 * (token do Supabase no header `Authorization`, base em `DIAGNOSTICO_URL`).
 *
 *   200 { ok:true,  estado:'ok', endereco:{cep,logradouro,bairro,cidade,uf[,lat,lng]}, fonte, cache }
 *   404 { ok:false, estado:'nao_encontrado', cep }
 *   400 { ok:false, estado:'invalido' }
 *   200 { ok:false, estado:'indisponivel', erro }   (também 401/429)
 *
 * ─── POR QUE ISTO DEIXOU DE CHAMAR O ViaCEP DIRETO ─────────────────────────
 * A versão anterior deste arquivo chamava o ViaCEP do aparelho e devolvia
 * `null` para TUDO — CEP inexistente, ViaCEP fora, rede caída, JSON quebrado.
 * O comentário dela assumia ("Falha silenciosa"). É o bug recorrente
 * `olli-gate-erro-vira-vazio` na forma mais barata de cometer: "não sei" chega
 * na tela como "não tem".
 *
 * A diferença importa na mão do prestador, em pé, na frente do cliente:
 *   "Esse CEP não existe"        → ele confere o número COM o cliente.
 *   "Não consegui consultar"     → ele digita e segue, sem constranger ninguém.
 * Mandar a primeira mensagem quando a verdade é a segunda faz ele desconfiar do
 * cliente por um problema nosso.
 *
 * ─── POR QUE O ViaCEP AINDA EXISTE AQUI (e não é "manter os dois") ─────────
 * A §11.6 do inventário manda o `/cep` SUBSTITUIR o `buscarCep`, para a falha
 * silenciosa não sobreviver em metade dos caminhos. Foi o que aconteceu: o
 * `buscarCep` que colapsava tudo em `null` MORREU.
 *
 * O que sobrou é outra coisa — uma segunda porta que devolve os MESMOS quatro
 * estados. Ela existe porque duas portas do app não têm worker:
 *   1. `DIAGNOSTICO_URL` é vazio quando a env var não vem (config.ts, sem
 *      fallback de propósito). Sem esta porta, um build assim perde a busca de
 *      CEP inteira — regressão pura contra o que está em produção hoje.
 *   2. O Onboarding roda ANTES de existir sessão. A rota do worker é
 *      autenticada; sem token ela devolve 401. O prestador que está criando a
 *      conta é justamente quem mais precisa do atalho.
 * O ViaCEP direto pode dizer `nao_encontrado` com honestidade porque a marca
 * dele (`{"erro":"true"}`, HTTP 200) é inequívoca — é por isso que ele é o
 * ÁRBITRO também dentro do worker. O que não se pode importar é o 404 ambíguo
 * da BrasilAPI, e esse fica do outro lado, no worker (ver `brasil.js`).
 *
 * ─── OFFLINE PRIMEIRO ──────────────────────────────────────────────────────
 * Nada aqui bloqueia digitação. A consulta é ATALHO: some o preenchimento
 * automático, nunca o campo. Nenhuma função lança; todas resolvem um dos
 * quatro estados.
 */
import { useCallback, useRef, useState } from 'react';
import { DIAGNOSTICO_URL } from '../config';
import { supabase } from './supabase';

export interface EnderecoCEP {
  cep: string;
  logradouro: string; // rua / logradouro
  bairro: string;
  cidade: string;     // `localidade` no ViaCEP, `city` na BrasilAPI
  uf: string;         // estado (2 letras)
  /**
   * Coordenada, quando o upstream mandar. A BrasilAPI v2 promete
   * `location.coordinates` e entrega vazio quase sempre (5 de 5 consultas reais
   * em 2026-07-18 — ver `worker/src/brasil.js`). Por isso é OPCIONAL e nada
   * pode ser desenhado contando com ela: quando vem, poupa uma chamada paga de
   * geocoding; quando não vem, o campo simplesmente não existe. Nunca 0,0.
   */
  lat?: number;
  lng?: number;
}

/**
 * Os QUATRO estados. `nao_encontrado` e `indisponivel` são fatos diferentes e
 * TÊM que virar mensagens diferentes na tela — se renderizarem igual, todo
 * este arquivo foi desperdício (é literalmente o bug que ele existe pra matar).
 */
export type ResultadoCep =
  | { estado: 'ok'; endereco: EnderecoCEP; fonte: string }
  | { estado: 'nao_encontrado' }
  | { estado: 'invalido' }
  | { estado: 'indisponivel' };

/** Timeout da chamada ao worker. Rede ruim é o normal deste público: falhar rápido e liberar a digitação. */
const TIMEOUT_WORKER_MS = 6000;
/** Segunda porta, mais curta ainda: quem chegou aqui já esperou o worker. */
const TIMEOUT_VIACEP_MS = 5000;

/** Só os 8 dígitos (aceita máscara: o campo do app tem uma). */
export function apenasDigitosCep(bruto: string): string {
  return (bruto ?? '').replace(/\D/g, '').slice(0, 8);
}

/**
 * Cache em memória, só de SUCESSO. Editar um cadastro repetido não deve custar
 * rede de novo. `nao_encontrado` não é cacheado aqui de propósito: o worker já
 * segura o negativo por 24h, e um CEP que não existe hoje pode existir mês que
 * vem (loteamento novo ganha faixa) — cachear ausência no aparelho faria o app
 * insistir que o endereço do cliente é inválido. `indisponivel` muito menos:
 * guardar erro transforma falha de 3 s em CEP morto.
 */
const cacheEndereco = new Map<string, { endereco: EnderecoCEP; fonte: string }>();

/** Só para teste: o mapa é de módulo, e teste que herda cache do vizinho não prova nada. */
export function limparCacheCep(): void {
  cacheEndereco.clear();
}

async function tokenAtual(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Número finito e dentro do planeta, ou `undefined`. 0,0 é um ponto no Atlântico, não endereço. */
function coordenadaValida(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : undefined;
}

/** Molda o `endereco` do worker no shape do app (defensivo contra worker mais novo/velho). */
function normalizarEndereco(e: any, cep: string): EnderecoCEP | null {
  const cidade = String(e?.cidade ?? '').trim();
  const uf = String(e?.uf ?? '').trim().toUpperCase().slice(0, 2);
  // Sem cidade e UF não é endereço utilizável — e endereço pela metade preenche
  // o formulário com meia verdade, que é pior que campo vazio.
  if (!cidade || uf.length !== 2) return null;
  const endereco: EnderecoCEP = {
    cep: String(e?.cep ?? cep),
    logradouro: String(e?.logradouro ?? '').trim(),
    bairro: String(e?.bairro ?? '').trim(),
    cidade,
    uf,
  };
  const lat = coordenadaValida(e?.lat);
  const lng = coordenadaValida(e?.lng);
  if (lat !== undefined && lng !== undefined) {
    endereco.lat = lat;
    endereco.lng = lng;
  }
  return endereco;
}

/**
 * Consulta o worker. Devolve `null` quando NÃO FOI POSSÍVEL FALAR COM ELE
 * (sem URL, sem sessão, rede caída, 5xx, corpo ilegível) — que é diferente de
 * ele ter respondido `indisponivel`. Só o `null` autoriza a segunda porta: se o
 * worker respondeu, ele já tentou BrasilAPI **e** ViaCEP, e repetir o ViaCEP do
 * aparelho só somaria 5 s de espera ao mesmo veredito.
 */
async function consultarNoWorker(cep: string): Promise<ResultadoCep | null> {
  if (!DIAGNOSTICO_URL) return null;
  const token = await tokenAtual();
  if (!token) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_WORKER_MS);
  try {
    const r = await fetch(`${DIAGNOSTICO_URL}/cep/${cep}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    // 401 (sessão expirada) e 429 (rate limit) não são "não existe": são "não
    // consegui consultar", e o worker já os manda com estado 'indisponivel'.
    // Mas token vencido é caso de tentar a segunda porta, que não precisa dele.
    if (r.status === 401) return null;

    const data: any = await r.json().catch(() => null);
    if (!data) return null;

    if (data.estado === 'ok' && data.ok === true) {
      const endereco = normalizarEndereco(data.endereco, cep);
      // Worker disse ok mas mandou endereço inutilizável: isso é "não sei",
      // NUNCA "não tem" — e nunca sucesso com campo em branco.
      if (!endereco) return { estado: 'indisponivel' };
      return { estado: 'ok', endereco, fonte: String(data.fonte ?? 'worker') };
    }
    if (data.estado === 'nao_encontrado') return { estado: 'nao_encontrado' };
    if (data.estado === 'invalido') return { estado: 'invalido' };
    if (data.estado === 'indisponivel') return { estado: 'indisponivel' };
    // Corpo que não bate com o contrato: trata como worker inalcançável.
    return null;
  } catch {
    // Timeout/offline/DNS: o worker não respondeu. Tenta a segunda porta.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Segunda porta: ViaCEP direto do aparelho. Devolve os MESMOS estados.
 *
 * `{"erro":"true"}` com HTTP 200 é a marca de inexistente — e vem como
 * **string** (a doc antiga mostra booleano), então os dois são aceitos.
 * Comparar com `=== true` deixaria o inexistente passar como endereço em branco.
 */
async function consultarViaCepDireto(cep: string): Promise<ResultadoCep> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_VIACEP_MS);
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    // Já validamos 8 dígitos antes de chegar aqui, então um 400 é problema do
    // lado dele — e problema dele nunca vira "esse CEP não existe".
    if (!r.ok) return { estado: 'indisponivel' };
    const d: any = await r.json().catch(() => null);
    if (!d || typeof d !== 'object') return { estado: 'indisponivel' };
    if (d.erro === true || d.erro === 'true') return { estado: 'nao_encontrado' };
    const endereco = normalizarEndereco(
      { cep: d.cep, logradouro: d.logradouro, bairro: d.bairro, cidade: d.localidade, uf: d.uf },
      cep,
    );
    if (!endereco) return { estado: 'indisponivel' };
    return { estado: 'ok', endereco, fonte: 'viacep_app' };
  } catch {
    return { estado: 'indisponivel' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * CEP → endereço. NUNCA lança; sempre resolve um dos quatro estados.
 * Cadeia: cache → worker (BrasilAPI + ViaCEP, com cache e rate limit) →
 * ViaCEP direto, só quando o worker está fora de alcance.
 */
export async function consultarCep(cepBruto: string): Promise<ResultadoCep> {
  const cep = apenasDigitosCep(cepBruto);
  if (cep.length !== 8) return { estado: 'invalido' };

  const cacheado = cacheEndereco.get(cep);
  if (cacheado) return { estado: 'ok', endereco: cacheado.endereco, fonte: cacheado.fonte };

  const doWorker = await consultarNoWorker(cep);
  const resultado = doWorker ?? (await consultarViaCepDireto(cep));

  if (resultado.estado === 'ok') {
    cacheEndereco.set(cep, { endereco: resultado.endereco, fonte: resultado.fonte });
  }
  return resultado;
}

// ═══════════════════════════════════════════════════════════════════════════
// MESCLAGEM — "nunca sobrescreva o que o usuário digitou sem ele perceber"
// ═══════════════════════════════════════════════════════════════════════════

/** Campos de endereço que as telas de cliente mantêm (ver `types.Cliente`). */
export interface CamposEndereco {
  endereco?: string;
  cidade?: string;
  estado?: string;
}

/** Um campo em que o que ele digitou e o que o CEP diz não batem. Ele decide. */
export interface DivergenciaCep {
  campo: 'cidade' | 'estado';
  rotulo: string;
  seu: string;
  doCep: string;
}

export interface MesclaCep {
  /** O que aplicar AGORA — só campos que estavam vazios. */
  campos: CamposEndereco;
  /** O que NÃO foi tocado por já ter conteúdo diferente. Vira pergunta na tela. */
  divergencias: DivergenciaCep[];
}

/**
 * Marcas de acento que o `normalize('NFD')` separa da letra.
 *
 * Construído por `RegExp` com escapes em STRING, e não como literal `/[..]/`:
 * o range é de caracteres combinantes, invisíveis no editor, e um salvamento
 * com encoding errado os apaga CALADO — deixando "São Paulo" ≠ "Sao Paulo"
 * outra vez, que aqui significa acusar divergência de cidade onde não há.
 */
const DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g');

/** Compara ignorando caixa, acento e espaço duplo: "sao paulo" e "São Paulo" são o MESMO valor. */
function mesmoTexto(a: string, b: string): boolean {
  const limpar = (s: string) =>
    (s ?? '')
      .normalize('NFD')
      // Escape explícito (não o caractere literal): o range de diacríticos
      // combinantes é invisível no editor e some num salvamento com encoding
      // errado — e some CALADO, deixando "São Paulo" ≠ "Sao Paulo" de novo.
      .replace(DIACRITICOS, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  return limpar(a) === limpar(b);
}

/**
 * Decide o que o CEP pode preencher. A regra dura: **campo com conteúdo não é
 * tocado.** Campo vazio é preenchido (é o atalho inteiro — tirar 4 digitações
 * do celular de quem está de luva).
 *
 * `endereco` (logradouro) tem tratamento próprio e NÃO gera divergência: é
 * texto livre que já carrega o número ("Av. Paulista 1000"), então comparar com
 * o logradouro puro do CEP acusaria conflito em quase todo cadastro preenchido.
 * Alarme que dispara sempre é alarme que ninguém lê. Cidade e UF são valores
 * canônicos e curtos — nesses, divergência é sinal de verdade (CEP digitado
 * errado, ou cliente que mudou de cidade).
 */
export function mesclarEndereco(atual: CamposEndereco, achado: EnderecoCEP): MesclaCep {
  const campos: CamposEndereco = {};
  const divergencias: DivergenciaCep[] = [];

  const enderecoAtual = (atual.endereco ?? '').trim();
  if (!enderecoAtual && achado.logradouro) campos.endereco = achado.logradouro;

  const pares = [
    { campo: 'cidade' as const, rotulo: 'Cidade', seu: (atual.cidade ?? '').trim(), doCep: achado.cidade },
    { campo: 'estado' as const, rotulo: 'UF', seu: (atual.estado ?? '').trim(), doCep: achado.uf },
  ];
  for (const p of pares) {
    if (!p.doCep) continue;
    if (!p.seu) {
      campos[p.campo] = p.doCep;
      continue;
    }
    if (!mesmoTexto(p.seu, p.doCep)) {
      divergencias.push({ campo: p.campo, rotulo: p.rotulo, seu: p.seu, doCep: p.doCep });
    }
  }

  return { campos, divergencias };
}

/**
 * O "sim" explícito dele: aplica os campos divergentes. Só é chamado por toque
 * no botão — nunca automaticamente. `endereco` continua fora: o número mora
 * nele, e sobrescrever apagaria o número que ele acabou de digitar.
 */
export function aplicarDivergencias(divergencias: DivergenciaCep[]): CamposEndereco {
  const campos: CamposEndereco = {};
  for (const d of divergencias) campos[d.campo] = d.doCep;
  return campos;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════

/** `ocioso` = ninguém consultou ainda (≠ de "consultei e não achei"). */
export type EstadoBuscaCep = 'ocioso' | 'consultando' | 'ok' | 'nao_encontrado' | 'invalido' | 'indisponivel';

/**
 * Lista vazia COMPARTILHADA, não `[]` a cada limpeza.
 *
 * O reset por `chave` roda na fase de render (ver abaixo). `setDivergencias([])`
 * com literal novo nunca é igual ao estado anterior, então o React re-renderiza
 * mesmo quando não havia nada a limpar. Com uma referência estável ele desiste
 * sozinho (`Object.is`) e o caso comum — abrir uma tela que já estava limpa —
 * custa zero render extra.
 *
 * Congelada em runtime porque é compartilhada: quem mutasse isto mutaria o
 * "vazio" de todas as telas de uma vez. O TIPO continua mutável de propósito —
 * `BuscaCep.divergencias` é `DivergenciaCep[]`, e trocar por `readonly` só para
 * enfeitar esta linha arrastaria o <AvisoCep> e as quatro telas junto.
 */
const SEM_DIVERGENCIA: DivergenciaCep[] = [];
Object.freeze(SEM_DIVERGENCIA);

export interface BuscaCep {
  estadoCep: EstadoBuscaCep;
  /** O endereço achado, para a tela poder mostrar bairro (que não tem campo próprio). */
  enderecoCep: EnderecoCEP | null;
  divergencias: DivergenciaCep[];
  onCepChange: (masked: string, atualizarCampo: (masked: string) => void) => void;
  /** Aplica as divergências (toque do usuário no "Usar o do CEP") e limpa o aviso. */
  usarDoCep: () => void;
}

/**
 * Hook do padrão "digitou o CEP → completa o endereço". Ao fechar 8 dígitos,
 * consulta e chama `preencher` com os campos que PODEM ser preenchidos (os
 * vazios). O que divergir fica em `divergencias`, para a tela perguntar.
 *
 * `lerAtual` é o que permite a regra "não sobrescreve": o hook precisa saber o
 * que já está no formulário no momento da resposta — não no momento do toque.
 *
 * ─── `chave`: A QUE REGISTRO ESTE VEREDITO PERTENCE ────────────────────────
 * O hook vive no componente PAI, que não desmonta entre um cliente e outro (o
 * formulário é `<Modal visible=...>`, não montagem condicional do dono do
 * estado). Fechar e reabrir reseta o formulário e os erros — `estadoCep`,
 * `enderecoCep` e `divergencias` ficavam. Resultado real: cadastrava o cliente
 * A com divergência de cidade, salvava, abria "Novo Cliente", e a caixa amarela
 * do A continuava na tela com o botão "Usar o do CEP" ATIVO. Um toque gravava a
 * cidade do A no cliente B, calado. E pior que o botão: uma resposta de CEP
 * ainda no ar quando o formulário troca caía dentro do registro NOVO, porque
 * `preencherRef` sempre aponta para o formulário atual.
 *
 * DUAS SAÍDAS EXISTIAM. Expor um `limpar()` para cada tela chamar ao abrir o
 * modal é a mais óbvia — e é exatamente assim que esta família de bug nasce:
 * são QUATRO telas hoje, e a quinta esquece. `chave` foi escolhida porque
 * transfere a obrigação do revisor para o compilador: o parâmetro é
 * OBRIGATÓRIO, então uma tela nova não compila sem declarar de quem é o
 * veredito, e o hook se invalida sozinho quando essa resposta muda. Nenhuma
 * tela precisa lembrar de limpar nada.
 *
 * O que passar: algo que mude quando o ASSUNTO muda — o id do cliente em
 * edição, um marcador de "formulário fechado", ou uma constante em fluxo único
 * (Onboarding: uma empresa só, sem troca de registro).
 *
 * O reset roda na FASE DE RENDER, não em `useEffect`: efeito só corre depois da
 * pintura, e um único quadro com a caixa amarela do cliente anterior sobre o
 * formulário em branco já é o toque errado.
 */
export function useCepLookup(
  preencher: (campos: CamposEndereco, achado: EnderecoCEP) => void,
  lerAtual: () => CamposEndereco,
  chave: string | number,
): BuscaCep {
  const [estadoCep, setEstadoCep] = useState<EstadoBuscaCep>('ocioso');
  const [enderecoCep, setEnderecoCep] = useState<EnderecoCEP | null>(null);
  const [divergencias, setDivergencias] = useState<DivergenciaCep[]>(SEM_DIVERGENCIA);
  /**
   * Sequência da consulta. Sem ela, apagar um dígito e digitar outro deixa duas
   * consultas no ar e a MAIS LENTA vence — o formulário fica com o endereço do
   * CEP anterior, que é a pior forma de errar: silenciosa e plausível.
   */
  const pedidoRef = useRef(0);
  const lerAtualRef = useRef(lerAtual);
  lerAtualRef.current = lerAtual;
  const preencherRef = useRef(preencher);
  preencherRef.current = preencher;

  // Trocou o assunto: o veredito anterior morre AQUI, antes de qualquer pintura.
  const chaveRef = useRef(chave);
  if (chaveRef.current !== chave) {
    chaveRef.current = chave;
    // Incrementar o pedido é metade do conserto: derruba também a consulta que
    // ainda está no ar do registro ANTERIOR, que senão preencheria o novo.
    pedidoRef.current += 1;
    setEstadoCep('ocioso');
    setEnderecoCep(null);
    setDivergencias(SEM_DIVERGENCIA);
  }

  const onCepChange = useCallback((masked: string, atualizarCampo: (masked: string) => void) => {
    // O campo é atualizado SEMPRE e primeiro. A consulta é enfeite por cima da
    // digitação, nunca condição dela — sem rede, o CEP continua digitável.
    atualizarCampo(masked);
    const digits = apenasDigitosCep(masked);
    if (digits.length !== 8) {
      // Voltou a ser um CEP incompleto: derruba o veredito anterior, senão a
      // tela mostraria "não achei" enquanto ele ainda está digitando outro.
      pedidoRef.current += 1;
      setEstadoCep('ocioso');
      setEnderecoCep(null);
      setDivergencias(SEM_DIVERGENCIA);
      return;
    }

    const meu = (pedidoRef.current += 1);
    setEstadoCep('consultando');
    setDivergencias(SEM_DIVERGENCIA);
    void consultarCep(digits)
      .then(r => {
        if (meu !== pedidoRef.current) return; // resposta velha: descarta
        setEstadoCep(r.estado);
        if (r.estado !== 'ok') {
          setEnderecoCep(null);
          return;
        }
        setEnderecoCep(r.endereco);
        const { campos, divergencias: divs } = mesclarEndereco(lerAtualRef.current(), r.endereco);
        setDivergencias(divs);
        preencherRef.current(campos, r.endereco);
      })
      .catch(() => {
        if (meu !== pedidoRef.current) return;
        // `consultarCep` não lança, mas se um dia lançar isto é "não sei" —
        // nunca silêncio, que a tela leria como "não tem".
        setEstadoCep('indisponivel');
        setEnderecoCep(null);
      });
  }, []);

  // O efeito acontece FORA do updater de estado: `setState(fn)` pode rodar `fn`
  // duas vezes (StrictMode), e preencher o formulário duas vezes a partir de um
  // toque é o tipo de bug que só aparece em release.
  const usarDoCep = useCallback(() => {
    if (divergencias.length === 0 || !enderecoCep) return;
    preencherRef.current(aplicarDivergencias(divergencias), enderecoCep);
    setDivergencias(SEM_DIVERGENCIA);
  }, [divergencias, enderecoCep]);

  return { estadoCep, enderecoCep, divergencias, onCepChange, usarDoCep };
}
