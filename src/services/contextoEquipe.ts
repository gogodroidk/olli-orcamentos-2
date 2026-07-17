/**
 * Contexto de escrita da EQUIPE — a decisão PURA de "em qual tenant esta linha
 * nasce", isolada de rede, Supabase e SQLite para poder ser testada de verdade.
 *
 * Por que existe (O0-4): o `cloudSync` guardava esse contexto como
 * `string | null`, onde `null` significava ao mesmo tempo "é conta pessoal/dono"
 * e "não consegui descobrir". Colapsar o ERRO no estado PERMISSIVO é o bug
 * recorrente da casa (erro → null → "não tem" → permitido). Na prática: uma
 * falha de rede ao ler a organização fazia um TÉCNICO gravar no próprio tenant,
 * e o dono nunca via a linha (P1-3, "o cliente cadastrado pelo técnico sumia").
 *
 * A regra aqui é fail-closed e ela é barata: quando não sabemos quem somos, o
 * espelho na nuvem é ADIADO, não adivinhado. Nada se perde — o SQLite local é a
 * fonte da verdade e o próximo sync empurra a linha. Adivinhar, ao contrário,
 * grava no tenant errado e o dano é permanente.
 */
import type { LeituraOrganizacao } from './equipe';

/** Três estados. `desconhecido` NUNCA pode ser tratado como `pessoal`. */
export type ContextoEquipe =
  | { status: 'desconhecido' } // indeterminado: offline, RLS, servidor fora, ainda não lido
  | { status: 'pessoal' } // resolvido: conta pessoal ou dono → grava no próprio tenant
  | { status: 'membro'; ownerUserId: string }; // resolvido: membro não-dono → tenant do dono

/**
 * Traduz a leitura da organização (3 estados) no contexto de escrita (3 estados).
 * Total e pura: mesma entrada, mesma saída, sem IO.
 *
 * `status: 'erro'` vira `desconhecido` — e não `pessoal` — porque "não consegui
 * ler" não é prova de "não tem org". `org: null` com `status: 'ok'` é a única
 * evidência real de conta pessoal: consultamos e o usuário não é membro.
 * O próprio dono (`papel === 'owner'`) grava no tenant dele, logo `pessoal`.
 */
export function classificarContextoEquipe(r: LeituraOrganizacao): ContextoEquipe {
  if (r.status === 'erro') return { status: 'desconhecido' };
  if (r.org && r.org.papel !== 'owner') {
    return { status: 'membro', ownerUserId: r.org.ownerUserId };
  }
  return { status: 'pessoal' };
}

/**
 * O que fazer com uma linha de tabela sensível a tenant, dado o contexto.
 * `adiar: true` = não espelhar agora (o local guarda; o próximo sync tenta).
 * `userIdOverride: null` = deixar o default do banco (auth.uid()) valer.
 */
export type DecisaoEscrita =
  | { adiar: true }
  | { adiar: false; userIdOverride: string | null };

export function decidirEscritaEquipe(ctx: ContextoEquipe): DecisaoEscrita {
  switch (ctx.status) {
    case 'desconhecido':
      return { adiar: true };
    case 'pessoal':
      return { adiar: false, userIdOverride: null };
    case 'membro':
      return { adiar: false, userIdOverride: ctx.ownerUserId };
  }
}

/**
 * Um RESTORE de backup pode propagar para a NUVEM (limpar tombstones + push)? (O0-3)
 *
 * Só o dono do tenant. O motivo é o P0 nº 3 da auditoria — "o backup do técnico
 * ressuscita dados apagados do dono":
 *
 * 1. o aparelho do técnico puxa, por sync de equipe, as linhas do DONO;
 * 2. o SQLite local NÃO tem coluna de tenant (as linhas são blobs), então o backup
 *    do técnico leva junto os dados do dono — e não há como separar depois;
 * 3. o dono apaga um cliente → nasce um tombstone em `exclusoes` (nuvem);
 * 4. o técnico restaura um backup ANTIGO → o restore reinsere o cliente E apaga o
 *    tombstone DA NUVEM, que era justamente a prova da exclusão. Sem ele, o próximo
 *    `pullAll` de todo mundo não re-exclui nada, e o `pushAllLocal` (o botão
 *    "Restaurar" usa `pushToCloud: true`) sobe a linha velha de volta.
 *    Resultado: o que o dono apagou volta para a EQUIPE INTEIRA.
 *
 * Por isso: membro NUNCA propaga restore para a nuvem, e `desconhecido` também não
 * (fail-closed — não saber de quem é o dado nunca autoriza mexer nele). O restore
 * do membro continua valendo LOCALMENTE, e o próximo sync reconcilia sozinho: o
 * `pullAll` reaplica os tombstones da nuvem e traz as linhas novas. Nada se perde.
 */
export function restaurePodeTocarNaNuvem(ctx: ContextoEquipe): boolean {
  return ctx.status === 'pessoal';
}
