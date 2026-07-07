// Rota no Google Maps — deep link que funciona hoje, sem chave e sem billing.
// O próprio app do Google Maps mostra o trânsito em tempo real.
//
// F4 (Google Agenda) importa `abrirRotaGoogleMaps` para o botão "Traçar rota"
// no card de agendamento da AgendaScreen.

import { Linking, Alert } from 'react-native';

declare const process: { env: Record<string, string | undefined> };

/**
 * Abre o Google Maps (app ou navegador) já com a rota até `endereco` traçada,
 * modo "dirigindo". Não exige API key nem billing — é o deep link público do
 * Maps. Nunca lança: se o `Linking.openURL` falhar, avisa com um Alert.
 */
export async function abrirRotaGoogleMaps(endereco: string): Promise<void> {
  const destino = (endereco ?? '').trim();
  if (!destino) return;

  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}&travelmode=driving`;

  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Ops', 'Não consegui abrir o Maps.');
  }
}

// ───────────────────────────────────────────────────────────────────────
// PLANO FUTURO (nada disso é código agora — só o rumo, para quando o dono
// ativar o billing no Google Cloud):
//
// 1) `npx expo install react-native-maps` (exige prebuild — projeto já é
//    bare/prebuild-based, então roda no próximo build único do gate).
// 2) Nova rota `POST /rota` no worker `olli-diagnostico`, proxyando a Routes
//    API do Google (`computeRoutes`) com a key GUARDADA NO WORKER (nunca no
//    app) — corpo com origem/destino, `routingPreference: 'TRAFFIC_AWARE'`,
//    resposta com `routes[0].duration` e `routes[0].polyline.encodedPolyline`.
// 3) Tela do agendamento passa a renderizar um <MapView> com a polyline e o
//    tempo estimado considerando trânsito, usando `mapsEmbutidoDisponivel()`
//    para decidir se mostra o mapa embutido ou só o botão de deep link atual.
// 4) `EXPO_PUBLIC_MAPS_KEY` (Maps SDK for Android, client-side) e a key da
//    Routes API no worker são CHAVES DIFERENTES — a segunda nunca entra no
//    bundle do app.
// ───────────────────────────────────────────────────────────────────────
