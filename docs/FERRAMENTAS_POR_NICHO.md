# Roadmap de Ferramentas a Construir — OLLI (por ofício)

## TIER 0 — Construir PRIMEIRO (maior valor / menor esforço; várias servem múltiplos ofícios)

Todas P (pequeno) ou P/M de esforço, todas offline (form → cálculo local → PDF via HTML, no padrão orçamento/PMOC/certificado ANVISA que o app já tem).

**1. Termo de Garantia / Laudo genérico de serviço (TODOS os ofícios)**
- Tipo: gerador-doc. Entradas: cliente, endereço, serviço executado, materiais usados (marca/lote), data, prazo comercial de garantia → Saída: PDF assinável.
- Norma: **CDC art. 26** — garantia legal mínima de 90 dias para serviço durável é o piso que o termo não pode reduzir; a garantia comercial é adicional. Um único componente parametrizável atende pintura, hidráulica, HVAC, elétrica, dedetização, jardinagem.

**2. Motor de "Calculadora de Rendimento de Material" (TODOS)**
- Tipo: calculadora. Padrão único: `qtd = área × consumo_por_unidade × nº_demãos/camadas × (1+%perda)`, arredondado para embalagem comercial. Instanciável para: massa/textura (pintura), grama em placa + adubo (jardinagem), tinta, substrato de cova. Entradas: área/comprimento, consumo do produto (editável), demãos, % perda → Saída: qtd + nº de embalagens + linha pronta pro orçamento.
- Base: fichas técnicas de fabricante (valores default editáveis, nunca fixos).

**3. Calculadora de BTU / Carga Térmica (HVAC)**
- Entradas: área m², sol (não/sim/cobertura), nº pessoas >2, nº eletrônicos → Saída: BTU/h + capacidade comercial (9k/12k/18k/22k/24k/30k) + frase pro orçamento.
- Regra consolidada: **600 BTU/h·m²** (sem sol) / **800 BTU/h·m²** (com sol), **+600 BTU/h** por pessoa acima de 2 e por eletrônico. Lógica simplificada da **NBR 16401-1:2008**; sinalizar que projeto comercial grande exige memorial detalhado.

**4. Tabela Pressão-Temperatura por gás refrigerante (HVAC)**
- Tipo: referência offline. Entradas: gás (R22/R410A/R32/R404A/R290/R134a), pressão (psi/bar) → Saída: temp. de saturação. Tabelas termodinâmicas públicas de fabricante (Chemours/Honeywell) carregadas estáticas. É a consulta que o técnico faz várias vezes/dia.

**5. Teste de Estanqueidade — timer + laudo (HIDRÁULICA)**
- Entradas: tipo (tubulação/reservatório), pressão de serviço, foto do manômetro, assinatura → Saída: PDF de laudo.
- Norma **NBR 5626**: pressão de teste = **1,5× a pressão estática de serviço**, mantida **≥1 h** (tubulação) sem queda; reservatório: nível máx. por **≥72 h**. Protege o profissional depois que fecha a parede.

**6. Dimensionador de Caixa d'Água (HIDRÁULICA)**
- Entradas: nº pessoas, uso, dias de reserva → Saída: volume mín. (L) + combinação de caixas comerciais.
- `Volume = consumo_per_capita × pessoas × dias`. Referência **150–200 L/pessoa·dia** (Macintyre/Creder); a NBR 5626 delega o número ao projeto — deixar explícito, não travar num valor.

**7. Calculadora de Diluição e Consumo de Produto (DEDETIZAÇÃO; reaproveita em pintura)**
- Entradas: área/volume do tanque, dose do rótulo (mL/g por L), rendimento (m²/L) → Saída: mL/g de concentrado + litros de água.
- `volume_calda = área ÷ rendimento; qtd = dose_rótulo × volume_calda`. NUNCA fixa dose — usa o rótulo (registro MAPA/ANVISA, exigência **RDC 622/2022**). O mesmo motor vira a Tabela de Diluição por Produto da pintura.

**8. Calculadora de Mudas de Cerca Viva + Cova/Substrato (JARDINAGEM)**
- Entradas: comprimento linear / porte da planta → Saída: nº de mudas, m³ de vala/substrato, nº de sacos.
- `mudas = comprimento/espaçamento + 1`; berço 40×40 cm; covas 60/40/20 cm por porte (CPT/Árvores do Brasil). Resolve o problema nº1 do ramo: comprar certo, sem 2ª ida à loja.

---

## Ar-condicionado / Refrigeração (HVAC)

**BTU / Carga Térmica** — (ver Tier 0 #3).

**Tabela P-T por gás** — (ver Tier 0 #4).

**Carga de Gás Refrigerante Adicional** · calculadora · P
- Entradas: capacidade (BTU), gás, carga de fábrica (etiqueta, editável), comprimento real da tubulação, comprimento padrão de fábrica → Saída: gramas a completar + carga total final.
- Prática de fabricante (Daikin/Gree/LG/Springer): **R410A = 20 g/m** excedente para 9k–12k, **30 g/m** para 18k–30k. Tabela editável para R22/R32; sempre "confirmar no manual" (não há NBR única).

**Diagnóstico por Superaquecimento/Subresfriamento** · calculadora · M
- Entradas: tipo de válvula (capilar/orifício fixo vs TXV/EEV), pressões e temperaturas de sucção/líquido, bulbo seco externo, bulbo úmido interno → Saída: SH/SC em °C + veredito (carga baixa/correta/excessiva).
- `SH = temp_sucção − temp_saturação_evap` (via tabela P-T); alvo por Target Superheat Chart (Copeland/Carrier) para orifício fixo. `SC = temp_saturação_cond − temp_linha_líquido`; alvo típico **4–7 °C (8–12 °F)** em TXV — confirmar no manual.

**Laudo de Vácuo e Estanqueidade** · laudo · P
- Entradas: vácuo atingido (microns), tempo, decaimento após isolar bomba, foto do vacuômetro → Saída: PDF aprovado/reprovado.
- Exigência de fabricante p/ garantia: vácuo-alvo **≤ 500 microns (0,5 torr)**, subida dentro de tolerância. Sem NBR residencial específica — diretrizes de fabricante/RETA/ASHRAE citadas no laudo.

**Disjuntor e Bitola do Compressor** · calculadora · M
- Entradas: corrente nominal (placa), circuito (mono/tri), método de instalação, comprimento → Saída: disjuntor (A + curva) + seção mín. (mm²).
- **NBR 5410 §5.3.4.1**: `Ib ≤ In ≤ Iz` e `I2 ≤ 1,45·Iz`; margem prática **+25%** sobre a nominal para partida; ampacidade por método (B1/B2/C).

---

## Elétrica (instalador eletricista)

**Dimensionador de Circuito (fio + disjuntor + queda de tensão)** · calculadora · G — *carro-chefe do ofício*
- Entradas: carga (W ou A), tensão, comprimento até o quadro, método de instalação → Saída: seção (mm²), disjuntor (A + curva B/C/D), % queda de tensão + memorial PDF.
- **NBR 5410**: ampacidade por método (tabelas 36–39); `Ib ≤ In ≤ Iz`; queda máx. **4%** em circuito terminal, **7%** total origem-uso, **3%** origem-QD. Curvas **NBR IEC 60898** — B: 3–5× In (iluminação/TUG), C: 5–10× In (indutiva leve), D: 10–20× In (motores).

**Checklist de Pontos Obrigatórios por Cômodo** · checklist · M
- Entradas: área/perímetro por cômodo → Saída: tomadas + pontos de luz mínimos, VA estimado, lista de material, PDF.
- **NBR 5410**: sala/dormitório **1 tomada/5 m** de perímetro (mín. 2); cozinha/área de serviço/banheiro **1/3,5 m** (mín. 2 sobre bancada); potência **600 VA** p/ as 3 primeiras + **100 VA** cada adicional; mín. 1 ponto de luz no teto por cômodo.

**Laudo de Verificação da Instalação** · laudo · M
- Entradas: dados do imóvel, itens OK/NOK/NA, teste do DR → Saída: PDF com pendências e assinatura.
- **NBR 5410 seção 6** (verificação inicial): inspeção visual, continuidade do PE, resistência de isolamento, teste do botão TEST do DR (**NBR IEC 61008/61009**).

**Calculadora de Eletroduto (taxa de ocupação)** · calculadora · P
- Entradas: nº e bitola dos cabos → Saída: diâmetro comercial mín. + % ocupação.
- **NBR 5410 §6.2.11.1**: ocupação máx. **53%** (1 cabo), **31%** (2), **40%** (3+).

**Luminotécnica Básica** · estimador · M
- Entradas: área, uso, lumens da luminária → Saída: nº de luminárias + lux estimado.
- **NBR ISO/CIE 8995-1** (corredor 100 lux, sala ~150–200, cozinha 200, escritório 500). `nº = (área × lux) / (lumens × ~0,8)`.

---

## Hidráulica

**Estanqueidade + timer/laudo** — (ver Tier 0 #5). **Caixa d'água** — (ver Tier 0 #6).

**Dimensionador de Água Fria (Método dos Pesos)** · calculadora · M
- Entradas: peças do trecho (peso pré-cadastrado), pressão, material → Saída: diâmetro mín. (mm/pol) + memorial.
- **NBR 5626**: `Q(l/s) = 0,30 × √(Σ pesos)`; escolher diâmetro com **V ≤ 3,0 m/s** e pressão estática **≤ 400 kPa**.

**Perda de Carga (Hazen-Williams)** · calculadora · M
- Entradas: vazão (ou puxa da ferramenta acima), diâmetro, comprimento + % conexões, material → Saída: perda (mca) + pressão residual + alerta abaixo do mínimo do aparelho.
- `J = 10,643 × (Q/C)^1,85 × D^-4,87` (Q em m³/s, D em m). C: PVC/CPVC ≈150, cobre ≈140, galvanizado ≈100–130.

**Fossa Séptica + Sumidouro** · calculadora · G — *forte em obra rural sem rede*
- Entradas: nº contribuintes, tipo, solo → Saída: volume do tanque (L), área do sumidouro (m²), memorial PDF.
- **NBR 7229**: `V = 1000 + N×(C×T + K×Lf)` (C, T, K, Lf das tabelas 1–3). Sumidouro **NBR 13969**: `A = volume_diário ÷ taxa_de_aplicação` (varia com o solo).

**Ramal e Declividade de Esgoto** · calculadora · M
- Entradas: peças (UHC pré-cadastrada), tipo de trecho → Saída: diâmetro mín. + declividade + memorial.
- **NBR 8160**: diâmetro pelo Σ UHC (vaso = 6 UHC → ramal mín. 100 mm); declividade **2%** (Ø ≤ 75 mm) / **1%** (Ø ≥ 100 mm).

---

## Pintura

**Termo de Garantia** — (ver Tier 0 #1). **Rendimento de massa/textura** — (ver Tier 0 #2).

**Tabela de Diluição por Produto** · referência · P
- Entradas: tipo de produto → Saída: % de diluição + diluente (água × aguarrás/thinner).
- **NBR 13245**: diluição conforme fabricante/substrato. Base água (acrílica/textura até ~5%, nunca thinner); base solvente (esmalte/verniz) com aguarrás/thinner.

**Checklist de Preparo de Superfície** · checklist · M
- Entradas: substrato, novo/repintura, mofo/umidade/gordura → Saída: PDF anexável (prova técnica contra reclamação de descascamento).
- **NBR 13245**: superfície firme, limpa, seca; aplicação **10–40 °C**; cura de reboco novo **~28 dias**.

**Checklist de Segurança em Altura (fachada)** · checklist · M
- Entradas: altura, tipo de acesso, executante → Saída: PDF assinável.
- **NR-35** (acima de 2,00 m): treinamento 8 h/validade 2 anos, ASO, PT, análise de risco, cinto paraquedista + talabarte duplo; **NR-18 18.15/18.16**: guarda-corpo, rodapé, ancoragem.

**Estimador de Tempo de Secagem/Repintura** · estimador · P
- Entradas: tipo de tinta, interno/externo, temperatura → Saída: tempo até próxima demão + liberação do ambiente.
- Fichas técnicas: acrílica repintura ~4 h; esmalte ~16 h; verniz 12–24 h. Faixa **10–40 °C** (NBR 13245); dobrar intervalo abaixo de 10 °C.

---

## Dedetização / Controle de Pragas

**Diluição e Consumo de Produto** — (ver Tier 0 #7).

**Ordem de Serviço / Comprovante de Execução** · gerador-doc · M
- Entradas: praga-alvo, método, produto + registro MAPA/ANVISA, área, técnico + registro, garantia → Saída: PDF de comprovante.
- **RDC 622/2022** (substituiu a RDC 52/2009): exige comprovante com praga controlada, produto, metodologia e responsável técnico. Complementa o certificado de garantia que o app já tem.

**Referência de FDS + Primeiros Socorros por Produto** · referência · M
- Entradas: produto, princípio ativo, registro, EPI, sintomas, primeiros socorros (da FDS) → Saída: tela/PDF com ação de emergência em destaque, offline.
- **NBR 14725:2023** (FISPQ → FDS, obrigatória desde 04/07/2025). Emergência: **Disque-Intoxicação 0800-722-6001** (Sinitox/Fiocruz).

**Controle de Contrato + Alerta de Garantia** · estimador · M
- Entradas: cliente, praga, periodicidade, última visita, prazo de garantia da OS → Saída: lista de vencimentos + cronograma anual PDF.
- `vencimento = última_visita + periodicidade`; `alerta = data_OS + garantia_declarada` (obrigação da RDC 622/2022). Venda recorrente + cumprimento do prazo assinado.

**Checklist de Vistoria Pré-Serviço** · checklist · P
- Entradas: ambiente, praga, pontos vistoriados, grau de infestação, recomendações não-químicas → Saída: PDF anexo ao orçamento.
- **MIP** (Manejo Integrado de Pragas, boa prática OMS/ANVISA na própria RDC 622/2022).

**Laudo de Controle Integrado p/ Food Service** · laudo · M
- Entradas: CNPJ, pragas, produtos/registros, periodicidade, próxima intervenção, RT → Saída: PDF para a vigilância sanitária do cliente.
- **RDC 216/2004**: Controle Integrado de Pragas é PPHO documentado obrigatório. Cliente recorrente (pré-requisito do alvará dele).

---

## Jardinagem / Paisagismo

**Mudas de cerca viva + cova/substrato** — (ver Tier 0 #8).

**Grama em Placa/Rolo + Adubação de Plantio** · calculadora · P
- Entradas: área m², formato da placa (0,24/0,25/0,40 m²) → Saída: nº de placas, kg de adubo, kg de calcário, linha pro orçamento.
- `placas = (área/área_placa) × 1,10`. Plantio: **60–100 g/m² NPK 04-14-08** + **300 g/m² calcário dolomítico** incorporados antes do plantio.

**Adubação de Manutenção (NPK) + Calendário** · calculadora · P
- Entradas: área, fórmula NPK, frequência → Saída: kg por aplicação + calendário anual.
- **NPK 10-10-10: 30–50 g/m²**, mín. 3 aplicações/ano, sempre seguidas de irrigação. Gatilho de venda recorrente.

**Estimador de Irrigação** · estimador · M
- Entradas: área irrigada, cobertura, sistema → Saída: L/dia, L/mês, frequência sugerida.
- Evapotranspiração de gramado tropical **6–7 mm/dia**, Kc ≈0,8 → **~5 L/m²·dia**; aspersão +25% perda (**~6,25 L/m²·dia**).

**Laudo de Poda/Supressão de Árvore** · laudo · G — *maior potencial de monetização (exigência de prefeitura que ninguém formaliza)*
- Entradas: identificação (espécie, local, porte), diagnóstico (fitossanitário/risco/conflito), tipo de poda ou supressão, fotos → Saída: PDF para protocolar no órgão ambiental.
- Estrutura alinhada à **NBR 16246-1:2013** (tipos de poda e diagnóstico exigidos em autorização municipal).

**Orçamento de Manutenção Recorrente** · estimador · M — *o produto mais lucrativo do paisagista*
- Entradas: área, serviços/visita, frequência, preço por m²/visita (sempre do próprio profissional) → Saída: mensalidade + proposta + cronograma. Composição de custo simples, sem inventar preço de mercado.

---

**Notas de implementação transversais:** (a) todos os cálculos rodam offline, form → cálculo local → PDF (HTML), sem hardware; (b) onde a norma delega ao projetista (consumo per capita, dose de rótulo, carga de gás por marca, preço/visita), o app expõe o valor como **editável e nunca fixa como se fosse normativo** — regra recorrente de aterramento; (c) os motores genéricos do Tier 0 (#1 laudo/garantia, #2 rendimento, #7 diluição) são componentes únicos parametrizados que abatem esforço em vários ofícios de uma vez — construir esses três primeiro derruba o custo de tudo que vem depois.