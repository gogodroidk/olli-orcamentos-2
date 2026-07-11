/**
 * Barril das telas desktop (v4) — versão NATIVA (STUB). O Metro escolhe este
 * arquivo ao empacotar para iOS/Android; a web pega `index.web.ts` (as 16
 * telas reais, ao lado). Mesmo padrão de `Tilt3D.web.tsx`/`Tilt3D.tsx`.
 *
 * Por que existe (P0 de tamanho de APK): import estático entra no bundle
 * Hermes independente do runtime. Antes deste split, as ~12 mil linhas das
 * telas desktop — e o peso que elas carregam, como react-native-gifted-charts
 * (InicioDesktopScreen/RelatoriosDesktopScreen) — eram compiladas para dentro
 * do APK mesmo nunca renderizando lá: `ehDesktop` (useEhDesktop) é SEMPRE
 * `false` no nativo, então o AppNavigator nunca monta nenhuma destas telas
 * fora da web ≥ 1024px.
 *
 * Estes componentes são carcaças vazias que só existem para o import nomeado
 * do AppNavigator resolver e o tipo (`component={XDesktopScreen}`, zero
 * props) bater — nunca são de fato renderizados no APK.
 */
import type { ReactElement } from 'react';

/** Nunca renderiza no nativo — ver comentário acima. */
function TelaDesktopStub(): ReactElement | null {
  return null;
}

// F3
export const InicioDesktopScreen = TelaDesktopStub;
export const RelatoriosDesktopScreen = TelaDesktopStub;

// F4
export const OrcamentosDesktopScreen = TelaDesktopStub;
export const ClientesDesktopScreen = TelaDesktopStub;

// F5
export const AgendaDesktopScreen = TelaDesktopStub;
export const FerramentasDesktopScreen = TelaDesktopStub;

// F6
export const ServicosDesktopScreen = TelaDesktopStub;
export const ProdutosDesktopScreen = TelaDesktopStub;
export const EquipamentosDesktopScreen = TelaDesktopStub;
export const RecibosDesktopScreen = TelaDesktopStub;
export const OrdensDesktopScreen = TelaDesktopStub;
export const PmocDesktopScreen = TelaDesktopStub;
export const LixeiraDesktopScreen = TelaDesktopStub;
export const EquipeDesktopScreen = TelaDesktopStub;
export const AjudaDesktopScreen = TelaDesktopStub;
export const ContaDesktopScreen = TelaDesktopStub;
