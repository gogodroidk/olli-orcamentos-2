/**
 * Fila de envio das fotos da OS — a ligação com o aparelho (AsyncStorage,
 * arquivo local, Supabase Storage). A regra mora em `filaFotos.ts` (pura,
 * testada); aqui só entra o IO.
 *
 * Quem chama:
 *  - OrdemServicoScreen: registra cada foto ao anexar e lê o selo de cada uma;
 *  - cloudSync.syncOnLogin: sobe as pendentes a cada sync (boot, login, volta do
 *    segundo plano — ver religarSync);
 *  - SeloSync: lê o resumo e o botão [Tentar agora] força o envio.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  criarMotorFila,
  ehFotoLocal,
  type EstadoFoto,
  type LeituraResumo,
  type MotorFila,
  type RegistroFoto,
  type ResultadoEnvio,
  type ResultadoProcessamento,
} from './filaFotos';
import { FILA_FOTOS_PREFIX } from './storageKeys';
import { isSupabaseConfigured, usuarioDaSessaoLocal } from './supabase';

/** Dono da fila quando ninguém está conectado neste aparelho. */
const SEM_CONTA = 'sem-conta';

/** Fila de quem? Id da sessão (mesmo offline com token vencido) ou 'sem-conta'. */
async function donoDaFila(): Promise<string> {
  try {
    return (await usuarioDaSessaoLocal())?.id ?? SEM_CONTA;
  } catch {
    return SEM_CONTA;
  }
}

/** Sem conta não há para onde subir: o selo diz isso, nunca "aguardando sinal". */
function leituraDoDono(dono: string, leitura: LeituraResumo): LeituraResumo {
  return dono === SEM_CONTA && leitura.status === 'ok' ? { status: 'sem_conta' } : leitura;
}

async function enviarArquivo(dono: string, reg: RegistroFoto): Promise<ResultadoEnvio> {
  // Sessão ESTRITA aqui (renovada): sem ela o upload iria como anônimo.
  const { getCurrentUser } = await import('./supabase');
  const usuario = await getCurrentUser();
  if (!usuario) return { ok: false, motivo: 'auth' };
  // A fila de uma conta nunca sobe na conta de outra pessoa.
  if (usuario.id !== dono) return { ok: false, motivo: 'auth' };

  // Membro de equipe sobe no tenant do dono; não saber = não subir (fail-closed).
  const { garantirContextoEquipe } = await import('./cloudSync');
  const { resolverTenantEquipe } = await import('./contextoEquipe');
  const tenant = resolverTenantEquipe(await garantirContextoEquipe(), usuario.id);
  if (!tenant) return { ok: false, motivo: 'tenant_desconhecido' };

  const FileSystem = require('expo-file-system/legacy');
  const base64: string = await FileSystem.readAsStringAsync(reg.uri, {
    encoding: FileSystem.EncodingType?.Base64 ?? 'base64',
  });
  const { supabaseStorageProvider } = await import('./adapters/SupabaseStorageProvider');
  const r = await supabaseStorageProvider.enviar({
    categoria: 'foto_servico',
    tenantId: tenant,
    conteudoBase64: base64,
    mimeType: 'image/jpeg', // fotosOrcamento sempre grava JPEG
  });
  return r.ok ? { ok: true, chave: r.dados.chave } : { ok: false, motivo: r.motivo };
}

async function arquivoExiste(uri: string): Promise<boolean> {
  const FileSystem = require('expo-file-system/legacy');
  const info = await FileSystem.getInfoAsync(uri);
  return !!info?.exists;
}

const motores = new Map<string, MotorFila>();
const ouvintes = new Set<(leitura: LeituraResumo) => void>();

function motorDe(dono: string): MotorFila {
  const existente = motores.get(dono);
  if (existente) return existente;
  const chave = `${FILA_FOTOS_PREFIX}${dono}`;
  const motor = criarMotorFila({
    ler: () => AsyncStorage.getItem(chave),
    gravar: (texto) => AsyncStorage.setItem(chave, texto),
    enviar: (reg) => enviarArquivo(dono, reg),
    existe: arquivoExiste,
    agora: () => Date.now(),
  });
  motor.ouvir((bruta) => {
    const leitura = leituraDoDono(dono, bruta);
    for (const fn of ouvintes) {
      try {
        fn(leitura);
      } catch {
        // ouvinte quebrado não derruba os outros
      }
    }
  });
  motores.set(dono, motor);
  return motor;
}

async function motorAtual(): Promise<MotorFila> {
  return motorDe(await donoDaFila());
}

/** A nuvem de fotos está configurada neste build? (false = desligado, e a tela diz.) */
export function nuvemDeFotosLigada(): boolean {
  return isSupabaseConfigured();
}

/** Registra uma foto recém-anexada à OS. Nunca lança. */
export async function registrarFotoParaEnvio(ordemId: string, uri: string): Promise<void> {
  try {
    if (!ehFotoLocal(uri)) return;
    await (await motorAtual()).registrar(ordemId, uri);
  } catch {
    // best-effort: a foto já está salva no aparelho e na OS
  }
}

/** Garante que as fotos locais de uma OS estejam na fila (fotos de antes do selo). */
export async function garantirFotosNaFila(ordemId: string, uris: string[]): Promise<void> {
  for (const uri of uris) await registrarFotoParaEnvio(ordemId, uri);
}

/** Sobe o que estiver pendente. `forcar` = botão [Tentar agora]. Nunca lança. */
export async function enviarFotosPendentes(opcoes?: { forcar?: boolean }): Promise<ResultadoProcessamento | null> {
  try {
    if (!isSupabaseConfigured()) return null;
    const dono = await donoDaFila();
    // Sem conta, cada tentativa só somaria falha 'auth' e esticaria a espera.
    if (dono === SEM_CONTA) return null;
    return await motorDe(dono).processar(opcoes);
  } catch {
    return null;
  }
}

/** Resumo para o SeloSync. Falha de leitura = 'indisponivel' (nunca "zero pendências"). */
export async function lerResumoFotos(): Promise<LeituraResumo> {
  try {
    const dono = await donoDaFila();
    return leituraDoDono(dono, await motorDe(dono).resumo());
  } catch {
    return { status: 'indisponivel' };
  }
}

/** Estado de cada foto (selo). null = não consegui ler a fila. */
export async function estadosDasFotos(uris: string[]): Promise<Record<string, EstadoFoto | 'sem_registro'> | null> {
  try {
    return await (await motorAtual()).estados(uris);
  } catch {
    return null;
  }
}

/** Avisa a cada mudança da fila (registro, envio, falha). Devolve o cancelamento. */
export function ouvirFilaFotos(fn: (leitura: LeituraResumo) => void): () => void {
  ouvintes.add(fn);
  return () => {
    ouvintes.delete(fn);
  };
}
