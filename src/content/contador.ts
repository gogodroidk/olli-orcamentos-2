/**
 * Guia de CONTADOR em Recursos úteis (D-1438, parte G13).
 *
 * Conteúdo informativo, com fonte oficial, para o prestador entender o tipo de
 * empresa e o caminho da NFS-e (MEI e ME/EPP). A OLLI NÃO EMITE nota fiscal:
 * nenhum texto daqui pode dizer o contrário. Quem emite é o prestador, no
 * portal do governo, com a conta gov.br dele.
 *
 * As frases de obrigação e o aviso curto são os mesmos de `src/utils/notaServico.ts`
 * (o teste `scripts/teste-contador-recursos.ts` exige a igualdade). Datas
 * conferidas de novo em 03/11/2026:
 *   • MEI desde 01/09/2023 — Portal da NFS-e, Resolução CGSN nº 169/2022.
 *   • ME e EPP do Simples desde 01/11/2026 — Receita Federal, CGSN nº 191/2026,
 *     e aviso do Portal da NFS-e de 29/10/2026.
 *   • Passos de emissão — serviço "Emitir NFS-e" no gov.br, modificado em 29/10/2026.
 * A página do serviço diz que, para o MEI, a emissão é obrigatória nas operações
 * com pessoa jurídica. O portal de 2023 fala do MEI prestador de serviço em geral.
 * O texto conta as duas fontes e manda confirmar. Não inventa teto de faturamento:
 * o número mora na Lei Complementar nº 123/2006 e muda só quando a lei muda.
 */

export const CONFERIDO_EM = '03/11/2026';

export const URL_EMISSOR_NACIONAL = 'https://www.nfse.gov.br/EmissorNacional';

export const FONTE_OBRIGATORIEDADE_SIMPLES =
  'https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/agosto/simples-nacional-nfs-e-nacional-sera-obrigatoria-para-me-e-epp-a-partir-de-1o-de-novembro-de-2026';

export const FONTE_SERVICO_NFSE = 'https://www.gov.br/pt-br/servicos/emitir-nota-fiscal-de-servico-eletronica';

export const FONTE_MEI_OBRIGADO =
  'https://www.gov.br/nfse/pt-br/mei-prestadores-de-servico-de-todo-o-pais-estao-obrigados-a-emitir-nfs-e';

export const FONTE_AVISO_SIMPLES_NFSE =
  'https://www.gov.br/nfse/pt-br/noticias/nfs-e-informa-diretrizes-sobre-a-obrigatoriedade-da-emissao-da-nfs-e-nacional-para-optantes-do-simples-nacional';

export const FONTE_LC_123 = 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm';

export const FONTE_NIVEL_GOVBR =
  'https://www.gov.br/governodigital/pt-br/identidade/conta-gov-br/niveis-da-conta-govbr/saiba-mais-sobre-os-niveis-da-conta-govbr';

/** A mesma frase de `notaServico.ts` (AVISO_NAO_EMITE). */
export const AVISO_NAO_EMITE =
  'O OLLI não emite a nota. Ele deixa os dados prontos para você copiar no Emissor Nacional, onde a nota é emitida com a sua conta gov.br.';

/** A mesma frase de `notaServico.ts` (OBRIGATORIEDADE_NFSE). As duas datas, nunca uma só. */
export const OBRIGATORIEDADE_NFSE =
  'MEI emite a NFS-e nacional desde 01/09/2023. ME e EPP do Simples Nacional passam a emitir por ela a partir de 01/11/2026 (Resolução CGSN nº 191/2026).';

export const AVISO_CONTADOR =
  `${AVISO_NAO_EMITE} A OLLI não entra na sua conta gov.br, não pede senha nem certificado e não declara que a nota saiu. Este texto é informativo e não substitui o seu contador.`;

export const INTRO_CONTADOR =
  `Nota de serviço (NFS-e) é o documento fiscal da prestação de serviço. O caminho depende do tipo da empresa. ${OBRIGATORIEDADE_NFSE} Empresa fora do Simples Nacional segue a regra do município. Confirme no portal oficial, porque a regra fiscal muda.`;

export const RODAPE_CONTADOR =
  `Fontes conferidas em ${CONFERIDO_EM} no gov.br, no Portal da NFS-e, na Receita Federal e na Lei Complementar nº 123/2006. A regra fiscal muda. Este guia não é consultoria contábil e a OLLI não calcula imposto nem escolhe o regime da empresa.`;

export const ID_ARTIGO_CONTADOR = 'contador-tipos-empresa';

export interface FonteOficial {
  rotulo: string;
  href: string;
}

export interface TipoEmpresa {
  id: 'mei' | 'me' | 'epp' | 'fora';
  nome: string;
  titulo: string;
  texto: string;
  fontes: FonteOficial[];
}

export interface PassoNota {
  id: string;
  texto: string;
}

export interface CaminhoNota {
  id: 'mei' | 'me-epp';
  titulo: string;
  quando: string;
  fonte: FonteOficial;
}

export const TIPOS_EMPRESA: TipoEmpresa[] = [
  {
    id: 'mei',
    nome: 'MEI',
    titulo: 'Microempreendedor Individual',
    texto:
      'É a pessoa que empreende sozinha, com CNPJ, no regime simplificado da Lei Complementar nº 123/2006. O Portal da NFS-e informa que, desde 01/09/2023 (Resolução CGSN nº 169/2022), o MEI prestador de serviço emite a NFS-e de padrão nacional. Na página do serviço no gov.br, atualizada em 29/10/2026, a emissão é obrigatória nas operações com pessoa jurídica. Se o cliente for pessoa física, confirme no portal se o seu município exige a nota. Os tetos de faturamento e de contratação estão na lei. A OLLI não calcula porte nem imposto.',
    fontes: [
      { rotulo: 'Portal da NFS-e — MEI desde 01/09/2023', href: FONTE_MEI_OBRIGADO },
      { rotulo: 'Por que ser um MEI (gov.br)', href: 'https://www.gov.br/empresas-e-negocios/pt-br/empreendedor/quero-ser-mei/o-que-e-ser-um-mei' },
    ],
  },
  {
    id: 'me',
    nome: 'ME',
    titulo: 'Microempresa',
    texto:
      'Microempresa é um porte da Lei Complementar nº 123/2006 (art. 3º), definido pela receita bruta anual. Pode ter sócios e empregados. Se a empresa opta pelo Simples Nacional, a NFS-e de padrão nacional é obrigatória desde 01/11/2026, pelo Emissor Nacional (site ou API), mesmo quando a prefeitura tem sistema próprio. A notícia da Receita Federal separa outra data: CBS e IBS para o Simples Nacional só passam a valer em 01/01/2027. A OLLI não escolhe o regime nem emite a nota.',
    fontes: [
      { rotulo: 'Receita Federal — CGSN nº 191/2026', href: FONTE_OBRIGATORIEDADE_SIMPLES },
      { rotulo: 'Lei Complementar nº 123/2006', href: FONTE_LC_123 },
    ],
  },
  {
    id: 'epp',
    nome: 'EPP',
    titulo: 'Empresa de pequeno porte',
    texto:
      'Empresa de pequeno porte é o porte seguinte, também no art. 3º da Lei Complementar nº 123/2006. No Simples Nacional, vale a mesma obrigação de NFS-e nacional desde 01/11/2026. O enquadramento (ME ou EPP) depende da receita bruta: confira o texto vigente da lei antes de decidir. A OLLI não informa o seu faturamento à Receita.',
    fontes: [
      { rotulo: 'Portal da NFS-e — aviso de 29/10/2026', href: FONTE_AVISO_SIMPLES_NFSE },
      { rotulo: 'Lei Complementar nº 123/2006, art. 3º', href: FONTE_LC_123 },
    ],
  },
  {
    id: 'fora',
    nome: 'Fora do Simples',
    titulo: 'Outro regime ou autônomo',
    texto:
      'Empresa fora do Simples Nacional (por exemplo, lucro presumido ou lucro real) e o autônomo pessoa física não entram na regra da Resolução CGSN nº 191/2026. A página do serviço no gov.br diz que empresas em geral usam a NFS-e nacional quando o município é conveniado, e que a pessoa física segue a legislação municipal. Confirme com o contador e no portal da prefeitura. A OLLI não substitui essa confirmação.',
    fontes: [
      { rotulo: 'Serviço Emitir NFS-e (gov.br)', href: FONTE_SERVICO_NFSE },
    ],
  },
];

export const CAMINHOS_NFSE: CaminhoNota[] = [
  {
    id: 'mei',
    titulo: 'MEI',
    quando:
      'Desde 01/09/2023 a nota de serviço do MEI sai no padrão nacional. No serviço oficial, a conta gov.br nível Prata ou Ouro (ou o certificado digital, se o portal pedir) é o acesso. A OLLI não faz esse login.',
    fonte: { rotulo: 'Obrigatoriedade do MEI', href: FONTE_MEI_OBRIGADO },
  },
  {
    id: 'me-epp',
    titulo: 'ME e EPP do Simples Nacional',
    quando:
      'Desde 01/11/2026 a nota sai pelo Emissor Nacional, no site ou por API. A API pede credenciamento prévio no painel do contribuinte. O OLLI não faz essa integração e não transmite a nota.',
    fonte: { rotulo: 'Diretrizes de 29/10/2026', href: FONTE_AVISO_SIMPLES_NFSE },
  },
];

export const PASSOS_NFSE: PassoNota[] = [
  {
    id: 'preparar',
    texto:
      'No recibo do OLLI, use "Preparar nota fiscal". O app separa cliente, descrição, valor e município para você copiar e conferir. Isso não emite a nota.',
  },
  {
    id: 'abrir',
    texto:
      'Abra o Emissor Nacional no site oficial, ou o aplicativo NFS-e Mobile indicado na página do serviço do gov.br.',
  },
  {
    id: 'entrar',
    texto:
      'Entre com a sua conta gov.br (nível Prata ou Ouro) ou com certificado digital, como o portal pedir. Não digite senha nem código no OLLI.',
  },
  {
    id: 'escolher',
    texto: 'Escolha emissão simplificada ou completa, como a tela do governo mostrar.',
  },
  {
    id: 'preencher',
    texto:
      'Informe o CPF ou CNPJ do cliente, descreva o serviço e o valor. No portal, o sistema do governo calcula os tributos. A OLLI não calcula imposto.',
  },
  {
    id: 'emitir',
    texto:
      'Confira os dados e emita no portal. Guarde o número da NFS-e. Sem esse número, a nota não foi emitida. Se quiser, anote o número na nota preparada do OLLI.',
  },
];

export const SERVICOS_OFICIAIS: FonteOficial[] = [
  { rotulo: 'Abrir o Emissor Nacional', href: URL_EMISSOR_NACIONAL },
  { rotulo: 'Página do serviço Emitir NFS-e', href: FONTE_SERVICO_NFSE },
  { rotulo: 'Níveis da conta gov.br', href: FONTE_NIVEL_GOVBR },
  { rotulo: 'Emitir o DAS do MEI', href: 'https://www.gov.br/pt-br/servicos/emitir-das-para-pagamento-de-tributos-do-mei' },
  { rotulo: 'Formalizar o MEI', href: 'https://www.gov.br/pt-br/servicos/realizar-registro-como-microempreendedor-individual-mei' },
  { rotulo: 'Notícia da Receita — 01/11/2026', href: FONTE_OBRIGATORIEDADE_SIMPLES },
  { rotulo: 'Lei Complementar nº 123/2006', href: FONTE_LC_123 },
];

/** Tudo o que a pessoa lê, para o teste barrar frase que diga que a OLLI emite. */
export function textosVisiveisContador(): string[] {
  const lista = [AVISO_CONTADOR, INTRO_CONTADOR, RODAPE_CONTADOR, OBRIGATORIEDADE_NFSE, AVISO_NAO_EMITE];
  for (const tipo of TIPOS_EMPRESA) {
    lista.push(tipo.nome, tipo.titulo, tipo.texto);
    for (const fonte of tipo.fontes) lista.push(fonte.rotulo);
  }
  for (const caminho of CAMINHOS_NFSE) lista.push(caminho.titulo, caminho.quando, caminho.fonte.rotulo);
  for (const passo of PASSOS_NFSE) lista.push(passo.texto);
  for (const servico of SERVICOS_OFICIAIS) lista.push(servico.rotulo);
  return lista;
}

export function hrefsContador(): string[] {
  const hrefs = [URL_EMISSOR_NACIONAL, FONTE_OBRIGATORIEDADE_SIMPLES, FONTE_SERVICO_NFSE, FONTE_MEI_OBRIGADO, FONTE_AVISO_SIMPLES_NFSE, FONTE_LC_123, FONTE_NIVEL_GOVBR];
  for (const tipo of TIPOS_EMPRESA) for (const fonte of tipo.fontes) hrefs.push(fonte.href);
  for (const caminho of CAMINHOS_NFSE) hrefs.push(caminho.fonte.href);
  for (const servico of SERVICOS_OFICIAIS) hrefs.push(servico.href);
  return hrefs;
}
