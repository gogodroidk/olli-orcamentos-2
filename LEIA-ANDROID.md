# OLLI Orçamentos — Android e Google Play

Fonte operacional atual para gerar e publicar o aplicativo Android.

## Estado atual

- **Stack:** Expo SDK 57 / React Native 0.86 / React 19.2.
- **Nome:** OLLI Orçamentos.
- **Pacote:** `online.olliorcamentos.app`.
- **Versão do app:** `1.1.2`.
- **Version code local:** `11`, em `app.json`.
- **Último build EAS validado:** code `14`; o próximo build remoto deve gerar code `15` ou superior.
- **Target/compile SDK:** 36.
- **Política de privacidade:** https://olliorcamentos.online/privacidade
- **Relatório de release:** `docs/RELEASE_ANDROID_2026-08-20.md`.

O `versionCode` usado pela loja é administrado remotamente pelo EAS porque `eas.json` usa
`appVersionSource: "remote"` e `autoIncrement: true`. Por isso o code local não precisa igualar o
último code remoto.

## Caminho canônico: EAS Build

A pasta `android/` é gerada e não está versionada. O build canônico de loja usa a configuração
versionada (`app.json`, `eas.json` e plugins Expo), credencial remota e secret do Sentry:

```powershell
npm ci
npx eas-cli@latest whoami
npx eas-cli@latest build -p android --profile production --non-interactive
```

O perfil `production` produz **AAB**, usa credenciais remotas e incrementa automaticamente o code.
Antes do build, confirme que `SENTRY_AUTH_TOKEN` existe como secret sensível do ambiente production
do EAS. Nunca salve a chave da Play, keystore, senhas ou token do Sentry no Git.

Depois do build, valide o artefato exato com `bundletool`/`aapt`, assinatura e instalação em aparelho
físico antes de enviá-lo ao track interno ou fechado.

## Build local de conferência

O script abaixo valida a identidade da chave oficial e exige o upload de source maps do Sentry:

```powershell
.\scripts\build-android-production.ps1
```

Ele falha se `SENTRY_AUTH_TOKEN` estiver ausente e remove qualquer
`SENTRY_DISABLE_AUTO_UPLOAD` herdado do terminal. Portanto, o resultado não pode passar
silenciosamente sem observabilidade. Builds `debug` continuam independentes desse fluxo.

## Envio para a Play

O envio configurado em `eas.json` aponta para o track **internal**. A sequência segura é:

1. gerar o novo AAB de produção;
2. validar o APK derivado e o aparelho físico;
3. enviar ao teste interno/fechado;
4. acompanhar o relatório de pré-lançamento;
5. promover somente depois dos gates da conta e da Play.

A conta ainda está sujeita ao gate externo registrado em
`docs/RELEASE_ANDROID_2026-08-20.md`: pelo menos **12 testadores aderidos continuamente por 14 dias**
e, depois, aprovação do acesso à produção. O código e o EAS não conseguem contornar essa regra.
Enquanto ela estiver ativa, a distribuição correta é pelos tracks interno/fechado.

## Android Studio (alternativa local)

Use apenas quando precisar depurar o projeto nativo:

```powershell
npm ci
npx expo prebuild -p android --clean
```

Abra a subpasta `android/` no Android Studio. Para um artefato oficial de loja, prefira o EAS: ele
preserva a credencial remota, o versionamento e a proveniência do build.
