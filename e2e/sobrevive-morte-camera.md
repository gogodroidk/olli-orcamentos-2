# Roteiro manual — "a câmera mata o app e a OS volta igual" (Onda I0)

Teste de aceite no aparelho para a Onda I0 · Confiança. A parte que roda em `node`
(regras puras e fiação) está em `npm run test:confianca-offline` e
`npm run test:sessao-30-dias-offline`. Este roteiro cobre o que o `node` não tem:
câmera de verdade, Android matando a activity e o modo avião.

## Preparação (uma vez)

1. Emulador `olli_phone` (ou um Android real) com um APK que contenha esta branch.
   Lembrete da casa: testar no Hermes. A web não mostra bug de Hermes.
2. Ligar **Opções do desenvolvedor → Não manter atividades** (Don't keep activities).
   Pelo adb:
   ```
   adb shell settings put global always_finish_activities 1
   ```
   Para desligar no fim: `adb shell settings put global always_finish_activities 0`.
3. Entrar com uma conta de teste que tenha pelo menos 1 OS (a conta demo serve).

> Alternativa sem "Não manter atividades": com a câmera aberta (o OLLI em segundo
> plano), matar o processo como o sistema faria por falta de memória:
> `adb shell am kill online.olliorcamentos.app`

## A. Câmera na OS: o app morre e a OS volta

1. Abrir **Ordens de serviço** → tocar numa OS (abre o detalhe).
2. Marcar 1 item do checklist e, **em menos de meio segundo**, tocar em **Câmera**.
3. Tirar a foto e confirmar.
4. **Esperado:**
   - o app reabre (o splash pode aparecer) **direto no detalhe daquela OS**;
   - a foto nova está na grade com o selo **"No aparelho"** (ou **"Enviada"**, se
     houver internet e o envio já tiver terminado);
   - o item marcado no passo 2 continua marcado.
5. **Falhou se:** o app abriu no Início, a foto sumiu ou o checklist voltou atrás.

## B. Galeria

Igual ao A, tocando em **Galeria** e escolhendo 2 fotos. As duas voltam anexadas.

## C. Cancelar a câmera

Igual ao A, mas voltar da câmera sem tirar foto. O app reabre na mesma OS e
nenhuma foto é adicionada.

## D. Rascunho do item do checklist

1. No detalhe da OS, digitar "Trocar capacitor" no campo **Adicionar item...**,
   sem confirmar.
2. Tocar em **Câmera** (o app morre) e voltar.
3. **Esperado:** o campo mostra "Trocar capacitor" de novo.

## E. Rascunho da OS manual

1. **+ Nova OS → Manual**. Preencher Cliente e Título, sem criar.
2. Mandar o app para o segundo plano e matá-lo (`adb shell am kill online.olliorcamentos.app`).
3. Reabrir, ir de novo em **+ Nova OS → Manual**.
4. **Esperado:** Cliente e Título preenchidos. Ao **Criar**, o rascunho some (abrir
   **Manual** de novo mostra os campos vazios).

## F. Selo por foto e contador "aguardando sinal"

1. Ligar o **modo avião**.
2. Tirar 3 fotos numa OS.
3. **Esperado:**
   - cada foto com o selo **"No aparelho"**;
   - no topo do detalhe e na lista de OS: **"3 fotos aguardando sinal"**, com
     "Elas sobem sozinhas quando a internet voltar".
4. Adiantar o relógio do aparelho em 25 horas (Ajustes → Data e hora, sem
   automático) e reabrir a OS.
5. **Esperado:** alerta **"Algumas fotos não subiram há 1 dia"** com o botão
   **[Tentar agora]**.
6. Desligar o modo avião, voltar o relógio para o automático e tocar em
   **[Tentar agora]**.
7. **Esperado:** os selos viram **"Enviada"** e o alerta some. No Supabase, os
   arquivos aparecem em `storage → olli-fotos/<tenant>/foto_servico/`.

## G. Reabrir depois de 30 dias offline

1. Com internet, entrar na conta e abrir o Início (os dados descem).
2. Ligar o **modo avião**.
3. Adiantar o relógio do aparelho em **31 dias**.
4. Fechar o OLLI de verdade (tirar dos recentes) e abrir de novo.
5. **Esperado:** o app abre **dentro** (Início/abas), com os dados locais.
   **Não** aparece a tela Entrar. A lista de OS do técnico mostra as OS dele
   (antes da correção ela mostrava "Nenhuma OS para você").
6. Desligar o modo avião e voltar o relógio para o automático. Em até 1 minuto com
   o app na frente (ou ao voltar do segundo plano) a sessão renova e o sync volta.
7. **Contraprova:** pelo painel, em outra sessão, trocar a senha da conta (isso
   derruba as sessões). Com internet, reabrir o app: agora ele **deve** ir para a
   tela Entrar. Offline não é passe livre.

## O que ficou de fora nesta onda (registrado, não esquecido)

### Orçamento (Step3) — NÃO tocado agora (outra equipe está na tela)

`NovoOrcamentoScreen` + `src/steps/Step3Detalhes.tsx` usam a mesma câmera, mas:

1. **O orçamento em edição vive só na memória** (`useState` do
   NovoOrcamentoScreen). Se o Android matar o app na câmera do Step3, **o
   orçamento inteiro some**, não só a foto. Falta um rascunho do formulário
   (cliente, itens, passo atual do wizard) gravado no aparelho, por campo, com o
   mesmo `criarGravadorRascunho` de `src/services/rascunhoCampo.ts`.
2. **Não há marcador nem retomada.** A foto tirada fica presa no
   `ImagePicker.getPendingResultAsync`. Generalizar `src/services/capturaFotoOS.ts`
   para um destino `orcamento` (hoje o marcador só conhece `ordemId`) e reabrir o
   NovoOrcamento no Step3 com a foto.
3. A retomada atual **não consome** o resultado pendente quando não há marcador da
   OS. Isso é de propósito: não roubar a foto do orçamento. Quando o Step3 ganhar o
   marcador dele, a retomada passa a decidir pelo destino gravado.

Mesma situação (sem retomada) em `EquipamentoScreen` (foto do equipamento) e
`ContaScreen` (logo). São fluxos menos frequentes no campo.

### Fotos na nuvem: cópia, ainda não exibição

- "Enviada" significa: **a cópia está no bucket privado `olli-fotos`**. A OS ainda
  guarda o caminho LOCAL da foto (`file://...`). Por isso, o painel e outro
  celular **ainda não exibem** a foto. O próximo passo é gravar a `chave` do storage
  na OS (exige migration em `ordens_servico`) e exibir por URL assinada.
- Ao **sair da conta** com fotos ainda "No aparelho", não há aviso. A fila é por
  usuário e **não** é apagada no logout: se a mesma pessoa entrar de novo, as fotos
  sobem. Falta o aviso "N fotos ainda não subiram" antes de sair.

### Sessão offline

- A porta (boot, `sessaoAtiva`, `useTipoConta`) e a lista de OS do técnico usam a
  sessão guardada quando falta internet. Outras telas que chamam
  `getCurrentUser()` direto continuam estritas: offline, com o token vencido,
  elas se comportam como "sem sessão" para falar com a nuvem. Isso é correto para
  o sync, mas vale revisar tela a tela (12 telas/hooks chamam `getCurrentUser()`)
  se alguma delas mostra "faça login" em vez de "sem internet".
- Biometria opcional (citada no plano) não entrou nesta onda.
