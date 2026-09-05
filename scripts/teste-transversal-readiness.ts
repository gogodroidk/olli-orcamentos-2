import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log('  ok   ' + nome); ok++; }
  else { console.error('  FALHA ' + nome); falhas++; }
}

console.log('\nPiloto OLLI — manifesto transversal de readiness');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const manifestPath = path.join(repoRoot, 'docs', 'PILOTO', 'TRANSVERSAL_READINESS.json');
const runStatePath = path.join(repoRoot, 'docs', 'PILOTO', 'RUN_STATE.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const runState = JSON.parse(fs.readFileSync(runStatePath, 'utf8'));

const WORKSTREAM_STATES = new Set([
  'local_contract_ready',
  'local_partial',
  'operational_active',
  'persistence_live_dispatch_blocked',
  'simulator_dispatch_live_real_rollout_blocked',
]);
const GATE_CATEGORIES = new Set([
  'external_configuration',
  'migration',
  'device_acceptance',
  'credential',
  'real_data',
  'architecture_decision',
  'sandbox_finance',
  'publication',
]);
const REQUIRED_FORBIDDEN = [
  'secrets',
  'real_data',
  'migration',
  'external_send',
  'payment',
  'production',
  'deploy',
  'publication',
];
const CANONICAL_AUTOMATION_ID = 'piloto-olli-0-100-continuidade-controlada';
const BACKLOG_STATES = new Set(['ready', 'running', 'done_local_only']);
const safeId = (value: unknown) => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(value);
const unique = (values: unknown[]) => new Set(values).size === values.length;
const resolveEvidence = (relativePath: string) => path.resolve(repoRoot, relativePath.replaceAll('/', path.sep));
const insideRepo = (absolutePath: string) => absolutePath === repoRoot || absolutePath.startsWith(repoRoot + path.sep);

checar('manifesto versão 1 parseia', manifest.version === 1);
checar('marca pública única está correta', manifest.brand === 'OLLI Orçamentos');
checar('repositório canônico está correto', manifest.canonicalRepository === 'C:\\OLLI_REL');
checar(
  'boundary distingue dispatch live no simulador de aceite real',
  manifest.evidenceBoundary === 'MIXED_LIVE_SIMULATOR_DISPATCH_SYNTHETIC_CANARY',
);
checar('PROGRAMA 100% não foi declarado', manifest.program100Percent === false);
checar('não contém marca paralela', !/wally|holly|w-a-l-l-i/i.test(JSON.stringify(manifest)));

checar('automação usa o mesmo id do RUN_STATE', manifest.automation.automationId === runState.automationId);
checar('automação usa o id canônico devolvido pelo app', manifest.automation.automationId === CANONICAL_AUTOMATION_ID);
checar('fila do manifesto coincide com a fila ativa', manifest.automation.queueId === runState.activeQueue.queueId);
const executableBacklogItems = manifest.autonomousBacklog.filter((item: any) => item.status === 'ready' || item.status === 'running');
const automationStateCoherent = manifest.automation.desiredStatus === 'ACTIVE'
  ? executableBacklogItems.length > 0
  : manifest.automation.desiredStatus === 'PAUSED'
    && manifest.automation.pauseReason === 'AUTONOMIA_ESGOTADA_ONLY_HUMAN_GATES'
    && executableBacklogItems.length === 0
    && runState.status === 'blocked'
    && runState.activeQueue.state === 'blocked'
    && runState.activeQueue.currentItemId === null
    && runState.activeQueue.allowlist.length === 0;
checar('automação ACTIVE só com trabalho executável ou PAUSED coerente com fila esgotada', automationStateCoherent);
checar('fonte de estado existe', fs.existsSync(resolveEvidence(manifest.automation.stateSource)));

const workstreamIds = manifest.workstreams.map((item: any) => item.id);
checar('workstreams têm ids únicos e seguros', unique(workstreamIds) && workstreamIds.every(safeId));
checar('estados de workstream são fechados', manifest.workstreams.every((item: any) => WORKSTREAM_STATES.has(item.state)));
checar('nenhuma frente local finge aceite real', manifest.workstreams.every((item: any) => item.acceptedReal === false));
checar('toda frente possui evidência local', manifest.workstreams.every((item: any) => Array.isArray(item.localEvidence) && item.localEvidence.length > 0));

const evidencePaths = manifest.workstreams.flatMap((item: any) => item.localEvidence);
checar('todas as evidências ficam dentro do repositório', evidencePaths.every((item: string) => insideRepo(resolveEvidence(item))));
checar('todas as evidências locais existem', evidencePaths.every((item: string) => fs.existsSync(resolveEvidence(item))));
checar('evidências não apontam para secrets/env/sessões', evidencePaths.every((item: string) => !/(\.env|secret|token|credential|session|cofre)/i.test(item)));

const gateIds = manifest.humanGates.map((gate: any) => gate.gateId);
checar('gates humanos têm ids únicos e seguros', unique(gateIds) && gateIds.every(safeId));
checar('todo gate está explicitamente bloqueado ao humano', manifest.humanGates.every((gate: any) => gate.state === 'blocked_human'));
checar('categorias de gate são fechadas', manifest.humanGates.every((gate: any) => GATE_CATEGORIES.has(gate.category)));
checar('todo gate explica motivo, ação e evidência', manifest.humanGates.every((gate: any) => [gate.reason, gate.ownerAction, gate.evidenceRequired].every((value) => typeof value === 'string' && value.trim().length >= 20)));
checar('referências de gates nos workstreams resolvem', manifest.workstreams.every((item: any) => item.humanGateIds.every((gateId: string) => gateIds.includes(gateId))));

const backlogIds = manifest.autonomousBacklog.map((item: any) => item.itemId);
checar('backlog autônomo tem ids únicos e seguros', unique(backlogIds) && backlogIds.every(safeId));
checar('estados do backlog são fechados e ligados a workstream', manifest.autonomousBacklog.every((item: any) => BACKLOG_STATES.has(item.status) && workstreamIds.includes(item.workstreamId)));
const runningItems = manifest.autonomousBacklog.filter((item: any) => item.status === 'running');
const filaExecutando = runState.status === 'running' && runState.activeQueue.state === 'running';
const estadoExecucaoCoerente = filaExecutando
  ? runningItems.length === 1 && runningItems[0].itemId === runState.activeQueue.currentItemId
  : runningItems.length === 0 && runState.activeQueue.currentItemId === null;
checar('estado da fila e item RUNNING coincidem com RUN_STATE', estadoExecucaoCoerente);
checar('backlog autônomo não depende de gate humano', manifest.autonomousBacklog.every((item: any) => Array.isArray(item.requiresHumanGateIds) && item.requiresHumanGateIds.length === 0));
checar('backlog autônomo traz todas as proibições', manifest.autonomousBacklog.every((item: any) => REQUIRED_FORBIDDEN.every((forbidden) => item.forbiddenActions.includes(forbidden))));
checar('allowlists autônomas não apontam para produção/secrets/migrations', manifest.autonomousBacklog.every((item: any) => item.allowedFiles.every((file: string) => !/(\.env|secret|cofre|supabase\/migrations|wrangler\.toml)/i.test(file))));
checar('próximos itens dos workstreams resolvem no backlog', manifest.workstreams.every((item: any) => item.autonomousNextItemIds.every((itemId: string) => backlogIds.includes(itemId))));
const backlogById = new Map(manifest.autonomousBacklog.map((item: any) => [item.itemId, item]));
checar('próximos itens pertencem ao próprio workstream', manifest.workstreams.every((item: any) => item.autonomousNextItemIds.every((itemId: string) => backlogById.get(itemId)?.workstreamId === item.id)));

const serialized = JSON.stringify(manifest);
checar('manifesto não guarda chave/token/senha', !/(api[_-]?key|access[_-]?token|password|senha)/i.test(serialized));
checar(
  'dispatch no simulador não promove aceite ou coorte real',
  manifest.workstreams
    .filter((item: any) => item.state === 'simulator_dispatch_live_real_rollout_blocked')
    .every((item: any) => item.acceptedReal === false && item.humanGateIds.includes('email-real-cohort-rollout')),
);

if (falhas) {
  console.error('\nFALHOU: ' + ok + ' ok, ' + falhas + ' falha(s)');
  process.exit(1);
}
console.log('\nPASSOU: ' + ok + ' ok, 0 falhas');
