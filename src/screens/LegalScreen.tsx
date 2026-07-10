import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Shadow } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { aplicarSeo } from '../utils/seoWeb';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { useEhDesktop } from '../hooks/useEhDesktop';
import { goBackOrHome } from '../navigation/safeBack';
import { abrirWhatsApp } from '../utils/exportarDocumento';
import { PRIVACIDADE, type LegalDoc, type LegalSection } from '../content/legal/privacidade';
import { TERMOS } from '../content/legal/termos';

/** Número de suporte/DPO do OLLI (só dígitos; o DDI 55 é aplicado por abrirWhatsApp). */
const SUPORTE_WHATSAPP = '11941727487';

type DocKey = 'privacidade' | 'termos';

/**
 * Descobre qual documento renderizar de forma robusta, sem depender da tipagem
 * exata do RootStackParamList (o integrador registra duas rotas — 'Privacidade' e
 * 'Termos' — apontando para esta mesma tela). Ordem de decisão:
 *   1) param explícito `doc` (se o integrador usar initialParams);
 *   2) nome da rota atual ('Termos' => termos);
 *   3) padrão: privacidade.
 */
function resolverDoc(nomeRota: string | undefined, param: unknown): DocKey {
  if (param === 'termos' || param === 'privacidade') return param;
  if ((nomeRota || '').toLowerCase().startsWith('term')) return 'termos';
  return 'privacidade';
}

export default function LegalScreen() {
  const nav = useNavigation<any>();
  const route = useRoute();
  const ehDesktop = useEhDesktop();

  const paramDoc = (route.params as { doc?: unknown } | undefined)?.doc;
  const docKey = useMemo(() => resolverDoc(route.name, paramDoc), [route.name, paramDoc]);
  const doc: LegalDoc = docKey === 'termos' ? TERMOS : PRIVACIDADE;
  const outroDoc = docKey === 'termos' ? PRIVACIDADE : TERMOS;
  // Rótulo curto para o botão de troca no cabeçalho (o título cheio não cabe no header).
  const outroCurto = docKey === 'termos' ? 'Privacidade' : 'Termos';

  // Esta MESMA tela serve duas rotas públicas ("/privacidade" e "/termos"), então o
  // SEO depende de `docKey` e é reaplicado ao trocar de documento — sem isso as duas
  // páginas dividiriam um canonical só. Exigência de loja e da LGPD é que ambas
  // sejam alcançáveis por link direto. No-op no nativo (ver src/utils/seoWeb.ts).
  useEffect(() => {
    if (docKey === 'termos') {
      aplicarSeo({
        titulo: 'Termos de Uso — OLLI Orçamentos',
        descricao:
          'Condições de uso do OLLI Orçamentos: assinatura, cancelamento, direito de arrependimento, responsabilidades e limites do serviço.',
        caminho: '/termos',
      });
    } else {
      aplicarSeo({
        titulo: 'Política de Privacidade — OLLI Orçamentos',
        descricao:
          'Que dados o OLLI coleta, para que usa, por quanto tempo guarda e como você exclui sua conta e seus dados. Direitos do titular segundo a LGPD.',
        caminho: '/privacidade',
      });
    }
  }, [docKey]);

  function irParaOutro() {
    // Navega para a rota irmã pelo nome. O integrador registra 'Privacidade' e 'Termos'.
    const destino = docKey === 'termos' ? 'Privacidade' : 'Termos';
    nav.navigate(destino);
  }

  function falarComSuporte() {
    const assunto =
      docKey === 'termos'
        ? 'Olá! Tenho uma dúvida sobre os Termos de Uso do OLLI.'
        : 'Olá! Tenho uma dúvida sobre a Política de Privacidade / meus dados no OLLI.';
    abrirWhatsApp(SUPORTE_WHATSAPP, assunto).catch(() => {});
  }

  return (
    <View style={styles.container}>
      <GradientHeader
        onBack={() => goBackOrHome(nav, 'Conta')}
        title={doc.titulo}
        subtitle={`Atualizado em ${doc.atualizadoEm}`}
        right={
          <TouchableOpacity style={styles.switchBtn} onPress={irParaOutro} activeOpacity={0.85}>
            <MaterialCommunityIcons name="swap-horizontal" size={14} color={Colors.accentLight} />
            <Text style={styles.switchText} numberOfLines={1}>{outroCurto}</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.inner, ehDesktop && styles.innerDesktop]}>
          {/* Aviso obrigatório — modelo a revisar com advogado */}
          <AnimatedEntrance index={0}>
            <View style={styles.aviso}>
              <MaterialCommunityIcons name="scale-balance" size={18} color={Colors.warning} />
              <Text style={styles.avisoText}>{doc.aviso}</Text>
            </View>
          </AnimatedEntrance>

          {/* Introdução */}
          <AnimatedEntrance index={1}>
            <View style={styles.introBox}>
              {doc.intro.map((p, i) => (
                <Text key={i} style={[styles.paragraph, i > 0 && styles.paragraphSpaced]}>
                  {p}
                </Text>
              ))}
            </View>
          </AnimatedEntrance>

          {/* Seções */}
          {doc.secoes.map((sec, i) => (
            <AnimatedEntrance key={sec.titulo} index={Math.min(i + 2, 10)}>
              <Secao secao={sec} />
            </AnimatedEntrance>
          ))}

          {/* Contato / suporte */}
          <TouchableOpacity style={styles.contatoBox} onPress={falarComSuporte} activeOpacity={0.85}>
            <MaterialCommunityIcons name="whatsapp" size={22} color={Colors.whatsapp} />
            <View style={{ flex: 1 }}>
              <Text style={styles.contatoTitle}>Falar com a gente</Text>
              <Text style={styles.contatoText}>
                Dúvidas ou pedidos sobre {docKey === 'termos' ? 'estes Termos' : 'privacidade e seus dados'} —
                WhatsApp (11) 94172-7487
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.onSurfaceMuted} />
          </TouchableOpacity>

          {/* Link para o outro documento */}
          <TouchableOpacity style={styles.outroBtn} onPress={irParaOutro} activeOpacity={0.85}>
            <MaterialCommunityIcons name="file-document-outline" size={18} color={Colors.accentLight} />
            <Text style={styles.outroText}>Ler também: {outroDoc.titulo}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

/** Renderiza uma seção: título + parágrafos + itens (marcadores) + tabela de dados. */
function Secao({ secao }: { secao: LegalSection }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{secao.titulo}</Text>

      {secao.paragrafos?.map((p, i) => (
        <Text key={`p${i}`} style={[styles.paragraph, i > 0 && styles.paragraphSpaced]}>
          {p}
        </Text>
      ))}

      {!!secao.itens?.length && (
        <View style={styles.itens}>
          {secao.itens.map((it, i) => (
            <View key={`i${i}`} style={styles.item}>
              <View style={styles.bullet} />
              <Text style={styles.itemText}>{it}</Text>
            </View>
          ))}
        </View>
      )}

      {!!secao.tabela?.length && (
        <View style={styles.tabela}>
          {secao.tabela.map((row, i) => (
            <View key={`t${i}`} style={styles.dataCard}>
              <Text style={styles.dataDado}>{row.dado}</Text>
              <View style={styles.dataLinha}>
                <Text style={styles.dataLabel}>Para quê</Text>
                <Text style={styles.dataValor}>{row.finalidade}</Text>
              </View>
              <View style={styles.dataLinha}>
                <Text style={styles.dataLabel}>Base legal</Text>
                <Text style={[styles.dataValor, styles.dataBase]}>{row.base}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(127,233,245,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(127,233,245,0.3)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  switchText: { fontSize: 12, fontWeight: '800', color: Colors.accentLight },

  scroll: { padding: Spacing.base, paddingBottom: 40 },
  inner: { width: '100%' },
  innerDesktop: { maxWidth: 760, alignSelf: 'center' },

  aviso: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(247,178,59,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(247,178,59,0.3)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.base,
  },
  avisoText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: Colors.onSurfaceVariant },

  introBox: { marginBottom: Spacing.sm },

  section: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.outline,
    padding: Spacing.base,
    marginTop: Spacing.md,
    ...Shadow.sm,
  },
  sectionTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: Colors.onSurface,
    marginBottom: 10,
    letterSpacing: 0.2,
  },

  paragraph: { fontSize: 14, lineHeight: 21, color: Colors.onSurfaceVariant },
  paragraphSpaced: { marginTop: 10 },

  itens: { marginTop: 10, gap: 9 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
    marginTop: 8,
  },
  itemText: { flex: 1, fontSize: 13.5, lineHeight: 20, color: Colors.onSurfaceVariant },

  tabela: { marginTop: 12, gap: 10 },
  dataCard: {
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.outline,
    padding: Spacing.md,
  },
  dataDado: { fontSize: 13.5, fontWeight: '800', color: Colors.onSurface, marginBottom: 8, lineHeight: 19 },
  dataLinha: { flexDirection: 'row', gap: 8, marginTop: 5 },
  dataLabel: {
    width: 74,
    fontSize: 10.5,
    fontWeight: '800',
    color: Colors.onSurfaceMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
  },
  dataValor: { flex: 1, fontSize: 12.5, lineHeight: 18, color: Colors.onSurfaceVariant },
  dataBase: { color: Colors.accentLight, fontWeight: '600' },

  contatoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(37,211,102,0.08)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(37,211,102,0.28)',
    padding: Spacing.base,
    marginTop: Spacing.lg,
  },
  contatoTitle: { fontSize: 14.5, fontWeight: '800', color: Colors.onSurface, marginBottom: 2 },
  contatoText: { fontSize: 12.5, lineHeight: 18, color: Colors.onSurfaceVariant },

  outroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.outline,
    paddingVertical: 14,
    marginTop: Spacing.md,
  },
  outroText: { fontSize: 13.5, fontWeight: '800', color: Colors.accentLight },
});
