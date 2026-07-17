import { Empresa } from '../types';
import { formatDateBR } from './date';
import { imagemParaDataUri } from './imagemDataUri';
import { escapeHtml, safeHexColor } from './html';
import { footerSeloOlliHtml, DEFAULT_ACCENT } from './pdfGenerator';
import { ajustarParaContraste } from '../theme/cores';

/**
 * certificadoAnvisaPdf.ts — Certificado de Controle de Pragas (dedetização).
 * Ferramenta ÚNICA da vertical `dedetizacao`. Reúne os campos exigidos pela
 * RDC 52/2009 (art. 19) e RDC 622/2022 da ANVISA: identificação da imunizadora
 * (razão social, CNPJ, licenças sanitária E ambiental, responsável técnico
 * habilitado), do cliente/local, praga-alvo, método, e os PRODUTOS saneantes
 * com princípio ativo + registro na ANVISA, além de garantia/validade.
 *
 * É um DOCUMENTO (papel) — sempre claro, independente do tema do app, seguindo
 * o mesmo padrão do recibo/orçamento. NÃO é declaração de conformidade legal
 * automática: a validade jurídica depende das licenças e do RT reais preenchidos.
 */

/** Um produto saneante aplicado (composição química — exigência RDC 52 art. 19). */
export interface ProdutoAnvisa {
  nome: string;
  principioAtivo: string;
  /** Registro do saneante na ANVISA/Ministério da Saúde. */
  registroAnvisa: string;
  grupoQuimico?: string;
}

export interface CertificadoAnvisaDados {
  numero: string;
  clienteNome: string;
  clienteEndereco: string;
  /** Pragas-alvo (ex.: "Baratas, formigas, ratos"). */
  pragaAlvo: string;
  /** Método aplicado (ex.: "Pulverização e iscagem"). */
  metodo: string;
  /** Data da execução (ISO YYYY-MM-DD ou já BR). */
  dataServico: string;
  /** Validade da garantia, em dias, a partir da data do serviço. */
  garantiaDias: number;
  produtos: ProdutoAnvisa[];
  observacoes?: string;
}

function hex6(cor: string): string {
  return /^#[0-9a-fA-F]{3}$/.test(cor)
    ? '#' + cor.slice(1).split('').map((c) => c + c).join('')
    : cor;
}

/** Data ISO/BR + N dias → DD/MM/YYYY (validade da garantia). Nunca lança. */
function somarDias(dataISO: string, dias: number): string {
  const base = /^\d{4}-\d{2}-\d{2}/.test(dataISO)
    ? new Date(dataISO)
    : new Date(dataISO.split('/').reverse().join('-'));
  if (isNaN(base.getTime())) return '';
  base.setDate(base.getDate() + (Number(dias) || 0));
  return formatDateBR(base.toISOString().slice(0, 10));
}

/** Linha "rótulo: valor" — omite se o valor estiver vazio. */
function linha(rotulo: string, valor?: string): string {
  const v = (valor ?? '').trim();
  if (!v) return '';
  return `<div class="info-row"><span class="info-label">${escapeHtml(rotulo)}</span><span class="info-value">${escapeHtml(v)}</span></div>`;
}

export async function montarHtmlCertificadoAnvisa(
  dados: CertificadoAnvisaDados,
  empresa: Empresa,
  opts?: {
    corMarca?: string;
    /**
     * true (Pro/Empresa) remove o selo OLLI — mesmo entitlement do orçamento e do
     * recibo (`remove_olli_brand`, D-07). Default false = grátis mantém o selo.
     */
    removerMarca?: boolean;
  },
): Promise<string> {
  const cor = ajustarParaContraste(
    hex6(safeHexColor(opts?.corMarca ?? empresa.corMarca ?? DEFAULT_ACCENT, DEFAULT_ACCENT)),
    '#FFFFFF',
    4.5,
  );
  const logoData = await imagemParaDataUri(empresa.logoUri);
  const assinaturaData = await imagemParaDataUri(empresa.assinaturaUri);

  const dataBR = /^\d{4}-\d{2}-\d{2}/.test(dados.dataServico)
    ? formatDateBR(dados.dataServico)
    : escapeHtml(dados.dataServico);
  const validadeBR = dados.garantiaDias > 0 ? somarDias(dados.dataServico, dados.garantiaDias) : '';

  const enderecoEmpresa = [empresa.endereco, [empresa.cidade, empresa.estado].filter(Boolean).join('/')]
    .filter(Boolean)
    .join(' · ');

  const produtosRows = dados.produtos
    .filter((p) => (p.nome || '').trim())
    .map(
      (p) => `<tr>
        <td>${escapeHtml(p.nome)}</td>
        <td>${escapeHtml(p.principioAtivo)}</td>
        <td>${escapeHtml(p.grupoQuimico ?? '—')}</td>
        <td>${escapeHtml(p.registroAnvisa)}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #1B2430; background: #fff; padding: 32px 30px; line-height: 1.5; }
  .topo { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${cor}; padding-bottom: 16px; margin-bottom: 20px; }
  .marca { display: flex; align-items: center; gap: 12px; }
  .marca img { max-height: 54px; max-width: 150px; object-fit: contain; }
  .marca-nome { font-size: 18px; font-weight: 800; color: #0A2540; }
  .marca-esp { font-size: 12px; color: #6B7484; }
  .doc-tit { text-align: right; }
  .doc-tit .t { font-size: 15px; font-weight: 800; color: ${cor}; text-transform: uppercase; letter-spacing: 0.5px; }
  .doc-tit .n { font-size: 12px; color: #6B7484; margin-top: 2px; }
  h2 { font-size: 11px; font-weight: 800; color: ${cor}; text-transform: uppercase; letter-spacing: 1px; margin: 18px 0 8px; }
  .bloco { border: 1px solid #E7E9EE; border-radius: 10px; padding: 12px 14px; }
  .info-row { display: flex; gap: 8px; font-size: 12.5px; padding: 2px 0; }
  .info-label { color: #6B7484; min-width: 148px; }
  .info-value { color: #1B2430; font-weight: 600; flex: 1; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 12px; }
  th { background: ${cor}14; color: #0A2540; text-align: left; padding: 8px 10px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 8px 10px; border-bottom: 1px solid #EEF0F3; color: #2C3542; }
  .garantia { margin-top: 16px; border: 1px dashed ${cor}; border-radius: 10px; padding: 12px 14px; background: ${cor}0F; display: flex; justify-content: space-between; align-items: center; }
  .garantia .lbl { font-size: 11px; font-weight: 800; color: ${cor}; text-transform: uppercase; letter-spacing: 1px; }
  .garantia .val { font-size: 15px; font-weight: 800; color: #0A2540; }
  .obs { margin-top: 14px; font-size: 12px; color: #3C4756; }
  .assinatura { margin-top: 36px; text-align: center; }
  .assinatura img { max-height: 60px; margin-bottom: 4px; }
  .assinatura .linha-ass { border-top: 1px solid #1B2430; width: 260px; margin: 0 auto; padding-top: 6px; font-size: 12px; }
  .assinatura .rt { font-size: 11px; color: #6B7484; }
  .base-legal { margin-top: 20px; font-size: 10px; color: #9AA3B2; text-align: center; line-height: 1.5; }
</style>
</head>
<body>
  <div class="topo">
    <div class="marca">
      ${logoData ? `<img src="${logoData}"/>` : ''}
      <div>
        <div class="marca-nome">${escapeHtml(empresa.nome)}</div>
        ${empresa.especialidade ? `<div class="marca-esp">${escapeHtml(empresa.especialidade)}</div>` : ''}
      </div>
    </div>
    <div class="doc-tit">
      <div class="t">Certificado de<br/>Controle de Pragas</div>
      <div class="n">Nº ${escapeHtml(dados.numero)} · ${dataBR}</div>
    </div>
  </div>

  <h2>Empresa especializada (imunizadora)</h2>
  <div class="bloco">
    ${linha('Razão social', empresa.nome)}
    ${linha('CNPJ', empresa.cnpj)}
    ${linha('Endereço', enderecoEmpresa)}
    ${linha('Telefone', empresa.telefone || empresa.whatsapp)}
    ${linha('Licença sanitária', empresa.licencaSanitaria)}
    ${linha('Licença ambiental', empresa.licencaAmbiental)}
    ${linha('Responsável técnico', empresa.responsavelTecnico)}
    ${linha('Registro do RT', empresa.responsavelTecnicoRegistro)}
  </div>

  <h2>Contratante / local tratado</h2>
  <div class="bloco">
    ${linha('Cliente', dados.clienteNome)}
    ${linha('Local', dados.clienteEndereco)}
    ${linha('Pragas-alvo', dados.pragaAlvo)}
    ${linha('Método', dados.metodo)}
    ${linha('Data da execução', dataBR)}
  </div>

  <h2>Produtos saneantes aplicados</h2>
  ${produtosRows
    ? `<table><thead><tr><th>Produto</th><th>Princípio ativo</th><th>Grupo químico</th><th>Registro ANVISA</th></tr></thead><tbody>${produtosRows}</tbody></table>`
    : '<div class="bloco" style="color:#9AA3B2;font-size:12px;">Nenhum produto informado.</div>'}

  ${validadeBR
    ? `<div class="garantia"><span class="lbl">Garantia até</span><span class="val">${validadeBR}</span></div>`
    : ''}

  ${dados.observacoes ? `<div class="obs"><strong>Orientações:</strong> ${escapeHtml(dados.observacoes)}</div>` : ''}

  <div class="assinatura">
    ${assinaturaData ? `<img src="${assinaturaData}"/>` : ''}
    <div class="linha-ass">${escapeHtml(empresa.responsavelTecnico || empresa.nomePrestador || empresa.nome)}</div>
    ${empresa.responsavelTecnicoRegistro ? `<div class="rt">Responsável técnico · ${escapeHtml(empresa.responsavelTecnicoRegistro)}</div>` : ''}
  </div>

  <div class="base-legal">
    Documento emitido conforme a RDC ANVISA nº 52/2009 (art. 19) e nº 622/2022. Serviço executado com produtos
    saneantes desinfestantes registrados na ANVISA, sob responsabilidade do responsável técnico identificado.
  </div>

  ${opts?.removerMarca === true ? '' : footerSeloOlliHtml()}
</body>
</html>`;
}
