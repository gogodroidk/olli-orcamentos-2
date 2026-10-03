import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, Typography, comAlfa, useCores, useEstilos, type Cores } from '../../theme';
import { Aparecer } from '../motion/Aparecer';
import { PressableAnimado } from '../motion/PressableAnimado';
import type { DicaDoRoteiro as Dica, EventoDica, LocalDica } from '../../services/dicasRoteiro';
import { desligarDicas, dicaParaLocal, dispensarDicaRoteiro, ouvirRoteiro } from '../../services/dicasRoteiroStore';

interface Props {
  /** Lugar desta tela no roteiro (services/dicasRoteiro.ts). */
  local: LocalDica;
  /** Só as dicas destes eventos cabem agora (ver `escolherDica`). */
  contexto?: readonly EventoDica[];
  style?: StyleProp<ViewStyle>;
}

/**
 * DICA DO ROTEIRO — a explicação que chega na HORA em que o recurso fica útil
 * (primeiro envio, cliente abriu o link, primeiro QR…). Uma por vez, no máximo
 * uma nova por dia, nunca repete.
 *
 * Mesma postura do `DicaContextual`: INLINE (nunca overlay que tampa botão),
 * não ocupa espaço enquanto decide e some sem deixar buraco. Dois botões:
 * "Entendi" (esta some para sempre) e "Não mostrar mais" (desliga as dicas; a
 * Conta religa). Entrada com `Aparecer` — com "Reduzir movimento", já nasce no lugar.
 */
export function DicaDoRoteiro({ local, contexto, style }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [dica, setDica] = useState<Dica | null>(null);
  const vivo = useRef(true);

  // Chave estável do contexto: um array novo a cada render não pode reavaliar em laço.
  const chaveContexto = contexto ? contexto.join('|') : '';
  const avaliar = useCallback(async () => {
    const filtro = chaveContexto ? (chaveContexto.split('|') as EventoDica[]) : undefined;
    const escolha = await dicaParaLocal(local, filtro);
    if (vivo.current) setDica(escolha?.dica ?? null);
  }, [local, chaveContexto]);

  useEffect(() => {
    vivo.current = true;
    const parar = ouvirRoteiro(() => { void avaliar(); });
    return () => { vivo.current = false; parar(); };
  }, [avaliar]);

  // Reavalia ao ganhar foco: o interruptor da Conta pode ter mudado.
  useFocusEffect(useCallback(() => { void avaliar(); }, [avaliar]));

  if (!dica) return null;

  const entendi = () => {
    const d = dica;
    setDica(null);
    void dispensarDicaRoteiro(d.id, d.numero);
  };
  const naoMostrarMais = () => {
    const d = dica;
    setDica(null);
    void desligarDicas(d.id);
  };

  return (
    <Aparecer style={style}>
      <View style={styles.card} accessibilityRole="summary">
        <View style={styles.topo}>
          <View style={styles.icone}>
            <MaterialCommunityIcons name={dica.icone as keyof typeof MaterialCommunityIcons.glyphMap} size={18} color={cores.accentLight} />
          </View>
          <View style={styles.textos}>
            <Text style={styles.titulo}>{dica.titulo}</Text>
            <Text style={styles.texto}>{dica.texto}</Text>
          </View>
        </View>
        <View style={styles.acoes}>
          <PressableAnimado
            onPress={naoMostrarMais}
            haptic="selection"
            style={styles.btnFantasma}
            accessibilityLabel="Não mostrar mais dicas"
            accessibilityHint="Desliga as dicas. Dá para religar em Conta, Ajuda."
          >
            <Text style={styles.btnFantasmaTexto}>Não mostrar mais</Text>
          </PressableAnimado>
          <PressableAnimado
            onPress={entendi}
            haptic="selection"
            style={styles.btn}
            accessibilityLabel="Entendi, não mostrar esta dica de novo"
          >
            <Text style={styles.btnTexto}>Entendi</Text>
          </PressableAnimado>
        </View>
      </View>
    </Aparecer>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.accentContainer,
      borderWidth: 1,
      borderColor: c.strokeGlow,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      marginTop: Spacing.sm,
      gap: Spacing.sm,
    },
    topo: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    icone: {
      width: 32,
      height: 32,
      borderRadius: BorderRadius.chip,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: comAlfa(c.accentLight, 0.14),
    },
    textos: { flex: 1, gap: 2 },
    titulo: { ...Typography.h4, color: c.onSurface },
    texto: { ...Typography.bodySmall, color: c.onSurface, lineHeight: 18 },
    acoes: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm },
    btnFantasma: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: BorderRadius.full },
    btnFantasmaTexto: { fontSize: 12.5, fontWeight: '700', color: c.onSurfaceVariant },
    btn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: BorderRadius.full, backgroundColor: comAlfa(c.accentLight, 0.16) },
    btnTexto: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },
  });
