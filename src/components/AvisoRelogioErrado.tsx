import React, { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, Spacing, comAlfa, useCores, useEstilos, type Cores } from '../theme';
import { OlliButton } from './OlliButton';
import { assinarRelogio, medidaRelogio, relogioDoAparelhoErrado } from '../services/relogioServidor';

/**
 * Aviso "Data e hora do celular erradas" — NÃO bloqueia nada.
 *
 * Aparece quando o relógio do aparelho difere mais de 5 min do servidor (medida
 * em services/relogioServidor.ts). O app continua funcionando: a sessão já
 * aguenta o relógio errado (services/sessaoRelogio.ts). O aviso existe porque
 * datas que nascem no aparelho (vencimento, agendamento, "hoje") saem erradas e
 * porque o revisor da Play não tem como saber que o problema é o relógio dele.
 *
 * Fica por cima do app, no topo, com "Entendi" para fechar. Fechado, só volta se
 * o relógio for acertado e depois desacertar de novo (o estado vive na memória
 * desta abertura do app, nunca em disco).
 */
export function AvisoRelogioErrado() {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const insets = useSafeAreaInsets();
  const [errado, setErrado] = useState(() => relogioDoAparelhoErrado(medidaRelogio()));
  const [fechado, setFechado] = useState(false);

  useEffect(() => assinarRelogio((medida) => {
    const agoraErrado = relogioDoAparelhoErrado(medida);
    setErrado(agoraErrado);
    // Relógio acertado: um desacerto futuro volta a avisar.
    if (!agoraErrado) setFechado(false);
  }), []);

  if (!errado || fechado) return null;

  async function abrirAjustes() {
    try {
      if (Platform.OS === 'android') {
        await Linking.sendIntent('android.settings.DATE_SETTINGS');
        return;
      }
      await Linking.openSettings();
    } catch {
      // Sem a tela de ajustes: o texto já diz onde mudar.
    }
  }

  return (
    <View pointerEvents="box-none" style={[styles.camada, { top: insets.top + Spacing.sm }]}>
      <View style={styles.card} accessibilityRole="alert">
        <View style={styles.cabeca}>
          <View style={[styles.icone, { backgroundColor: comAlfa(cores.warning, 0.14) }]}>
            <MaterialCommunityIcons name="clock-alert-outline" size={18} color={cores.warning} accessible={false} importantForAccessibility="no" />
          </View>
          <View style={styles.textos}>
            <Text style={styles.titulo} accessibilityRole="header">Data e hora do celular erradas</Text>
            <Text style={styles.texto}>
              Ative "Data e hora automáticas" nos ajustes do celular. Com o relógio errado, o app fica mais lento e datas podem sair erradas.
            </Text>
          </View>
        </View>
        <View style={styles.botoes}>
          {Platform.OS !== 'web' ? (
            <OlliButton label="Abrir ajustes" size="sm" onPress={() => { void abrirAjustes(); }} />
          ) : null}
          <OlliButton
            label="Entendi"
            size="sm"
            variant="ghost"
            onPress={() => setFechado(true)}
            accessibilityLabel="Entendi. Fechar o aviso de data e hora"
          />
        </View>
      </View>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  camada: { position: 'absolute', left: Spacing.base, right: Spacing.base, zIndex: 20, alignItems: 'center' },
  card: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: comAlfa(c.warning, 0.45),
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  cabeca: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  icone: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  textos: { flex: 1, gap: 2 },
  titulo: { color: c.onSurface, fontWeight: '800', fontSize: 15 },
  texto: { color: c.onSurfaceVariant, fontSize: 13, lineHeight: 19 },
  botoes: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm },
});
