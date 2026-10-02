/**
 * Identidade do PRESTADOR na etiqueta QR impressa (logo, nome, contato, cor).
 *
 * Tudo best-effort: sem empresa cadastrada, sem logo ou com logo ilegível a
 * etiqueta sai do mesmo jeito (só com menos marca) — imprimir o adesivo nunca pode
 * travar por causa de um enfeite. Nenhum dado do cliente final entra aqui.
 */
import { getEmpresa } from '../database/database';
import { imagemParaDataUri } from '../utils/imagemDataUri';
import { numeroWhatsAppBR } from '../utils/telefoneWhatsapp';
import { telefoneLegivel } from '../utils/qrEtiqueta';
import type { OpcoesEtiqueta, TamanhoEtiqueta } from '../utils/etiquetaQrPdf';

export async function opcoesEtiquetaDaEmpresa(
  tamanho: TamanhoEtiqueta,
  removerMarca: boolean,
): Promise<OpcoesEtiqueta> {
  const opcoes: OpcoesEtiqueta = { tamanho, removerMarca };
  try {
    const empresa = await getEmpresa();
    if (!empresa) return opcoes;
    opcoes.empresa = empresa.nome || undefined;
    opcoes.corMarca = empresa.corMarca;
    opcoes.contato = telefoneLegivel(numeroWhatsAppBR(empresa.whatsapp) || numeroWhatsAppBR(empresa.telefone)) || undefined;
    opcoes.logoDataUri = await imagemParaDataUri(empresa.logoUri).catch(() => null);
  } catch {
    // sem empresa legível: etiqueta sai sem a marca, nunca deixa de sair
  }
  return opcoes;
}
