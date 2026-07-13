<!--
  ESTRATEGIA SUPERIOR do OLLI — sintese de pesquisa em forca total (2026-07-12).
  Metodo: 8 frentes de pesquisa web (concorrente profissadigital + concorrentes BR + benchmarks globais +
  customer-love + APIs de CNPJ + ferramentas por vertical + monetizacao por creditos/modulos + marketing),
  143 fontes citadas, sintetizadas por 2 estrategistas Fable, ancoradas na RE-AUDITORIA (docs/AUDITORIA_GERAL.md).
  Documento de DIRECAO — as decisoes de preco/produto marcadas [DECISAO DO DONO] aguardam o Igor.
-->

# ESTRATÉGIA — Como o OLLI vira superior a todos (e o cliente ama)

## A TESE (o vácuo que ninguém fecha)

O concorrente declarado, **profissadigital.com**, é **raso**: 7 funcionalidades genéricas (orçamento, recibo,
pagamento, despesas, clientes, relatório, alerta WhatsApp), plano único ancorado em ~R$49,90, **zero**
ferramenta vertical, **zero** CNPJ, **zero** créditos/módulos — e ~3.000 usuários diários no produto que
compete com o OLLI (o foco real da empresa é o SOMEI, varejo/MEI). As **Auvo / Field Control / Everflow** são
caras (R$200–5.000+/mês), opacas ("fale com consultor") e desenhadas para **equipes**, não para o autônomo — a
própria Auvo lançou o *Opergo* para autônomos e ele tem tração quase nula. Os **padrões-ouro globais** (Jobber,
Housecall Pro, ServiceTitan) provam o que o cliente final acha "surreal" — portal com pagamento, "a caminho"
com GPS, review automático no Google — mas custam US$59–500/técnico e **não existem adaptados a PIX/WhatsApp**.

> **OLLI = o único sistema 100% dedicado ao prestador de campo brasileiro que (1) entende o negócio do usuário
> no segundo zero via CNPJ→CNAE→vertical, (2) entrega a ferramenta ÚNICA de cada vertical que hoje vive em
> Word/planilha, (3) dá ao cliente FINAL do prestador uma experiência nível Jobber via link público + PIX +
> WhatsApp, e (4) cobra por créditos e módulos com tabela pública e transparente num mercado de preço escondido.**

O OLLI não precisa inventar: importa o padrão-ouro americano adaptado ao Brasil e empilha especialização
vertical em cima do que já construiu (OS, portal com trilha, PMOC, voz IA, ETA, Stripe) — duas gerações à
frente do que as empresas brasileiras usam hoje.

---

## OS DIFERENCIAIS MATADORES (priorizados por "uau ÷ esforço")

> Os dois estrategistas convergiram. Esforço estimado dado que o OLLI já tem worker+Supabase+RN+IA+portal.

| # | Diferencial | Por que o cliente acha "surreal" | Esforço |
|---|---|---|---|
| 1 | **Cadastro mágico por CNPJ** | em 30s o app "já conhece" o negócio — nenhum concorrente BR tem | **M** |
| 2 | **Orçamento com a cara do segmento (auto)** | template/tema visual do ramo no 1º minuto — *pedido explícito em review, ninguém atendeu* | **P** |
| 3 | **Calculadora embutida no item** (m²→tinta, kWh→painéis, metro linear) | a conta acontece DENTRO do item e vira preço; hoje ele sai pro site da Suvinil | **P** |
| 4 | **Falou → virou orçamento em 60s, no tema do segmento** | a voz IA já existe; o "uau" é o empacotamento (áudio 20s → orçamento pronto pra WhatsApp) | **P** |
| 5 | **Documento que vale dinheiro por vertical** | certificado ANVISA, laudo NR-10, estanqueidade, anamnese — o papel que o cliente do prestador PRECISA na fiscalização | **M** |
| 6 | **Portal onde o cliente aprova E PAGA por PIX** | fecha o ciclo sem cobrar "na mão" — é o Client Hub da Jobber, nenhum BR tem | **M** |
| 7 | **"Seu técnico está a caminho" com mapa ao vivo no WhatsApp** | padrão-ouro Housecall Pro; o cliente mostra pro vizinho; `expo-location` já existe | **M** |
| 8 | **Review automático no Google via WhatsApp** (OS concluída → pedido + 2 lembretes) | reputação é o que traz cliente novo; Jobber cobra caro por isso | **P/M** |
| 9 | **Manutenção recorrente para QUALQUER vertical** | reusa a arquitetura PMOC (jardim mensal, dedetização semestral, revisão elétrica) → receita previsível (membership = 25–40% da receita nos melhores) | **P/M** |
| 10 | **"Feito com OLLI" + indicação paga em créditos** | cada orçamento enviado = mídia grátis (loop Calendly); indicar colega = crédito (modelo GetNinjas) → CAC ~zero | **P** |
| 11 | **Preço público, crédito que não expira** | num mercado que esconde preço, transparência + trava de preço viram argumento de venda | **M** |
| 12 | **Agendamento online autônomo** | Online Booking da Jobber, inexistente nativo no BR | **G** (depois) |

**Regra de priorização:** esgotar os **P/M** antes de qualquer **G**. Os itens 2, 3, 4 e 10 são o maior
"uau por esforço" — o PDF brand-aware, a voz e o portal já existem; falta empacotar.

---

## ONBOARDING MÁGICO POR CNPJ (o design)

**API:** **BrasilAPI** como fonte primária — gratuita, sem chave, testada ao vivo, retorna `razao_social`,
`nome_fantasia`, `cnae_fiscal` + descrição, `cnaes_secundarios[]`, endereço, `porte`, `opcao_pelo_mei`, QSA
(`GET brasilapi.com.br/api/cnpj/v1/<cnpj>`). **Fallback pago:** Casa dos Dados (R$0,01/consulta, reconsulta
grátis em 30 dias) quando a BrasilAPI falhar/estiver defasada. **Cache por CNPJ de 30 dias no Supabase; o
worker Cloudflare faz o proxy — o app nunca chama a API direto** (mesmo padrão do `/eta`).

**Fluxo (termina em "primeiro orçamento enviado", não em "configurar organização"):**
1. Tela única **"Digite seu CNPJ"** com **"Não tenho CNPJ" visível** (19 mi de autônomos sem CNPJ não podem
   bater na porta fechada → picker manual de segmento com os mesmos resultados).
2. **Autofill instantâneo**: nome, endereço, logo placeholder — o usuário só confirma.
3. **Motor CNAE→vertical** (tabela local): `4322-3/02`→HVAC/refrigeração, `4321-5/00`→elétrica,
   `4322-3/01`→hidráulica, `4330-4/03`→pintura, `8122-2/00`→dedetização, `8130-3/00`→jardinagem, classes
   `43xx/81xx/95xx`→demais. Olhar `cnaes_secundarios` para híbridos (ex.: hidráulica+refrigeração → sugere 2).
4. **"Detectamos que você trabalha com X"** — as ferramentas sugeridas viram **cards ligáveis** (ex.: elétrica
   → checklist NR-10, template de laudo, orçamento com ART). O usuário **AJUSTA livremente**: remove, adiciona
   verticais, liga/desliga ferramentas. **A dedução é só o default inteligente — nada é imposto.**
5. O **template visual do orçamento já vem tematizado** pelo segmento.
6. Fim obrigatório em **"crie seu primeiro orçamento agora"** com import de contato da agenda (72% abandonam
   onboarding longo; 60% da conversão freemium→pago acontece até o dia 14).

> **Bônus estratégico:** o cadastro por CNPJ formaliza a venda como B2B/institucional, o que sustenta o
> enquadramento na exceção 3.1.3(c) *Enterprise* da Apple (ver Monetização).

---

## MULTI-VERTICAL: a ferramenta-assinatura de cada segmento

**Regra:** não abrir vertical nova sem (a) a ferramenta-única pronta e (b) um canal/comunidade para distribuir.
Vertical sem ferramenta própria é só mais um dropdown — o modelo raso do profissadigital.

| Ordem | Vertical (CNAE) | Ferramenta-assinatura (ninguém genérico tem) | Canal |
|---|---|---|---|
| 1 | **HVAC/Refrigeração** (já existe) | PMOC completo + QR por equipamento + voz IA — *polir para ser melhor que o da Auvo* | Clube dos Refrigeristas (49 grupos WhatsApp) |
| 2 | **Elétrica** (4321-5/00) | Checklist NR-10 + gerador de laudo p/ o engenheiro assinar + campo ART | maior adjacência com HVAC |
| 3 | **Hidráulica** (4322-3/01) | Laudo de estanqueidade padronizado (pressão inicial/final, tempo, foto) — laudo avulso custa R$3–7 mil hoje | — |
| 4 | **Dedetização** (8122-2/00) | Certificado ANVISA RDC 622/2022 (validade, produto, responsável técnico) — o síndico/restaurante PRECISA mostrar | naturalmente recorrente |
| 5 | **Jardinagem** (8130-3/00) | Contrato de manutenção recorrente + checklist por visita — reusa PMOC quase sem dev | — |
| 6 | **Pintura** (4330-4/03) | Calculadora m²→litros embutida no item do orçamento | — |
| fila | Solar (dimensionamento NBR 16274 + ANEEL), TI (laudo de diagnóstico), Marcenaria (metro linear + memorial), Estética a domicílio (ficha de anamnese) | após tração | — |

---

## MONETIZAÇÃO: créditos + módulos + planos  [DECISÃO DO DONO nos preços]

Arquitetura em 3 camadas (estilo ZapSign + filosofia Canva: um saldo único, pesos nos bastidores):

**(A) PLANOS-BASE**
- **Grátis** — orçamentos/recibos limitados/mês, 1 usuário, marca OLLI no PDF/portal (*o freemium É o canal de aquisição*).
- **Profissional ~R$39,90/mês** — ilimitado, sem marca, portal completo, 1 vertical com ferramenta-assinatura. *Deliberadamente ABAIXO dos R$49,90 do profissadigital* para vencer a 1ª comparação.
- **Empresa ~R$99,90/mês** — multi-usuário, papéis, PMOC/recorrência multi-vertical, relatórios. **⚠️ FECHAR JÁ o paywall que a auditoria achou aberto** — sem ele não há evento de conversão para medir.

**(B) CRÉDITOS OLLI** (saldo único, peso = custo real)
- voz IA (Gemini Flash-Lite, fração de centavo): **1 crédito** · lembrete WhatsApp utilidade (~R$0,034): **1** ·
  WhatsApp marketing (~R$0,31): **5** · consulta CNPJ além do cache (R$0,01): **1** · review Google + follow-ups: **3**.
- Pacotes: 100 cr **R$14,90** / 500 **R$59,90** / 1.500 **R$149,90**. Planos incluem mesada (Profissional 100/mês, Empresa 500/mês).
- **Promessas que viram marketing: tabela pública + crédito comprado NÃO expira.**

**(C) MÓDULOS avulsos ~R$19,90–29,90/mês** cada: Ferramenta vertical extra · Radar de Cobrança turbinado ·
Reviews Google · Indicação/Referral · Agendamento online público.

**RECONCILIAÇÃO IAP/Stripe/PIX:** fonte da verdade = **`credit_ledger` imutável no Supabase** (concessão/consumo/
expiração, `origem = stripe|pix|iap|promo|referral`), consumo reportado pelo worker; Stripe Billing Credits/Meters
como espelho de auditoria. **Rotas:** web/painel = **PIX** (Pix Automático para recarga — centavos vs 2–3,5% do
cartão, maior margem) + cartão Stripe; Android = checkout próprio (política Google 2026 liberou billing alternativo);
iOS = enquadrar na exceção 3.1.3(c) vendendo a organizações (CNPJ sustenta) e direcionar compra ao painel web; se a
Apple recusar, vender créditos via IAP com Small Business Program (15%) e preço IAP ~18% maior. **O webhook de cada
gateway só escreve no ledger após confirmação — nunca conceder crédito otimista.**

---

## MARKETING & CRESCIMENTO (por CAC crescente)

1. **Instrumentar o growth loop que JÁ existe:** rodapé *"Feito com OLLI — crie seu orçamento grátis"* no portal
   público, deep-link + UTM por prestador (estrutura Calendly, custo zero, cada orçamento é mídia). Medir cadastros por link.
2. **Indicação paga em créditos** (modelo GetNinjas): indicou colega que ativou = créditos p/ ambos; reusa a infra de billing.
3. **Comunidades verticais antes de mídia paga:** Clube dos Refrigeristas para HVAC (presença como ferramenta útil, não anúncio); mapear a comunidade equivalente ANTES de abrir cada vertical.
4. **Ativação é a métrica-mestra:** "primeiro orçamento enviado e visualizado" nos primeiros dias (mediana de conversão freemium 2,6%; top quartil 5–8%). Toda comunicação pós-cadastro (push + WhatsApp de serviço grátis na janela 24h) mira o dia 0–14.
5. **Retenção pela recorrência:** prestador com contratos de manutenção ativos não cancela — a recorrência do CLIENTE é o lock-in do OLLI.
6. **Copy com prova numérica REAL** (taxa de aprovação via portal, tempo até aprovação) — o profissadigital usa "70%/R$36 mil/ano" sem lastro; o OLLI pode ser honesto e mais forte.
7. **Google Ads só depois**, em termos de altíssima intenção ("app PMOC", "sistema ordem de serviço ar condicionado").

---

## LOGIN / APP PERFEITO (as 4 garantias) — ancorado na auditoria

O achado **P0** da auditoria (login sobrescreve a empresa real com dados em branco) é o começo. "Perfeito"
para um app offline-first multi-tenant = 4 garantias invioláveis:

1. **NUNCA destruir dado local sem reconciliar.** Ao logar, comparar a fila offline local vs o estado remoto e
   fazer **merge** (ou perguntar), jamais "zera e baixa". **Regra dos 3 estados:** "não sei" (erro de rede/sessão
   indeterminada) ≠ "não tem" — erro de auth ou perfil que não carregou **NUNCA** pode cair no fluxo de
   conta-nova/Onboarding (foi exatamente o mecanismo do P0). Ver `olli-gate-erro-vira-vazio`.
2. **Troca de conta/organização é explícita e segura.** Storage local particionado por `user_id+org_id`; dados
   pendentes da conta anterior são sincronizados ou descartados pelo usuário antes do switch (fecha o P0-B/P0-C).
3. **Backup de equipe é patrimônio da ORGANIZAÇÃO.** Snapshot da fila pendente antes de qualquer logout; o dono
   (Empresa) vê "pendências não sincronizadas por membro" — o trabalho do técnico não morre com o celular dele.
4. **Reentrar é instantâneo e barato.** Sessão longa com refresh silencioso, biometria, detecção "este e-mail já
   tem conta" no cadastro (evita conta duplicada), uma única chamada de sessão na abertura (o flood de
   `/auth/v1/user` já foi tratado — manter como gate de regressão).

> **Critério de aceite único:** *um técnico com 10 OS preenchidas offline pode perder sinal, errar a senha duas
> vezes, logar em outro aparelho e trocar de organização — e nenhuma OS se perde em nenhum desses caminhos.*
> Sem isso, o resto da estratégia desmorona: **a confiança é o produto.**

---

## ROADMAP DE EXECUÇÃO (por alavancagem, não inverter)

- **FASE 0 — Estancar sangramentos (dias):** corrigir o P0 de perda de dados no login + fechar o paywall do plano
  Empresa. *Nada abaixo importa se o app apaga trabalho do usuário, e sem paywall não há conversão para medir.*
- **FASE 1 — Aquisição (2–4 sem):** onboarding por CNPJ completo (BrasilAPI + CNAE→vertical + ajuste + tema por
  segmento) terminando no 1º orçamento; calculadora no item (pintura/marcenaria); temas visuais por segmento;
  empacotar voz→orçamento em 60s; rodapé "Feito com OLLI"; import de contatos.
- **FASE 2 — Receita (3–6 sem):** `credit_ledger` no Supabase + compra PIX/Stripe no painel + tabela pública +
  mesada por plano; 1º módulo vendável: **Reviews Google via WhatsApp** (baixo custo, alto valor, valida o trilho).
- **FASE 3 — Encantamento (4–6 sem):** portal do cliente 2.0 (pagamento PIX no link de aprovação, histórico de OS,
  "pedir novo serviço") + "a caminho" com GPS no WhatsApp. *É o pacote que faz o cliente final achar "surreal".*
- **FASE 4 — Expansão vertical (1/mês):** Elétrica → Hidráulica → Dedetização → Jardinagem → Pintura, cada uma com
  a ferramenta-assinatura + o mapeamento de comunidade do segmento.
- **FASE 5 — Growth composto:** indicação em créditos, agendamento online, iOS (exceção B2B), e só então mídia paga.

**Racional da ordem:** confiança (F0) → funil de entrada (F1) → motor de receita (F2) → boca-a-boca do cliente
final (F3) → superfície de mercado (F4) → aceleradores (F5). *Abrir vertical nova antes do paywall e do onboarding
é encher balde furado.*

---

## FONTES-CHAVE (143 no total, verificadas)
Concorrente: [profissadigital.com](https://profissadigital.com/), [Reclame Aqui](https://www.reclameaqui.com.br/empresa/app-profissa/), [Play Store (com.orcamento.pro)](https://play.google.com/store/apps/details?id=com.orcamento.pro). BR: [Auvo](https://www.auvo.com/), [Field Control](https://fieldcontrol.com.br/), [Produttivo](https://www.produttivo.com.br/planos/), [Everflow](https://everflow.com.br/). Global: [Jobber Client Hub](https://www.getjobber.com/features/client-hub/), [Housecall Pro financing](https://www.housecallpro.com/features/consumer-financing/), [ServiceTitan memberships](https://help.servicetitan.com/docs/grow-recurring-revenue-with-memberships-1). CNPJ: [BrasilAPI](https://brasilapi.com.br/docs), [CNPJá](https://cnpja.com/en/api), [Casa dos Dados](https://portal.casadosdados.com.br/precos), [CNAE IBGE](https://concla.ibge.gov.br/busca-online-cnae.html). Verticais: [NR-10](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-10-nr-10), [ANVISA RDC dedetização](https://www.termitek.com.br/rdc-622-2022-e-a-obrigatoriedade-do-controle-preventivo-de-pragas/), [calculadora Suvinil](https://www.suvinil.com.br/calculadora-de-tinta).
