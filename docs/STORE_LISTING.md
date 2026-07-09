# STORE_LISTING — texto pronto das fichas (Play Store + App Store)

> PT-BR, factual — só recursos que o app realmente tem hoje (2026-07-09). Se um recurso mudar de
> "atrás de flag" para "ligado" (ex.: equipe ao vivo no mapa nativo, IA sem cota), atualize este
> texto junto. Contagens de caracteres conferidas com `[...string].length` (conta corretamente
> acentos/emoji como 1 caractere).

---

## 1. Nome e subtítulo

| Campo | Texto | Limite | Usado |
| --- | --- | --- | --- |
| Nome do app (Play e Apple) | `OLLI Orçamentos` | 30 (Apple) / 30 (Play, "Nome do app") | 15 |
| Subtítulo (Apple, campo "Subtitle") | `Orçamentos para o técnico` | 30 | 25 |

## 2. Descrição curta (Play Store — campo "Descrição breve", 80 caracteres)

```
Orçamentos, recibos e OS para eletricistas e técnicos que atendem em campo
```
(74/80 caracteres)

## 3. Descrição longa (Play Store "Descrição completa" até 4000 / Apple "Descrição" sem limite curto)

```
OLLI Orçamentos é o app de gestão para quem atende serviço técnico em campo — eletricistas,
técnicos de HVAC/refrigeração e autônomos que vivem entre visitas, orçamentos e recibos.

MONTE ORÇAMENTOS EM MINUTOS
Catálogo de serviços e produtos, cálculo automático, PDF profissional com a marca (logo e cor)
do seu negócio, e um link de aprovação que você manda pro cliente pelo WhatsApp — ele aprova
direto pelo celular, sem precisar instalar nada.

RECIBOS E ORDENS DE SERVIÇO
Depois de aprovado, emita o recibo em um toque. Ordens de serviço organizam o trabalho do início
ao fim, com o histórico de cada cliente e equipamento.

DIAGNÓSTICO TÉCNICO OFFLINE
Uma base com centenas de códigos de erro de equipamentos HVAC, com causa provável e o que checar
— funciona mesmo sem internet, direto no bolso durante a visita.

ASSISTENTE OLLI (IA)
Dite o orçamento por voz enquanto ainda está na casa do cliente, ou pergunte pro assistente sobre
um código de erro ou uma dúvida técnica. O app converte a fala em orçamento estruturado, pronto
pra revisar e enviar.

CLIENTES, AGENDA E LEMBRETES
Cadastro de clientes, agenda de visitas com lembrete automático antes do horário, e um radar que
avisa quando um cliente antigo some do seu radar de vendas.

EQUIPE (plano Empresa)
Convide técnicos com papéis diferentes (administrador, gestor, técnico), cada um vendo só o que
precisa. Cadastro de equipamentos do cliente com etiqueta QR para consulta rápida na próxima
visita.

FUNCIONA OFFLINE, SINCRONIZA QUANDO TIVER INTERNET
Os dados ficam no aparelho por padrão (SQLite local) e sincronizam com a nuvem quando você loga —
sem perder trabalho por falta de sinal no meio da visita.

PLANOS
Grátis pra sempre: orçamentos, recibos, catálogo, clientes, agenda e diagnóstico offline, sem
limite. Planos Pro e Empresa adicionam relatórios de faturamento, metas de vendas, mais usos da
IA e gestão de equipe — veja os detalhes e preços dentro do app, na aba Conta.

Feito para quem trabalha na rua, não atrás de mesa.
```

(≈1750 caracteres — bem dentro do limite de 4000 da Play Store; a Apple não tem limite curto de
descrição, então o mesmo texto serve.)

## 4. Palavras-chave (Apple — campo "Keywords", 100 caracteres, separadas por vírgula sem espaço)

```
orcamento,eletricista,tecnico,servico,recibo,ordem de servico,os,campo,hvac,pmoc
```
(81/100 caracteres — não repita palavras que já estão no nome/subtítulo do app, como "orçamentos"
e "técnico", que a Apple já indexa sozinha a partir desses campos)

A Play Store não tem campo de keywords separado — a indexação usa o texto da descrição, por isso
a descrição longa (seção 3) já repete termos como "orçamento", "recibo", "ordem de serviço",
"eletricista", "técnico" e "HVAC" naturalmente.

## 5. O que há de novo (release notes desta versão — v1.1.0 / versionCode 9)

```
- Cadastro de equipamentos do cliente com etiqueta QR para consulta rápida em campo (novo)
- Melhorias de fluidez e animações nas telas de Hoje, Agenda e Conta
- Correções de estabilidade e ajustes de permissões
```
Ajuste esta lista a cada envio para refletir o que de fato mudou desde a versão anterior — puxe do
`docs/EXECUTION_LOG.md` (seção da onda mais recente) na hora de escrever a próxima.

## 6. Categoria e classificação etária

| Loja | Categoria sugerida | Classificação etária |
| --- | --- | --- |
| Google Play | Ferramentas — ou Negócios (as duas se aplicam; "Ferramentas" tende a converter melhor pra busca de "app de orçamento") | Livre — questionário IARC dentro da Play Console (sem conteúdo sensível: sem violência, sem conteúdo adulto, sem interação social não moderada) |
| Apple App Store | Business (Negócios) — categoria secundária opcional: Productivity | 4+ (sem conteúdo restrito) |

## 7. Roteiro de screenshots

Specs técnicas (confira o valor exato na hora de exportar — tamanhos mudam a cada linha de
aparelho nova, por isso o **[VERIFICAR]**):

- **Google Play**: 2 a 8 capturas de tela de celular, PNG ou JPEG 24 bits, lado menor ≥320px e
  lado maior ≤3840px, proporção entre 16:9 e 9:16. Mais o **ícone da loja** (512×512, PNG com
  alpha — reduza `assets/icon.png`, que já está em 1024×1024) e o **gráfico de destaque/feature
  graphic** (1024×500, sem texto pequeno, é o banner mostrado no topo da ficha).
- **App Store**: como `ios.supportsTablet` é `false` no `app.json`, só precisa de screenshots de
  iPhone (nenhum de iPad). **[VERIFICAR]** o tamanho obrigatório vigente na Apple — hoje é o da
  maior tela de iPhone suportada (histórico recente: 6.9"/6.7", 1290×2796 ou 1320×2868px conforme
  o aparelho de referência do momento do envio); a Apple costuma aceitar gerar os menores a partir
  do maior automaticamente. Ícone: 1024×1024 PNG **sem canal alpha** (a Apple rejeita ícone com
  transparência) — confira `assets/icon.png` antes de subir.

Como capturar: rode `npm run web` (mais rápido pra compor telas limpas) ou instale o `.apk`/`.ipa`
do perfil `preview` do `eas.json` num aparelho/simulador real e use dados de exemplo (não dados
reais de cliente). Ordem e legenda sugeridas (a mesma sequência serve pras duas lojas):

| # | Tela (arquivo) | Legenda sugerida |
| --- | --- | --- |
| 1 | `HojeScreen.tsx` | "Sua agenda de hoje, num relance" |
| 2 | `NovoOrcamentoScreen.tsx` (wizard de orçamento) | "Monte um orçamento em minutos, no local do serviço" |
| 3 | `VisualizarOrcamentoScreen.tsx` (preview do PDF) | "PDF profissional com a marca do seu negócio" |
| 4 | `CodigosErroScreen.tsx` | "Diagnóstico técnico offline, direto no bolso" |
| 5 | `OlliVozScreen.tsx` ou `OlliChatScreen.tsx` | "Dite o orçamento ou pergunte pro assistente Olli" |
| 6 | `AgendaScreen.tsx` | "Agenda com lembrete automático da visita" |
| 7 | `EquipamentoScreen.tsx` | "Cadastro de equipamentos com etiqueta QR" |
| 8 | `RelatorioDiaScreen.tsx` ou `PlanosScreen.tsx` | "Acompanhe faturamento e conversão" |

Use o tema escuro padrão do app (não force tema claro pra print) — é a identidade visual real do
OLLI, e screenshot que não bate com o app instalado é motivo comum de rejeição/reclamação.

## 8. Contato e URLs obrigatórias

| Campo | Valor |
| --- | --- |
| Política de privacidade (obrigatório nas duas lojas) | `https://olliorcamentos.online/privacidade` — confirme que está no ar antes de enviar |
| Site de suporte (Apple exige URL de suporte) | `https://olliorcamentos.online` |
| E-mail de contato (Play Console e App Store Connect) | e-mail do dono, a definir na hora do cadastro |
