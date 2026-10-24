# Ideia Inovadora: "Orçamento Inteligente Compartilhado" — Viral Loop Baseado em Colaboração Real (Não Indicação)

**Data:** 2026-10-07  
**Autor:** MKT — CMO (LIVRE)  
**Ninguém propôs:** Transforma o **orçamento em documento colaborativo multi-partes** — cliente + prestador + (opcional) subcontratado/fornecedor editam/comentam/aprovam JUNTOS no mesmo link. Cada participante novo vira usuário OLLI. Loop: **Colaboração → Convite → Usuário → Novo Orçamento → Colaboração**.

---

## Conceito

**Problema real:** Orçamento vai e volta no WhatsApp — cliente pede ajuste, prestador refaz, envia PDF, cliente não abre, prestador liga, cliente diz "manda no email", prestador reenvia... **Ciclo quebrado, sem rastro, sem colaboração real.**

**Solução OLLI:** Link `/o/<token>` **vira workspace colaborativo** (tipo Figma/Notion para orçamento):
- **Cliente** vê, comenta, aprova/rejeita itens, pede ajuste — **tudo no link, sem cadastro**
- **Prestador** recebe notificação push/email, edita em tempo real, vê cursor do cliente
- **Subcontratado/Fornecedor** (opcional) convidado pelo prestador → edita sua parte (materiais, mão de obra especializada)
- **Histórico de versões** automático — "v1: cliente pediu mais tomadas", "v2: prestador ajustou preço"

**Cada participante novo = usuário OLLI potencial:**
- Cliente final → cadastra-se para "salvar meus orçamentos" → vira lead para indicação
- Subcontratado → cadastra-se para "receber convites de obra" → vira prestador ativo
- Fornecedor → cadastra-se para "ver pedidos de material" → vira parceiro L4

---

## Teste de 2 Dias (R$ 0, Manual, 3 Trios = 9 Pessoas)

### Dia 1: Preparação (Igor + Dev 1h)
1. **Selecionar 3 trios** reais:
   - Trio 1: Eletricista (prestador) + Cliente (dono de obra) + Fornecedor material elétrico
   - Trio 2: Pintor (prestador) + Cliente (síndico) + Subcontratado (gesso)
   - Trio 3: Ar-cond (prestador) + Cliente (facilities) + Fornecedor (peças)
2. **Criar 3 orçamentos "Colaborativos"** no painel (feature flag `orcamento_colaborativo=true`):
   - Link `/o/<token>` abre editor web (já existe no painel) com modo "cliente pode comentar"
   - Botão "Convidar subcontratado/fornecedor" gera link `/o/<token>?role=subcontratado`
   - Notificações push/email para cada ação (comentário, edição, aprovação)

### Dia 2: Execução + Medição
1. **Prestadores enviam links para clientes** (WhatsApp normal)
2. **Clientes abrem, comentam, pedem ajustes** (sem cadastro)
3. **Prestadores convidam subcontratados/fornecedores** via botão no painel
4. **Métrica primária (24h):** % de trios onde **≥2 participantes** interagem (comentam/editam/aprovam)
5. **Métrica secundária (48h):** % de participantes novos que **criam conta OLLI** após interagir
6. **Métrica terciária (7d):** Número de **novos orçamentos criados** pelos participantes novos

---

## Critério GO/NO-GO

| Métrica | GO | NO-GO |
|---------|-----|-------|
| Trios com ≥2 interagindo (24h) | ≥66% (2/3) | <33% |
| Participantes novos criam conta (48h) | ≥20% | <5% |
| Novos orçamentos por participantes novos (7d) | ≥1 por trio | 0 |

**Se GO** → Dev builda: editor colaborativo real-time (WebRTC/CRDT), convites por papel (cliente/subcontratado/fornecedor), notificações, versionamento.  
**Se NO-GO** → Descarta, custo = 1h dev + 2 dias observação.

---

## Por Que Ninguém Propôs

| Barreira | Realidade OLLI |
|----------|----------------|
| "Editor colaborativo é complexo" | **Painel web JÁ TEM editor de orçamento** — só abrir para cliente (read/comment) e subcontratado (write own section) |
| "Cliente não vai usar" | **Já usa WhatsApp para ajustes** — link único é MENOS atrito que PDF+WhatsApp+email |
| "Subcontratado não tem OLLI" | **Convite = onboarding** — entra no link, edita sua parte, vê valor → "quero isso pra mim" |
| "Concorrência (GetNinjas/Marketplace)" | **Não é marketplace** — é **ferramenta de colaboração** para quem JÁ trabalha junto |
| "LGPD / Dados do cliente" | **Cliente não cadastra** — só comenta no link (token). Dados sensíveis ficam no app do prestador. |

---

## Efeito Volante (Se Der Certo)

```
Prestador envia orçamento colaborativo → Cliente comenta/ajusta → Subcontratado entra → Todos veem valor
                                    ↓
                            Cliente cria conta ("salvar meus orçamentos") → Lead qualificado
                            Subcontratado cria conta ("receber convites") → Prestador ativo
                            Fornecedor cria conta ("ver pedidos") → Parceiro L4
                                    ↓
                            Cada novo usuário → novos orçamentos colaborativos → loop
                                    ↓
                            Rede de colaboração real (não indicação passiva) → retenção altíssima
                                    ↓
                            Volume → split/comissão viável → crédito L5 → conta L8
```

---

## Diferencial vs Concorrentes

| Feature | GetNinjas/Marketplace | WhatsApp/Email | **Orçamento Colaborativo OLLI** |
|---------|----------------------|----------------|--------------------------------|
| Tipo | Lead gen (frio) | Comunicação quebrada | **Colaboração real (quente)** |
| Quem participa | Cliente → Pro | Cliente ↔ Prestador | **Cliente + Prestador + Sub + Fornecedor** |
| Rastro | Não | Perdido no chat | **Versionamento automático** |
| Conversão | Lead fria → agendamento | Ajuste manual → aprovação | **Aprovação no link = conversão** |
| Onboarding | Forçado | Nenhum | **Natural (convidado para colaborar)** |

---

## Riscos (e Mitigação)

| Risco | Mitigação |
|-------|-----------|
| Real-time sync complexo (conflito de edição) | Começar **assíncrono**: cliente comenta, prestador edita, versão salva. Real-time = Fase 2. |
| Cliente não tem smartphone/email | Link funciona no navegador; WhatsApp Web = fallback. |
| Subcontratado rouba cliente | Papéis: cliente vê tudo, subcontratado vê **só sua seção** (materiais/serviços dele). |
| Spam de convites | Limite: máx 3 convidados/orçamento. Prestador controla. |
| Performance mobile | Editor web já é responsivo; PWA = app-like. |

---

## Próximo Passo Imediato

> **Igor/CTO:** Topa teste 2 dias com 3 trios reais? Dev gasta 1h pra feature flag `orcamento_colaborativo` no painel (abrir editor para cliente via token + role). Se GO, editor real-time = próxima sprint.