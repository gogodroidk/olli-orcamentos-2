import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "publico");
const WA = "5511958758030";
const TEL = "+5511958758030";
const DOMINIO = "https://grtechrefrigeracao.com.br";
const v7 = JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.url)), "fonte", "conteudo-v7.json"), "utf8"));

const paginas = [
  { slug: "", titulo: "GR Tech · VRF, manutenção e contrato em São Paulo", desc: "Manutenção de VRF e VRV, contrato e visita técnica em São Paulo. Visita R$ 150, abatida se você fechar. Proposta por escrito." },
  { slug: "vrf", titulo: "Manutenção de VRF e VRV em São Paulo · GR Tech", desc: "VRF e VRV em prédio, escritório e comércio em São Paulo. A proposta sai depois de ver o sistema. Visita técnica R$ 150, abatida se você fechar." },
  { slug: "manutencao", titulo: "Manutenção de ar-condicionado para empresa · GR Tech", desc: "Manutenção preventiva e corretiva para empresa em São Paulo. Limpeza a partir de R$ 450 por aparelho de 9 a 12 mil BTU. O valor final sai na visita." },
  { slug: "contrato", titulo: "Contrato de manutenção de ar-condicionado · GR Tech", desc: "Contrato de manutenção para empresa em São Paulo, com visitas combinadas e o serviço escrito antes. O valor sai do levantamento." },
  { slug: "escritorios", titulo: "Ar-condicionado para escritório em São Paulo · GR Tech", desc: "Manutenção, VRF e contrato para escritório em São Paulo. Visita técnica R$ 150, abatida se você fechar." },
  { slug: "clinicas", titulo: "Ar-condicionado para clínica em São Paulo · GR Tech", desc: "Manutenção e contrato de ar-condicionado para clínica e consultório em São Paulo. Visita técnica R$ 150, abatida se você fechar." },
  { slug: "restaurantes", titulo: "Ar-condicionado para restaurante em São Paulo · GR Tech", desc: "Manutenção de ar-condicionado para restaurante e salão em São Paulo. Visita técnica R$ 150, abatida se você fechar." },
  { slug: "condominios", titulo: "Ar-condicionado para condomínio em São Paulo · GR Tech", desc: "VRF, manutenção e contrato para condomínio em São Paulo. Visita técnica R$ 150, abatida se você fechar." },
  { slug: "creditos", titulo: "Créditos das imagens · GR Tech", desc: "Origem e licença das fotos ilustrativas usadas nesta prévia da GR Tech." },
  { slug: "privacidade", titulo: "Privacidade · GR Tech", desc: "O que esta prévia faz com dados. A política do site publicado está em grtechrefrigeracao.com.br." },
];

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function prefixo(slug) {
  if (!slug) return "";
  return "../".repeat(slug.split("/").length);
}
function wa(texto) {
  return `https://wa.me/${WA}?text=${encodeURIComponent(texto)}`;
}
function icone() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v6A3.5 3.5 0 0 1 15.5 16H12l-3.2 2.4c-.6.4-1.3-.1-1.3-.8V16H8.5A3.5 3.5 0 0 1 5 12.5v-6Z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
}
function botao(href, rotulo) {
  return `<a class="bt" href="${esc(href)}" target="_blank" rel="noopener">${icone()}<span>${esc(rotulo)}</span></a>`;
}

function chrome(p, miolo) {
  const pre = prefixo(p.slug);
  const inicio = `${pre}index.html`;
  const nav = [
    ["VRF", `${pre}vrf/`],
    ["Serviços", `${pre}servicos/`],
    ["Empresas", `${pre}empresas/`],
    ["Preços", `${pre}precos/`],
    ["Como funciona", `${pre}como-funciona/`],
    ["Contato", `${pre}contato/`],
  ];
  const todas = [
    ["VRF", `${pre}vrf/`], ["Serviços", `${pre}servicos/`], ["Instalação", `${pre}instalacao/`], ["Limpeza e manutenção", `${pre}limpeza-e-manutencao/`], ["Conserto", `${pre}conserto/`], ["Manutenção", `${pre}manutencao/`], ["Contrato", `${pre}contrato/`],
    ["Empresas", `${pre}empresas/`], ["Segmentos", `${pre}segmentos/`], ["Casa", `${pre}casa/`], ["Apartamento e condomínio", `${pre}apartamento-e-condominio/`], ["Lojas e restaurantes", `${pre}lojas-e-restaurantes/`], ["Câmara fria", `${pre}camara-fria-e-refrigeracao-comercial/`],
    ["Escritórios", `${pre}escritorios/`], ["Clínicas", `${pre}clinicas/`], ["Restaurantes", `${pre}restaurantes/`], ["Condomínios", `${pre}condominios/`],
    ["Preços", `${pre}precos/`], ["Quanto custa", `${pre}quanto-custa/`], ["Como funciona", `${pre}como-funciona/`], ["Dúvidas", `${pre}duvidas/`], ["Sobre", `${pre}sobre/`], ["Atendimento", `${pre}atendimento/`], ["Contato", `${pre}contato/`], ["Resumo para IA", `${pre}resumo-para-ia/`],
  ];
  const linksTodas = todas.map(([nome, href]) => `<a href="${href}">${nome}</a>`).join("");
  const links = nav.map(([nome, href]) => `<a href="${href}">${nome}</a>`).join("");
  const msgTopo = "Oi, vim pelo site da GR Tech. É empresa em [bairro]. O que preciso: ___.";
  return `<!doctype html>
<html lang="pt-BR" data-tema="claro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#f0f4f8">
<title>${esc(p.titulo)}</title>
<meta name="description" content="${esc(p.desc)}">
${p.nao404 ? "" : `<link rel="canonical" href="${DOMINIO}/${p.slug ? p.slug + "/" : ""}">`}
<link rel="icon" href="${pre}favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${pre}estilo.css">
<script>
(function(){
  var h=new Date().getHours();
  var tema=(h>=6&&h<18)?"claro":"escuro";
  document.documentElement.dataset.tema=tema;
  var m=document.querySelector('meta[name="theme-color"]');
  if(m)m.setAttribute("content",tema==="escuro"?"#07121f":"#f0f4f8");
})();
</script>
</head>
<body>
<a class="pular" href="#conteudo">Pular para o conteúdo</a>
<header class="topo">
  <div class="caixa topo-in">
    <a class="marca" href="${inicio}"><img src="${pre}logo/logo-claro.svg" width="812" height="246" alt="GR Tech"></a>
    <nav class="nav-desk" aria-label="Páginas">${links}${botao(wa(msgTopo), "Chamar no WhatsApp")}</nav>
    <details class="nav-mob">
      <summary>Menu</summary>
      <nav aria-label="Menu">${linksTodas}<a href="${pre}creditos/">Créditos</a><a href="${pre}privacidade/">Privacidade</a></nav>
    </details>
  </div>
</header>
<main id="conteudo">${miolo}</main>
<footer class="rodape"><div class="caixa">
  <nav aria-label="Rodapé">${linksTodas}<a href="${pre}creditos/">Créditos das imagens</a><a href="${pre}privacidade/">Privacidade</a></nav>
  <p>44.301.204 IGOR DE SOUZA AQUINO · CNPJ 44.301.204/0001-38 · <a href="tel:${TEL}">(11) 95875-8030</a> · <a href="mailto:contato@grtechrefrigeracao.com.br">contato@grtechrefrigeracao.com.br</a></p>
  <p><a href="https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/Cnpjreva_Solicitacao.asp">Consultar CNPJ na Receita Federal</a></p>
  <p>São Paulo e Grande São Paulo. Segunda a sábado, 8h às 18h. Geladeira e freezer domésticos não entram neste atendimento.</p>
  <p>A primeira resposta no WhatsApp pode ser do atendimento com inteligência artificial. A visita, o orçamento e o serviço são de um técnico da GR Tech. Você pode pedir para falar com uma pessoa.</p>
</div></footer>
<div class="barra" data-barra>${botao(wa(msgTopo), "Chamar no WhatsApp")}<a class="bt bt-tel" href="tel:${TEL}"><span>Ligar</span></a></div>
<script>
(function(){
  var b=document.querySelector("[data-barra]");
  if(b){
    var atu=function(){b.classList.toggle("on",window.scrollY>420)};
    addEventListener("scroll",atu,{passive:true});
    atu();
  }
  var s=document.querySelector("[data-cena]");
  if(!s)return;
  if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  var rede=navigator.connection;
  if(rede&&rede.saveData)return;
  if(navigator.deviceMemory&&navigator.deviceMemory<=2)return;
  var feito=false;
  function carregar(){
    if(feito || document.querySelector("script[src*='cena-vrf']"))return;
    feito=true;
    var j=document.createElement("script");
    j.src=s.getAttribute("data-js");
    document.body.appendChild(j);
  }
  function perto(){
    var r=s.getBoundingClientRect();
    return r.bottom>-200 && r.top<innerHeight+200;
  }
  var armado=false;
  function armar(){
    if(armado)return;
    armado=true;
    if(window.IntersectionObserver){
      var io=new IntersectionObserver(function(es){
        if(!es.some(function(e){return e.isIntersecting}))return;
        io.disconnect();
        carregar();
      },{rootMargin:"200px"});
      io.observe(s);
    }
    addEventListener("scroll",function(){ if(perto())carregar(); },{passive:true});
    document.addEventListener("visibilitychange",function(){ if(!document.hidden&&perto())carregar(); });
    if(perto())carregar();
  }
  function ocioso(){
    var ric=window.requestIdleCallback;
    if(ric) ric(armar,{timeout:1200});
    setTimeout(armar,1200);
  }
  if(document.readyState==="complete") ocioso();
  else addEventListener("load",ocioso,{once:true});
})();
</script>
</body>
</html>
`;
}

function heroFoto(pre, src, srcset, w, h, alt, selo) {
  const set = srcset ? ` srcset="${esc(srcset)}" sizes="(min-width: 960px) 42vw, 100vw"` : "";
  return `<figure class="hero-foto"><img src="${pre}${src}"${set} width="${w}" height="${h}" alt="${esc(alt)}" fetchpriority="high" decoding="async"><span class="selo">${esc(selo)}</span></figure>`;
}

function cena(pre) {
  return `<section class="sec" id="cena" data-cena data-js="${pre}cena-vrf.js">
  <div class="caixa cena-g">
    <div class="cena-lead">
      <p class="olho">O sistema</p>
      <h2>Um equipamento no telhado, várias salas embaixo.</h2>
      <p class="sub">No VRF, as condensadoras ficam na cobertura e as evaporadoras ficam nas salas. A linha que liga as duas é o que a manutenção olha. Gire a ilustração. Ela não é foto do seu prédio e não substitui a visita.</p>
    </div>
    <div class="cena-visual">
      <div class="cena-palco" tabindex="0" aria-label="Ilustração giratória de um prédio com VRF. Arraste para os lados ou use as setas.">
        <div class="cena-poster">${posterSvg()}</div>
        <div class="cena-mundo" hidden>
          <div class="giro">
            <div class="bloco">
              <div class="face frente"><span class="janela"><i class="split"></i></span><span class="janela"><i class="split"></i></span><span class="janela"><i class="split"></i></span></div>
              <div class="face lado lado-dir"></div>
              <div class="face lado lado-esq"></div>
              <div class="face telhado"><i class="cond"></i><i class="cond"></i></div>
              <div class="linha"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="cena-extra">
      <ul class="lista">
        <li><span class="marca-ok" aria-hidden="true">1</span><span><b>Condensadora.</b> Fica no telhado. Se ela para, para mais de uma sala.</span></li>
        <li><span class="marca-ok" aria-hidden="true">2</span><span><b>Linha.</b> Leva o fluido entre a cobertura e os andares. Vazamento e isolamento ruim aparecem aqui.</span></li>
        <li><span class="marca-ok" aria-hidden="true">3</span><span><b>Evaporadora.</b> Fica na sala. Sujeira no filtro e na serpentina deixa o ar fraco.</span></li>
      </ul>
      <div class="cena-controles" aria-label="Ângulos da ilustração">
        <button type="button" data-ry="-42" data-rx="-56">Ver o telhado</button>
        <button type="button" data-ry="-20" data-rx="12">Ver as salas</button>
        <button type="button" data-ry="36" data-rx="-8">Ver a linha</button>
      </div>
      <p class="dica">No celular, arraste para os lados. No teclado, foque a ilustração e use as setas.</p>
    </div>
  </div>
</section>`;
}

function posterSvg() {
  return `<svg viewBox="0 0 280 360" role="img" aria-label="Esquema: condensadoras no telhado, linha e evaporadoras nas salas">
    <rect x="70" y="28" width="140" height="28" rx="6" fill="#d7e4f1"/>
    <rect x="92" y="34" width="28" height="16" rx="3" fill="#f7fbfe" stroke="#8aa0b8"/>
    <rect x="160" y="34" width="28" height="16" rx="3" fill="#f7fbfe" stroke="#8aa0b8"/>
    <text x="140" y="18" text-anchor="middle" font-size="12" fill="#0a2547">Condensadoras</text>
    <rect x="78" y="56" width="8" height="250" rx="3" fill="#e8b15a"/>
    <text x="58" y="180" text-anchor="end" font-size="12" fill="#0a2547">Linha</text>
    <g fill="#e7f3fb" stroke="#b7cbe0">
      <rect x="96" y="78" width="120" height="58" rx="8"/>
      <rect x="96" y="150" width="120" height="58" rx="8"/>
      <rect x="96" y="222" width="120" height="58" rx="8"/>
    </g>
    <g fill="#f7fbfe" stroke="#9eb0c4">
      <rect x="108" y="98" width="40" height="14" rx="3"/>
      <rect x="108" y="170" width="40" height="14" rx="3"/>
      <rect x="108" y="242" width="40" height="14" rx="3"/>
    </g>
    <text x="140" y="330" text-anchor="middle" font-size="12" fill="#0a2547">Evaporadoras nas salas</text>
  </svg>`;
}

function home(pre) {
  const msg = "Oi, vim pelo site da GR Tech. É empresa em [bairro]. O que preciso: ___.";
  return `<section class="hero"><div class="caixa hero-g">
    <div>
      <p class="olho">Empresas · VRF · São Paulo</p>
      <h1>Manutenção de VRF em São Paulo, com proposta por escrito.</h1>
      <p class="lead">Escritório, clínica, restaurante e condomínio. A visita técnica é R$ 150 e é abatida se você fechar o serviço.</p>
      <p class="preco">Visita técnica <b>R$ 150</b>, abatida se você fechar.</p>
      <div class="hero-a">${botao(wa(msg), "Chamar no WhatsApp")}<a class="lk" href="${pre}contrato/">Ver o contrato</a></div>
    </div>
    ${heroFoto(pre, "img/tubulacao-real-800.webp", `${pre}img/tubulacao-real-800.webp 800w, ${pre}img/tubulacao-real-1200.webp 1200w`, 800, 1067, "Tubulação isolada em um atendimento da GR Tech", "Foto real de um atendimento nosso")}
  </div></section>
  <section class="sec" id="areas"><div class="caixa">
    <header class="sec-h"><p class="olho">Por área</p><h2>O mesmo cuidado, no tipo de lugar que você tem.</h2><p class="sub">Cada página diz o que a gente olha ali. A foto de ambiente é ilustrativa. A foto de máquina, quando for nossa, está marcada.</p></header>
    <div class="grade">
      ${card(pre, "escritorios/", "img/escritorio-ilustrativa.webp", "Escritório", "Sala de reunião parada no meio da tarde custa hora de equipe.", "Imagem ilustrativa de uma sala de reunião")}
      ${card(pre, "clinicas/", "img/clinica-ilustrativa.webp", "Clínica", "Consultório precisa de ar estável durante o atendimento.", "Imagem ilustrativa de um consultório")}
      ${card(pre, "restaurantes/", "img/restaurante-ilustrativa.webp", "Restaurante", "Salão cheio não espera o aparelho voltar sozinho.", "Imagem ilustrativa de um salão de restaurante")}
      ${card(pre, "condominios/", "img/condominio-ilustrativa.webp", "Condomínio", "Um sistema na cobertura atende vários apartamentos ou salas.", "Imagem ilustrativa de um prédio")}
    </div>
  </div></section>
  ${cena(pre)}
  <section class="sec"><div class="caixa grade tres">
    <article class="prosa"><h2>Manutenção</h2><p>Limpeza com o aparelho aberto, a partir de R$ 450 por aparelho de 9 a 12 mil BTU. O valor final sai na visita. VRF e máquina grande: a gente vê no local antes de passar número.</p><p><a class="lk" href="${pre}manutencao/">Abrir a página de manutenção</a></p></article>
    <article class="prosa"><h2>Contrato</h2><p>Visitas mensais ou trimestrais, com o que será feito escrito antes. Não publicamos mensalidade fechada: o prédio muda o preço.</p><p><a class="lk" href="${pre}contrato/">Abrir a página de contrato</a></p></article>
    <article class="prosa"><h2>Como segue</h2><ol class="passos"><li><span class="n">1</span><span>Você conta no WhatsApp o bairro e o que está acontecendo.</span></li><li><span class="n">2</span><span>A visita é R$ 150, abatida se você fechar.</span></li><li><span class="n">3</span><span>O orçamento chega por escrito, no app OLLI, antes do serviço.</span></li></ol></article>
  </div></section>
  ${faq()}`;
}

function card(pre, href, img, titulo, texto, alt) {
  return `<a class="card" href="${pre}${href}"><img src="${pre}${img}" width="800" height="533" alt="${esc(alt)}" loading="lazy" decoding="async"><div><h3>${esc(titulo)}</h3><p>${esc(texto)}</p><span>Ver a página</span></div></a>`;
}

function faq() {
  return `<section class="sec"><div class="caixa faq">
    <header class="sec-h"><h2>Perguntas diretas</h2></header>
    <details><summary>Preciso pagar sinal?</summary><p>Não. Você paga a visita técnica de R$ 150. Se fechar o serviço, esse valor é abatido. O pagamento do serviço é por Pix, depois, na conta da GR Tech.</p></details>
    <details><summary>O orçamento é por escrito?</summary><p>É. Depois da visita, ele chega pelo app OLLI Orçamentos, para você ler antes de autorizar qualquer coisa além da visita.</p></details>
    <details><summary>Atendem geladeira e freezer?</summary><p>Geladeira e freezer domésticos, não. Refrigeração de comércio a gente conversa na visita, sem preço inventado por mensagem.</p></details>
    <details><summary>É plantão de madrugada?</summary><p>Não. O atendimento de visita é de segunda a sábado, das 8h às 18h.</p></details>
  </div></section>`;
}

function servico(pre, opts) {
  return `<section class="hero"><div class="caixa hero-g">
    <div>
      <p class="olho">${esc(opts.olho)}</p>
      <h1>${esc(opts.h1)}</h1>
      <p class="lead">${esc(opts.lead)}</p>
      <p class="preco">Visita técnica <b>R$ 150</b>, abatida se você fechar.</p>
      <div class="hero-a">${botao(wa(opts.msg), opts.cta)}</div>
    </div>
    ${heroFoto(pre, opts.foto, opts.srcset || "", opts.w, opts.h, opts.alt, opts.selo)}
  </div></section>
  <section class="sec"><div class="caixa prosa">
    ${opts.corpo}
  </div></section>
  ${opts.cena ? cena(pre) : ""}
  ${faq()}`;
}

function creditos(pre) {
  const linhas = [
    ["Tubulação na página inicial e na página de VRF", "Atendimento da GR Tech", "Foto nossa, já publicada no site", "Não é banco de imagem"],
    ["Escritório", "myHQ-Workspaces", "Pexels License", "https://www.pexels.com/photo/brown-wooden-table-with-chairs-5444195/"],
    ["Clínica", "Yusuf Çelik", "Pexels License", "https://www.pexels.com/photo/a-modern-doctors-office-16571732/"],
    ["Restaurante", "Catherine Chechun", "Pexels License", "https://www.pexels.com/photo/elegant-sunlit-restaurant-interior-with-tables-36092422/"],
    ["Condomínio", "The Daphne Lens", "Pexels License", "https://www.pexels.com/photo/modern-glass-facade-of-urban-residential-building-33528643/"],
    ["Telhado com condensadoras, página de VRF", "Katterinaaa", "Pexels License", "https://www.pexels.com/photo/city-view-on-a-rooftop-8065903/"],
    ["Condensadora na cobertura, página de manutenção", "Alexey Baikov", "Pexels License", "https://www.pexels.com/photo/industrial-rooftop-with-hvac-unit-and-ladder-30210086/"],
  ];
  const tr = linhas.map((l) => `<tr><td>${esc(l[0])}</td><td>${esc(l[1])}</td><td>${esc(l[2])}</td><td>${l[3].startsWith("http") ? `<a href="${esc(l[3])}">fonte</a>` : esc(l[3])}</td></tr>`).join("");
  return `<section class="sec"><div class="caixa prosa">
    <p class="olho">Imagens</p>
    <h1>Créditos e licenças</h1>
    <p class="lead">Foto de banco leva a legenda “Imagem ilustrativa” e não é cliente, obra nem equipe da GR Tech. A ilustração 3D é desenho nosso, feito em CSS, sem modelo de terceiro.</p>
    <table><thead><tr><th>Onde</th><th>Autor</th><th>Licença</th><th>Fonte</th></tr></thead><tbody>${tr}</tbody></table>
    <p class="nota">Pexels License: uso comercial, sem atribuição obrigatória. O crédito está aqui por cortesia. Conferido no registro do banco em 24/10/2026. Antes de publicar no domínio, o texto vigente da licença precisa de uma leitura humana da página oficial.</p>
    <p><a class="lk" href="${pre}index.html">Voltar ao início</a></p>
  </div></section>`;
}

function privacidade(pre) {
  return `<section class="sec"><div class="caixa prosa">
    <p class="olho">Privacidade</p>
    <h1>Esta prévia não guarda cadastro.</h1>
    <p class="lead">Não há formulário, não há cookie de anúncio e não há medição de visita neste arquivo. O botão abre o WhatsApp, que é outro serviço, com a mensagem já escrita para você editar.</p>
    <p>Controladora: 44.301.204 IGOR DE SOUZA AQUINO, CNPJ 44.301.204/0001-38. Contato: contato@grtechrefrigeracao.com.br.</p>
    <p>A política do site que está no ar é outra página: <a href="https://grtechrefrigeracao.com.br/privacidade/">grtechrefrigeracao.com.br/privacidade</a>. Esta prévia não substitui aquela.</p>
    <p>O tema claro ou escuro usa só a hora do seu aparelho, no momento em que a página abre. Essa escolha não é enviada para a GR Tech.</p>
    <p><a class="lk" href="${pre}index.html">Voltar ao início</a></p>
  </div></section>`;
}

function corpoLista(itens) {
  return `<ul class="lista">${itens.map((t) => `<li><span class="marca-ok" aria-hidden="true">✓</span><span>${t}</span></li>`).join("")}</ul>`;
}

const miolos = {
  "": home,
  vrf: (pre) => servico(pre, {
    olho: "VRF e VRV",
    h1: "VRF e VRV: um sistema, várias salas.",
    lead: "Manutenção do sistema que fica na cobertura e atende o prédio. Diga a marca, quantas evaporadoras e o que está acontecendo.",
    msg: "Oi, vim pelo site da GR Tech. Quero falar de VRF ou VRV em [bairro]. Marca e quantidade de evaporadoras: ___.",
    cta: "Falar sobre o VRF",
    foto: "img/tubulacao-real-800.webp",
    srcset: `${pre}img/tubulacao-real-800.webp 800w, ${pre}img/tubulacao-real-1200.webp 1200w`,
    w: 800, h: 1067,
    alt: "Tubulação isolada em um atendimento da GR Tech",
    selo: "Foto real de um atendimento nosso",
    cena: true,
    corpo: `<p>Não passamos valor de VRF por mensagem. O número certo sai depois que o técnico vê marca, quantidade de evaporadoras e o estado da linha.</p>${corpoLista([
      "Preventiva e corretiva no sistema existente.",
      "Proposta por escrito antes do serviço, além da visita.",
      "Sem usar logo de fabricante e sem dizer que somos autorizados de marca.",
    ])}<figure class="figura"><img src="${pre}img/vrf-telhado-ilustrativa.webp" width="533" height="800" alt="Imagem ilustrativa de condensadoras em um telhado, com a cidade ao fundo. Não é obra da GR Tech." loading="lazy" decoding="async"><figcaption>Imagem ilustrativa · Pexels, Katterinaaa. Não é foto de cliente.</figcaption></figure>`,
  }),
  manutencao: (pre) => servico(pre, {
    olho: "Manutenção",
    h1: "Manutenção para a empresa não parar no calor.",
    lead: "Preventiva com o aparelho aberto e corretiva quando ele já falhou. Casa com split também atendemos. O foco desta página é empresa.",
    msg: "Oi, vim pelo site da GR Tech. Quero manutenção em [bairro]. São [nº] aparelhos. É [escritório/clínica/restaurante/condomínio].",
    cta: "Pedir manutenção",
    foto: "img/condensadora-telhado-ilustrativa.webp",
    w: 800, h: 533,
    alt: "Imagem ilustrativa de uma condensadora em cobertura. Não é obra da GR Tech.",
    selo: "Imagem ilustrativa",
    corpo: `<p>Limpeza de split de 9 a 12 mil BTU: a partir de R$ 450 por aparelho. O valor final sai na visita de R$ 150, abatida se você fechar. Instalação de split nessa faixa, com até 3 m de tubulação, a partir de R$ 1.000, também com a visita abatida.</p>${corpoLista([
      "Filtro, turbina, serpentina e bandeja na preventiva.",
      "Se não gela, pinga ou não liga, primeiro o diagnóstico, depois o conserto.",
      "Peça e mão de obra separadas no orçamento.",
    ])}`,
  }),
  contrato: (pre) => servico(pre, {
    olho: "Contrato",
    h1: "Contrato com a visita combinada e o serviço escrito.",
    lead: "Para quem tem vários aparelhos e não quer lembrar disso todo mês. Mensal ou trimestral. O valor sai do levantamento, não de uma tabela genérica.",
    msg: "Oi, vim pelo site da GR Tech. Quero contrato de manutenção para empresa em [bairro]. São [nº] aparelhos.",
    cta: "Falar sobre o contrato",
    foto: "img/escritorio-ilustrativa.webp",
    w: 800, h: 533,
    alt: "Imagem ilustrativa de uma sala de reunião. Não é cliente da GR Tech.",
    selo: "Imagem ilustrativa",
    corpo: `<p>O contrato descreve o que entra na visita: conferência, limpeza e o que fica para orçamento à parte, como peça e corretiva. Nada disso vira mensalidade publicada porque dois prédios não custam a mesma coisa.</p>${corpoLista([
      "Você sabe o intervalo das visitas antes de assinar.",
      "Corretiva fora do combinado volta como orçamento por escrito.",
      "Não prometemos plantão de madrugada. O que vale é o que estiver escrito no contrato.",
    ])}`,
  }),
};

function area(pre, opts) {
  return servico(pre, {
    olho: opts.olho,
    h1: opts.h1,
    lead: opts.lead,
    msg: opts.msg,
    cta: "Chamar no WhatsApp",
    foto: opts.foto,
    w: opts.w,
    h: opts.h,
    alt: opts.alt,
    selo: "Imagem ilustrativa",
    corpo: `<p>${opts.texto}</p>${corpoLista([
      "VRF ou vários splits: a proposta vem depois da visita.",
      "Manutenção preventiva a partir de R$ 450 por aparelho de 9 a 12 mil BTU.",
      "Contrato mensal ou trimestral, com valor depois do levantamento.",
    ])}<p><a class="lk" href="${pre}vrf/">Página de VRF</a> · <a class="lk" href="${pre}manutencao/">Manutenção</a> · <a class="lk" href="${pre}contrato/">Contrato</a></p>`,
  });
}

const areas = {
  escritorios: (pre) => area(pre, {
    olho: "Escritórios",
    h1: "Escritório em São Paulo com o ar em dia.",
    lead: "Sala de reunião, open office e pavimento inteiro. Se é VRF, a gente trata como um sistema, não como um split solto.",
    msg: "Oi, vim pelo site da GR Tech. É escritório em [bairro]. Tenho [nº] aparelhos ou VRF. O que preciso: ___.",
    foto: "img/escritorio-ilustrativa.webp", w: 800, h: 533,
    alt: "Imagem ilustrativa de uma sala de reunião com mesa de madeira. Não é cliente da GR Tech.",
    texto: "O incômodo mais comum é uma sala que não acompanha as outras. Isso pode ser evaporadora suja ou o conjunto da cobertura. A visita separa os dois.",
  }),
  clinicas: (pre) => area(pre, {
    olho: "Clínicas",
    h1: "Clínica e consultório com manutenção marcada.",
    lead: "O atendimento não pode parar porque o aparelho pingou. A gente vê split, cassete e VRF, e passa o que será feito por escrito.",
    msg: "Oi, vim pelo site da GR Tech. É clínica em [bairro]. Tenho [nº] aparelhos. O que preciso: ___.",
    foto: "img/clinica-ilustrativa.webp", w: 533, h: 800,
    alt: "Imagem ilustrativa de um consultório. Não é cliente da GR Tech.",
    texto: "Não dizemos que a limpeza substitui regra sanitária do seu conselho. Dizemos o que o técnico faz no aparelho: filtro, turbina, serpentina e o diagnóstico se ele falhou.",
  }),
  restaurantes: (pre) => area(pre, {
    olho: "Restaurantes",
    h1: "Restaurante com o salão climatizado no horário cheio.",
    lead: "Gordura e porta abrindo o tempo todo pedem manutenção com intervalo curto. O intervalo certo sai da visita, não de um pacote pronto.",
    msg: "Oi, vim pelo site da GR Tech. É restaurante em [bairro]. Tenho [nº] aparelhos. O que preciso: ___.",
    foto: "img/restaurante-ilustrativa.webp", w: 600, h: 800,
    alt: "Imagem ilustrativa de um salão de restaurante. Não é cliente da GR Tech.",
    texto: "Cozinha com equipamento de refrigeração comercial a gente avalia no local. Geladeira e freezer de casa ficam de fora.",
  }),
  condominios: (pre) => area(pre, {
    olho: "Condomínios",
    h1: "Condomínio com o sistema da cobertura sob contrato.",
    lead: "Síndico e administradora recebem a proposta por escrito, com o que a visita mensal ou trimestral inclui.",
    msg: "Oi, vim pelo site da GR Tech. É condomínio em [bairro]. O sistema é [VRF/splits]. O que preciso: ___.",
    foto: "img/condominio-ilustrativa.webp", w: 600, h: 800,
    alt: "Imagem ilustrativa da fachada de um prédio. Não é cliente da GR Tech.",
    texto: "A fachada da foto não é um condomínio atendido pela GR Tech. Ela só mostra o tipo de prédio. A máquina, a gente vê na sua cobertura.",
  }),
};


// Páginas do v7 (texto real em fonte/conteudo-v7.json), no desenho azul desta prévia.
function linkV7(pre, href) {
  if (!href.startsWith("/")) return href;
  const limpo = href.replace(/^\//, "");
  return limpo === "" ? `${pre}index.html` : `${pre}${limpo}`;
}
function bloco(pre, b) {
  const partes = [];
  let lista = [], cards = [], faqs = [], precos = [];
  const fechar = () => {
    if (lista.length) { partes.push(corpoLista(lista.map(esc))); lista = []; }
    if (cards.length) { partes.push(`<div class="grade">${cards.join("")}</div>`); cards = []; }
    if (faqs.length) { partes.push(`<div class="faq">${faqs.join("")}</div>`); faqs = []; }
    if (precos.length) { partes.push(`<table class="tabela-precos"><tbody>${precos.join("")}</tbody></table>`); precos = []; }
  };
  for (const it of b.itens) {
    if (it.t !== "li") { if (lista.length) fechar(); }
    if (it.t !== "card" && cards.length) fechar();
    if (it.t !== "faq" && faqs.length) fechar();
    if (it.t !== "preco" && precos.length) fechar();
    if (it.t === "li") lista.push(it.x);
    else if (it.t === "card") cards.push(`<a class="card semfoto" href="${linkV7(pre, it.href)}"><div><h3>${esc(it.h)}</h3><p>${esc(it.p)}</p><span>Ver a página</span></div></a>`);
    else if (it.t === "faq") faqs.push(`<details><summary>${esc(it.q)}</summary><p>${esc(it.a)}</p></details>`);
    else if (it.t === "preco") precos.push(`<tr><th>${esc(it.n)}${it.nota ? `<small>${esc(it.nota)}</small>` : ""}</th><td>${esc(it.v)}</td></tr>`);
    else if (it.t === "h3") partes.push(`<h3>${esc(it.x)}</h3>`);
    else if (it.t === "p") {
      let h = esc(it.x);
      for (const [rot, href] of it.l || []) { if (rot) h = h.replace(esc(rot), `<a class="lk" href="${linkV7(pre, href)}">${esc(rot)}</a>`); }
      partes.push(`<p>${h}</p>`);
    }
  }
  fechar();
  return `<section class="sec"><div class="caixa prosa">${b.h2 ? `<h2>${esc(b.h2)}</h2>` : ""}${partes.join("")}</div></section>`;
}
function paginaV7(pre, slug) {
  const d = v7[slug];
  const msg = `Oi, vim pelo site da GR Tech (${d.h1.replace(/\.$/, "")}). Estou em [bairro]. O que preciso: ___.`;
  // O último bloco do v7 é sempre a chamada final; vira o fecho com botão.
  const blocos = d.blocos.slice(0, -1);
  const fim = d.blocos[d.blocos.length - 1];
  return `<section class="hero"><div class="caixa hero-g so">
    <div>
      <p class="olho">${esc(d.olho || "GR Tech")}</p>
      <h1>${esc(d.h1)}</h1>
      <p class="lead">${esc(d.lead)}</p>
      <p class="preco">Visita técnica <b>R$ 150</b>, abatida se você fechar.</p>
      <div class="hero-a">${botao(wa(msg), "Chamar no WhatsApp")}<a class="lk" href="tel:${TEL}">Ligar (11) 95875-8030</a></div>
    </div>
  </div></section>
  ${slug === "vrf-vrv" ? `<section class="sec"><div class="caixa prosa"><p>Página de VRF no desenho novo, com a ilustração do sistema: <a class="lk" href="${pre}vrf/">abrir a página de VRF</a>.</p></div></section>` : ""}
  ${blocos.map((b) => bloco(pre, b)).join("\n")}
  <section class="sec"><div class="caixa prosa">${fim.h2 ? `<h2>${esc(fim.h2)}</h2>` : ""}${fim.itens.filter((i) => i.t === "p").map((i) => `<p>${esc(i.x)}</p>`).join("")}<div class="hero-a">${botao(wa(msg), "Chamar no WhatsApp")}<a class="lk" href="tel:${TEL}">Ligar (11) 95875-8030</a></div></div></section>`;
}
for (const slug of Object.keys(v7)) paginas.push({ slug, titulo: v7[slug].titulo, desc: v7[slug].desc, v7: true });

function mioloDe(slug, pre) {
  if (v7[slug]) return paginaV7(pre, slug);
  if (miolos[slug]) return miolos[slug](pre);
  if (areas[slug]) return areas[slug](pre);
  if (slug === "creditos") return creditos(pre);
  if (slug === "privacidade") return privacidade(pre);
  throw new Error(slug);
}

const naoAchei = chrome(
  { slug: "", nao404: true, titulo: "Página não encontrada · GR Tech", desc: "Essa página não existe nesta prévia." },
  `<section class="sec"><div class="caixa prosa"><h1>Essa página não existe.</h1><p class="lead">O endereço não está nesta prévia.</p><p><a class="lk" href="index.html">Voltar ao início</a></p></div></section>`,
);

for (const p of paginas) {
  const pre = prefixo(p.slug);
  const html = chrome(p, mioloDe(p.slug, pre));
  const arquivo = p.slug ? join(raiz, p.slug, "index.html") : join(raiz, "index.html");
  await mkdir(dirname(arquivo), { recursive: true });
  await writeFile(arquivo, html);
}
await writeFile(join(raiz, "404.html"), naoAchei);
const hoje = new Date().toISOString().slice(0, 10);
await writeFile(join(raiz, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paginas.map((p) => `  <url><loc>${DOMINIO}/${p.slug ? p.slug + "/" : ""}</loc><lastmod>${hoje}</lastmod></url>`).join("\n")}\n</urlset>\n`);
await writeFile(join(raiz, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${DOMINIO}/sitemap.xml\n`);
await writeFile(join(raiz, ".htaccess"), `# Prévia Z-01: mesmos 301 do v7, menos clinicas, condominios e restaurantes, que nesta versão são páginas próprias.
ErrorDocument 404 /404.html
<IfModule mod_alias.c>
  RedirectMatch 301 ^/manutencao-corretiva/?$ /conserto/
  RedirectMatch 301 ^/manutencao-preventiva/?$ /limpeza-e-manutencao/
  RedirectMatch 301 ^/limpeza-higienizacao/?$ /limpeza-e-manutencao/
  RedirectMatch 301 ^/contrato-de-manutencao/?$ /empresas/
  RedirectMatch 301 ^/residencial/?$ /casa/
  RedirectMatch 301 ^/comercial/?$ /empresas/
  RedirectMatch 301 ^/sistemas-comerciais/?$ /empresas/
  RedirectMatch 301 ^/refrigeracao-comercial/?$ /camara-fria-e-refrigeracao-comercial/
</IfModule>
`);
console.log("paginas", paginas.length + 1);
