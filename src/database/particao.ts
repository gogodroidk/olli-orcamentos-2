/**
 * PARTIÇÃO DO BANCO LOCAL POR USUÁRIO (O0-2) — a decisão PURA, sem SQLite.
 *
 * O problema: o aparelho tinha UM banco só (`olli_orcamentos.db`). "Sair e manter
 * dados neste aparelho" fazia só `signOut()` — o SQLite continuava lá. O próximo
 * usuário a logar no MESMO aparelho herdava os dados do anterior e o
 * `pushAllLocal` empurrava as linhas do usuário A para o tenant do usuário B:
 * vazamento de dados de A para a conta de B e corrupção da nuvem de B.
 *
 * A solução é partição, não faxina: cada usuário tem o SEU arquivo. Assim as duas
 * promessas são mantidas ao mesmo tempo — A "mantém os dados neste aparelho"
 * (continuam intactos no arquivo dele) e B nunca os vê.
 *
 * A regra da ADOÇÃO é o que torna isso seguro para quem já usa o app: o primeiro
 * usuário a logar depois da atualização **adota** o banco legado como partição
 * dele — um carimbo, zero cópia de arquivo. Migrar/renomear dados de milhares de
 * aparelhos é a operação com maior chance de destruir trabalho real, e aqui ela
 * simplesmente não acontece. Um usuário DIFERENTE ganha arquivo novo em branco.
 */

/** O banco de sempre. Continua sendo usado — vira a partição de quem o adotar. */
export const DB_LEGADO = 'olli_orcamentos.db';

/** `userId` → nome do arquivo .db daquele usuário. Persistido em AsyncStorage. */
export type MapaParticoes = Readonly<Record<string, string>>;

/**
 * Nome de arquivo derivado do id do usuário. O id é UUID (só hex e `-`), mas
 * sanitizamos assim mesmo: nome de arquivo nunca se monta com entrada crua.
 */
export function nomeParticao(userId: string): string {
  const limpo = String(userId).toLowerCase().replace(/[^a-z0-9-]/g, '');
  return `olli_u_${limpo}.db`;
}

export interface ResolucaoParticao {
  /** Arquivo .db que este usuário deve abrir. */
  readonly db: string;
  /** true = está adotando o banco legado (primeiro login pós-atualização). */
  readonly adotou: boolean;
  /** Mapa a persistir (o de entrada + a decisão). Nunca muta o original. */
  readonly mapa: MapaParticoes;
}

/** Alguém já reivindicou o banco legado? */
function legadoTemDono(mapa: MapaParticoes): boolean {
  return Object.values(mapa).includes(DB_LEGADO);
}

/**
 * Decide qual arquivo o usuário abre. Pura e determinística: mesma entrada,
 * mesma saída — chamar duas vezes devolve a MESMA partição (idempotente), que é
 * o que garante que ninguém "perde" o banco ao reabrir o app.
 *
 * 1. Já tem partição registrada → usa (nunca troca de arquivo depois de decidir).
 * 2. Ninguém adotou o legado → adota (é o dono original daquele aparelho).
 * 3. O legado já é de OUTRO → arquivo novo, em branco. Os dados do outro ficam
 *    intactos no arquivo dele; este usuário não os enxerga.
 */
export function resolverParticao(userId: string, mapa: MapaParticoes): ResolucaoParticao {
  const jaTem = mapa[userId];
  if (jaTem) return { db: jaTem, adotou: false, mapa };

  if (!legadoTemDono(mapa)) {
    return { db: DB_LEGADO, adotou: true, mapa: { ...mapa, [userId]: DB_LEGADO } };
  }

  const novo = nomeParticao(userId);
  return { db: novo, adotou: false, mapa: { ...mapa, [userId]: novo } };
}

/**
 * O banco `atual` pertence a `userId`?
 *
 * TRÊS ESTADOS, pelo mesmo motivo do `contextoEquipe`: `'indeterminado'` (não sei
 * quem é o usuário, ex.: sessão ainda carregando) NÃO pode ser tratado como
 * `'meu'`. Quem não sabe de quem é o banco não sincroniza — senão a dúvida vira
 * push dos dados de A para o tenant de B, que é exatamente o vazamento.
 */
export type DonoDoBanco = 'meu' | 'de-outro' | 'indeterminado';

export function donoDoBanco(
  userId: string | null | undefined,
  dbAtual: string | null | undefined,
  mapa: MapaParticoes,
): DonoDoBanco {
  if (!userId || !dbAtual) return 'indeterminado';
  const meu = mapa[userId];
  if (!meu) return 'indeterminado'; // ainda não resolvemos a partição deste usuário
  return meu === dbAtual ? 'meu' : 'de-outro';
}

/** Só sincroniza quem tem certeza de que o banco aberto é o seu. */
export function podeSincronizar(dono: DonoDoBanco): boolean {
  return dono === 'meu';
}
