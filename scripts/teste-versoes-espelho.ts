/**
 * Contrato do outbox local de versões de orçamento.
 *
 * O teste é estrutural de propósito: o runtime SQLite/Supabase exige Expo e
 * sessão real, mas o risco que queremos impedir é regressivo e verificável no
 * código — uma versão nova sem marca pendente, uma confirmação que não limpa a
 * marca, ou o sync que deixa de drenar a fila.
 */
import fs from 'node:fs';

const ler = (p: string) => fs.readFileSync(p, 'utf8');
const db = ler('src/database/database.ts');
const link = ler('src/services/clienteLink.ts');
const sync = ler('src/services/cloudSync.ts');

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}`); falhas++; }
}

console.log('\nOutbox local — espelho do histórico de versões');
checar('schema local subiu para v6', /const SCHEMA_VERSION = 6/.test(db));
checar('tabela nova carrega a marca pendente', /espelho_pendente INTEGER NOT NULL DEFAULT 1/.test(db));
checar('bancos existentes recebem migration aditiva', /if \(v < 4\)[\s\S]{0,260}addColumnIfMissing\(database, 'orcamento_versoes', 'espelho_pendente'/.test(db));
checar('índice da outbox só nasce depois da migration', /await runMigrations\(database\);[\s\S]{0,400}idx_orcamento_versoes_pendente/.test(db) && !/idx_orcamento_versoes_pendente[\s\S]{0,80}await runMigrations/.test(db));
checar('snapshot novo entra na outbox', /INSERT OR REPLACE INTO orcamento_versoes[\s\S]{0,220}espelho_pendente\) VALUES \(\?,\?,\?,\?,\?,1\)/.test(db));
checar('há leitura limitada de pendências', /export async function getVersoesPendentesEspelho/.test(db) && /WHERE espelho_pendente = 1/.test(db));
checar('confirmação local só ocorre por id', /export async function marcarVersaoEspelhoConcluido/.test(db) && /SET espelho_pendente = 0 WHERE id = \?/.test(db));
checar('pull remoto não volta para a outbox', /INSERT OR REPLACE INTO orcamento_versoes[\s\S]{0,220}espelho_pendente\) VALUES \(\?,\?,\?,\?,\?,0\)/.test(db));
checar('espelho informa sucesso ou falha', /export async function espelharVersaoNuvem\(versao: OrcamentoVersao\): Promise<boolean>/.test(link));
checar('falha de contexto fica pendente', /if \(decisao\.adiar\) return false/.test(link));
checar('sucesso confirma a marca após upsert', /marcarVersaoEspelhoConcluido\(versao\.id\)/.test(link));
checar('há drenagem da outbox', /export async function espelharVersoesPendentes/.test(link) && /getVersoesPendentesEspelho/.test(link));
checar('sync de login drena a outbox', /espelharVersoesPendentes\(\)/.test(sync));

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
