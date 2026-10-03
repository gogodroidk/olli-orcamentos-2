import { ajustarSessaoParaGravar, prepararSessaoParaLeitura } from './sessaoRelogio.ts';

const INSTALL_MARKER_KEY = 'olli.auth.install.v1';
const CHUNK_CODEPOINTS = 400;
const MAX_CHUNKS = 64;
let sequencia = 0;

export interface StorageAsync {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface StorageSeguro {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

/**
 * Relógio usado para a sessão aguentar celular com data/hora errada (ver
 * services/sessaoRelogio.ts). Injetado para o teste simular +21 dias e -2 h.
 */
export interface RelogioSessao {
  agora(): number;
  /** Medida mais recente (aparelho − servidor, ms) ou `null` quando ainda não há. */
  defasagemAtualMs(): number | null;
  /** Avisado quando um token recém-emitido revela a defasagem (segundos). */
  aoMedirDefasagem(defasagemSeg: number, agoraMs: number): void;
}

const RELOGIO_PADRAO: RelogioSessao = {
  agora: () => Date.now(),
  defasagemAtualMs: () => null,
  aoMedirDefasagem: () => {},
};

interface Manifesto {
  v: 1;
  geracao: string;
  partes: number;
}

function chaveBase(chave: string): string {
  return `olli.supabase.auth.${chave.replace(/[^a-z0-9._-]/gi, '_')}`;
}

function chaveManifesto(chave: string): string {
  return `${chaveBase(chave)}.manifest`;
}

function chaveParte(chave: string, geracao: string, indice: number): string {
  return `${chaveBase(chave)}.${geracao}.${indice}`;
}

function dividir(valor: string): string[] {
  const codepoints = Array.from(valor);
  const partes: string[] = [];
  for (let i = 0; i < codepoints.length; i += CHUNK_CODEPOINTS) {
    partes.push(codepoints.slice(i, i + CHUNK_CODEPOINTS).join(''));
  }
  return partes.length ? partes : [''];
}

function interpretarManifesto(raw: string | null): Manifesto | null {
  if (!raw) return null;
  try {
    const valor = JSON.parse(raw) as Partial<Manifesto>;
    if (valor.v !== 1 || typeof valor.geracao !== 'string' || !/^[a-z0-9-]{4,64}$/i.test(valor.geracao)) return null;
    if (!Number.isInteger(valor.partes) || !valor.partes || valor.partes < 1 || valor.partes > MAX_CHUNKS) return null;
    return valor as Manifesto;
  } catch {
    return null;
  }
}

async function apagarPartes(seguro: StorageSeguro, chave: string, manifesto: Manifesto | null): Promise<void> {
  if (!manifesto) return;
  await Promise.all(
    Array.from({ length: manifesto.partes }, (_, indice) =>
      seguro.deleteItemAsync(chaveParte(chave, manifesto.geracao, indice)).catch(() => {}),
    ),
  );
}

/**
 * Storage de sessão grande sobre uma interface segura. Escreve partes numa
 * geração nova e publica o manifesto por último; leitura nunca vê meia sessão.
 */
export class AuthStorageSeguro {
  private readonly legado: StorageAsync;
  private readonly seguro: StorageSeguro;
  private readonly relogio: RelogioSessao;
  /** Supabase pode persistir a sessão mais de uma vez em paralelo (login + refresh). */
  private filaEscrita: Promise<void> = Promise.resolve();

  constructor(legado: StorageAsync, seguro: StorageSeguro, relogio: RelogioSessao = RELOGIO_PADRAO) {
    this.legado = legado;
    this.seguro = seguro;
    this.relogio = relogio;
  }

  /**
   * Toda leitura passa por aqui: o prazo da sessão é refeito com a defasagem
   * atual do relógio e ganha o piso de 30 s entre refreshes. Valor que não é
   * sessão volta idêntico. Nunca lança: na dúvida, devolve o que estava guardado.
   */
  private paraLeitura(valor: string | null): string | null {
    if (valor === null) return null;
    try {
      return prepararSessaoParaLeitura(valor, this.relogio.agora(), this.relogio.defasagemAtualMs());
    } catch {
      return valor;
    }
  }

  private async lerManifesto(chave: string): Promise<Manifesto | null> {
    return interpretarManifesto(await this.seguro.getItemAsync(chaveManifesto(chave)));
  }

  private async marcarInstalacao(): Promise<void> {
    await this.legado.setItem(INSTALL_MARKER_KEY, '1');
  }

  private enfileirar<T>(tarefa: () => Promise<T>): Promise<T> {
    const proxima = this.filaEscrita.then(tarefa);
    // A fila continua viva mesmo quando uma operação individual falha.
    this.filaEscrita = proxima.then(() => undefined, () => undefined);
    return proxima;
  }

  async getItem(chave: string): Promise<string | null> {
    return this.paraLeitura(await this.lerItemBruto(chave));
  }

  private async lerItemBruto(chave: string): Promise<string | null> {
    const [marcador, legado, manifesto] = await Promise.all([
      this.legado.getItem(INSTALL_MARKER_KEY),
      this.legado.getItem(chave),
      this.lerManifesto(chave),
    ]);

    if (!marcador && !legado) {
      if (manifesto) {
        // O marcador fica no AsyncStorage e pode ser perdido isoladamente por
        // migração/restore do sandbox. Se o manifesto + partes seguros estão
        // íntegros, preservar a sessão é mais correto que transformar isso em
        // logout; reinstalação real limpa o SecureStore junto com o app.
        const partes = await Promise.all(
          Array.from({ length: manifesto.partes }, (_, indice) =>
            this.seguro.getItemAsync(chaveParte(chave, manifesto.geracao, indice)),
          ),
        );
        if (partes.every((parte): parte is string => parte !== null)) {
          await this.marcarInstalacao().catch(() => {});
          return partes.join('');
        }
      }
      await this.marcarInstalacao().catch(() => {});
      return null;
    }

    if (manifesto) {
      const partes = await Promise.all(
        Array.from({ length: manifesto.partes }, (_, indice) =>
          this.seguro.getItemAsync(chaveParte(chave, manifesto.geracao, indice)),
        ),
      );
      if (partes.some((parte) => parte === null)) return null;
      if (!marcador) await this.marcarInstalacao().catch(() => {});
      // Uma falha antiga ao apagar o plaintext nao pode manter uma segunda
      // copia para sempre. A sessao segura ja esta completa; tente limpar de
      // novo sem transformar uma indisponibilidade do AsyncStorage em logout.
      if (legado) await this.legado.removeItem(chave).catch(() => {});
      return partes.join('');
    }

    if (!legado) {
      if (!marcador) await this.marcarInstalacao().catch(() => {});
      return null;
    }

    try {
      // Sessão migrada do texto puro antigo: a idade do token é desconhecida.
      // Passa pela leitura antes (ganha a marca "não sei") para a gravação não a
      // tratar como recém-emitida e esticar o prazo pela idade do token.
      const migrada = this.paraLeitura(legado) ?? legado;
      await this.setItem(chave, migrada);
      return migrada;
    } catch {
      return null;
    }
  }

  private async escreverItem(chave: string, valor: string): Promise<void> {
    const anterior = await this.lerManifesto(chave);
    const partes = dividir(valor);
    if (partes.length > MAX_CHUNKS) throw new Error('auth_storage_payload_muito_grande');
    const geracao = `${Date.now().toString(36)}-${(++sequencia).toString(36)}`;
    const novo: Manifesto = { v: 1, geracao, partes: partes.length };
    const gravadas: number[] = [];

    try {
      for (let indice = 0; indice < partes.length; indice += 1) {
        await this.seguro.setItemAsync(chaveParte(chave, geracao, indice), partes[indice]);
        gravadas.push(indice);
      }
      // O manifesto e o ponto de commit: ele so passa a apontar para a nova
      // geracao depois de todas as partes existirem. Metadados auxiliares nao
      // podem desfazer esse commit nem apagar a sessao recem-publicada.
      await this.seguro.setItemAsync(chaveManifesto(chave), JSON.stringify(novo));
    } catch (erro) {
      await Promise.all(gravadas.map((indice) => this.seguro.deleteItemAsync(chaveParte(chave, geracao, indice)).catch(() => {})));
      throw erro;
    }

    await this.marcarInstalacao().catch(() => {});
    await this.legado.removeItem(chave).catch(() => {});
    await apagarPartes(this.seguro, chave, anterior);
  }

  async setItem(chave: string, valor: string): Promise<void> {
    // O ajuste de relógio acontece ANTES da fila: a hora medida é a da chegada
    // do token, não a de quando a escrita anterior terminou.
    let paraGravar = valor;
    try {
      const agora = this.relogio.agora();
      const ajuste = ajustarSessaoParaGravar(valor, agora);
      paraGravar = ajuste.valor;
      if (ajuste.defasagemMedidaSeg !== null) this.relogio.aoMedirDefasagem(ajuste.defasagemMedidaSeg, agora);
    } catch {
      // Sem ajuste a sessão continua válida; só não fica protegida do relógio.
      paraGravar = valor;
    }
    return this.enfileirar(() => this.escreverItem(chave, paraGravar));
  }

  private async removerItem(chave: string): Promise<void> {
    const manifesto = await this.lerManifesto(chave).catch(() => null);
    await this.seguro.deleteItemAsync(chaveManifesto(chave)).catch(() => {});
    await apagarPartes(this.seguro, chave, manifesto);
    await this.legado.removeItem(chave).catch(() => {});
  }

  async removeItem(chave: string): Promise<void> {
    return this.enfileirar(() => this.removerItem(chave));
  }
}
