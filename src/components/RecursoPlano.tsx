import React, { useEffect, useRef } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { BorderRadius, Spacing, Typography, comAlfa, useCores, useEstilos, sombrasDe, type Cores } from '../theme';
import { OlliPressable } from './OlliPressable';
import { OlliSkeleton } from './OlliSkeleton';
import { GradientHeader } from './GradientHeader';
import { usePlano } from '../hooks/usePlano';
import { goBackOrHome } from '../navigation/safeBack';
import { planoMinimoDoRecurso, type EstadoAcessoRecurso, type Recurso } from '../services/entitlements';
import { NOME_PLANO, ROTULO_RECURSO, beneficioRecurso } from '../services/planosBase';
import { ESTADO_PLAY_BILLING } from '../services/playBilling';
import { track, Eventos } from '../services/analytics';

/**
 * RECURSO DO PLANO — o paywall reposicionado (Grátis ilimitado, 01/10/2026).
 *
 * O Grátis não tem mais cota de orçamentos: o que o Pro vende são RECURSOS (sem o
 * selo, follow-up automático, link com pagamento, inteligência de campo) e o
 * Empresa vende equipe, mapa e PMOC/contratos. Cada recurso pago mostra, no lugar
 * dele, "Disponível no Pro" — com os TRÊS estados de verdade da casa (memória
 * "erro vira vazio"):
 *
 *   carregando    → skeleton do tamanho da peça (nem libera, nem vende);
 *   indeterminado → "Não consegui confirmar seu plano" + Tentar de novo. Nunca
 *                   libera (seria dar de graça) nem diz "Disponível no Pro" (seria
 *                   rebaixar quem paga por um erro nosso);
 *   bloqueado     → "Disponível no Pro/Empresa" + o benefício em 1 frase;
 *   em_breve      → o plano inclui, o produto ainda não entrega: diz "em breve";
 *   liberado      → o próprio recurso (`children`), sem custo nenhum.
 *
 * LOJAS: o botão "Ver o Pro" só aparece onde o app pode vender — na web, e no
 * Android quando a venda é pela própria Google Play (Play Billing ligado). No iOS
 * e no Android sem Play Billing a peça só INFORMA (mesma regra de
 * `lembreteAssinaturaLoja.ts` e da PlanosScreen): nenhum caminho de pagamento
 * externo dentro do build das lojas.
 *
 * A regra (que estado é qual) é PURA e mora em `entitlements.ts`
 * (`estadoAcessoRecurso`); o texto vem da tabela única `planosBase.ts`.
 */

/** Onde o app pode oferecer o plano (ver "LOJAS" acima). */
function podeOferecerPlano(): boolean {
  if (Platform.OS === 'web') return true;
  return Platform.OS === 'android' && ESTADO_PLAY_BILLING === 'ligado';
}

export interface UsoRecursoPlano {
  estado: EstadoAcessoRecurso;
  planoMinimo: 'pro' | 'empresa';
  recarregar: () => Promise<void>;
}

/** Hook: o estado do recurso para a tela + o plano que o libera. */
export function useRecursoPlano(recurso: Recurso): UsoRecursoPlano {
  const { estadoRecurso, recarregar } = usePlano();
  return { estado: estadoRecurso(recurso), planoMinimo: planoMinimoDoRecurso(recurso), recarregar };
}

/** Registra "gate visto" UMA vez por montagem, e só com o plano confirmado. */
function useContarGate(recurso: Recurso, plano: 'pro' | 'empresa', bloqueado: boolean): void {
  const contou = useRef(false);
  useEffect(() => {
    if (bloqueado && !contou.current) {
      contou.current = true;
      track(Eventos.gateVisto, { recurso, plano });
    }
  }, [bloqueado, recurso, plano]);
}

function useIrParaPlanos(recurso: Recurso, plano: 'pro' | 'empresa') {
  const nav = useNavigation<any>();
  return () => {
    track(Eventos.gateCta, { recurso, plano });
    nav.navigate('Planos', { origem: 'gate', recurso, plano });
  };
}

// ─── Variante CHIP (dentro de cartões: clima, hora de sair, ETA) ────────────────

interface PropsChip {
  recurso: Recurso;
  children: React.ReactNode;
}

/**
 * Para peças pequenas dentro de um cartão (o chip de clima, a hora de sair). Com
 * o recurso liberado devolve `children` intacto; sem ele, uma linha compacta.
 */
export function RecursoPlanoChip({ recurso, children }: PropsChip) {
  const { estado, planoMinimo, recarregar } = useRecursoPlano(recurso);
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const irParaPlanos = useIrParaPlanos(recurso, planoMinimo);
  useContarGate(recurso, planoMinimo, estado === 'bloqueado');

  if (estado === 'liberado') return <>{children}</>;
  if (estado === 'carregando') return <OlliSkeleton width={180} height={30} radius={BorderRadius.full} />;

  const rotulo = ROTULO_RECURSO[recurso];
  if (estado === 'em_breve') {
    return (
      <View style={styles.chip} accessibilityRole="text">
        <MaterialCommunityIcons name="clock-outline" size={14} color={cores.onSurfaceVariant} />
        <Text style={styles.chipTxt} numberOfLines={1}>{rotulo.titulo} — em breve</Text>
      </View>
    );
  }
  if (estado === 'indeterminado') {
    return (
      <OlliPressable onPress={() => void recarregar()} haptic="light" style={styles.chip}
        accessibilityRole="button" accessibilityLabel="Não consegui confirmar seu plano. Tentar de novo">
        <MaterialCommunityIcons name="cloud-alert-outline" size={14} color={cores.onSurfaceVariant} />
        <Text style={styles.chipTxt} numberOfLines={1}>Plano não confirmado · tentar de novo</Text>
      </OlliPressable>
    );
  }
  // bloqueado
  const texto = `${rotulo.titulo} · Disponível no ${NOME_PLANO[planoMinimo]}`;
  if (!podeOferecerPlano()) {
    return (
      <View style={styles.chip} accessibilityRole="text">
        <MaterialCommunityIcons name="crown-outline" size={14} color={cores.accentLight} />
        <Text style={styles.chipTxt} numberOfLines={1}>{texto}</Text>
      </View>
    );
  }
  return (
    <OlliPressable onPress={irParaPlanos} haptic="light" style={styles.chip}
      accessibilityRole="button" accessibilityLabel={`${texto}. Ver o plano ${NOME_PLANO[planoMinimo]}`}>
      <MaterialCommunityIcons name="crown-outline" size={14} color={cores.accentLight} />
      <Text style={styles.chipTxt} numberOfLines={1}>{texto}</Text>
      <MaterialCommunityIcons name="chevron-right" size={14} color={cores.onSurfaceVariant} />
    </OlliPressable>
  );
}

// ─── Variante CARTÃO (blocos dentro de uma tela) ────────────────────────────────

interface PropsCartao {
  recurso: Recurso;
  /** Benefício específico da tela. Padrão: o `beneficio` da tabela única. */
  beneficio?: string;
}

/** O cartão "Disponível no Pro" (ou o estado de carregando/indeterminado) — sem children. */
export function CartaoRecursoPlano({ recurso, beneficio }: PropsCartao) {
  const { estado, planoMinimo, recarregar } = useRecursoPlano(recurso);
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const irParaPlanos = useIrParaPlanos(recurso, planoMinimo);
  useContarGate(recurso, planoMinimo, estado === 'bloqueado');
  const nome = NOME_PLANO[planoMinimo];

  if (estado === 'liberado') return null;
  if (estado === 'carregando') {
    return (
      <View style={styles.cartao} accessibilityLabel="Conferindo seu plano">
        <OlliSkeleton width={140} height={18} />
        <OlliSkeleton width="90%" height={14} style={{ marginTop: Spacing.sm }} />
      </View>
    );
  }
  if (estado === 'indeterminado') {
    return (
      <View style={styles.cartao}>
        <View style={styles.selo}>
          <MaterialCommunityIcons name="cloud-alert-outline" size={14} color={cores.onSurfaceVariant} />
          <Text style={styles.seloTxt}>PLANO NÃO CONFIRMADO</Text>
        </View>
        <Text style={styles.titulo}>Não consegui confirmar seu plano agora</Text>
        <Text style={styles.texto}>
          Isto é um erro de leitura — não quer dizer que sua assinatura acabou. Confira a conexão e tente de novo.
        </Text>
        <OlliPressable onPress={() => void recarregar()} haptic="light" style={styles.botaoSecundario}
          accessibilityRole="button">
          <MaterialCommunityIcons name="refresh" size={16} color={cores.onSurface} />
          <Text style={styles.botaoSecundarioTxt}>Tentar de novo</Text>
        </OlliPressable>
      </View>
    );
  }
  const rotulo = ROTULO_RECURSO[recurso];
  if (estado === 'em_breve') {
    return (
      <View style={styles.cartao}>
        <View style={styles.selo}>
          <MaterialCommunityIcons name="clock-outline" size={14} color={cores.onSurfaceVariant} />
          <Text style={styles.seloTxt}>EM BREVE</Text>
        </View>
        <Text style={styles.titulo}>{rotulo.titulo}</Text>
        <Text style={styles.texto}>Já faz parte do seu plano e chega numa próxima atualização.</Text>
      </View>
    );
  }
  return (
    <View style={styles.cartao}>
      <View style={[styles.selo, styles.seloPlano]}>
        <MaterialCommunityIcons name="crown-outline" size={14} color={cores.accentLight} />
        <Text style={[styles.seloTxt, { color: cores.accentLight }]}>DISPONÍVEL NO {nome.toUpperCase()}</Text>
      </View>
      <Text style={styles.titulo}>{rotulo.titulo}</Text>
      <Text style={styles.texto}>{beneficio ?? beneficioRecurso(recurso)}</Text>
      <Text style={styles.nota}>Seus dados continuam salvos, em qualquer plano.</Text>
      {podeOferecerPlano() ? (
        <OlliPressable onPress={irParaPlanos} haptic="light" style={styles.botao} accessibilityRole="button">
          <MaterialCommunityIcons
            name="crown-outline"
            size={16}
            color="#FFFFFF" // contraste-ok: branco sobre o azul fixo #0B6FCE do botão (5.0:1)
          />
          <Text style={styles.botaoTxt}>Ver o plano {nome}</Text>
        </OlliPressable>
      ) : null}
    </View>
  );
}

// ─── Variante TELA (a tela inteira é do plano: PMOC, contratos) ─────────────────

interface PropsTela {
  recurso: Recurso;
  /** Título do cabeçalho — o nome da tela que a pessoa abriu. */
  titulo: string;
  children: React.ReactNode;
}

/**
 * Envolve uma TELA inteira. Com o recurso liberado, renderiza a tela (children)
 * sem custo; sem ele, um cabeçalho com voltar + o cartão do plano. Os dados que a
 * conta já tinha não são tocados — só ficam fora de alcance até o plano voltar.
 */
export function TelaRecursoPlano({ recurso, titulo, children }: PropsTela) {
  const { estado } = useRecursoPlano(recurso);
  const nav = useNavigation<any>();
  const styles = useEstilos(criarEstilos);
  if (estado === 'liberado' || estado === 'em_breve') return <>{children}</>;
  return (
    <View style={styles.tela}>
      <GradientHeader title={titulo} onBack={() => goBackOrHome(nav)} />
      <ScrollView contentContainerStyle={styles.telaCorpo}>
        <CartaoRecursoPlano recurso={recurso} />
      </ScrollView>
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      minHeight: 30,
      maxWidth: '100%',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: c.outline,
      backgroundColor: c.surfaceVariant,
    },
    chipTxt: {
      ...Typography.caption,
      color: c.onSurfaceVariant,
      flexShrink: 1,
    },
    cartao: {
      backgroundColor: c.surface,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: c.outline,
      padding: Spacing.lg,
      ...sombrasDe(c).sm,
    },
    selo: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: BorderRadius.full,
      backgroundColor: c.surfaceVariant,
      marginBottom: Spacing.md,
    },
    seloPlano: {
      backgroundColor: c.accentContainer,
    },
    seloTxt: {
      ...Typography.label,
      color: c.onSurfaceVariant,
      letterSpacing: 0.5,
    },
    titulo: {
      ...Typography.h3,
      color: c.onSurface,
    },
    texto: {
      ...Typography.body,
      color: c.onSurfaceVariant,
      marginTop: Spacing.sm,
      lineHeight: 20,
    },
    nota: {
      ...Typography.caption,
      color: c.onSurfaceMuted,
      marginTop: Spacing.md,
    },
    botao: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      minHeight: 48,
      marginTop: Spacing.lg,
      borderRadius: BorderRadius.lg,
      // Azul de marca fixo (como o CTA do GatePro): o botão de plano não muda com
      // a cor que o prestador escolheu para os documentos dele.
      backgroundColor: '#0B6FCE',
    },
    botaoTxt: {
      ...Typography.button,
      color: '#FFFFFF', // contraste-ok: branco sobre o azul fixo #0B6FCE do botão (5.0:1)
    },
    botaoSecundario: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      minHeight: 44,
      marginTop: Spacing.lg,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: comAlfa(c.onSurface, 0.2),
    },
    botaoSecundarioTxt: {
      ...Typography.button,
      color: c.onSurface,
    },
    tela: {
      flex: 1,
      backgroundColor: c.background,
    },
    telaCorpo: {
      padding: Spacing.base,
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
    },
  });
