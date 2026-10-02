import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { BorderRadius, Spacing, comAlfa, useCores, useEstilos, type Cores } from '../../theme';
import { MOLA, useReduzirMovimento } from '../../theme/motion';
import { Aparecer } from '../motion/Aparecer';
import { PressableAnimado } from '../motion/PressableAnimado';
import { Skeleton } from '../motion/Skeleton';
import {
  ROTULO_TEMPERATURA,
  linhaDoResumo,
  type AcaoTermometro,
  type EstadoTermometro,
  type Temperatura,
} from '../../services/termometroRegra';
import type { EstadoLeituraTermometro } from '../../hooks/useTermometro';

type Icone = keyof typeof MaterialCommunityIcons.glyphMap;

const ICONE: Record<Temperatura, Icone> = {
  quente: 'fire',
  morno: 'thermometer',
  frio: 'snowflake',
};

/** Quanto do "mercúrio" fica cheio: frio 1/3, morno 2/3, quente cheio. */
const NIVEL: Record<Temperatura, number> = { frio: 1 / 3, morno: 2 / 3, quente: 1 };

export function corDaTemperatura(t: Temperatura, c: Cores): string {
  if (t === 'quente') return c.danger;
  if (t === 'morno') return c.warning;
  return c.accentLight;
}

// ─── Chip da lista ─────────────────────────────────────────────────────────────

/**
 * O termômetro no card da lista: "🔥 Quente", "Morno", "Frio". Só desenha quando
 * há medida; `sem_link`/`fora_do_funil` não ocupam espaço (a lista não fica
 * cheia de "sem dado").
 */
export function TermometroChip({ estado }: { estado: EstadoTermometro | null }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  if (!estado || estado.tipo !== 'medido') return null;
  const cor = corDaTemperatura(estado.temperatura, cores);
  return (
    <View
      style={[styles.chip, { backgroundColor: comAlfa(cor, 0.12), borderColor: comAlfa(cor, 0.3) }]}
      accessible
      accessibilityLabel={`Termômetro: ${ROTULO_TEMPERATURA[estado.temperatura]}. ${estado.porque}`}
    >
      <MaterialCommunityIcons name={ICONE[estado.temperatura]} size={12} color={cor} />
      <Text style={[styles.chipTxt, { color: cor }]}>{ROTULO_TEMPERATURA[estado.temperatura]}</Text>
    </View>
  );
}

// ─── Cartão do detalhe ─────────────────────────────────────────────────────────

interface PropsCartao {
  leitura: EstadoLeituraTermometro;
  estado: EstadoTermometro | null;
  agora: Date;
  aoTentarDeNovo: () => void;
  /** Toque na ação sugerida (abrir o WhatsApp com o texto, reenviar o link...). */
  aoAgir: (acao: AcaoTermometro) => void;
  /** "Ligar" ao lado de "Reenviar" (só quando há telefone). */
  aoLigar?: () => void;
  agindo?: boolean;
}

/** Barra do "mercúrio": enche até o nível da temperatura com a mola macia, uma vez. */
function Mercurio({ temperatura }: { temperatura: Temperatura }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const reduzir = useReduzirMovimento();
  const alvo = NIVEL[temperatura];
  const nivel = useSharedValue(reduzir ? alvo : 0);
  useEffect(() => {
    if (reduzir) {
      cancelAnimation(nivel);
      nivel.set(alvo);
      return;
    }
    nivel.set(withSpring(alvo, MOLA.gentle));
    return () => cancelAnimation(nivel);
  }, [alvo, reduzir, nivel]);
  // Só transform (scaleX ancorado na esquerda por `transformOrigin`): nada de animar largura.
  const estilo = useAnimatedStyle(() => ({ transform: [{ scaleX: nivel.get() }] }));
  const cor = corDaTemperatura(temperatura, cores);
  return (
    <View style={styles.tubo} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.mercurio, { backgroundColor: cor }, estilo]} />
    </View>
  );
}

function iconeDaAcao(acao: AcaoTermometro): Icone {
  switch (acao.tipo) {
    case 'aguardar': return 'clock-outline';
    case 'reenviar': return 'send-outline';
    case 'renovar': return 'file-document-edit-outline';
    default: return 'whatsapp';
  }
}

function rotuloBotao(acao: AcaoTermometro): string | null {
  switch (acao.tipo) {
    case 'aguardar': return null;
    case 'reenviar': return 'Reenviar pelo WhatsApp';
    case 'renovar': return 'Criar proposta atualizada';
    default: return 'Abrir no WhatsApp';
  }
}

/**
 * O TERMÔMETRO no detalhe do orçamento: temperatura com o porquê, os números do
 * que o cliente fez no link e a próxima ação já escrita. Três estados de leitura
 * (lendo / leu / não conseguiu ler) e dois "sem medida" honestos (sem link).
 */
export function CartaoTermometro({ leitura, estado, agora, aoTentarDeNovo, aoAgir, aoLigar, agindo }: PropsCartao) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  if (leitura === 'carregando') {
    return (
      <View accessibilityLabel="Lendo o termômetro do orçamento">
        <Skeleton width={120} height={18} />
        <Skeleton width="85%" height={13} style={{ marginTop: Spacing.sm }} />
        <Skeleton width="60%" height={13} style={{ marginTop: 6 }} />
      </View>
    );
  }
  if (leitura === 'erro') {
    return (
      <View style={styles.aviso}>
        <MaterialCommunityIcons name="cloud-alert-outline" size={20} color={cores.warning} />
        <Text style={styles.avisoTexto}>
          Não consegui ler o termômetro agora. Isso não quer dizer que o cliente não abriu.
        </Text>
        <PressableAnimado onPress={aoTentarDeNovo} haptic="light" hitSlop={8} accessibilityLabel="Tentar ler o termômetro de novo">
          <Text style={styles.avisoAcao}>Tentar de novo</Text>
        </PressableAnimado>
      </View>
    );
  }
  if (!estado || estado.tipo === 'fora_do_funil') return null;
  if (estado.tipo === 'sem_link') {
    return (
      <View style={styles.semLink}>
        <MaterialCommunityIcons name="link-variant-off" size={20} color={cores.onSurfaceVariant} />
        <Text style={styles.semLinkTexto}>
          Sem medida: esta proposta não foi pelo link do cliente. Envie pelo link para ver quando ele abre e se volta ao preço.
        </Text>
      </View>
    );
  }

  const cor = corDaTemperatura(estado.temperatura, cores);
  const botao = rotuloBotao(estado.acao);
  return (
    <View>
      <Aparecer>
        <View style={styles.topo}>
          <View style={[styles.selo, { backgroundColor: comAlfa(cor, 0.14) }]}>
            <MaterialCommunityIcons name={ICONE[estado.temperatura]} size={22} color={cor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.temperatura, { color: cor }]}>{ROTULO_TEMPERATURA[estado.temperatura]}</Text>
            <Text style={styles.porque}>{estado.porque}</Text>
          </View>
        </View>
        <Mercurio temperatura={estado.temperatura} />
        <Text style={styles.numeros}>{linhaDoResumo(estado.resumo, agora)}</Text>
      </Aparecer>

      <Aparecer indice={1}>
        <View style={styles.acao}>
          <View style={styles.acaoTopo}>
            <MaterialCommunityIcons name={iconeDaAcao(estado.acao)} size={18} color={cores.accentLight} />
            <Text style={styles.acaoTitulo}>{estado.acao.titulo}</Text>
          </View>
          <Text style={styles.acaoDetalhe}>{estado.acao.detalhe}</Text>
          {botao ? (
            <View style={styles.botoes}>
              <PressableAnimado
                onPress={() => aoAgir(estado.acao)}
                haptic="light"
                disabled={agindo}
                style={[styles.botao, agindo && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={botao}
              >
                <MaterialCommunityIcons name={iconeDaAcao(estado.acao)} size={16} color="#FFFFFF" />
                <Text style={styles.botaoTxt}>{botao}</Text>
              </PressableAnimado>
              {estado.acao.tipo === 'reenviar' && aoLigar ? (
                <PressableAnimado onPress={aoLigar} haptic="light" style={styles.botaoSecundario} accessibilityRole="button" accessibilityLabel="Ligar para o cliente">
                  <MaterialCommunityIcons name="phone-outline" size={16} color={cores.onSurface} />
                  <Text style={styles.botaoSecundarioTxt}>Ligar</Text>
                </PressableAnimado>
              ) : null}
            </View>
          ) : null}
        </View>
      </Aparecer>

      <Text style={styles.nota}>
        Conta as aberturas do link em qualquer navegador, inclusive se você mesmo abrir. Não mostra quem é nem de onde abriu.
      </Text>
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      marginTop: 4,
    },
    chipTxt: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.2 },
    topo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    selo: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    temperatura: { fontSize: 20, fontWeight: '800', letterSpacing: -0.2 },
    porque: { fontSize: 13.5, color: c.onSurface, marginTop: 1, lineHeight: 18 },
    tubo: {
      height: 6,
      borderRadius: 3,
      backgroundColor: c.surfaceVariant,
      overflow: 'hidden',
      marginTop: Spacing.md,
    },
    mercurio: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%', borderRadius: 3, transformOrigin: 'left center' },
    numeros: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: Spacing.sm, lineHeight: 17 },
    acao: {
      marginTop: Spacing.md,
      padding: Spacing.md,
      borderRadius: BorderRadius.lg,
      backgroundColor: comAlfa(c.accentLight, 0.08),
      borderWidth: 1,
      borderColor: comAlfa(c.accentLight, 0.22),
    },
    acaoTopo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    acaoTitulo: { fontSize: 14.5, fontWeight: '800', color: c.onSurface, flexShrink: 1 },
    acaoDetalhe: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 4, lineHeight: 17 },
    botoes: { flexDirection: 'row', gap: 8, marginTop: Spacing.md, flexWrap: 'wrap' },
    botao: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      minHeight: 40,
      borderRadius: BorderRadius.full,
      backgroundColor: '#0B6FCE', // contraste-ok: branco sobre o azul fixo do botão (5.0:1)
    },
    botaoTxt: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '800' },
    botaoSecundario: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      minHeight: 40,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: c.outline,
    },
    botaoSecundarioTxt: { color: c.onSurface, fontSize: 13.5, fontWeight: '700' },
    nota: { fontSize: 11.5, color: c.onSurfaceVariant, marginTop: Spacing.md, lineHeight: 16 },
    aviso: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: Spacing.md,
      borderRadius: BorderRadius.lg,
      backgroundColor: comAlfa(c.warning, 0.1),
      borderWidth: 1,
      borderColor: comAlfa(c.warning, 0.3),
    },
    avisoTexto: { flex: 1, fontSize: 12.5, color: c.onSurfaceVariant, lineHeight: 17 },
    avisoAcao: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },
    semLink: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    semLinkTexto: { flex: 1, fontSize: 12.5, color: c.onSurfaceVariant, lineHeight: 17 },
  });
