# WhatsApp — cadastro a partir da conversa (D1438-G24)

Pedido do Igor no walkthrough de 27/10/2026, em Precificação: conectar o WhatsApp para estudar as conversas e os preços do cliente e fazer o cadastro sozinho, no onboarding, sem esforço.

Este branch entrega a regra. Não liga no WhatsApp.

## O que está neste branch

Um módulo puro, `src/services/whatsappCadastroConsentimento.ts`, e o teste `scripts/teste-whatsapp-cadastro-consentimento.ts`.

A flag nasce desligada. O valor que liga, quando alguém chamar a função, é exatamente `1`. A função não lê ambiente. A flag não entrou no `eas.json`, no `app.json`, nem em config de Auth, Supabase, Cloudflare ou DNS.

Não há tela, não há rota, não há botão e não há leitura de sessão. Com a flag apagada a função devolve `desligado` e não olha o texto.

`conexaoAoVivoPermitida()` devolve falso. A constante `CONEXAO_AO_VIVO` é falsa.

## O que já existe e fica como está

- O prestador manda orçamento pelo link `wa.me`, no toque dele. Isso continua.
- O WhatsApp de suporte do OLLI, a lista "não contatar" e a Cloud API estão em `docs/WHATSAPP_NAO_CONTATAR.md` e `docs/WHATSAPP_CLOUD_API.md`. A finalidade lá é a OLLI falar com quem tem conta, com opt-out. Não serve de autorização para ler conversa de cliente do prestador. A caixa `wa_entrada` não entra neste fluxo.
- A ideia de ler e responder o WhatsApp do prestador continua parada em `docs/ENXAME/INTEGRACOES_IDEIA.md`. Este item não responde mensagem e não cobra mensagem da Meta.

## Papéis

- O prestador é o controlador dos dados dos clientes dele.
- O OLLI, neste fluxo, é operador: só sugere rascunho dentro da conta de quem pediu.
- A pessoa do outro lado da conversa é titular. Ela não falou com o OLLI e não criou conta aqui.
- A Meta é quem opera o canal. Este branch não acessa sistema da Meta.

## Base legal — proposta, ainda sem parecer

O recurso é opcional. O app funciona sem ele. A base proposta para o prestador autorizar a leitura do arquivo é o consentimento do art. 7º, I, da LGPD: específico, informado, destacado em duas caixas, com versão do texto, data e revogação.

Legítimo interesse não serve de atalho. Ler conversa é invasivo, e o titular do outro lado não tem como se opor dentro do OLLI.

Dado sensível (art. 11) que o filtro reconhece — saúde, religião, senha, agência, conta — é descartado inteiro. Não vai para o rascunho e não vai para modelo.

O texto bruto tem retenção de zero dias. Esta versão nem tem onde guardá-lo.

Quando o prestador confirmar um rascunho, aí sim o nome, o telefone e o preço passam a ser cadastro comum. A política já publicada cobre "dados dos seus clientes que você digita", com o prestador responsável pela base perante o titular. Antes da confirmação, aquele texto não é cadastro.

A política publicada não muda neste branch. Ela ainda não descreve esta finalidade. Ligar o recurso sem um parágrafo do jurídico deixaria o app tratando dado fora do texto que a pessoa pode ler.

O parecer do Dr. Paulo é gate. Sem o parecer, a flag fica desligada e ninguém aplica o SQL.

## O que a lei e esta regra fecham

- Acessar WhatsApp de terceiro, sessão alheia, QR, WhatsApp Web ou biblioteca não oficial.
- Usar a caixa de suporte, o webhook da Cloud API ou o ollizap como fonte de cadastro.
- Mandar mensagem para o cliente por causa deste estudo.
- Gravar cliente, serviço ou preço sem a confirmação do prestador.
- Usar o texto em anúncio, em medição de campanha ou para treinar modelo.
- Montar base de preços entre empresas. O preço sugerido fica na conta de quem entregou o arquivo.
- Guardar CPF, CNPJ, número de cartão, chave Pix, senha ou dado de saúde.
- Travar o onboarding de quem recusar. Cadastrar na mão continua o caminho normal.
- Anunciar isto como benefício do Pro ou da Empresa. O preço publicado não muda.

## A única origem desta versão

Um arquivo de conversa que a própria pessoa exporta no WhatsApp dela, sem mídia, e entrega ela mesma.

A Cloud API oficial não devolve o histórico do WhatsApp pessoal. Por isso "conectar o número" não cumpre o pedido do Igor e ainda misturaria este item com o número de suporte. Fica para outro projeto, se o parecer e o Igor liberarem, no número comercial do prestador, com as regras da Meta e sem reutilizar o suporte.

Linha sem a data no formato do export (`[27/10/2026, 14:32] Nome:` ou `27/10/2026, 14:32 - Nome:`, a vírgula entre a data e a hora pode faltar) não vira cliente. Marca invisível que o WhatsApp põe no começo da linha é ignorada. O módulo não inventa nome.

O nome da conta tem de ser informado. Sem ele, o módulo não cria cliente, para não cadastrar o próprio prestador como se fosse cliente. Preço citado ainda pode entrar no rascunho.

## Consentimento

Texto da versão 1, constante `TEXTO_CONSENTIMENTO_WHATSAPP_CADASTRO`. As duas caixas, as duas obrigatórias, nenhuma vem marcada:

1. `CAIXA_PARTICIPA` — a pessoa participa das conversas e autoriza a leitura só do arquivo que ela entregar, para sugerir clientes, serviços e preços na conta dela.
2. `CAIXA_LIMITES` — ela entende que o OLLI não usa isso para anúncio, para treinar modelo nem para falar com essas pessoas.

As duas falsas, uma só, texto de outra versão, data ausente ou data inválida: não está vigente. Recusa fica registrada como recusa, sem data de aceite.

Revogar preenche `revogadoEm` e mantém a prova do aceite anterior (`aceitoEm`, caixas, versão). A partir daí o estudo devolve `revogado`. O rascunho não confirmado seria apagado. O que ela já confirmou permanece como cadastro normal, e ela apaga do mesmo jeito que apaga um cliente.

A prova proposta não leva conversa nem dado de terceiro. O SQL está em `docs/ENXAME/sql/whatsapp_cadastro_consentimento_NAO_APLICAR.sql`. NÃO APLICAR. Ele está fora de `supabase/migrations`.

## O que o rascunho pode ter

| Entra | Fica de fora |
|---|---|
| Nome de quem falou e não é a conta | CPF e CNPJ |
| Um telefone brasileiro plausível, quando dá para saber de quem é | Cartão, chave Pix, senha, agência, conta |
| Preço com "reais", "R$" ou "mil reais" | "12 mil BTU" e qualquer número sem unidade de dinheiro |
| Zero quando ela falou cortesia, de graça ou grátis | Zero calado quando o preço não foi dito |
| Categoria do que foi descartado (`cpf`, `cnpj`, `cartao`, `pix`, `dado_sensivel`, `excesso`) | O número, o texto sensível e o arquivo |

`grava` é falso. `enviaMensagem` é falso. Pedido de enviar ou de gravar é recusado antes do rascunho.

Num grupo, telefone citado pela conta não é atribuído: tem mais de uma pessoa e o módulo não chuta. Com uma pessoa só do outro lado, o telefone que a conta citou cola nela.

Preço acima de R$ 1.000.000 não entra. Texto acima de 20.000 caracteres é recusado por inteiro (`excesso`), sem estudar pela metade. Teto de 50 clientes e 50 preços.

Mensagem com dado sensível some por inteiro, inclusive o preço que estava nela. A palavra "cartão" sem o número não derruba o preço ("aceita cartão, fica 80 reais" mantém os 80). "Pago no pix" sem chave também mantém o preço; a chave é que sai.

Conversa com conteúdo sexual envolvendo criança ou adolescente é recusada por inteiro. A resposta não devolve o trecho.

## Ordem da trava

1. Flag diferente de `1` → `desligado`.
2. Origem que não é o arquivo exportado pela pessoa → `origem_proibida`.
3. Pedido de enviar → `pede_envio`.
4. Pedido de gravar → `pede_gravar`.
5. Consentimento ausente, recusado, incompleto, de texto velho ou revogado.
6. Texto longo demais → `excesso`.
7. Texto vazio, ou sem cliente, sem preço e sem descarte → `vazio`.
8. Conteúdo proibido → `conteudo_proibido`.
9. Rascunho, ainda sem gravar.

Sessão com flag apagada para em `desligado` e não devolve o texto.

## O que falta para valer no produto

1. Parecer do Dr. Paulo sobre o texto das caixas, a base do art. 7º, I, e o parágrafo da política de privacidade.
2. O Igor decide ligar, num build que não é o site no ar.
3. Outro branch: tela com as duas caixas desmarcadas, upload do arquivo exportado, rascunho aberto na ficha que já existe. Só a confirmação grava, pela regra de cliente e de catálogo que já está no app.
4. Aí, e só aí, o SQL desta pasta pode ser revisto e aplicado na janela de migration. Continua sem coluna de conversa.

Até lá o comparativo de planos não lista este recurso. Pro segue R$ 39 e Empresa segue R$ 99, lidos da fonte que já existe.

## Rollback

Reverter o commit deste branch, ou fechar o PR sem merge. Não há tela no ar, não há flag em config de build, não há migration aplicada e não há deploy. O site e o app publicados não mudam com este código.
