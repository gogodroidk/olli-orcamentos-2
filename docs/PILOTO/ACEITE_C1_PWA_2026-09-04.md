# Aceite local C1 — PWA instalável e offline seguro

## Resultado

O export web do aplicativo agora é instalável e continua abrindo após perda total
de rede. O cache contém somente o shell e os artefatos estáticos locais gerados
pelo Expo. Requisições externas, autenticação, APIs, mutações e dados de negócio
não entram no service worker.

## Defeito encontrado e corrigido

Na primeira implementação, o service worker assumia o controle depois que o
JavaScript e as fontes já tinham sido baixados. O HTML abria offline, mas a
interface ficava vazia. O pipeline `fix-cf-assets.mjs` agora injeta no service
worker a lista exata de bundles, fontes, imagens e WASM emitidos por cada export.
O identificador do cache continua derivado do conteúdo do HTML, portanto uma
versão nova instala um cache novo e remove somente caches OLLI antigos.

## Evidência

- `npm run export:web`: passou, 42 verificações estruturais;
- service worker recebeu 62 artefatos locais do build;
- `npm run qa:pwa`: passou em Chromium headless, viewport 390×844;
- manifesto instalável: passou;
- página controlada pelo service worker: passou;
- recarga completamente offline com interface visível: passou;
- título público `OLLI Orçamentos` preservado: passou;
- erros de console/página/rede durante a recarga offline: zero.

## Limite de aceite

Este aceite é local. Instalação manual em Android/iOS e comportamento depois de
um deploy continuam pertencendo ao gate de dispositivo/publicação, que não foi
executado nesta etapa.
