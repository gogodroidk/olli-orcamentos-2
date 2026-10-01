import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, comAlfa, useCores, useEstilos, type Cores } from '../../theme';
import { PressableAnimado, PulsoAgora, type HapticKind } from '../motion';
import type { FaseVisita } from '../../utils/linhaDoTempoHoje';

/** Largura da coluna do trilho (marcador + linha vertical). */
const COLUNA = 32;
/** Diâmetro do marcador de visita. */
const PONTO = 14;
/** Diâmetro do marcador de seção (Lembretes, Checklist, Fim do dia). */
const PONTO_SECAO = 26;
/** Distância do topo do nó até o centro do marcador (alinha com a 1ª linha do card). */
const CENTRO_MARCADOR = 22;

type Marcador =
  | { tipo: 'visita'; fase: FaseVisita; pulso?: number }
  | { tipo: 'secao'; icone: React.ComponentProps<typeof MaterialCommunityIcons>['name'] };

interface NoProps {
  marcador: Marcador;
  /** Primeiro nó: sem trilho acima do marcador. */
  primeiro?: boolean;
  /** Último nó: sem trilho abaixo do marcador. */
  ultimo?: boolean;
  /**
   * O trecho do trilho ABAIXO deste nó já foi "percorrido" no dia (pinta com o
   * acento). Acima do "agora" o trilho é cheio; dali para baixo, neutro.
   */
  percorrido?: boolean;
  /** O trecho ACIMA deste nó (vem do nó anterior) já foi percorrido. */
  percorridoAcima?: boolean;
  children: React.ReactNode;
}

/**
 * Um nó da linha do tempo do Hoje: a coluna da esquerda desenha o trilho
 * vertical e o marcador; a direita recebe o conteúdo (card da visita, lembretes,
 * checklist, fim do dia). Sem animação de layout — a entrada fica com `Aparecer`
 * em volta do nó, e o único movimento próprio é o pulso finito do "agora".
 */
export function NoLinhaDoTempo({ marcador, primeiro, ultimo, percorrido, percorridoAcima, children }: NoProps) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const corPercorrida = comAlfa(cores.accentLight, 0.55);
  return (
    <View style={styles.no}>
      <View style={styles.coluna} importantForAccessibility="no-hide-descendants">
        {!primeiro && <View style={[styles.trilho, styles.trilhoAcima, { backgroundColor: percorridoAcima ? corPercorrida : cores.outline }]} />}
        {!ultimo && <View style={[styles.trilho, styles.trilhoAbaixo, { backgroundColor: percorrido ? corPercorrida : cores.outline }]} />}
        <View style={styles.marcadorWrap}>
          <MarcadorNo marcador={marcador} />
        </View>
      </View>
      <View style={styles.conteudo}>{children}</View>
    </View>
  );
}

function MarcadorNo({ marcador }: { marcador: Marcador }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  if (marcador.tipo === 'secao') {
    return (
      <View style={styles.marcadorSecao}>
        <MaterialCommunityIcons name={marcador.icone} size={14} color={cores.accentLight} />
      </View>
    );
  }
  switch (marcador.fase) {
    case 'agora':
      return <PulsoAgora tamanho={PONTO + 2} cor={cores.accentLight} gatilho={marcador.pulso} />;
    case 'feita':
      return (
        <View style={[styles.ponto, { backgroundColor: cores.success, borderColor: cores.success }]}>
          <MaterialCommunityIcons name="check" size={10} color={cores.surface} />
        </View>
      );
    case 'sem_baixa':
      return <View style={[styles.ponto, { borderColor: cores.warning, backgroundColor: cores.warningLight }]} />;
    case 'proxima':
      return <View style={[styles.ponto, { borderColor: cores.accentLight, borderWidth: 3 }]} />;
    default:
      return <View style={[styles.ponto, { borderColor: cores.onSurfaceMuted }]} />;
  }
}

interface AcaoProps {
  rotulo: string;
  icone: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  onPress: () => void;
  /** `principal` = botão cheio (a ação do momento); `secundaria` = contorno. */
  variante?: 'principal' | 'secundaria' | 'whatsapp';
  carregando?: boolean;
  desabilitado?: boolean;
  accessibilityLabel?: string;
}

/**
 * Botão de ação dentro de um nó (Concluí, Traçar rota, Estou a caminho…).
 * 44 dp de altura mínima (dedo de obra), estado de carregando com indicador e
 * leitura "carregando" para o leitor de tela, háptico leve só na ação principal.
 */
export function AcaoNo({ rotulo, icone, onPress, variante = 'secundaria', carregando, desabilitado, accessibilityLabel }: AcaoProps) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const haptic: HapticKind = variante === 'principal' ? 'light' : 'selection';
  const corTexto = variante === 'principal'
    ? cores.onPrimary
    : variante === 'whatsapp'
      ? '#0A1626' // contraste-ok: sobre c.whatsapp #25D366, dark-on-green proposital (9.16:1)
      : cores.accentLight;
  const fundo = variante === 'principal' ? styles.acaoPrincipal : variante === 'whatsapp' ? styles.acaoWhats : styles.acaoSecundaria;
  return (
    <PressableAnimado
      onPress={onPress}
      haptic={carregando ? false : haptic}
      disabled={desabilitado || carregando}
      style={[styles.acao, fundo]}
      accessibilityLabel={carregando ? `${accessibilityLabel ?? rotulo}, carregando` : (accessibilityLabel ?? rotulo)}
      accessibilityState={{ busy: !!carregando }}
    >
      {carregando
        ? <ActivityIndicator size="small" color={corTexto} />
        : <MaterialCommunityIcons name={icone} size={16} color={corTexto} />}
      <Text style={[styles.acaoTexto, { color: corTexto }]} numberOfLines={1}>{rotulo}</Text>
    </PressableAnimado>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  no: { flexDirection: 'row', paddingHorizontal: Spacing.base },
  coluna: { width: COLUNA, alignItems: 'center' },
  trilho: { position: 'absolute', width: 2, left: COLUNA / 2 - 1, borderRadius: 1 },
  trilhoAcima: { top: 0, height: CENTRO_MARCADOR },
  trilhoAbaixo: { top: CENTRO_MARCADOR, bottom: 0 },
  marcadorWrap: {
    position: 'absolute', top: CENTRO_MARCADOR - PONTO_SECAO / 2,
    width: PONTO_SECAO, height: PONTO_SECAO, alignItems: 'center', justifyContent: 'center',
  },
  ponto: {
    width: PONTO, height: PONTO, borderRadius: PONTO / 2, borderWidth: 2,
    backgroundColor: c.background, alignItems: 'center', justifyContent: 'center',
  },
  marcadorSecao: {
    width: PONTO_SECAO, height: PONTO_SECAO, borderRadius: PONTO_SECAO / 2,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline,
    alignItems: 'center', justifyContent: 'center',
  },
  conteudo: { flex: 1, paddingLeft: Spacing.sm, paddingBottom: Spacing.md },

  acao: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 44, paddingHorizontal: 14, borderRadius: BorderRadius.full,
  },
  acaoPrincipal: { backgroundColor: c.primary },
  acaoSecundaria: { backgroundColor: c.accentContainer, borderWidth: 1, borderColor: comAlfa(c.accentLight, 0.35) },
  acaoWhats: { backgroundColor: c.whatsapp },
  acaoTexto: { fontSize: 13, fontWeight: '800', flexShrink: 1 },
});
