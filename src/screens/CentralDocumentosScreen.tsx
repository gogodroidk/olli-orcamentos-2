import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { GradientHeader } from '../components/GradientHeader';
import { OlliCard } from '../components/OlliCard';
import { OlliPressable } from '../components/OlliPressable';
import { Spacing, BorderRadius, useCores, useEstilos, type Cores } from '../theme';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { getOrcamentosPagina, getRecibosPagina, getOrdensServicoPagina, getPmocPlanosPagina } from '../database/database';
import {
  buscarBibliotecaDocumentos,
  construirBibliotecaDocumentos,
  labelStatusDocumento,
  labelTipoDocumento,
  type DocumentoBiblioteca,
  type DocumentoBibliotecaStatus,
} from '../services/bibliotecaDocumentos';

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
  const [documentos, setDocumentos] = useState<DocumentoBiblioteca[]>([]);
  const [busca, setBusca] = useState('');
  const [statusFiltro, setStatusFiltro] = useState<DocumentoBibliotecaStatus | 'todos'>('todos');
  const [carregandoDocumentos, setCarregandoDocumentos] = useState(true);
  const [erroDocumentos, setErroDocumentos] = useState(false);

  const carregarDocumentos = useCallback(async () => {
    setCarregandoDocumentos(true);
    setErroDocumentos(false);
    try {
      const [orcamentos, recibos, ordensServico, pmocPlanos] = await Promise.all([
        getOrcamentosPagina({}, 40, 0), getRecibosPagina(40, 0), getOrdensServicoPagina(40, 0), getPmocPlanosPagina(40, 0),
      ]);
      setDocumentos(construirBibliotecaDocumentos({ orcamentos, recibos, ordensServico, pmocPlanos }));
    } catch {
      setErroDocumentos(true);
    } finally {
      setCarregandoDocumentos(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void carregarDocumentos(); }, [carregarDocumentos]));

  const documentosFiltrados = useMemo(
    () => buscarBibliotecaDocumentos(documentos, busca, statusFiltro),
    [documentos, busca, statusFiltro],
  );

  function abrirDocumento(doc: DocumentoBiblioteca) {
    if (doc.tipo === 'orcamento' || doc.origemTipo === 'orcamento') {
      nav.navigate('VisualizarOrcamento', { orcamentoId: doc.origemId });
    } else if (doc.tipo === 'recibo') {
      nav.navigate('EmitirRecibo', {});
    } else if (doc.tipo === 'pmoc') {
      nav.navigate('Pmoc');
    } else {
      nav.navigate('OrdemServico');
    }
  }

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

        <Text style={styles.secao}>Biblioteca atual ({documentosFiltrados.length})</Text>
        <View style={styles.buscaWrap}>
          <MaterialCommunityIcons name="magnify" size={20} color={cores.onSurfaceMuted} />
          <TextInput
            value={busca}
            onChangeText={setBusca}
            placeholder="Buscar por cliente, número ou documento"
            placeholderTextColor={cores.onSurfaceMuted}
            style={styles.busca}
            accessibilityLabel="Buscar documentos"
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtros}>
          {(['todos', 'rascunho', 'pronto', 'enviado', 'assinado', 'arquivado'] as const).map((status) => (
            <TouchableOpacity
              key={status}
              onPress={() => setStatusFiltro(status)}
              style={[styles.filtro, statusFiltro === status && styles.filtroAtivo]}
              accessibilityRole="button"
              accessibilityState={{ selected: statusFiltro === status }}
            >
              <Text style={[styles.filtroTexto, statusFiltro === status && styles.filtroTextoAtivo]}>{status === 'todos' ? 'Todos' : labelStatusDocumento(status)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {carregandoDocumentos ? (
          <View style={styles.estado}><ActivityIndicator color={cores.primary} /><Text style={styles.estadoTexto}>Carregando documentos…</Text></View>
        ) : erroDocumentos ? (
          <View style={styles.estado}><MaterialCommunityIcons name="alert-circle-outline" size={22} color={cores.warning} /><Text style={styles.estadoTexto}>Não foi possível ler a biblioteca agora.</Text><TouchableOpacity onPress={() => void carregarDocumentos()}><Text style={styles.tentar}>Tentar de novo</Text></TouchableOpacity></View>
        ) : documentosFiltrados.length === 0 ? (
          <View style={styles.estado}><MaterialCommunityIcons name="file-search-outline" size={25} color={cores.onSurfaceMuted} /><Text style={styles.estadoTexto}>Nenhum documento corresponde ao filtro.</Text></View>
        ) : (
          <View style={styles.listaDocumentos}>
            {documentosFiltrados.slice(0, 30).map((doc, index) => (
              <AnimatedEntrance key={doc.id} index={Math.min(index, 8)}>
                <TouchableOpacity style={styles.documentoLinha} onPress={() => abrirDocumento(doc)} accessibilityRole="button" accessibilityLabel={`${doc.titulo}, ${labelStatusDocumento(doc.status)}`}>
                  <View style={styles.documentoIcone}><MaterialCommunityIcons name={doc.tipo === 'recibo' ? 'receipt-text-outline' : doc.tipo === 'pmoc' ? 'calendar-sync-outline' : doc.tipo === 'ordem_servico' ? 'clipboard-text-outline' : 'file-document-outline'} size={20} color={cores.primaryLight} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.documentoTitulo} numberOfLines={1}>{doc.titulo}</Text>
                    <Text style={styles.documentoMeta} numberOfLines={1}>{doc.clienteNome || 'Documento técnico'} · {labelTipoDocumento(doc.tipo)}</Text>
                  </View>
                  <View style={styles.documentoStatus}><Text style={styles.documentoStatusTexto}>{labelStatusDocumento(doc.status)}</Text></View>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={cores.onSurfaceMuted} />
                </TouchableOpacity>
              </AnimatedEntrance>
            ))}
          </View>
        )}

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
  buscaWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, minHeight: 48, marginBottom: Spacing.sm },
  busca: { flex: 1, color: c.onSurface, fontSize: 13.5 },
  filtros: { gap: Spacing.sm, paddingBottom: Spacing.md },
  filtro: { borderWidth: 1, borderColor: c.outline, borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.surface },
  filtroAtivo: { borderColor: c.primary, backgroundColor: c.primary + '18' },
  filtroTexto: { color: c.onSurfaceVariant, fontSize: 12, fontWeight: '700' },
  filtroTextoAtivo: { color: c.primaryLight },
  estado: { minHeight: 78, alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.md },
  estadoTexto: { color: c.onSurfaceVariant, fontSize: 12.5, textAlign: 'center' },
  tentar: { color: c.primaryLight, fontSize: 12.5, fontWeight: '800' },
  listaDocumentos: { gap: 6, marginBottom: Spacing.md },
  documentoLinha: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 60, paddingHorizontal: 10, paddingVertical: 9, borderRadius: BorderRadius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline },
  documentoIcone: { width: 34, height: 34, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primaryLight + '15' },
  documentoTitulo: { color: c.onSurface, fontSize: 13, fontWeight: '800' },
  documentoMeta: { color: c.onSurfaceMuted, fontSize: 11.5, marginTop: 2 },
  documentoStatus: { borderRadius: BorderRadius.full, backgroundColor: c.surfaceVariant, paddingHorizontal: 7, paddingVertical: 4 },
  documentoStatusTexto: { color: c.onSurfaceVariant, fontSize: 10, fontWeight: '800' },
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
