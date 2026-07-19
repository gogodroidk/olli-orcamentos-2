# LOJA — trilha Google Play + App Store (preparo até os cliques do dono)

> Meta: chegar na faixa de **teste interno** (Android) / **TestFlight** (iOS) com tudo montado; o dono só clica.
> `[CLAUDE]` = eu automatizo · `[DONO]` = ato do dono (credencial/termos/pagamento/publicar).
> Fonte: Onda 1 agente store (2026-07-17) + auditoria de config iOS/Android (2026-07-18).
> Detalhe completo de cada item da App Store (Privacy Nutrition Labels, IAP x Stripe, TestFlight) está em `docs/LOJAS.md` seção 3 — este arquivo só resume o que falta e quem faz.

## App Store (iOS) — config de código: PRONTA (2026-07-18)

`app.json`/`eas.json` foram auditados linha a linha contra a documentação versionada do Expo SDK 56
(https://docs.expo.dev/versions/v56.0.0/) e o comportamento real de merge dos config plugins
(`@expo/config-plugins` `createPermissionsPlugin`: a última chamada explícita a um plugin que seta a
mesma chave do Info.plist vence — chamadas com valor `undefined` preservam o que já estava lá).
Achados e correções:
- [x] **`NSCameraUsageDescription` incompleto** — `expo-camera` (que roda depois de `expo-image-picker`
  na lista de `plugins`) sobrescrevia o texto com "...ler o QR do equipamento", apagando a menção ao
  uso mais comum da câmera (fotografar o serviço, em `src/utils/fotosOrcamento.ts`). Corrigido:
  mesmo texto unificado nos dois plugins, mencionando as duas finalidades.
- [x] **`NSMicrophoneUsageDescription` fragmentado** — três plugins tocam essa chave
  (`expo-image-picker`, `expo-speech-recognition`, `expo-audio`) com textos ligeiramente diferentes;
  o resultado final já batia por acaso (ordem dos plugins fazia o texto do `expo-audio` vencer, que é
  honesto), mas ficou dependente da ordem. Unificado o mesmo texto nos três, pra não depender mais
  disso.
- [x] **`ITSAppUsesNonExemptEncryption` ausente** — adicionado `ios.config.usesNonExemptEncryption: false`
  em `app.json` (o app só usa TLS/HTTPS padrão — Supabase, Apple, Google — nenhuma criptografia
  proprietária; `expo-crypto` só faz hash SHA-256 pra nonce/PKCE, que não conta como criptografia pra
  esse fim). Isso evita a pergunta de export compliance a cada envio no App Store Connect.
- [x] **Permissões conferidas contra o uso real do código** (grep de cada import nativo em `src/`):
  câmera (`expo-camera` + `expo-image-picker`), fotos (`expo-image-picker`), microfone
  (`expo-image-picker`, `expo-audio`, `expo-speech-recognition`), reconhecimento de fala
  (`expo-speech-recognition`) — todas usadas de verdade, texto pt-BR, nenhuma sobrando.
  **Localização e contatos NÃO estão no Info.plist nem no Android manifest** — corretamente, porque
  `expo-location`/`expo-contacts` **não estão instalados** (`LOCALIZACAO_DISPONIVEL = false` em
  `src/services/localizacaoEquipe.ts`; a captura nativa de "equipe ao vivo" é só um `import()`
  dinâmico protegido por try/catch, inerte até a Onda 8). Não declarar essas permissões agora está
  certo — declarar permissão que o app não usa de fato reprova na review da Apple.
- [x] `ios.bundleIdentifier` (`online.olliorcamentos.app`) já bate com o Android; `buildNumber: "1"`
  presente; `usesAppleSignIn: true` + plugin `expo-apple-authentication` já coerentes (Sign in with
  Apple está implementado em código — ver `docs/LOJAS.md` §1 item 2).
- [x] `eas.json` conferido contra a doc `https://docs.expo.dev/eas/json/`: perfis `development`,
  `preview`, `production` para `ios` e `android` já cobrem os campos recomendados
  (`simulator`/`buildType`/`credentialsSource`); nada faltando ou incoerente — não mexi.
- [x] `npm run typecheck` — exit 0 depois das mudanças.

**Não corrigido agora (fora do escopo desta rodada — são features de código, não config de loja):**
o In-App Purchase para a tela Planos no iOS ainda não está implementado (Stripe Checkout externo viola
a Guideline 3.1.1); decisão já tomada (D-16), falta codar. Ver `docs/LOJAS.md` §1 item 3.

### Passos [DONO] — iOS (nenhum depende de código, todos exigem a conta Apple)
1. Abrir + pagar conta Apple Developer (99 USD/ano) — **[VERIFICAR]** valor em BRL na hora.
2. Login EAS (`eas whoami`) e vínculo com a conta Apple Developer (gera certificado + provisioning
   profile automaticamente no primeiro `eas build -p ios`).
3. Criar o app em App Store Connect → obter o `ascAppId` numérico → preencher em `eas.json` (campo
   `submit.production.ios.ascAppId`) quando for automatizar `eas submit`.
4. Decidir Stripe x IAP no iOS (ver achado acima) e, se for IAP, criar os produtos de assinatura em
   App Store Connect.
5. Preencher App Privacy (Privacy Nutrition Labels) — tabela pronta em `docs/LOJAS.md` §3.7.
6. Criar conta de teste funcional para o revisor da Apple (App Review Information).
7. `eas build -p ios --profile production` (roda em macOS hospedado pela Expo, não precisa Xcode
   local) → depois `eas submit -p ios --profile production`.
8. Clique final de enviar para revisão / TestFlight.

---

# Google Play — trilha detalhada (preparo até os cliques do dono)

> **Atualizado em 2026-07-18 pela onda G5 (material da loja).** O material que não dependia da conta
> foi PRODUZIDO e está em **`assets/loja/`** — não é mais proposta, é arquivo. Comece por
> `assets/loja/README.md`.
>
> ⚠️ **`docs/STORE_LISTING.md` e `docs/LOJAS.md` §2.5/§3.7 estão DESATUALIZADOS** e foram
> substituídos por `assets/loja/FICHA.md` e `assets/loja/CLASSIFICACAO-E-DATA-SAFETY.md`.
> Não preencha a Console pelos documentos antigos — eles mandam declarar dados de uso como
> não coletados, e o Sentry está ligado desde então. Detalhe das três divergências na Parte 0 do
> documento novo.

## Identidade (confirmado)
- bundleId: `online.olliorcamentos.app` (iOS + Android iguais em app.json). Real, não placeholder.
- versionName `1.1.0`, android.versionCode `9`, ios.buildNumber `1`. Sem bump pendente.
- keystore de upload já existe: `CONFIG CLAUDE/olli-keystore/olli-upload.jks` (eas.json usa `credentialsSource=local`).

---

# ✅ PRONTO — não depende de ninguém, já está no repositório

| Item | Onde | Estado |
| --- | --- | --- |
| Título (28/30), descrição breve (69/80), descrição completa (3.085/4.000), novidades (314/500) | `assets/loja/FICHA.md` | Pronto para colar. Contagens **medidas** por `node assets/loja/medir.js`, não escritas à mão |
| Tabela de provas: cada afirmação da ficha → arquivo do repo | `assets/loja/FICHA.md` | Pronto |
| Palavras-chave + análise da concorrência real na Play | `assets/loja/PALAVRAS-CHAVE.md` | Pronto (28 de 29 termos cobertos, o ausente é decisão documentada) |
| **Feature graphic 1024×500**, 24-bit sem alpha | `assets/loja/feature-graphic.png` | **Gerado** da marca real. Regera com `node assets/loja/gerar.js` |
| **Ícone da ficha 512×512**, 32-bit com alpha | `assets/loja/icone-512.png` | **Gerado.** O `assets/icon.png` de origem não tinha alpha (medido: 3 canais) — o script corrige |
| **As 8 screenshots 1080×1920**, 24-bit sem alpha | `assets/loja/screenshots/NN-*.png` | **Geradas e conformes.** Regera com `node scripts/telas/loja.mjs` |
| Roteiro das 8 screenshots + comandos exatos de captura | `assets/loja/SCREENSHOTS.md` | **Histórico.** Descreve o caminho por emulador+adb, que não é mais usado — ver `scripts/telas/loja.mjs` |
| Script que converte print cru → screenshot válida da Play | `assets/loja/montar-screenshots.js` | Vivo, mas hoje só como porta de entrada do caminho antigo. A moldura de verdade é `scripts/telas/moldura-loja.mjs`, compartilhada pelos dois |
| Respostas do IARC e do formulário de Segurança dos Dados | `assets/loja/CLASSIFICACAO-E-DATA-SAFETY.md` | Pronto |
| Redirect `/privacidade` → `/legal/privacidade/` | `web/astro.config.mjs` | **Já existe** (o alerta de 404 dos docs antigos está resolvido no código; falta só confirmar no ar) |

---

# 📸 AS 8 SCREENSHOTS — estado medido (19/07)

Gerar/regerar: **`node scripts/telas/loja.mjs`** (usa o export web já em
`.expo/telas-build`; `--exportar` refaz o export antes). Não precisa de emulador,
de adb, de APK nem de login — o app é exportado para a web **sem nuvem**, e é por
isso que a captura roda sozinha.

## Formato — os 8 passam

Medido **byte a byte no cabeçalho PNG**, sem sharp, para não confiar na mesma
biblioteca que gerou o laudo: os 8 são **1080×1920**, colorType 2 (truecolor RGB),
3 canais, **sem alpha** e sem chunk `tRNS`, 8 bits, não-entrelaçados, 432–552 KB
(**3,87 MB no total**). Só existem os chunks `IHDR`/`pHYs`/`IDAT`/`IEND` — nenhum
`eXIf`/`tEXt`/`iTXt`/`iCCP`, ou seja, nenhum caminho de máquina ou nome de usuário
vazando junto com a imagem. Proporção 0,5625 = 9:16 exato.

## Conteúdo — a regra que faltava

Formato e conteúdo são portões diferentes, e só o primeiro existia. A
`04-ordem-servico` passava em **todas** as regras da Play com **69,7% da altura
vazia** — porque nenhuma regra da Play fala de vazio. Uma tela oca não é recusada
pela loja; é recusada pelo prestador que desliza a vitrine e vê "app sem nada
dentro" na 4ª imagem.

`node scripts/telas/medir-ocupacao.mjs` mede isso, e `loja.mjs` agora **reprova a
rodada** quando uma tela passa do limite (20% de rodapé vazio).

A tabela abaixo é a medição **do arquivo emoldurado** (`medir-ocupacao.mjs` sem
argumento), que é a única forma de ter o número do "antes" — as capturas cruas
daquela leva não existem mais. O pipeline mede a captura **crua**, antes da
moldura, e por isso dá números um pouco menores para as mesmas telas (7,0% e
2,8% em vez de 7,9% e 5,2%): é a mesma tela, medida em resolução diferente. Os
dois valores ficam registrados em `conformidade.json`.

| tela | rodapé vazio ANTES | DEPOIS |
| --- | --- | --- |
| 01-novo-orcamento-itens | 1,0% | 1,0% |
| 02-orcamento-aprovado | 1,0% | 1,0% |
| **03-lista-orcamentos** | **23,0%** | **7,9%** |
| **04-ordem-servico** | **69,7%** | **5,2%** |
| 05-agenda | 1,5% | 1,5% |
| 06-codigos-erro | 0,3% | 0,3% |
| 07-diagnostico-ia | 44,5% | 44,5% (tolerância declarada) |
| 08-clientes | 0,1% | 0,1% |

O conserto foi de **dado de semeadura**, não de imagem: a lista de ordens de
serviço passou de 1 para 6 ordens em 5 estados, com checklist andando; a de
orçamentos, de 3 para 4. Tudo em `scripts/telas/elenco.mjs`, semeado pela
interface real do app.

**Duas rodadas seguidas produziram os 8 arquivos com md5 idêntico** — a semeadura
nova não quebrou o determinismo do pipeline.

## O que continua aberto (decisão, não defeito)

- **`07-diagnostico-ia` tem 44,5% de rodapé vazio e fica assim.** É um formulário:
  abaixo de "Pedir diagnóstico" fica o espaço da RESPOSTA, e a resposta vem do
  worker de IA, que o build offline não alcança. A tolerância está **escrita e
  justificada** no roteiro de `loja.mjs`, não escondida afrouxando o limite geral.
  Para fechar de verdade seria preciso capturar com o worker de pé.
- **Sem screenshots de tablet.** `app.json:11` traz `supportsTablet: false`, mas
  essa chave é do **iOS**; no Android o app roda em tablet por padrão. Não é
  bloqueio (o mínimo de 2 já está satisfeito) — é elegibilidade perdida nas
  superfícies de tablet e Chromebook, onde a Google pede ~4 por classe.
- **`Ramalho Climatização` e `contato@ramalhoclima.com.br` são o negócio real do
  dono** (`elenco.mjs:43-52`). É consentido por definição, mas publicar na Play
  amarra o nome dele ao produto. Se não for o desejado: **uma linha** no elenco e
  recaptura.
- **O relógio congelado (`AGORA`) cai num SÁBADO.** `elenco.mjs` documenta a
  intenção como "sexta-feira, 18/07/2026" e 18/07/2026 é sábado — `05-agenda`
  publica "Sábado, 18 de julho". Não mexi: trocar `AGORA` desloca data em toda
  tela e na landing, e a agenda não está oca (1,5%). Conserto quando alguém fizer
  a próxima recaptura: mover para uma quarta/quinta de manhã **e** espalhar
  `AGENDAMENTOS` por `dias: -2,-1,0,0,+1,+2`, no mesmo movimento.

## ⚠️ A landing ficou DESATUALIZADA em relação a este elenco

`web/public/telas/` foi gerado com o elenco ANTIGO (1 ordem de serviço, 3
orçamentos) e **não foi regerado nesta leva** — `capturar-telas.mjs` escreve em
`web/`, que é de outra frente. As imagens no ar continuam válidas e corretas; elas
só não mostram mais o que o elenco descreve, e os `alt` de `roteiro.mjs` (que eu
atualizei para bater com as novas capturas da Play) agora descrevem uma imagem que
a landing ainda não tem.

**Quem for recapturar a landing:** rode `node scripts/telas/capturar-telas.mjs` e
resolva junto os achados de `REVISAO_TELAS.md` §B — a legenda da agenda promete
"endereço" que a imagem não mostra (`roteiro.mjs:61`), o cartão de computador é
ilegível a 440 px, e faltam os degraus de 496w/880w no `srcset` (−77 KB no celular).
Antes disso, leia o §C2 da mesma revisão: uma captura que falha no meio **apaga a
esteira da landing em silêncio**, porque o `rmSync` acontece antes do loop.

---

# 🚧 BLOQUEIOS ACHADOS NESTA ONDA (resolver ANTES de enviar)

### 1. `READ_MEDIA_IMAGES` no `app.json` — risco de remoção do app
O app declara essa permissão, **não precisa dela**, e ela sujeita o OLLI à *Photo and Video
Permissions policy* do Google Play — sob a qual ele **não se qualifica** (não é editor de foto nem
rede social; anexar foto a orçamento é o caso de "uso pontual" que a política manda resolver com o
system picker). Provado no código nativo da lib: `expo-image-picker` **não** declara essa permissão
e já usa o Android Photo Picker (`PickVisualMedia`), que não exige permissão nenhuma.
→ Remover de `app.json` e testar em Android 13+. **Tarefa separada já aberta** (`app.json` não é
arquivo desta frente).

### 2. Print cru do emulador REPROVA no upload
`olli_phone` é 1080×2400. Isso quebra **duas** regras da Play de uma vez: a proporção fica mais alta
que 9:16, e o maior lado passa do dobro do menor (2400 > 2160). Resolvido pelo
`montar-screenshots.js`, que monta em 1080×1920 — **mas só se alguém rodar o script.** Não suba PNG
direto do `adb`.

### 3. `EXPO_PUBLIC_POSTHOG_KEY` muda a resposta do Data Safety
Se essa chave for configurada no EAS, "Ações no app" passa a sair do aparelho e o formulário fica
errado **no mesmo instante, sem aviso nenhum**. Decida antes de enviar: ou não configura, ou
configura e já declara. (Mesma armadilha, ao contrário, de `EXPO_PUBLIC_DIAGNOSTICO_URL`: sem ela a
IA sobe desligada em silêncio.)

---

# 👤 CHECKLIST DO DONO — em ordem

### Fase 1 — só o dono pode fazer (nada aqui depende de código)
1. [ ] **Abrir e pagar a conta Play Console** (taxa única, histórico ~US$ 25 — confirmar valor na hora).
2. [ ] **Decidir: conta pessoal ou organização.** Isto muda o cronograma inteiro: conta **pessoal**
   criada depois de 13/nov/2023 é obrigada a rodar teste fechado com **12 testadores por 14 dias
   corridos** antes de pedir produção. Conta de organização (CNPJ verificado) é isenta.
   → Se for pessoal, **junte os 12 e-mails agora** e suba a primeira build o quanto antes: os 14
   dias só começam a contar depois do primeiro upload.
3. [ ] **Login no EAS** (`eas whoami`) para liberar os builds.
4. [ ] **Definir o e-mail de contato público** da ficha (fica visível na loja).
5. [ ] **Aprovar o visual**: abrir `assets/loja/feature-graphic.png` e `assets/loja/icone-512.png`.
6. [ ] **Escolher o título**: `OLLI: Orçamento, OS e Recibo` (recomendado, 28/30) ou `OLLI Orçamentos`
   (conservador). O porquê está em `assets/loja/FICHA.md` §1 — e dá para resolver depois por
   experimento A/B da própria Console, com número em vez de opinião.

### Fase 2 — código/build (Claude executa quando autorizado)
7. [ ] Remover `READ_MEDIA_IMAGES` do `app.json` e testar anexo de foto em Android 13+ (bloqueio 1).
8. [ ] `eas init` — trocar o placeholder `extra.eas.projectId="olli-orcamentos"` pelo UUID real.
9. [ ] `credentials.json` local apontando para a keystore (senha do cofre).
10. [ ] `eas env:create` production: `EXPO_PUBLIC_DIAGNOSTICO_URL`, `EXPO_PUBLIC_WHATSAPP_SUPORTE`
    — **sem elas a IA sobe desligada, sem erro visível.**
11. [ ] Decidir sobre `EXPO_PUBLIC_POSTHOG_KEY` (bloqueio 3).
12. [ ] `eas build -p android --profile production` → `.aab` assinado (build na nuvem; não precisa
    Android Studio). ⚠️ regra do dono: só depois do ciclo comercial estar ok.
13. [x] ~~Capturar as 8 telas e rodar `node assets/loja/montar-screenshots.js`~~ — **FEITO.**
    As 8 screenshots estão commitadas em `assets/loja/screenshots/`, conformes e conferidas
    (ver "As 8 screenshots" abaixo). **Não suba o emulador para refazer isto.** O caminho antigo
    (emulador + adb + `montar-screenshots.js`) foi substituído por `node scripts/telas/loja.mjs`,
    que não precisa de aparelho, de APK nem de login. Só rode de novo se mudar tela ou elenco.

### Fase 3 — preencher a Console (Claude cola, dono clica)
14. [ ] Criar o app: nome, idioma padrão **pt-BR**, tipo App, **gratuito**.
15. [ ] Colar a ficha de `assets/loja/FICHA.md` + subir ícone, feature graphic e screenshots.
16. [ ] **Confirmar no navegador** que `https://olliorcamentos.online/legal/privacidade/` abre
    (a Console valida que a URL resolve; daqui só deu para ver 403 de antibot).
17. [ ] **Segurança dos dados** — usar a Parte 2 de `assets/loja/CLASSIFICACAO-E-DATA-SAFETY.md`.
    **Não** usar `docs/LOJAS.md` §2.5.
18. [ ] **Classificação de conteúdo (IARC)** — Parte 3 do mesmo documento. Responder **Sim** para
    IA generativa e descrever o botão de sinalizar, que já existe no app.
19. [ ] **Acesso ao app** — fornecer credenciais de teste ao revisor (conta demo já existe).
    Esquecer isto é reprovação garantida: o revisor trava na tela de login.
20. [ ] **Público-alvo**: só faixas **18+** (evita a política Famílias).
21. [ ] **Anúncios**: "não contém anúncios".
22. [ ] Aceitar os termos do programa para desenvolvedores.

### Fase 4 — publicar
23. [ ] Se conta pessoal: teste fechado → 12 testadores → esperar os 14 dias com uso real
    (a Console mede engajamento e marca testador inativo).
24. [ ] Subir o `.aab` em teste interno e conferir no aparelho que a assistente Olli responde —
    se estiver muda, a etapa 10 foi pulada.
25. [ ] **Clique final de publicar** (só o dono).

---

## Quando o formulário de dados precisa ser REFEITO
Ver a Parte 5 de `assets/loja/CLASSIFICACAO-E-DATA-SAFETY.md`. Resumo dos gatilhos: chave do
PostHog, `expo-location`, upload de fotos para a nuvem, `expo-contacts`, Google Agenda ligado,
Sentry desligado/trocado, ou qualquer SDK de terceiro novo no `package.json`.
