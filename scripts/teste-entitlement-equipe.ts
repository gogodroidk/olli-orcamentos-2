/**
 * Teste da decisão F0d — grandfathering do paywall Empresa.
 *
 *     node scripts/teste-entitlement-equipe.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Duas coisas caras estão em jogo aqui, e elas puxam para lados opostos:
 *  - liberar demais = dar o plano de R$ 99/mês de graça;
 *  - negar demais   = cortar hoje quem usa Equipe há meses, às vésperas de pedir
 *    dinheiro a essa mesma pessoa.
 * Por isso o "não sei" tem estado próprio e não cai em nenhum dos dois.
 */
import { acessoEquipe, mostrarMuroEquipe } from '../src/services/entitlementEquipe.ts';
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

const DONO = 'user-dono-1';
const base = { id: 'org-1', nome: 'GR Tech', papel: 'owner' as const, ownerUserId: DONO };

const ORG_ANTIGA: LeituraOrganizacao = { status: 'ok', org: { ...base, equipeGrandfathered: true } };
const ORG_NOVA: LeituraOrganizacao = { status: 'ok', org: { ...base, equipeGrandfathered: false } };
const ORG_SCHEMA_VELHO: LeituraOrganizacao = { status: 'ok', org: { ...base } }; // sem a coluna
const PESSOAL: LeituraOrganizacao = { status: 'ok', org: null };
const ERRO: LeituraOrganizacao = { status: 'erro' };

console.log('\n1) quem PAGA entra — mesmo se a leitura da org falhar');
checar('plano libera + org com erro => pode (pelo plano)', acessoEquipe(true, ERRO), {
  pode: true,
  motivo: 'plano',
});
checar('plano libera + org nova => pode', acessoEquipe(true, ORG_NOVA), { pode: true, motivo: 'plano' });

console.log('\n2) A DECISÃO F0d: org que já existia continua podendo');
checar('sem plano + org grandfathered => PODE', acessoEquipe(false, ORG_ANTIGA), {
  pode: true,
  motivo: 'grandfathered',
});
checar('e não vê muro de pagamento', mostrarMuroEquipe(acessoEquipe(false, ORG_ANTIGA)), false);

console.log('\n3) org NOVA sem plano: é exatamente quem o paywall existe para cobrar');
checar('sem plano + org nova => NÃO pode', acessoEquipe(false, ORG_NOVA), {
  pode: false,
  motivo: 'sem_plano',
});
checar('e VÊ o muro (vende o Empresa)', mostrarMuroEquipe(acessoEquipe(false, ORG_NOVA)), true);

console.log('\n4) conta pessoal sem plano: não há org para herdar nada');
checar('sem plano + conta pessoal => não pode', acessoEquipe(false, PESSOAL), {
  pode: false,
  motivo: 'sem_plano',
});

console.log('\n5) "não sei" não vira nem "pode" nem "não pode"');
checar('sem plano + erro ao ler a org => indeterminado', acessoEquipe(false, ERRO), {
  pode: false,
  motivo: 'indeterminado',
});
checar('indeterminado NÃO mostra muro (não acusa por falha de rede)',
  mostrarMuroEquipe(acessoEquipe(false, ERRO)), false);
checar('mas também NÃO concede acesso', acessoEquipe(false, ERRO).pode, false);

console.log('\n6) o flag ausente (schema velho) não pode virar acesso grátis');
// Se a migration ainda não rodou, a coluna não vem. Ausente != true.
checar('sem plano + coluna ausente => NÃO pode (não é grandfathered)',
  acessoEquipe(false, ORG_SCHEMA_VELHO), { pode: false, motivo: 'sem_plano' });

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
