import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '../theme';
import { OlliPressable } from './OlliPressable';
import { usePlano } from '../hooks/usePlano';
import type { Recurso, PlanoId } from '../services/planos';
import { track, Eventos } from '../services/analytics';

/**
 * <GatePro> — muro de conversão do freemium (Onda 1).
 *
 * Quando o usuário TEM acesso ao recurso, renderiza `children` direto (custo
 * zero). Quando NÃO tem, mostra o conteúdo REAL borrado/esmaecido por baixo de
 * um overlay com o benefício em 1 linha e o CTA "Ver planos" — nunca um "em
 * breve" nem um bloco vazio: o preview é o que dá vontade de assinar.
 *
 * Regra de ouro: só se usa em recursos Pro/Empresa. NUNCA envolver o fluxo de
 * criar orçamento/recibo/cliente/agenda — esses são livres no Grátis.
 */

interface Props {
  /** Recurso gateado (chave do RECURSOS_POR_PLANO). */
  recurso: Recurso;
  /** Plano mínimo que libera — decide o rótulo do CTA e do selo. */
  plano: Extract<PlanoId, 'pro' | 'empresa'>;
  /**
   * Benefício em 1 linha exibido no overlay. Se omitido, cai no texto padrão
   * do recurso (COPY_RECURSO). Passe algo específico da tela para vender melhor.
   */
  beneficio?: string;
  /** Conteúdo real (mostrado direto com acesso; borrado por baixo sem acesso). */
  children: React.ReactNode;
  /**
   * Enquanto o plano ainda carrega, por padrão mostramos o preview borrado (não
   * piscamos o conteúdo liberado para quem não paga). Passe `false` para, ao
   * contrário, esconder tudo durante o carregamento (raro).
   */
  mostrarPreviewNoCarregamento?: boolean;
}

/** Benefício padrão por recurso (1 linha, tom caloroso e concreto). */
const COPY_RECURSO: Record<Recurso, string> = {
  ia_ilimitada: 'IA sem limite: voz, chat e diagnóstico à vontade.',
  relatorios: 'Veja quanto você faturou e sua taxa de aprovação.',
  metas: 'Defina metas de venda e acompanhe seu progresso.',
  radar_clientes: 'Descubra os clientes sumidos e traga eles de volta.',
  relatorio_dia: 'Ouça o resumo do seu dia em um toque.',
  modelos_pdf_premium: 'Modelos de orçamento premium que vendem por você.',
  equipe: 'Vários técnicos, papéis e permissões.',
  mapa_equipe: 'Acompanhe sua equipe ao vivo no mapa.',
  dashboard_empresa: 'Painel de gestão com a operação inteira.',
  remove_olli_brand: 'Orçamento 100% com a sua marca, sem o selo do OLLI.',
};

const ROTULO_PLANO: Record<'pro' | 'empresa', string> = {
  pro: 'PRO',
  empresa: 'EMPRESA',
};

// Borrão real só na web (react-native-web repassa `filter`). No nativo, o mesmo
// efeito de "preview inacessível" vem do overlay + opacidade reduzida — sem
// depender de expo-blur (módulo nativo que exigiria novo prebuild). Mantemos o
// guard em tempo de execução (não em module-scope) pela lição do Hermes.
function estiloBorrado(): { opacity: number; filter?: string } {
  if (Platform.OS === 'web') {
    return { opacity: 0.9, filter: 'blur(5px)' } as { opacity: number; filter?: string };
  }
  return { opacity: 0.32 };
}

export function GatePro({
  recurso,
  plano,
  beneficio,
  children,
  mostrarPreviewNoCarregamento = true,
}: Props) {
  const { temAcesso, carregando } = usePlano();
  const liberado = temAcesso(recurso);

  // Com acesso: entrega o conteúdo real sem qualquer custo de layout.
  if (liberado) {
    return <>{children}</>;
  }

  // Ainda carregando o plano: por padrão mostra o preview bloqueado (evita
  // piscar o conteúdo pago). Quem preferir esconder no carregamento passa false.
  if (carregando && !mostrarPreviewNoCarregamento) {
    return null;
  }

  return (
    <Muro
      recurso={recurso}
      plano={plano}
      beneficio={beneficio ?? COPY_RECURSO[recurso]}
      contabilizar={!carregando}
    >
      {children}
    </Muro>
  );
}

interface MuroProps {
  recurso: Recurso;
  plano: 'pro' | 'empresa';
  beneficio: string;
  children: React.ReactNode;
  /** Só registra o funil quando o plano já foi confirmado (evita gate_visto
   *  falso do flash de carregamento para quem, no fim, é pagante). */
  contabilizar: boolean;
}

function Muro({ recurso, plano, beneficio, children, contabilizar }: MuroProps) {
  const nav = useNavigation<any>();

  // Registra a exposição do gate uma vez, só depois do plano confirmado.
  useEffect(() => {
    if (contabilizar) track(Eventos.gateVisto, { recurso, plano });
  }, [recurso, plano, contabilizar]);

  const irParaPlanos = () => {
    track(Eventos.gateCta, { recurso, plano });
    nav.navigate('Planos');
  };

  return (
    <View style={styles.wrap}>
      {/* Conteúdo real por baixo, borrado/esmaecido e NÃO interativo. */}
      <View style={styles.previewLayer} pointerEvents="none">
        <View style={[styles.preview, estiloBorrado()]}>{children}</View>
      </View>

      {/* Véu de contraste + cartão de conversão. */}
      <LinearGradient
        colors={['rgba(7,17,31,0.35)', 'rgba(7,17,31,0.82)']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.card}>
          <View style={styles.selo}>
            <MaterialCommunityIcons name="crown-outline" size={13} color="#0A1626" />
            <Text style={styles.seloTxt}>{ROTULO_PLANO[plano]}</Text>
          </View>

          <Text style={styles.beneficio} numberOfLines={2}>
            {beneficio}
          </Text>

          <OlliPressable onPress={irParaPlanos} haptic="light" style={styles.cta}>
            <LinearGradient
              colors={['#34C6D9', '#0B6FCE']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaBg}
            >
              <MaterialCommunityIcons name="lock-open-variant-outline" size={16} color={Colors.onSurface} />
              <Text style={styles.ctaTxt}>Ver planos</Text>
            </LinearGradient>
          </OlliPressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.strokeGlow,
    backgroundColor: Colors.surfaceVariant,
  },
  previewLayer: {
    // O preview define a altura do muro: ocupa o fluxo, mas sem interação.
    width: '100%',
  },
  preview: {
    width: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    alignItems: 'center',
    maxWidth: 340,
    backgroundColor: Colors.surfaceGlass,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.strokeGlow,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    ...Shadow.md,
  },
  selo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.accentLight,
    borderRadius: BorderRadius.full,
    paddingVertical: 3,
    paddingHorizontal: 10,
    marginBottom: Spacing.md,
  },
  seloTxt: {
    ...Typography.label,
    color: '#0A1626',
    letterSpacing: 0.5,
  },
  beneficio: {
    ...Typography.h4,
    color: Colors.onSurface,
    textAlign: 'center',
    marginBottom: Spacing.base,
  },
  cta: {
    alignSelf: 'stretch',
  },
  ctaBg: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: BorderRadius.lg,
    paddingVertical: 12,
    paddingHorizontal: 20,
    ...Shadow.glowCyan,
  },
  ctaTxt: {
    ...Typography.button,
    color: Colors.onSurface,
  },
});

export default GatePro;
