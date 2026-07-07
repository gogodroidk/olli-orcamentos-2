// Ref global de navegacao num modulo folha: App.tsx e qualquer tela importam
// daqui sem criar ciclo App -> AppNavigator -> tela -> App (que so funcionava
// por sorte do interop de runtime).
import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './AppNavigator';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();
