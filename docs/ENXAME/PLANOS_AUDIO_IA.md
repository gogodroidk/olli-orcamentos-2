# Planos — áudio que monta orçamento ou cadastro (D1438-G20)

Pedido do Igor no walkthrough de 27/10/2026, item Planos: a pessoa manda um áudio, a OLLI ouve e monta o que ela quer (orçamento ou cadastro).

## O que está neste branch

Protótipo atrás de flag, desligada. Com a flag apagada, a tela de Planos fica como está: o bloco não monta e o microfone não abre.

| Onde | Flag | Valor que liga |
|---|---|---|
| Painel (`/planos`) | `VITE_PLANOS_AUDIO_IA` | `1` |
| App | `EXPO_PUBLIC_PLANOS_AUDIO_IA` | `1` |

A flag não entrou no `eas.json`, no `app.json` nem em config de Cloudflare, Auth, Supabase ou DNS. Sem isso, build de loja e o site no ar continuam sem o protótipo.

Para ver no painel, na worktree, sem deploy: subir o Vite com `VITE_PLANOS_AUDIO_IA=1`. Não publicar esse ambiente.

## O que a pessoa vê quando a flag está ligada

Um cartão no fim da tela de Planos, com o selo "Não está no ar". O texto diz que isso não faz parte do plano que está à venda.

1. Ela toca em Falar. O navegador (painel) ou o reconhecimento de fala que o app já usa ouve em português.
2. Se o aparelho não ouve, ela escreve a mesma frase.
3. A frase vira um rascunho nesta tela: orçamento, cadastro de cliente, ou cadastro de serviço/produto.
4. Preço que ela não falou aparece como "preço não falado". Não vira R$ 0.
5. "De graça" ou "cortesia" pode ser R$ 0, porque ela falou.
6. Nada é gravado no orçamento, no cliente ou no catálogo. Não há botão de salvar.
7. Áudio não é enviado e não é guardado. Só o texto da fala fica na tela, até ela limpar ou sair.
8. CPF ou CNPJ falado não entra no rascunho. A tela troca o texto pelo trecho sem o número.
9. Pedido de apagar, enviar ou "salva agora" é ignorado.

## Por que não usa a IA que já cobra

O app já transforma fala em itens em `worker/src/voz.js` (`/voz`) e já transcreve áudio em `/transcrever`. Os dois gastam cota. Este protótipo não chama nenhum dos dois, nem OpenRouter, nem Workers AI. Quem monta o rascunho é `src/services/planosAudioIa.ts`, uma função pura, testada em `scripts/teste-planos-audio-ia.ts`.

O formato do orçamento segue o JSON que `/voz` já devolve: título, nome do cliente, itens com descrição, quantidade, valor unitário e tipo (`servico` ou `peca`). Cadastro acrescenta telefone, e-mail e o nome do item.

Limite conhecido do montador local: preço em algarismo ("450 reais", "R$ 1.250,50"). Preço só por extenso ("duzentos reais") não entra. "12 mil BTU" não vira preço.

## O que falta para valer no produto

1. O Igor liga a flag de propósito, num build que não é o site no ar.
2. Trocar o montador local pela rota `/voz` que já existe, na cota que já existe, sem abrir provedor novo.
3. O rascunho abre a ficha de revisão (orçamento, cliente ou catálogo). Só grava com o ok dela, na regra que a voz do app já segue.
4. Continua sem guardar áudio e sem guardar documento falado.

Até lá, o comparativo de planos não lista este recurso. Não é benefício do Pro nem da Empresa.

## Rollback

Reverter o commit deste branch, ou fechar o PR sem merge. A flag nasce desligada, então a tela publicada não muda mesmo que o código chegue à main depois.
