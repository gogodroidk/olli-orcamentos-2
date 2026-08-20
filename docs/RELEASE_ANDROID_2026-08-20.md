# Release Android canônico — 20/08/2026

Este documento registra a proveniência e as provas do release Android criado a partir do repositório oficial do OLLI. Ele não contém senhas, tokens, URLs assinadas nem dados de clientes.

## Fonte canônica

- Repositório: `gogodroidk/olli-orcamentos-2`
- Branch: `codex/producao-completa-2026-08-20`
- Commit do aplicativo: `f5e2865740b0ff397625fbaecf04c8c5996edaec`
- Pull request: `#40`
- EAS owner/projeto: `igorsouza01s-team/olli-orcamentos`
- EAS project ID: `902ca362-ea1b-4912-8345-28b5c91ec475`
- EAS build ID: `87fdb7b9-c4ea-4597-8e08-9b19e2a34005`
- EAS fingerprint: `c9fadef72267a875745f13d580228a7edeeca93d`

O EAS é o caminho canônico de produção. A pasta nativa `android/` e artefatos locais continuam ignorados pelo Git; a configuração reproduzível está em `app.json`, `eas.json`, plugins do Expo e nas credenciais remotas do projeto EAS.

## Artefato aceito

- Aplicativo: `OLLI Orçamentos`
- Package: `online.olliorcamentos.app`
- Version name: `1.1.2`
- Version code: `14`
- Min SDK: `24`
- Target/compile SDK: `36`
- AAB: `qa-artifacts/android/OLLI-1.1.2-code14-eas-87fdb7b9.aab` (local, ignorado pelo Git)
- Tamanho do AAB: `84.044.770` bytes
- SHA-256 do AAB: `34CC2BAFC8F53F6623FB9DB944791E338796A6E61FB14086A20481116840CCD5`
- Conclusão do EAS: `2026-08-20T18:26:32.616Z`

## Assinatura

- Sujeito: `CN=OLLI Orcamentos, O=OLLI, L=Sao Paulo, ST=SP, C=BR`
- Algoritmo: RSA 4096 bits / SHA384withRSA
- SHA-1: `44:93:1D:96:77:A6:24:40:26:F3:87:2B:AC:71:AC:91:38:88:20:1E`
- SHA-256: `D2:D4:5A:57:1E:24:E5:06:45:BC:D8:B0:65:A1:C7:E0:1D:4A:FD:DC:94:44:13:0E:AC:A9:B7:82:C5:99:CD:CB`

As duas impressões conferem com o certificado de upload registrado no Google Play App Signing e com o APK code 10 instalado anteriormente no emulador. A atualização code 10 → code 14 preservou os dados do aplicativo.

## Google Play

- App ID: `4975192353918803356`
- Faixa: teste fechado Alpha (`4698589284819391610`)
- Release: `OLLI 1.1.2 (14) - teste fechado`
- Distribuição: `100%` dos testadores Alpha
- Novas instalações estimadas pela Play: `25,9 MB`
- Atualização estimada pela Play: `7,59 MB`
- Dispositivos Android compatíveis exibidos pela Play: `12.244` telefones e `6.374` tablets, sem perda de compatibilidade em relação ao code 11
- Estado em 20/08/2026: verificações rápidas concluídas sem bloqueio; release em análise pela Google na faixa fechada
- Adesão web: `https://play.google.com/apps/testing/online.olliorcamentos.app`
- Ficha: `https://play.google.com/store/apps/details?id=online.olliorcamentos.app`

A conta de teste do proprietário aderiu ao programa em 20/08/2026. Produção pública continua bloqueada pela exigência externa da Play para contas pessoais novas: no mínimo 12 testadores aderidos continuamente por 14 dias e, depois, solicitação de acesso à produção.

A ficha pública de teste já exibe nome, ícone e botão de instalação. Na instalação remota pelo navegador, a conta Google atual informou `No eligible devices for app install`; portanto o telefone precisa abrir o link de adesão e a ficha usando exatamente a mesma conta Google incluída na lista de testadores. O code 11 permanece disponível nessa faixa até a aprovação automática do code 14.

## QA executado no artefato exato

- AAB convertido com o `bundletool` oficial 1.18.3.
- APK universal assinado com a mesma chave OLLI.
- Assinaturas APK v2 e v3 verificadas.
- Instalação de atualização por `adb install -r`: sucesso.
- Abertura fria: sucesso em `958 ms` no emulador.
- Versão instalada: `1.1.2 (14)`, target SDK 36.
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

## Incidente evitado durante a preparação

O primeiro build remoto com a chave correta (code 13) falhou somente no upload de source maps do Sentry, pois `SENTRY_AUTH_TOKEN` ainda não existia no ambiente production do EAS. O token foi cadastrado como secret não legível, validado no Sentry e o code 14 passou pela mesma etapa. O build code 12 foi cancelado antes de compilar porque o EAS tinha criado uma chave nova, incompatível com a Play; essa chave incorreta nunca foi usada e foi colocada na quarentena local de credenciais inativas.

## Rollback e limites

- O code 11 permanece como versão anterior da faixa até a liberação do code 14.
- A faixa Alpha pode ser pausada pela Play se surgir regressão.
- Não promover para produção antes de cumprir os 12 testadores/14 dias e receber o acesso correspondente da Play.
- Não usar APK/AAB antigo encontrado fora deste fluxo como fonte de release.
