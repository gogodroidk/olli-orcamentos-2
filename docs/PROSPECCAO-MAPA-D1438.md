# Prospecção no mapa (D-1438 G19)

Pedido do Igor no walkthrough de 27/10/2026: uma área de prospecção pelo Google Maps, a partir de onde o prestador está, para achar clientes por raio, rota e nicho.

Esta leva entrega a regra e um protótipo com os dados que a conta já tem. API paga do Google (Maps JavaScript, Places, Geocoding, Routes) fica de fora.

## O que o protótipo faz

- Mostra só os clientes já cadastrados na conta de quem está logado.
- Parte da base do cadastro (`empresa.baseLat` / `baseLon`, gravada pelo geocodificador grátis no Meu negócio) ou, no navegador, de “Onde estou”. A posição do aparelho fica na memória da tela e não é salva.
- Corta por raio: 2, 5, 10, 20 ou 50 km, em linha reta. Quem está exatamente no limite entra. Sem posição de partida, o raio não esconde ninguém — a tela diz isso.
- Ordena a rota pelo vizinho mais próximo, em linha reta, sem trânsito. O botão abre o Google Maps pelo link público de direções (o mesmo de “Traçar rota”), no máximo 10 paradas. O que passar disso é dito na tela, não cortado em silêncio.
- Filtra por nicho usando o equipamento já ligado ao cliente (categoria do cadastro). “Sem equipamento” é um filtro à parte. Se a leitura dos equipamentos falhar, o filtro não roda: tratar todo mundo como “sem equipamento” seria mentira.
- Quem não tem coordenada utilizável continua na lista “Sem ponto no mapa”. 0,0 e coordenada pela metade não são ponto.

Onde aparece:

- App: tela `Prospecção` (a partir de Clientes, da Conta e da barra lateral no desktop).
- No celular com o módulo do mapa, o fundo é o mesmo mapa grátis do Mapa do dia (MapLibre + OpenFreeMap). Sem esse módulo, vira esquema, e o componente já diz que não há mapa de fundo.
- Painel (`/prospeccao`): esquema desenhado na própria página, sem tile e sem enviar os pontos a um serviço de mapa.

## O que não faz

- Não busca estabelecimento, lead ou pessoa que não está na conta. Isso seria outra base de dados de terceiro (LGPD) e, no Google, a Places API, que é paga.
- Não geocodifica nesta tela. Quem ainda não tem ponto precisa completar CEP ou cidade e UF no cadastro; o fluxo que já existe é que grava a coordenada.
- Não calcula trânsito nem pedágio. O número de quilômetros da rota é linha reta. A frase na tela é “sem trânsito”.
- Não pede chave, não liga billing e não muda preço (Pro R$ 39, Empresa R$ 99).

## Quando o Igor quiser gente nova no mapa

Aí para. Precisa de decisão dele para pagar um provedor e de parecer do Dr. Paulo antes de guardar dado de quem não é cliente. Até lá, o protótipo não tem botão que prometa essa busca.

## Segunda leva (CQ-MAPA-LEVA2, 19/11/2026)

- A tela agora se chama **Mapa de clientes** (h1, menu, assistente). A rota `/prospeccao` continua valendo.
- Sem base no cadastro: ao abrir, pede "Onde estou" com uma frase explicando o porquê. Se negar ou falhar, mostra "Escolha de onde partir" com 2 botões (Usar onde estou / Informar o endereço da base). Nunca lista muda.
- "Informar o endereço da base" leva a `/meu-negocio#endereco`, que rola e foca o campo de endereço.
- Backfill dos clientes sem ponto: `node scripts/backfill-geo-clientes.mjs` (ENSAIO, só conta), `--aplicar` grava lat/lon/geo_precisao
  (só onde lat e lon são nulos e há CEP ou cidade+UF; nunca sobrescreve; lotes de 20 com pausa; arquivo de rollback JSONL),
  `--reverter <arquivo>` volta a nulo. Variáveis: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Teste: `npm run test:backfill-geo-clientes`.
