import React, { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { Spacing, BorderRadius, useCores, useEstilos, type Cores } from '../theme';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { prepararPreviaAutopilot, type AutopilotPrevia, type IntencaoAutopilot } from '../services/iaAutopilot';
import { goBackOrHome } from '../navigation/safeBack';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type FonteLocal = { uri: string; nome: string; mimeType: string; tamanhoBytes?: number };

const INTENCOES: Array<{ value: IntencaoAutopilot; label: string }> = [
  { value: 'cadastro', label: 'Cadastrar clientes e catálogo' },
  { value: 'orcamento', label: 'Montar orçamento rascunho' },
  { value: 'documento', label: 'Entender um documento' },
  { value: 'conversa', label: 'Organizar atendimento' },
];

export default function AutopilotScreen() {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [fonte, setFonte] = useState<FonteLocal | null>(null);
  const [texto, setTexto] = useState('');
  const [pedido, setPedido] = useState('');
  const [intencao, setIntencao] = useState<IntencaoAutopilot>('cadastro');
  const [previa, setPrevia] = useState<AutopilotPrevia | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function escolherArquivo() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv', 'application/json'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setFonte({ uri: asset.uri, nome: asset.name, mimeType: asset.mimeType ?? '', tamanhoBytes: asset.size });
    setPrevia(null);
    setErro(null);
  }

  async function escolherFoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8, allowsEditing: false });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setFonte({ uri: asset.uri, nome: asset.fileName ?? 'foto-olli.jpg', mimeType: asset.mimeType ?? 'image/jpeg', tamanhoBytes: asset.fileSize });
    setPrevia(null);
    setErro(null);
  }

  async function analisar() {
    if (!fonte && !texto.trim()) {
      setErro('Cole uma conversa ou escolha um arquivo antes de analisar.');
      return;
    }
    setCarregando(true);
    setErro(null);
    setPrevia(null);
    const result = await prepararPreviaAutopilot({
      uri: fonte?.uri, nomeArquivo: fonte?.nome, mimeType: fonte?.mimeType, tamanhoBytes: fonte?.tamanhoBytes,
      texto: fonte ? undefined : texto, pedidoOriginal: pedido, intencao,
    });
    setCarregando(false);
    if (result.ok) setPrevia(result.previa);
    else setErro(mensagemErro(result.erro));
  }

  function abrirOrcamento() {
    const itens = (previa?.candidatos.orcamento.itens ?? []).filter((item): item is typeof item & { tipo: 'servico' | 'produto' } => item.tipo === 'servico' || item.tipo === 'produto');
    if (!itens.length) return;
    nav.navigate('NovoOrcamento', { prefillItems: itens.map((item) => ({ tipo: item.tipo, nome: item.nome, descricao: item.descricao, quantidade: item.quantidade })) });
  }

  function limpar() {
    setFonte(null); setTexto(''); setPedido(''); setPrevia(null); setErro(null);
  }

  const catalogo = [...(previa?.candidatos.produtos ?? []), ...(previa?.candidatos.servicos ?? [])];
  const itens = previa?.candidatos.orcamento.itens ?? [];

  return (
    <KeyboardAvoidingView style={styles.raiz} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <GradientHeader title="Autopilot OLLI" subtitle="Anexe, revise e transforme em trabalho" onBack={() => goBackOrHome(nav)} />
      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        <AnimatedEntrance index={0}>
          <View style={styles.intro}>
            <View style={styles.introIcon}><MaterialCommunityIcons name="robot-happy-outline" size={27} color={cores.accentLight} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.introTitulo}>A OLLI organiza a bagunça</Text>
              <Text style={styles.introTexto}>Envie uma conversa, print, PDF ou lista de preços. A resposta é uma prévia; nada é cadastrado ou enviado sem sua confirmação.</Text>
            </View>
          </View>
        </AnimatedEntrance>

        <View style={styles.card}>
          <Text style={styles.label}>O que você quer preparar?</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.opcoes}>
            {INTENCOES.map((opcao) => <TouchableOpacity key={opcao.value} style={[styles.opcao, intencao === opcao.value && styles.opcaoAtiva]} onPress={() => setIntencao(opcao.value)} accessibilityRole="button" accessibilityState={{ selected: intencao === opcao.value }}><Text style={[styles.opcaoTexto, intencao === opcao.value && styles.opcaoTextoAtiva]}>{opcao.label}</Text></TouchableOpacity>)}
          </ScrollView>
          <Text style={styles.label}>Conversa ou instrução</Text>
          <TextInput value={texto} onChangeText={(value) => setTexto(value.slice(0, 20_000))} placeholder="Cole a conversa exportada ou explique o que precisa…" placeholderTextColor={cores.onSurfaceMuted} multiline style={styles.textarea} editable={!carregando} accessibilityLabel="Conversa ou instrução para o Autopilot" />
          <TextInput value={pedido} onChangeText={(value) => setPedido(value.slice(0, 2_000))} placeholder="Instrução opcional (ex.: use minha margem padrão)" placeholderTextColor={cores.onSurfaceMuted} style={styles.input} editable={!carregando} accessibilityLabel="Instrução opcional" />
          <View style={styles.fonteAcoes}>
            <OlliButton label="Anexar PDF/arquivo" variant="outline" size="sm" onPress={() => { void escolherArquivo(); }} icon={<MaterialCommunityIcons name="paperclip" size={17} color={cores.primary} />} />
            <OlliButton label="Escolher foto" variant="outline" size="sm" onPress={() => { void escolherFoto(); }} icon={<MaterialCommunityIcons name="image-outline" size={17} color={cores.primary} />} />
          </View>
          {fonte && <View style={styles.fonteSelecionada}><MaterialCommunityIcons name="file-check-outline" size={18} color={cores.success} /><Text style={styles.fonteTexto} numberOfLines={1}>{fonte.nome}{fonte.tamanhoBytes ? ` · ${(fonte.tamanhoBytes / 1024 / 1024).toFixed(2)} MB` : ''}</Text><TouchableOpacity onPress={() => setFonte(null)} accessibilityRole="button" accessibilityLabel="Remover arquivo"><MaterialCommunityIcons name="close" size={18} color={cores.onSurfaceMuted} /></TouchableOpacity></View>}
          {fonte?.mimeType.startsWith('image/') && <Image source={{ uri: fonte.uri }} style={styles.previewImagem} resizeMode="cover" accessibilityLabel="Prévia do arquivo de imagem selecionado" />}
          <OlliButton label={carregando ? 'Analisando…' : 'Preparar prévia'} variant="gradient" size="lg" fullWidth onPress={() => { void analisar(); }} disabled={carregando || (!fonte && !texto.trim())} loading={carregando} icon={!carregando ? <MaterialCommunityIcons name="auto-fix" size={20} color="#fff" /> : undefined} style={{ marginTop: Spacing.md }} />
        </View>

        {erro && <View style={styles.erro} accessibilityRole="alert"><MaterialCommunityIcons name="alert-circle-outline" size={19} color={cores.warning} /><Text style={styles.erroTexto}>{erro}</Text></View>}
        {carregando && <View style={styles.carregando}><ActivityIndicator color={cores.primary} /><Text style={styles.carregandoTexto}>Lendo a fonte e preparando campos…</Text></View>}

        {previa && <View style={styles.resultado}>
          <View style={styles.resultadoCabecalho}><MaterialCommunityIcons name="shield-check-outline" size={20} color={cores.success} /><View style={{ flex: 1 }}><Text style={styles.resultadoTitulo}>Prévia aguardando confirmação</Text><Text style={styles.resultadoSub}>{previa.fonte.nome} · {previa.fonte.parser}</Text></View></View>
          <View style={styles.contadores}>{[['Clientes', previa.candidatos.clientes.length], ['Produtos', previa.candidatos.produtos.length], ['Serviços', previa.candidatos.servicos.length], ['Itens', itens.length]].map(([label, count]) => <View key={String(label)} style={styles.contador}><Text style={styles.contadorLabel}>{label}</Text><Text style={styles.contadorValor}>{String(count)}</Text></View>)}</View>
          {previa.candidatos.clientes.map((item) => <View key={`cliente-${item.nome}-${item.telefone}`} style={styles.linha}><MaterialCommunityIcons name="account-outline" size={18} color={cores.primaryLight} /><View style={{ flex: 1 }}><Text style={styles.linhaTitulo}>{item.nome}</Text><Text style={styles.linhaSub}>{item.telefone || 'Telefone não identificado'}{item.evidencia ? ` · ${item.evidencia}` : ''}</Text></View><Text style={styles.confianca}>{Math.round(item.confianca * 100)}%</Text></View>)}
          {catalogo.slice(0, 12).map((item, index) => <View key={`catalogo-${item.nome}-${index}`} style={styles.linha}><MaterialCommunityIcons name="package-variant-closed" size={18} color={cores.accentLight} /><View style={{ flex: 1 }}><Text style={styles.linhaTitulo}>{item.nome}</Text><Text style={styles.linhaSub}>R$ {item.precoSugerido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} sugerido · {item.unidade}</Text></View><Text style={styles.confianca}>{Math.round(item.confianca * 100)}%</Text></View>)}
          {itens.slice(0, 12).map((item, index) => <View key={`item-${item.nome}-${index}`} style={styles.linha}><MaterialCommunityIcons name="file-document-outline" size={18} color={cores.accentLight} /><View style={{ flex: 1 }}><Text style={styles.linhaTitulo}>{item.quantidade} {item.unidade} · {item.nome}</Text><Text style={styles.linhaSub}>R$ {item.precoSugerido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} sugerido</Text></View><Text style={styles.confianca}>{Math.round(item.confianca * 100)}%</Text></View>)}
          {previa.candidatos.documentos.map((doc) => <View key={`doc-${doc.titulo}`} style={styles.documento}><MaterialCommunityIcons name="file-edit-outline" size={18} color={cores.primaryLight} /><View style={{ flex: 1 }}><Text style={styles.linhaTitulo}>{doc.titulo}</Text><Text style={styles.linhaSub} numberOfLines={3}>{doc.texto || 'Documento identificado; abra a origem para revisar o texto completo.'}</Text></View></View>)}
          {previa.candidatos.avisos.length > 0 && <View style={styles.aviso}><Text style={styles.avisoTitulo}>Revise antes de usar</Text>{previa.candidatos.avisos.map((aviso) => <Text key={aviso} style={styles.avisoTexto}>• {aviso}</Text>)}</View>}
          <OlliButton label="Abrir orçamento rascunho" variant="gradient" size="lg" fullWidth onPress={abrirOrcamento} disabled={!itens.length} icon={<MaterialCommunityIcons name="file-plus-outline" size={20} color="#fff" />} style={{ marginTop: Spacing.md }} />
          <TouchableOpacity style={styles.limpar} onPress={limpar} accessibilityRole="button"><MaterialCommunityIcons name="refresh" size={16} color={cores.accentLight} /><Text style={styles.limparTexto}>Começar outra prévia</Text></TouchableOpacity>
        </View>}

        <Text style={styles.nota}>A OLLI não lê WhatsApp/Instagram automaticamente, não usa cookies e não envia mensagens. Prints, PDFs e preços são referências fornecidas por você; confira telefone, documento, unidade e valor antes de salvar.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function mensagemErro(erro: string): string {
  const mensagens: Record<string, string> = {
    ia_nao_configurada: 'A IA ainda não está habilitada neste ambiente de teste.',
    nao_autorizado: 'Entre na sua conta para usar o Autopilot.',
    arquivo_grande_demais: 'Use um arquivo de até 4 MB nesta primeira versão.',
    parser_arquivo_nao_configurado: 'A leitura de PDF/imagem ainda não está habilitada neste ambiente.',
    assinatura_arquivo_invalida: 'O tipo interno do arquivo não confere; por segurança, nada foi processado.',
    tipo_arquivo_nao_permitido: 'Use PDF, PNG, JPG, WEBP, TXT, CSV ou JSON.',
    fonte_obrigatoria: 'Cole uma conversa ou escolha um arquivo.',
  };
  return mensagens[erro] ?? 'Não consegui preparar a prévia agora. Nada foi alterado.';
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.background },
  conteudo: { padding: Spacing.base, paddingBottom: 50, gap: Spacing.md },
  intro: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start', padding: Spacing.base, borderRadius: BorderRadius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.strokeGlow },
  introIcon: { width: 50, height: 50, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentLight + '18', borderWidth: 1, borderColor: c.accentLight + '40' },
  introTitulo: { color: c.onSurface, fontSize: 16, fontWeight: '800', marginBottom: 4 }, introTexto: { color: c.onSurfaceVariant, fontSize: 13, lineHeight: 19 },
  card: { padding: Spacing.base, borderRadius: BorderRadius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline },
  label: { color: c.onSurface, fontSize: 13, fontWeight: '800', marginTop: 2, marginBottom: 7 },
  opcoes: { gap: 8, paddingBottom: Spacing.md }, opcao: { borderWidth: 1, borderColor: c.outline, borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: c.surfaceVariant }, opcaoAtiva: { borderColor: c.primary, backgroundColor: c.primary + '22' }, opcaoTexto: { color: c.onSurfaceVariant, fontSize: 11.5, fontWeight: '700' }, opcaoTextoAtiva: { color: c.primaryLight },
  textarea: { minHeight: 112, borderWidth: 1, borderColor: c.outline, borderRadius: BorderRadius.md, padding: 12, color: c.onSurface, fontSize: 14, lineHeight: 20, textAlignVertical: 'top', backgroundColor: c.background }, input: { minHeight: 46, borderWidth: 1, borderColor: c.outline, borderRadius: BorderRadius.md, paddingHorizontal: 12, color: c.onSurface, fontSize: 13, marginTop: 9, backgroundColor: c.background },
  fonteAcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }, fonteSelecionada: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, padding: 10, borderRadius: BorderRadius.md, backgroundColor: c.success + '12', borderWidth: 1, borderColor: c.success + '44' }, fonteTexto: { flex: 1, color: c.onSurfaceVariant, fontSize: 12 }, previewImagem: { width: '100%', height: 160, borderRadius: BorderRadius.md, marginTop: 10, backgroundColor: c.surfaceVariant },
  erro: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.warning + '55', backgroundColor: c.warning + '12' }, erroTexto: { flex: 1, color: c.onSurfaceVariant, fontSize: 13, lineHeight: 19 }, carregando: { alignItems: 'center', gap: 8, paddingVertical: Spacing.base }, carregandoTexto: { color: c.onSurfaceVariant, fontSize: 13 },
  resultado: { padding: Spacing.base, borderRadius: BorderRadius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.primary + '55' }, resultadoCabecalho: { flexDirection: 'row', alignItems: 'center', gap: 10 }, resultadoTitulo: { color: c.onSurface, fontSize: 15, fontWeight: '800' }, resultadoSub: { color: c.onSurfaceMuted, fontSize: 11.5, marginTop: 2 }, contadores: { flexDirection: 'row', gap: 7, marginVertical: Spacing.md }, contador: { flex: 1, minHeight: 58, padding: 8, borderRadius: BorderRadius.sm, backgroundColor: c.surfaceVariant }, contadorLabel: { color: c.onSurfaceMuted, fontSize: 10 }, contadorValor: { color: c.onSurface, fontSize: 20, fontWeight: '800', marginTop: 3 }, linha: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.outline }, linhaTitulo: { color: c.onSurface, fontSize: 13, fontWeight: '700' }, linhaSub: { color: c.onSurfaceMuted, fontSize: 11.5, lineHeight: 17, marginTop: 2 }, confianca: { color: c.accentLight, fontSize: 11, fontWeight: '800' }, documento: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 10, borderRadius: BorderRadius.md, backgroundColor: c.primary + '10', marginTop: 10 }, aviso: { padding: 12, borderRadius: BorderRadius.md, backgroundColor: c.warning + '12', borderWidth: 1, borderColor: c.warning + '44', marginTop: 12 }, avisoTitulo: { color: c.onSurface, fontSize: 12.5, fontWeight: '800', marginBottom: 4 }, avisoTexto: { color: c.onSurfaceVariant, fontSize: 11.5, lineHeight: 17 }, limpar: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, minHeight: 44, marginTop: 4 }, limparTexto: { color: c.accentLight, fontSize: 12.5, fontWeight: '800' }, nota: { color: c.onSurfaceMuted, textAlign: 'center', fontSize: 11.5, lineHeight: 17, paddingHorizontal: 8 },
});
