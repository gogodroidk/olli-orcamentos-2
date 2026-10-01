/**
 * GERENCIADOR DA CONEXÃO DO BANCO LOCAL (B01 da auditoria de 30/09/2026) — a regra
 * PURA, sem expo-sqlite, para o teste rodar no Node (`scripts/teste-banco-conexao.ts`).
 *
 * O sintoma no celular: no meio do uso todas as abas passaram a dar erro ("Não deu
 * para carregar") e o "Tentar de novo" não recuperava — só force-stop. Três causas
 * no `getDb()` antigo, e cada uma tem a sua trava aqui:
 *
 *  1. ABERTURAS SIMULTÂNEAS. Dez telas chamando `getDb()` ao mesmo tempo abriam dez
 *     conexões e rodavam o `initDb` dez vezes em paralelo. → A abertura é ÚNICA: quem
 *     chega enquanto ela está em andamento recebe a MESMA promessa.
 *  2. CONEXÃO FECHADA COM LEITURA PENDENTE. A troca de partição (login de outra
 *     conta) fazia `closeAsync()` com consultas ainda rodando, e elas morriam com
 *     "Access to closed resource". → A troca é uma FILA (uma de cada vez), e a conexão
 *     velha só fecha quando as consultas em voo terminam (com prazo, para um SELECT
 *     travado não segurar o login para sempre).
 *  3. CONEXÃO MORTA NUNCA DESCARTADA. O cache era `if (!db)`: uma conexão morta ficava
 *     em memória e todo pedido seguinte falhava igual. → Erro de conexão morta
 *     ("closed resource" / "database is locked") DESCARTA a conexão; o próximo pedido
 *     abre outra. Uma instrução avulsa (runAsync/getAllAsync/getFirstAsync) é repetida
 *     UMA vez na conexão nova — é seguro porque ela não chegou a ser aplicada.
 *
 * E a quarta trava (a partição pronta): enquanto a troca de partição está na fila,
 * `obter()` ESPERA em vez de abrir o banco legado por engano. Uma abertura que
 * começou antes da troca e terminou depois é jogada fora (nasceu no arquivo errado).
 *
 * O que NUNCA é repetido sozinho: transação (pode ter efeito fora do banco no meio) e
 * `execAsync` (vários comandos; o primeiro pode já ter sido gravado). Também nunca se
 * repete numa conexão de OUTRO arquivo: uma escrita que começou na partição da conta A
 * jamais é refeita na partição da conta B.
 */

/** O mínimo que o gerenciador precisa saber do handle (o `SQLiteDatabase` do Expo cumpre). */
export interface HandleSql {
  closeAsync(): Promise<void>;
}

export interface OpcoesGerenciador<H extends HandleSql> {
  /** Abre o arquivo e deixa pronto para uso (schema + migrações). Se falhar, não deixa nada aberto. */
  abrir: (nome: string) => Promise<H>;
  /** Arquivo usado enquanto nenhuma partição foi escolhida (antes do login). */
  nomePadrao: string;
  /** Quanto a troca de partição espera as consultas em voo antes de fechar mesmo assim. */
  prazoDrenagemMs?: number;
  /** Espera antes de repetir depois de "database is locked" (o outro escritor termina). */
  esperaAntesDeRepetirMs?: number;
}

export interface GerenciadorDeConexao<H extends HandleSql> {
  /** A conexão do arquivo certo, aberta uma vez só. Espera a troca de partição em andamento. */
  obter(): Promise<H>;
  /**
   * Troca de partição na FILA: `resolverNome` roda sozinho (ninguém lê no meio) e a
   * conexão do arquivo antigo fecha depois de drenar. Devolve o nome resolvido.
   */
  trocarParticao(resolverNome: () => Promise<string>): Promise<string>;
  /** Roda `fn` com a conexão; se ela morrer no meio, descarta e tenta UMA vez de novo (mesmo arquivo). */
  comConexao<T>(fn: (handle: H) => Promise<T>): Promise<T>;
  /** Arquivo da partição escolhida (ou o aberto, antes do login). `null` = nada decidido. */
  nomeAtual(): string | null;
}

/** "Access to closed resource" (Android/iOS do expo-sqlite) e "database is locked" (SQLITE_BUSY). */
export function erroDeConexaoMorta(erro: unknown): boolean {
  const msg = erro instanceof Error ? erro.message : String(erro ?? '');
  return /closed resource|database is locked|sqlite_busy|database has been closed/i.test(msg);
}

function erroDeBancoTravado(erro: unknown): boolean {
  const msg = erro instanceof Error ? erro.message : String(erro ?? '');
  return /database is locked|sqlite_busy/i.test(msg);
}

/** Instruções avulsas: se falharam por conexão morta, não foram aplicadas — repetir é seguro. */
const METODOS_REPETIVEIS = new Set(['runAsync', 'getAllAsync', 'getFirstAsync']);
const METODOS_TRANSACAO = new Set(['withTransactionAsync', 'withExclusiveTransactionAsync']);

interface Conexao<H> {
  readonly nome: string;
  readonly handle: H;
  proxy: H;
  /** Chamadas assíncronas em voo nesta conexão. */
  usos: number;
  /** Transações abertas: dentro delas nada é repetido sozinho. */
  transacoes: number;
  /** Descartada (morreu ou a partição trocou): ninguém novo a recebe de `obter()`. */
  aposentada: boolean;
  fechamento: Promise<void> | null;
  aoDrenar: Array<() => void>;
}

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function criarGerenciadorDeConexao<H extends HandleSql>(
  op: OpcoesGerenciador<H>,
): GerenciadorDeConexao<H> {
  const prazoDrenagem = op.prazoDrenagemMs ?? 5_000;
  const esperaRepetir = op.esperaAntesDeRepetirMs ?? 60;

  let atual: Conexao<H> | null = null;
  /** Partição escolhida no login. `null` = ainda ninguém escolheu (usa `nomePadrao`). */
  let nomeAlvo: string | null = null;
  let abrindo: { nome: string; bruta: Promise<H>; promessa: Promise<Conexao<H>> } | null = null;
  /** Fila das trocas de partição: uma de cada vez. Nunca rejeita (é só o "fim da fila"). */
  let fila: Promise<void> = Promise.resolve();
  /**
   * Trocas pedidas e ainda não concluídas. Conta desde o PEDIDO (síncrono), não desde
   * o início da tarefa: um `getDb()` no mesmo tick do `abrirParticaoDoUsuario` já espera.
   */
  let trocasPendentes = 0;

  const alvo = () => nomeAlvo ?? op.nomePadrao;

  function liberarUso(c: Conexao<H>): void {
    c.usos--;
    if (c.usos <= 0) {
      c.usos = 0;
      const pendentes = c.aoDrenar.splice(0);
      for (const f of pendentes) f();
    }
  }

  function drenar(c: Conexao<H>): Promise<void> {
    if (c.usos === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let pronto = false;
      const fim = () => {
        if (pronto) return;
        pronto = true;
        clearTimeout(timer);
        resolve();
      };
      // Prazo: um SELECT travado não pode segurar a troca de conta para sempre.
      const timer = setTimeout(fim, prazoDrenagem);
      c.aoDrenar.push(fim);
    });
  }

  /** Tira de circulação e fecha DEPOIS que as consultas em voo terminarem. Nunca lança. */
  function aposentar(c: Conexao<H>): Promise<void> {
    c.aposentada = true;
    if (atual === c) atual = null;
    if (!c.fechamento) {
      c.fechamento = (async () => {
        await drenar(c);
        try {
          await c.handle.closeAsync();
        } catch {
          // conexão já morta não fecha de novo; isso não pode travar ninguém
        }
      })();
    }
    return c.fechamento;
  }

  function chamar(c: Conexao<H>, metodo: string, args: unknown[], jaRepetiu: boolean): unknown {
    const fn = (c.handle as unknown as Record<string, (...a: unknown[]) => unknown>)[metodo];
    const transacao = METODOS_TRANSACAO.has(metodo);
    c.usos++;
    if (transacao) c.transacoes++;
    const soltar = () => {
      if (transacao) c.transacoes--;
      liberarUso(c);
    };
    let resultado: unknown;
    try {
      resultado = fn.apply(c.handle, args);
    } catch (e) {
      soltar();
      throw e;
    }
    if (!resultado || typeof (resultado as Promise<unknown>).then !== 'function') {
      soltar(); // não é promessa (ex.: iterador do getEachAsync): nada a contar
      return resultado;
    }
    // Decide se pode repetir ANTES de soltar a transação desta própria chamada.
    return (resultado as Promise<unknown>).then(
      (v) => {
        soltar();
        return v;
      },
      async (erro) => {
        const dentroDeTransacao = c.transacoes - (transacao ? 1 : 0) > 0;
        soltar();
        if (!erroDeConexaoMorta(erro)) throw erro;
        void aposentar(c); // o próximo pedido abre outra conexão — o "Tentar de novo" volta a funcionar
        const podeRepetir =
          !jaRepetiu &&
          METODOS_REPETIVEIS.has(metodo) &&
          !dentroDeTransacao &&
          alvo() === c.nome; // nunca refaz na partição de OUTRA conta
        if (!podeRepetir) throw erro;
        if (erroDeBancoTravado(erro)) await esperar(esperaRepetir);
        const nova = await obterConexao();
        if (nova.nome !== c.nome) throw erro;
        return chamar(nova, metodo, args, true);
      },
    );
  }

  function embrulhar(c: Conexao<H>): H {
    return new Proxy(c.handle as unknown as object, {
      get(alvoObj, prop) {
        const valor = Reflect.get(alvoObj, prop, alvoObj);
        if (typeof valor !== 'function') return valor;
        if (prop === 'closeAsync') {
          // Fechar "por fora" passa pelo gerenciador: drena e tira de circulação.
          return () => aposentar(c);
        }
        if (typeof prop === 'string' && prop.endsWith('Async')) {
          return (...args: unknown[]) => chamar(c, prop, args, false);
        }
        return (valor as (...a: unknown[]) => unknown).bind(alvoObj);
      },
    }) as H;
  }

  function abrirUnica(): Promise<Conexao<H>> {
    const nome = alvo();
    if (abrindo && abrindo.nome === nome) return abrindo.promessa;
    const bruta = op.abrir(nome);
    const promessa = bruta.then((handle): Conexao<H> | Promise<Conexao<H>> => {
      // Síncrono de propósito: a troca de partição espera `bruta` e roda DEPOIS desta
      // reação — quando ela olhar `atual`, a decisão já foi tomada.
      if (alvo() !== nome) {
        // A partição mudou enquanto abríamos: esta conexão nasceu no arquivo errado.
        handle.closeAsync().catch(() => {});
        return obterConexao();
      }
      const c: Conexao<H> = {
        nome,
        handle,
        proxy: handle,
        usos: 0,
        transacoes: 0,
        aposentada: false,
        fechamento: null,
        aoDrenar: [],
      };
      c.proxy = embrulhar(c);
      atual = c;
      return c;
    });
    const registro = { nome, bruta, promessa };
    abrindo = registro;
    const limpar = () => {
      if (abrindo === registro) abrindo = null;
    };
    bruta.then(limpar, limpar);
    return promessa;
  }

  async function obterConexao(): Promise<Conexao<H>> {
    // Partição pronta: quem pede durante a troca espera, não cai no banco legado.
    while (trocasPendentes > 0) await fila;
    if (atual && !atual.aposentada) return atual;
    return abrirUnica();
  }

  async function trocarInterno(nome: string): Promise<void> {
    nomeAlvo = nome;
    // Uma abertura em voo decide sozinha (publica se for do arquivo certo, descarta
    // se não for) logo que termina; aqui só esperamos ela terminar.
    if (abrindo) await abrindo.bruta.then(() => {}, () => {});
    const velha = atual;
    if (velha && velha.nome !== nome) await aposentar(velha);
  }

  return {
    async obter() {
      return (await obterConexao()).proxy;
    },

    trocarParticao(resolverNome) {
      trocasPendentes++;
      const tarefa = fila.then(async () => {
        try {
          const nome = await resolverNome();
          await trocarInterno(nome);
          return nome;
        } finally {
          trocasPendentes--;
        }
      });
      fila = tarefa.then(
        () => {},
        () => {},
      );
      return tarefa;
    },

    async comConexao(fn) {
      const c = await obterConexao();
      try {
        return await fn(c.proxy);
      } catch (erro) {
        if (!erroDeConexaoMorta(erro) || alvo() !== c.nome) throw erro;
        void aposentar(c);
        const nova = await obterConexao();
        if (nova.nome !== c.nome) throw erro;
        return fn(nova.proxy);
      }
    },

    nomeAtual() {
      return nomeAlvo ?? atual?.nome ?? null;
    },
  };
}
