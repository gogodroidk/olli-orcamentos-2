/**
 * Barril das telas desktop (v4). Cada tela desktop é exportada daqui e consumida
 * pelo AppNavigator (condicionalmente, sob `ehDesktop`). No mobile/APK nada
 * disto é montado.
 *
 * ESTADO ATUAL: F3 (Início + Relatórios), F4 (Orçamentos + Clientes) e F5
 * (Agenda + Ferramentas) entregues — todas as telas desktop são reais.
 */

// F3
export { default as InicioDesktopScreen } from './InicioDesktopScreen';
export { default as RelatoriosDesktopScreen } from './RelatoriosDesktopScreen';

// F4
export { default as OrcamentosDesktopScreen } from './OrcamentosDesktopScreen';
export { default as ClientesDesktopScreen } from './ClientesDesktopScreen';

// F5
export { default as AgendaDesktopScreen } from './AgendaDesktopScreen';
export { default as FerramentasDesktopScreen } from './FerramentasDesktopScreen';
