/**
 * Conteúdo da CENTRAL DE AJUDA (Frente 3) — dados tipados, sem nenhuma
 * dependência de React/RN, para a AjudaScreen renderizar e a busca indexar.
 *
 * Cada artigo é real (nada de lorem ipsum): descreve o comportamento de VERDADE
 * do app hoje. Ao mexer numa feature descrita aqui, atualize o artigo junto —
 * senão a Central de Ajuda começa a mentir pro usuário.
 */

/** Tipo de bloco do corpo de um artigo. */
export type AjudaBlocoTipo = 'paragrafo' | 'passos' | 'aviso';

/**
 * Um bloco de conteúdo. `paragrafo`/`aviso` usam uma única string; `passos`
 * usa um array (cada item é 1 passo — a tela numera ao renderizar).
 */
export interface AjudaBloco {
  tipo: AjudaBlocoTipo;
  conteudo: string | string[];
}

export interface AjudaCategoria {
  id: string;
  titulo: string;
  /** Nome de ícone do MaterialCommunityIcons (string pura — sem import de RN aqui). */
  icone: string;
}

export interface AjudaArtigo {
  id: string;
  categoriaId: string;
  titulo: string;
  /** Frase curta exibida na lista, antes de abrir o artigo. */
  resumo: string;
  corpo: AjudaBloco[];
  /** Sinônimos/termos extras só para a busca achar (não aparecem na tela). */
  tags?: string[];
}

// ─── Categorias ──────────────────────────────────────────────────────────────

export const CATEGORIAS_AJUDA: AjudaCategoria[] = [
  { id: 'comecar', titulo: 'Primeiros passos', icone: 'rocket-launch-outline' },
  { id: 'orcamentos', titulo: 'Orçamentos e clientes', icone: 'file-document-edit-outline' },
  { id: 'campo', titulo: 'Campo: OS e equipamentos', icone: 'toolbox-outline' },
  { id: 'conta', titulo: 'Equipe, planos e conta', icone: 'account-group-outline' },
  { id: 'dados', titulo: 'Backup, offline e privacidade', icone: 'shield-lock-outline' },
  { id: 'suporte', titulo: 'Suporte', icone: 'lifebuoy' },
];

// ─── Artigos ─────────────────────────────────────────────────────────────────

export const ARTIGOS_AJUDA: AjudaArtigo[] = [
  // ── Primeiros passos ─────────────────────────────────────────────────────
  {
    id: 'primeiros-passos',
    categoriaId: 'comecar',
    titulo: 'Primeiros passos no OLLI',
    resumo: 'O que preencher primeiro pra sair usando de verdade, sem travar em nenhuma etapa.',
    tags: ['comecar', 'inicio', 'cadastro', 'tutorial'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'O OLLI acompanha o ciclo inteiro do seu serviço: você monta o orçamento, o cliente aprova pelo próprio celular (sem instalar nada), você organiza a execução em campo e fecha com o recibo. Tudo funciona offline — o app sincroniza sozinho quando a internet volta.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Complete o cadastro do seu negócio em Conta → Meu Negócio: nome, logo, WhatsApp e chave PIX aparecem em todo PDF que você gerar.',
          'Cadastre 1 ou 2 serviços/produtos em Serviços e Produtos — assim você monta orçamentos escolhendo da lista, sem digitar tudo de novo toda vez.',
          'Cadastre seu primeiro cliente (ou cadastre na hora, direto ao criar o orçamento).',
          'Toque no botão "+ Orçamento", monte a proposta e envie o link — o cliente aprova ou recusa direto no celular dele.',
          'Acompanhe tudo pela Home e pela aba Hoje: o que venceu, o que foi visto e o que está aguardando resposta.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'Se você chegou aqui pela tela de boas-vindas (onboarding) e pulou alguma etapa, não tem problema: tudo o que faltar pode ser preenchido depois em Conta → Meu Negócio.',
      },
    ],
  },

  // ── Orçamentos e clientes ────────────────────────────────────────────────
  {
    id: 'criar-enviar-orcamento',
    categoriaId: 'orcamentos',
    titulo: 'Criar e enviar um orçamento',
    resumo: 'Do zero ao link pronto pra mandar pro cliente, em poucos toques.',
    tags: ['proposta', 'orcar', 'novo orcamento', 'pdf'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'Um orçamento no OLLI junta cliente + itens (serviços/produtos) + condições (pagamento, garantia, validade) e gera um PDF profissional e um link que o cliente abre no celular dele.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Toque no botão central "+ Orçar" (ou em "Novo orçamento" na lista de Orçamentos).',
          'Escolha um cliente já cadastrado ou cadastre um novo sem sair do fluxo.',
          'Adicione itens do seu catálogo de Serviços/Produtos, ou digite um item novo na hora — dá pra ditar por voz também.',
          'Ajuste desconto, condições de pagamento, garantia e validade da proposta.',
          'Revise a prévia do PDF e toque em Enviar: o OLLI gera o link do cliente e abre o WhatsApp com a mensagem pronta.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'Um orçamento pode nascer de um Diagnóstico de código de erro (a IA já sugere o item de reparo) — economiza digitação em visitas técnicas.',
      },
    ],
  },
  {
    id: 'link-cliente',
    categoriaId: 'orcamentos',
    titulo: 'O link do cliente: aprovar e recusar',
    resumo: 'Como o cliente vê, aprova ou recusa o orçamento pelo próprio celular — sem baixar app nenhum.',
    tags: ['aprovacao', 'recusa', 'link publico', 'assinatura', 'cliente'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'Ao enviar, o OLLI gera um link público (sem login) com o PDF do orçamento. O cliente abre pelo WhatsApp ou e-mail, lê tudo e toca em "Aprovar" ou "Recusar" na própria página — se você pediu assinatura, ele assina com o dedo na tela.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Assim que o cliente abre o link, o status do orçamento vira "Visualizado" automaticamente — você fica sabendo sem precisar perguntar.',
          'Se ele aprovar, o status vira "Aprovado" (e, se pediu assinatura, você vê a assinatura dele no orçamento).',
          'Se ele recusar, o status vira "Recusado" — dá pra conversar e reabrir com um ajuste depois.',
          'Você acompanha essa trilha inteira (enviado → visualizado → aprovado/recusado) na tela do próprio orçamento.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'Depois que o cliente já viu o link, editar o orçamento NUNCA sobrescreve silenciosamente o que ele viu — o OLLI guarda uma versão anterior. Veja o artigo "Versões do orçamento".',
      },
    ],
  },
  {
    id: 'versoes-orcamento',
    categoriaId: 'orcamentos',
    titulo: 'Versões do orçamento',
    resumo: 'Por que o OLLI guarda um histórico quando você edita uma proposta que já foi enviada.',
    tags: ['historico', 'editar orcamento', 'status'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'O orçamento passa por vários status ao longo do funil: Rascunho, Enviado, Visualizado, Em negociação, Aguardando assinatura, Aprovado, Recusado, Expirado, Cancelado e Convertido (quando já virou serviço fechado/recibo).',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Enquanto o orçamento está em Rascunho, você edita livremente — nada foi mostrado ao cliente ainda.',
          'Depois que ele foi Enviado (ou Visualizado/Em negociação/Aguardando assinatura), qualquer edição sua congela o estado ANTERIOR como uma versão antes de aplicar a mudança.',
          'Você pode conferir as versões anteriores dentro do próprio orçamento, sem perder o que o cliente já tinha visto.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'Isso é o que garante que você nunca "sumiu" com uma condição que o cliente já aprovou — cada versão fica registrada.',
      },
    ],
  },
  {
    id: 'recibos-pagamentos',
    categoriaId: 'orcamentos',
    titulo: 'Recibos e pagamentos',
    resumo: 'Como emitir o recibo de um orçamento aprovado e registrar a forma de pagamento.',
    tags: ['recibo', 'pagamento', 'pix', 'cobranca'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'Depois que o serviço foi pago, você emite um recibo numerado automaticamente (a numeração é sequencial e nunca se repete), com a forma de pagamento usada — crédito, débito, dinheiro ou PIX (com sua chave já preenchida a partir de Meu Negócio).',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Abra o orçamento aprovado e toque em "Emitir recibo" (ou vá em Recibos, na lista).',
          'Confira o valor e marque a(s) forma(s) de pagamento usadas.',
          'Toque em Emitir: o OLLI gera o PDF do recibo com o número sequencial e permite compartilhar na hora.',
          'Precisou corrigir? Ao invés de duplicar, use "Registrar pagamento" no mesmo orçamento — ele reaproveita o recibo já criado.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo: 'O número do recibo só é gerado (e avança) no momento em que você realmente emite — abrir a tela não consome número.',
      },
    ],
  },

  // ── Campo: OS e equipamentos ─────────────────────────────────────────────
  {
    id: 'ordens-servico-app-tecnico',
    categoriaId: 'campo',
    titulo: 'Ordens de serviço e o app do técnico',
    resumo: 'Como transformar um orçamento aprovado em execução de campo, com checklist e fotos.',
    tags: ['os', 'tecnico', 'execucao', 'checklist'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'Uma Ordem de Serviço (OS) organiza a EXECUÇÃO do que foi vendido: quem vai, quando, o checklist do que precisa ser feito e as fotos do serviço. Ela pode nascer de um orçamento aprovado ou ser criada manualmente.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'No orçamento aprovado, toque em "Criar ordem de serviço" (ou crie uma manual em Ordens de serviço).',
          'Atribua um técnico da equipe — ele passa a ver essa OS no aparelho dele.',
          'A OS caminha pelos status Aberta → Agendada → Em execução → Concluída (ou Pausada/Cancelada quando necessário).',
          'O técnico marca o checklist item a item e anexa fotos direto pelo celular, mesmo sem internet no local.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo: 'Papel Técnico só enxerga as próprias OS. Dono, Administrador e Gestor veem as de toda a equipe.',
      },
    ],
  },
  {
    id: 'equipamentos-qr',
    categoriaId: 'campo',
    titulo: 'Equipamentos e etiqueta QR',
    resumo: 'Cadastre o inventário do cliente (ex.: os splits instalados) e gere a etiqueta QR pra colar na peça.',
    tags: ['pmoc', 'ar condicionado', 'inventario', 'qrcode', 'etiqueta'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'Cada equipamento fica vinculado a um cliente e guarda fabricante, modelo, número de série, capacidade (BTU), tensão, refrigerante e local de instalação — a base do controle de manutenção (PMOC) desse cliente.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Cadastre o equipamento a partir do cadastro do cliente (ou pela tela de Equipamentos).',
          'Sincronize com a nuvem pelo menos uma vez (é o banco que gera o código do QR, por segurança) — depois disso a etiqueta fica disponível.',
          'Toque em "Gerar etiqueta" para ver o QR pronto pra imprimir e colar na porta física do equipamento.',
          'Ao escanear, qualquer pessoa (você, o cliente, um outro técnico) abre a página pública daquele equipamento — sem precisar login.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'Se um QR for extraviado ou comprometido, dá pra revogá-lo (a página pública passa a negar o scan). Hoje a revogação é definitiva — reemissão de um novo código é uma etapa futura.',
      },
    ],
  },

  // ── Equipe, planos e conta ───────────────────────────────────────────────
  {
    id: 'equipe-permissoes',
    categoriaId: 'conta',
    titulo: 'Equipe e permissões',
    resumo: 'Convide técnicos e gestores, e entenda o que cada papel pode ver e fazer.',
    tags: ['convite', 'papel', 'tecnico', 'gestor', 'admin', 'multiempresa'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'Uma conta pode ser Pessoal (só você, dono de tudo) ou Empresa (uma organização com vários membros). Dentro de uma empresa, cada pessoa tem um papel:',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Dono — acesso completo, incluindo cobrança e exclusão da empresa.',
          'Administrador — gerencia tudo, menos cobrança e excluir a empresa.',
          'Gestor — vê relatórios, metas e a agenda de todos, mas não mexe na equipe.',
          'Técnico — cria orçamentos e vê a própria agenda/OS, sem acesso a relatórios ou valores agregados.',
        ],
      },
      {
        tipo: 'passos',
        conteudo: [
          'Vá em Conta → Equipe.',
          'Toque em "Convidar" e escolha o papel (Administrador, Gestor ou Técnico).',
          'Compartilhe o link de convite gerado — a pessoa aceita e já entra na sua organização.',
          'Você pode ativar/desativar um membro a qualquer momento, sem excluir o histórico dele.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo: 'Gerenciar equipe (convidar, trocar papel, desativar) é um recurso do plano Empresa.',
      },
    ],
  },
  {
    id: 'planos-assinatura',
    categoriaId: 'conta',
    titulo: 'Planos e assinatura',
    resumo: 'O que muda entre Grátis, Pro e Empresa — e como assinar, trocar ou cancelar.',
    tags: ['plano', 'assinar', 'preco', 'upgrade', 'cancelar'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'Orçamentos, recibos, clientes, agenda, diagnóstico de código de erro offline e o link do cliente são ilimitados em QUALQUER plano — inclusive no Grátis. Os planos pagos liberam recursos extras:',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Grátis (R$ 0) — tudo do essencial, mais 3 usos de IA por mês.',
          'Pro (R$ 39/mês) — IA sem limite de uso, relatórios, metas, radar de clientes, relatório do dia falado, modelos premium de PDF e a opção de remover a marca OLLI do documento.',
          'Empresa (R$ 99/mês) — tudo do Pro, mais equipe com papéis, mapa da equipe ao vivo e o painel de gestão da empresa.',
        ],
      },
      {
        tipo: 'passos',
        conteudo: [
          'Vá em Conta → Planos para comparar e assinar (mensal, anual com desconto, ou parcelado em até 12x sem juros).',
          'Para trocar de plano ou cancelar, use "Gerenciar assinatura" — abre o portal seguro de pagamento.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo: 'A cobrança é feita por um provedor de pagamento (Stripe). O OLLI nunca guarda o número do seu cartão.',
      },
    ],
  },
  {
    id: 'lixeira-restaurar',
    categoriaId: 'dados',
    titulo: 'Apagou algo por engano? Lixeira e backups',
    resumo: 'A Lixeira guarda o que você excluiu por 30 dias e restaura em 1 toque. Perdeu muita coisa de uma vez? Aí é caso de backup completo.',
    tags: ['lixeira', 'excluir', 'apagar', 'desfazer', 'restaurar', 'expurgo', 'backup'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'O OLLI tem uma Lixeira de verdade: ao excluir um cliente, orçamento, recibo, serviço, produto, modelo, depoimento, agendamento, ordem de serviço ou equipamento, o item não some na hora — ele fica guardado ali por 30 dias, pronto pra voltar com um toque.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Vá em Conta → Lixeira (Dono, Administrador e Gestor têm acesso; o papel Técnico não vê essa opção).',
          'A lista mostra os itens excluídos agrupados por tipo, com a data da exclusão e um selo de quantos dias faltam até o expurgo automático.',
          'Achou o que precisa? Toque em "Restaurar" — o item volta a aparecer normalmente na tela de origem, do jeito que estava.',
          'Tem certeza que quer descartar? Toque em "Excluir de vez" no item, ou em "Esvaziar lixeira" (no topo da tela) pra remover tudo de uma vez.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          '"Excluir de vez" e "Esvaziar lixeira" são imediatos e definitivos — não tem uma segunda lixeira depois deles. Passados os 30 dias, o item também é apagado sozinho (expurgo automático), mesmo que você nunca tenha aberto a tela.',
      },
      {
        tipo: 'paragrafo',
        conteudo:
          'Perdeu muita coisa de uma vez, ou o item já passou dos 30 dias e não está mais na Lixeira? Aí o caminho é restaurar uma cópia de segurança de antes do problema.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Vá em Conta → "Ver cópias de segurança".',
          'Escolha uma cópia com data anterior ao que você perdeu.',
          'Toque em restaurar e confirme.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'Restaurar uma cópia de segurança troca TODOS os dados atuais pelos daquela cópia — o que foi criado depois dela (inclusive o que ainda estiver na Lixeira) também é perdido. Por isso, prefira sempre a Lixeira; deixe o backup completo como último recurso.',
      },
    ],
  },
  {
    id: 'backup-sincronizacao',
    categoriaId: 'dados',
    titulo: 'Backup e sincronização',
    resumo: 'Como o OLLI guarda uma cópia dos seus dados na nuvem e mantém vários aparelhos atualizados.',
    tags: ['nuvem', 'backup automatico', 'trocar de aparelho'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'O aparelho é sempre a fonte de verdade (seus dados existem localmente mesmo sem internet). Quando você faz login, o OLLI passa a manter uma cópia protegida na nuvem — isso permite trocar de aparelho sem perder nada e liga o backup automático diário.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Faça login em Conta (uma vez só — o app lembra depois).',
          'Em Conta, o toggle "Backup automático diário" liga (padrão) ou desliga o backup sem precisar apertar nada todo dia.',
          'Toque em "Ver cópias de segurança" para ver o histórico de backups diários, semanais e manuais.',
          'Quer forçar uma cópia agora? Use o backup manual, direto nessa mesma tela.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo: 'Trocando de aparelho: instale o OLLI, faça login com a mesma conta e os dados chegam sozinhos.',
      },
    ],
  },
  {
    id: 'offline-como-funciona',
    categoriaId: 'dados',
    titulo: 'Offline: como funciona',
    resumo: 'Por que o OLLI funciona sem internet — e o que realmente precisa de conexão.',
    tags: ['sem internet', 'sem sinal', 'campo'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'O OLLI foi pensado pra quem trabalha em campo, muitas vezes sem sinal. Todo o essencial roda 100% local, no banco de dados do próprio aparelho — nada trava por falta de internet.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Funciona sem internet: criar/editar orçamentos, clientes, serviços, produtos, agenda, ordens de serviço, checklist e o diagnóstico de códigos de erro (a base offline tem centenas de códigos).',
          'Precisa de internet: enviar o link do orçamento pro cliente (é uma página pública na nuvem), IA (diagnóstico avançado, voz, chat), sincronizar/fazer backup, gerar a etiqueta QR de um equipamento pela 1ª vez, e assinar/gerenciar um plano pago.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'Assim que a internet voltar, o que você fez offline sincroniza sozinho — sem precisar reenviar nada manualmente.',
      },
    ],
  },
  {
    id: 'privacidade-dados',
    categoriaId: 'dados',
    titulo: 'Privacidade e seus dados',
    resumo: 'Onde ficam os seus dados e os do seu cliente, e como excluir a conta.',
    tags: ['lgpd', 'privacidade', 'dados pessoais', 'excluir conta', 'apagar conta'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'Seus dados (e os dos seus clientes) ficam salvos primeiro no seu aparelho. Se você faz login, uma cópia protegida vai para a nuvem — separada por conta: só você (e a sua equipe, se for conta Empresa) consegue acessar os seus dados. Quem abre o link de um orçamento vê só aquele orçamento, sem precisar criar conta e sem acessar o resto da sua base.',
      },
      {
        tipo: 'passos',
        conteudo: [
          'Para apagar os dados só deste aparelho: saia da conta em Conta → "Sair da conta" e desinstale o app.',
          'Para excluir sua conta por completo (incluindo os dados na nuvem), vá em Conta → role até o fim → "Excluir minha conta". Digite EXCLUIR para confirmar e toque de novo no alerta final.',
        ],
      },
      {
        tipo: 'aviso',
        conteudo:
          'Excluir a conta é diferente de excluir um item na Lixeira: aqui não tem prazo de 30 dias nem como voltar atrás — assim que você confirma, login, orçamentos, clientes, agenda, recibos e backups somem para sempre.',
      },
      {
        tipo: 'aviso',
        conteudo: 'O OLLI nunca vende ou compartilha dados de clientes com terceiros para fins de marketing.',
      },
    ],
  },

  // ── Suporte ───────────────────────────────────────────────────────────────
  {
    id: 'falar-com-suporte',
    categoriaId: 'suporte',
    titulo: 'Falar com o suporte',
    resumo: 'WhatsApp, e-mail ou formulário — escolha o canal que preferir.',
    tags: ['contato', 'whatsapp', 'email', 'duvida', 'problema', 'bug'],
    corpo: [
      {
        tipo: 'paragrafo',
        conteudo:
          'Ficou com dúvida que este artigo não resolveu, ou achou algo que parece um erro? Fale com a gente — o card "Suporte", logo abaixo da busca na Central de Ajuda, tem três jeitos de chegar até nós: WhatsApp (o mais rápido), e-mail e um formulário rápido dentro do próprio app.',
      },
      {
        tipo: 'aviso',
        conteudo: 'Pra agilizar, diga o que você estava tentando fazer e em qual tela — não precisa mandar print com dados sensíveis do cliente.',
      },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getCategoria(id: string): AjudaCategoria | undefined {
  return CATEGORIAS_AJUDA.find(c => c.id === id);
}

export function getArtigo(id: string): AjudaArtigo | undefined {
  return ARTIGOS_AJUDA.find(a => a.id === id);
}

export function getArtigosDaCategoria(categoriaId: string): AjudaArtigo[] {
  return ARTIGOS_AJUDA.filter(a => a.categoriaId === categoriaId);
}

/** Remove acentos e baixa a caixa — busca em PT-BR não deve exigir acento certo. */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .replace(/[áàãâä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòõôö]/g, 'o')
    .replace(/[úùûü]/g, 'u')
    .replace(/ç/g, 'c')
    .trim();
}

function textoDoBloco(b: AjudaBloco): string {
  return Array.isArray(b.conteudo) ? b.conteudo.join(' ') : b.conteudo;
}

/** Índice de busca (título + resumo + tags + corpo) — montado 1x no módulo. */
const INDICE: { artigo: AjudaArtigo; texto: string }[] = ARTIGOS_AJUDA.map(a => ({
  artigo: a,
  texto: normalizar(
    [a.titulo, a.resumo, ...(a.tags ?? []), ...a.corpo.map(textoDoBloco)].join(' '),
  ),
}));

/** Busca simples por substring (sem acento, sem caixa) em título/resumo/tags/corpo. */
export function buscarArtigos(query: string): AjudaArtigo[] {
  const q = normalizar(query);
  if (!q) return [];
  return INDICE.filter(e => e.texto.includes(q)).map(e => e.artigo);
}
