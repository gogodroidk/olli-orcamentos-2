import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const adb = process.env.ADB_PATH || [
  'C:\\Users\\ADMIN\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe',
  'adb',
].find((candidate) => candidate === 'adb' || existsSync(candidate));
const packageName = process.env.ANDROID_PACKAGE || 'online.olliorcamentos.app';
const outDir = resolve('artifacts');
const screenshotPath = resolve(outDir, 'device-sm-g780f-qa-latest.png');
const reportPath = resolve(outDir, 'qa-android-latest.json');

if (!adb) throw new Error('ADB não encontrado. Defina ADB_PATH ou conecte o Android SDK.');
mkdirSync(outDir, { recursive: true });

function run(args, options = {}) {
  return execFileSync(adb, args, { encoding: options.encoding === undefined ? 'utf8' : options.encoding, timeout: options.timeout ?? 30_000, stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'] });
}

const devices = String(run(['devices'])).split(/\r?\n/).slice(1)
  .map((line) => line.trim().split(/\s+/))
  .filter((parts) => parts[0] && parts[1] === 'device');
if (!devices.length) throw new Error('Nenhum Android em estado device.');
const serial = devices[0][0];
const startedAt = Date.now();
run(['-s', serial, 'logcat', '-c']);
run(['-s', serial, 'shell', 'am', 'force-stop', packageName]);
run(['-s', serial, 'shell', 'monkey', '-p', packageName, '1'], { timeout: 15_000 });

let logs = '';
let mainAt = null;
const deadline = Date.now() + 20_000;
while (Date.now() < deadline) {
  logs = String(run(['-s', serial, 'logcat', '-d', '-v', 'threadtime', '-s', 'ReactNativeJS:I', 'ReactNative:E', 'AndroidRuntime:E']));
  if (/Running "main"/.test(logs)) {
    mainAt = Date.now();
    break;
  }
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
}

// Aguarda a hidratação do SQLite e o primeiro carregamento do Metro: o shell
// de navegação aparece antes dos cards da Home e um screenshot imediato seria
// um falso "tela vazia". O tempo de startup continua sendo o primeiro frame
// (`Running main`); este settle só valida a UI já estabilizada.
const settleMs = 25_000;
await new Promise((resolvePromise) => setTimeout(resolvePromise, settleMs));
logs = String(run(['-s', serial, 'logcat', '-d', '-v', 'threadtime', '-s', 'ReactNativeJS:I', 'ReactNative:E', 'AndroidRuntime:E']));
const fatalIssues = logs.split(/\r?\n/).filter((line) => /FATAL EXCEPTION|SQLiteException|database is locked|Unable to load script|Could not connect to development server/i.test(line));
const startupMs = mainAt == null ? null : mainAt - startedAt;
const report = {
  generatedAt: new Date().toISOString(),
  packageName,
  serial,
  startupMs,
  startupBudgetMs: 20_000,
  startupBudgetPassed: startupMs !== null && startupMs <= 20_000,
  settleMs,
  fatalIssues,
  screenshotPath,
  metroExpected: true,
};
writeFileSync(reportPath, JSON.stringify(report, null, 2));
try {
  const screenshot = run(['-s', serial, 'exec-out', 'screencap', '-p'], { encoding: null, timeout: 15_000 });
  writeFileSync(screenshotPath, screenshot);
} catch (error) {
  report.screenshotPath = null;
  report.screenshotError = error instanceof Error ? error.message : 'captura_falhou';
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
if (!report.startupBudgetPassed || fatalIssues.length) process.exitCode = 1;
