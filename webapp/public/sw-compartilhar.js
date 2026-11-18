/*
 * Service worker do painel — SÓ para receber contato compartilhado (D-2245).
 *
 * O WhatsApp (Android) "Compartilhar contato" manda um .vcf para o app escolhido.
 * Com o painel instalado, o manifest declara `share_target` (POST multipart em
 * /compartilhar-contato). Este worker pega o arquivo, guarda no Cache Storage e
 * manda para /clientes?compartilhado=1, onde a pessoa VÊ a prévia e confirma.
 *
 * Ele NÃO intercepta mais nada: sem cache de página nem de JS (o painel já tem a
 * armadilha do cache "imutável" na borda; um worker cacheando por cima seria pior).
 */
const CACHE = 'olli-compartilhado';
const CHAVE = '/compartilhado/contatos.json';
const LIMITE = 10 * 1024 * 1024;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.pathname !== '/compartilhar-contato') return;
  event.respondWith(
    (async () => {
      const itens = [];
      let falhou = false;
      try {
        const form = await event.request.formData();
        for (const f of form.getAll('contatos').slice(0, 10)) {
          if (f && typeof f === 'object' && typeof f.text === 'function' && f.size <= LIMITE) {
            itens.push({ nome: f.name || 'contato.vcf', texto: await f.text() });
          }
        }
        const texto = form.get('text');
        if (typeof texto === 'string' && /BEGIN:VCARD/i.test(texto)) itens.push({ nome: 'texto.vcf', texto });
      } catch (e) {
        falhou = true;
      }
      try {
        const cache = await caches.open(CACHE);
        await cache.put(CHAVE, new Response(JSON.stringify({ itens, falhou, em: Date.now() }), { headers: { 'content-type': 'application/json' } }));
      } catch (e) {
        /* sem Cache Storage: a tela de clientes avisa que não recebeu */
      }
      return Response.redirect('/clientes?compartilhado=1', 303);
    })(),
  );
});
