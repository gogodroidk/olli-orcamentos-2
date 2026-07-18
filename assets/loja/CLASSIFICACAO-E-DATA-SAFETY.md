# CLASSIFICAÇÃO DE CONTEÚDO + SEGURANÇA DOS DADOS — respostas prontas

> **Este é o documento que suspende conta se estiver errado.** Ficha ruim custa instalação;
> Data Safety mentindo custa o app. Cada linha abaixo foi levantada do código deste repositório em
> **2026-07-18**, não do que estava escrito em `docs/LOJAS.md` — e a auditoria encontrou **três
> divergências** entre aquele documento e o código de hoje. Elas estão marcadas com ⚠️.
>
> Critério do Google para "coletado": **dado que sai do aparelho**. Dado que só existe no celular
> não é coletado — e declarar coleta que não existe é tão errado quanto omitir a que existe.

---

## PARTE 0 — As três divergências com `docs/LOJAS.md` (leia antes de preencher)

### ⚠️ 1. O Sentry ESTÁ LIGADO. `docs/LOJAS.md` §2.5 e §3.7 dizem que não.

`docs/LOJAS.md` afirma *"Não há Sentry/PostHog ligados ainda (bloqueios B7/B8)"* e manda declarar
dados de uso como **não coletados**. Isso está **desatualizado**. `App.tsx:58` chama `Sentry.init()`
com a **DSN fixa no código** (não é variável de ambiente — foi decisão consciente, comentada no
próprio arquivo, para o monitoramento não desligar em silêncio):

```
dsn: 'https://5c54...@o4511745793327104.ingest.us.sentry.io/4511745839661061'
environment: __DEV__ ? 'development' : 'production'
sendDefaultPii: false
tracesSampleRate: 0.1
```

**Consequência:** relatórios de erro e desempenho **saem do aparelho** para um terceiro (Sentry).
Isso **precisa** ser declarado em "Registros de falhas" e "Diagnósticos". Seguir o `LOJAS.md`
literalmente aqui seria declarar falso.

`sendDefaultPii: false` ajuda (não manda IP nem dado de usuário por padrão) — mas reduz o
*conteúdo*, não muda o *fato* da coleta. A pergunta do formulário é se o dado sai, e ele sai.

### ⚠️ 2. Localização NÃO é coletada no Android. `docs/LOJAS.md` §2.5 manda declarar "Sim".

Medido:

- `src/services/localizacaoEquipe.ts` → `export const LOCALIZACAO_DISPONIVEL = false;`
- `expo-location` **não está** em `package.json` (conferido)
- `app.json` → `android.permissions` **não tem** nenhuma permissão de localização

No APK, "Equipe ao vivo" e o ETA com trânsito são **inertes** — a captura nativa é um `import()`
dinâmico protegido por try/catch que nunca resolve. Só a versão **web** usa `navigator.geolocation`,
e a ficha da Play descreve o **app Android**.

**Declare localização como NÃO coletada.** E não é só formalidade: a Play cruza o formulário com as
permissões do manifest, e declarar localização sem permissão de localização levanta bandeira.

> **Gatilho de atualização:** no dia em que a Onda 8 instalar `expo-location` e virar
> `LOCALIZACAO_DISPONIVEL = true`, este formulário precisa ser refeito **antes** do envio daquele
> build.

### ⚠️ 3. `READ_MEDIA_IMAGES` é passivo de política — e não é necessária

`app.json` → `android.permissions` declara `READ_MEDIA_IMAGES`. Verificado no código nativo da
biblioteca instalada:

- `node_modules/expo-image-picker/android/src/main/AndroidManifest.xml` declara **só** `CAMERA`,
  `WRITE_EXTERNAL_STORAGE` e `READ_EXTERNAL_STORAGE`, os dois últimos com
  `android:maxSdkVersion="32"` — ou seja, **nem são pedidos** em Android 13+. A lib **não** declara
  `READ_MEDIA_IMAGES`.
- `.../contracts/ImageLibraryContract.kt` usa `PickVisualMedia` / `PickVisualMediaRequest`, que é o
  **Android Photo Picker** — e o Photo Picker **não exige permissão nenhuma**.

Ou seja: a permissão foi adicionada pelo projeto, **o app não precisa dela**, e ela sujeita o OLLI à
*Photo and Video Permissions policy*, que só libera acesso amplo para editor de foto, rede social e
plataforma de conteúdo do usuário. Anexar foto a um orçamento é o caso "uso pontual/limitado" que a
política manda resolver com o system picker — que é justamente o que a lib já faz. Manter significa
preencher formulário de declaração e passar por revisão de acesso que o OLLI provavelmente não passa;
a política está em vigor plena desde **28/05/2025**, com risco de **remoção do app**.

**Ação: remover `READ_MEDIA_IMAGES` do `app.json` e testar em Android 13+ antes de enviar.**
`app.json` não é arquivo desta frente — foi aberta uma tarefa separada com o passo a passo.

---

## PARTE 1 — O que o app REALMENTE coleta (levantamento)

| Dado | Onde nasce | Sai do aparelho? | Para onde |
| --- | --- | --- | --- |
| Nome, e-mail, telefone | `EntrarScreen.tsx`, cadastro da empresa | **Sim** | Supabase (auth + `empresas`), RLS por organização |
| Senha | login/cadastro | **Sim** | Supabase Auth (hash; o app nunca guarda em texto) |
| Login Google / Apple | `EntrarScreen.tsx`, `appleAuth.ts` | **Sim** | OAuth padrão; o app não vê a senha do provedor |
| Dados dos **clientes** do usuário (nome, telefone, endereço) e orçamentos/OS | uso normal | **Sim**, quando a organização sincroniza | Supabase, RLS por organização |
| **Fotos** de serviço/equipamento | `src/utils/fotosOrcamento.ts` | **NÃO** | Ficam em `documentDirectory/fotos-orcamento/`. Conferido por grep: **zero** ocorrências de `supabase.storage`/`.storage.from` em `src/`. Só o *caminho local* (string `file:///…`) viaja no jsonb do registro — e esse caminho não existe em outro aparelho |
| **Áudio** (ditado/assistente) | `OlliVozScreen.tsx`, `expo-audio` | **Depende do modo.** "Dispositivo": reconhecimento nativo, não sai. "Nuvem": vai ao Worker → Gemini para transcrever | Cloudflare Worker próprio → Gemini; não é retido após transcrever |
| Texto que o usuário fala/digita para a IA | chat, diagnóstico, voz | **Sim** (modo nuvem) | Worker → Gemini |
| **Registros de falha** (Sentry) | `App.tsx:58` | **Sim** | Sentry (terceiro). `sendDefaultPii: false` |
| **Registros de falha** (caixa própria) | `src/services/errorReport.ts` | **Sim** | Supabase tabela `feedback` (tipo `erro`): mensagem, 5 linhas de stack, nome da tela. Sem dado de cliente |
| Feedback / "pulso da semana" | `src/services/feedback.ts` | **Sim** | Supabase `feedback` — texto que o próprio usuário escreveu |
| **Denúncia de conteúdo de IA** | `SinalizarIA.tsx` → `enviarDenunciaIA` | **Sim** | Supabase `feedback`. Exceção deliberada e avisada: leva a resposta da IA + o pedido que a gerou (truncado em 600), **só após o usuário confirmar o aviso** |
| Eventos de uso (funil) | `src/services/analytics.ts` | **Hoje NÃO** | SQLite local. O espelho PostHog (`analyticsRemoto.ts`) é **no-op sem `EXPO_PUBLIC_POSTHOG_KEY`**, e a chave não existe. Se sair do aparelho, passa pela faxina de PII de `analyticsScrub.ts` e o id vai pseudonimizado (SHA-256) |
| Status de assinatura | `PlanosScreen.tsx`, Stripe / Mercado Pago | **Sim** | Processadora de pagamento. **O OLLI nunca vê número de cartão** |
| Localização | — | **NÃO** (ver divergência 2) | — |
| Contatos, SMS, agenda nativa, ID de publicidade | — | **NÃO** | `expo-contacts` não é dependência; nenhum SDK de anúncio no projeto |

> **`EXPO_PUBLIC_POSTHOG_KEY` é uma armadilha de conformidade.** Se alguém registrar essa chave no
> EAS, "Interações no app" passa a sair do aparelho **e o formulário fica desatualizado no mesmo
> instante, sem nenhum aviso**. Decida antes de enviar: ou não configure a chave, ou configure e já
> declare "Ações no app" como coletadas.

---

## PARTE 2 — Formulário "Segurança dos dados" (respostas para marcar)

**Perguntas gerais:**

| Pergunta | Resposta | Por quê |
| --- | --- | --- |
| Seu app coleta ou compartilha algum dos tipos de dados obrigatórios? | **Sim** | — |
| Todos os dados são criptografados em trânsito? | **Sim** | HTTPS/TLS em Supabase, Worker, Sentry e processadora |
| Você fornece um jeito de o usuário solicitar a exclusão dos dados? | **Sim** | Existe de verdade: `src/services/conta.ts` + `worker/src/conta.js` (`POST /conta/excluir`), botão na `ContaScreen` com confirmação dupla. Informe também a URL da política de privacidade |

**Tipos de dados — marque exatamente estes:**

| Categoria → Tipo | Coletado | Compartilhado | Finalidade | Obrigatório? |
| --- | --- | --- | --- | --- |
| Informações pessoais → **Nome** | Sim | Não¹ | Funcionalidade do app; Gerenciamento de conta | Obrigatório |
| Informações pessoais → **Endereço de e-mail** | Sim | Não¹ | Funcionalidade do app; Gerenciamento de conta | Obrigatório |
| Informações pessoais → **Número de telefone** | Sim | Não¹ | Funcionalidade do app | Opcional |
| Informações pessoais → **Endereço** | Sim | Não¹ | Funcionalidade do app | Opcional |
| Informações financeiras → **Informações de compras no app** | Sim | **Sim** (processadora de pagamento) | Funcionalidade do app | Opcional (só quem assina) |
| Áudio → **Gravações de voz ou som** | Sim | **Sim** (provedor de IA) | Funcionalidade do app | Opcional (modo "dispositivo" não envia) |
| Mensagens → **Outras mensagens no app** | Sim | Não¹ | Funcionalidade do app; Suporte | Opcional |
| Atividade no app → **Outras ações no app** | **Não** | — | — | — |
| Registros de falhas | **Sim** | **Sim** (Sentry) | Análise; Funcionalidade do app | Obrigatório |
| Diagnósticos | **Sim** | **Sim** (Sentry) | Análise; Funcionalidade do app | Obrigatório |
| **Localização** (aproximada ou precisa) | **Não** | — | — | — |
| **Fotos e vídeos** | **Não** | — | — | — |
| Contatos · SMS · Calendário · Info. de saúde · ID de publicidade | **Não** | — | — | — |

**¹ "Compartilhado" tem definição estreita no formulário:** é transferir a um terceiro que usa o
dado **para os fins dele**. Supabase e Cloudflare são **processadores** contratados, então não
contam como compartilhamento. Sentry e o provedor de IA aparecem como compartilhamento porque
processam em infraestrutura própria. **Se o dono tiver dúvida em algum item, marque a opção mais
conservadora** — declarar a mais não suspende ninguém; declarar a menos, sim.

**Notas de preenchimento:**

- **Áudio:** marque como opcional e explique no campo livre que só o modo "nuvem" transmite.
- **"Outras mensagens no app":** cobre feedback, sugestão e a denúncia de conteúdo de IA — é texto
  escrito pelo usuário que sai do aparelho. Não é conversa entre usuários (o app não tem chat social).
- **Dados dos clientes do usuário:** entram nas mesmas linhas de Informações pessoais. O formulário
  não distingue "dado do usuário" de "dado que o usuário digitou sobre outra pessoa" — os dois são
  coletados pelo app.
- **Registros de falha e diagnósticos são obrigatórios**, não opcionais: o Sentry inicializa no boot
  e não há interruptor para o usuário.

---

## PARTE 3 — Classificação de conteúdo (questionário IARC)

O questionário é preenchido **dentro da Play Console** (não é campo de texto). Categoria do
questionário: **Utilitário, produtividade, comunicação ou outro** — não é jogo, não é rede social.

| Pergunta | Resposta | Fundamento |
| --- | --- | --- |
| Violência (qualquer tipo) | **Não** | — |
| Conteúdo sexual / nudez | **Não** | — |
| Linguagem imprópria / palavrão | **Não** | — |
| Substâncias controladas (drogas, álcool, tabaco) | **Não** | — |
| Jogos de azar / simulação de aposta | **Não** | — |
| Conteúdo assustador / horror | **Não** | — |
| O app permite que usuários **interajam ou troquem conteúdo** entre si? | **Não** | Não há chat entre usuários nem feed. O link de aprovação é 1-para-1, gerado pelo próprio usuário para o cliente dele, fora do app (WhatsApp). Equipe é dentro da mesma organização, com papéis — não é rede social |
| O app compartilha a **localização** do usuário com outros usuários? | **Não** | Localização não é coletada no Android (Parte 0, divergência 2) |
| O app permite **compra de bens/serviços digitais**? | **Sim** | Assinatura Pro/Empresa e créditos de IA |
| O app tem **recursos de IA generativa**? | **Sim** | Três superfícies: chat, diagnóstico e voz em modo conversa |

**Classificação esperada: Livre / Classificação Etária Livre (Everyone / 3+).**

### A pergunta de IA generativa merece cuidado

A *AI-Generated Content policy* responsabiliza o desenvolvedor por o app não gerar conteúdo ofensivo
e espera um caminho para o usuário sinalizar problema. O OLLI **já tem isso implementado** — não é
promessa:

- `src/components/SinalizarIA.tsx` — o botão, presente nas três superfícies generativas;
- `enviarDenunciaIA()` em `src/services/feedback.ts` — só é chamado **depois** do usuário confirmar
  o aviso de que aquele trecho vai para revisão;
- o conteúdo denunciado chega na caixa que o `/admin` lê.

Ao responder, descreva exatamente isso: **assistente de IA para uso profissional (montar orçamento
por voz e consultar código de erro), com botão de sinalizar em toda resposta gerada, e revisão
humana das denúncias.** Não é gerador de imagem, não é chatbot aberto, não gera conteúdo para o
público — o que mantém a classificação em Livre.

---

## PARTE 4 — Outras declarações em "Conteúdo do app" (a Console cobra todas)

| Seção | Resposta | Observação |
| --- | --- | --- |
| **Política de privacidade** | `https://olliorcamentos.online/legal/privacidade/` | A página existe (`web/src/pages/legal/privacidade.astro`) e o atalho `/privacidade` **já tem redirect 301** em `web/astro.config.mjs` — o alerta de 404 que circula nos docs antigos está **resolvido no código**. ⚠️ Falta só confirmar que está **no ar**: as duas URLs devolvem 403 a acesso automatizado (proteção antibot), então abra no navegador antes de colar. A Console valida que a URL resolve |
| **Anúncios** | "Meu app **não** contém anúncios" | Nenhum SDK de anúncio no projeto |
| **Acesso ao app** | "Parte da funcionalidade é restrita" + **credenciais de teste** | ⚠️ **Obrigatório e frequentemente esquecido.** O app tem login; sem uma conta funcional o revisor trava na porta e reprova. Use a conta demo (`demo@grtech.com.br`, memória `olli-conta-demo-grtech`) ou crie uma dedicada ao revisor, com dados de exemplo já povoados |
| **Público-alvo e conteúdo** | Somente faixas **18+** | O produto é ferramenta profissional. Marcar faixa infantil ativa a política Famílias, com exigências que o app não cumpre e não precisa cumprir |
| **App de notícias** | Não | — |
| **Recursos financeiros** | ⚠️ **[VERIFICAR com o dono]** | Vender a própria assinatura normalmente **não** é "recurso financeiro" (a seção mira empréstimo, investimento, cripto, carteira). Mas há cobrança por Pix/créditos — confirme o texto vigente da seção na Console em vez de chutar |
| **Segurança dos dados** | Parte 2 deste documento | — |
| **Governo** | Não | — |

---

## PARTE 5 — Quando este documento precisa ser refeito

Data Safety desatualizado é violação, mesmo sem má-fé. Refaça **antes de enviar** o build em que
qualquer um destes acontecer:

- [ ] `EXPO_PUBLIC_POSTHOG_KEY` for configurada no EAS → "Ações no app" passa a ser coletada
- [ ] `expo-location` for instalado / `LOCALIZACAO_DISPONIVEL` virar `true` → Localização passa a ser coletada
- [ ] Upload de fotos para a nuvem for implementado (`StorageProvider`) → "Fotos" passa a ser coletada
- [ ] `expo-contacts` entrar → Contatos passa a ser coletada
- [ ] O Google Agenda for ligado (client OAuth Android) → Calendário passa a ser coletado
- [ ] O Sentry for desligado ou trocado → rever "Registros de falhas" e "Diagnósticos"
- [ ] Qualquer SDK novo de terceiro entrar no `package.json`
