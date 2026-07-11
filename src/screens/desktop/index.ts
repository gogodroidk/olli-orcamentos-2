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

// F6 (onda desktop): as 10 telas secundárias ganham layout desktop e viram ABAS
// do shell (mantêm a sidebar) — fim do "vira celular" ao clicar nesses itens.
export { default as ServicosDesktopScreen } from './ServicosDesktopScreen';
export { default as ProdutosDesktopScreen } from './ProdutosDesktopScreen';
export { default as EquipamentosDesktopScreen } from './EquipamentosDesktopScreen';
export { default as RecibosDesktopScreen } from './RecibosDesktopScreen';
export { default as OrdensDesktopScreen } from './OrdensDesktopScreen';
export { default as PmocDesktopScreen } from './PmocDesktopScreen';
export { default as LixeiraDesktopScreen } from './LixeiraDesktopScreen';
export { default as EquipeDesktopScreen } from './EquipeDesktopScreen';
export { default as AjudaDesktopScreen } from './AjudaDesktopScreen';
export { default as ContaDesktopScreen } from './ContaDesktopScreen';
