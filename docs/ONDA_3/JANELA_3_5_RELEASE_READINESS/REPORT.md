# J3.5 — Auditoria local de prontidão PWA/APK

Data de corte: 2026-09-04  
Status: `DONE_LOCAL_ONLY`  
Aceite real: `false`

## Limite desta evidência

Esta janela auditou somente arquivos e comandos locais, sem abrir credenciais, consumir build EAS, assinar artefato, instalar em aparelho, enviar para loja, publicar PWA ou alterar produção. Portanto, ela prova a coerência da configuração versionada, mas não prova a existência nem a qualidade de uma release distribuível.

## Resultado executivo

| Superfície | Estado local | Evidência | O que ainda falta |
| --- | --- | --- | --- |
| Expo | pronto para validação externa | `expo config --type public` resolveu SDK 57 e as plataformas Android, iOS e web | prebuild/build limpo, execução e smoke test em dispositivo |
| Android | configuração de release presente | package `online.olliorcamentos.app`, versão local `1.1.2`, versionCode local `11`, App Bundle de produção, credenciais remotas, ProGuard/minificação ativos | confirmar versões remotas, build assinado, SHA-256, assinatura, instalação, upgrade e rollback |
| iOS | identidade declarada | bundle `online.olliorcamentos.app`, buildNumber local `1`, Apple Sign-In e privacy manifest declarados | credenciais/capabilities, build iOS, TestFlight e aceite em aparelho; não há diretório `ios/` versionado |
| PWA | **não pronta para instalação** | manifest existe, mas usa `display: \"browser\"`; não há service worker/registro de cache encontrado | escolher estratégia, usar display instalável, adicionar service worker/fallback/offline e testar instalação/atualização |
| Web Push | bloqueada por gate próprio | nenhum VAPID, `PushManager` ou service worker foi encontrado | identidade VAPID protegida, inscrição revogável e aceite em navegadores reais |
| Distribuição | **não executada** | perfil `production` gera AAB; submissão Android aponta para track `internal` | autorização da conta/custo/canal, build, validação do binário e submissão controlada |

## Configuração observada

- Nome público: `OLLI Orçamentos`.
- Expo SDK efetivo: `57.0.0`; dependência declarada no projeto: `~57.0.18`.
- Projeto EAS vinculado: identificador presente no `app.json`; owner configurado como `igorsouza01s-team`.
- Android e iOS compartilham a identidade `online.olliorcamentos.app`.
- `appVersionSource` está em `remote`: `versionCode` e `buildNumber` locais não podem ser tratados como a versão final da próxima build sem consultar o estado remoto da conta.
- Perfis `development` e `preview` produzem APK interno; `production` produz Android App Bundle.
- O perfil de submissão Android aponta para `internal`, que é o canal seguro recomendado para o primeiro aceite controlado.
- `EXPO_PUBLIC_DIAGNOSTICO_URL` existe nos três perfis e aponta para a origem HTTPS configurada; o validador confirmou ausência de nomes de segredo na configuração pública.
- Há diretório nativo `android/`; não há diretório nativo `ios/` versionado nesta cópia.

## Provas locais executadas

| Prova | Resultado |
| --- | --- |
| `npm run check:release-config` | aprovado: URL pública nos três perfis, sem segredo público e Google Agenda fail-closed |
| `npm run test:assets-app` | `16/16` aprovado; cinco PNGs do `app.json` e o JSON de códigos de erro existem e são válidos |
| `npx expo config --type public` | aprovado; configuração pública resolveu Android, iOS e web sem erro |
| busca local por service worker/Web Push | nenhum service worker, registro, Workbox, VAPID ou `PushManager` encontrado |

O aviso `MODULE_TYPELESS_PACKAGE_JSON` emitido pelo teste de assets é de desempenho de carregamento do script TypeScript e não invalidou as 16 asserções.

## Roteiro autorizado somente após gate humano

1. Registrar a autorização com conta EAS, plataforma, perfil, custo esperado, aparelho e canal de distribuição explicitamente definidos.
2. Confirmar identidade da conta em modo somente leitura e consultar as versões remotas, porque a fonte de versão é `remote`.
3. Executar o build de produção apenas na plataforma autorizada. Para Android, o perfil atual deve produzir AAB; usar APK de `preview` somente para aceite interno de instalação quando esse for o artefato aprovado.
4. Baixar o artefato pela origem oficial e registrar URL/ID do build, data, tamanho e SHA-256. Nunca guardar chave de assinatura ou sessão no repositório.
5. Validar package/bundle ID, versionName/versionCode ou buildNumber, certificado/assinatura e permissões efetivas.
6. Instalar em aparelho físico aprovado e executar: primeira abertura, autenticação, modo offline/retorno online, criação/edição de orçamento, PDF/compartilhamento, câmera, microfone, notificações negadas/aceitas e fechamento/reabertura.
7. Exercitar atualização por cima da versão anterior, preservação dos dados locais, migrações e retorno seguro em caso de falha.
8. Somente após o aceite, submeter primeiro ao canal interno/fechado explicitamente aprovado. Não promover para público automaticamente.

## Critérios de parada

Parar imediatamente se houver divergência de identidade, regressão de dados, crash de primeira abertura, versão remota inesperada, assinatura diferente, permissão não prevista, falha de autenticação, migração não reversível ou falta de artefato anterior recuperável.

## Rollback

- Manter o último artefato aceito, seu hash e a versão anterior disponíveis antes de qualquer promoção.
- Em canal interno/fechado, interromper a promoção e restaurar a versão aceita conforme as regras da loja/canal.
- Se a falha for somente de serviço, desativar a funcionalidade pelo controle operacional previsto sem alterar o binário quando isso for seguro.
- Nunca apagar evidências da build rejeitada; registrar motivo, versão, hash e decisão.
- Para PWA, preservar a versão anterior dos assets e do service worker, usar versionamento de cache e planejar limpeza compatível; um service worker quebrado exige correção publicada e não apenas rollback local.

## Gate que permanece aberto

`pwa-apk-release-distribution` continua `blocked_human`. Para fechá-lo são necessárias autorização explícita de build/distribuição, conta autenticada, eventual consumo pago, artefato assinado, hash, instalação/upgrade/rollback em aparelho e aceite do canal. A PWA exige uma implementação separada antes de ser classificada como instalável.
