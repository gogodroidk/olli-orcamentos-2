/**
 * Contrato puro de dataset para uso administrativo/treino de IA.
 *
 * Validar um manifesto não autoriza exportação nem lê dados. A camada que
 * persistir/executar o dataset ainda precisa de RLS, auditoria, aprovação
 * humana e um job de purge propagado para derivados, embeddings, backups e
 * modelos.
 */

export const DATASET_POLICY_VERSION = '2026-08-31.v1';
export const DATASET_RETENTION_MAX_DAYS = 90;

const PURPOSES = Object.freeze(['ai_training', 'model_evaluation', 'support_quality', 'product_analytics']);
const FIELD_RE = /^[a-z][a-z0-9_.-]{1,100}$/;
const FORBIDDEN_FIELD_RE = /(senha|password|token|session|cookie|secret|prompt|resposta|transcri|mensagem|contexto|cpf|cnpj|telefone|whatsapp|endereco|endereço|cep|stripe|mercado.?pago|preapproval|customer_id|subscription_id|pix|chave|assinatura|nome|titulo|observa|descricao|descri|email)/i;

function texto(v, limite) {
  return typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim().slice(0, limite) : '';
}

function dataIso(v) {
  if (typeof v !== 'string' || !v.trim()) return '';
  const data = new Date(v);
  return Number.isNaN(data.getTime()) ? '' : data.toISOString();
}

function erro(codigo, detalhe = '') {
  return detalhe ? `${codigo}:${detalhe}` : codigo;
}

function camposNormalizados(campos) {
  if (!Array.isArray(campos)) return { campos: [], invalidos: ['fields_obrigatorios'] };
  const normalizados = campos.map((campo) => texto(campo, 110).toLowerCase());
  const invalidos = normalizados.filter((campo) => !FIELD_RE.test(campo));
  const unicos = [...new Set(normalizados)];
  return { campos: unicos, invalidos };
}

/**
 * Valida e congela um manifesto. `agora` existe para manter testes e jobs
 * determinísticos; a função não consulta relógio externo nem banco.
 */
export function validarManifestoDataset(input = {}, { agora = new Date().toISOString() } = {}) {
  const erros = [];
  const purpose = texto(input.purpose || input.finalidade, 80).toLowerCase();
  if (!PURPOSES.includes(purpose)) erros.push(erro('purpose_invalido'));

  const tenantScope = texto(input.tenantScope || input.escopoTenant, 160);
  if (!tenantScope || tenantScope.toLowerCase() === 'all' || tenantScope.toLowerCase() === 'todos') {
    erros.push(erro('escopo_tenant_obrigatorio_e_limitado'));
  }

  const { campos, invalidos } = camposNormalizados(input.fields || input.campos);
  if (invalidos.length) erros.push(...invalidos.map((x) => erro('campo_invalido', x)));
  const proibidos = campos.filter((campo) => FORBIDDEN_FIELD_RE.test(campo));
  if (proibidos.length) erros.push(erro('campo_proibido', proibidos.join(',')));

  const retentionDays = Number(input.retentionDays ?? input.retencaoDias);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > DATASET_RETENTION_MAX_DAYS) {
    erros.push(erro('retencao_fora_do_limite', String(DATASET_RETENTION_MAX_DAYS)));
  }
  const createdAt = dataIso(input.createdAt || input.criadoEm || agora);
  const expiresAt = dataIso(input.expiresAt || input.expiraEm);
  if (!createdAt) erros.push(erro('created_at_invalido'));
  if (!expiresAt) erros.push(erro('expires_at_obrigatorio'));
  if (createdAt && expiresAt && new Date(expiresAt).getTime() <= new Date(createdAt).getTime()) {
    erros.push(erro('expires_at_nao_futuro'));
  }
  if (createdAt && expiresAt && Number.isInteger(retentionDays)
    && new Date(expiresAt).getTime() > new Date(createdAt).getTime() + retentionDays * 86_400_000) {
    erros.push(erro('expires_at_excede_retencao'));
  }

  const consent = input.consent || input.consentimento || {};
  if (consent.mode !== 'opt_in' || !dataIso(consent.capturedAt || consent.registradoEm) || !texto(consent.version || consent.versao, 40)) {
    erros.push(erro('opt_in_versionado_obrigatorio'));
  }

  const pseudonymization = input.pseudonymization || input.pseudonimizacao || {};
  if (pseudonymization.method !== 'hmac_v1' || !texto(pseudonymization.version || pseudonymization.versao, 40)) {
    erros.push(erro('pseudonimizacao_obrigatoria'));
  }

  const deletion = input.deletionPlan || input.planoPurge || {};
  const destinos = ['derived', 'embeddings', 'backups', 'models'];
  if (!destinos.every((chave) => deletion[chave] === true)) erros.push(erro('purge_propagado_obrigatorio'));
  if (input.killSwitch !== true && input.interruptorEmergencia !== true) erros.push(erro('kill_switch_obrigatorio'));
  if (input.approval !== 'human' && input.aprovacao !== 'humana') erros.push(erro('aprovacao_humana_obrigatoria'));
  const minimumRows = Number(input.minimumRows ?? input.minimoRegistros ?? 0);
  if (!Number.isInteger(minimumRows) || minimumRows < 20) erros.push(erro('minimo_registros_insuficiente'));

  const ok = erros.length === 0;
  if (!ok) return Object.freeze({ ok: false, erros: [...new Set(erros)], manifesto: null });
  const manifesto = {
    version: DATASET_POLICY_VERSION,
    purpose,
    tenantScope,
    fields: [...campos],
    retentionDays,
    createdAt,
    expiresAt,
    consent: { mode: 'opt_in', version: texto(consent.version || consent.versao, 40), capturedAt: dataIso(consent.capturedAt || consent.registradoEm) },
    pseudonymization: { method: 'hmac_v1', version: texto(pseudonymization.version || pseudonymization.versao, 40) },
    deletionPlan: Object.freeze({ derived: true, embeddings: true, backups: true, models: true }),
    killSwitch: true,
    approval: 'human',
    minimumRows,
  };
  return Object.freeze({ ok: true, erros: [], manifesto: Object.freeze(manifesto) });
}

/** Projeta um registro validado somente nos campos do manifesto já aprovado. */
export function projetarRegistroDataset(manifesto, registro) {
  if (!manifesto || !Array.isArray(manifesto.fields) || !registro || typeof registro !== 'object') return {};
  const out = {};
  for (const campo of manifesto.fields) {
    if (Object.prototype.hasOwnProperty.call(registro, campo)) out[campo] = registro[campo];
  }
  return out;
}
