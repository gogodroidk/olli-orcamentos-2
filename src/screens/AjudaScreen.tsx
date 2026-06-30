import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, Colors, Shadow, Spacing } from '../theme';
import { Fonts } from '../theme/fonts';
import { OlliButton } from '../components/OlliButton';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Ajuda'>;

const TOPICS = [
  {
    icon: 'account-lock-outline',
    title: 'Cadastro e login',
    text: 'Todo usuário começa pela conta. Depois do login, o OLLI decide se precisa concluir o cadastro da empresa ou abrir o dashboard.',
  },
  {
    icon: 'storefront-outline',
    title: 'Cadastro da empresa',
    text: 'O onboarding coleta empresa, prestador, endereço, PIX, identidade visual e um primeiro serviço. Esses dados aparecem nos PDFs.',
  },
  {
    icon: 'file-document-edit-outline',
    title: 'Orçamentos personalizados',
    text: 'Você escolhe modelo de PDF, cor da marca, validade, assinatura, fotos do serviço, aprovação e recusa.',
  },
  {
    icon: 'account-group-outline',
    title: 'Clientes, serviços e produtos',
    text: 'Cadastros alimentam o orçamento e são sincronizados por usuário para funcionar no app e no painel web.',
  },
  {
    icon: 'calendar-clock',
    title: 'Agenda e Hoje',
    text: 'A agenda organiza visitas, instalações e manutenções. A tela Hoje resume o que precisa de atenção.',
  },
  {
    icon: 'cloud-sync-outline',
    title: 'Supabase e backup',
    text: 'O sistema usa Supabase Auth e tabelas com RLS para sincronizar empresa, clientes, itens, recibos e orçamentos.',
  },
];

const FAQ = [
  {
    q: 'Posso usar no computador?',
    a: 'Sim. No computador, o site abre como dashboard web depois do login.',
  },
  {
    q: 'Posso usar no celular sem instalar?',
    a: 'Sim. No celular existe a opção de usar a versão web pelo navegador. No Android também há APK, e no iPhone a instalação é pela Tela de Início.',
  },
  {
    q: 'Por que o cadastro é obrigatório?',
    a: 'Porque a conta é o elo entre app, dashboard web, backup e sincronização por usuário.',
  },
  {
    q: 'O Google Login já está pronto?',
    a: 'A tela suporta Google, mas o provider só funciona quando o segredo OAuth é salvo no Supabase.',
  },
];

export default function AjudaScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const desktop = width >= 768;

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 34 }]}>
      <View style={[styles.shell, desktop && styles.shellDesktop]}>
        <View style={styles.topbar}>
          <TouchableOpacity onPress={() => nav.navigate('Landing')} style={styles.backBtn} activeOpacity={0.85}>
            <MaterialCommunityIcons name="chevron-left" size={20} color={Colors.accentLight} />
            <Text style={styles.backText}>Início</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => nav.navigate('Instalar', {})} style={styles.installBtn} activeOpacity={0.85}>
            <MaterialCommunityIcons name="download-outline" size={18} color={Colors.accentLight} />
            <Text style={styles.installText}>Instalar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.hero}>
          <Text style={styles.kicker}>Central de ajuda</Text>
          <Text style={[styles.title, desktop && styles.titleDesktop]}>Entenda como usar o OLLI do cadastro ao orçamento fechado.</Text>
          <Text style={styles.subtitle}>
            Esta página explica o fluxo completo: conta, empresa, dashboard, orçamento, personalização, agenda, backup e instalação.
          </Text>
          <View style={styles.heroActions}>
            <OlliButton label="Criar conta" variant="gradient" size="lg" onPress={() => nav.navigate('Entrar', { mode: 'signup' })} />
            <OlliButton label="Entrar" variant="outline" size="lg" onPress={() => nav.navigate('Entrar', { mode: 'login' })} />
          </View>
        </View>

        <View style={[styles.topicGrid, desktop && styles.topicGridDesktop]}>
          {TOPICS.map(topic => (
            <View key={topic.title} style={styles.topic}>
              <MaterialCommunityIcons name={topic.icon as any} size={24} color={Colors.accentLight} />
              <Text style={styles.topicTitle}>{topic.title}</Text>
              <Text style={styles.topicText}>{topic.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.flowPanel}>
          <Text style={styles.panelTitle}>Mapa das telas</Text>
          <FlowRow from="Landing" to="Entrar" text="Escolha criar conta, entrar, ajuda ou instalação." />
          <FlowRow from="Entrar" to="Onboarding" text="Se a conta ainda não tem empresa, abre o cadastro guiado." />
          <FlowRow from="Onboarding" to="Dashboard" text="Concluiu empresa, abre o painel com atalhos e indicadores." />
          <FlowRow from="Dashboard" to="Orçamento" text="Novo orçamento leva por cliente, itens, detalhes e personalização." />
          <FlowRow from="Conta" to="Backup" text="Conta concentra sincronização, ferramentas e saída segura." />
        </View>

        <View style={styles.faqPanel}>
          <Text style={styles.panelTitle}>Perguntas rápidas</Text>
          {FAQ.map(item => (
            <View key={item.q} style={styles.faqItem}>
              <Text style={styles.faqQ}>{item.q}</Text>
              <Text style={styles.faqA}>{item.a}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function FlowRow({ from, to, text }: { from: string; to: string; text: string }) {
  return (
    <View style={styles.flowRow}>
      <Text style={styles.flowFrom}>{from}</Text>
      <MaterialCommunityIcons name="arrow-right" size={16} color={Colors.accentLight} />
      <Text style={styles.flowTo}>{to}</Text>
      <Text style={styles.flowText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { minHeight: '100%', paddingHorizontal: Spacing.base },
  shell: { width: '100%', maxWidth: 1120, alignSelf: 'center' },
  shellDesktop: { paddingHorizontal: Spacing.lg },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8 },
  backText: { color: Colors.accentLight, fontFamily: Fonts.bold, fontSize: 14 },
  installBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: Colors.strokeGlow, borderRadius: BorderRadius.full, paddingHorizontal: 13, paddingVertical: 8 },
  installText: { color: Colors.accentLight, fontFamily: Fonts.bold, fontSize: 13 },
  hero: { borderBottomWidth: 1, borderBottomColor: Colors.outline, paddingBottom: 24 },
  kicker: { color: Colors.accentLight, fontFamily: Fonts.extraBold, fontSize: 12, textTransform: 'uppercase' },
  title: { color: '#fff', fontFamily: Fonts.extraBold, fontSize: 32, lineHeight: 39, marginTop: 10 },
  titleDesktop: { fontSize: 50, lineHeight: 56, maxWidth: 860 },
  subtitle: { color: Colors.onSurfaceVariant, fontSize: 15.5, lineHeight: 23, marginTop: 12, maxWidth: 760 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
  topicGrid: { gap: 12, marginTop: 24 },
  topicGridDesktop: { flexDirection: 'row', flexWrap: 'wrap' },
  topic: { width: '100%', flexGrow: 1, flexBasis: 330, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.outline, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.sm },
  topicTitle: { color: '#fff', fontFamily: Fonts.extraBold, fontSize: 16, marginTop: 12 },
  topicText: { color: Colors.onSurfaceVariant, fontSize: 13, lineHeight: 19, marginTop: 6 },
  flowPanel: { backgroundColor: Colors.surfaceGlass, borderWidth: 1, borderColor: Colors.strokeGlow, borderRadius: BorderRadius.xl, padding: Spacing.base, marginTop: 24 },
  faqPanel: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.outline, borderRadius: BorderRadius.xl, padding: Spacing.base, marginTop: 16 },
  panelTitle: { color: '#fff', fontFamily: Fonts.extraBold, fontSize: 20, marginBottom: 12 },
  flowRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.outline },
  flowFrom: { color: '#fff', fontFamily: Fonts.extraBold, fontSize: 13 },
  flowTo: { color: Colors.accentLight, fontFamily: Fonts.extraBold, fontSize: 13 },
  flowText: { width: '100%', color: Colors.onSurfaceVariant, fontSize: 12.5, lineHeight: 18 },
  faqItem: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.outline },
  faqQ: { color: '#fff', fontFamily: Fonts.extraBold, fontSize: 14 },
  faqA: { color: Colors.onSurfaceVariant, fontSize: 13, lineHeight: 19, marginTop: 5 },
});
