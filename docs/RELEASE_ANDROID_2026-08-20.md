# Release Android canônico — 20/08/2026

Este documento registra a proveniência e as provas do release Android criado a partir do repositório oficial do OLLI. Ele não contém senhas, tokens, URLs assinadas nem dados de clientes.

## Fonte canônica

- Repositório: `gogodroidk/olli-orcamentos-2`
- Branch: `codex/central-operacional-2026-08-20`
- Commit do aplicativo: `6a9e1b0982e9516305ed3488156e7aeb4ad5cdd6`
- Pull request: `#41`
- EAS owner/projeto: `igorsouza01s-team/olli-orcamentos`
- EAS project ID: `902ca362-ea1b-4912-8345-28b5c91ec475`
- EAS build ID: `aab88475-f1da-4fa6-910f-8d0c8d9fa458`
- EAS fingerprint: `bd1efe27cac743ac6b7d3dd057f3ecd079a07c18`

O EAS é o caminho canônico de produção. A pasta nativa `android/` e artefatos locais continuam ignorados pelo Git; a configuração reproduzível está em `app.json`, `eas.json`, plugins do Expo e nas credenciais remotas do projeto EAS.

## Artefato aceito

- Aplicativo: `OLLI Orçamentos`
- Package: `online.olliorcamentos.app`
- Version name: `1.1.2`
- Version code: `15`
- Min SDK: `24`
- Target/compile SDK: `36`
- AAB: `qa-artifacts/android/OLLI-1.1.2-code15-eas-aab88475.aab` (local, ignorado pelo Git)
- Tamanho do AAB: `84.045.575` bytes
- SHA-256 do AAB: `92DD73EA36610092B74FC3723A42DE800808E05AED4F6C2E6DC0797043CA99D8`
- Conclusão do EAS: `20/08/2026 21:38:20` (America/Sao_Paulo)

## Assinatura

- Sujeito: `CN=OLLI Orcamentos, O=OLLI, L=Sao Paulo, ST=SP, C=BR`
- Algoritmo: RSA 4096 bits / SHA384withRSA
- SHA-1: `44:93:1D:96:77:A6:24:40:26:F3:87:2B:AC:71:AC:91:38:88:20:1E`
- SHA-256: `D2:D4:5A:57:1E:24:E5:06:45:BC:D8:B0:65:A1:C7:E0:1D:4A:FD:DC:94:44:13:0E:AC:A9:B7:82:C5:99:CD:CB`

As duas impressões conferem com o certificado de upload registrado no Google Play App Signing e com o APK code 10 instalado anteriormente no emulador. A atualização code 10 → code 14 preservou os dados do aplicativo; o code 15 usa o mesmo certificado de upload.

## Google Play

- App ID: `4975192353918803356`
- Faixa: teste fechado Alpha (`4698589284819391610`)
- Release: `OLLI 1.1.2 (15) - central operacional`
- Distribuição: `100%` dos testadores Alpha
- Novas instalações estimadas pela Play: `25,9 MB`
- Atualização estimada pela Play: `3,87 MB`
- Dispositivos Android compatíveis exibidos pela Play: `12.244` telefones e `6.374` tablets, sem perda de compatibilidade em relação ao code 11
- Estado em 20/08/2026: AAB aceito pela Play, release salvo em `100%` da faixa Alpha, verificações rápidas concluídas sem bloqueio e mudanças em revisão pelo Google
- Adesão web: `https://play.google.com/apps/testing/online.olliorcamentos.app`
- Ficha: `https://play.google.com/store/apps/details?id=online.olliorcamentos.app`

A conta de teste do proprietário aderiu ao programa em 20/08/2026. O painel registra `1` testador participante. Produção pública continua bloqueada pela exigência externa da Play: no mínimo 12 testadores aderidos continuamente por 14 dias e, depois, solicitação de acesso à produção. A conversão da conta de desenvolvedor de pessoa física para organização foi solicitada e depende da verificação documental do Google.

A ficha pública de teste já exibe nome, ícone, oito capturas e botão de instalação. O telefone precisa abrir o link de adesão e a ficha usando exatamente a mesma conta Google incluída na lista de testadores. O code 14 permanece disponível nessa faixa até a aprovação do code 15.

## QA executado no artefato code 15

- Build EAS de produção concluído com SDK 57, credenciais remotas e upload de source maps do Sentry habilitado.
- Manifesto inspecionado com o `bundletool` oficial 1.18.3: package `online.olliorcamentos.app`, version code 15, min SDK 24 e target/compile SDK 36.
- O manifesto não contém `READ_MEDIA_IMAGES` nem `SYSTEM_ALERT_WINDOW`.
- Assinatura JAR verificada; certificado OLLI e impressão SHA-256 conferem com o release anterior.
- A Play aceitou o AAB, calculou compatibilidade sem perda de dispositivos e estimou nova instalação em 25,9 MB.

## QA físico preservado do artefato code 14

- AAB convertido com o `bundletool` oficial 1.18.3.
- APK universal assinado com a mesma chave OLLI.
- Assinaturas APK v2 e v3 verificadas.
- Instalação de atualização por `adb install -r`: sucesso.
- Abertura fria: sucesso em `958 ms` no emulador.
- Versão instalada fisicamente: `1.1.2 (14)`, target SDK 36.
- Tela de login: abriu sem crash.
- Tela de cadastro: abriu e manteve o tema escuro.
- OAuth Google: iniciou o BrowserProxy e abriu a URL de autorização do Supabase no Chrome; o emulador parou no primeiro uso do Chrome, como esperado em uma imagem sem conta configurada.
- Log do processo: nenhuma exceção fatal do aplicativo.
- Sentry: bundle e source map do release `online.olliorcamentos.app@1.1.2+14` enviados com sucesso.
- Canário autenticado de produção: `POST /chat`, com mensagem sintética e sem dados pessoais, respondeu HTTP 200 e `OLLI-IA-OK`, comprovando Supabase Auth → Cloudflare Worker → OpenRouter sem autorizar crédito pago.

Evidências locais, ignoradas pelo Git:

- `qa-artifacts/emulator-before-eas-v13.png`
- `qa-artifacts/emulator-after-eas-code14.png`
- `qa-artifacts/emulator-code14-cadastro.png`
- `qa-artifacts/android/OLLI-1.1.2-code14-universal.apk`
- `qa-artifacts/android/OLLI-1.1.2-code15-eas-aab88475.aab`

## Incidente evitado durante a preparação

O primeiro build remoto com a chave correta (code 13) falhou somente no upload de source maps do Sentry, pois `SENTRY_AUTH_TOKEN` ainda não existia no ambiente production do EAS. O token foi cadastrado como secret não legível, validado no Sentry e o code 14 passou pela mesma etapa. O build code 12 foi cancelado antes de compilar porque o EAS tinha criado uma chave nova, incompatível com a Play; essa chave incorreta nunca foi usada e foi colocada na quarentena local de credenciais inativas.

## Rollback e limites

- O code 14 permanece como versão disponível da faixa até a liberação do code 15.
- A faixa Alpha pode ser pausada pela Play se surgir regressão.
- Não promover para produção antes de cumprir os 12 testadores/14 dias e receber o acesso correspondente da Play.
- Não usar APK/AAB antigo encontrado fora deste fluxo como fonte de release.
