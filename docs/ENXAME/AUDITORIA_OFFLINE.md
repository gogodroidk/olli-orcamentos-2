# AUDITORIA DE OFFLINE — a promessa "offline-first" é verdade?

> Onda G4 (2026-07-18). Varredura READ-ONLY do app (`src/`), do sync (`src/services/cloudSync.ts`)
> e do banco local (`src/database/`). Nenhum código foi alterado.
> Números de peso/tamanho neste documento foram **medidos** (scripts em `node`, encoder real
> `fast-png@8.0.0` do projeto), não estimados. O que não deu para medir está marcado como tal.

---

## VEREDITO EM UMA LINHA

**O núcleo da promessa se sustenta e é bem construído: o SQLite é a fonte da verdade, o trabalho
de campo não depende de rede, e a assinatura do cliente é 100% offline por construção.**
O que NÃO se sustenta é tudo em volta: **não existe fila de reenvio**, **não existe gatilho de
"a rede voltou"**, e o único indicador de offline do app vive numa tela só — e mente.

Traduzindo para o prestador no subsolo: ele **consegue trabalhar**. O risco não é perder o
orçamento — é o app **afirmar coisas falsas com cara de fato** (que a equipe dele não existe,
que ele está no plano Grátis, que "está tudo salvo na nuvem") e o trabalho ficar parado no
aparelho por dias sem ninguém saber.

---

## 1. A ARQUITETURA — o que é lido de onde

| Camada | Onde vive | Depende de rede? |
|---|---|---|
| Dado do negócio (cliente, orçamento, recibo, OS, agenda, equipamento, PMOC) | SQLite local, `expo-sqlite` (`src/database/database.ts`) | **Não** |
| Partição por usuário | um arquivo `.db` por `userId` (`src/database/particao.ts`) | Não |
| Espelho na nuvem | `mirrorPush()` → `pushRow()` fire-and-forget a cada save (`database.ts:27-33`) | Sim, mas **nunca bloqueia o save** |
| Sync completo (pull + push + tombstones + extras) | `syncOnLogin()` (`cloudSync.ts:2181`) | Sim |
| Sessão | AsyncStorage, `persistSession: true` (`supabase.ts:11-30`) | **Não** depois do 1º login |
| Fotos (orçamento e OS) | arquivos JPEG em `documentDirectory/fotos-orcamento/` — só o **caminho** entra no banco | Não |
| Assinatura do cliente | PNG **data URI** dentro do blob JSON do orçamento | Não |
| Códigos de erro (diagnóstico) | `assets/codigos_erro.json` (365 KB) semeado no SQLite | Não |

O contrato local-first está escrito e é respeitado: `pushRow` engole todo erro
(`cloudSync.ts:525-533`), e o único caminho que grava na nuvem antes de gravar local é… nenhum.
Bom.

**Como a sessão sobrevive offline (verificado no `node_modules`):** `@supabase/auth-js@2.108.1`
só apaga a sessão quando o refresh falha por erro **não** retryable
(`GoTrueClient.js:4099` — `if (!isAuthRetryableFetchError(error)) await this._removeSession()`).
Falha de rede é retryable → **o app não desloga o usuário por estar offline.** Correto.

---

## 2. TABELA DE CLASSIFICAÇÃO POR FLUXO

Legenda: **(a)** 100% offline · **(b)** degrada e **avisa** · **(c)** degrada e **NÃO avisa** (o pior)
· **(d)** não funciona.

### O trabalho de campo — o que ele foi vender que funciona

| Fluxo | Classe | Verdade |
|---|---|---|
| Criar/editar orçamento | **(a)** | SQLite + `mirrorPush` fire-and-forget. Salva sempre. |
| Adicionar/editar cliente | **(a)** | Idem. `ClientesScreen.tsx:207-219` tem os 3 estados corretos. |
| Assinatura do cliente no aparelho | **(a)** | `rasterizarAssinatura.ts` é PNG em JS puro, zero rede. `gravarAssinaturaCliente` **relança** o erro para o pad ficar aberto com o desenho intacto (`VisualizarOrcamentoScreen.tsx:331-348`). **Modelo de como se faz.** |
| Fechar OS / checklist / fotos da OS | **(a)** | `patchOrdem` → SQLite (`services/ordemServico.ts`). |
| Agenda do dia | **(a)** | `agenda.ts` lê o SQLite; lembretes são notificações locais. |
| Recibo (emitir) | **(a)** | `pagamentos.ts` só importa `database` e `utils`. Zero rede. |
| Radar de dinheiro parado / cobrança / follow-up / reconquista | **(a)** | Os 4 radares leem **só** o SQLite (`radarCobranca.ts:32`, `radarClientes.ts:26`, `radarFollowUp.ts:31`). Confirmado. |
| Pix na hora (`PixCobrancaModal`) | **(a)** | BR Code gerado localmente. |
| Diagnóstico por código de erro | **(a)** | Base local de centenas de códigos. |
| Relatório do dia | **(a)** | `relatorioDia.ts` — agenda local + `expo-speech`. |
| Gerar e compartilhar PDF | **(b)** | Gera e compartilha offline. Duas degradações: o QR do link vira texto de instrução (`pdfGenerator.ts:975-983`, comentado de propósito) — **ok**; e o `@import` do Google Fonts (`pdfGenerator.ts:683`) não resolve → cai no fallback `-apple-system/system-ui/Arial`. O documento sai **com outra tipografia** e ninguém avisa. Fronteira com (c), mas o dano é cosmético. |
| Login (1ª vez) | **(d)** | Esperado: sem rede não há como criar sessão. `App.tsx` é fail-closed para `Entrar`. Instalação nova no subsolo = app inútil, por definição. |

### O que depende de rede por natureza — como degrada

| Fluxo | Classe | Verdade |
|---|---|---|
| IA / diagnóstico por IA / chat | **(b)** ⭐ | `erroIA.ts` tem taxonomia explícita com estado `'offline'`: *"Sem conexão com a internet — Confira o Wi-Fi ou os dados móveis"*, e cai na base local de códigos. **É o padrão-ouro do repo. Todo o resto deveria copiar isto.** |
| Créditos (saldo) | **(b)** ⭐ | `getMeuSaldo(): number \| null` — 3 estados de verdade. A tela mostra `indisponível` + *"Fique online um instante para atualizar o saldo"* (`CreditosScreen.tsx:205-208`). Modelo. |
| Link do cliente | **(b)** | `gerarLinkOrcamento` **lança**; a tela mostra `Alert("Não consegui gerar o link")` (`VisualizarOrcamentoScreen.tsx:236-238`). |
| Trilha do cliente (visualizou/aprovou) | **(b)** | 3 estados explícitos: *"Não deu para carregar a trilha do cliente agora"* (`VisualizarOrcamentoScreen.tsx:723-733`). |
| ETA / trânsito | **(b)** | `getEtaAgendamento` devolve `{ estado: 'indisponivel' }` (`eta.ts:308-318`). |
| Backup na nuvem (manual) | **(b)** | `backupNow()` lança sem `supabase`; a tela reporta. |
| Voz na nuvem | **(b)** | `vozNuvem.ts` sobe áudio; sem rede falha com mensagem. |
| **Atribuir técnico à OS** | **(c)** | ⚠️ ver C3 |
| **Equipe ao vivo (mapa)** | **(c)** | ⚠️ ver C4 |
| **Tela Assinatura (qual é meu plano)** | **(c)** | ⚠️ ver C8 |
| **Barra "Tudo salvo na nuvem"** | **(c)** | ⚠️ ver C2 — a pior de todas |

---

## 3. OS CASOS (c) — degrada e NÃO avisa

> Estes são os que fazem o prestador descobrir na frente do cliente dele.

### C1 — Aparelho novo + offline: o acervo inteiro é declarado inexistente
**Onde:** todas as listas. `ClientesScreen.tsx:573`, `OrcamentosScreen.tsx:704`.
**O que acontece:** o SQLite novo tem 0 linhas. `getClientes()` **sucede** e devolve `[]`.
A tela mostra `EmptyState "Nenhum cliente — Cadastre seus clientes para agilizar os orçamentos."`
**O dano:** o prestador troca de celular, viaja para a obra, abre o app sem sinal e o app afirma
que ele não tem clientes nem orçamentos. Ele tem 300 na nuvem. Não há nenhum estado
"o primeiro sync ainda não chegou" — o app não sabe distinguir *banco vazio porque é novo* de
*banco vazio porque não tem nada*. As telas foram cuidadosamente feitas com 3 estados para o
**erro de leitura local** (`carregandoErro`), e nenhuma para este caso, que é o comum.
**Correção:** um flag `primeiroSyncConcluido` por partição (AsyncStorage, gravado no fim de
`syncOnLogin`). Enquanto for falso, o vazio vira *"Ainda não baixei seus dados — conecte uma vez"*.

### C2 — "Tudo salvo na nuvem" é uma afirmação que o código não pode fazer
**Onde:** `src/components/tecnico/BarraOffline.tsx:138`, `:172-177`.
**O que acontece:** a fase é `!online ? 'offline' : pendCount > 0 ? 'sincronizando' : 'tudo_salvo'`.
E `pendCount` **não sabe nada do `cloudSync`** — o próprio arquivo admite isso no cabeçalho
(`:13-18`). Ele só conta chamadas envolvidas em `comPendencia(...)`, que existe em **um único
call site do repo inteiro**: `TecnicoHomeScreen.tsx:118`. Pior: o decremento está no `finally`
(`:61-64`), então **um push que falhou zera o contador exatamente como um que deu certo**.
**O dano:** o técnico muda o status da OS num prédio com 4G fantasma (rede "de pé" pela sonda
HEAD, mas o upsert falha), a barra volta para o verde **"Tudo salvo na nuvem"**, e o dado está
só no aparelho. É o app dando uma garantia que ele não tem como cumprir. Isso é o P0 da casa
("erro nunca vira sucesso") na sua forma mais literal.
**Correção:** ou o `cloudSync` expõe uma fila/contador real e a barra lê dele, ou o rótulo
verde tem de ser rebaixado para algo honesto (*"Salvo no aparelho"*).

### C3 — "Nenhum membro ativo na equipe. Convide técnicos na tela Equipe."
**Onde:** `services/equipe.ts:200-222` → `screens/OrdemServicoScreen.tsx:951-954`.
**O que acontece:** `listarMembros()` faz `return []` em erro de rede, erro de RLS e catch geral —
indistinguível de "a org não tem ninguém". A tela renderiza a frase acima como fato, com a
instrução de ir convidar gente.
**O dano:** o dono, sem sinal, tenta atribuir a OS ao técnico e o app diz que a equipe dele não
existe e manda convidar de novo. Ele já pagou por isso.
**Correção:** `Promise<MembroEquipe[] | null>` (3 estados) — é a mesma assinatura que
`creditos.getMeuSaldo` já usa e que funciona.

### C4 — "Ninguém compartilhou a localização ainda"
**Onde:** `services/localizacaoEquipe.ts:194`, `:210` → `screens/EquipeAoVivoScreen.tsx:218`.
Mesmo defeito de C3, mesma frase-fato. Agrava: `localizacoesEquipe` chama `listarMembros`
internamente, então herda o colapso de C3 duas vezes.

### C5 — Numeração duplicada, sem detecção nem aviso
**Onde:** `database.ts:1614-1642` (`proximoNaSequencia`) + `cloudSync.ts:1281-1322` (`syncContadores`).
**O que acontece:** o número do orçamento é 100% local. O merge no sync é **"o maior vence"** —
ele conserta o *contador*, mas não renumera nada. Dois aparelhos (ou celular + painel) offline
no mesmo dia geram **dois documentos diferentes com o mesmo número**, e ambos já foram para
clientes diferentes em PDF.
**O dano:** dois orçamentos `14826` na mesma empresa. Recibo referenciando o número errado.
Ninguém é avisado — nem no sync, nem na lista.
**Correção mínima (sem quebrar nada):** detectar a colisão no fim de `syncOnLogin` e mostrar um
aviso acionável. Correção real: sufixo por aparelho, ou reserva de faixa.

### C6 — Conflito: o perdedor some em silêncio
**Onde:** `cloudSync.ts:843-962` (guardas `tsMaisNovo` / `localMaisNovo*` / `remoteMaisNovoNoMapa`).
**O que acontece:** o sync é **last-write-wins por `atualizadoEm`**, aplicado nos dois sentidos:
o pull não sobrescreve local mais novo, o push pula item cuja nuvem é mais nova. Isso evita
regressão — é bem feito. Mas quando o mesmo orçamento foi editado no celular (offline) e no
painel, **uma das duas edições é descartada e o usuário nunca fica sabendo**.
A `empresa` é a única com tratamento melhor: ao detectar que a nuvem mudou, ela **puxa** em vez
de sobrescrever (`cloudSync.ts:671-677`) — e mesmo essa converge sem avisar que a edição local
foi perdida.
**Correção:** quando o guard descartar uma escrita local, registrar e mostrar
*"Este orçamento foi editado no painel; mantive a versão mais recente"*.
O mecanismo de versões (`orcamento_versoes`) já existe e poderia guardar a perdedora.

### C7 — Fotos que existem no aparelho e em lugar nenhum
**Onde:** `utils/fotosOrcamento.ts` (cabeçalho é honesto: *"não sobem no sync per-row hoje"*),
`services/ports/StorageProvider.ts:15-21` (*"Impl de-facto HOJE: NÃO EXISTE upload de binário
para a nuvem"*), mas `cloudSync.ts:261` empurra `fotos: o.fotos ?? []` mesmo assim.
**O que acontece:** as fotos são arquivos locais. O **caminho** (`file:///data/user/0/...`) é
sincronizado para `ordens_servico.fotos` e para o blob do orçamento.
**O dano (dois):**
1. O dono abre a OS no painel, vê o chip *"4 fotos"* (`OrdemServicoScreen.tsx:211-214` renderiza
   pela contagem) e nenhuma abre. Nada explica por quê.
2. Restaurar um backup em aparelho novo traz os caminhos — apontando para arquivos que não
   existem. O PDF sai sem as fotos, silenciosamente (`imagemDataUri.ts` retorna `null` e o PDF
   segue sem a imagem, por design).
**Isto não é bug de offline — é o offline expondo que a evidência de campo não tem backup nenhum.**
Perder o celular = perder todas as fotos de todos os serviços.

### C8 — A tela Assinatura afirma "Grátis" para quem paga
**Onde:** `services/assinatura.ts:88-137` + `screens/AssinaturaScreen.tsx:224`.
**O que acontece:** `getResumoAssinatura()` tem rede de segurança **só em memória**
(`cacheResumo`, `:88`). Em cold boot offline: `supabase.auth.getUser()` (chamada de **rede**,
`:100`) falha → `catch` → sem cache em memória → devolve `gratis`. A tela faz
`resumo?.planoEfetivo ?? 'gratis'` e renderiza "Plano Grátis" **sem nenhum estado de erro**.
**O agravante:** `services/planos.ts` **já resolveu esse problema direito** — cache em disco com
7 dias de graça (`:7`, `:106-115`) e até um `getPlanoCacheado()` pronto para semear a UI.
A tela de Assinatura simplesmente não usa.
**Correção:** trocar o `?? 'gratis'` por 3 estados e semear com `getPlanoCacheado()`.

### C9 — Depois de 7 dias offline, quem paga vira grátis
**Onde:** `services/planos.ts:7` (`GRACA_MS = 7 dias`), `:106-115`.
**O que acontece:** passada a janela, o `catch` devolve `{ plano: 'gratis' }` — sem distinguir
"não consegui perguntar" de "não tem assinatura". O usuário perde os recursos pagos sem
qualquer explicação.
É uma decisão de produto defensável (não dá para dar acesso pago para sempre offline), mas
**a forma como termina é (c), não (b)**: expira calado. Precisa, no mínimo, de um aviso antes de
vencer e de uma mensagem no vencimento — não de o recurso simplesmente sumir.

---

## 4. A VOLTA DA REDE — existe fila? **Não.**

Este é o achado estrutural. Rastreei todos os gatilhos de sync do app:

```
App.tsx:299-304
  supabase.auth.onAuthStateChange((event, session) => {
    if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
      void syncOnLogin().finally(() => { void maybeAutoBackup(); });
```

**É o único.** Não existe:
- **fila de pendências** — `grep -n "fila\|queue\|retry" src/services/cloudSync.ts` devolve **1 linha**,
  e é um comentário sobre concorrência (`:1712`), não uma fila;
- **NetInfo** — a dependência não está no `package.json`. O único detector de rede do app é a
  sonda HEAD dentro do `BarraOffline` (`:71-89`), que **não fala com o sync**;
- **gatilho de AppState** — há 4 listeners de `AppState` no app (`usePlano`, `useTipoConta`,
  `useVerticais`, `BarraOffline`) e **nenhum** chama `syncOnLogin`;
- **`TOKEN_REFRESHED` está excluído de propósito** (`App.tsx:292-293`).

### Consequência concreta
O prestador passa o dia inteiro no subsolo. Sai, o 4G volta. **Nada acontece.**
O trabalho só sobe quando:
1. o app é **fechado e reaberto** (aí `INITIAL_SESSION` dispara `syncOnLogin` → `pushAllLocal`), ou
2. ele **salva alguma coisa nova** com sinal — e aí só **aquela linha** sobe, pelo `mirrorPush`.

Ou seja: existe um "reenvio total" (`pushAllLocal` varre o SQLite inteiro e faz upsert do que a
nuvem não tem mais novo), mas ele só roda no boot. **A recuperação existe; o gatilho é que não.**
Em Android, com o app vivo em background por dias, o dado de campo pode ficar parado
indefinidamente — e o dono no painel não vê a OS que o técnico fechou ontem.

**Correção (pequena, alto impacto):** um listener de `AppState → 'active'` + a sonda que o
`BarraOffline` já tem, chamando `syncOnLogin()` (que já é reentrante por flag, `:2182`, e
cancelável por geração). Não precisa de fila nova: `pushAllLocal` **é** a fila.

### Dois riscos adjacentes achados no mesmo caminho
- **`pullTable` faz `.select('*')` sem `.range()` nem `.limit()`** (`cloudSync.ts:1391`). Sujeito
  ao teto de linhas do PostgREST do projeto (`db-max-rows` — não verificável daqui). Se houver
  teto, o pull **trunca em silêncio** e o aparelho novo fica com um acervo parcial que parece
  completo. O painel **já corrigiu exatamente isto** (ver `REAUDITORIA_PAINEL.md`,
  "useOlliList pagina com `.range()`, sem cap de 1000"); o app não.
- **Peso do login em 4G:** o `pullAll` baixa as 13 tabelas inteiras a cada boot com sessão.
  Medido abaixo — para um usuário de 720 orçamentos são ~8 MB só de orçamentos, por login.

---

## 5. O AVISO — existe? Sim, em UMA tela. E ela mente.

`grep -rn "BarraOffline" src/` → **só `TecnicoHomeScreen.tsx`** (linhas 147, 166, 182).

| Quem | Vê aviso de offline? |
|---|---|
| Técnico (modo campo) | Sim — mas ver C2: o estado verde é falso |
| **Dono / prestador autônomo** (Home, Hoje, Orçamentos, Clientes, Agenda, OS, Recibo) | **Não. Em nenhuma tela.** |

O público-alvo descrito no briefing — *prestador de serviço brasileiro, sozinho, 4G ruim no meio
da rua* — é justamente **quem não tem indicador nenhum**. Ele cria o orçamento, vê "salvo",
compartilha o PDF, e não tem como saber que nada disso chegou na nuvem.

O `SincronizandoPill` (`ClientesScreen.tsx:499`, `AgendaScreen.tsx`) não cobre isso: ele só
aparece **depois** de um sync que **deu certo** (`notificarSyncAplicado()` só é chamado no fim
feliz de `syncOnLogin`, `:2247`). Falha de sync é 100% silenciosa.

**Correção:** promover `BarraOffline` (corrigida) para o layout comum, ou uma faixa equivalente
no `Layout`/`Tabs`. E ela precisa aparecer **no momento que importa**: ao salvar orçamento, ao
fechar OS, ao gerar PDF.

---

## 6. BATERIA E ARMAZENAMENTO — medido

### Assinatura: não é problema. (medido)
Encoder real do app (`fast-png@8.0.0`, canvas 520×180, 2 canais, `rasterizarAssinatura.ts:41-42`):

| Caso | Tinta | PNG | Data URI |
|---|---|---|---|
| Rabisco curto (o comum, com luva) | 3,7% | **2.018 B** | 2.714 chars |
| Assinatura cursiva cheia | 16,9% | **5.331 B** | 7.130 chars |
| Canvas 100% preenchido (pior caso) | 100% | 578 B | 794 chars |

### Blob do orçamento no SQLite (medido)
Orçamento realista: 8 itens, laudo técnico, condições, 6 caminhos de foto.

| Cenário | Blob JSON |
|---|---|
| Sem fotos, sem assinatura | **3.560 B** |
| + 6 fotos (só os caminhos) | 4.171 B |
| + assinatura do cliente | **11.378 B** |

### Projeção de 6 meses — só o SQLite (medido)

| Volume | Em 6 meses | Sem versões | Com 3 edições cada (`orcamento_versoes` **não é podado**) |
|---|---|---|---|
| 20 orç./mês | 120 | 1,3 MB | 5,2 MB |
| 60 orç./mês | 360 | 3,9 MB | 15,6 MB |
| 120 orç./mês | 720 | 7,8 MB | **31,3 MB** |

**Conclusão: o banco local não é o problema.** Nem com a assinatura dentro do blob, nem com o
histórico de versões. A suspeita do briefing ("data URI incha o banco") **não se confirma** —
e vale registrar que `assinaturaClienteUri` está em `CAMPOS_VOLATEIS_ORCAMENTO`
(`database.ts:1180-1190`), então **assinar não congela uma versão nova**. Bem pensado.

### O problema real de armazenamento: as fotos, que ninguém apaga
- Cada foto: redimensionada para 1280 px de largura, JPEG qualidade 0,7
  (`fotosOrcamento.ts:28-29`), gravada em `documentDirectory/fotos-orcamento/`.
- Teto de **6 fotos por orçamento** (`MAX_FOTOS_ORCAMENTO`).
- **`removerFoto()` — o único ponto do app que chama `deleteAsync` — só é chamado pelos editores
  de foto** (`Step3Detalhes.tsx:116`, `Step4Personalizacao.tsx:218`).
- **`excluirOrcamentoDefinitivo()` (`database.ts:1394-1400`) apaga a linha e as versões. Não
  toca nos arquivos.** O mesmo vale para a purga automática da lixeira (30 dias,
  `lixeira.ts:262-277`) e para o wipe do restore (`database.ts:2467-2472`).
- **A tela de OS não tem remover foto** — só `adicionarFotoOS`. Foto anexada à OS **nunca** pode
  ser apagada pelo app.

Resultado: no cenário de 720 orçamentos em 6 meses, até **4.320 JPEGs órfãos permanentes**, mais
as da OS. Nenhum é apagado nunca, nem quando o documento vai para a lixeira e é expurgado.

> ⚠️ **Não medido:** o peso em bytes de um JPEG 1280px/q0.7 real. Não há encoder JPEG neste
> ambiente e o valor depende da câmera/cena — precisa ser medido no aparelho.
> É o único número deste documento que ficou em aberto, e é o que decide se isso é "algumas
> centenas de MB" ou "enche o celular". **Medir isso é a primeira tarefa da correção.**

### Bateria
Nenhum consumo anormal encontrado: não há polling de rede em background (não existe
`TaskManager`/`BackgroundFetch` no projeto — confirmado no comentário de `cloudSync.ts:2237-2240`).
A única sonda periódica é a do `BarraOffline`: um `HEAD` a cada 20 s (`:69`), e **só** enquanto a
tela do técnico está montada. Aceitável.

---

## 7. LISTA PRIORIZADA — o que consertar

### P0 — o app afirma o falso
1. **C2 — "Tudo salvo na nuvem" sem base.** Ou liga a barra a um contador real do `cloudSync`,
   ou muda o rótulo para "Salvo no aparelho". É o P0 da casa violado no texto mais visível do app.
2. **C1 — vazio de aparelho novo apresentado como "você não tem".** Flag `primeiroSyncConcluido`
   por partição. Uma linha de AsyncStorage resolve o pior susto do produto.
3. **C3 + C4 — `listarMembros` / `localizacoesEquipe` colapsam erro em `[]`.** Trocar para
   `T[] | null`. O padrão certo já existe no repo (`creditos.getMeuSaldo`).
4. **C8 — tela Assinatura diz "Grátis" para pagante offline.** Semear com `getPlanoCacheado()`,
   que já está pronto e sem uso.

### P1 — o trabalho fica parado sem ninguém saber
5. **Gatilho de "a rede voltou".** `AppState → 'active'` + sonda → `syncOnLogin()`.
   `pushAllLocal` já é a fila; falta só chamar. Menor esforço / maior impacto do documento.
6. **Aviso de offline fora da tela do técnico.** O prestador autônomo hoje não tem nenhum.
7. **C7 — fotos sem nuvem.** Enquanto o `StorageProvider` não existir, **no mínimo** parar de
   empurrar caminhos `file://` para o painel e marcar as fotos como "só neste aparelho" na UI —
   hoje o painel promete uma foto que nunca vai abrir.

### P2 — corrupção silenciosa de dado
8. **C5 — números duplicados offline.** Detectar colisão no fim do sync e avisar.
9. **C6 — conflito LWW sem aviso.** Registrar a versão perdida e avisar quem perdeu.
10. **`pullTable` sem paginação** (`cloudSync.ts:1391`). Mesmo conserto que o painel já levou.

### P3 — higiene
11. **Faxina de fotos órfãs.** Apagar os arquivos no expurgo da lixeira e no
    `excluirOrcamentoDefinitivo`; permitir remover foto da OS. **Antes: medir o peso real do JPEG.**
12. **C9 — expiração dos 7 dias de graça sem aviso.** Avisar antes de vencer.
13. **Fonte do PDF** (`pdfGenerator.ts:683`): o `@import` remoto muda a tipografia do documento
    offline. Embutir as fontes ou aceitar e documentar o fallback.

---

## 8. O QUE ESTA AUDITORIA NÃO PROVOU

Honestidade sobre o método: **isto é leitura de código, não teste em aparelho.**
Não rodei o app em modo avião. Ficam em aberto, e só um aparelho responde:

- peso real de um JPEG de campo (item P3-11 acima — bloqueia a decisão de faxina);
- o valor de `db-max-rows` do projeto Supabase (decide se o P2-10 é teórico ou real);
- se o refresh token do Supabase expira por inatividade em uma configuração de projeto que eu
  não posso ler daqui — se expirar, um aparelho offline por muitas semanas **cairia** na tela
  `Entrar` com o SQLite cheio e sem como voltar. Cenário raro, dano total. **Vale testar.**
- o comportamento real do `@import` de fonte do `expo-print` sem rede: se ele **espera** o
  timeout do WebView antes de renderizar, "gerar PDF" fica lento no subsolo em vez de só feio.
