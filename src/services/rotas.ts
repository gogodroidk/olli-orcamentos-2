// Rota no Google Maps — deep link que funciona hoje, sem chave e sem billing.
// O próprio app do Google Maps mostra o trânsito em tempo real.
//
// F4 (Google Agenda) importa `abrirRotaGoogleMaps` para o botão "Traçar rota"
// no card de agendamento da AgendaScreen.

import { Linking, Alert } from 'react-native';
import { urlRotaDoDia } from '../utils/rotaDoDia';

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

/**
 * Abre o Google Maps com a ROTA DO DIA inteira (várias paradas, na ordem dos
 * horários). Mesmo deep link público do `abrirRotaGoogleMaps` — sem chave e sem
 * billing. Devolve `false` quando não abriu (nenhum endereço utilizável ou o
 * sistema recusou), para a tela avisar; nunca lança.
 */
export async function abrirRotaDoDia(enderecos: readonly (string | null | undefined)[]): Promise<boolean> {
  const url = urlRotaDoDia(enderecos);
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

// ───────────────────────────────────────────────────────────────────────
// MAPA EMBUTIDO (Onda I2, 01/10/2026): já existe e é GRÁTIS — MapLibre +
// OpenFreeMap em `components/mapa/MapaBase`, com a ordenação e a hora de sair
// estimadas no aparelho (`rotaOtimizar.ts`, `etaEstimado.ts`). O Google Routes
// saiu (billing desligado). Este arquivo segue só com os deep links de navegação.
// ───────────────────────────────────────────────────────────────────────
