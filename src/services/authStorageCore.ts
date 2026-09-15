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

  constructor(legado: StorageAsync, seguro: StorageSeguro) {
    this.legado = legado;
    this.seguro = seguro;
  }

  private async lerManifesto(chave: string): Promise<Manifesto | null> {
    return interpretarManifesto(await this.seguro.getItemAsync(chaveManifesto(chave)));
  }

  private async marcarInstalacao(): Promise<void> {
    await this.legado.setItem(INSTALL_MARKER_KEY, '1');
  }

  async getItem(chave: string): Promise<string | null> {
    const [marcador, legado, manifesto] = await Promise.all([
      this.legado.getItem(INSTALL_MARKER_KEY),
      this.legado.getItem(chave),
      this.lerManifesto(chave),
    ]);

    if (!marcador && !legado) {
      if (manifesto) {
        await this.seguro.deleteItemAsync(chaveManifesto(chave)).catch(() => {});
        await apagarPartes(this.seguro, chave, manifesto);
      }
      await this.marcarInstalacao();
      return null;
    }

    if (manifesto) {
      const partes = await Promise.all(
        Array.from({ length: manifesto.partes }, (_, indice) =>
          this.seguro.getItemAsync(chaveParte(chave, manifesto.geracao, indice)),
        ),
      );
      if (partes.some((parte) => parte === null)) return null;
      if (!marcador) await this.marcarInstalacao();
      return partes.join('');
    }

    if (!legado) {
      if (!marcador) await this.marcarInstalacao();
      return null;
    }

    try {
      await this.setItem(chave, legado);
      return legado;
    } catch {
      return null;
    }
  }

  async setItem(chave: string, valor: string): Promise<void> {
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
      await this.seguro.setItemAsync(chaveManifesto(chave), JSON.stringify(novo));
      await this.marcarInstalacao();
      await this.legado.removeItem(chave);
    } catch (erro) {
      await Promise.all(gravadas.map((indice) => this.seguro.deleteItemAsync(chaveParte(chave, geracao, indice)).catch(() => {})));
      throw erro;
    }

    await apagarPartes(this.seguro, chave, anterior);
  }

  async removeItem(chave: string): Promise<void> {
    const manifesto = await this.lerManifesto(chave).catch(() => null);
    await this.seguro.deleteItemAsync(chaveManifesto(chave)).catch(() => {});
    await apagarPartes(this.seguro, chave, manifesto);
    await this.legado.removeItem(chave).catch(() => {});
  }
}
