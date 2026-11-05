import { Empresa } from '../types';
import { imagemParaDataUri } from './imagemDataUri';
import { escapeHtml } from './html';
import { CAIXA_LOGO_DOCUMENTO, tagImgLogo } from './identidadeVisual';
import { footerSeloOlliHtml } from './pdfGenerator';
import { corDoDocumento, cssDocumentoOficio, linhaInfo } from './documentoOficioPdf';
import {
  BASE_LEGAL_COMPROVANTE_PRAGAS,
  TITULO_COMPROVANTE_PRAGAS,
  pragasInformadas,
  prazoPorExtenso,
  produtosInformados,
  somarDiasData,
  type DadosComprovantePragas,
} from '../services/documentosOficio';

/**
 * certificadoAnvisaPdf.ts — Comprovante de execução de serviço de controle de vetores e
 * pragas urbanas (dedetização). Ferramenta da vertical `dedetizacao`.
 *
 * O conteúdo segue o art. 19 da RDC ANVISA nº 622/2022 (que revogou a RDC 52/2009): os
 * onze incisos estão listados, com a norma de cada um, em `services/documentosOficio.ts`
 * (CAMPOS_COMPROVANTE_PRAGAS), e a tela só gera o PDF quando nenhum falta
 * (`pendenciasComprovantePragas`). O nome do arquivo ficou "certificadoAnvisa" porque a
 * rota e a ferramenta já existem com esse nome em contas reais.
 *
 * É um DOCUMENTO (papel) — sempre claro, independente do tema do app. NÃO é declaração
 * de conformidade: a validade depende das licenças e do responsável técnico reais.
 */

/** Data ISO ou BR → DD/MM/AAAA para impressão ('' quando ilegível). */
function dataBr(data: string): string {
  return somarDiasData(data, 0) ?? '';
}

export async function montarHtmlCertificadoAnvisa(
  dados: DadosComprovantePragas,
  empresa: Empresa,
  opts: {
    numero: string;
    corMarca?: string;
    /**
     * true (Pro/Empresa) remove o selo OLLI — mesmo entitlement do orçamento e do
     * recibo (`remove_olli_brand`, D-07). Default false = grátis mantém o selo.
     */
    removerMarca?: boolean;
  },
): Promise<string> {
  const cor = corDoDocumento(opts.corMarca ?? empresa.corMarca);
  const logoData = await imagemParaDataUri(empresa.logoUri);
  const assinaturaData = await imagemParaDataUri(empresa.assinaturaUri);
  const dataExecucao = dataBr(dados.dataExecucao);

  const pragasRows = pragasInformadas(dados.pragas)
    .map((p) => `<tr><td>${escapeHtml(p.praga)}</td><td>${escapeHtml(prazoPorExtenso(p.prazoDias) ?? '')}</td></tr>`)
    .join('');

  const produtosRows = produtosInformados(dados.produtos)
    .map(
      (p) => `<tr>
        <td>${escapeHtml(p.nome)}</td>
        <td>${escapeHtml(p.concentracao)}</td>
        <td>${escapeHtml(p.grupoQuimico)}</td>
        <td>${escapeHtml(p.principioAtivo || '—')}</td>
        <td>${escapeHtml(p.registroAnvisa || '—')}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<style>${cssDocumentoOficio(cor)}</style>
</head>
<body>
  <div class="topo">
    <div class="marca">
      ${tagImgLogo(logoData ? escapeHtml(logoData) : '', 'marca-logo', CAIXA_LOGO_DOCUMENTO)}
      <div>
        <div class="marca-nome">${escapeHtml(dados.empresaRazaoSocial || empresa.nome)}</div>
        ${empresa.especialidade ? `<div class="marca-esp">${escapeHtml(empresa.especialidade)}</div>` : ''}
      </div>
    </div>
    <div class="doc-tit">
      <div class="t">${escapeHtml(TITULO_COMPROVANTE_PRAGAS)}</div>
      <div class="n">Nº ${escapeHtml(opts.numero)} · ${escapeHtml(dataExecucao)}</div>
    </div>
  </div>

  <h2>Empresa especializada</h2>
  <div class="bloco">
    ${linhaInfo('Razão social', dados.empresaRazaoSocial)}
    ${linhaInfo('CNPJ', empresa.cnpj)}
    ${linhaInfo('Endereço', dados.empresaEndereco)}
    ${linhaInfo('Telefone', dados.empresaTelefone)}
    ${linhaInfo('Licença sanitária', `${dados.licencaSanitaria} · validade ${dados.licencaSanitariaValidade}`)}
    ${linhaInfo('Licença ambiental', `${dados.licencaAmbiental} · validade ${dados.licencaAmbientalValidade}`)}
    ${linhaInfo('Responsável técnico', `${dados.responsavelTecnico} · ${dados.registroResponsavelTecnico}`)}
  </div>

  <h2>Cliente e serviço</h2>
  <div class="bloco">
    ${linhaInfo('Cliente', dados.clienteNome)}
    ${linhaInfo('Endereço do imóvel', dados.enderecoImovel)}
    ${linhaInfo('Data de execução', dataExecucao)}
  </div>

  <h2>Pragas-alvo e prazo de assistência técnica</h2>
  <table><thead><tr><th>Praga-alvo</th><th>Prazo de assistência técnica</th></tr></thead><tbody>${pragasRows}</tbody></table>

  <h2>Produtos aplicados</h2>
  <table><thead><tr><th>Produto</th><th>Concentração</th><th>Grupo químico</th><th>Princípio ativo</th><th>Registro</th></tr></thead><tbody>${produtosRows}</tbody></table>

  <div class="texto"><strong>Orientações:</strong> ${escapeHtml(dados.orientacoes)}</div>

  <div class="destaque"><span class="lbl">Centro de Informação Toxicológica</span><span class="val">${escapeHtml(dados.telefoneCit)}</span></div>

  <div class="assinatura">
    ${assinaturaData ? `<img src="${escapeHtml(assinaturaData)}"/>` : ''}
    <div class="linha-ass">${escapeHtml(dados.responsavelTecnico)}</div>
    <div class="rt">Responsável técnico · ${escapeHtml(dados.registroResponsavelTecnico)}</div>
  </div>

  <div class="base-legal">
    Conteúdo mínimo do comprovante de execução de serviço conforme a ${escapeHtml(BASE_LEGAL_COMPROVANTE_PRAGAS)}.
    Serviço executado sob a responsabilidade do responsável técnico identificado acima.
  </div>

  ${opts.removerMarca === true ? '' : footerSeloOlliHtml()}
</body>
</html>`;
}
