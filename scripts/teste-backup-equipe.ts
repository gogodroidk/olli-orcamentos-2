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
 *  3. BOTÃO "FAZER BACKUP AGORA". Mesmo dano do item 1 por um caminho pior: a
 *     primeira guarda ficou em `maybeAutoBackup`, mas o `user_id` é carimbado em
 *     `inserirBackupVersionado`/`backupNow`. O botão da tela Conta chamava
 *     `backupManualVersionado` e passava direto — e o usuário o dispara de
 *     propósito, sem esperar as 24h do automático. A guarda mudou para onde o
 *     carimbo acontece; a seção 4 exercita a decisão e a 5 confere o lugar dela.
 *
 * Estrutura, igual aos testes vizinhos: as seções 1–4 exercitam as funções REAIS
 * que decidem (src/services/contextoEquipe.ts, puro de propósito). A seção 5 é
 * diferente e proposital: as funções puras só valem se estiverem LIGADAS no
 * caminho de escrita, então ela lê o código de backup.ts/autoBackup.ts/
 * cloudSync.ts e as duas telas de Conta, e confere a ligação. Não é prova de
 * execução — é a rede que pega o "alguém tirou a guarda e os testes continuaram
 * verdes", que é literalmente o que aconteceu entre uma onda e outra.
 */
import { readFileSync } from 'node:fs';
import {
  backupNuvemPermitido,
  classificarContextoEquipe,
  decidirEmpresaEquipe,
  motivoBackupNuvem,
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

console.log('\n4) botão "Fazer backup agora" — o caminho MANUAL, que o usuário dispara de propósito');
// Por que esta seção existe: a primeira versão da guarda ficou em
// `maybeAutoBackup`, mas o `user_id` é carimbado em `inserirBackupVersionado` /
// `backupNow`. O botão da tela Conta chama `backupManualVersionado` e passava
// direto — mesmo dano do achado 1, sem esperar 24h. A guarda mudou para onde o
// carimbo acontece; aqui exercitamos a decisão que ela consulta.
//
// `exigirPermissaoBackupNuvem` (backup.ts) é exatamente isto: chama
// `motivoBackupNuvem` e só deixa passar 'permitido'. A seção 5 confere que
// backup.ts continua assim — esta seção confere QUEM passa.
const backupManualPassa = (r: LeituraOrganizacao) => motivoBackupNuvem(ctx(r)) === 'permitido';

checar('membro (técnico) NÃO consegue backup manual', backupManualPassa(TECNICO), false);
checar('membro (admin) NÃO consegue backup manual', backupManualPassa(ADMIN), false);
checar('DONO da org CONSEGUE (é dono dos dados)', backupManualPassa(O_DONO), true);
checar('conta pessoal CONSEGUE', backupManualPassa(PESSOAL), true);
checar('contexto indeterminado NÃO consegue (fail-closed)', backupManualPassa(ERRO), false);
// O motivo, não só o veredito: a tela mostra frases diferentes para "é do dono
// da empresa" (definitivo) e "não deu para confirmar" (temporário). Colapsar os
// dois num false era o que deixava o membro achando que estava protegido.
checar('membro recebe o motivo "somente_dono"', motivoBackupNuvem(ctx(TECNICO)), 'somente_dono');
checar('indeterminado recebe o motivo "indeterminado"', motivoBackupNuvem(ctx(ERRO)), 'indeterminado');
checar('dono recebe o motivo "permitido"', motivoBackupNuvem(ctx(O_DONO)), 'permitido');
// Automático e manual não podem divergir: é o mesmo dano nos dois caminhos.
for (const [nome, leitura] of [
  ['técnico', TECNICO], ['admin', ADMIN], ['dono', O_DONO], ['pessoal', PESSOAL], ['indeterminado', ERRO],
] as const) {
  checar(
    `${nome}: manual e automático decidem igual`,
    backupManualPassa(leitura) === backupNuvemPermitido(ctx(leitura)),
    true,
  );
}

console.log('\n5) as guardas estão LIGADAS no caminho de escrita (não só definidas)');
const backupSrc = ler('../src/services/backup.ts');
// A guarda tem que estar onde o `user_id` é carimbado. Fora daqui ela cobre um
// chamador e deixa os outros abertos — foi exatamente o que aconteceu.
for (const fn of ['backupNow', 'inserirBackupVersionado']) {
  const inicio = backupSrc.indexOf(`export async function ${fn}(`);
  checar(`${fn} existe em backup.ts`, inicio >= 0, true);
  const corpoFn = backupSrc.slice(inicio, backupSrc.indexOf('\n}', inicio));
  checar(`${fn} passa pela guarda de tenant`, corpoFn.includes('exigirPermissaoBackupNuvem'), true);
  checar(
    `${fn}: a guarda vem ANTES de gerar o snapshot`,
    corpoFn.indexOf('exigirPermissaoBackupNuvem') < corpoFn.indexOf('exportAllData('),
    true,
  );
}
// O botão da tela Conta chama `backupManualVersionado`; ele só está coberto
// enquanto delegar para a função guardada em vez de inserir por conta própria.
const manualInicio = backupSrc.indexOf('export async function backupManualVersionado(');
const manualCorpo = backupSrc.slice(manualInicio, backupSrc.indexOf('\n}', manualInicio));
checar('backupManualVersionado delega para inserirBackupVersionado', manualCorpo.includes('inserirBackupVersionado('), true);
checar('e não faz insert próprio (que escaparia da guarda)', manualCorpo.includes('.insert('), false);
// A tela precisa LER o motivo — sem isso ela volta a dizer "ativo" para o membro.
for (const [nome, caminho] of [
  ['ContaScreen', '../src/screens/ContaScreen.tsx'],
  ['ContaDesktopScreen', '../src/screens/desktop/ContaDesktopScreen.tsx'],
] as const) {
  const telaSrc = ler(caminho);
  checar(`${nome} lê o estado real do backup`, telaSrc.includes('estadoBackupNuvem'), true);
  checar(`${nome} mostra a copy honesta ao membro`, telaSrc.includes('COPY_BACKUP_NUVEM.somente_dono'), true);
}

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
// A seção 3 acima afirma `escrever === false` como PROVA de que o membro não
// escreve `empresa`. Essa prova só vale se o código de produção ler `escrever`:
// enquanto `alvoEmpresa` roteava por `if (d.ownerUserId)`, o campo era morto e o
// teste atestava algo que ninguém consultava. Aqui exigimos o discriminante.
const alvoInicio = syncSrc.indexOf('async function alvoEmpresa(');
const alvoCorpo = syncSrc.slice(alvoInicio, syncSrc.indexOf('\n}', alvoInicio));
checar('alvoEmpresa existe', alvoInicio >= 0, true);
checar('alvoEmpresa roteia pelo discriminante `escrever`', alvoCorpo.includes('d.escrever'), true);
checar(
  'e NÃO pela truthiness de `ownerUserId` (que mandaria membro sem dono para o ramo do dono)',
  alvoCorpo.includes('if (d.ownerUserId)'),
  false,
);
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
