/**
 * Provedor Focus NFe — NFS-e padrão nacional (rota /v2/nfsen).
 *
 * ═══ REGRAS DESTA FASE (F1) ═══
 *  - SÓ HOMOLOGAÇÃO (sandbox). Emitir em produção exige decisão do Igor + CNPJ/certificado do cliente real; por isso a
 *    URL de produção NÃO existe neste arquivo. Se `FOCUS_NFE_AMBIENTE` for qualquer coisa diferente de "homologacao"
 *    (ou ausente), `criarProvedorFocus` recusa.
 *  - O token vem SÓ de `env.FOCUS_NFE_TOKEN` (secret do Worker: `wrangler secret put FOCUS_NFE_TOKEN`). Nunca no código,
 *    nunca em log, nunca em resposta ao app.
 *
 * ⚠ OS NOMES DOS CAMPOS ABAIXO NÃO FORAM CONFERIDOS CONTRA A DOCUMENTAÇÃO VIVA (sem conta de teste na Focus ainda).
 *   Foram escritos de memória do layout "nfsen". O 1º passo quando o Igor liberar a conta de teste é rodar UMA emissão
 *   em homologação e ajustar `montarPayload`/`traduzirResposta` — por isso ficam isoladas e testadas à parte.
 */
import { soDigitos } from './validacao.js';

const BASE_HOMOLOGACAO = 'https://homologacao.focusnfe.com.br';
const TIMEOUT_MS = 20_000;

/** Pedido + perfil fiscal → corpo do POST /v2/nfsen. Puro (testável sem rede). */
export function montarPayload({ prestador, tomador, servico, hoje = new Date() }) {
  const dia = hoje.toISOString().slice(0, 10);
  const doc = soDigitos(tomador.documento);
  const regime = { mei: 1, simples: 2, outro: 3 }[prestador.regime]; // 1 MEI · 2 ME/EPP Simples · 3 demais
  return {
    data_emissao: hoje.toISOString(),
    data_competencia: dia,
    codigo_municipio_emissora: String(prestador.codigo_municipio_ibge),
    cnpj_prestador: soDigitos(prestador.cnpj),
    inscricao_municipal_prestador: String(prestador.inscricao_municipal),
    codigo_opcao_simples_nacional: regime,
    ...(doc.length === 14 ? { cnpj_tomador: doc } : { cpf_tomador: doc }),
    razao_social_tomador: tomador.nome,
    ...(tomador.email ? { email_tomador: tomador.email } : {}),
    codigo_municipio_prestacao: String(prestador.codigo_municipio_ibge),
    codigo_tributacao_nacional_iss: String(prestador.codigo_servico),
    descricao_servico: servico.descricao,
    valor_servico: (servico.valorCentavos / 100).toFixed(2),
    tributacao_iss: 1, // 1 = tributável no município
    tipo_retencao_iss: servico.issRetido ? 2 : 1, // 1 = não retido · 2 = retido pelo tomador
    aliquota_iss: Number(prestador.aliquota_iss),
  };
}

/** Resposta da Focus → formato do OLLI. Desconhecido vira 'processando' (nunca inventa "autorizada"). */
export function traduzirResposta(d) {
  const st = String((d?.status) || '').toLowerCase();
  if (st === 'autorizado' || st === 'autorizada') {
    return {
      status: 'autorizada',
      numero: d.numero != null ? String(d.numero) : null,
      chave: d.codigo_verificacao || d.chave_nfse || null,
      pdfUrl: d.url_danfse || d.url || null,
      xmlUrl: d.caminho_xml_nota_fiscal || null,
      ambiente: 'homologacao',
    };
  }
  if (st.startsWith('erro') || st === 'rejeitado' || st === 'cancelado') {
    const m = Array.isArray(d.erros) && d.erros[0] && d.erros[0].mensagem ? d.erros[0].mensagem : d.mensagem;
    return { status: 'erro', mensagem: String(m || 'O provedor recusou a nota.').slice(0, 300), ambiente: 'homologacao' };
  }
  return { status: 'processando', ambiente: 'homologacao' };
}

export function criarProvedorFocus(env, fetchImpl = fetch) {
  if (env.FOCUS_NFE_AMBIENTE !== 'homologacao') {
    throw new Error('focus_somente_homologacao');
  }
  const token = typeof env.FOCUS_NFE_TOKEN === 'string' ? env.FOCUS_NFE_TOKEN.trim() : '';
  if (!token) throw new Error('focus_sem_token');
  const auth = `Basic ${btoa(`${token}:`)}`;

  async function chamar(caminho, init = {}) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const r = await fetchImpl(`${BASE_HOMOLOGACAO}${caminho}`, {
        ...init,
        signal: ctl.signal,
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
      });
      const corpo = await r.json().catch(() => null);
      return { http: r.status, corpo };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    nome: 'focus',
    ambiente: 'homologacao',
    async emitir({ ref, prestador, tomador, servico }) {
      const { http, corpo } = await chamar(`/v2/nfsen?ref=${encodeURIComponent(ref)}`, {
        method: 'POST',
        body: JSON.stringify(montarPayload({ prestador, tomador, servico })),
      });
      // 422 "já existe" com a mesma ref = idempotência: consulta em vez de falhar.
      if (http === 422 && corpo && corpo.codigo === 'nfe_autorizada') return this.consultar(ref);
      if (http >= 500 || http === 0) throw new Error('focus_indisponivel');
      if (http === 401 || http === 403) throw new Error('focus_nao_autorizado');
      if (http >= 400) return traduzirResposta({ status: 'erro', mensagem: corpo?.mensagem });
      return traduzirResposta(corpo);
    },
    async consultar(ref) {
      const { http, corpo } = await chamar(`/v2/nfsen/${encodeURIComponent(ref)}`);
      if (http >= 500 || http === 0) throw new Error('focus_indisponivel');
      if (http === 404) return { status: 'erro', mensagem: 'Nota não encontrada no provedor.', ambiente: 'homologacao' };
      return traduzirResposta(corpo);
    },
  };
}
