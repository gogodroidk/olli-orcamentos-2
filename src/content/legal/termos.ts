/**
 * Termos de Uso do OLLI — conteúdo tipado, renderizado pela LegalScreen no app
 * (tema escuro) e na web (mesma tela).
 *
 * IMPORTANTE: este texto é um MODELO gerado para o produto e DEVE ser revisado por
 * um advogado antes de publicar. Não é aconselhamento jurídico.
 *
 * O tipo LegalDoc é definido em ./privacidade e reaproveitado aqui para manter os
 * dois documentos com a mesma forma (a LegalScreen renderiza ambos igual).
 */

import type { LegalDoc } from './privacidade';

export const TERMOS: LegalDoc = {
  titulo: 'Termos de Uso',
  atualizadoEm: '9 de julho de 2026',
  aviso:
    'Este é um MODELO de termos de uso, gerado para o OLLI. Ele NÃO constitui ' +
    'aconselhamento jurídico e deve ser revisado e adaptado por um(a) advogado(a) — ' +
    'incluindo razão social, CNPJ, foro e valores — antes de ser publicado.',
  intro: [
    'Estes Termos regulam o uso do aplicativo OLLI, uma ferramenta de gestão para ' +
      'prestadores de serviço (orçamentos, recibos, clientes, ordens de serviço, ' +
      'equipamentos e a assistente OLLI). Ao criar uma conta ou usar o app, você ' +
      'concorda com estes Termos e com a nossa Política de Privacidade.',
    'Se você usa o OLLI em nome de uma empresa, declara ter poderes para aceitar ' +
      'estes Termos em nome dela. Se não concordar com algum ponto, não utilize o app.',
  ],
  secoes: [
    {
      titulo: '1. O que é o OLLI',
      paragrafos: [
        'O OLLI é um software que ajuda o prestador a organizar o próprio negócio: montar ' +
          'orçamentos e recibos, gerir clientes e agenda, abrir ordens de serviço, cadastrar ' +
          'equipamentos com etiqueta QR e usar recursos de inteligência artificial de apoio.',
        'O OLLI é uma ferramenta. Nós não executamos o serviço técnico do seu cliente, não ' +
          'somos parte do contrato entre você e ele e não garantimos resultado do trabalho de ' +
          'campo. A relação com o seu cliente é exclusivamente sua.',
      ],
    },
    {
      titulo: '2. Aceite e elegibilidade',
      paragrafos: [
        'Para usar o OLLI você precisa ser maior de 18 anos e fornecer informações verdadeiras. ' +
          'O uso do app implica a aceitação integral destes Termos, que podem ser complementados ' +
          'por regras específicas de cada funcionalidade exibidas no próprio app.',
      ],
    },
    {
      titulo: '3. Cadastro e conta',
      paragrafos: [
        'A sua conta é criada com e-mail, nome e telefone e é pessoal e intransferível. Você é ' +
          'responsável por manter a confidencialidade das suas credenciais e por toda atividade ' +
          'realizada na sua conta.',
        'Avise-nos imediatamente se suspeitar de uso não autorizado. Podemos recusar, suspender ' +
          'ou encerrar cadastros que violem estes Termos ou a lei.',
      ],
    },
    {
      titulo: '4. Planos, preços e cobrança',
      paragrafos: [
        'O OLLI oferece um plano gratuito e planos pagos (Pro e Empresa) com recursos adicionais. ' +
          'Os planos pagos podem ser contratados nas modalidades mensal, anual ou em até 12 vezes, ' +
          'com o pagamento processado pela Stripe.',
        'Os valores vigentes, os recursos de cada plano e a forma de cobrança são exibidos na tela ' +
          'de Planos do app no momento da contratação. As assinaturas mensais e anuais são renovadas ' +
          'automaticamente ao fim de cada ciclo, pelo valor então vigente, até que você cancele.',
      ],
    },
    {
      titulo: '5. Renovação, cancelamento e reembolso',
      paragrafos: [
        'Você pode cancelar a renovação a qualquer momento pelo portal de assinatura do Stripe, ' +
          'acessível pelo app. Ao cancelar, você continua com acesso ao plano pago até o fim do ' +
          'período já pago; depois disso, a conta volta ao plano gratuito. Não há cobrança de multa ' +
          'por cancelamento.',
        'Nas compras à distância, você tem direito de arrependimento em até 7 dias corridos a contar ' +
          'da contratação, conforme o art. 49 do Código de Defesa do Consumidor. Fora desse prazo, ' +
          'valores de períodos já iniciados, em regra, não são reembolsados, salvo disposição legal ' +
          'ou promocional em contrário. Para pedir reembolso, fale com a gente pelo WhatsApp abaixo.',
      ],
    },
    {
      titulo: '6. Uso aceitável',
      paragrafos: ['Ao usar o OLLI, você concorda em NÃO:'],
      itens: [
        'Usar o app para fins ilícitos, fraudulentos ou que violem direitos de terceiros.',
        'Inserir dados de outras pessoas sem ter base legal para tratá-los.',
        'Tentar burlar limites de plano, acessar contas alheias ou a infraestrutura do serviço.',
        'Sobrecarregar, copiar, fazer engenharia reversa ou revender o app sem autorização.',
        'Enviar conteúdo ofensivo, difamatório, ilegal ou que contenha código malicioso.',
      ],
    },
    {
      titulo: '7. Conteúdo do usuário',
      paragrafos: [
        'Tudo o que você cria e insere no OLLI — clientes, orçamentos, recibos, ordens de serviço, ' +
          'equipamentos, fotos e textos — continua sendo SEU. Nós não reivindicamos propriedade sobre ' +
          'o seu conteúdo.',
        'Para operar o serviço, você nos concede uma licença limitada para hospedar, processar, ' +
          'sincronizar e exibir esse conteúdo apenas com a finalidade de prestar o OLLI a você. Você é ' +
          'responsável pela veracidade do que insere e por ter uma base legal para tratar os dados de ' +
          'terceiros que cadastra — em relação a esses dados, você é o controlador e o OLLI é o operador.',
      ],
    },
    {
      titulo: '8. Inteligência artificial: apoio, não substituição',
      paragrafos: [
        'Os recursos de IA do OLLI (diagnóstico, chat, voz e resumos) são um apoio à sua decisão e ' +
          'podem conter erros, imprecisões ou informações desatualizadas. Eles não substituem o seu ' +
          'julgamento profissional, normas técnicas, manuais do fabricante nem inspeção presencial.',
        'A decisão técnica e a responsabilidade pelo serviço executado são sempre suas. Confirme sempre ' +
          'as informações antes de agir, especialmente em intervenções que envolvam segurança.',
      ],
    },
    {
      titulo: '9. Disponibilidade e suporte',
      paragrafos: [
        'Trabalhamos para manter o OLLI disponível, mas o serviço é fornecido "no estado em que se ' +
          'encontra". Pode haver interrupções por manutenção, atualizações, falhas de fornecedores ou ' +
          'causas alheias ao nosso controle. Recursos podem ser adicionados, alterados ou descontinuados.',
        'O suporte é oferecido pelos canais indicados no app, principalmente pelo WhatsApp (11) ' +
          '94172-7487. Recomendamos manter cópias dos documentos importantes que você gera.',
      ],
    },
    {
      titulo: '10. Propriedade intelectual',
      paragrafos: [
        'A marca OLLI, o logotipo, o software, o design e os conteúdos criados por nós são de nossa ' +
          'titularidade e protegidos por lei. Estes Termos concedem a você apenas uma licença de uso ' +
          'pessoal, limitada, não exclusiva e revogável do aplicativo, enquanto durar a sua conta. Nada ' +
          'aqui transfere a você direitos sobre a nossa propriedade intelectual.',
      ],
    },
    {
      titulo: '11. Limitação de responsabilidade',
      paragrafos: [
        'Na máxima extensão permitida pela lei, o OLLI não se responsabiliza por danos indiretos, ' +
          'lucros cessantes, perda de dados ou prejuízos decorrentes do uso ou da impossibilidade de ' +
          'uso do app, de decisões tomadas com base na IA, de erros de dados inseridos por você ou de ' +
          'falhas de terceiros (como provedores de nuvem, pagamento ou internet).',
        'Nada nestes Termos exclui responsabilidades que não possam ser afastadas por lei, inclusive as ' +
          'previstas no Código de Defesa do Consumidor. Havendo responsabilidade nossa, ela fica limitada, ' +
          'quando cabível, ao valor pago por você pelo OLLI nos 12 meses anteriores ao evento.',
      ],
    },
    {
      titulo: '12. Suspensão e rescisão',
      paragrafos: [
        'Você pode encerrar a sua conta quando quiser, pela opção de exclusão de conta no app. Podemos ' +
          'suspender ou encerrar o acesso em caso de violação destes Termos, uso indevido, risco à ' +
          'segurança ou exigência legal.',
        'Encerrada a conta, o tratamento e a eliminação dos seus dados seguem a nossa Política de ' +
          'Privacidade, inclusive a lixeira de 30 dias e os prazos legais de guarda.',
      ],
    },
    {
      titulo: '13. Alterações destes Termos',
      paragrafos: [
        'Podemos atualizar estes Termos para refletir mudanças no app ou na lei. Quando a mudança for ' +
          'relevante, avisaremos pelo app. A data no topo indica a última revisão; ao continuar usando o ' +
          'OLLI após uma atualização, você concorda com a versão vigente.',
      ],
    },
    {
      titulo: '14. Lei aplicável e foro',
      paragrafos: [
        'Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro do ' +
          'domicílio do consumidor para dirimir controvérsias, quando aplicável a legislação consumerista, ' +
          'ou o foro da comarca a ser definido pela empresa nos demais casos (a completar na revisão ' +
          'jurídica).',
      ],
    },
    {
      titulo: '15. Fale com a gente',
      paragrafos: [
        'Dúvidas sobre estes Termos? Fale com a gente pelo WhatsApp (11) 94172-7487.',
      ],
    },
  ],
};
