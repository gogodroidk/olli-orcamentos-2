;(() => { try { if (new URLSearchParams(location.search).has("av")) document.documentElement.dataset.av = "1"; } catch (e) {} })();
(() => {
  const APP = "https://app.olliorcamentos.online";
  const CAD = APP + "/auth/login?modo=cadastro";
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add("on"); io.unobserve(e.target); }
  }), { threshold: 0.12 });
  document.querySelectorAll(".rv").forEach((el, i) => {
    el.style.transitionDelay = (i % 5) * 70 + "ms";
    io.observe(el);
  });
  const top = document.querySelector(".top");
  if (top) {
    const onScroll = () => top.classList.toggle("scrolled", scrollY > 8);
    onScroll(); addEventListener("scroll", onScroll, { passive: true });
  }
  const burger = document.querySelector(".burger");
  const drawer = document.querySelector(".drawer");
  if (burger && drawer) {
    const setOpen = (open, refocus) => {
      drawer.classList.toggle("open", open);
      if (top) top.classList.toggle("menu-open", open);
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
      document.body.style.overflow = open ? "hidden" : "";
      if (!open && refocus) burger.focus();
    };
    burger.addEventListener("click", () => setOpen(!drawer.classList.contains("open"), true));
    addEventListener("resize", () => {
      if (drawer.classList.contains("open") && getComputedStyle(burger).display === "none") setOpen(false, false);
    }, { passive: true });
    drawer.querySelectorAll("a").forEach(a => a.addEventListener("click", () => setOpen(false, false)));
    document.addEventListener("keydown", e => {
      if (!drawer.classList.contains("open")) return;
      if (e.key === "Escape") { e.stopImmediatePropagation(); setOpen(false, true); return; }
      if (e.key !== "Tab") return;
      const items = [...(top ? top.querySelectorAll("a, button") : [burger]), ...drawer.querySelectorAll("a, summary")].filter(el => el.offsetParent !== null);
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }
  // plan toggle
  document.querySelectorAll(".tg button").forEach(b => b.onclick = () => {
    const p = b.dataset.p;
    document.querySelectorAll(".tg button").forEach(x => x.setAttribute("aria-pressed", x === b));
    document.querySelectorAll("[data-m]").forEach(el => {
      const v = el.dataset[p];
      if (!v) return;
      if (el.classList.contains("pr")) {
        const sm = el.querySelector("small");
        el.childNodes[0].textContent = v;
      } else el.textContent = v;
    });
    // update plan CTAs period
    document.querySelectorAll("[data-plan]").forEach(a => {
      const plan = a.dataset.plan;
      if (plan === "gratis") return;
      // Só mexe em link de assinatura do app, e SOMENTE nos parâmetros plano/periodo: utm e fbclid que o
      // marketing.ts já anexou continuam no link. Link do WhatsApp (Empresa) não é tocado.
      let u; try { u = new URL(a.href); } catch (e) { return; }
      if (u.origin !== APP) return;
      u.searchParams.set("plano", plan);
      u.searchParams.set("periodo", p === "a" ? "anual" : "mensal");
      a.href = u.toString();
    });
  });
  // phone screen cycle (opacity only)
  document.querySelectorAll(".ph-cycle").forEach(box => {
    const imgs = [...box.querySelectorAll("img")];
    if (imgs.length < 2) return;
    let i = 0;
    setInterval(() => {
      imgs[i].classList.remove("on");
      i = (i + 1) % imgs.length;
      imgs[i].classList.add("on");
    }, 3200);
  });
})();
;(() => {
  const bar = document.querySelector(".stk"); if (!bar) return;
  const ctas = [...document.querySelectorAll("main .cta .bt.p, .nav-cta .bt.p")];
  const foot = document.querySelector("footer");
  const vis = new Set();
  let nearFoot = false;
  const upd = () => bar.classList.toggle("on", vis.size === 0 && scrollY > 300 && !nearFoot);
  const io = new IntersectionObserver(es => { es.forEach(e => e.isIntersecting ? vis.add(e.target) : vis.delete(e.target)); upd(); });
  ctas.forEach(c => { if (c.offsetParent) io.observe(c); });
  if (foot) {
    new IntersectionObserver(([e]) => { nearFoot = e.isIntersecting; upd(); }, { rootMargin: "0px 0px -8% 0px", threshold: 0 }).observe(foot);
  }
  addEventListener("scroll", upd, { passive: true }); upd();
})();
;(() => { // vitrine: um único progresso 0..1 dirige tudo (transform/opacity)
  const vt = document.querySelector(".vt"); if (!vt) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const mac = vt.querySelector(".vt-mac"), ph = vt.querySelector(".vt-ph"), feed = vt.querySelector(".vt-feed"),
        copy = vt.querySelector(".vt-copy"), steps = [...vt.querySelectorAll(".vt-steps li")];
  const cl = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)), ss = t => t * t * (3 - 2 * t);
  // poses do iPhone ao longo do scroll: [p, x%, y%, z px, rotX, rotY, rotZ, opacidade]
  const PH = [[0, 60, 40, -260, 24, -38, 12, 0],[.22, 6, 8, 40, 10, -22, 5, 1],[.45, 0, 0, 140, 2, -6, 0, 1],[.7, -8, -3, 110, -4, 14, -3, 1],[1, -2, -6, 60, 6, 26, -5, 1]];
  // MacBook: entra deitado e fica no ângulo escolhido (rotX leve + rotY leve = profundidade sem distorcer a tela)
  const MAC = [[0, 0, 10, -120, 34, 0, 0, .3],[.3, 0, 0, 0, 6, -4, 0, 1],[1, 0, -2, 0, 3, 7, 0, 1]];
  const at = (K, p) => { let i = 0; while (i < K.length - 2 && p > K[i + 1][0]) i++;
    const a = K[i], b = K[i + 1], t = ss(cl((p - a[0]) / (b[0] - a[0]))); return a.map((v, j) => v + (b[j] - v) * t); };
  const sm = () => innerWidth < 769 ? .35 : 1;
  const tf = (k, s = 1) => `translate3d(${k[1] * sm()}%,${k[2]}%,${k[3]}px) rotateX(${k[4]}deg) rotateY(${k[5]}deg) rotateZ(${k[6]}deg) scale(${s})`;
  let tick = false;
  const upd = () => { tick = false;
    const r = vt.getBoundingClientRect(), tot = r.height - innerHeight, p = cl(-r.top / tot);
    const m = at(MAC, p), f = at(PH, p);
    mac.style.transform = tf(m, .9 + .1 * ss(cl(p / .3))); mac.style.opacity = m[7];
    ph.style.transform = tf(f); ph.style.opacity = f[7];
    const fp = Math.min(3, cl((p - .15) / .75) * 3), k = Math.min(2, Math.floor(fp)); feed.style.transform = `translate3d(0,${-(k + ss(cl(fp - k))) * 25}%,0)`;
    copy.style.opacity = 1 - ss(cl((p - .55) / .25)); copy.style.transform = `translate3d(0,${-ss(cl((p - .55) / .25)) * 30}px,0)`;
    const si = Math.min(3, Math.floor(cl((p - .15) / .8) * 4)); steps.forEach((s, i) => s.classList.toggle("on", i === si));
  };
  const req = () => { if (!tick) { tick = true; requestAnimationFrame(upd); } };
  addEventListener("scroll", req, { passive: true }); addEventListener("resize", req); upd();
})();

(() => {
  const b = document.querySelector(".theme-bt"); if (!b) return;
  const root = document.documentElement;
  const atual = () => root.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const marca = () => b.setAttribute("aria-pressed", atual() === "dark" ? "true" : "false");
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", marca);
  marca();
  b.addEventListener("click", () => {
    const novo = atual() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", novo);
    try { localStorage.setItem("olli-tema", novo); } catch (e) {}
    marca();
  });
})();
;(() => { // frases de destaque do hero
  const bloco = document.querySelector(".hero .rot");
  if (!bloco || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const frases = [...bloco.querySelectorAll(".rf")];
  if (frases.length < 2) return;

  let atual = 0;
  let parado = false;
  bloco.addEventListener("pointerenter", e => { if (e.pointerType === "mouse") parado = true; });
  bloco.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") parado = false; });
  bloco.addEventListener("click", () => { if (!matchMedia("(hover: hover)").matches) parado = !parado; });

  let fixo = false;
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "rot-pausa";
  botao.textContent = "Pausar frases de destaque";
  botao.addEventListener("click", () => {
    fixo = !fixo;
    botao.textContent = fixo ? "Retomar frases de destaque" : "Pausar frases de destaque";
  });
  bloco.insertAdjacentElement("afterend", botao);

  setInterval(() => {
    if (document.hidden || parado || fixo) return;
    frases[atual].classList.remove("on");
    atual = (atual + 1) % frases.length;
    frases[atual].classList.add("on");
  }, 3600);
})();

;(() => { // lupa do celular na mão: click/touch + Escape; hover/focus ficam no CSS
  const button = document.querySelector('.technician-phone-zoom'); if (!button) return;
  const detail = document.getElementById('technician-phone-detail');
  const fig = button.closest('.hero-technician-v7');
  const isOpen = () => !fig.classList.contains('zoom-off') && button.matches(':hover, :focus-visible, .is-open');
  const close = off => { button.classList.remove('is-open'); button.setAttribute('aria-expanded','false'); fig.classList.toggle('zoom-off', off); };
  button.addEventListener('click', () => { const open = button.classList.toggle('is-open'); button.setAttribute('aria-expanded', String(open)); fig.classList.toggle('zoom-off', !open); if (open) detail.querySelector('img').loading = 'eager'; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) close(true); });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.hero-technician-v7')) close(false); });
  button.addEventListener('blur', () => fig.classList.remove('zoom-off'));
  button.addEventListener('pointerleave', () => fig.classList.remove('zoom-off'));
})();

;(() => { // profundidade sutil por scroll, apenas nos blocos que estão atravessando a viewport
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const sections = [...document.querySelectorAll('main > section')];
  for (const section of sections) {
    section.classList.add('scroll-depth');
    const inner = section.querySelector(':scope > .w'); if (!inner) continue;
    inner.classList.add('scroll-depth-inner');
  }
  const visible = new Set(); let scheduled = false;
  const observer = new IntersectionObserver(entries => { for (const e of entries) { if (e.isIntersecting) visible.add(e.target); else { visible.delete(e.target); const inner = e.target.querySelector('.scroll-depth-inner'); if (inner) { inner.style.transform = ''; inner.style.opacity = ''; inner.style.willChange = ''; } } } schedule(); }, { rootMargin: '0px' });
  sections.forEach(s => observer.observe(s));
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(update); } }
  function update() { scheduled = false; const h = innerHeight;
    for (const section of visible) { const r = section.getBoundingClientRect(); const center = r.top + Math.min(r.height,h) / 2; const p = Math.max(-1,Math.min(1,(center - h/2)/(h/2))); const inner = section.querySelector('.scroll-depth-inner'); if (!inner) continue; const strength = innerWidth < 600 ? .45 : 1; inner.style.transform = `translate3d(0,${p*10*strength}px,${-Math.abs(p)*28*strength}px) rotateX(${p*1.5*strength}deg)`; inner.style.opacity = String(1-Math.abs(p)*.08); inner.style.willChange = 'transform,opacity'; }
  }
  addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);schedule();
})();

;(() => { // submenus desktop: botão mantém clique/touch; Escape devolve o foco
  document.querySelectorAll('.nav-drop').forEach(drop=>{const b=drop.querySelector('button');b.addEventListener('click',()=>{const open=drop.classList.toggle('open');b.setAttribute('aria-expanded',String(open));drop.classList.toggle('sub-off',!open)});drop.addEventListener('keydown',e=>{if(e.key==='Escape'&&!drop.classList.contains('sub-off')){drop.classList.remove('open');b.setAttribute('aria-expanded','false');drop.classList.add('sub-off');b.focus()}});drop.addEventListener('pointerleave',()=>drop.classList.remove('sub-off'));drop.addEventListener('focusout',e=>{if(!drop.contains(e.relatedTarget))drop.classList.remove('sub-off')});document.addEventListener('click',e=>{if(!drop.contains(e.target)){drop.classList.remove('open');b.setAttribute('aria-expanded','false')}})});
})();
