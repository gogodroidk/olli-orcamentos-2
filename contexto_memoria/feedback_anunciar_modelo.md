---
name: feedback-anunciar-modelo
description: Igor quer que eu anuncie o modelo recomendado e o nível antes de cada tarefa/prompt
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b38e5d95-9e9b-4e00-9db5-2d7962cbad70
---

Antes de QUALQUER comando ou tarefa, sempre dizer ao Igor qual modelo usar (Opus 4.8 / Sonnet 4.6 / Haiku 4.5 / Fable 5) e por quê, e o nível de esforço adequado para aquele prompt específico.

**Why:** Ele está gerenciando custo/limite de tokens (já bateu limite de sessão uma vez) e quer controle consciente sobre qual modelo gasta em cada etapa.

**How to apply:** No começo de cada resposta que inicia uma tarefa nova, abrir com uma linha curta tipo "Modelo recomendado: X — porque Y". Não esperar ele perguntar. Relaciona com [[project-olli-build-status]].
