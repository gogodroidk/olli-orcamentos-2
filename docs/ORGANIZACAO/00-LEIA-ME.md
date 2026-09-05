# OLLI Orçamentos — central de organização

Atualizado em: **2026-09-03**

Este diretório é o índice oficial para entender onde estão o código, os
materiais, os planos, as evidências e os próximos passos do OLLI Orçamentos.
Ele não duplica projetos e não substitui os controles append-only do piloto.

## Regra principal

> **Todo código atual do produto é editado, testado e documentado somente em
> `C:\OLLI_REL`.**

Há outros checkouts, materiais do Google Drive, ferramentas auxiliares, builds,
pesquisas e arquivos históricos. Eles foram preservados e classificados, mas
nenhum deles é uma segunda fonte de verdade.

## Dois pontos de entrada, duas finalidades

| Ponto | Finalidade | Pode editar código atual? |
| --- | --- | --- |
| `C:\OLLI_REL` | Repositório canônico, testes, documentação e automação | **Sim** |
| `C:\Users\ADMIN\Desktop\OLLI - CENTRAL DO PROJETO` | Navegação por junctions para materiais, histórico, KB e ferramentas | Não; abrir `01_PRODUTO_ATUAL\CODIGO_CANONICO` |

A pasta `C:\Users\ADMIN\Desktop\OLLI ORCAMENTOS` é uma raiz histórica
sincronizada pelo Google Drive. Ela continua com esse nome para não quebrar a
sincronização, mas não é o checkout canônico.

## Leia nesta ordem

1. [PLANO_UNICO_0_A_100.md](PLANO_UNICO_0_A_100.md) — o que já foi feito, o que
   falta e a sequência de execução.
2. [MAPA_RAIZES_E_MATERIAIS.md](MAPA_RAIZES_E_MATERIAIS.md) — classificação de
   todas as pastas encontradas.
3. [MATRIZ_SKILLS_AGENTES_MODELOS.md](MATRIZ_SKILLS_AGENTES_MODELOS.md) — quem e
   o que deve executar cada tipo de tarefa.
4. [NOMENCLATURA_E_GOVERNANCA.md](NOMENCLATURA_E_GOVERNANCA.md) — regras para
   evitar novas duplicatas e nomes ambíguos.
5. [ROLLBACK_E_RETENCAO.md](ROLLBACK_E_RETENCAO.md) — como desfazer somente esta
   organização, sem tocar nas origens.
6. [MANIFESTO_RAIZES_OLLI.json](MANIFESTO_RAIZES_OLLI.json) — fonte estruturada
   usada pelo validador.
7. [AUTOMACAO_E_HANDOFF.md](AUTOMACAO_E_HANDOFF.md) — diagnóstico da automação,
   ID canônico e roteiro seguro para trocar de modelo e retomar.
8. [RESULTADO_VALIDACAO.md](RESULTADO_VALIDACAO.md) — última prova executada.

## Fontes de estado

| Pergunta | Fonte autoritativa |
| --- | --- |
| O que está rodando agora? | `docs/PILOTO/RUN_STATE.json` |
| Qual é o próximo item? | `docs/PILOTO/NEXT_PROMPT.md` |
| O que já aconteceu? | `docs/PILOTO/LEDGER_3_ONDAS.md` |
| O que está pronto localmente e quais gates faltam? | `docs/PILOTO/TRANSVERSAL_READINESS.json` |
| Qual é a visão completa do produto? | `docs/PLANO_MESTRE_OLLI_0_A_100_2026-08-25.md` |
| Qual é a síntese operacional atual? | `docs/ORGANIZACAO/PLANO_UNICO_0_A_100.md` |

## Limites que continuam valendo

- A marca pública é sempre **OLLI Orçamentos**. “Wally”, “Holly” e grafias
  semelhantes são erros de reconhecimento e não podem virar nome de produto.
- Evidência local ou sintética não é aceite real.
- Nenhum arquivo de credencial, `.env`, cofre, sessão ou dado de cliente faz
  parte deste inventário.
- Produção, banco, DNS, deploy, publicação, pagamento, envio e contato externo
  continuam exigindo gate humano explícito.
- Não apagar nem sincronizar automaticamente clones divergentes.
- Não mover, renomear ou copiar em massa a raiz do Google Drive.
