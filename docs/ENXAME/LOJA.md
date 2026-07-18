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

## Identidade (confirmado)
- bundleId: `online.olliorcamentos.app` (iOS + Android iguais em app.json). Real, não placeholder.
- versionName `1.1.0`, android.versionCode `9`, ios.buildNumber `1`. Bate com STORE_LISTING.md. Sem bump pendente.
- keystore de upload já existe: `CONFIG CLAUDE/olli-keystore/olli-upload.jks` (eas.json usa `credentialsSource=local`).
- listing (nome, descrição curta 74/80, longa ~1750, release notes, categoria, faixa etária) pronto em `docs/STORE_LISTING.md`.

## Bugs que EU corrijo antes de enviar
- [ ] **URL de privacidade 404** — `docs/LOJAS.md` e `STORE_LISTING.md` apontam `olliorcamentos.online/privacidade` (dá 404). Real: `/legal/privacidade`. Corrigir a URL nos docs **ou** criar redirect `/privacidade → /legal/privacidade` (a Play Console valida que a URL resolve). → redirect é melhor (não quebra links externos).
- [ ] **Ícone da ficha 512×512** — só existe `assets/icon.png` 1024×1024; gerar cópia 512×512 PNG com alpha.

## Assets que faltam (DONO aprova)
- [ ] **Feature graphic 1024×500** — não existe. Eu gero uma proposta; dono aprova.
- [ ] **Screenshots de celular (2-8)** — roteiro pronto em STORE_LISTING.md §7; capturar via app rodando com dados demo (Onda de QC visual gera candidatos). Dono aprova visual.

## Passos [CLAUDE] (quando autorizado / EAS logado)
- [ ] Gerar `credentials.json` local apontando pra keystore (senha do cofre).
- [ ] `eas init` — trocar placeholder `extra.eas.projectId="olli-orcamentos"` pelo UUID real.
- [ ] `eas env:create` production: `EXPO_PUBLIC_DIAGNOSTICO_URL`, `EXPO_PUBLIC_WHATSAPP_SUPORTE` (sem elas a IA sobe desligada no build, sem erro visível).
- [ ] `eas build -p android --profile production` → `.aab` assinado (build na nuvem Expo; não precisa Android Studio). ⚠️ só após o ciclo comercial estar ok (regra do dono).
- [ ] Colar listing (STORE_LISTING.md) e Data Safety (LOJAS.md §2.5) nos campos da Console (via Chrome logado do dono, parando nos cliques).

## Passos [DONO] (bloqueio — ver BLOQUEIOS.md)
Abrir+pagar conta · pessoal vs organização · login EAS · e-mails de 12 testadores (se pessoal) · aprovar screenshots/feature graphic · IARC · aceitar termos · clique final publicar.

## Ordem recomendada
1. [CLAUDE] redirect privacidade + ícone 512 + feature graphic (proposta) + screenshots (candidatos da Onda QC).
2. [DONO] conta Play + decisão pessoal/organização + login EAS.
3. [CLAUDE] credentials + eas init + env + (quando dono mandar) build .aab.
4. [DONO] criar app na Console + termos + IARC.
5. [CLAUDE] preencher ficha + Data Safety no Chrome logado.
6. [DONO] subir .aab em teste interno + clique de publicar.
