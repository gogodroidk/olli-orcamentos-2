/**
 * Handler de atribuição ?ref= - Landing Page (web/) + Painel (webapp/) + App (src/)
 * Captura código de indicação no cookie `olli_attr` + localStorage fallback
 * Deve ser executado ANTES de qualquer redirect de auth
 * 
 * Incluir em TODOS os entry points de cadastro:
 * - web/src/pages/index.astro (landing)
 * - webapp/src/pages/sys/login/*.tsx (painel)
 * - src/screens/LoginScreen.tsx (app)
 */

declare global {
  interface Window {
    olliAttrCapturado?: boolean;
  }
}

/**
 * Captura código de indicação da URL e salva no cookie + localStorage
 * @param url - window.location.href ou URL string
 * @returns código capturado ou null
 */
export function capturarRefDaUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const ref = urlObj.searchParams.get('ref');
    
    if (!ref) return null;
    
    const codigoNormalizado = ref.toUpperCase().trim();
    
    // Validar formato: "OLLI-" + 4-8 alfanuméricos
    if (!/^OLLI-[A-Z0-9]{4,8}$/.test(codigoNormalizado)) {
      console.warn('Código de indicação inválido:', codigoNormalizado);
      return null;
    }

    // Salvar no cookie (30 dias, SameSite=Lax para funcionar cross-site)
    const cookieValue = `ref:${codigoNormalizado}`;
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `olli_attr=${cookieValue}; expires=${expires}; path=/; SameSite=Lax; Secure`;

    // Fallback no localStorage (para apps móveis/webviews)
    localStorage.setItem('olli_attr', cookieValue);

    // Marcar como capturado para evitar duplicação
    window.olliAttrCapturado = true;

    console.log('Indicação capturada:', codigoNormalizado);
    return codigoNormalizado;
  } catch (e) {
    console.error('Erro ao capturar ref:', e);
    return null;
  }
}

/**
 * Recupera código de indicação salvo (cookie ou localStorage)
 */
export function obterRefSalvo(): string | null {
  // 1. Tentar cookie
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [nome, valor] = cookie.trim().split('=');
    if (nome === 'olli_attr' && valor?.startsWith('ref:')) {
      return valor.substring(4);
    }
  }

  // 2. Fallback localStorage
  const local = localStorage.getItem('olli_attr');
  if (local?.startsWith('ref:')) {
    return local.substring(4);
  }

  return null;
}

/**
 * Limpa código de indicação (após uso bem-sucedido no cadastro)
 */
export function limparRefSalvo(): void {
  document.cookie = 'olli_attr=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax; Secure';
  localStorage.removeItem('olli_attr');
  window.olliAttrCapturado = false;
}

/**
 * Inicialização automática - chamar no mount do app
 */
export function inicializarCapturaRef(): void {
  if (window.olliAttrCapturado) return;
  capturarRefDaUrl(window.location.href);
}

// Auto-inicializar se rodando no browser
if (typeof window !== 'undefined') {
  inicializarCapturaRef();
}