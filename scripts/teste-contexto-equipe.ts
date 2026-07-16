/**
 * Teste dos 3 estados do contexto de equipe (DoD do item O0-4 da FILA).
 *
 * Roda direto no Node (>=22, type stripping nativo), sem framework:
 *     node scripts/teste-contexto-equipe.ts
 * Sai com código 0 se tudo passa, 1 na primeira falha — o exit code é a prova.
 *
 * Importa as funções REAIS que o app usa (src/services/contextoEquipe.ts). O
 * módulo é puro de propósito: não toca rede, Supabase nem SQLite, então este
 * teste exercita o código que embarca, não uma cópia dele.
 */
import {
  classificarContextoEquipe,
  decidirEscritaEquipe,
  type ContextoEquipe,
} from '../src/services/contextoEquipe.ts';
import type { LeituraOrganizacao } from '../src/services/equipe.ts';

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

const DONO = 'user-dono-0001';
const TECNICO_ORG: LeituraOrganizacao = {
  status: 'ok',
  org: { id: 'org-1', nome: 'GR Tech', papel: 'tecnico', ownerUserId: DONO },
};
const DONO_ORG: LeituraOrganizacao = {
  status: 'ok',
  org: { id: 'org-1', nome: 'GR Tech', papel: 'owner', ownerUserId: DONO },
};
const PESSOAL: LeituraOrganizacao = { status: 'ok', org: null };
const ERRO: LeituraOrganizacao = { status: 'erro' };

console.log('\n1) classificar — os 3 estados são distintos');
checar('erro (rede/RLS/offline) => desconhecido, NUNCA pessoal', classificarContextoEquipe(ERRO), {
  status: 'desconhecido',
});
checar('consultou e não é membro => pessoal', classificarContextoEquipe(PESSOAL), {
  status: 'pessoal',
});
checar('membro não-dono => membro c/ ownerUserId', classificarContextoEquipe(TECNICO_ORG), {
  status: 'membro',
  ownerUserId: DONO,
});
checar('o próprio dono => pessoal (grava no tenant dele)', classificarContextoEquipe(DONO_ORG), {
  status: 'pessoal',
});

console.log('\n2) a regressão do O0-4: erro NÃO pode virar o mesmo valor de pessoal');
const deErro = classificarContextoEquipe(ERRO);
const dePessoal = classificarContextoEquipe(PESSOAL);
checar('erro !== pessoal', JSON.stringify(deErro) !== JSON.stringify(dePessoal), true);

console.log('\n3) decidir escrita — fail-closed quando não sabemos quem somos');
checar('desconhecido => ADIA o espelho (não chuta tenant)', decidirEscritaEquipe(deErro), {
  adiar: true,
});
checar('pessoal => grava, sem override (default auth.uid())', decidirEscritaEquipe(dePessoal), {
  adiar: false,
  userIdOverride: null,
});
checar(
  'membro => grava carimbando o tenant do DONO',
  decidirEscritaEquipe(classificarContextoEquipe(TECNICO_ORG)),
  { adiar: false, userIdOverride: DONO },
);

console.log('\n4) o bug original, encenado: técnico offline não pode virar conta pessoal');
// Antes: getMinhaOrganizacao() colapsava erro em null e o técnico gravava no
// próprio tenant (linha invisível para a org). Agora a escrita é adiada.
const tecnicoSemRede = classificarContextoEquipe(ERRO);
const decisao = decidirEscritaEquipe(tecnicoSemRede);
checar('técnico sem rede NÃO grava com user_id próprio', decisao.adiar, true);
checar(
  'e não existe userIdOverride para vazar',
  Object.prototype.hasOwnProperty.call(decisao, 'userIdOverride'),
  false,
);

console.log('\n5) exaustividade: todo estado tem decisão (nenhum cai no vazio)');
const TODOS: ContextoEquipe[] = [
  { status: 'desconhecido' },
  { status: 'pessoal' },
  { status: 'membro', ownerUserId: DONO },
];
for (const ctx of TODOS) {
  const d = decidirEscritaEquipe(ctx);
  checar(`${ctx.status} => decisão definida`, d !== undefined && d !== null, true);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
