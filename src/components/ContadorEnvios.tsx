/**
 * ContadorEnvios — "3 de 5 envios do Grátis usados neste mês" (P0-09).
 * Presentacional: quem chama passa o resultado de `useContadorEnvios()`.
 *
 * Estados (nenhum some calado):
 *  - carregando   → nada (a linha não existe até sabermos; sem skeleton que "pisca" para quem nunca verá o contador);
 *  - indisponível → nada, por desenho: é aviso informativo; o limite de verdade mora no servidor e
 *                   uma leitura que falhou não libera nem barra envio;
 *  - pronto       → `mostrar:false` (conta antiga, Pro/Empresa ou antes do 3º envio) = nada; `mostrar:true` = a linha.
 * Esgotado vira tom de aviso e diz que os envios voltam no próximo mês (sem a palavra "bloqueado").
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, comAlfa, useCores, useEstilos, type Cores } from '../theme';
import { Aparecer } from './motion';
import type { EstadoContadorEnvios } from '../hooks/useContadorEnvios';

export function ContadorEnvios({ estado }: { estado: EstadoContadorEnvios }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  if (estado.estado !== 'pronto' || !estado.contador.mostrar) return null;
  const c = estado.contador;
  const cor = c.esgotado ? cores.warning : cores.onSurfaceVariant;
  return (
    <Aparecer>
      <View
        style={[styles.caixa, c.esgotado && { backgroundColor: cores.warningLight, borderColor: comAlfa(cores.warning, 0.45) }]}
        accessible
        accessibilityRole="text"
        accessibilityLabel={c.texto}
      >
        <MaterialCommunityIcons name={c.esgotado ? 'alert-circle-outline' : 'send-check-outline'} size={16} color={cor} />
        <Text style={[styles.texto, { color: cor }]}>{c.texto}</Text>
      </View>
    </Aparecer>
  );
}

function criarEstilos(c: Cores) {
  return StyleSheet.create({
    caixa: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      borderRadius: BorderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.outline,
      backgroundColor: c.surfaceVariant,
    },
    texto: { flex: 1, fontSize: 13, fontWeight: '600' },
  });
}
