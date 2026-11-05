import { Empresa } from '../types';
import { imagemParaDataUri } from './imagemDataUri';
import { escapeHtml } from './html';
import { CAIXA_LOGO_DOCUMENTO, tagImgLogo } from './identidadeVisual';
import { footerSeloOlliHtml } from './pdfGenerator';
import { corDoDocumento, cssDocumentoOficio, linhaInfo } from './documentoOficioPdf';
import {
  DECLARACAO_CAIXA_DAGUA,
  TITULO_CERTIFICADO_CAIXA_DAGUA,
  proximaLimpeza,
  reservatoriosInformados,
  somarDiasData,
  type DadosCertificadoCaixaDagua,
} from '../services/documentosOficio';

/**
 * certificadoCaixaDaguaPdf.ts — Certificado de limpeza e desinfecção de reservatório
 * (caixa d'água). Ferramenta da vertical `caixa_dagua`.
 *
 * Os campos e a origem de cada um estão em `services/documentosOficio.ts`
 * (CAMPOS_CERTIFICADO_CAIXA_DAGUA). A declaração de "condições higiênicas favoráveis
 * para o recebimento de água potável", o lacre e a validade vêm da Lei municipal de SP
 * 10.770/1989; em outras cidades vale a regra local. Não é laudo de potabilidade: o
 * certificado atesta a limpeza, não a análise da água.
 */

function litros(n: number): string {
  return `${new Intl.NumberFormat('pt-BR').format(n)} L`;
}

export async function montarHtmlCertificadoCaixaDagua(
  dados: DadosCertificadoCaixaDagua,
  empresa: Empresa,
  opts: {
    numero: string;
    corMarca?: string;
    /** true (Pro/Empresa) remove o selo OLLI — mesmo entitlement do orçamento (D-07). */
    removerMarca?: boolean;
  },
): Promise<string> {
  const cor = corDoDocumento(opts.corMarca ?? empresa.corMarca);
  const logoData = await imagemParaDataUri(empresa.logoUri);
  const assinaturaData = await imagemParaDataUri(empresa.assinaturaUri);
  const dataLimpeza = somarDiasData(dados.dataExecucao, 0) ?? '';
  const validade = proximaLimpeza(dados) ?? '';

  const reservatoriosRows = reservatoriosInformados(dados.reservatorios)
    .map((r) => `<tr><td>${escapeHtml(r.descricao)}</td><td>${escapeHtml(litros(r.capacidadeLitros))}</td></tr>`)
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
      <div class="t">${escapeHtml(TITULO_CERTIFICADO_CAIXA_DAGUA)}</div>
      <div class="n">Nº ${escapeHtml(opts.numero)} · ${escapeHtml(dataLimpeza)}</div>
    </div>
  </div>

  <h2>Empresa executora</h2>
  <div class="bloco">
    ${linhaInfo('Nome', dados.empresaRazaoSocial)}
    ${linhaInfo('CNPJ / CPF', dados.empresaDocumento)}
    ${linhaInfo('Telefone', dados.empresaTelefone)}
    ${linhaInfo('Responsável', dados.responsavel)}
  </div>

  <h2>Cliente e serviço</h2>
  <div class="bloco">
    ${linhaInfo('Cliente', dados.clienteNome)}
    ${linhaInfo('Endereço do imóvel', dados.enderecoImovel)}
    ${linhaInfo('Data da limpeza', dataLimpeza)}
    ${linhaInfo('Desinfecção', `${dados.produtoDesinfeccao} · ${dados.concentracaoDesinfeccao}`)}
    ${linhaInfo('Número do lacre', dados.numeroLacre)}
  </div>

  <h2>Reservatórios</h2>
  <table><thead><tr><th>Reservatório</th><th>Capacidade</th></tr></thead><tbody>${reservatoriosRows}</tbody></table>

  <div class="texto">${escapeHtml(DECLARACAO_CAIXA_DAGUA)}</div>

  <div class="destaque"><span class="lbl">Próxima limpeza até</span><span class="val">${escapeHtml(validade)}</span></div>

  ${dados.orientacoes?.trim() ? `<div class="obs"><strong>Orientações:</strong> ${escapeHtml(dados.orientacoes.trim())}</div>` : ''}

  <div class="assinatura">
    ${assinaturaData ? `<img src="${escapeHtml(assinaturaData)}"/>` : ''}
    <div class="linha-ass">${escapeHtml(dados.responsavel)}</div>
    <div class="rt">${escapeHtml(dados.empresaRazaoSocial)}</div>
  </div>

  <div class="base-legal">
    Mantenha este certificado exposto em local visível. No município de São Paulo, a Lei nº 10.770/1989 exige a
    limpeza dos reservatórios a cada 360 dias nos estabelecimentos e edifícios que ela lista; em outras cidades,
    confira a regra do município.
  </div>

  ${opts.removerMarca === true ? '' : footerSeloOlliHtml()}
</body>
</html>`;
}
