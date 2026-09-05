/**
 * Política de leitura do detalhe administrativo.
 *
 * A rota /admin/api/user usa service-role e, por isso, a projeção precisa ser
 * decidida antes da consulta — esconder um campo somente no JSON de resposta
 * ainda deixa o dado sensível dentro do processo sem necessidade.
 *
 * Esta é uma política de diagnóstico operacional, não uma autorização para
 * treinar IA. Dataset, exportação e qualquer finalidade nova continuam exigindo
 * contrato próprio, consentimento/finalidade, auditoria e aprovação humana.
 */

export const ADMIN_DATA_POLICY_VERSION = '2026-08-31.v1';

const ROLES = Object.freeze(['suporte', 'financeiro', 'admin', 'owner']);
export const ADMIN_DATA_ROLES = ROLES;

// A coluna `dados` da tabela empresa é JSON. Os campos abaixo são uma projeção
// operacional; CPF, chave Pix, assinatura em bytes, cláusulas e dados binários
// nunca entram no detalhe administrativo desta versão.
const EMPRESA = Object.freeze({
  suporte: Object.freeze(['nome', 'segmento', 'especialidade', 'cidade', 'estado', 'telefone', 'whatsapp', 'email', 'site', 'corMarca']),
  financeiro: Object.freeze(['nome', 'segmento', 'cnpj', 'cidade', 'estado', 'email']),
  admin: Object.freeze(['nome', 'segmento', 'especialidade', 'slogan', 'cnpj', 'endereco', 'cidade', 'estado', 'telefone', 'whatsapp', 'site', 'email', 'normas', 'verticais', 'ferramentasAtivas', 'corMarca', 'validadeDiasPadrao', 'garantiaPadrao', 'condicoesPagamentoPadrao', 'observacoesPadrao', 'licencaSanitaria', 'licencaAmbiental', 'responsavelTecnico', 'responsavelTecnicoRegistro']),
  owner: Object.freeze(['nome', 'segmento', 'especialidade', 'slogan', 'cnpj', 'endereco', 'cidade', 'estado', 'telefone', 'whatsapp', 'site', 'email', 'normas', 'verticais', 'ferramentasAtivas', 'corMarca', 'validadeDiasPadrao', 'garantiaPadrao', 'condicoesPagamentoPadrao', 'observacoesPadrao', 'licencaSanitaria', 'licencaAmbiental', 'responsavelTecnico', 'responsavelTecnicoRegistro']),
});

const CAMPOS = Object.freeze({
  empresa: EMPRESA,
  // Suporte só precisa localizar e acompanhar o orçamento. Valores e nome do
  // cliente ficam restritos a financeiro/admin/owner.
  orcamentos: Object.freeze({
    suporte: Object.freeze(['numero', 'status', 'criado_em']),
    financeiro: Object.freeze(['numero', 'valor_total', 'status', 'criado_em']),
    admin: Object.freeze(['numero', 'cliente_nome', 'valor_total', 'status', 'criado_em']),
    owner: Object.freeze(['numero', 'cliente_nome', 'valor_total', 'status', 'criado_em']),
  }),
  clientes: Object.freeze({
    suporte: Object.freeze(['id', 'nome', 'telefone']),
    admin: Object.freeze(['id', 'nome', 'telefone']),
    owner: Object.freeze(['id', 'nome', 'telefone']),
  }),
  agenda: Object.freeze({
    suporte: Object.freeze(['id', 'titulo', 'inicio', 'status']),
    admin: Object.freeze(['id', 'titulo', 'inicio', 'status']),
    owner: Object.freeze(['id', 'titulo', 'inicio', 'status']),
  }),
  recibos: Object.freeze({
    financeiro: Object.freeze(['numero', 'valor_recebido', 'data_recebimento']),
    admin: Object.freeze(['numero', 'valor_recebido', 'data_recebimento']),
    owner: Object.freeze(['numero', 'valor_recebido', 'data_recebimento']),
  }),
  // IDs de gateway não são projetados para o navegador. A rota pode consultar
  // stripe_customer_id internamente apenas para buscar faturas autorizadas.
  assinatura: Object.freeze({
    suporte: Object.freeze(['plano', 'status', 'current_period_end']),
    financeiro: Object.freeze(['user_id', 'plano', 'status', 'current_period_end', 'admin_plano_override', 'admin_override_ativo', 'admin_override_ate', 'admin_override_reason', 'admin_override_at']),
    admin: Object.freeze(['user_id', 'plano', 'status', 'current_period_end', 'admin_plano_override', 'admin_override_ativo', 'admin_override_ate', 'admin_override_reason', 'admin_override_at']),
    owner: Object.freeze(['user_id', 'plano', 'status', 'current_period_end', 'admin_plano_override', 'admin_override_ativo', 'admin_override_ate', 'admin_override_reason', 'admin_override_at']),
  }),
  creditos: Object.freeze({
    financeiro: Object.freeze(['id', 'delta', 'origem', 'criado_em']),
    admin: Object.freeze(['id', 'delta', 'origem', 'criado_em']),
    owner: Object.freeze(['id', 'delta', 'origem', 'criado_em']),
  }),
  // O uso de IA já nasce resumido; prompt, resposta e contexto cru ficam fora.
  usosIa: Object.freeze({
    suporte: Object.freeze(['periodo', 'acao', 'criado_em']),
    admin: Object.freeze(['periodo', 'acao', 'criado_em']),
    owner: Object.freeze(['periodo', 'acao', 'criado_em']),
  }),
  auditoria: Object.freeze({
    admin: Object.freeze(['id', 'actor_role', 'acao', 'motivo', 'criado_em']),
    owner: Object.freeze(['id', 'actor_role', 'acao', 'motivo', 'criado_em']),
  }),
});

export const ADMIN_DATASETS = Object.freeze(Object.keys(CAMPOS));

function papelNormalizado(papel) {
  return ROLES.includes(papel) ? papel : null;
}

/** Retorna uma cópia defensiva da lista de campos permitidos. */
export function camposAdmin(papel, dataset) {
  const p = papelNormalizado(papel);
  const campos = p && CAMPOS[dataset] ? CAMPOS[dataset][p] : null;
  return campos ? [...campos] : [];
}

export function podeLerDadosAdmin(papel, dataset) {
  return camposAdmin(papel, dataset).length > 0;
}

/**
 * A tabela empresa guarda um JSON inteiro; o REST só consegue selecionar a
 * coluna `dados`, então esta função faz a segunda barreira em memória.
 */
export function projetarEmpresa(papel, linha) {
  const dados = linha && linha.dados && typeof linha.dados === 'object' ? linha.dados : {};
  const out = {};
  for (const campo of camposAdmin(papel, 'empresa')) {
    if (Object.prototype.hasOwnProperty.call(dados, campo)) out[campo] = dados[campo];
  }
  // A interface pode sinalizar identidade visual sem transportar data URI ou
  // assinatura para o navegador administrativo.
  if (typeof dados.logoUri === 'string' && dados.logoUri) out.logoPresente = true;
  if (typeof dados.assinaturaUri === 'string' && dados.assinaturaUri) out.assinaturaPresente = true;
  return out;
}

/** Projeta linhas REST para a allowlist do papel, removendo campos extras. */
export function projetarLinhas(papel, dataset, linhas) {
  const campos = camposAdmin(papel, dataset);
  if (!campos.length || !Array.isArray(linhas)) return [];
  return linhas.map((linha) => {
    const out = {};
    for (const campo of campos) {
      if (linha && Object.prototype.hasOwnProperty.call(linha, campo)) out[campo] = linha[campo];
    }
    return out;
  });
}

/** REST select seguro para todas as tabelas, exceto empresa (JSON `dados`). */
export function selectAdminDataset(papel, dataset) {
  if (dataset === 'empresa') return podeLerDadosAdmin(papel, dataset) ? 'dados' : '';
  return camposAdmin(papel, dataset).join(',');
}

export function politicaDadosAdmin(papel) {
  const role = papelNormalizado(papel);
  const datasets = {};
  for (const dataset of Object.keys(CAMPOS)) {
    datasets[dataset] = Object.freeze({
      ler: podeLerDadosAdmin(role, dataset),
      campos: Object.freeze(camposAdmin(role, dataset)),
      select: selectAdminDataset(role, dataset),
    });
  }
  return Object.freeze({ versao: ADMIN_DATA_POLICY_VERSION, papel: role, datasets: Object.freeze(datasets) });
}
