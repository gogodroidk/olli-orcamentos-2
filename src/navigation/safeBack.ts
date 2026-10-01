import { CommonActions } from '@react-navigation/native';
import { vibrar } from '../utils/haptico';

type TabFallback = 'Home' | 'Agenda' | 'Hoje' | 'Conta';
type BackNavigation = {
  canGoBack: () => boolean;
  goBack: () => void;
  dispatch: (action: ReturnType<typeof CommonActions.reset>) => void;
};

export function goBackOrHome(navigation: BackNavigation, fallback: TabFallback = 'Home') {
  vibrar('selecao');
  if (navigation.canGoBack()) {
    navigation.goBack();
    return;
  }

  navigation.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: 'Tabs', params: { screen: fallback } }],
    }),
  );
}
