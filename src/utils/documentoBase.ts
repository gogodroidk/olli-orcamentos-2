import type { Empresa } from '../types';
import { escapeHtml, safeHexColor } from './html';
import { footerSeloOlliHtml, DEFAULT_ACCENT } from './marcaOlli';
import { ajustarParaContraste } from '../theme/cores';

/**
 * documentoBase.ts — CHASSI dos documentos jurídicos do prestador (contrato,
 * termo de garantia, termo de conclusão de serviço).
 *
 * NÃO é um segundo motor de PDF. É a camada fina que esses três documentos
 * compartilham, e ela se apoia no que o orçamento e o recibo já resolveram:
 *   - `escapeHtml` / `safeHexColor` (utils/html) — o conserto de XSS armazenado;
 *   - `imagemParaDataUri` — logo/assinatura que renderizam no expo-print;
 *   - `footerSeloOlliHtml` / `DEFAULT_ACCENT` (marcaOlli) — a mesma marca;
 *   - `ajustarParaContraste` (theme/cores) — marca clara não some no papel;
 *   - `exportarHtmlComoPdf` (exportarDocumento) — a mesma saída multiplataforma.
 *
 * Documento é PAPEL: sempre claro, nunca segue o tema do app (mesmo contrato do
 * pdfGenerator e do reciboPdf).
 *
 * O TOPO DESTE MÓDULO É PURO — nenhum import puxa `react-native`. Isso não é
 * estética: é o que permite ao teste EXECUTAR os geradores e conferir o HTML que
 * sai, em vez de só descrever o que o código deveria fazer. O único trecho que
 * precisa de plataforma (ler imagem do disco) carrega sob demanda, dentro da
 * função async — mesmo padrão do `import` dinâmico já usado em pdfGenerator.
 */

/* ─── Honestidade jurídica ─────────────────────────────────────────
 * REGRA DURA desta frente: nada aqui foi redigido nem revisado por advogado
 * para o caso concreto de ninguém. O documento diz isso — de forma clara e
 * assumida, não como rascunho pedindo desculpa — e a cópia do app não pode
 * prometer validade jurídica garantida. Modelo bom + aviso honesto é útil;
 * vender o modelo como se ele blindasse o prestador é risco para ele e para o
 * dono do produto.
 *
 * O aviso também presta um serviço real: informa às DUAS partes que a garantia
 * legal do CDC existe independentemente do que o papel disser.
 */
export const AVISO_JURIDICO = [
  'Documento gerado pelo OLLI a partir dos dados deste serviço e das cláusulas escolhidas pelo prestador.',
  'É um modelo de uso geral: não foi redigido nem revisado por advogado para este caso específico.',
  'Em contratação de valor alto, prazo longo ou risco relevante, consulte um advogado antes de assinar.',
  'A garantia legal do Código de Defesa do Consumidor (arts. 24, 26 e 50 da Lei 8.078/1990) vale independentemente do que estiver escrito aqui e não pode ser afastada por contrato.',
].join(' ');

/**
 * Frase curta para a INTERFACE do app (cards, botões, prévias). Existe separada
 * do `AVISO_JURIDICO` porque o aviso do papel é para o cliente e este é para o
 * prestador — mas as duas obedecem à mesma regra: descrevem o que o documento é,
 * nunca prometem o que ele não entrega.
 */
export const AVISO_APP = 'Modelo pronto para ajustar. Não é parecer de advogado nem garante validade jurídica.';

/* ─── Cor da marca no papel ────────────────────────────────────────── */

/** `#RGB` → `#RRGGBB`. Um `${cor}0F` (tint) só é CSS válido com 6 dígitos. */
function hex6(cor: string): string {
  return /^#[0-9a-fA-F]{3}$/.test(cor)
    ? '#' + cor.slice(1).split('').map(c => c + c).join('')
    : cor;
}

/**
 * Cor de marca validada e escurecida até TEXTO BRANCO passar 4.5:1 sobre ela —
 * mesma decisão do recibo: uma marca clara (ciano, amarelo) deixava título e
 * faixa ilegíveis. Valida como hex ANTES de interpolar em `<style>`.
 */
export function corDoDocumento(corMarca: string | undefined, empresa: Empresa): string {
  const bruta = safeHexColor(corMarca ?? empresa.corMarca ?? DEFAULT_ACCENT, DEFAULT_ACCENT);
  return ajustarParaContraste(hex6(bruta), '#FFFFFF', 4.5);
}

/* ─── Imagens ──────────────────────────────────────────────────────── */

export interface ImagensDocumento {
  logo: string;
  assinaturaPrestador: string;
}

/**
 * Converte logo e assinatura do prestador para data URI ANTES de montar o HTML
 * (file:// não renderiza no expo-print do Android). Falha vira string vazia:
 * documento sem logo é melhor que documento quebrado.
 *
 * `imagemParaDataUri` entra por `import` dinâmico porque ele importa
 * `react-native` no topo — carregá-lo aqui estaticamente contaminaria o módulo
 * inteiro e tiraria os geradores do alcance do teste.
 */
export async function carregarImagensDocumento(
  empresa: Empresa,
  assinaturaPrestadorUri?: string,
): Promise<ImagensDocumento> {
  try {
    const { imagemParaDataUri } = await import('./imagemDataUri');
    const [logo, assinatura] = await Promise.all([
      imagemParaDataUri(empresa.logoUri),
      imagemParaDataUri(assinaturaPrestadorUri ?? empresa.assinaturaUri),
    ]);
    return { logo: logo ?? '', assinaturaPrestador: assinatura ?? '' };
  } catch {
    // Sem imagem o documento sai igual, só sem logo/assinatura desenhada — e a
    // linha de assinatura em branco continua lá para assinar no papel.
    return { logo: '', assinaturaPrestador: '' };
  }
}

/**
 * Data URI pronto para entrar num `src="..."`, SEMPRE escapado.
 *
 * `imagemParaDataUri` repassa um `data:` já pronto sem validar o conteúdo, e
 * `empresa.logoUri` é campo SINCRONIZADO (pode ser escrito direto na API). Sem
 * o escape, um valor adulterado fecharia o atributo e injetaria HTML — o mesmo
 * vetor que o `img()` do pdfGenerator fechou. Para um base64 legítimo o escape
 * é no-op (o alfabeto base64 não tem `< > & " '`).
 */
export function imgSrc(dataUri: string | undefined): string {
  if (!dataUri) return '';
  return escapeHtml(dataUri.startsWith('data:') ? dataUri : '');
}

/* ─── Blocos ───────────────────────────────────────────────────────── */

/**
 * Linha "rótulo: valor" de um quadro de qualificação. Omite valor vazio.
 *
 * A omissão é DE PROPÓSITO e continua certa para "Contato" — mas ela apaga em
 * silêncio os campos que qualificam quem assina. Quem paga essa conta é
 * `qualificacaoPendente`, logo abaixo: o papel não ganha placeholder, a TELA
 * ganha o aviso.
 */
export function linhaInfo(rotulo: string, valor?: string): string {
  const v = (valor ?? '').trim();
  if (!v) return '';
  return `<div class="info-row"><span class="info-label">${escapeHtml(rotulo)}</span><span class="info-value">${escapeHtml(v)}</span></div>`;
}

/* ─── Qualificação das partes ──────────────────────────────────────────── */

/** Os três documentos jurídicos. Casa com `TipoDocumento` do modal de geração. */
export type TipoDocumentoJuridico = 'contrato' | 'garantia' | 'conclusao';

/** Um campo de qualificação que ESTE documento vai imprimir em branco. */
export interface CampoFaltante {
  /** Nome do campo como o prestador o vê na tela onde ele preenche. */
  campo: string;
  /** Onde ele conserta. Sem isso o aviso vira reclamação sem saída. */
  onde: 'Meu Negócio' | 'cadastro do cliente';
}

/** Dados do cliente que o documento imprime — vêm do orçamento. */
export interface ClienteDoDocumento {
  nome?: string;
  cpfCnpj?: string;
  endereco?: string;
}

/**
 * O que vai sair EM BRANCO na qualificação das partes deste documento.
 *
 * O PROBLEMA. `linhaInfo` some com a linha vazia, então CNPJ/CPF da CONTRATADA e
 * CPF/endereço do CONTRATANTE desaparecem sem placeholder e sem aviso — e o
 * contrato afirma, três linhas abaixo, "As partes acima qualificadas...". Sem
 * nome de cliente o bloco inteiro sai como um retângulo com borda e nada dentro.
 *
 * POR QUE AVISAR, E NÃO RECUSAR NEM PREENCHER. Recusar quebra o offline-first: o
 * prestador está na casa do cliente e precisa do papel agora. Encher de "_____"
 * entrega ao cliente um documento com cara de rascunho. O certo é o terceiro
 * caminho — o mesmo do `<AvisoCep>`: informar ANTES, nomear o que falta e onde
 * se conserta, e deixar gerar mesmo assim. Quem decide é quem está lá.
 *
 * SÓ ENTRA AQUI O QUE O PAPEL REALMENTE IMPRIME EM BRANCO. O endereço do cliente
 * some no contrato (`o.clienteEndereco` vai cru para `linhaInfo`), mas nos
 * termos ele já cai num texto de fallback e nunca fica vazio — avisar sobre
 * campo que o documento resolve sozinho ensina o prestador a ignorar o aviso, e
 * aí o aviso que importa também é ignorado.
 */
export function qualificacaoPendente(
  tipo: TipoDocumentoJuridico,
  cliente: ClienteDoDocumento,
  empresa: Empresa,
): CampoFaltante[] {
  const vazio = (v?: string) => !(v ?? '').trim();
  const faltando: CampoFaltante[] = [];

  // CONTRATADA. Os três documentos imprimem a linha de CNPJ/CPF do prestador.
  if (!documentoDaEmpresa(empresa)) {
    faltando.push({ campo: 'CNPJ ou CPF do seu negócio', onde: 'Meu Negócio' });
  }
  // Contrato e termo de garantia imprimem o endereço da empresa; a conclusão não.
  if (tipo !== 'conclusao' && !enderecoDaEmpresa(empresa)) {
    faltando.push({ campo: 'endereço do seu negócio', onde: 'Meu Negócio' });
  }

  // CONTRATANTE. O nome é o pior: sem ele o bloco sai vazio e a linha de
  // assinatura fica sem nome embaixo.
  if (vazio(cliente.nome)) {
    faltando.push({ campo: 'nome do cliente', onde: 'cadastro do cliente' });
  }
  if (vazio(cliente.cpfCnpj)) {
    faltando.push({ campo: 'CPF ou CNPJ do cliente', onde: 'cadastro do cliente' });
  }
  if (tipo === 'contrato' && vazio(cliente.endereco)) {
    faltando.push({ campo: 'endereço do cliente', onde: 'cadastro do cliente' });
  }

  return faltando;
}

/**
 * O aviso em uma frase, montado da lista. Vive aqui, e não no JSX, porque é
 * texto de produto: tem que ser o MESMO no app e no painel, e tem que poder ser
 * conferido por teste sem montar componente.
 *
 * A frase diz o que falta, onde conserta e que dá para gerar assim mesmo —
 * nessa ordem. Nunca diz "não é possível gerar": é possível, e às vezes é o
 * certo (cliente que só quer o papel na mão hoje).
 */
export function textoQualificacaoPendente(faltando: readonly CampoFaltante[]): string {
  if (faltando.length === 0) return '';
  const lista = faltando.map(f => f.campo);
  const campos = lista.length === 1
    ? lista[0]
    : `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}`;
  const lugares = [...new Set(faltando.map(f => f.onde))].join(' e em ');
  return `Este documento vai sair sem ${campos} — são os campos que identificam quem assina. `
    + `Você pode preencher em ${lugares} e gerar de novo, ou gerar assim mesmo.`;
}

/** Endereço da empresa em uma linha (rua · cidade/UF). */
export function enderecoDaEmpresa(empresa: Empresa): string {
  return [empresa.endereco, [empresa.cidade, empresa.estado].filter(Boolean).join('/')]
    .filter(Boolean)
    .join(' · ');
}

/** Documento fiscal do prestador: CNPJ quando há, senão CPF (autônomo). */
export function documentoDaEmpresa(empresa: Empresa): string {
  const cnpj = (empresa.cnpj ?? '').trim();
  if (cnpj) return `CNPJ ${cnpj}`;
  const cpf = (empresa.cpf ?? '').trim();
  return cpf ? `CPF ${cpf}` : '';
}

/**
 * Cabeçalho comum: marca à esquerda, título/número do documento à direita.
 *
 * `titulo` é TEXTO, nunca HTML — e um ARRAY quando precisa quebrar em duas
 * linhas ("Contrato de" / "Prestação de Serviços"). Cada linha é escapada e o
 * `<br/>` é marcação nossa, colocada aqui.
 *
 * A alternativa óbvia — deixar o chamador mandar `'Contrato de<br/>Prestação'` —
 * é o bug que este desenho fecha: `escapeHtml` transformava a tag em texto e o
 * cabeçalho de TODO contrato saía com um `<br/>` literal impresso na cara do
 * cliente. Aceitar HTML do chamador para consertar isso reabriria o buraco de
 * XSS pelo outro lado. Array de linhas resolve os dois de uma vez.
 */
export function cabecalhoDocumento(
  empresa: Empresa,
  logoDataUri: string,
  titulo: string | readonly string[],
  subtitulo: string,
): string {
  const logo = imgSrc(logoDataUri);
  const tituloHtml = (Array.isArray(titulo) ? titulo : [titulo as string])
    .map(linha => escapeHtml(linha))
    .join('<br/>');
  return `
  <div class="topo">
    <div class="marca">
      ${logo ? `<img src="${logo}" class="marca-logo"/>` : ''}
      <div>
        <div class="marca-nome">${escapeHtml(empresa.nome)}</div>
        ${empresa.especialidade ? `<div class="marca-esp">${escapeHtml(empresa.especialidade)}</div>` : ''}
      </div>
    </div>
    <div class="doc-tit">
      <div class="t">${tituloHtml}</div>
      <div class="n">${escapeHtml(subtitulo)}</div>
    </div>
  </div>`;
}

export interface DadosAssinaturas {
  prestadorNome: string;
  prestadorSub: string;
  clienteNome: string;
  clienteSub: string;
  /** Data URI da assinatura do prestador (já convertida). */
  assinaturaPrestador?: string;
  /** Data URI da assinatura colhida do cliente no aparelho. */
  assinaturaCliente?: string;
  /** ISO do momento em que o cliente confirmou — vira carimbo impresso. */
  dataAssinaturaCliente?: string;
  /** Local e data de celebração (ex.: "São Paulo/SP, 18 de julho de 2026"). */
  localEData?: string;
  /**
   * Duas linhas de testemunha. O CPC (art. 784, III) trata o documento
   * particular assinado pelo devedor E por duas testemunhas como título
   * executivo extrajudicial, e o Código Civil (art. 595) exige duas testemunhas
   * quando uma das partes não sabe ler ou escrever. Custa duas linhas no papel;
   * por isso o contrato as traz e os termos curtos não.
   */
  comTestemunhas?: boolean;
}

/**
 * Bloco de assinaturas. A imagem entra QUANDO ELA EXISTE — sem assinatura sai a
 * linha em branco de sempre (assina-se no papel), nunca um `<img>` vazio, que no
 * PDF vira ícone de imagem quebrada em cima da linha.
 *
 * Quando há assinatura do cliente, a legenda vira o registro do aceite com data
 * e hora: colher o carimbo e não imprimir deixaria o aceite só na tela de quem
 * colheu. Mesma decisão já tomada no orçamento.
 */
export function blocoAssinaturas(d: DadosAssinaturas): string {
  const assPrest = imgSrc(d.assinaturaPrestador);
  const assCli = imgSrc(d.assinaturaCliente);
  const carimbo = d.dataAssinaturaCliente
    ? `<div class="ass-carimbo">Assinado no aparelho em ${escapeHtml(d.dataAssinaturaCliente)}</div>`
    : '';

  const testemunhas = d.comTestemunhas
    ? `
    <div class="testemunhas">
      <div class="test-titulo">Testemunhas</div>
      <div class="test-grid">
        <div class="test-col">
          <div class="ass-linha"></div>
          <div class="ass-cap">Nome:</div>
          <div class="ass-cap">CPF:</div>
        </div>
        <div class="test-col">
          <div class="ass-linha"></div>
          <div class="ass-cap">Nome:</div>
          <div class="ass-cap">CPF:</div>
        </div>
      </div>
    </div>`
    : '';

  return `
  ${d.localEData ? `<div class="local-data">${escapeHtml(d.localEData)}</div>` : ''}
  <div class="assinaturas">
    <div class="ass-col">
      ${assPrest ? `<img src="${assPrest}" class="ass-img"/>` : ''}
      <div class="ass-linha"></div>
      <div class="ass-cap ass-nome">${escapeHtml(d.prestadorNome)}</div>
      <div class="ass-cap">${escapeHtml(d.prestadorSub)}</div>
    </div>
    <div class="ass-col">
      ${assCli ? `<img src="${assCli}" class="ass-img"/>` : ''}
      <div class="ass-linha"></div>
      <div class="ass-cap ass-nome">${escapeHtml(d.clienteNome)}</div>
      <div class="ass-cap">${escapeHtml(d.clienteSub)}</div>
      ${carimbo}
    </div>
  </div>
  ${testemunhas}`;
}

/**
 * Rodapé: aviso jurídico + selo OLLI. O aviso é SEMPRE impresso — não existe
 * plano que o remova. `removerMarca` (entitlement `remove_olli_brand`) tira só
 * o selo, exatamente como no orçamento e no recibo.
 */
export function rodapeDocumento(removerMarca?: boolean): string {
  return `
  <div class="aviso">
    <div class="aviso-tit">Sobre este documento</div>
    <div class="aviso-txt">${escapeHtml(AVISO_JURIDICO)}</div>
  </div>
  ${removerMarca === true ? '' : `<div class="selo">${footerSeloOlliHtml()}</div>`}`;
}

/**
 * CSS comum. `cor` já vem validada por `corDoDocumento` — é o único valor
 * interpolado aqui, e é por isso que a validação não pode ser pulada.
 */
export function cssDocumentoBase(cor: string): string {
  return `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #1B2430; background: #fff;
         font-size: 12.5px; line-height: 1.6; padding: 34px 32px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .topo { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px;
          border-bottom: 3px solid ${cor}; padding-bottom: 14px; margin-bottom: 18px; }
  .marca { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .marca-logo { max-height: 54px; max-width: 160px; width: auto; height: auto; object-fit: contain; }
  .marca-nome { font-size: 17px; font-weight: 800; color: #0A2540; overflow-wrap: anywhere; }
  .marca-esp { font-size: 11.5px; color: #6B7484; }
  .doc-tit { text-align: right; flex-shrink: 0; }
  .doc-tit .t { font-size: 14px; font-weight: 800; color: ${cor}; text-transform: uppercase; letter-spacing: 0.6px; }
  .doc-tit .n { font-size: 11.5px; color: #6B7484; margin-top: 2px; }

  h2 { font-size: 10.5px; font-weight: 800; color: ${cor}; text-transform: uppercase; letter-spacing: 1px;
       margin: 18px 0 7px; page-break-after: avoid; }
  .bloco { border: 1px solid #E7E9EE; border-radius: 10px; padding: 11px 13px; page-break-inside: avoid; }
  .info-row { display: flex; gap: 10px; font-size: 12px; padding: 2px 0; }
  .info-label { color: #6B7484; min-width: 132px; flex-shrink: 0; }
  .info-value { color: #1B2430; font-weight: 600; flex: 1; overflow-wrap: anywhere; }

  .clausula { margin-top: 14px; page-break-inside: avoid; }
  .clausula-tit { font-size: 12px; font-weight: 800; color: #0A2540; text-transform: uppercase; letter-spacing: 0.4px; }
  .clausula-txt { font-size: 12.5px; color: #2C3542; margin-top: 3px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .clausula-lista { margin: 4px 0 0 16px; font-size: 12.5px; color: #2C3542; }
  .clausula-lista li { margin-top: 2px; overflow-wrap: anywhere; }

  .destaque { margin-top: 14px; border: 1px dashed ${cor}; border-radius: 10px; padding: 11px 13px;
              background: ${cor}0F; display: flex; justify-content: space-between; align-items: center; gap: 14px;
              page-break-inside: avoid; }
  .destaque .lbl { font-size: 10.5px; font-weight: 800; color: ${cor}; text-transform: uppercase; letter-spacing: 1px; }
  .destaque .val { font-size: 17px; font-weight: 800; color: #0A2540; text-align: right; overflow-wrap: anywhere; }

  table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 12px; }
  th { background: ${cor}14; color: #0A2540; text-align: left; padding: 7px 9px; font-size: 10px;
       text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 7px 9px; border-bottom: 1px solid #EEF0F3; color: #2C3542; overflow-wrap: anywhere; }
  td.num { text-align: right; white-space: nowrap; }

  .local-data { margin-top: 26px; font-size: 12.5px; color: #2C3542; }
  .assinaturas { display: flex; gap: 36px; margin-top: 34px; page-break-inside: avoid; }
  .ass-col { flex: 1; text-align: center; min-width: 0; }
  .ass-img { max-height: 52px; max-width: 200px; object-fit: contain; display: block; margin: 0 auto 2px; }
  .ass-linha { border-top: 1px solid #1B2430; margin-top: 30px; }
  .ass-col .ass-img + .ass-linha { margin-top: 0; }
  .ass-cap { font-size: 11px; color: #6B7484; margin-top: 3px; overflow-wrap: anywhere; }
  .ass-nome { font-weight: 700; color: #1B2430; }
  .ass-carimbo { font-size: 10px; color: #8A93A2; margin-top: 4px; }

  .testemunhas { margin-top: 26px; page-break-inside: avoid; }
  .test-titulo { font-size: 10.5px; font-weight: 800; color: ${cor}; text-transform: uppercase; letter-spacing: 1px; }
  .test-grid { display: flex; gap: 36px; margin-top: 22px; }
  .test-col { flex: 1; min-width: 0; }
  .test-col .ass-linha { margin-top: 0; }
  .test-col .ass-cap { text-align: left; }

  /* O aviso jurídico é INFORMAÇÃO, não letra miúda de rodapé.
   * Estava em 9.5px e #8A93A2 — a menor fonte e o PIOR contraste do documento
   * inteiro (3.10:1, abaixo do mínimo de 4.5:1), contra um corpo de 12.5px a
   * 12.39:1. A honestidade existia no texto e desaparecia na diagramação: um
   * aviso que se esconde não é aviso, e este presta um serviço às DUAS partes
   * (informa que a garantia legal do CDC vale de qualquer jeito).
   * Agora 11px / #4A5261 = 7.86:1 — legível, e ainda SUBORDINADO ao corpo
   * (menor e mais claro que os 12.5px #2C3542 da cláusula), para o documento
   * não virar panfleto de advertência. Os dois números são MEDIDOS pelo teste,
   * com a mesma função de contraste do tema, lendo o CSS que de fato sai. */
  .aviso { margin-top: 26px; border-top: 1px solid #E7E9EE; padding-top: 10px; page-break-inside: avoid; }
  .aviso-tit { font-size: 10.5px; font-weight: 800; color: #6B7484; text-transform: uppercase; letter-spacing: 1px; }
  .aviso-txt { font-size: 11px; color: #4A5261; line-height: 1.55; margin-top: 3px; }
  .selo { display: flex; align-items: center; justify-content: center; gap: 6px;
          font-size: 10px; color: #B0B7C2; font-weight: 600; margin-top: 10px; }

  @media print { body { padding: 26px 24px; } }`;
}

/** Envelope HTML final — um só lugar monta `<html>`, para os três documentos. */
export function paginaDocumento(cor: string, titulo: string, corpo: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${escapeHtml(titulo)}</title>
<style>${cssDocumentoBase(cor)}</style>
</head>
<body>
${corpo}
</body>
</html>`;
}
