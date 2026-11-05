/**
 * Política de Privacidade do OLLI — conteúdo tipado, renderizado pela LegalScreen
 * no app (tema escuro) e na web (mesma tela).
 *
 * IMPORTANTE: este texto é um MODELO gerado para o produto. Ele reflete o que o
 * app realmente faz (Supabase, Cloudflare, Stripe, Google Play, Resend, login com
 * Google, OpenRouter, armazenamento de fotos/logos/PDFs, denúncia de IA, etiqueta QR
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
  atualizadoEm: '2 de novembro de 2026',
  aviso:
    'Documento atualizado em 2 de novembro de 2026. Dúvidas sobre seus dados ou ' +
    'pedidos relacionados à LGPD podem ser enviados para contato@olliorcamentos.online.',
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
        'O OLLI é operado por OLLI INTELIGENCIA DIGITAL SISTEMAS LTDA, CNPJ ' +
          '65.361.266/0001-05 ("OLLI", "nós"). Somos o ' +
          'controlador dos dados necessários para criar e manter a sua conta, processar ' +
          'a sua assinatura e operar o aplicativo.',
        'Para dúvidas sobre privacidade, exercício de direitos ou para falar com o canal ' +
          'responsável por privacidade, escreva para contato@olliorcamentos.online ou use ' +
          'o WhatsApp (11) 94172-7487.',
      ],
    },
    {
      titulo: '2. A quem esta Política se aplica',
      paragrafos: [
        'Esta Política cobre o aplicativo OLLI (Android, iOS e versão web), a sincronização ' +
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
        'Nos aplicativos nativos, a recarga de créditos e a contratação ou alteração de planos ' +
          'não ficam disponíveis quando o app não oferece o sistema de cobrança da respectiva loja. ' +
          'No aplicativo Android, a assinatura dos planos pagos é cobrada e gerenciada pela Google Play, ' +
          'quando essa opção estiver disponível. Os demais itens de pagamento abaixo só se aplicam quando você ' +
          'inicia uma compra pela versão web ou por outro canal em que o checkout esteja explicitamente disponível.',
        'Formulário de diagnóstico de OLLI Serviços. Se você pedir um diagnóstico na página de serviços, ' +
          'recebemos nome do negócio, cidade, descrição da dor e WhatsApp. Usamos para preparar o diagnóstico ' +
          'e a proposta e responder por WhatsApp, com base no seu consentimento. Também consultamos informações ' +
          'públicas do seu negócio (site, Google, redes). Guardamos por no máximo 180 dias se não houver proposta ' +
          'e, se houver contrato, pelo prazo legal. Os dados ficam em servidores de provedores de nuvem ' +
          '(Supabase, Cloudflare) e não são vendidos. Você pode pedir acesso, correção, exclusão ou parar de ' +
          'receber mensagens a qualquer momento.',
      ],
      tabela: [
        {
          dado: 'Cadastro: e-mail, nome e telefone',
          finalidade: 'Criar e autenticar a sua conta, dar suporte e enviar avisos essenciais do serviço.',
          base: 'Execução de contrato (art. 7º, V).',
        },
        {
          dado: 'Telefone (WhatsApp) informado no cadastro',
          finalidade: 'Falar com você pelo WhatsApp do OLLI, (11) 94172-7487, para ajudar a começar a usar o app (por exemplo, fazer o primeiro orçamento), tirar dúvidas e dar suporte. O primeiro contato é feito por uma pessoa da nossa equipe; depois, um assistente de IA pode ajudar a responder. Não fazemos envio em massa e não repassamos o número. Para não receber mais mensagens, responda SAIR na conversa ou peça pelo e-mail contato@olliorcamentos.online: registramos o número numa lista de "não contatar" e paramos de enviar mensagens a ele, salvo resposta a um contato que você mesmo iniciar.',
          base: 'Legítimo interesse em ajudar quem criou a conta a usar o serviço (art. 7º, IX), com direito de oposição a qualquer momento.',
        },
        {
          dado: 'Mensagens que você envia ao WhatsApp do OLLI (telefone, nome do perfil e texto)',
          finalidade: 'Atender o seu pedido quando você nos escreve pelo WhatsApp do OLLI, (11) 94172-7487, mesmo que você ainda não tenha conta, e registrar o que foi combinado. Guardamos o seu telefone, o nome do seu perfil do WhatsApp e o texto da mensagem; não baixamos fotos, áudios nem arquivos. As mensagens podem ser respondidas por um assistente virtual (inteligência artificial) do OLLI, com uma pessoa da nossa equipe acompanhando; se você perguntar, dizemos sempre se é uma IA. Para não receber mais mensagens, responda SAIR; guardamos só o número, numa lista de quem não quer ser contatado, para não escrever de novo.',
          base: 'Legítimo interesse em atender quem nos procura (art. 7º, IX) e, se você quiser contratar, procedimentos preliminares relacionados a contrato (art. 7º, V). Você pode se opor a qualquer momento.',
        },
        {
          dado: 'Login com o Google: nome, e-mail e foto do perfil da sua conta Google',
          finalidade: 'Entrar ou criar a conta com o botão "Continuar com o Google", inclusive quando um convite de equipe pede o Google do e-mail que recebeu o convite. Recebemos do Google apenas o que identifica a conta (nome, e-mail e foto do perfil); não recebemos a sua senha do Google nem acessamos o seu Gmail, Drive ou contatos por este login.',
          base: 'Execução de contrato (art. 7º, V) e consentimento ao autorizar o login (art. 7º, I).',
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
          finalidade: 'Documentar serviços, equipamentos e ordens de serviço, e compor documentos. As fotos são enviadas e guardadas na nuvem, em armazenamento privado ligado à sua conta, para ficarem disponíveis nos seus dispositivos.',
          base: 'Consentimento ao autorizar a câmera/galeria e execução de contrato (art. 7º, I e V).',
        },
        {
          dado: 'Logomarca e documentos em PDF que você gera ou anexa',
          finalidade: 'Montar os seus orçamentos e recibos com a sua marca e guardar os documentos gerados. Ficam em armazenamento privado ligado à sua conta; o seu cliente só vê o que você decide enviar a ele (por exemplo, o orçamento em link).',
          base: 'Execução de contrato (art. 7º, V).',
        },
        {
          dado: 'Denúncia de resposta de IA (botão "Sinalizar")',
          finalidade: 'Quando você toca em "Sinalizar" numa resposta da IA (Chat, Voz, Diagnóstico ou Autopilot) e confirma o aviso, enviamos para a nossa equipe revisar o texto gerado e o seu pedido. Se houver nome, endereço ou preço de cliente nesse texto, ele vai junto. Nada é enviado sem a sua confirmação.',
          base: 'Consentimento ao confirmar o envio (art. 7º, I) e legítimo interesse em manter a IA segura e adequada (art. 7º, IX).',
        },
        {
          dado: 'Áudio de voz, quando você usa a OLLI por voz',
          finalidade: 'Transcrever a sua fala por inteligência artificial para preencher campos e comandos.',
          base: 'Consentimento ao ativar o microfone (art. 7º, I).',
        },
        {
          dado: 'Localização da equipe em campo',
          finalidade: 'Coordenar rotas e o andamento do expediente — mostrar a posição dos técnicos e o trajeto até o cliente, para fins de gestão operacional em serviço. A captura só acontece quando você ativa a localização no aparelho (ou autoriza o navegador, na versão web); o app não liga isso sozinho, e você controla quando ligar ou desligar nas permissões do seu dispositivo.',
          base: 'Legítimo interesse do empregador/contratante na gestão operacional da equipe em campo (art. 7º, IX), com uso restrito à finalidade de coordenação de rota/expediente. Você pode se opor a este tratamento a qualquer momento pelos canais de atendimento.',
        },
        {
          dado: 'Dados de assinatura e de pagamento (via Stripe, AbacatePay ou Google Play)',
          finalidade: 'Processar pagamento no cartão ou no Pix (versão web) ou pela Google Play (aplicativo Android), controlar o seu plano e emitir cobranças. O OLLI NÃO armazena o número do seu cartão nem os seus dados bancários.',
          base: 'Execução de contrato e cumprimento de obrigação legal/fiscal (art. 7º, V e II).',
        },
        {
          dado: 'Histórico de compras na Google Play (Android): identificador da compra, plano contratado, estado e datas da assinatura',
          finalidade: 'Confirmar com a Google Play que a assinatura existe, liberar o plano certo para a sua conta, renová-lo, suspendê-lo ou encerrá-lo conforme a Google informar (cancelamento, falha de pagamento, estorno) e permitir restaurar a assinatura em outro aparelho. Para a Google Play, a compra fica ligada à sua conta OLLI por um código (hash do identificador da conta), nunca pelo seu e-mail. Se você excluir a conta, a assinatura ativa na Google Play é cancelada e esses registros são apagados ou anonimizados, ressalvado o que a lei exigir guardar.',
          base: 'Execução de contrato e cumprimento de obrigação legal/fiscal (art. 7º, V e II).',
        },
        {
          dado: 'Hash do IP e navegador nos scans da etiqueta QR',
          finalidade: 'Registrar acessos à etiqueta pública para segurança e prevenção de abuso, sem o nome nem a conta de quem escaneou.',
          base: 'Legítimo interesse em segurança (art. 7º, IX). Guardamos apenas um código derivado do IP (hash), nunca o IP original. Esse código é um dado pseudonimizado, não anônimo, e segue as mesmas proteções dos demais dados.',
        },
        {
          dado: 'Interação com o link do orçamento enviado ao cliente',
          finalidade: 'Mostrar ao prestador se o link foi aberto, quantas vezes, por quanto tempo a página ficou visível, se o valor total foi visto e se tocaram em Aprovar ou em pagar (o termômetro). O termômetro não guarda IP nem navegador: usa um código aleatório que fica só na aba e some quando ela fecha. Esses registros são apagados em até 180 dias, ou antes, junto com o link. Na trilha do mesmo link (abriu no dia, aprovou, recusou ou avisou que pagou) guardamos um código derivado do IP (hash do token do link com o IP, sem o IP original) e uma versão curta do navegador. Esse código é dado pseudonimizado, não anônimo, e some quando o link é apagado.',
          base: 'Legítimo interesse do prestador em acompanhar a proposta que enviou (art. 7º, IX). O hash do IP segue as mesmas proteções dos demais dados.',
        },
        {
          dado: 'Uso do app (telas visitadas e ações dentro do app)',
          finalidade: "Entender passo a passo como o OLLI é usado: quais telas e botões você usa, em que ponto as pessoas travam e quais erros acontecem, para corrigir problemas e decidir o que melhorar. Registramos o tipo da ação e a hora (por exemplo, 'abriu a tela de orçamento', 'tocou em Enviar'), ligados a um código da sua conta, e não ao seu nome. Não registramos o que você digita, nem senhas, nem o conteúdo dos seus orçamentos, nem nome, telefone, endereço ou localização dos seus clientes, e não gravamos a tela. Os eventos ficam no seu aparelho e são enviados aos nossos servidores. Guardamos o registro detalhado por até 90 dias; depois, só um resumo diário por tela por até 12 meses, e depois só números gerais.",
          base: "Legítimo interesse (art. 7º, IX) em melhorar o produto, usando o mínimo de dados necessário. Você pode desativar em Conta > Privacidade > 'Ajudar a melhorar o OLLI', e vale a partir desse momento, em todos os seus aparelhos; ao desativar, apagamos o que já foi registrado de você.",
        },
        {
          dado: 'Origem da visita (site e telas de entrada do painel web)',
          finalidade: 'Saber de qual anúncio ou link veio cada cadastro e assinatura. Guardamos os parâmetros da campanha (UTM e identificadores de clique do Facebook e do Google) e os anexamos ao seu cadastro. Esse dado é nosso e não é enviado a terceiros.',
          base: 'Legítimo interesse em medir a eficácia da nossa divulgação (art. 7º, IX).',
        },
        {
          dado: 'Medição de anúncios no Meta e no Google (só se você aceitar)',
          finalidade: 'Informar ao Meta (Facebook/Instagram) e ao Google Ads que uma visita, um cadastro ou uma assinatura veio de um anúncio deles, para medir e melhorar os anúncios do OLLI. No site e nas telas de entrada do painel web carregamos o Meta Pixel e a tag do Google; no cadastro e na assinatura o nosso servidor também avisa o Meta, com o identificador da sua conta e o seu e-mail transformados em código (hash SHA-256), que o Meta consegue comparar com os próprios cadastros, os cookies de anúncio e o navegador usado. Nunca enviamos nome, telefone nem dados dos seus clientes. Você pode desligar essa medição quando quiser em Configurações → Medição de anúncios; o que o Meta já recebeu fica com ele (ele é controlador próprio desse dado), e o pedido de eliminação deve ser feito também a ele.',
          base: 'Consentimento (art. 7º, I), dado no aviso de cookies. Você pode recusar ali, apagar os cookies a qualquer momento ou ativar Do Not Track / Global Privacy Control no navegador: sem consentimento, nada disso é carregado ou enviado.',
        },
        {
          dado: 'Dados técnicos de falha (crash e erro do app)',
          finalidade: 'Diagnosticar travamentos e erros para corrigi-los rapidamente. Não inclui o seu IP nem outros dados pessoais identificáveis.',
          base: 'Legítimo interesse em manter o app estável e seguro (art. 7º, IX).',
        },
      ],
    },
    {
      titulo: '4. Como a inteligência artificial trata os seus dados',
      paragrafos: [
        'Os recursos de IA do OLLI (diagnóstico técnico, chat, voz e resumos) passam pelo ' +
          'nosso servidor na Cloudflare. O raciocínio em texto é processado pelo OpenRouter, ' +
          'que encaminha o pedido a modelos de linguagem de provedores de inferência (hoje, modelos da ' +
          'OpenAI e da Mistral AI) selecionados por nós, com a regra de não usar o conteúdo para treinamento. ' +
          'Enviamos apenas o trecho necessário — por exemplo, a marca do equipamento e o sintoma.',
        'Quando você usa voz, o áudio é transcrito pelo serviço Workers AI da Cloudflare. ' +
          'O áudio não é enviado ao OpenRouter; somente a transcrição em texto segue para o ' +
          'modelo quando você pede que a OLLI monte um orçamento. Esses provedores podem ' +
          'manter o pedido por prazo limitado para segurança e prevenção de abuso (a OpenAI e a Mistral AI informam até 30 dias) ' +
          'e, por isso, evite nomes, telefones, ' +
          'endereços, documentos ou outros dados pessoais que não sejam necessários.',
        'A chave de acesso ao modelo fica somente no nosso servidor, nunca no aplicativo. ' +
          'Evite digitar ou ditar dados pessoais sensíveis desnecessários nos campos de IA. ' +
          'As respostas da IA são um apoio e podem conter erros — a decisão técnica é sempre ' +
          'sua, como profissional.',
        'Em toda tela com resposta gerada por IA (Chat, Voz, Diagnóstico e Autopilot) há o botão ' +
          '"Sinalizar", para você denunciar uma resposta errada, ofensiva ou imprópria sem sair do app. ' +
          'Ao confirmar o aviso, o texto da resposta e o seu pedido seguem para a nossa equipe ' +
          'revisar; sem a sua confirmação, nada é enviado.',
      ],
    },
    {
      titulo: '5. Com quem compartilhamos dados',
      paragrafos: [
        'Não vendemos os seus dados. Compartilhamos apenas com fornecedores que operam a ' +
          'infraestrutura do serviço, cada um tratando somente o necessário e sob contrato:',
      ],
      itens: [
        'Supabase — banco de dados, autenticação e armazenamento de arquivos (fotos, logomarcas ' +
          'e PDFs, em depósito privado) na nuvem, com isolamento por usuário ' +
          '(Row Level Security), de forma que cada conta só enxerga os próprios dados.',
        'Google — login com o Google ("Continuar com o Google"), quando você escolhe essa opção, ' +
          'inclusive no convite de equipe: o Google confirma a sua identidade e nos informa o nome, ' +
          'o e-mail e a foto do perfil da conta. O Google trata esse login conforme a própria política de privacidade.',
        'Google Play — no aplicativo Android, cobrança e gestão das assinaturas dos planos pagos ' +
          '(processador de pagamento da loja), quando essa opção estiver disponível. A Google ' +
          'recebe os dados do pagamento, e o OLLI recebe da Google Play o histórico da compra ' +
          '(plano, estado e datas da assinatura), sem acesso ao número do seu cartão.',
        'WhatsApp (Meta) — as conversas com o WhatsApp do OLLI passam pela infraestrutura do ' +
          'WhatsApp, que trata as mensagens conforme a própria política de privacidade. Só falamos ' +
          'pelo WhatsApp com quem não pediu para sair (ver a seção 3).',
        'Resend — envio de e-mails do serviço: confirmação de conta, recuperação de senha, ' +
          'convite de equipe, boas-vindas, avisos de assinatura e resumos. Recebe o seu e-mail ' +
          'e o conteúdo da mensagem enviada.',
        'Cloudflare — hospedagem do nosso servidor, da página pública da etiqueta QR e ' +
          'transcrição de áudio pelo Workers AI.',
        'Stripe — processamento de pagamentos e gestão de assinaturas iniciadas nos canais ' +
          'em que o checkout estiver disponível. O Stripe recebe os dados de cobrança; o OLLI não tem acesso ao ' +
          'número completo do cartão.',
        'Mercado Pago — processamento das cobranças Pix usadas para recarregar créditos ' +
          'nos canais em que essa recarga estiver disponível. Recebe os dados necessários para gerar e confirmar o pagamento; ' +
          'o OLLI não tem acesso aos seus dados bancários.',
        'AbacatePay — processamento das cobranças Pix usadas para pagar um período do plano Pro ' +
          'ou Empresa, nos canais em que esse pagamento estiver disponível. Recebe os dados necessários ' +
          'para gerar e confirmar o Pix; o OLLI não tem acesso aos seus dados bancários.',
        'OpenRouter e provedores de inferência selecionados — roteamento e processamento dos ' +
          'pedidos de IA em texto. Exigimos rotas que declarem não usar o conteúdo para treinamento; ' +
          'o modelo e o provedor efetivamente usados podem variar dentro da lista aprovada por nós.',
        'Sentry — monitoramento de erros e travamentos do aplicativo, para identificar e ' +
          'corrigir falhas técnicas. Recebe apenas dados técnicos do erro, sem o seu IP ou ' +
          'outros dados pessoais.',
        'Serviços públicos de mapa, endereço e clima — para pôr os clientes no mapa, o nosso ' +
          'servidor envia somente o endereço (rua, número, CEP, cidade e UF, sem nome nem ' +
          'telefone) à BrasilAPI e ao Nominatim (OpenStreetMap); a previsão do tempo da visita ' +
          'vem do MET Norway, consultado só com a coordenada. O mapa do aplicativo baixa as ' +
          'imagens da região exibida direto do OpenFreeMap (dados © OpenStreetMap), que recebe o ' +
          'endereço IP do aparelho e a área do mapa, nunca os dados dos seus clientes.',
        'Meta (Facebook e Instagram) e Google Ads — só se você aceitar o aviso de cookies: ' +
          'Meta Pixel e tag do Google no site e nas telas de entrada do painel web, e aviso do ' +
          'nosso servidor ao Meta quando a conta é criada ou a assinatura é paga, para medir os ' +
          'anúncios do OLLI. Recebem dados de navegação, identificadores do navegador e, no caso ' +
          'do Meta, o e-mail e o identificador da conta em hash, nunca o conteúdo da sua conta. ' +
          'O aplicativo instalado no celular não usa Pixel nem tag do Google.',
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
          'código derivado do IP (hash, sem guardar o IP original) e uma versão curta do navegador.',
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
          'qualquer momento e ative ou desative o ' +
          'rastreio de localização e as permissões de câmera e microfone no seu aparelho.',
        'Para parar de receber mensagens nossas pelo WhatsApp, responda SAIR na conversa ou peça ' +
          'pelo e-mail contato@olliorcamentos.online; para os lembretes por e-mail, use o link ' +
          '"Parar de receber lembretes" no rodapé de cada mensagem.',
        'Quando o gerenciamento de assinatura estiver disponível no canal em que você contratou, ' +
          'ele será apresentado nessa conta; alguns builds nativos mostram apenas o status e os recibos.',
        'Para exportar os seus dados, excluir a sua conta ou fazer qualquer outro pedido ' +
          'relacionado a privacidade, use a opção de exclusão/gestão de conta no app ou fale ' +
          'com a gente pelo e-mail contato@olliorcamentos.online ou pelo WhatsApp (11) ' +
          '94172-7487. Respondemos aos pedidos nos prazos ' +
          'previstos em lei e podemos pedir informações para confirmar a sua identidade.',
      ],
    },
    {
      titulo: '12. Cookies e armazenamento local',
      paragrafos: [
        'O OLLI guarda dados no próprio aparelho para funcionar offline (banco local SQLite) e, ' +
          'na versão web, usa armazenamento local do navegador para manter você conectado e ' +
          'lembrar preferências.',
        'No site e nas telas de entrada do painel web também usamos cookies de marketing. O ' +
          'olli_attr é nosso e guarda por até 90 dias de qual campanha você veio (só é criado ' +
          'quando o link traz parâmetros de campanha); o olli_consent guarda a sua resposta ao ' +
          'aviso de cookies. Só se você clicar em "Aceitar", carregamos o Meta Pixel (cookies ' +
          '_fbp e _fbc) e a tag do Google Ads (cookies _gcl_*), para medir anúncios. Se você ' +
          'recusar, ou se o seu navegador enviar Do Not Track ou Global Privacy Control, nenhum ' +
          'deles é carregado. Você pode apagar esses cookies a qualquer momento nas ' +
          'configurações do navegador, o que também faz o aviso aparecer de novo. Não usamos ' +
          'outros cookies de publicidade nem rastreamento de terceiros para anúncios.',
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
        'Dúvidas, pedidos ou reclamações sobre privacidade? Escreva para ' +
          'contato@olliorcamentos.online ou fale pelo WhatsApp (11) 94172-7487.',
      ],
    },
  ],
};
