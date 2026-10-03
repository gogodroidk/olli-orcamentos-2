import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, comAlfa, useCores, useEstilos, type Cores } from '../theme';
import { PressableAnimado } from './motion';
import { getCurrentUser } from '../services/supabase';
import { TEXTO_CONVITE_IMPORTAR, chaveConviteImportarDispensado } from '../utils/conviteImportar';

/**
 * O "Agora não" do convite, por usuário. `null` enquanto lê (o convite espera).
 * Se a preferência não puder ser lida, vale `false`: mostrar um convite a mais é
 * inofensivo, e nenhum dado é afirmado por isso. O "x" esconde na hora, mesmo
 * que a gravação falhe (aí ele volta na próxima abertura).
 */
export function useConviteImportarDispensado(): { dispensado: boolean | null; dispensar: () => void } {
  const [dispensado, setDispensado] = useState<boolean | null>(null);
  const chave = useRef<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const u = await getCurrentUser();
        if (!u?.id) { if (vivo) setDispensado(false); return; }
        chave.current = chaveConviteImportarDispensado(u.id);
        const v = await AsyncStorage.getItem(chave.current);
        if (vivo) setDispensado(v === '1');
      } catch {
        if (vivo) setDispensado(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  const dispensar = useCallback(() => {
    setDispensado(true);
    if (chave.current) AsyncStorage.setItem(chave.current, '1').catch(() => {});
  }, []);

  return { dispensado, dispensar };
}

/**
 * "Trazer meus dados do app antigo" — o convite para a tela `Importar`, na Home do
 * primeiro acesso e no fim do Onboarding. Uma linha só (ícone, título, o que dá
 * para trazer e a seta), no mesmo vidro dos cartões da Home: é convite, não
 * propaganda — quem decide QUANDO ele aparece é `deveConvidarImportar`.
 *
 * `onDispensar` (opcional) põe o "x" de "agora não"; o toque principal continua
 * sendo o da linha inteira. Motion só pelo `PressableAnimado` (transform/opacity,
 * respeita "Reduzir movimento").
 */
export function ConviteImportar({
  onAbrir,
  onDispensar,
  style,
}: {
  onAbrir: () => void;
  onDispensar?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={[styles.cartao, style]}>
      <PressableAnimado
        style={styles.linha}
        onPress={onAbrir}
        haptic="selection"
        escala={0.98}
        accessibilityRole="button"
        accessibilityLabel={`${TEXTO_CONVITE_IMPORTAR.titulo}. ${TEXTO_CONVITE_IMPORTAR.descricao}`}
      >
        <View style={styles.icone}>
          <MaterialCommunityIcons name="database-import-outline" size={20} color={cores.accentLight} />
        </View>
        <View style={styles.textos}>
          <Text style={styles.titulo} numberOfLines={2}>{TEXTO_CONVITE_IMPORTAR.titulo}</Text>
          <Text style={styles.descricao} numberOfLines={2}>{TEXTO_CONVITE_IMPORTAR.descricao}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceMuted} />
      </PressableAnimado>
      {onDispensar ? (
        <PressableAnimado
          style={styles.fechar}
          onPress={onDispensar}
          haptic="selection"
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Agora não. Esconder o convite para trazer os dados"
        >
          <MaterialCommunityIcons name="close" size={16} color={cores.onSurfaceMuted} />
        </PressableAnimado>
      ) : null}
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    cartao: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: c.outlineDark,
      backgroundColor: c.surfaceGlass,
    },
    linha: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      minHeight: 64,
      paddingVertical: Spacing.md,
      paddingLeft: Spacing.md,
      paddingRight: Spacing.sm,
    },
    icone: {
      width: 38,
      height: 38,
      borderRadius: BorderRadius.chip,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: comAlfa(c.accentLight, 0.12),
    },
    textos: { flex: 1, gap: 2 },
    titulo: { fontSize: 14.5, fontWeight: '800', color: c.onSurface },
    descricao: { fontSize: 12.5, color: c.onSurfaceVariant, lineHeight: 17 },
    fechar: {
      width: 44,
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent: 'center',
      borderLeftWidth: 1,
      borderLeftColor: c.outline,
    },
  });
