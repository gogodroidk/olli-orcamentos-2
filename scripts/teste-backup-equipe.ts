/**
 * Teste do vazamento entre contas nos SNAPSHOTS e no cadastro da EMPRESA.
 *
 *     node scripts/teste-backup-equipe.ts
 * Exit 0 = passou; 1 = falhou. O exit code é a prova.
 *
 * O QUE ESTÁ SENDO TRANCADO (os dois piores achados da auditoria):
 *
 *  1. BACKUP AUTOMÁTICO DO MEMBRO. O SQLite local não tem coluna de tenant: no
 *     aparelho de um técnico ele contém a base do DONO (veio pelo sync de
 *     equipe). `exportAllData()` fotografa TUDO e `inserirBackupVersionado`
 *     gravava o snapshot sob o `user_id` do MEMBRO — a carteira de clientes do
 *     dono passava a existir dentro do tenant de outra pessoa, que a levava
 *     embora ao ser desligada.
 *
 *  2. EMPRESA SEM DONO. O pull fazia `from('empresa').select('*')` sem filtro; a
 *     RLS (`empresa_select` → donos_visiveis) devolve ao membro a linha do DONO.
 *     Até aí é legítimo — ele precisa da marca para emitir documento. O dano vinha
 *     no PUSH: o upsert vai sem `user_id`, o default `auth.uid()` carimbava o
 *     MEMBRO, e nascia no tenant dele uma cópia do CNPJ/logo/chave Pix do dono.
 *
 * Estrutura, igual aos testes vizinhos: as seções 1–3 exercitam as funções REAIS
 * que decidem (src/services/contextoEquipe.ts, puro de propósito). A seção 4 é
 * diferente e proposital: as funções puras só valem se estiverem LIGADAS no
 * caminho de escrita, então ela lê o código de autoBackup.ts/cloudSync.ts e
 * confere a ligação. Não é prova de execução — é a rede que pega o "alguém tirou
 * a guarda e os testes continuaram verdes".
 */
import { readFileSync } from 'node:fs';
import {
  backupNuvemPermitido,
  classificarContextoEquipe,
  decidirEmpresaEquipe,
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

function ler(caminho: string): string {
  return readFileSync(new URL(caminho, import.meta.url), 'utf8');
}

const DONO = 'user-dono-0001';
const TECNICO: LeituraOrganizacao = {
  status: 'ok',
  org: { id: 'org-1', nome: 'GR Tech', papel: 'tecnico', ownerUserId: DONO },
};
const ADMIN: LeituraOrganizacao = {
  status: 'ok',
  org: { id: 'org-1', nome: 'GR Tech', papel: 'admin', ownerUserId: DONO },
};
const O_DONO: LeituraOrganizacao = {
  status: 'ok',
  org: { id: 'org-1', nome: 'GR Tech', papel: 'owner', ownerUserId: DONO },
};
const PESSOAL: LeituraOrganizacao = { status: 'ok', org: null };
const ERRO: LeituraOrganizacao = { status: 'erro' };

const ctx = (r: LeituraOrganizacao) => classificarContextoEquipe(r);

console.log('\n1) backup automático na nuvem — quem pode fotografar o banco local');
// (a) o achado: o técnico levava a base inteira do dono no backup dele.
checar('membro (técnico) NÃO gera backup na nuvem', backupNuvemPermitido(ctx(TECNICO)), false);
// Papel graduado não muda nada: admin também não é dono do tenant.
checar('membro (admin) também NÃO gera', backupNuvemPermitido(ctx(ADMIN)), false);
// (b) a rede de segurança de todo mundo continua de pé — este é o caso que NÃO
// pode quebrar: se o dono parar de ter backup, o conserto virou um bug maior.
checar('DONO da org GERA (é dono dos dados)', backupNuvemPermitido(ctx(O_DONO)), true);
checar('conta pessoal GERA (os dados são dela)', backupNuvemPermitido(ctx(PESSOAL)), true);
// (c) a regra da casa: "não sei" nunca vira "pode".
checar('contexto indeterminado NÃO gera', backupNuvemPermitido(ctx(ERRO)), false);

console.log('\n2) o erro não pode ser confundido com "sou dono"');
// Era exatamente assim que o bug nascia: rede fora → leitura da org falha → o
// código antigo tratava como conta pessoal → backup gravado como se fosse dele.
checar(
  'offline !== pessoal na decisão de backup',
  backupNuvemPermitido(ctx(ERRO)) === backupNuvemPermitido(ctx(PESSOAL)),
  false,
);

console.log('\n3) empresa — o membro LÊ a marca do dono, mas nunca ESCREVE');
checar('membro lê a empresa do DONO (documento sai com a marca certa)', decidirEmpresaEquipe(ctx(TECNICO)), {
  ler: true,
  escrever: false,
  ownerUserId: DONO,
});
checar('e o filtro user_id do SELECT é o do dono, não o dele', decidirEmpresaEquipe(ctx(TECNICO)).ler
  ? (decidirEmpresaEquipe(ctx(TECNICO)) as { ownerUserId: string | null }).ownerUserId
  : null, DONO);
checar('dono lê e escreve a própria (sem override de user_id)', decidirEmpresaEquipe(ctx(O_DONO)), {
  ler: true,
  escrever: true,
  ownerUserId: null,
});
checar('conta pessoal lê e escreve a própria', decidirEmpresaEquipe(ctx(PESSOAL)), {
  ler: true,
  escrever: true,
  ownerUserId: null,
});
checar('indeterminado não lê nem escreve (fail-closed)', decidirEmpresaEquipe(ctx(ERRO)), {
  ler: false,
  escrever: false,
});
// O dano concreto que isto impede: nenhum contexto que não seja o dono do tenant
// pode escrever a linha `empresa` — é o que criava a cópia da empresa alheia.
for (const [nome, leitura] of [['técnico', TECNICO], ['admin', ADMIN], ['indeterminado', ERRO]] as const) {
  checar(`${nome} => escrever === false`, decidirEmpresaEquipe(ctx(leitura)).escrever, false);
}

console.log('\n4) as guardas estão LIGADAS no caminho de escrita (não só definidas)');
const autoBackupSrc = ler('../src/services/autoBackup.ts');
// Só o corpo de maybeAutoBackup: os imports no topo citariam os mesmos nomes e
// tornariam a ordem abaixo sempre verdadeira por acidente.
const corpo = autoBackupSrc.slice(autoBackupSrc.indexOf('export async function maybeAutoBackup'));
checar('maybeAutoBackup consulta o contexto de equipe', corpo.includes('garantirContextoEquipe'), true);
checar('e passa pela guarda de backup', corpo.includes('backupNuvemPermitido'), true);
checar(
  'a guarda vem ANTES de gerar o snapshot (nada de exportar e decidir depois)',
  corpo.indexOf('backupNuvemPermitido') < corpo.indexOf('exportAllData('),
  true,
);

const syncSrc = ler('../src/services/cloudSync.ts');
checar('cloudSync resolve o tenant da empresa antes de tocá-la', syncSrc.includes('alvoEmpresa'), true);
// Toda consulta a `empresa` precisa dizer DE QUEM é a linha. Um select sem filtro
// aqui é o achado voltando: a RLS escolhe sozinha e pode devolver a do dono.
const consultas = syncSrc.split(".from('empresa')").slice(1);
checar('há consultas a `empresa` para conferir', consultas.length > 0, true);
for (const [i, trecho] of consultas.entries()) {
  checar(
    `consulta #${i + 1} a \`empresa\` filtra por user_id`,
    trecho.slice(0, 200).includes(".eq('user_id'"),
    true,
  );
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
