# ENTREGA — o que você tem em mãos

> **Carimbo da medição.** Tudo que é número aqui saiu de um comando rodado em **18/07/2026, entre
> 08:43 e 08:51**, no commit **`97f59d3`** (branch `claude/app-complete-analysis-optimization-9a1912`).
> A worktree tinha **13 arquivos sujos de outras sessões** no momento da medição — por isso o carimbo:
> num repositório com três sessões escrevendo, "medi agora" vence em minutos.
>
> Onde eu não testei, está escrito **"não testei"** — não "está pronto".
> Onde um número que me passaram **não bateu**, escrevi o que a régua mostrou e disse que não bateu.

---

## 1. O QUE VOCÊ TEM AGORA

Quatro peças. Três que o usuário vê, uma que ninguém vê e que segura o dinheiro.

### App / APK (Android + iPhone)

**61 telas** (40 no app + 21 na versão desktop). Compila limpo.

**Existe um APK, e ele é de hoje.** Medido no arquivo:

| | |
|---|---|
| Arquivo | `C:\olli\android\app\build\outputs\apk\release\app-release.apk` |
| Tamanho | **125.560.437 bytes** (125,6 MB) |
| Gerado em | **18/07/2026 08:30:29** |
| Pacote | `online.olliorcamentos.app` |
| Versão | `1.1.0`, versionCode **9** |
| Android mínimo | 7.0 (SDK 24) · alvo SDK 36 |
| Assinatura | **`CN=Android Debug`** |

Leia a última linha com atenção: **está assinado com a chave de depuração.** Isso significa
**instala no seu celular e serve para testar** — e **não serve para publicar**. Play Store e App
Store recusam binário com chave de debug. O APK de publicar tem que ser assinado com a keystore de
upload (`CONFIG CLAUDE/olli-keystore/olli-upload.jks`), e sai depois dos passos da seção 3.

O JavaScript dentro dele está compilado para Hermes: **8.005.304 bytes** (8,0 MB) de bytecode,
gerado 18/07 08:29:22, e conferi que é **exatamente esse arquivo** que está dentro do APK.

**Não testei em aparelho.** Compilei e inspecionei o binário — não abri o app num celular, não rodei
emulador. Isto é a maior lacuna do pacote e a seção 4 volta nela.

> **Correção do documento anterior:** a versão de ontem deste arquivo dizia *"Não gerei APK"* e
> *"Não buildei"*. Está errado — o APK foi gerado às 08:30 de hoje. Corrigido.

### Painel web — **está no ar**

`https://app.olliorcamentos.online/` respondeu **HTTP 200** às 08:50:49 (título `OLLI — Painel`).

Gate: `npx tsc --noEmit` **exit 0**. `npm run build` **exit 0** em **26,71 s**.

Um número que não é bom: o maior pedaço do painel tem **1.143,57 kB** (351,19 kB comprimido) e o
pacote de gráficos tem **577,04 kB** (156,79 kB comprimido). Em celular de 4G do interior isso é
lento. Funciona, mas é dívida — está na lista da seção 4.

### Landing (site público) — **está no ar**

`https://olliorcamentos.online/` respondeu **HTTP 200** às 08:50:49
(título `OLLI — do orçamento ao recibo, sem planilha`).

Gate: `npx astro check` → **18 arquivos, 0 erros, 0 avisos, 1 dica** (sugestão de estilo em
`Layout.astro:124`, inofensiva). `npm run build` → **11 páginas**, exit 0, 1,96 s.
É a peça mais saudável das quatro.

### Worker (Cloudflare) — o caixa

**9 arquivos** mexidos nesta branch, incluindo a configuração (`wrangler.jsonc`). É quem cobra
crédito, fala com o Mercado Pago, chama a IA e apaga conta.

**Não subiu — de propósito, por dois motivos declarados:**

1. Subir o worker cobra **1 crédito extra, uma única vez**, de cada cliente que estava reusando a
   chave de idempotência antiga (detalhe e justificativa no aviso da seção 3).
2. Sem a migration de cota aplicada, a cobrança de IA continua **ilimitada** — então subir o worker
   sozinho não resolve o buraco de dinheiro, só antecipa o custo.

Enquanto não subir, tudo que consertei em cobrança continua quebrado em produção.
*(Não verifiquei o estado do deploy contra a Cloudflare: não rodo `wrangler` nesta sessão. O que
afirmo é a decisão registrada, não uma leitura do servidor.)*

### O que o gate cobre — e o que ele NÃO cobre

O gate desta casa é **`npm run preflight`**. Rodei: **exit 0**.

Ele encadeia quatro etapas, e vale saber o que cada uma prova:

| Etapa | O que rodou | Resultado | O que prova |
|---|---|---|---|
| `typecheck` | `tsc --noEmit` | **exit 0** | os tipos batem entre si |
| `test` | 14 suítes | **455 asserções, 0 falhas** | as regras de negócio abaixo |
| `check:contraste` | 231 arquivos + 12 marcas × 2 modos | **pior par 4,50:1** | nenhum texto ilegível na paleta |
| `doctor` | `npx expo-doctor` | **21/21 checks** | o projeto Expo está são |

As 14 suítes, na ordem em que rodam, com a contagem que cada uma imprimiu:
`17 · 51 · 20 · 63 · 11 · 23 · 11 · 8 · 26 · 100 · 39 · 24 · 43 · 19` = **455**.

**Seja cético com o 455, porque ele é menor do que parece:**

- **Boa parte das asserções lê o código-fonte como texto**, não executa a tela. Elas pegam "alguém
  mexeu no app e esqueceu o painel" — que é um erro real e caro aqui. Elas **não** pegam "a tela
  abre e o botão funciona".
- **Nenhum teste toca o Supabase real, o Mercado Pago real ou o Gemini real.** As chamadas de rede
  são simuladas. Prova a lógica, não a integração.
- **Não existe teste de interface rodando em aparelho.** Nem Android, nem iPhone, nem navegador. Zero.
- `typecheck` verde significa que os tipos batem. Não significa que a conta está certa.

**Um aviso sobre o próprio gate:** na primeira execução de hoje ele saiu com **exit 127** e
`Assertion failed ... uv` no meio da 3ª suíte. É uma **flaka conhecida do Node no Windows**, não do
código: rodei de novo, sem tocar em nada, e deu **exit 0** com as 14 suítes. Se você vir isso, rode
de novo antes de achar que quebrou.

> **Correção do documento anterior (importante).** A versão de ontem trazia, em destaque, um aviso
> dizendo que a suíte `teste-numero-web` estava **vermelha** e mandando *"quem fechar o rename
> precisa trocar o caminho dentro de `scripts/teste-numero-web.ts`"*. **Isso é falso.** Rodei a suíte
> agora: **63 asserções, 0 falhas.** O conserto já estava feito 7 minutos antes daquele documento ser
> escrito — o teste já lê o caminho `.sql.pendente`. **Não há nada para você caçar aqui.** O aviso foi
> removido. Pelo mesmo motivo a contagem de asserções mudou de 412 (errada) para **455** (medida).

---

## 2. O QUE MUDOU NESTA OPERAÇÃO

Em linguagem de dono. Primeiro o que mexe com **dinheiro** e **dado de cliente** — o resto é
acabamento. São **36 commits**, **173 arquivos**, **+11.483 / −1.956 linhas**.

### DINHEIRO — a IA estava de graça para quem soubesse pedir

O caixa perguntava ao aplicativo do cliente "posso cobrar?". Quem simplesmente **não respondesse**
usava a IA sem limite — na sua conta do Gemini, na sua fatura. Não era invasão: bastava não mandar
um campo. Agora quem decide é o servidor. O cliente pede; conceder é do caixa.

O teto, quando a migration estiver aplicada: **1 chamada por crédito, 3 grátis por mês**
(`IA_USOS_GRATIS_MES = 3`, conferido em `src/services/planos.ts:159`).

Junto disso, três buracos menores no mesmo cano:

- **Crédito pago sumia calado.** Quando o gateway reenviava a confirmação (coisa normal), o caixa
  tratava *qualquer* conflito como "já lancei" e engolia. Agora só engole o conflito que realmente
  significa repetição; o resto volta pro gateway reenviar.
- **Cobrança dupla.** O conserto da onda anterior tinha aberto uma falha pior que a que fechou: em
  uma direção, **60 de 60** cobranças testadas saíam duplicadas — e o pior momento seria exatamente
  quando você aplicasse a migration. Refeito e medido: **0 de 60** nas duas direções, por duas
  sondas independentes.
- **Cartão cobrado após excluir a conta.** Quem assinasse pelo Mercado Pago e excluísse a conta
  continuava sendo cobrado, sem conta pela qual cancelar. Agora a exclusão cancela a assinatura
  antes — e se o cancelamento falhar, **não apaga a conta** (apagar deixaria o cartão sangrando sem
  ninguém para reclamar).

### DADO DE CLIENTE — a base do dono ia embora no celular do técnico

O backup automático do técnico gravava **a base inteira do dono sob o `user_id` do técnico**. Quando
ele fosse desligado, levava a carteira de clientes junto. Fechado — e fechado no lugar certo: a
primeira tentativa protegeu só o backup automático, e o botão "Fazer backup agora" passava por fora.
A guarda desceu para onde o dado é carimbado.

Junto: o painel do técnico puxava a empresa **sem filtrar por dono** e recriava a empresa alheia no
espaço dele. Mesmo padrão apareceu na tela de entrar, que decide para onde o usuário vai depois do
login. Os dois filtrados.

E a regra da casa aplicada aqui: **contexto indeterminado não faz backup**. "Não consegui confirmar
quem é você" não vira "pode". A tela também parou de mentir — ela dizia "backup automático: ativo"
para quem a guarda ia recusar, e o único sinal era um log que ninguém lê.

### DOCUMENTO — dois orçamentos podiam sair com o mesmo número

O app deixava editar orçamento **já aprovado pelo cliente**; o painel bloqueava o mesmo orçamento. O
mesmo documento tinha duas regras conforme onde fosse aberto. Alinhado, com o botão Editar escondido
onde não vale, e as bordas fechadas (o lápis do desktop e o link direto não alcançam mais o editor
travado).

A numeração ficou unificada entre app e painel. **A trava definitiva no banco, não.** Ela está
escrita e deliberadamente **não aplicada** (é o arquivo `.pendente`), porque exige um ajuste de
código que ainda não existe: aplicada antes disso, ela troca um erro visível por um invisível — o
documento sumiria calado em vez de dar erro na tela. Seção 4.

### LOJA — o iPhone estava barrado por política, não por engenharia

Dois pontos independentes da regra 3.1.1 da Apple: a tela de Créditos mostrava **QR de Pix dentro do
app** (a regra cita QR pelo nome) e o "Assinar" abria o Stripe no navegador. Qualquer revisor chega
nessas telas em minutos. Agora um único interruptor por arquivo esconde a **compra** no iPhone e
mantém visível o **estado** (saldo, extrato, plano atual) — mostrar não é vender. Conferido agora:
`COMPRA_NO_APP = Platform.OS !== 'ios'` nas 4 telas (`AssinaturaScreen:47`, `ContaScreen:61`,
`CreditosScreen:45`, `PlanosScreen:39`). **Android e web ficaram byte a byte iguais.**

Também: a política de privacidade só falava de "Android e versão web" (não cobriria o app iOS), não
mencionava o Sentry (que estava ligado) nem o Mercado Pago (que processa o Pix). Corrigida. E o texto
de permissão da câmera no iPhone falaria só de "ler QR", omitindo fotografar o serviço — dois plugins
escreviam a mesma chave e o último vencia.

### O resto (acabamento, sem risco de dinheiro)

Voz completa com cobrança de crédito real; identidade visual convergida nas três pontas (fonte,
ícone, raio, dark navy no painel); "erro nunca vira vazio" fechado no app inteiro; redefinir senha do
painel, que **mandava o e-mail e não trocava a senha**; autocomplete de e-mail no login; aviso de
cliente duplicado; ritual diário e Pulso da semana.

---

## 3. SEUS CLIQUES, EM ORDEM

Ordem importa. Pular passo aqui custa dinheiro ou derruba usuário.

### ⚠️ Antes de qualquer coisa: o custo conhecido do deploy do worker

Está no topo de `docs/ENXAME/BLOQUEIOS.md` e você merece saber antes de ouvir por reclamação:

> A chave de idempotência da IA de voz **mudou de formato**. Quem estava "pegando carona" na chave
> antiga (que valia para sempre) vai ser cobrado **1 crédito extra, uma única vez**, na primeira ação
> depois que o worker subir.
>
> **Vale a troca:** sem ela, cobrança feita com o banco fora ficava invisível quando ele voltasse —
> 60/60 cobranças duplas nessa direção. Trocamos um custo pontual e conhecido por um risco recorrente
> e invisível. Se alguém reclamar de 1 crédito, é isto.

**Faça o passo 3 e o passo 4 na mesma janela, em horário de pouco movimento.**

---

**Passo 1 — Mesclar a branch.**
Nada dos 36 commits está em produção. O painel e a landing que estão no ar hoje são a versão de
ANTES desta operação. Enquanto não mesclar, tudo na seção 2 continua quebrado no ar: a IA segue de
graça, o backup do técnico segue levando sua base.
*Se pular:* nada muda. Você continua com os bugs desta lista.

**Passo 2 — ~~`MP_WEBHOOK_SECRET` + registrar o webhook no painel~~ — CAIU (medido em 21/07).**
O `MP_ACCESS_TOKEN` está no worker (reconferido em 21/07 por `wrangler secret list`) e **a URL do
webhook já está cadastrada** — o cadastro foi feito numa sessão anterior; eu tinha esquecido e
mandei você refazer. Dois Pix de R$ 0,01 (um deles um controle sem `notification_url`) provaram a
entrega ao vivo: 6 notificações, todas `200`. O secret continua valendo como camada extra de
segurança (HMAC na borda), mas não segura venda nenhuma. Prova em [MERCADOPAGO.md](MERCADOPAGO.md).
*Se pular:* nada. O que ainda não foi exercido é um pagamento **aprovado** virando saldo — R$ 0,01
pago do seu celular fecha essa última ponta.

**Passo 3 — Subir o worker (`wrangler deploy`).**
O token do `.env` é fraco e sabota o deploy, então tire-o do ambiente antes. **No seu PowerShell:**

```powershell
Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
npx wrangler deploy
```

(o `env -u CLOUDFLARE_API_TOKEN wrangler deploy` que anda nos meus documentos é sintaxe de Linux —
colado no PowerShell, não roda.)

Deploy manual não apaga segredos (refutado em 16/07: 9 → 9). O `wrangler.jsonc` mudou: tem um
limitador novo no endpoint de áudio (`TRANSCREVER_RL`, **20 requisições por 60 s**, conferido em
`worker/wrangler.jsonc:60`), que só passa a valer com o deploy.
*Se pular:* todo conserto de cobrança, vazamento no caixa e cancelamento de assinatura fica no papel.
O endpoint de áudio segue sem teto por IP.

**Passo 4 — Aplicar as migrations no Supabase de produção, NESTA ORDEM (são CINCO):**

1. `20260724_webhook_events.sql`
2. `20260725_equipe_grandfathering.sql`
3. `20260726_credit_ledger_imutavel.sql`
4. `20260727_ia_cota_gratis.sql`
5. `20260728_mp_preapproval_id.sql`

**NÃO aplique `20260727_numero_unico_por_tenant.sql.pendente`.** A extensão `.pendente` existe de
propósito, para escapar de qualquer varredura "aplica tudo que é `.sql`". Ela tem pré-requisito de
código que ainda não existe.

> ⚠️ **`docs/ENXAME/BLOQUEIOS.md` está desatualizado neste ponto:** a linha 29 de lá ainda diz
> **"3 migrations"** e lista só as três primeiras. **A lista certa é a de cima, com cinco.** Não
> corrigi aquele arquivo porque outra sessão estava escrevendo nele às 08:31 de hoje. Se seguir o
> checklist de lá, você pula justamente a nº 4 — que é o buraco de dinheiro.

*Se pular / fizer fora de ordem:* fora de ordem dá **500/503** — o código já assume que as três
primeiras existem. E pular a **nº 4 é o buraco de dinheiro**: enquanto `ia_cota_gratis` não rodar,
**a cobrança de IA é ilimitada** (deixei assim de propósito, declarado, para o deploy do worker ser
seguro sozinho e não derrubar ninguém). Toda a máquina de idempotência só começa a valer com ela
aplicada. Pular a **nº 5** mantém o cartão sendo cobrado depois de excluir a conta.

**Passo 5 — Publicar painel e landing** pela sua rotina atual (Pages `olli-painel-web` e o worker do
site). Os dois estão no ar hoje com a versão pré-operação.
*Se pular:* o usuário vê o painel velho, com a redefinição de senha quebrada.

**Passo 6 — Gerar o APK de verdade (assinado para publicar).**
O APK que existe hoje é **de debug** e a loja recusa. Antes de gerar o de publicar, resolva o Sentry:

> **`SENTRY_AUTH_TOKEN`.** Sem ele o build de RELEASE **falha** na etapa
> `createBundleReleaseJsAndAssets_SentryUpload`. O contorno usado no build de hoje foi
> `SENTRY_DISABLE_AUTO_UPLOAD=true` — funciona, mas aí o Sentry mostra stack trace **minificado**
> (`index.hbc:1:9553539`), quase inútil para depurar crash de usuário. Com o token, o source map sobe
> e o stack fica legível. Vale os 2 minutos de configurar.
>
> ⚠️ **Armadilha:** quando esse build falha, o gradle **deixa o APK antigo na pasta**. Confira a data
> do arquivo antes de publicar, senão sobe binário velho na loja. (O de hoje é 18/07 08:30:29 — eu
> conferi; o próximo você confere.)

**Passo 7 — Google Play** (detalhe em `docs/ENXAME/LOJA.md`):
abrir e pagar a conta · decidir **pessoal vs. organização** (pessoal exige teste fechado com 12
testadores por 14 dias antes de produção; organização é isenta) · fazer login no EAS · aprovar
screenshots e a arte 1024×500 (**não existem no repo** — conferi) · responder o questionário de
classificação (IARC) · aceitar termos · clique final de publicar.
*Se pular:* não tem app na loja. E se escolher "pessoal" sem saber, perde 14 dias.

**Passo 8 — App Store** (só depois que o ciclo comercial estiver testado):
conta Apple (99 USD/ano) · vincular EAS à conta Apple · criar o app no App Store Connect e trazer o
`ascAppId` para o `eas.json` · **decidir Stripe × IAP (seção 5)** · preencher os rótulos de
privacidade · criar uma conta de teste funcional para o revisor · `eas build -p ios` → `eas submit` ·
clique final.
*Se pular a conta de teste do revisor:* reprova direto — ele precisa entrar no app.

---

## 4. O QUE AINDA NÃO EXISTE

Sem maquiagem. Doc de entrega que esconde buraco vira reclamação depois.

**Não testei em aparelho nenhum.** O APK foi compilado e inspecionado — **não foi aberto num
celular**. Nem emulador, nem iPhone. Esta é a maior lacuna do pacote, e nenhum gate verde compensa
ela. Já mordeu aqui antes (o `TextDecoder latin1` que travou a v6 e o navegador não pegou).

**O APK que existe não publica.** Chave de debug (`CN=Android Debug`). Serve para você instalar e
usar; a loja recusa.

**O iOS nunca foi empacotado.** Procurei: não existe pasta `ios/` nem nenhum `.jsbundle` em lugar
nenhum da máquina. Só o bundle Android (8,0 MB) existe.
*(Ressalva honesta: me passaram como fato que "os bundles Hermes de Android e iOS compilam, 9,6 e
9,5 MB". **Não confirma.** O bundle Android mede **8,0 MB**, não 9,6; e o bundle iOS **não existe**.
Preferi a régua ao relato.)*

**A trava de número duplicado no banco não está aplicada** — de propósito. Ela precisa de um ajuste
no código que trata o erro de duplicidade durante a sincronização; sem ele, o documento sumiria
calado em vez de dar erro. Hoje app e painel usam a mesma regra de numeração, o que reduz muito o
risco, mas dois aparelhos offline ao mesmo tempo ainda podem colidir.

**Compra dentro do iPhone: escondida, não implementada.** Escolhi a saída reversível — o app entra na
loja e o usuário compra fora. Não existe StoreKit/IAP no projeto. Seção 5.

**Android está fora da política de pagamentos do Google**, embora não bloqueie o envio hoje. Vender
bem digital por Pix próprio ignora o Play Billing. Existe caminho legal (*user choice billing*, com o
Brasil na lista), mas exige inscrição **e** a biblioteca — nenhuma das duas existe.

**Assets de loja não existem:** arte 1024×500, screenshots e o ícone 512×512. Conferi as dimensões:
só existe `assets/icon.png` em **1024×1024**.

**O painel carrega 1.143,57 kB no maior pedaço.** Não quebra nada; é lentidão em rede ruim.

**Dívida de contraste medida:** o gate passa (pior par 4,50:1), mas há **120 sítios com `#fff`
cravado** como cor de texto/ícone. Corretos hoje porque as 12 marcas resolvem para branco nos
gradientes; frágeis se alguém trocar uma marca. Está em `docs/FOLLOWUPS.md` (itens 22 e 24).

**Depende de conta sua, e eu não posso fazer:** chave do PostHog (a feature está codada e desligada
até a chave existir) · Resend + verificar o domínio de e-mail (sem isso o convite de equipe falha
**calado**) · MFA na conta admin · OAuth Android (precisa do SHA-1 do keystore de release — sem isso
não tem login Google nem Google Agenda no APK) · a tela de consentimento do OAuth, que tem fila de
**1 a 4 semanas** no Google, então comece cedo se quiser Agenda.

~~**Sem caminho de denúncia dentro do app para conteúdo gerado por IA**~~ — **FEITO** (18/07). Existe
"Sinalizar" nas três superfícies que geram texto por IA: chat da Olli, diagnóstico e o modo conversa
da voz. Cada denúncia leva o par (resposta + o pedido que a gerou), pede confirmação antes de enviar
— porque o texto pode conter nome, endereço ou preço de cliente — e só diz "recebemos" quando
recebeu de verdade. Atende a política de conteúdo gerado por IA do Google Play.

**Sem baseline versionado do banco** (`pg_dump --schema-only` das 13 tabelas legadas). Exige sessão
com acesso ao Supabase ao vivo.

**Sobre a auditoria que gerou metade destes consertos, uma ressalva honesta:** foram 20 achados e
**0 refutados** pelos céticos. Painel que não mata nada é sinal amarelo, não selo de qualidade. Os
**4 de maior consequência** eu reconferi à mão, lendo o código, e os quatro se confirmaram. Os outros
valem como hipótese forte, não como fato provado.

---

## 5. DECISÕES QUE SÓ VOCÊ PODE TOMAR

**1. Cobrar dentro do iPhone (IAP) ou não vender no iOS?**
Vender crédito ou plano dentro do app iOS **exige** In-App Purchase, com **15–30% para a Apple**.
Três saídas: (a) não vender no iOS — o app entra, o usuário compra pelo site, o iPhone vira só uso;
(b) implementar StoreKit e pagar a taxa; (c) adiar o iOS.

**Minha recomendação: (a), que é o que já está implementado.** Motivo: é a única reversível. Destrava
a revisão da Apple hoje sem casar seu modelo de cobrança com a taxa dela, e você troca para IAP
depois se o iPhone provar que traz receita. Prestador de serviço compra no computador com
naturalidade — o atrito é menor do que 30% da sua margem. **Se você discordar, discorde agora:**
implementar IAP depois de publicar é mais caro que antes.

**2. Conta Play pessoal ou organização?**
Pessoal exige **12 testadores por 14 dias** antes de ir para produção. Organização é isenta, mas
exige CNPJ e verificação.
**Recomendação: organização,** se o CNPJ estiver à mão — os 14 dias custam mais que a papelada, e
você já tem o CNPJ da GR Tech.

**3. Paywall do plano Empresa.**
O plano Empresa é pago e **não tem cobrança sendo aplicada** — nem no app, nem no caixa. Equipe está
saindo de graça. Não codifiquei nada porque a decisão é comercial: cobrar de quem já está usando (e
arriscar perder), ou manter os atuais e cobrar só dos novos.
**Recomendação: manter os atuais (avô) e cobrar dos novos.** Já existe migration de *grandfathering*
pronta para isso (`20260725`). Cobrar retroativo de quem já usa costuma custar mais em reclamação do
que traz em receita.

**4. Numeração atômica (item O2-19).**
Quatro opções em `FOLLOWUPS #31`; a "opção 4" sozinha tem furo. Depois de decidir, o valor inicial da
migration por cliente precisa conferir o banco real. Não é urgente — só vira urgente quando dois
aparelhos offline colidirem.

**5. Quando gerar o APK de publicar.**
Regra sua, mantida: a hora é você quem diz. Minha leitura: **não gere o APK de publicar antes do
passo 4** (migrations). Um APK construído contra um servidor sem as migrations carrega a cobrança
ilimitada para dentro da loja, e trocar APK publicado é mais lento que trocar servidor. O APK de
debug que existe hoje serve justamente para você testar antes disso.

---

### Onde está o resto
- Passos humanos, item a item: `docs/ENXAME/BLOQUEIOS.md` — ⚠️ **a linha das migrations está
  desatualizada lá (diz 3, são 5)**; a lista boa é a do passo 4 acima
- Trilha das lojas: `docs/ENXAME/LOJA.md`
- A auditoria que gerou os P0: `docs/ENXAME/AUDITORIA_RISCO.md`
- Log de tudo que foi feito, onda a onda: `docs/ENXAME/MISSAO.md`
