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

/**
 * Um BACKUP AUTOMÁTICO pode ser gravado na nuvem (`backups_versionados`)? (O0-5)
 *
 * Mesma raiz do `restaurePodeTocarNaNuvem`, no sentido inverso — lá o snapshot
 * DESCE, aqui ele SOBE:
 *
 * 1. o aparelho do membro puxa, por sync de equipe, as linhas do DONO;
 * 2. o SQLite local NÃO tem coluna de tenant, então `exportAllData()` devolve um
 *    snapshot INTEIRO onde os dados do dono e os do membro são indistinguíveis;
 * 3. `inserirBackupVersionado` grava esse snapshot sob o `user_id` do MEMBRO —
 *    ou seja, a base de clientes do dono passa a existir dentro do tenant de
 *    outra pessoa, que a leva embora ao ser desligada da equipe (a linha em
 *    `backups_versionados` é dela e sobrevive à saída da org).
 *
 * Por isso só a conta `pessoal` (dono do próprio tenant) gera backup na nuvem, e
 * `desconhecido` também não: "não sei de quem é este banco" nunca autoriza copiá-lo
 * para um tenant. O dono NÃO perde nada — o backup dele continua igual, e os dados
 * que o membro enxerga já estão protegidos pelo backup do próprio dono, que é de
 * onde eles vieram.
 */
export function backupNuvemPermitido(ctx: ContextoEquipe): boolean {
  return motivoBackupNuvem(ctx) === 'permitido';
}

/**
 * O MESMO julgamento de `backupNuvemPermitido`, mas dizendo POR QUÊ — porque um
 * booleano só sabe responder "não" e a tela precisa contar duas histórias bem
 * diferentes ao usuário:
 *
 *  - `somente_dono` (membro de equipe): não é falha nem espera. O backup da conta
 *    é do dono da empresa e sempre será; não há nada que o membro possa fazer, e
 *    dizer a ele "backup automático: ativo" é mentira (a guarda vai recusar).
 *  - `indeterminado`: é o fail-closed temporário — offline, RLS, servidor fora.
 *    Pode virar `permitido` no próximo minuto, então a tela diz "ainda não deu
 *    para confirmar", não "você não pode".
 *
 * Colapsar os dois num `false` é o bug recorrente da casa pelo avesso: aqui o
 * dado EXISTE (sabemos exatamente qual dos dois é) e era a UI que o jogava fora.
 */
export type MotivoBackupNuvem = 'permitido' | 'somente_dono' | 'indeterminado';

export function motivoBackupNuvem(ctx: ContextoEquipe): MotivoBackupNuvem {
  switch (ctx.status) {
    case 'pessoal':
      return 'permitido';
    case 'membro':
      return 'somente_dono';
    case 'desconhecido':
      return 'indeterminado';
  }
}

/**
 * O que fazer com a linha `empresa` (cadastro/marca do negócio) dado o contexto.
 *
 * `empresa` é a única tabela de linha ÚNICA POR DONO (upsert por `user_id`), e a
 * RLS (`empresa_owner_write`, 20260707_multitenant.sql) deixa o membro LER a
 * empresa do dono mas só escrever no próprio `user_id`. A combinação disso com um
 * push sem filtro é o vazamento: o membro puxa a empresa do DONO para o SQLite,
 * o push manda a linha SEM `user_id`, o default `auth.uid()` carimba o MEMBRO —
 * e nasce, no tenant dele, uma cópia do CNPJ/logo/endereço/chave Pix do dono, que
 * continua lá depois que ele sai da equipe.
 *
 * Daí os dois eixos serem separados:
 *  - `ler`: o membro PRECISA da marca do dono para emitir documento em nome da
 *    empresa — este é o caso legítimo e ele continua valendo. Só `desconhecido`
 *    não lê, porque aí não dá para dizer de quem é a linha que voltaria.
 *  - `escrever`: SÓ o dono do tenant. Para o membro não há sequer caso de uso —
 *    a RLS já recusaria a linha do dono, e o único efeito possível do push era
 *    criar a tal cópia no tenant dele.
 *
 * `ownerUserId` é o filtro `user_id` do SELECT. Sem ele o `maybeSingle()` do pull
 * ainda quebrava por outro motivo: um membro que já tinha empresa própria enxerga
 * DUAS linhas e o PostgREST devolve erro em vez de linha — o membro nunca mais
 * recebia a marca da empresa (o caso legítimo, quebrado em silêncio).
 */
export type DecisaoEmpresa =
  | { ler: false; escrever: false } // desconhecido: não sei de quem é a empresa
  | { ler: true; escrever: true; ownerUserId: null } // pessoal/dono: a empresa é dele
  | { ler: true; escrever: false; ownerUserId: string }; // membro: lê a do dono, não escreve

export function decidirEmpresaEquipe(ctx: ContextoEquipe): DecisaoEmpresa {
  switch (ctx.status) {
    case 'desconhecido':
      return { ler: false, escrever: false };
    case 'pessoal':
      return { ler: true, escrever: true, ownerUserId: null };
    case 'membro':
      return { ler: true, escrever: false, ownerUserId: ctx.ownerUserId };
  }
}
