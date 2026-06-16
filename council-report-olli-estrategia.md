# Veredito do Conselho — Estratégia OLLI
*5 avaliadores + 3 revisores cruzados · decisão: executar o plano completo ou ajustar antes?*

## Veredito do Conselho
**FAZER COM AJUSTES.** Não executar o plano completo. Cortar para uma **fatia vertical** (código de erro → diagnóstico → orçamento → link do cliente), validar com técnicos reais, e só então monetizar/expandir.

## Onde o Conselho concorda (5/5 — unânime)
- O plano completo **NÃO está pronto pra executar**. Escopo de ~1 ano executado por 1 pessoa não-dev = colapso por dispersão.
- A fatia mínima certa é o **loop completo e diferenciado**: Códigos de erro (anzol) → Diagnóstico IA → Orçamento → Link de aprovação do cliente.
- Os **602 códigos são o fosso**, mas estão no JSON, não na mão do usuário → prioridade #1 absoluta.
- **Adiar tudo o resto**: Stripe/planos, painel master, OLLI Voz, PWA iPhone, agenda, equipe, estoque, PMOC.
- **Momento AHA em <90s**: técnico digita "Midea 12000 piscando 3x" e recebe diagnóstico em linguagem de técnico. Sem isso, nada mais importa.

## Onde o Conselho discorda
- **Velocidade vs validação:** Operator/Expansionist dizem "construa a fatia em 3-4 semanas". Contrarian/First Principles dizem "validar pagamento/uso é mais urgente que construir — sem canal de distribuição, o MVP mais enxuto não chega a ninguém". Tensão real: a fatia é executável JÁ; a validação depende de um canal que talvez não exista.

## Pontos cegos encontrados (na revisão cruzada — NENHUM dos 5 viu)
1. **Dependência da API Claude sem rede de segurança.** Se a IA cair ou encarecer, o diferencial some. → **Cache agressivo por código+marca desde o dia 1** resolve ~80% das chamadas. É arquitetura, não otimização futura.
2. **Igor tem acesso a técnicos HVAC reais pra testar?** Todo o "validar em 30 dias" assume um canal (grupo de WhatsApp, colega, distribuidor). Se não existe, **achar o canal é tão prioritário quanto o código**.
3. **O próprio assistente de IA (eu) é o gargalo de build.** Igor não programa; um bug de ambiente (MAX_PATH, RAM) trava tudo. → Mitigar com builds curtos, checkpoints git, e evitar features que exigem sessões longas de debug.

## Recomendação final
Cortar o plano para **UMA fatia vertical** e construir em ~3-4 semanas:
**Códigos de erro → Diagnóstico (com a "regra de ouro": pedir modelo, mostrar confiança, nunca condenar peça sem teste) → Orçamento → Link do cliente.**
Arquitetar **cache de diagnóstico** desde o dia 1. Em paralelo, Igor confirma **10 técnicos reais** pra testar. Stripe e o resto: só depois que esses 10 usarem e voltarem.

## Primeira ação prática
**Importar os 602 códigos (já em JSON) no app e construir a tela de busca** (marca → modelo → código → resultado com causa, testes, confiança e fonte). É o anzol, entrega o diferencial único na mão do Igor pra ele testar num atendimento real essa semana.

## Riscos que precisam de trava
1. **Morte por dispersão (escopo)** → Trava: regra de corte — *"se não fecha diagnóstico→orçamento→pagamento, vai pro backlog pós-validação."*
2. **Custo de IA estoura** → Trava: cache por código+marca + limite de chamadas no plano grátis + medir custo real/chamada antes de precificar créditos.
3. **Sem canal de distribuição** → Trava: Igor lista hoje 10 técnicos reais (nome+WhatsApp). Se não conseguir 10, o problema #1 é canal, não produto.
4. **Assistente como gargalo de build** → Trava: builds curtos e frequentes, commits/checkpoints, priorizar o que roda em hot-reload; nada de sprints de debug longos.
5. **API Claude cair/encarecer** → Trava: fallback — se a IA falhar, mostrar o resultado da BASE de códigos (não depende de IA) como rede de segurança.

## Log resumido
Lentes: Contrarian · First Principles · Expansionist · Operator · Customer/Outsider. Revisores: 3 (todos elegeram o Operator como parecer mais forte). Contexto: PLANO_MESTRE_OLLI.md, memórias do projeto, os 4 docs de pesquisa do Igor, estado atual do código.
