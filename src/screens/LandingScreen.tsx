import type { ReactElement } from 'react';

/**
 * Versão NATIVA (STUB) — o Metro escolhe este arquivo ao empacotar para
 * iOS/Android; a web pega `LandingScreen.web.tsx` (a página real, ao lado).
 * Mesmo padrão de `Tilt3D.web.tsx`/`Tilt3D.tsx`.
 *
 * Por que existe (P0 de tamanho de APK): a rota 'Landing' só é alcançada na
 * web — `ROTA_DESLOGADO` em App.tsx resolve para 'Entrar' no nativo, então
 * esta tela nunca é navegada no APK. Mas o AppNavigator faz
 * `import LandingScreen from '../screens/LandingScreen'` e registra
 * `<Stack.Screen name="Landing" component={LandingScreen} />` incondicional
 * (NÃO editar o AppNavigator) — import estático entra no bundle Hermes
 * independente do runtime. Sem este stub, toda a landing (parallax, tilt 3D,
 * comparador ERP×OLLI, teatro offline) ia junto no APK só para nunca
 * renderizar. Este componente é só uma carcaça vazia que satisfaz o tipo que
 * o Stack.Screen espera (componente sem props) — nunca é de fato montado.
 */
export default function LandingScreen(): ReactElement | null {
  return null;
}
