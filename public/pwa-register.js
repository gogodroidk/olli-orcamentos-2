(function iniciarPwaOlli() {
  'use strict';

  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  let promptInstalacao = null;
  let bannerAtual = null;
  let recarregandoParaAtualizar = false;

  function removerBanner() {
    if (bannerAtual) bannerAtual.remove();
    bannerAtual = null;
  }

  function mostrarAcao(mensagem, rotulo, executar) {
    removerBanner();

    const regiao = document.createElement('section');
    regiao.className = 'pwa-action';
    regiao.setAttribute('role', 'region');
    regiao.setAttribute('aria-live', 'polite');
    regiao.setAttribute('aria-label', 'Ação do aplicativo OLLI');

    const texto = document.createElement('span');
    texto.className = 'pwa-action__message';
    texto.textContent = mensagem;

    const acao = document.createElement('button');
    acao.className = 'pwa-action__button';
    acao.type = 'button';
    acao.textContent = rotulo;
    acao.addEventListener('click', executar, { once: true });

    const fechar = document.createElement('button');
    fechar.className = 'pwa-action__dismiss';
    fechar.type = 'button';
    fechar.textContent = '×';
    fechar.setAttribute('aria-label', 'Agora não');
    fechar.addEventListener('click', removerBanner, { once: true });

    regiao.append(texto, acao, fechar);
    document.body.append(regiao);
    bannerAtual = regiao;
  }

  function modoInstalado() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  }

  function oferecerAtualizacao(worker) {
    mostrarAcao('Uma versão nova do OLLI está pronta.', 'Atualizar agora', () => {
      recarregandoParaAtualizar = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    promptInstalacao = event;
    if (modoInstalado()) return;

    mostrarAcao('Instale o OLLI para abrir como aplicativo.', 'Instalar', async () => {
      const prompt = promptInstalacao;
      promptInstalacao = null;
      removerBanner();
      if (!prompt) return;
      await prompt.prompt();
      await prompt.userChoice;
    });
  });

  window.addEventListener('appinstalled', () => {
    promptInstalacao = null;
    removerBanner();
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!recarregandoParaAtualizar) return;
    recarregandoParaAtualizar = false;
    window.location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const registro = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });

      if (registro.waiting && navigator.serviceWorker.controller) {
        oferecerAtualizacao(registro.waiting);
      }

      registro.addEventListener('updatefound', () => {
        const instalando = registro.installing;
        if (!instalando) return;
        instalando.addEventListener('statechange', () => {
          if (instalando.state === 'installed' && navigator.serviceWorker.controller) {
            oferecerAtualizacao(instalando);
          }
        });
      });

      await registro.update();
    } catch (erro) {
      console.warn('[OLLI PWA] Não foi possível registrar o modo instalável.', erro);
    }
  });
}());
