// Harness do teste-error-boundary-tela.ts: monta o boundary POR TELA em volta de
// uma tela que quebra até o teste liberar e então "tentar de novo".
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Text, View } from 'react-native';
import { limiteDeTela } from '../../src/components/ErrorBoundary';
import { TemaProvider } from '../../src/theme/TemaProvider';

// Quebra enquanto window.quebrar for true (o teste desliga antes de "tentar de
// novo", simulando a falha passageira — rede, dado ainda carregando).
(window as any).quebrar = true;
function TelaQueQuebra({ nome }: { nome: string }) {
  if ((window as any).quebrar) {
    throw new Error(`falha de render simulada em ${nome}`);
  }
  return <Text>tela {nome} ok</Text>;
}

const nome = new URLSearchParams(location.search).get('tela') ?? 'Inicio';
createRoot(document.getElementById('root')!).render(
  <TemaProvider>
    <View>
      <Text>abas continuam</Text>
      {limiteDeTela({ route: { name: nome }, children: <TelaQueQuebra nome={nome} /> })}
    </View>
  </TemaProvider>,
);
