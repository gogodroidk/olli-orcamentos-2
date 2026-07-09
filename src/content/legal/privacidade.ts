/**
 * Política de Privacidade do OLLI — conteúdo tipado, renderizado pela LegalScreen
 * no app (tema escuro) e na web (mesma tela).
 *
 * IMPORTANTE: este texto é um MODELO gerado para o produto. Ele reflete o que o
 * app realmente faz (Supabase, Cloudflare, Stripe, Google Gemini, etiqueta QR
 * pública, hash de IP nos scans, lixeira de 30 dias), mas DEVE ser revisado por
 * um advogado antes de publicar. Não é aconselhamento jurídico.
 *
 * As tipagens abaixo (LegalDoc/LegalSection/LegalDataRow) são compartilhadas com
 * termos.ts e com a LegalScreen — mantenha-as estáveis.
 */

/** Linha da tabela "quais dados coletamos": dado × finalidade × base legal (LGPD). */
export interface LegalDataRow {
  /** Categoria do dado tratado. */
  dado: string;
  /** Para que serve. */
  finalidade: string;
  /** Base legal do art. 7º/11 da LGPD. */
  base: string;
}

/** Uma seção do documento: título + parágrafos, com listas e tabelas opcionais. */
export interface LegalSection {
  titulo: string;
  /** Parágrafos corridos. */
  paragrafos?: string[];
  /** Itens em lista (marcadores). */
  itens?: string[];
  /** Mapa de dados (só usado na seção de coleta). */
  tabela?: LegalDataRow[];
}

/** Documento legal completo (privacidade ou termos). */
export interface LegalDoc {
  /** Título exibido no topo. Ex.: "Política de Privacidade". */
  titulo: string;
  /** Data legível da última revisão. Ex.: "9 de julho de 2026". */
  atualizadoEm: string;
  /** Aviso obrigatório de "modelo — revisar com advogado". */
  aviso: string;
  /** Parágrafos de abertura, antes das seções. */
  intro: string[];
  /** Corpo do documento. */
  secoes: LegalSection[];
}

export const PRIVACIDADE: LegalDoc = {
  titulo: 'Política de Privacidade',
  atualizadoEm: '9 de julho de 2026',
  aviso:
    'Este é um MODELO de política de privacidade, gerado para o OLLI e alinhado ao ' +
    'que o aplicativo realmente faz. Ele NÃO constitui aconselhamento jurídico e ' +
    'deve ser revisado e adaptado por um(a) advogado(a) antes de ser publicado ou ' +
    'usado com clientes reais.',
  intro: [
    'O OLLI é um aplicativo de gestão para prestadores de serviço — orçamentos, ' +
      'recibos, clientes, ordens de serviço, equipamentos e a assistente OLLI. Esta ' +
      'Política explica, de forma direta, quais dados pessoais tratamos, por que, com ' +
      'quem compartilhamos e como você pode exercer os seus direitos previstos na Lei ' +
      'Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).',
    'Ao criar uma conta e usar o OLLI, você declara ter lido e compreendido esta ' +
      'Política. Se você não concordar com algum ponto, por favor não utilize o app e ' +
      'fale com a gente pelos canais indicados no fim deste documento.',
  ],
  secoes: [
    {
      titulo: '1. Quem é o controlador dos dados',
      paragrafos: [
        'O OLLI é operado pela equipe responsável pelo aplicativo OLLI ("OLLI", "nós"). ' +
          'Somos o controlador dos dados necessários para criar e manter a sua conta, ' +
          'processar a sua assinatura e operar o aplicativo.',
        'Para dúvidas sobre privacidade, exercício de direitos ou para falar com o nosso ' +
          'Encarregado (DPO), use o WhatsApp (11) 94172-7487. Antes de publicar, complete ' +
          'aqui a razão social, o CNPJ, o endereço e um e-mail de privacidade da empresa.',
      ],
    },
    {
      titulo: '2. A quem esta Política se aplica',
      paragrafos: [
        'Esta Política cobre o aplicativo OLLI (Android e versão web), a sincronização ' +
          'na nuvem, os serviços de inteligência artificial do OLLI e a página pública da ' +
          'etiqueta QR de equipamentos.',
        'Um ponto importante: quando você cadastra os seus próprios clientes, orçamentos e ' +
          'equipamentos, VOCÊ é o controlador desses dados perante os seus clientes, e o ' +
          'OLLI atua como OPERADOR — tratamos esses dados apenas para prestar o serviço a ' +
          'você e seguindo as suas instruções. Você é responsável por ter uma base legal ' +
          'para tratar os dados das pessoas que cadastra e por informá-las quando exigido.',
      ],
    },
    {
      titulo: '3. Quais dados tratamos, para quê e com qual base legal',
      paragrafos: [
        'Coletamos apenas o necessário para o app funcionar. A tabela abaixo resume cada ' +
          'categoria de dado, a finalidade e a base legal correspondente na LGPD.',
      ],
      tabela: [
        {
          dado: 'Cadastro: e-mail, nome e telefone',
          finalidade: 'Criar e autenticar a sua conta, dar suporte e enviar avisos essenciais do serviço.',
          base: 'Execução de contrato (art. 7º, V).',
        },
        {
          dado: 'Dados dos seus clientes (nome, telefone, endereço, CPF/CNPJ) que você digita',
          finalidade: 'Montar orçamentos, recibos, ordens de serviço e sua agenda. O OLLI trata como operador, a seu pedido.',
          base: 'Legítimo interesse do prestador na gestão do próprio negócio (art. 7º, IX); você garante a base legal perante o titular.',
        },
        {
          dado: 'Conteúdo de trabalho: orçamentos, recibos, ordens de serviço, equipamentos, agenda',
          finalidade: 'Entregar as funções centrais do app e manter o seu histórico sincronizado entre dispositivos.',
          base: 'Execução de contrato (art. 7º, V).',
        },
        {
          dado: 'Fotos que você tira ou anexa',
          finalidade: 'Documentar serviços, equipamentos e ordens de serviço, e compor documentos.',
          base: 'Consentimento ao autorizar a câmera/galeria e execução de contrato (art. 7º, I e V).',
        },
        {
          dado: 'Áudio de voz, quando você usa a OLLI por voz',
          finalidade: 'Transcrever a sua fala por inteligência artificial para preencher campos e comandos.',
          base: 'Consentimento ao ativar o microfone (art. 7º, I).',
        },
        {
          dado: 'Localização da equipe em campo',
          finalidade: 'Mostrar a posição dos técnicos e a rota SOMENTE enquanto o rastreio de jornada está ativado.',
          base: 'Consentimento, ativável e desativável a qualquer momento (art. 7º, I).',
        },
        {
          dado: 'Dados de assinatura (via Stripe)',
          finalidade: 'Processar pagamento, controlar o seu plano e emitir cobranças. O OLLI NÃO armazena o número do seu cartão.',
          base: 'Execução de contrato e cumprimento de obrigação legal/fiscal (art. 7º, V e II).',
        },
        {
          dado: 'Hash do IP e navegador nos scans da etiqueta QR',
          finalidade: 'Registrar acessos à etiqueta pública para segurança e prevenção de abuso, sem identificar quem escaneou.',
          base: 'Legítimo interesse em segurança (art. 7º, IX). Guardamos apenas o hash irreversível do IP, nunca o IP original.',
        },
        {
          dado: 'Uso do app (analytics local no aparelho)',
          finalidade: 'Entender quais telas ajudam e melhorar o produto.',
          base: 'Legítimo interesse (art. 7º, IX).',
        },
      ],
    },
    {
      titulo: '4. Como a inteligência artificial trata os seus dados',
      paragrafos: [
        'Os recursos de IA do OLLI (diagnóstico técnico, chat, voz e resumos) usam o modelo ' +
          'Google Gemini, acessado através do nosso servidor intermediário na Cloudflare. ' +
          'Enviamos ao modelo apenas o texto ou o áudio necessário para responder ao seu ' +
          'pedido — por exemplo, a marca do equipamento e o sintoma descrito.',
        'A chave de acesso ao modelo fica somente no nosso servidor, nunca no aplicativo. ' +
          'Evite digitar ou ditar dados pessoais sensíveis desnecessários nos campos de IA. ' +
          'As respostas da IA são um apoio e podem conter erros — a decisão técnica é sempre ' +
          'sua, como profissional.',
      ],
    },
    {
      titulo: '5. Com quem compartilhamos dados',
      paragrafos: [
        'Não vendemos os seus dados. Compartilhamos apenas com fornecedores que operam a ' +
          'infraestrutura do serviço, cada um tratando somente o necessário e sob contrato:',
      ],
      itens: [
        'Supabase — banco de dados e autenticação na nuvem, com isolamento por usuário ' +
          '(Row Level Security), de forma que cada conta só enxerga os próprios dados.',
        'Cloudflare — hospedagem do nosso servidor de IA e da página pública da etiqueta QR.',
        'Stripe — processamento de pagamentos e gestão de assinaturas. O Stripe recebe os ' +
          'dados de cobrança; o OLLI não tem acesso ao número completo do cartão.',
        'Google (Gemini) — modelo de inteligência artificial que processa os pedidos de IA.',
      ],
    },
    {
      titulo: '6. Transferência internacional de dados',
      paragrafos: [
        'Alguns desses fornecedores processam dados em servidores fora do Brasil (por ' +
          'exemplo, nos Estados Unidos). Nesses casos, a transferência é feita ao amparo do ' +
          'art. 33 da LGPD, com fornecedores que oferecem garantias adequadas de proteção. ' +
          'Ao usar o OLLI, você está ciente dessa transferência internacional.',
      ],
    },
    {
      titulo: '7. A etiqueta QR pública dos equipamentos',
      paragrafos: [
        'Cada equipamento pode ter uma etiqueta QR física. Quem escaneia essa etiqueta vê ' +
          'uma página pública mínima, pensada para não expor o seu cliente.',
        'A página mostra apenas: o nome do prestador responsável (você), o código interno do ' +
          'equipamento, a categoria e a situação operacional, além do seu canal de contato. ' +
          'Ela NUNCA expõe o nome ou endereço do cliente, o número de série completo, valores, ' +
          'contratos ou qualquer outro dado sensível. Cada acesso é registrado apenas com um ' +
          'hash irreversível do IP e uma versão curta do navegador.',
      ],
    },
    {
      titulo: '8. Por quanto tempo guardamos os dados',
      paragrafos: [
        'Mantemos os seus dados enquanto a sua conta estiver ativa e pelo tempo necessário ' +
          'para cumprir as finalidades acima.',
        'Itens que você exclui vão primeiro para uma lixeira e ficam recuperáveis por até 30 ' +
          'dias; depois disso são apagados de forma definitiva. Registros de cobrança podem ser ' +
          'mantidos por prazos maiores para cumprir obrigações fiscais e legais. Ao encerrar a ' +
          'conta, apagamos ou anonimizamos os seus dados, ressalvado o que a lei exigir guardar.',
      ],
    },
    {
      titulo: '9. Segurança da informação',
      paragrafos: [
        'Adotamos medidas técnicas e organizacionais para proteger os seus dados: tráfego ' +
          'criptografado, isolamento por usuário no banco (Row Level Security), segredos ' +
          'mantidos apenas no servidor e princípio do menor privilégio nos acessos.',
        'Nenhum sistema é 100% imune. Se ocorrer um incidente de segurança que possa gerar ' +
          'risco relevante a você, comunicaremos e adotaremos as providências previstas na LGPD.',
      ],
    },
    {
      titulo: '10. Os seus direitos como titular',
      paragrafos: [
        'A LGPD garante a você, entre outros, os seguintes direitos sobre os seus dados ' +
          'pessoais (art. 18):',
      ],
      itens: [
        'Confirmar que tratamos os seus dados e acessá-los.',
        'Corrigir dados incompletos, inexatos ou desatualizados.',
        'Solicitar a anonimização, o bloqueio ou a eliminação de dados desnecessários.',
        'Solicitar a portabilidade dos seus dados.',
        'Excluir os dados tratados com base no seu consentimento e revogar esse consentimento.',
        'Ser informado sobre com quem compartilhamos os seus dados.',
        'Se opor a um tratamento e apresentar reclamação à Autoridade Nacional de Proteção de ' +
          'Dados (ANPD).',
      ],
    },
    {
      titulo: '11. Como exercer os seus direitos',
      paragrafos: [
        'Boa parte você resolve dentro do próprio app: edite o seu cadastro e o seu negócio a ' +
          'qualquer momento, gerencie a assinatura pelo portal do Stripe, ative ou desative o ' +
          'rastreio de localização e as permissões de câmera e microfone no seu aparelho.',
        'Para exportar os seus dados, excluir a sua conta ou fazer qualquer outro pedido ' +
          'relacionado a privacidade, use a opção de exclusão/gestão de conta no app ou fale ' +
          'com a gente pelo WhatsApp (11) 94172-7487. Respondemos aos pedidos nos prazos ' +
          'previstos em lei e podemos pedir informações para confirmar a sua identidade.',
      ],
    },
    {
      titulo: '12. Cookies e armazenamento local',
      paragrafos: [
        'O OLLI guarda dados no próprio aparelho para funcionar offline (banco local SQLite) e, ' +
          'na versão web, usa armazenamento local do navegador para manter você conectado e ' +
          'lembrar preferências. Não usamos cookies de publicidade nem rastreamento de terceiros ' +
          'para anúncios.',
      ],
    },
    {
      titulo: '13. Crianças e adolescentes',
      paragrafos: [
        'O OLLI é uma ferramenta profissional, destinada a maiores de 18 anos. Não coletamos ' +
          'intencionalmente dados de menores de idade. Se identificarmos esse tipo de dado sem a ' +
          'base legal adequada, iremos eliminá-lo.',
      ],
    },
    {
      titulo: '14. Alterações nesta Política',
      paragrafos: [
        'Podemos atualizar esta Política para refletir mudanças no app ou na lei. Quando a ' +
          'mudança for relevante, avisaremos pelo app. A data no topo indica a última revisão; ' +
          'ao continuar usando o OLLI depois de uma atualização, você concorda com a versão vigente.',
      ],
    },
    {
      titulo: '15. Fale com a gente',
      paragrafos: [
        'Dúvidas, pedidos ou reclamações sobre privacidade? Fale com o nosso Encarregado (DPO) ' +
          'pelo WhatsApp (11) 94172-7487. Teremos prazer em ajudar.',
      ],
    },
  ],
};
