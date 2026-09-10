import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { GradientHeader } from '../components/GradientHeader';
import { OlliCard } from '../components/OlliCard';
import { OlliPressable } from '../components/OlliPressable';
import { Spacing, BorderRadius, useCores, useEstilos, type Cores } from '../theme';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Atalho = {
  titulo: string;
  descricao: string;
  icone: keyof typeof MaterialCommunityIcons.glyphMap;
  cor: string;
  destino: keyof RootStackParamList;
};

/**
 * Entrada única para os documentos que já existem no produto.
 *
 * Esta tela não cria uma segunda regra de PDF: cada atalho chama a tela/gerador
 * oficial correspondente. A futura biblioteca versionada de documentos pode ser
 * adicionada aqui sem quebrar os caminhos legados.
 */
export default function CentralDocumentosScreen() {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  const atalhos: Atalho[] = [
    { titulo: 'Modelos, contratos e termos', descricao: 'Escolha o visual e gere contrato, garantia ou termo de conclusão a partir do orçamento.', icone: 'file-document-edit-outline', cor: cores.primaryLight, destino: 'ModelosDocumento' },
    { titulo: 'Recibos e pagamentos', descricao: 'Registre o recebimento, gere o recibo e compartilhe uma segunda via quando precisar.', icone: 'receipt-text-check-outline', cor: cores.success, destino: 'EmitirRecibo' },
    { titulo: 'Ordens de serviço', descricao: 'Transforme o orçamento em execução com checklist, fotos, técnico e conclusão.', icone: 'clipboard-text-outline', cor: cores.accentLight, destino: 'OrdemServico' },
    { titulo: 'PMOC e manutenção', descricao: 'Organize equipamentos, planos, periodicidades e as ordens recorrentes do cliente.', icone: 'calendar-sync-outline', cor: cores.warning, destino: 'Pmoc' },
    { titulo: 'Certificado de dedetização', descricao: 'Preencha os dados do serviço e revise o certificado antes de gerar o PDF.', icone: 'file-certificate-outline', cor: cores.success, destino: 'CertificadoAnvisa' },
  ];

  return (
    <View style={styles.raiz}>
      <GradientHeader
        title="Central de documentos"
        subtitle="Tudo que você entrega ao cliente, em um só lugar"
        onBack={() => nav.goBack()}
        compact
      />
      <ScrollView contentContainerStyle={styles.conteudo}>
        <AnimatedEntrance index={0}>
          <View style={styles.intro}>
            <View style={styles.introIcon}>
              <MaterialCommunityIcons name="file-document-multiple-outline" size={27} color={cores.accentLight} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.introTitulo}>Do orçamento ao serviço concluído</Text>
              <Text style={styles.introTexto}>Use os dados que já estão no OLLI. Você pode revisar tudo antes de compartilhar; o original enviado continua preservado.</Text>
            </View>
          </View>
        </AnimatedEntrance>

        <Text style={styles.secao}>Criar ou revisar um documento</Text>
        {atalhos.map((item, index) => (
          <AnimatedEntrance key={item.destino} index={index + 1}>
            <OlliCard style={styles.card} onPress={() => nav.navigate(item.destino as never)}>
              <View style={styles.cardLinha}>
                <View style={[styles.cardIcon, { backgroundColor: item.cor + '1A', borderColor: item.cor + '44' }]}>
                  <MaterialCommunityIcons name={item.icone} size={25} color={item.cor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitulo}>{item.titulo}</Text>
                  <Text style={styles.cardTexto}>{item.descricao}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={23} color={cores.onSurfaceMuted} />
              </View>
            </OlliCard>
          </AnimatedEntrance>
        ))}

        <Text style={styles.secao}>Orientação e fontes oficiais</Text>
        <OlliPressable style={styles.ajuda} onPress={() => nav.navigate('Ajuda', { categoriaId: 'governo', origem: 'Central de documentos' })}>
          <MaterialCommunityIcons name="help-circle-outline" size={22} color={cores.primaryLight} />
          <View style={{ flex: 1 }}>
            <Text style={styles.ajudaTitulo}>Como usar cada documento</Text>
            <Text style={styles.ajudaTexto}>Veja passo a passo, privacidade, backup e orientações de campo na Central de Ajuda.</Text>
          </View>
          <MaterialCommunityIcons name="open-in-new" size={18} color={cores.primaryLight} />
        </OlliPressable>
        <Text style={styles.nota}>O OLLI organiza os dados e gera o arquivo. Responsabilidade técnica, validade legal e assinatura certificada dependem das partes e das regras aplicáveis ao serviço.</Text>
      </ScrollView>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.background },
  conteudo: { padding: Spacing.base, paddingBottom: 44 },
  intro: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start', padding: Spacing.base, borderRadius: BorderRadius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.strokeGlow, marginBottom: Spacing.lg },
  introIcon: { width: 50, height: 50, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentLight + '18', borderWidth: 1, borderColor: c.accentLight + '40' },
  introTitulo: { color: c.onSurface, fontSize: 16, fontWeight: '800', marginBottom: 4 },
  introTexto: { color: c.onSurfaceVariant, fontSize: 13, lineHeight: 19 },
  secao: { color: c.onSurfaceMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: Spacing.sm, marginTop: Spacing.sm },
  card: { padding: Spacing.base, marginBottom: Spacing.sm },
  cardLinha: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  cardIcon: { width: 48, height: 48, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  cardTitulo: { color: c.onSurface, fontSize: 15, fontWeight: '800', marginBottom: 3 },
  cardTexto: { color: c.onSurfaceVariant, fontSize: 12.5, lineHeight: 18 },
  ajuda: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.base, borderRadius: BorderRadius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline, marginBottom: Spacing.md },
  ajudaTitulo: { color: c.onSurface, fontSize: 14, fontWeight: '800', marginBottom: 3 },
  ajudaTexto: { color: c.onSurfaceVariant, fontSize: 12.5, lineHeight: 18 },
  nota: { color: c.onSurfaceMuted, fontSize: 11.5, lineHeight: 17, textAlign: 'center', paddingHorizontal: Spacing.md },
});
