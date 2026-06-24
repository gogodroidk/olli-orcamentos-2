import { CommonActions } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

type TabFallback = 'Home' | 'Agenda' | 'Hoje' | 'Conta';
type BackNavigation = {
  canGoBack: () => boolean;
  goBack: () => void;
  dispatch: (action: ReturnType<typeof CommonActions.reset>) => void;
};

export function goBackOrHome(navigation: BackNavigation, fallback: TabFallback = 'Home') {
  Haptics.selectionAsync().catch(() => {});
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
