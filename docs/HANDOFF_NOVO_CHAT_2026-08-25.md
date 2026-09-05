# OLLI Orçamentos — handoff canônico para novo chat

Atualizado em: **25/08/2026 — America/Sao_Paulo**  
Repositório canônico: **`C:\OLLI_REL`**  
Branch/commit verificados: **`main` / `df63a25f25a57b9644995bf3adc63c098d0b3cb7`**  
Estado Git antes deste handoff: **limpo e sincronizado com `origin/main`**  
Estado geral: **produto amplo e parcialmente publicado, mas ainda não 100% funcional**.

Este documento é a fonte de continuidade para um novo chat. Ele separa:

- o que está construído e verificado;
- o que foi corrigido nas entregas anteriores;
- o que foi apenas diagnosticado;
- o que continua quebrado ou sem validação;
- a sequência recomendada para concluir o produto;
- os limites externos da Play Store.

Não contém senhas, tokens, cookies, dados de clientes nem valores de segredos.

## 1. Prompt curto para iniciar o próximo chat

Copiar e enviar:

> Leia primeiro `C:\OLLI_REL\docs\HANDOFF_NOVO_CHAT_2026-08-25.md` e o `C:\OLLI_REL\AGENTS.md`. O repositório canônico é `C:\OLLI_REL`; não trabalhe na cópia antiga do Desktop. Revalide Git, EAS, Cloudflare, Supabase e Play antes de afirmar estado atual. Continue pela seção “Ordem de execução”. Prioridade: IA Android, logo/foto persistentes, créditos mobile, OAuth Google, segurança, build código 16, teste em aparelho real e Play. Preserve mudanças existentes, não exponha segredos e use Browser Use/DOM/CDP em vez de clicar por screenshots.

## 2. Decisões e preferências do usuário

- Idioma: português, didático, direto e com evidência.
- Produto: **OLLI Orçamentos**. Evitar variações como “OLHorçamentos”, “Ollie” ou “Olha”.
- Domínio: `https://olliorcamentos.online`.
- Painel: `https://app.olliorcamentos.online`.
- Worker: `https://diagnostico.olliorcamentos.online`.
- Android package: `online.olliorcamentos.app`.
- IA de texto: **OpenRouter**, preferindo modelos gratuitos ou baratos. Não usar API direta da OpenAI como provedor principal.
- Voz/transcrição: binding do Cloudflare Workers AI, conforme arquitetura atual.
- Navegador: Browser Use por CDP, DOM e Accessibility. Screenshot só quando a avaliação for visual.
- Não criar loops de abas “WebApp Status” nem abrir páginas repetidamente.
- Economizar tokens: consulta estruturada, automação por código, reuso de evidência e poucos agentes.
- O usuário quer web, Android, Cloudflare, Supabase, administração e Play funcionando em conjunto.
- O usuário quer Play como empresa usando CNPJ, mas a conta verificada por último continuava pessoal.
- Futuro: ideias de ecossistema permanecem guardadas e não entram automaticamente no escopo de estabilização.
- Nunca copiar perfil, cookies, senhas ou sessões do Chrome para GitHub ou para o repositório Browser Use. O Browser Use deve anexar localmente ao Chrome por CDP.
- Produção, cobranças reais, DNS e publicação pública exigem verificação e rollback. Teste de pagamentos somente em sandbox.

## 3. Pastas e fonte de verdade

### Repositório correto

`C:\OLLI_REL`

- Git ativo.
- `main...origin/main` limpo em 25/08/2026 antes da criação deste documento.
- Commit: `df63a25` — `feat: central de dados, assistente IA e operação web (#41)`.
- SDK atual: Expo SDK 57.
- Ler `C:\OLLI_REL\AGENTS.md` antes de editar.

### Hub do Google Drive

`C:\Users\ADMIN\Desktop\OLLI ORCAMENTOS`

- É o hub sincronizado pelo Google Drive, não a fonte canônica da release atual.
- Não mover, renomear ou apagar a raiz.
- Há material histórico, design e outras cópias dentro dela.

### Cópia antiga que causa confusão

`C:\Users\ADMIN\Desktop\OLLI ORCAMENTOS\olli-orcamentos`

- Snapshot antigo.
- Pode fazer o Android Studio abrir UI, cores e recursos antigos.
- Não construir nova release a partir dela.
- Não apagar sem inventário; marcar/arquivar de forma reversível em tarefa própria.

## 4. Estado executivo

| Área | Estado em 25/08/2026 | Observação |
|---|---|---|
| Git canônico | OK | `main` limpa e sincronizada em `df63a25` antes deste handoff |
| Site público | OK | Vivo na última validação |
| Autoentrada com sessão ativa | OK | Raiz redirecionou para o painel autenticado |
| Landing sem endereço residencial | OK | Rodapé publica razão social/CNPJ/canais, não endereço residencial |
| Link de administração na landing | OK | `/admin/` direciona ao painel protegido do Worker |
| Painel web | OK/parcial | Módulos principais e Central de dados disponíveis |
| Cloudflare Worker | OK | Health de 25/08: `ia:on`, `provedor:openrouter`, `voz:on` |
| Supabase | OK/revisão | Projeto saudável, migrações atuais e RLS; alertas a revisar |
| IA web | OK/parcial | Backend saudável e UI disponível; fallback de modelos reduzido |
| IA Android | QUEBRADO | URL do Worker ausente no ambiente EAS de produção |
| Logo da empresa | QUEBRADO | URI temporária local; não persiste nem sincroniza corretamente |
| Foto de perfil | PARCIAL | URI local não é portátil entre aparelhos/web |
| Importação/exportação | PARCIAL | CSV/XLSX/JSON básicos funcionam; PDF/WhatsApp/OCR não |
| Google Agenda Android | NÃO CONFIGURADO | Client ID OAuth Android ausente no EAS production |
| Equipe/OS/equipamentos/PMOC | IMPLEMENTADO/parcial | Falta E2E multissessão/aparelho |
| Painel administrativo | IMPLEMENTADO/parcial | Infra/migrações existem; ações privilegiadas não foram testadas ao vivo |
| Android `1.1.2 (15)` | TESTE FECHADO | Build aceito na Play, mas IA saiu sem configuração |
| Play pública | NÃO | Última validação: conta pessoal, 1/12 testadores e exigência de 14 dias |
| Testes automatizados | MAIORIA OK | `expo-doctor` ainda aponta 10 patches Expo divergentes |
| Teste físico do código 15 | NÃO PROVADO | Teste físico preservado era do código 14; nenhum ADB em 25/08 |
| Documentação | DESATUALIZADA | Vários documentos ainda descrevem estado antigo |

## 5. Entregas e correções já presentes

### GitHub/release

- PR `#40`: administração, sincronização, release e tema.
- PR `#41`: Central de dados, Assistente IA e operação web.
- `main` atual: `df63a25`.
- CI associada à release anterior ficou verde.
- Git está sincronizado; não há divergência conhecida entre `main` local e remoto.

### Android/Play

- Versão: `1.1.2`.
- Version code: `15`.
- AAB preservado em `C:\OLLI_REL\qa-artifacts\android\OLLI-1.1.2-code15-eas-aab88475.aab`.
- Documento: `C:\OLLI_REL\docs\RELEASE_ANDROID_2026-08-20.md`.
- Play aceitou a release no teste fechado.
- Ícone da loja estava presente na última validação.
- Oito screenshots estavam presentes.
- A página de opt-in de testador carregava para conta elegível.
- O download de aproximadamente 20–26 MB é normal: a Play entrega APKs divididos por aparelho. O AAB completo tem cerca de 84 MB.

### Web/landing

- Site e painel vivos na última validação.
- Usuário autenticado na raiz entra no painel sem repetir login.
- Landing não publica endereço residencial.
- WhatsApp de contato permanece.
- Rodapé contém “Área administrativa”.
- Rota `/admin/` leva ao Worker administrativo protegido.

### Produto operacional

Implementado no código atual:

- autenticação;
- empresa/meu negócio;
- clientes;
- produtos;
- serviços;
- orçamentos em etapas;
- PDF e compartilhamento;
- link público e aprovação;
- recibos;
- ordens de serviço;
- agenda;
- equipe, organizações, membros e convites;
- equipamentos e QR Code;
- PMOC, contratos e versões;
- dashboard/radar;
- SQLite offline;
- sincronização Supabase;
- exclusões/tombstones;
- planos/assinaturas;
- créditos e cotas de IA no backend;
- diagnóstico HVAC;
- painel administrativo e log administrativo.

### Central de dados

Já funciona no painel web:

- importar clientes por CSV/XLSX;
- importar produtos por CSV/XLSX;
- importar serviços por CSV/XLSX;
- importar orçamento do próprio OLLI por JSON;
- atualizar custo de fornecedor por CSV/XLSX;
- prévia e mapeamento de colunas;
- exportar clientes, produtos, serviços, equipamentos, recibos, agenda e OS;
- exportar orçamentos em JSON;
- exportar pacote operacional completo em JSON.

Não altera automaticamente orçamentos já emitidos ao atualizar custo, comportamento correto.

### Cloudflare/OpenRouter

Health confirmado em 25/08/2026:

```json
{"ok":true,"service":"olli-diagnostico","ia":"on","provedor":"openrouter","voz":"on"}
```

- Secret `OPENROUTER_API_KEY` existe no Worker; valor nunca foi lido ou registrado.
- A chave permanece no servidor, não no APK.
- OpenRouter é o provedor de texto.
- Workers AI atende voz/transcrição.

### Supabase

- Projeto `OLLI ORCAMENTOS`: `ACTIVE_HEALTHY` na última consulta.
- PostgreSQL 17.
- 21 migrações aplicadas até as migrações administrativas de 20/08.
- RLS habilitado em todas as tabelas públicas listadas.
- Estruturas presentes para assinaturas, IA, webhooks, organizações, equipe, PMOC, equipamentos, administradores e auditoria.

## 6. Problemas diagnosticados e ainda NÃO corrigidos

### P0 — IA do Android desligada no build

Evidência:

- `C:\OLLI_REL\src\config.ts:47`: `DIAGNOSTICO_URL` vira vazio sem `EXPO_PUBLIC_DIAGNOSTICO_URL`.
- `C:\OLLI_REL\src\services\olliAssistente.ts:391`: encerra antes da rede quando a URL está vazia.
- EAS `production` consultado em 25/08 contém somente `SENTRY_AUTH_TOKEN`.
- Não contém `EXPO_PUBLIC_DIAGNOSTICO_URL`.
- Não contém `EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID`.

Correção necessária:

```text
EXPO_PUBLIC_DIAGNOSTICO_URL=https://diagnostico.olliorcamentos.online
```

- Cadastrar no EAS production.
- Cadastrar o client ID OAuth Android correto para Google Agenda.
- Criar release gate que falhe se variáveis públicas obrigatórias estiverem vazias ou não HTTPS.
- Gerar novo build; o APK atual não muda remotamente.

### P0/P1 — logo da empresa temporária

Evidência:

- `C:\OLLI_REL\src\screens\MeuNegocioScreen.tsx:199-201` usa `launchImageLibraryAsync` e salva `r.assets[0].uri`.
- `C:\OLLI_REL\src\screens\OnboardingScreen.tsx:450-452` repete o padrão.
- Não existe upload da logo para Supabase Storage.
- `cloudSync` sincroniza o texto `file://`, não os bytes.
- Web reconhece que “logo salvo no celular” não pode ser exibido no navegador.
- Imagem sem `onError` pode ficar branca sem explicação.

Correção completa:

1. validar cancelamento, permissões, MIME e tamanho;
2. corrigir orientação e comprimir;
3. copiar para armazenamento local persistente;
4. criar bucket privado e políticas por tenant/usuário;
5. enviar imagem ao Supabase Storage;
6. salvar object key/version no banco, não URI local;
7. gerar URL assinada/cacheada;
8. sincronizar mobile, web e PDF;
9. oferecer substituir/remover/reparar;
10. criar testes de reinício, cache, outro aparelho, web e PDF.

### P1 — foto de perfil não portátil

- Metadata recebe URI local.
- Outro aparelho/web não acessa o arquivo.
- Usar o mesmo pipeline privado da logo, separado por usuário.

### P1 — crédito de IA não confirmado no chat mobile

- Web possui confirmação “Usar 1 crédito”.
- Voz possui fluxo equivalente.
- `OlliChatScreen` envia sem `confirmarCredito`/`creditoRef` e mostra somente retry.
- Depois da franquia, repetir não autoriza crédito.

Implementar resposta tipada, modal explícito, saldo, idempotência e retry seguro.

### P1 — cota local pode divergir do servidor

- Android bloqueia pela estimativa em AsyncStorage antes de consultar Worker.
- Servidor/Supabase deve ser a autoridade final.
- Contador local pode ser apenas informativo.

### P1 — modelos OpenRouter desatualizados

Snapshot da auditoria de 24/08:

| Modelo configurado | Situação naquele dia |
|---|---|
| `google/gemma-4-26b-a4b-it:free` | Presente |
| `google/gemma-4-31b-it:free` | Presente |
| `openai/gpt-oss-20b:free` | Não encontrado |
| `nvidia/nemotron-nano-9b-v2:free` | Não encontrado |

Revalidar a API pública do OpenRouter no novo chat porque modelos gratuitos mudam. Trocar IDs mortos, testar português e `response_format`, manter fallback explícito.

### P1 — Google Agenda Android

- `C:\OLLI_REL\src\config.ts:77` lê `EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID`.
- Variável ausente no EAS production em 25/08.
- Validar package, SHA-1/SHA-256 da chave Play, consent screen, callback, criação/edição/exclusão e deduplicação de eventos.

### P1 — numeração concorrente/offline

- Migration ainda pendente: `C:\OLLI_REL\supabase\migrations\20260727_numero_unico_por_tenant.sql.pendente`.
- Dois aparelhos offline podem colidir no número do documento.
- Exige decisão de produto, migration versionada e teste de concorrência.

### P1 — segurança de funções privilegiadas

Supabase Advisor apontou sete funções `SECURITY DEFINER` executáveis por `authenticated`:

- `aceitar_convite`;
- `criar_organizacao`;
- `donos_visiveis`;
- `eh_admin_org`;
- `eh_gestao`;
- `eh_membro_ativo`;
- `perfil_visivel`.

Não é prova automática de vulnerabilidade. Revisar `search_path`, autorização interna, tenant, grants e testes adversariais. Revogar `EXECUTE` quando não for intencional.

### P1 — administração e pagamentos sem E2E real

Infraestrutura presente, mas ainda não provado em produção:

- buscar usuário/empresa;
- ativar Premium manualmente;
- definir expiração;
- remover override;
- consultar assinatura/pagamento;
- Stripe e Mercado Pago;
- cancelar assinatura;
- alterar e-mail/iniciar reset de senha;
- adicionar/remover administradores;
- MFA para ações críticas;
- log imutável;
- impedir remoção do último superadmin.

Validar cobranças somente em sandbox. Não criar cobrança real em teste.

### P1/P2 — importação inteligente ainda incompleta

Não implementado:

- `.xls` legado;
- tabela de fornecedor em PDF;
- OCR de imagem/PDF escaneado;
- `.txt`/`.zip` exportado manualmente pelo WhatsApp;
- áudio do WhatsApp;
- criação assistida de cliente/orçamento a partir de conversa;
- staging completo por lote;
- evidência por campo;
- deduplicação explicável avançada;
- rollback/desfazer lote;
- histórico de importações;
- exportação ZIP pública documentada.

Arquivo de pesquisa: `C:\OLLI_REL\docs\PESQUISA_IMPORTACAO_INTELIGENTE.md`.
Aviso: a seção “estado atual” desse documento é anterior à PR `#41`; CSV/XLSX/JSON básicos já foram implementados depois. Preservar a arquitetura de staging/revisão, mas reauditar a matriz.

### P2 — dependências Expo

`npx expo-doctor` em 24/08: 20/21 checks; falha por 10 patches esperados:

- `@expo/metro-runtime`;
- `expo`;
- `expo-asset`;
- `expo-crypto`;
- `expo-image-manipulator`;
- `expo-image-picker`;
- `expo-notifications`;
- `expo-sharing`;
- `expo-splash-screen`;
- `expo-build-properties`.

Atualizar pelas versões exatas recomendadas para SDK 57, depois repetir testes/build.

### P2 — PDF da logo

- `C:\OLLI_REL\src\utils\imagemDataUri.ts:82-96` marca arquivo nativo como JPEG mesmo quando PNG/WebP.
- Limite de 8 MB e timeout de 5 s podem remover a logo silenciosamente.
- Corrigir MIME, compressão, fallback e mensagem.

### P2 — interface/tema

- Gate automático de contraste passou nos dois modos, pior caso 4,50:1.
- Aproximadamente 123 ocorrências diretas de `#fff` permanecem.
- Usuário considera algumas telas brancas/inconsistentes.
- Fazer revisão visual tela a tela depois de estabilizar dados/IA, usando `ux-gate` e aparelho real.

### P2 — web performance

Build web passa, mas há chunks grandes e warnings de importação dinâmica/estática:

- chunk principal perto de 948 kB sem gzip;
- charts perto de 577 kB;
- Sentry perto de 459 kB.

Aplicar lazy-loading/code splitting depois dos bloqueadores funcionais.

### P2 — documentação divergente

Documentos com estado antigo:

- `C:\OLLI_REL\docs\FEATURE_MATRIX.md`;
- `C:\OLLI_REL\docs\ENTREGA.md`;
- `C:\OLLI_REL\docs\AUDITORIA_ABA_POR_ABA.md`;
- parte de `C:\OLLI_REL\docs\PESQUISA_IMPORTACAO_INTELIGENTE.md`.

Este handoff vence esses documentos quando houver conflito de status datado. Revalidar fatos externos.

## 7. Play Store e publicação

Última validação completa pelo Browser Use: **24/08/2026**.

- Conta do desenvolvedor: pessoal.
- Canal: teste fechado.
- Versão ativa: `OLLI 1.1.2 (15)`.
- Um país/região.
- Ícone e oito screenshots carregando.
- Um testador participante.
- Console exigia pelo menos 12 testadores e 14 dias antes da solicitação de produção.
- Aplicativo não estava público para todos.

Tentativa de atualizar o Console em 25/08:

- Browser Use pediu “Allow remote debugging”.
- Não repetir conexão em loop.
- Usuário deve clicar Allow uma vez quando o novo chat precisar do Console.
- Contagem de testadores de 24/08 pode ter mudado; revalidar.

Conversão para conta de organização:

- Desejada pelo usuário usando CNPJ.
- Não estava concluída na última validação; Console ainda mostrava conta pessoal.
- Não prometer liberação imediata. Seguir os requisitos exibidos pelo próprio Console após a conversão.

## 8. Testes e evidências reutilizáveis

Reutilizar somente se o commit continuar `df63a25` e arquivos relevantes não mudarem.

- `npm test`: aprovado; suite final observada com 81 sucessos e 0 falhas.
- `npm run typecheck`: aprovado.
- `worker\npm run check`: aprovado; Wrangler dry-run OK.
- `npm run check:contraste`: aprovado em 252 arquivos.
- `webapp\npm run test:importacao`: aprovado.
- `webapp\npm run build`: aprovado com warnings/chunks grandes.
- IA provider: 56/56.
- Cotas: 47/47.
- Créditos fim a fim: 58/58.
- `npx expo-doctor`: falhou 1/21 por patch drift.
- ADB em 25/08: nenhum dispositivo.
- Worker health em 25/08: OK.

Limites:

- Testes mockados não detectam variável ausente no AAB.
- Código 15 teve build, assinatura, manifesto e aceite Play verificados.
- Validação física preservada era do código 14, não do 15.
- Não afirmar “funciona no celular” antes de instalar a próxima build em aparelho real.

## 9. Ordem de execução recomendada

### Fase 0 — preflight

1. Abrir `C:\OLLI_REL`.
2. Ler `AGENTS.md` e este handoff.
3. Rodar `git status --short --branch` e preservar mudanças do usuário.
4. Confirmar `main`/`origin/main` e fetch.
5. Revalidar EAS env, Worker, Supabase Advisors, modelos OpenRouter e Play.
6. Não usar a cópia antiga do Desktop.

### Fase 1 — bloqueadores de código/configuração

1. Adicionar `EXPO_PUBLIC_DIAGNOSTICO_URL` ao EAS production.
2. Configurar `EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID`.
3. Criar validação de ambiente de release.
4. Implementar pipeline persistente de logo/avatar + Supabase Storage privado.
5. Corrigir logo em PDF/MIME/timeout.
6. Implementar confirmação de crédito mobile.
7. Fazer Worker/Supabase autoridade da cota.
8. Unificar códigos de erro IA mobile/web.
9. Trocar modelos OpenRouter removidos.
10. Atualizar patches Expo compatíveis.

### Fase 2 — banco/segurança

1. Criar/aplicar migrations de Storage e políticas fail-closed.
2. Revisar sete funções `SECURITY DEFINER`.
3. Resolver numeração única por tenant.
4. Reexecutar Supabase Security e Performance Advisors.
5. Não alterar produção por SQL manual sem migration e rollback.

### Fase 3 — testes locais e integração

1. Typecheck e testes unitários.
2. Testes Worker/IA/cota/crédito.
3. Testes web/importação/build.
4. `expo-doctor` 21/21.
5. Testes de logo: cancelar, negar, PNG/JPEG/WebP, grande, reinício, cache, web, outro usuário e PDF.
6. Testes de IA: login, chat, voz, transcrição, cota, crédito, retry, 401, 429 e 5xx.
7. Testes de equipe com duas contas.
8. Testes de sincronização e colisão.
9. Pagamento apenas sandbox.

### Fase 4 — build e aparelho real

1. Gerar APK interno de versão nova, provável `versionCode 16`.
2. Conferir package, versionCode, permissões e assinatura.
3. Instalar em aparelho real.
4. Testar onboarding, login, logo, orçamento, PDF, agenda, equipe, IA, voz, importação e planos.
5. Fechar/reabrir, reiniciar, trocar rede e testar offline/online.
6. Somente após aprovação física gerar/submeter AAB de loja.

### Fase 5 — web/Worker/admin

1. Deploy somente dos componentes realmente alterados.
2. Smoke test público e autenticado.
3. Validar autoentrada.
4. Validar admin com conta de teste/MFA.
5. Validar Premium e pagamento sandbox.
6. Conferir logs sem PII/segredos.

### Fase 6 — Play

1. Subir código 16 no teste fechado.
2. Instalar pela própria Play com conta de testador.
3. Repetir smoke test no artefato entregue pela Play.
4. Conferir ícone, screenshots, política e notas.
5. Completar requisitos de testadores/dias exibidos no Console.
6. Solicitar produção.
7. Não declarar publicação pública antes de o Console mostrar produção disponível.

### Fase 7 — produto expandido

Depois da estabilização:

1. importação `.xls`/PDF textual;
2. staging, evidência, histórico e rollback;
3. WhatsApp `.txt`/`.zip` manual;
4. Caixa de Decisões e Radar de follow-up;
5. OCR isolado;
6. WhatsApp Business API oficial;
7. otimização web e revisão visual completa.

## 10. Definição de “100% funcional”

Não encerrar enquanto faltar um item obrigatório:

- [ ] Git limpo, revisado e sincronizado.
- [ ] EAS production com variáveis obrigatórias.
- [ ] Worker/OpenRouter saudável.
- [ ] IA Android responde em aparelho real.
- [ ] Voz/transcrição funcionam em aparelho real.
- [ ] Cota e crédito não duplicam cobrança.
- [ ] Logo persiste após reinício/limpeza de cache.
- [ ] Logo aparece em outro aparelho e no painel web.
- [ ] Logo aparece corretamente em PDF.
- [ ] Google Agenda conecta, sincroniza e não duplica.
- [ ] Convite e permissões de equipe validados com duas contas.
- [ ] Importação/exportação básica passa round-trip.
- [ ] Admin Premium/usuário/pagamento passa em sandbox.
- [ ] Supabase Advisors críticos resolvidos ou justificados.
- [ ] `expo-doctor` verde.
- [ ] Testes/builds verdes.
- [ ] APK interno aprovado fisicamente.
- [ ] AAB de loja instalado pela Play e retestado.
- [ ] Play mostra produção pública antes de anunciar disponibilidade geral.
- [ ] Documentação atualizada para a release final.

## 11. Comandos de revalidação úteis

Executar em `C:\OLLI_REL` e evitar imprimir segredos:

```powershell
git status --short --branch
git log -1 --format='%H%n%ci%n%s'
npx eas-cli env:list --environment production --format long
Invoke-RestMethod https://diagnostico.olliorcamentos.online/
npm test
npm run typecheck
npm run check:contraste
npx expo-doctor
& 'C:\Users\ADMIN\AppData\Local\Android\Sdk\platform-tools\adb.exe' devices -l
```

Subprojetos:

```powershell
Set-Location C:\OLLI_REL\worker
npm run check

Set-Location C:\OLLI_REL\webapp
npm run test:importacao
npm run build
```

Notas:

- `eas env:list` atual não aceita `--non-interactive`.
- Listar nomes de variáveis; não imprimir valores secretos.
- Se Browser Use informar daemon duplicado, `browser-use --reload` uma vez.
- Se Chrome pedir “Allow remote debugging”, aguardar o usuário clicar Allow; não criar loop.

## 12. Arquivos prioritários

IA/configuração:

- `C:\OLLI_REL\src\config.ts`
- `C:\OLLI_REL\src\services\olliAssistente.ts`
- `C:\OLLI_REL\src\screens\OlliChatScreen.tsx`
- `C:\OLLI_REL\src\services\planos.ts`
- `C:\OLLI_REL\worker\src\ai.js`
- `C:\OLLI_REL\worker\src\creditos.js`
- `C:\OLLI_REL\worker\src\index.js`
- `C:\OLLI_REL\worker\wrangler.jsonc`

Logo/foto:

- `C:\OLLI_REL\src\screens\MeuNegocioScreen.tsx`
- `C:\OLLI_REL\src\screens\OnboardingScreen.tsx`
- `C:\OLLI_REL\src\screens\ContaScreen.tsx`
- `C:\OLLI_REL\src\services\conta.ts`
- `C:\OLLI_REL\src\services\cloudSync.ts`
- `C:\OLLI_REL\src\utils\imagemDataUri.ts`
- `C:\OLLI_REL\webapp\src\pages\olli\meu-negocio\index.tsx`

Dados/admin/banco:

- `C:\OLLI_REL\webapp\src\pages\olli\dados\index.tsx`
- `C:\OLLI_REL\supabase\migrations`
- `C:\OLLI_REL\supabase\migrations\20260727_numero_unico_por_tenant.sql.pendente`
- `C:\OLLI_REL\worker\src\admin.js`

Estado/roadmap:

- `C:\OLLI_REL\docs\RELEASE_ANDROID_2026-08-20.md`
- `C:\OLLI_REL\docs\FOLLOWUPS.md`
- `C:\OLLI_REL\docs\PESQUISA_IMPORTACAO_INTELIGENTE.md`
- `C:\OLLI_REL\docs\INTEGRATION_BACKLOG.md`
- `C:\OLLI_REL\docs\ideias-futuras\README.md`

## 13. Ideias futuras já guardadas

Já existe um cofre separado:

`C:\OLLI_REL\docs\ideias-futuras`

- Origem: `C:\Users\ADMIN\Downloads\olli_ideias_futuras_md.zip`.
- Arquivo validado e registrado em `docs\ideias-futuras\README.md`.
- Nada dali entra automaticamente no roadmap ativo.
- Regra: promover somente com problema validado, usuários, métrica, risco e decisão explícita.

O foco imediato continua: estabilizar, sincronizar, testar, vender e publicar o produto existente.

## 14. Agentes deste chat

- `diagnostico_ia` / Ramanujan: auditoria concluída, somente leitura.
- `diagnostico_logo` / Kepler: auditoria concluída, somente leitura.
- Ambos receberam `interrupt_agent` novamente em 25/08 após conclusão.
- Se a interface ainda os mostrar, tratar como cache visual; não estão executando trabalho útil e não devem ser retomados.
- Não abrir novos agentes no próximo chat sem subtarefas independentes e ganho real.

## 15. Não repetir estes erros

- Não trabalhar na cópia antiga do Desktop.
- Não confundir ícone da Play com logo da empresa.
- Não afirmar que teste automatizado prova configuração embutida no AAB.
- Não afirmar que código 15 foi validado fisicamente; a evidência física era código 14.
- Não chamar teste fechado de publicação pública.
- Não atribuir o defeito da IA ao OpenRouter: o Worker está online; falta URL no Android.
- Não tentar resolver logo salvando outra URI local.
- Não copiar Chrome/cookies/sessões para repositório open source.
- Não usar screenshots como método principal de navegação.
- Não consumir crédito real, cobrar ou cancelar assinatura durante teste.
- Não aplicar SQL avulso em produção; usar migration versionada e rollback.
- Não instalar bibliotecas/repositórios comunitários sem licença, manutenção e supply-chain audit.
- Não limpar ou mover a raiz `C:\Users\ADMIN\Desktop\OLLI ORCAMENTOS`.
- Não dizer “100%” sem aparelho real, artefato Play e critérios da seção 10.

## 16. Resumo final para o próximo agente

O OLLI tem base sólida e muitos módulos entregues. O problema não é começar de novo. A prioridade é terminar os fluxos quebrados da release Android, provar em aparelho real e concluir a Play.

Sequência crítica:

```text
EAS IA/Google
  -> logo/avatar persistentes
  -> crédito/cota/modelos OpenRouter
  -> segurança/dependências
  -> testes completos
  -> Android código 16
  -> aparelho real
  -> Play teste fechado
  -> requisitos de produção
```

Última regra: fatos de Git/código foram revalidados em 25/08; Play/modelos/serviços externos podem mudar e devem ser atualizados antes de ação.
