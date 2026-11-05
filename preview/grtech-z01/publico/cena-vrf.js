/* Ilustração 3D do VRF. Sem loop: o transform só muda no arraste ou no botão. */
(function () {
  var raiz = document.querySelector("[data-cena]");
  if (!raiz) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var rede = navigator.connection;
  if (rede && rede.saveData) return;
  if (navigator.deviceMemory && navigator.deviceMemory <= 2) return;

  var mundo = raiz.querySelector(".cena-mundo");
  var poster = raiz.querySelector(".cena-poster");
  var giro = raiz.querySelector(".giro");
  var palco = raiz.querySelector(".cena-palco");
  if (!mundo || !giro || !palco) return;

  mundo.classList.add("ligada");
  mundo.hidden = false;
  if (poster) poster.classList.add("off");

  var rx = -16;
  var ry = -36;
  function aplicar() {
    giro.style.setProperty("--rx", rx + "deg");
    giro.style.setProperty("--ry", ry + "deg");
  }
  aplicar();

  function limitar() {
    if (rx < -62) rx = -62;
    if (rx > 28) rx = 28;
    if (ry < -70) ry = -70;
    if (ry > 70) ry = 70;
  }

  var arrastando = false;
  var ultimoX = 0;
  palco.addEventListener("pointerdown", function (ev) {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    arrastando = true;
    ultimoX = ev.clientX;
    giro.classList.remove("anima");
  });
  palco.addEventListener("pointermove", function (ev) {
    if (!arrastando) return;
    ry += (ev.clientX - ultimoX) * 0.45;
    ultimoX = ev.clientX;
    limitar();
    aplicar();
  });
  function solta() { arrastando = false; }
  palco.addEventListener("pointerup", solta);
  palco.addEventListener("pointercancel", solta);

  palco.addEventListener("keydown", function (ev) {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    ev.preventDefault();
    ry += ev.key === "ArrowLeft" ? -8 : 8;
    limitar();
    giro.classList.add("anima");
    aplicar();
  });

  raiz.querySelectorAll("[data-ry]").forEach(function (botao) {
    botao.addEventListener("click", function () {
      ry = Number(botao.getAttribute("data-ry"));
      rx = Number(botao.getAttribute("data-rx"));
      giro.classList.add("anima");
      aplicar();
    });
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) arrastando = false;
  });
})();
