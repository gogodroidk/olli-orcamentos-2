# OLLI 1.3.0 (versionCode 27): notas e checklist de liberação

Estado em 19/11/2026: **testado no S20 real, pronto para gerar o AAB; nada foi enviado à Play.** Branch de integração
`claude/app-1-3-integracao` = #375 (navegação) + #387 (importar contatos) + #399 (cadeados do Grátis) + #402 (popup de
feedback) + #388 (indicação, só a parte do app, sem promessa com a recompensa desligada). O #386 é painel web e não entra.

## Por que versionCode 27 (o item pedia 26)

Faixas lidas pela Play Developer API em 18/11/2026 (edit temporário, apagado sem enviar nada):

| Faixa | Versão | versionCode |
|---|---|---|
| produção | 1.2.0 | 24 (100%) |
| teste fechado (alpha) | 1.2.0 | 24 |
| teste interno | 1.2.2 | **26** |

O maior versionCode já enviado é o 26. A Play recusa número repetido, então a 1.3.0 sai como **27**.
O `app.json` da main ainda diz 25 porque a 1.2.2 saiu pelo EAS, que tem contador remoto próprio
(`appVersionSource: "remote"`). No build local o número vem do `app.json`.

## O que há de novo (texto da Play, pt-BR, até 500 caracteres)

Quem está na produção vem da 1.2.0. A 1.2.2 só foi para o teste interno, então as novidades dela entram aqui.

```
- Menu novo: Início, Orçamentos, botão +, Agenda e Mais
- O Início mostra o seu dia: visitas e o que fazer hoje
- Orçamentos com filtros: Com o cliente, Aprovados e Rascunhos
- Puxe nome e telefone do cliente dos contatos do celular
- No Pro: traga vários contatos do celular de uma vez
- Recibos, agenda e ordem de serviço passam a ser do Pro; o que você já criou segue visível
- Funciona melhor com letra grande e leitor de tela
- Se uma tela falhar, aparece "Tentar de novo" e o app não fecha
```

Origem de cada linha:
- menu, Início com o dia, filtros: PR #375 (`ui_v2_nav`);
- erro no campo, fonte mínima 13 e acessibilidade: commit 85da8300;
- OS editável, assistente e diagnóstico: release 1.2.2 (d888185f);
- "Tentar de novo": ErrorBoundary por tela (52405c31);
- contatos do celular (1 por vez e em lote): PR #387 e correção do S20 (o seletor pede a permissão depois da escolha);
- recibos, agenda e OS no Pro: PR #399 (D-2267), com os nomes curtos de `planosBase.ts`; registrar pagamento segue Grátis.

O Pix não aparece porque o app da Play não mostra Pix.

## Antes de gerar o AAB

1. **Ligar a navegação nova no build.** No build local, coloque `EXPO_PUBLIC_UI_V2_NAV=1` no `.env.local`.
   Sem isso, a 1.3 sai com as abas antigas. O build local não lê o `env` do `eas.json`.
2. **Deixar `EXPO_PUBLIC_SENTRY_ENV` vazio.** Se tiver qualquer valor, as sessões não contam como
   `production`, e a regra de parada abaixo fica cega.
3. **Publicar o Worker com o campo `ui_v2_nav` em `/app/versao-minima`.** Isso vem do CQ-APP-13-B e quem
   faz é o Igor ou o Maestro. Sem o Worker publicado, a chave para desligar a navegação nova não existe.
4. Gerar com `scripts/build-android-production.ps1`, ou com o equivalente no Linux usando a chave de upload,
   e seguir "Verificar o artefato" em `LEIA-ANDROID.md`: versionCode 27, versionName 1.3.0, targetSdk 36,
   sem permissão proibida, SHA-1 da chave de upload e 16 KB.
5. Confirmar que `bash scripts/ci-local.sh` está verde no commit exato do build.
6. **Forçar o bundle JS novo.** O Gradle NÃO trata `EXPO_PUBLIC_*` como entrada da tarefa
   `createBundleReleaseJsAndAssets`: se já houve um build antes, ela fica `UP-TO-DATE` e o AAB sai com o JS antigo
   (provado no S20 em 19/11: o build com `EXPO_PUBLIC_UI_V2_NAV=0` saiu com a navegação nova). Antes do build final:
   `rm -rf android/app/build/generated/assets/createBundleReleaseJsAndAssets android/app/build/generated/res/createBundleReleaseJsAndAssets`
   e confira no log que a tarefa rodou (sem `UP-TO-DATE`).
7. **`EXPO_PUBLIC_RASTREIO_TELAS` fica sem valor** (desligado): a política de privacidade precisa de 7 dias de aviso antes de ligar.
8. **Sem `.e2e` no applicationId e sem a data de tranca de teste.** O APK de teste usou `online.olliorcamentos.app.e2e`
   (mudança só na pasta `android/` gerada, que não vai para o git) e `TRANCA_GRATIS_D2267` adiantada só na máquina.
   O build da loja sai de um `expo prebuild --clean` novo.

## Liberação gradual (só na faixa de produção)

Antes de começar:
- [ ] Mandar o AAB para o **teste interno**. Instalar pela Play no S20 e passar o fluxo principal: cadastro de
      cliente → orçamento → compartilhar, mais Agenda e Orçamentos, com fonte do sistema em 130%.
- [ ] Ver o Sentry: release `1.3.0 (27)` sem issue nova `fatal` e o monitor 10988883 sem alerta.

Etapas (Play Console → Produção → Criar versão → "Lançamento gradual"):

| Etapa | Fração | Tempo mínimo | Passa para a próxima se |
|---|---|---|---|
| 1 | 10% | 48 h | crash-free ≥ 99,9%, nenhum ANR novo no vitals, nenhuma issue `fatal` nova no Sentry |
| 2 | 50% | 48 h | mesmos critérios |
| 3 | 100% | n/a | n/a |

**Parar** ("Interromper lançamento" na Play Console) se acontecer qualquer um destes:
- crash-free das sessões da 1.3.0 abaixo de **99,9%** (Sentry → Releases → 1.3.0, ou o alerta do monitor 10988883);
- taxa de travamento do Android vitals acima de 0,1% na versão 27;
- qualquer ANR novo no vitals;
- reclamação de app fechando sozinho.

Para desligar só a navegação nova, sem parar a liberação: `APP_UI_V2_NAV=0` no Worker. O app pega a mudança na próxima abertura.

**Atenção ao volume:** o vitals mostra cerca de 10 usuários por dia (Play Reporting API, 20/10 a 16/11/2026).
Com 10%, isso dá cerca de 1 pessoa, e um único travamento já derruba a taxa para menos de 99,9%. Nessa
escala a regra prática é: **um crash fatal real na 1.3.0 = parar e investigar**. A porcentagem só passa a
ter peso estatístico a partir de cerca de 1.000 sessões.

## Desfazer

A Play não volta versão. Se a 1.3.0 der problema, interrompa o lançamento gradual (quem ainda não atualizou
fica na 1.2.0) e suba uma 1.3.1 com versionCode 28.
