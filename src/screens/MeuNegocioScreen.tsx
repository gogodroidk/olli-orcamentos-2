import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Alert, Image, Modal, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, textoSobre, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { OlliInput } from '../components/OlliInput';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { getEmpresa, saveEmpresa, getDepoimentos, saveDepoimento, deleteDepoimento } from '../database/database';
import { consultarCnpj } from '../services/cnpj';
import { deduzirVerticais, ferramentasSugeridas, verticalPorId } from '../services/verticais';
import { SEGMENTO_PARA_VERTICAL, VERTICAL_PARA_SEGMENTO } from '../services/verticalSegmento';
import { sugerirMarcaComIA, type SugestaoMarca } from '../services/assistenteMarca';
import { recarregarVerticais } from '../hooks/useVerticais';
import { usePlano } from '../hooks/usePlano';
import { Empresa, Depoimento, SEGMENTOS, Segmento } from '../types';
import { CORES_MARCA, contrasteTextoSobre } from '../utils/coresMarca';
import { extrairCoresLogo } from '../utils/extrairCoresLogo';
import { generateId } from '../utils/id';
import { nowISO } from '../utils/date';
import { track, Eventos } from '../services/analytics';
import { goBackOrHome } from '../navigation/safeBack';
import { GuardaPapel } from '../components/GuardaPapel';
import { imagemEscolhidaParaDataUri } from '../utils/imagemPortatil';
import { camposPendentesPerfil, ROTULO_CAMPO_PERFIL } from '../services/perfilOperacional';
import { isValidCNPJ } from '../utils/masks';

/**
 * Empresa EM BRANCO para instalações novas (não há seed: getEmpresa() retorna
 * null no primeiro acesso). Sem isto a tela ficava em branco para sempre e o
 * usuário nunca conseguia cadastrar nome/logo/assinatura — e todo PDF saía
 * sem cabeçalho. Todos os campos obrigatórios do tipo Empresa recebem default
 * válido ('' para string, id fixo) para o objeto nunca conter `undefined`.
 */
function empresaEmBranco(): Empresa {
  return {
    id: 'empresa_1',
    nome: '',
    especialidade: '',
    slogan: '',
    cnpj: '',
    cpf: '',
    endereco: '',
    cidade: '',
    estado: '',
    telefone: '',
    whatsapp: '',
    site: '',
    email: '',
    chavePix: '',
    normas: '',
    nomePrestador: '',
  };
}

const VALIDADES_PADRAO = [7, 15, 30, 60];

const GARANTIAS_PADRAO: { dias: number; label: string; texto: string }[] = [
  {
    dias: 30,
    label: '30 dias',
    texto: 'Garantia de 30 dias para peças e materiais não duráveis, conforme art. 26 do Código de Defesa do Consumidor (CDC).',
  },
  {
    dias: 90,
    label: '90 dias',
    texto: 'Garantia de 90 dias para a mão de obra e materiais duráveis, conforme art. 26 do Código de Defesa do Consumidor (CDC).',
  },
  {
    dias: 365,
    label: '365 dias',
    texto: 'Garantia estendida de 12 meses para mão de obra e materiais, superior ao mínimo legal do art. 26 do CDC.',
  },
];

export default function MeuNegocioScreen() {
  // Identidade comercial da empresa: marca, preços/garantia padrão e dados que vão
  // em todo PDF — camada de valores do negócio que o contrato nega ao técnico.
  return (
    <GuardaPapel acao="ver_valores_agregados" area="Meu Negócio">
      <MeuNegocioConteudo />
    </GuardaPapel>
  );
}

function MeuNegocioConteudo() {
  const nav = useNavigation<any>();
  const { consumirUsoIa } = usePlano();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  // Altura da barra de navegação do sistema (gestos/3 botões virtuais) —
  // some no fundo do scroll e nas barras fixas para nada ficar por baixo dela.
  const insets = useSafeAreaInsets();
  // Ink de contraste calculado para texto/ícone sobre `accentLight` (chip/botão
  // ativo) — substitui o '#0A1626' fixo, que só era correto para o ciano padrão.
  const textoSobreAccent = textoSobre(cores.accentLight);
    // Evita re-extrair a paleta a cada focus (closure de coresSugeridas fica stale).
  const extraiuCoresRef = React.useRef(false);
const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [dirty, setDirty] = useState(false);

  // Guarda contra perda silenciosa: sair com alterações não salvas (botão voltar do header,
  // gesto ou botão físico) pede confirmação antes de descartar os campos editados.
  useEffect(() => {
    const remover = nav.addListener('beforeRemove', (e: any) => {
      if (!dirty) return;
      e.preventDefault();
      Alert.alert(
        'Descartar alterações?',
        'Você tem alterações não salvas em "Meu negócio".',
        [
          { text: 'Continuar editando', style: 'cancel' },
          { text: 'Descartar', style: 'destructive', onPress: () => nav.dispatch(e.data.action) },
        ],
      );
    });
    return remover;
  }, [nav, dirty]);
  const [depoimentos, setDepoimentos] = useState<Depoimento[]>([]);
  const [showDep, setShowDep] = useState(false);
  const [newDep, setNewDep] = useState<Partial<Depoimento>>({ estrelas: 5 });
  const [salvando, setSalvando] = useState(false);
  const [coresSugeridas, setCoresSugeridas] = useState<string[]>([]);
  const [extraindo, setExtraindo] = useState(false);
  const [imagemProcessando, setImagemProcessando] = useState<'logoUri' | 'assinaturaUri' | null>(null);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjInfo, setCnpjInfo] = useState<string | null>(null);
  const [showMarcaIA, setShowMarcaIA] = useState(false);
  const [pedidoMarca, setPedidoMarca] = useState('');
  const [marcaIaLoading, setMarcaIaLoading] = useState(false);
  const [marcaIaErro, setMarcaIaErro] = useState<string | null>(null);
  const [sugestaoMarca, setSugestaoMarca] = useState<SugestaoMarca | null>(null);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const [emp, deps] = await Promise.all([getEmpresa(), getDepoimentos()]);
    // Instalação nova ainda sem empresa: inicializa um registro em branco para
    // o formulário aparecer e poder SALVAR (saveEmpresa cria o registro de fato).
    const empresaCarregada = emp ?? empresaEmBranco();
    setEmpresa(empresaCarregada);
    setDepoimentos(deps);
    setDirty(false);
    // Logo já cadastrada em instalações antigas nunca teve suas cores
    // extraídas — roda uma vez ao focar a tela, sem bloquear a UI.
    if (empresaCarregada.logoUri && !extraiuCoresRef.current) {
      extraiuCoresRef.current = true;
      setExtraindo(true);
      extrairCoresLogo(empresaCarregada.logoUri)
        .then(setCoresSugeridas)
        .finally(() => setExtraindo(false));
    }
  }

  function set(field: keyof Empresa, value: string) {
    setEmpresa(p => p ? { ...p, [field]: value } : p);
    setDirty(true);
  }

  function chooseSegmento(id: Segmento) {
    // O segmento também define o OFÍCIO (verticais) que dirige o gate de ferramentas por
    // vertical — um pintor deixa de ver ar-condicionado. Ver src/hooks/useVerticais.ts.
    const vertical = SEGMENTO_PARA_VERTICAL[id];
    setEmpresa(p => (p ? { ...p, segmento: id, verticais: [vertical], ferramentasAtivas: ferramentasSugeridas([vertical]) } : p));
    setDirty(true);
    Haptics.selectionAsync().catch(() => {});
    track(Eventos.segmentoChanged, { segmento: id });
  }

  function chooseCorMarca(cor: string) {
    setEmpresa(p => (p ? { ...p, corMarca: cor } : p));
    setDirty(true);
    Haptics.selectionAsync().catch(() => {});
  }

  function chooseValidadeDias(dias: number) {
    setEmpresa(p => (p ? { ...p, validadeDiasPadrao: dias } : p));
    setDirty(true);
    Haptics.selectionAsync().catch(() => {});
  }

  function chooseGarantiaSugerida(texto: string) {
    setEmpresa(p => (p ? { ...p, garantiaPadrao: texto } : p));
    setDirty(true);
    Haptics.selectionAsync().catch(() => {});
  }

  async function handleSave() {
    if (!empresa || salvando || imagemProcessando) return;
    const pendentes = camposPendentesPerfil(empresa);
    if (pendentes.length > 0) {
      Alert.alert(
        'Complete os dados essenciais',
        `Antes de usar a plataforma, preencha: ${pendentes.map(campo => ROTULO_CAMPO_PERFIL[campo]).join(', ')}.`,
      );
      return;
    }
    if (empresa.cnpj.trim() && !isValidCNPJ(empresa.cnpj)) {
      Alert.alert('CNPJ inválido', 'Confira os números antes de salvar.');
      return;
    }
    setSalvando(true);
    try {
      await saveEmpresa(empresa);
      void recarregarVerticais(); // atualiza o gate de ferramentas por ofício na hora
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDirty(false);
      Alert.alert('Salvo!', 'Dados da empresa atualizados.');
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível salvar os dados agora. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  async function pickImage(field: 'logoUri' | 'assinaturaUri') {
    if (imagemProcessando) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permissão', 'Permita o acesso às fotos.'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.9 });
    if (!r.canceled && empresa) {
      setImagemProcessando(field);
      try {
        const resultado = await imagemEscolhidaParaDataUri(r.assets[0]);
        if (!resultado.ok) {
          Alert.alert('Imagem não adicionada', resultado.erro);
          return;
        }
        const uri = resultado.dataUri;
        setEmpresa(p => (p ? { ...p, [field]: uri } : p));
        setDirty(true);
        if (field === 'logoUri') {
          setExtraindo(true);
          setCoresSugeridas([]);
          extrairCoresLogo(uri)
            .then(setCoresSugeridas)
            .finally(() => setExtraindo(false));
        }
      } finally {
        setImagemProcessando(null);
      }
    }
  }

  /**
   * Reaproveita a mesma consulta protegida do onboarding. O resultado só entra
   * no rascunho e apenas completa campos vazios; salvar continua sendo uma ação
   * explícita do dono da empresa.
   */
  async function buscarCnpj() {
    if (!empresa || cnpjLoading) return;
    const digits = empresa.cnpj.replace(/\D/g, '');
    if (digits.length !== 14) {
      setCnpjInfo('Informe o CNPJ completo, com 14 dígitos, para buscar.');
      return;
    }
    setCnpjLoading(true);
    setCnpjInfo(null);
    try {
      const resultado = await consultarCnpj(digits);
      if (resultado.estado === 'ok') {
        const encontrada = resultado.empresa;
        const verticais = deduzirVerticais(
          encontrada.cnaePrincipal.codigo,
          encontrada.cnaesSecundarios.map(cnae => cnae.codigo),
        );
        const principal = verticais[0];
        const nomeEmpresa = encontrada.nomeFantasia || encontrada.razaoSocial;
        const enderecoEncontrado = [encontrada.logradouro, encontrada.bairro].filter(Boolean).join(', ');
        setEmpresa(atual => atual ? {
          ...atual,
          tipoNegocio: 'empresa',
          nome: atual.nome.trim() || nomeEmpresa,
          especialidade: atual.especialidade.trim() || encontrada.cnaePrincipal.descricao,
          segmento: atual.segmento ?? VERTICAL_PARA_SEGMENTO[principal] ?? 'outro',
          verticais: atual.verticais?.length ? atual.verticais : verticais,
          ferramentasAtivas: atual.ferramentasAtivas?.length ? atual.ferramentasAtivas : ferramentasSugeridas(verticais),
          endereco: atual.endereco.trim() || enderecoEncontrado,
          cidade: atual.cidade.trim() || encontrada.municipio,
          estado: atual.estado.trim() || encontrada.uf,
        } : atual);
        setDirty(true);
        setCnpjInfo(
          principal === 'geral'
            ? `Achei ${nomeEmpresa}. Completei os campos vazios — confira antes de salvar.`
            : `Achei ${nomeEmpresa} e identifiquei ${verticalPorId(principal).label}. Confira antes de salvar.`,
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else if (resultado.estado === 'nao_encontrado') {
        setCnpjInfo('Não achei esse CNPJ. Confira o número ou preencha os dados manualmente.');
      } else if (resultado.estado === 'invalido') {
        setCnpjInfo('O CNPJ precisa ter 14 dígitos.');
      } else {
        setCnpjInfo('A busca está indisponível agora. Seus dados não foram alterados; você pode preencher manualmente.');
      }
    } finally {
      setCnpjLoading(false);
    }
  }

  async function gerarSugestaoMarca() {
    if (!empresa || marcaIaLoading) return;
    if (!pedidoMarca.trim()) {
      setMarcaIaErro('Conte como você quer que sua empresa seja percebida.');
      return;
    }
    setMarcaIaLoading(true);
    setMarcaIaErro(null);
    setSugestaoMarca(null);
    try {
      const segmento = SEGMENTOS.find(item => item.id === empresa.segmento)?.label;
      const resultado = await sugerirMarcaComIA({
        nomeEmpresa: empresa.nome,
        segmento,
        especialidadeAtual: empresa.especialidade,
        sloganAtual: empresa.slogan,
        pedido: pedidoMarca,
      });
      if (resultado.estado === 'ok') {
        setSugestaoMarca(resultado.sugestao);
        await consumirUsoIa();
        Haptics.selectionAsync().catch(() => {});
      } else {
        setMarcaIaErro(resultado.mensagem);
      }
    } finally {
      setMarcaIaLoading(false);
    }
  }

  function aplicarSugestaoMarca() {
    if (!sugestaoMarca) return;
    setEmpresa(atual => atual ? {
      ...atual,
      especialidade: sugestaoMarca.especialidade,
      slogan: sugestaoMarca.slogan,
    } : atual);
    setDirty(true);
    setShowMarcaIA(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }

  async function handleSaveDep() {
    if (!newDep.nomeCliente?.trim()) return;
    await saveDepoimento({ id: generateId(), nomeCliente: newDep.nomeCliente!, estrelas: newDep.estrelas ?? 5, texto: newDep.texto, criadoEm: nowISO() });
    setShowDep(false); setNewDep({ estrelas: 5 }); load();
  }

  if (!empresa) return <View style={{ flex: 1, backgroundColor: cores.background }} />;

  return (
    <View style={styles.container}>
      <GradientHeader title="Meu Negócio" subtitle="Aparece no cabeçalho dos seus PDFs" onBack={() => goBackOrHome(nav)} />

      <ScrollView
        contentContainerStyle={{
          paddingTop: Spacing.base,
          paddingHorizontal: Spacing.base,
          // 80 de folga pro último card não ficar atrás da saveBar fixa
          // (mesmo motivo do FAB: barra flutuante sobrepõe o fim do scroll).
          paddingBottom: Spacing.base + insets.bottom + 80,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* CONTA E BACKUP */}
        <TouchableOpacity style={styles.backupCard} onPress={() => nav.navigate('Tabs', { screen: 'Conta' })} activeOpacity={0.85}>
          <View style={styles.backupIcon}>
            <MaterialCommunityIcons name="cloud-lock-outline" size={26} color="#fff" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.backupTitle}>Conta e Backup na nuvem</Text>
            <Text style={styles.backupSubtitle}>Proteja seus dados contra perda do celular</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color={cores.primary} />
        </TouchableOpacity>

        {/* LOGO + ASSINATURA */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Identidade visual</Text>
          <View style={styles.brandRow}>
            <View style={styles.brandItem}>
              <TouchableOpacity style={styles.imageBox} onPress={() => pickImage('logoUri')} disabled={!!imagemProcessando} activeOpacity={0.8}>
                {imagemProcessando === 'logoUri' ? <ActivityIndicator color={cores.primary} /> : empresa.logoUri ? <Image source={{ uri: empresa.logoUri }} style={styles.imageFull} resizeMode="contain" /> : (
                  <><MaterialCommunityIcons name="image-plus" size={28} color={cores.primary} /><Text style={styles.imageHint}>Logo</Text></>
                )}
              </TouchableOpacity>
              <Text style={styles.brandLabel}>Logotipo</Text>
            </View>
            <View style={styles.brandItem}>
              <TouchableOpacity style={styles.imageBox} onPress={() => pickImage('assinaturaUri')} disabled={!!imagemProcessando} activeOpacity={0.8}>
                {imagemProcessando === 'assinaturaUri' ? <ActivityIndicator color={cores.primary} /> : empresa.assinaturaUri ? <Image source={{ uri: empresa.assinaturaUri }} style={styles.imageFull} resizeMode="contain" /> : (
                  <><MaterialCommunityIcons name="draw" size={28} color={cores.primary} /><Text style={styles.imageHint}>Assinatura</Text></>
                )}
              </TouchableOpacity>
              <Text style={styles.brandLabel}>Assinatura</Text>
            </View>
          </View>

          {/* COR DA MARCA — sugestões automáticas da logo + paleta OLLI */}
          <Text style={[styles.segLabel, { marginTop: Spacing.base }]}>Cor da marca</Text>

          {extraindo ? (
            <View style={[styles.colorRow, { marginBottom: 4 }]}>
              <OlliSkeleton width={34} height={34} radius={17} />
              <OlliSkeleton width={34} height={34} radius={17} />
              <OlliSkeleton width={34} height={34} radius={17} />
            </View>
          ) : coresSugeridas.length > 0 ? (
            <>
              <Text style={styles.segHint}>Da sua logo</Text>
              <View style={[styles.colorRow, { marginBottom: Spacing.sm }]}>
                {coresSugeridas.map(hex => {
                  const active = (empresa.corMarca ?? '').toLowerCase() === hex.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={hex}
                      style={styles.swatchCircleWrap}
                      onPress={() => chooseCorMarca(hex)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={`Usar cor sugerida ${hex}`}
                    >
                      <View style={[styles.swatchCircle, { width: 34, height: 34, borderRadius: 17, backgroundColor: hex }]}>
                        {active && (
                          <MaterialCommunityIcons name="check-bold" size={16} color={contrasteTextoSobre(hex)} />
                        )}
                      </View>
                      <MaterialCommunityIcons
                        name="auto-fix"
                        size={12}
                        color={cores.onSurfaceMuted}
                        style={styles.autoFixBadge}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : null}

          <Text style={styles.segHint}>Paleta OLLI</Text>
          <View style={styles.colorRow}>
            {CORES_MARCA.map(swatch => {
              const active = (empresa.corMarca ?? '').toLowerCase() === swatch.value.toLowerCase();
              return (
                <TouchableOpacity
                  key={swatch.value}
                  style={styles.swatchCircleWrap}
                  onPress={() => chooseCorMarca(swatch.value)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`Cor ${swatch.label}`}
                >
                  <View style={[styles.swatchCircle, { width: 28, height: 28, borderRadius: 14, backgroundColor: swatch.value }]}>
                    {active && (
                      <MaterialCommunityIcons name="check-bold" size={14} color={contrasteTextoSobre(swatch.value)} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.segHint, { marginBottom: 0, marginTop: 6 }]}>
            Essa cor vira o padrão dos seus documentos novos. O orçamento guarda a identidade usada para não mudar depois de enviado.
          </Text>
        </View>

        {/* DADOS */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dados da empresa</Text>
          <Text style={styles.segLabel}>Como você trabalha? *</Text>
          <Text style={styles.segHint}>Isso define se o CNPJ é necessário.</Text>
          <View style={styles.segRow} accessibilityRole="radiogroup">
            {([
              { id: 'autonomo' as const, label: 'Autônomo / pessoa física', icon: 'account-hard-hat' },
              { id: 'empresa' as const, label: 'Empresa com CNPJ', icon: 'domain' },
            ]).map(opcao => {
              const active = empresa.tipoNegocio === opcao.id;
              return (
                <TouchableOpacity
                  key={opcao.id}
                  style={[styles.segChip, active && styles.segChipActive]}
                  onPress={() => set('tipoNegocio', opcao.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  activeOpacity={0.85}
                >
                  <MaterialCommunityIcons name={opcao.icon as any} size={16} color={active ? textoSobreAccent : cores.onSurfaceVariant} />
                  <Text style={[styles.segChipText, active && styles.segChipTextActive]}>{opcao.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <OlliInput label="Nome da empresa" required value={empresa.nome} onChangeText={v => set('nome', v)} leftIcon="store" />

          <Text style={styles.segLabel}>Segmento do negócio</Text>
          <Text style={styles.segHint}>O OLLI atende qualquer prestador. O segmento ajusta exemplos e a base técnica.</Text>
          <View style={styles.segRow}>
            {SEGMENTOS.map(s => {
              const active = empresa.segmento === s.id;
              return (
                <TouchableOpacity key={s.id} style={[styles.segChip, active && styles.segChipActive]} onPress={() => chooseSegmento(s.id)} activeOpacity={0.85}>
                  <MaterialCommunityIcons name={s.icon as any} size={16} color={active ? textoSobreAccent : cores.onSurfaceVariant} />
                  <Text style={[styles.segChipText, active && styles.segChipTextActive]}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.aiBrandCard}
            onPress={() => { setMarcaIaErro(null); setSugestaoMarca(null); setShowMarcaIA(true); }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Criar especialidade e slogan com a OLLI"
          >
            <View style={styles.aiBrandIcon}>
              <MaterialCommunityIcons name="creation" size={22} color={textoSobreAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.aiBrandTitle}>Criar com a OLLI</Text>
              <Text style={styles.aiBrandHint}>Descreva o posicionamento e receba especialidade e slogan para revisar.</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={cores.accentLight} />
          </TouchableOpacity>

          <OlliInput label="Especialidade" required value={empresa.especialidade} onChangeText={v => set('especialidade', v)} placeholder="Ex: Assistência técnica de ar condicionado" />
          <OlliInput label="Slogan" value={empresa.slogan} onChangeText={v => set('slogan', v)} placeholder="Frase da sua marca" />
          <OlliInput label="Nome do prestador" required value={empresa.nomePrestador} onChangeText={v => set('nomePrestador', v)} leftIcon="account" />
          <View style={styles.rowFields}>
            <OlliInput label="CNPJ" required={empresa.tipoNegocio === 'empresa'} mask="cnpj" value={empresa.cnpj} onChangeText={v => set('cnpj', v)} containerStyle={{ flex: 1, marginRight: 10 }} />
            <OlliInput label="CPF" mask="cpf" value={empresa.cpf} onChangeText={v => set('cpf', v)} containerStyle={{ flex: 1 }} />
          </View>
          <OlliButton
            label={cnpjLoading ? 'Buscando dados…' : 'Preencher dados pelo CNPJ'}
            variant="outline"
            size="sm"
            fullWidth
            loading={cnpjLoading}
            disabled={cnpjLoading}
            onPress={buscarCnpj}
            icon={<MaterialCommunityIcons name="office-building" size={18} color={cores.accentLight} />}
            style={{ marginTop: -4, marginBottom: cnpjInfo ? 6 : Spacing.base }}
          />
          {cnpjInfo ? <Text style={styles.lookupInfo}>{cnpjInfo}</Text> : null}
          <OlliInput label="Endereço" value={empresa.endereco} onChangeText={v => set('endereco', v)} leftIcon="map-marker" />
          <View style={styles.rowFields}>
            <OlliInput label="Cidade" required value={empresa.cidade} onChangeText={v => set('cidade', v)} containerStyle={{ flex: 2, marginRight: 10 }} />
            <OlliInput label="UF" required value={empresa.estado} onChangeText={v => set('estado', v.toUpperCase().slice(0, 2))} autoCapitalize="characters" maxLength={2} containerStyle={{ flex: 1 }} />
          </View>
          <OlliInput label="Telefone" required mask="phone" value={empresa.telefone} onChangeText={v => set('telefone', v)} leftIcon="phone" />
          <OlliInput label="WhatsApp (só números)" mask="phone" value={empresa.whatsapp} onChangeText={v => set('whatsapp', v.replace(/\D/g, ''))} leftIcon="whatsapp" />
          <OlliInput label="Site" value={empresa.site} onChangeText={v => set('site', v)} placeholder="www.suaempresa.com.br" leftIcon="web" autoCapitalize="none" />
          <OlliInput
            label="Link do Google (avaliações)"
            value={empresa.linkGoogleAvaliacoes ?? ''}
            onChangeText={v => set('linkGoogleAvaliacoes', v)}
            placeholder="Link 'Escrever avaliação' do seu perfil no Google"
            helper="Cole aqui pra liberar o botão 'Pedir avaliação' no recibo, depois do serviço."
            leftIcon="google-maps"
            autoCapitalize="none"
            keyboardType="url"
          />
          <OlliInput label="E-mail" value={empresa.email} onChangeText={v => set('email', v)} keyboardType="email-address" autoCapitalize="none" leftIcon="email" />
          <OlliInput
            label="Chave Pix (somente recibos)"
            value={empresa.chavePix}
            onChangeText={v => set('chavePix', v)}
            helper="Não aparece em orçamentos. O cliente combina e paga diretamente à sua empresa."
            leftIcon="key-variant"
          />
          <OlliInput label="Normas técnicas" value={empresa.normas} onChangeText={v => set('normas', v)} multiline containerStyle={{ marginBottom: 0 }} />
        </View>

        {/* PERSONALIZAÇÃO — padrões aplicados a todo orçamento novo */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personalização</Text>
          <Text style={styles.segHint}>
            Esses padrões pré-preenchem todo orçamento novo. Modelo, cor e logo ficam centralizados em “Modelos de documento”.
          </Text>

          <Text style={styles.segLabel}>Validade padrão do orçamento</Text>
          <View style={styles.validadeRow}>
            {VALIDADES_PADRAO.map(dias => {
              const active = (empresa.validadeDiasPadrao ?? 15) === dias;
              return (
                <TouchableOpacity key={dias} style={[styles.validadeChip, active && styles.validadeChipActive]} onPress={() => chooseValidadeDias(dias)} activeOpacity={0.85}>
                  <Text style={[styles.validadeText, active && styles.validadeTextActive]}>{dias} dias</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.segLabel, { marginTop: Spacing.base }]}>Garantia padrão</Text>
          <Text style={styles.segHint}>Sugestões com base no art. 26 do Código de Defesa do Consumidor.</Text>
          <View style={styles.validadeRow}>
            {GARANTIAS_PADRAO.map(g => {
              const active = empresa.garantiaPadrao === g.texto;
              return (
                <TouchableOpacity key={g.dias} style={[styles.validadeChip, active && styles.validadeChipActive]} onPress={() => chooseGarantiaSugerida(g.texto)} activeOpacity={0.85}>
                  <Text style={[styles.validadeText, active && styles.validadeTextActive]}>{g.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <OlliInput
            label="Texto da garantia"
            value={empresa.garantiaPadrao ?? ''}
            onChangeText={v => set('garantiaPadrao', v)}
            placeholder="Ex: 90 dias para mão de obra, conforme CDC art. 26"
            multiline
            containerStyle={{ marginTop: 10 }}
          />

          <OlliInput
            label="Condições comerciais padrão"
            value={empresa.condicoesPagamentoPadrao ?? ''}
            onChangeText={v => set('condicoesPagamentoPadrao', v)}
            placeholder="Ex: 50% de entrada, restante na entrega"
            multiline
          />

          <OlliInput
            label="Observações padrão"
            value={empresa.observacoesPadrao ?? ''}
            onChangeText={v => set('observacoesPadrao', v)}
            placeholder="Texto que aparece em todo orçamento, ex: horário de atendimento"
            multiline
            containerStyle={{ marginBottom: 0 }}
          />
        </View>

        {/* DEPOIMENTOS */}
        <View style={styles.card}>
          <View style={styles.depHeader}>
            <Text style={styles.cardTitle}>Depoimentos</Text>
            <TouchableOpacity style={styles.addDep} onPress={() => setShowDep(true)}>
              <MaterialCommunityIcons name="plus" size={16} color={cores.primary} />
              <Text style={styles.addDepText}>Adicionar</Text>
            </TouchableOpacity>
          </View>
          {depoimentos.length === 0 ? (
            <Text style={styles.depEmpty}>Nenhum depoimento. Eles aparecem no rodapé do PDF.</Text>
          ) : depoimentos.map(d => (
            <View key={d.id} style={styles.depItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.depName}>{d.nomeCliente}</Text>
                <Text style={styles.depStars}>{'★'.repeat(d.estrelas)}{'☆'.repeat(5 - d.estrelas)}</Text>
                {d.texto ? <Text style={styles.depText}>{d.texto}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => Alert.alert('Excluir', `Excluir depoimento de "${d.nomeCliente}"?`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Excluir', style: 'destructive', onPress: async () => { await deleteDepoimento(d.id); load(); } }])} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={`Excluir depoimento de ${d.nomeCliente}`}>
                <MaterialCommunityIcons name="trash-can-outline" size={20} color={cores.danger} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* SAVE BAR */}
      {dirty && (
        <View style={[styles.saveBar, { paddingBottom: insets.bottom + 16 }]}>
          <OlliButton
            label="Salvar alterações"
            variant="gradient"
            size="lg"
            fullWidth
            loading={salvando}
            disabled={salvando || !!imagemProcessando}
            onPress={handleSave}
            icon={<MaterialCommunityIcons name="content-save" size={20} color="#fff" />}
          />
        </View>
      )}

      {/* ASSISTENTE DE MARCA — a IA apenas propõe. Nada entra no cadastro até o
          usuário revisar, aplicar ao rascunho e tocar em Salvar alterações. */}
      <Modal visible={showMarcaIA} animationType="slide" onRequestClose={() => setShowMarcaIA(false)}>
        <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.modalTitle}>Criar com a OLLI</Text>
              <Text style={styles.modalSubtitle}>Especialidade e slogan para a sua marca</Text>
            </View>
            <TouchableOpacity onPress={() => setShowMarcaIA(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Fechar assistente de marca">
              <MaterialCommunityIcons name="close" size={26} color={cores.onSurface} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: insets.bottom + Spacing.xl }} keyboardShouldPersistTaps="handled">
            <View style={styles.aiIntro}>
              <MaterialCommunityIcons name="shield-check-outline" size={20} color={cores.accentLight} />
              <Text style={styles.aiIntroText}>A OLLI não recebe seu CNPJ, CPF ou contatos nesta tarefa. Ela usa somente nome, segmento e o texto que você escrever abaixo.</Text>
            </View>
            <OlliInput
              label="Como você quer posicionar a empresa?"
              value={pedidoMarca}
              onChangeText={v => { setPedidoMarca(v); setMarcaIaErro(null); setSugestaoMarca(null); }}
              placeholder="Ex: Quero transmitir confiança e rapidez para famílias e pequenos comércios, sem parecer uma empresa cara."
              multiline
              maxLength={700}
              helper="Não inclua dados pessoais, senhas ou informações de clientes."
            />
            <OlliButton
              label="Gerar sugestões"
              variant="gradient"
              size="lg"
              fullWidth
              loading={marcaIaLoading}
              disabled={marcaIaLoading || !pedidoMarca.trim()}
              onPress={gerarSugestaoMarca}
              icon={<MaterialCommunityIcons name="creation" size={20} color="#fff" />}
            />

            {marcaIaErro ? (
              <View style={styles.aiErrorCard}>
                <MaterialCommunityIcons name="alert-circle-outline" size={20} color={cores.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.aiErrorTitle}>Não consegui gerar agora</Text>
                  <Text style={styles.aiErrorText}>{marcaIaErro}</Text>
                </View>
              </View>
            ) : null}

            {sugestaoMarca ? (
              <View style={styles.aiSuggestionCard}>
                <View style={styles.aiSuggestionHeader}>
                  <MaterialCommunityIcons name="check-decagram-outline" size={22} color={cores.success} />
                  <Text style={styles.aiSuggestionTitle}>Sugestão pronta para revisar</Text>
                </View>
                <Text style={styles.aiSuggestionLabel}>Especialidade</Text>
                <Text style={styles.aiSuggestionValue}>{sugestaoMarca.especialidade}</Text>
                <Text style={styles.aiSuggestionLabel}>Slogan</Text>
                <Text style={styles.aiSuggestionValue}>{sugestaoMarca.slogan}</Text>
                {sugestaoMarca.explicacao ? <Text style={styles.aiSuggestionExplanation}>{sugestaoMarca.explicacao}</Text> : null}
                <OlliButton
                  label="Usar estas sugestões"
                  variant="success"
                  fullWidth
                  onPress={aplicarSugestaoMarca}
                  icon={<MaterialCommunityIcons name="check" size={18} color="#fff" />}
                  style={{ marginTop: Spacing.base }}
                />
              </View>
            ) : null}

            <OlliButton
              label="Abrir o chat completo da OLLI"
              variant="ghost"
              fullWidth
              onPress={() => { setShowMarcaIA(false); nav.navigate('OlliChat'); }}
              icon={<MaterialCommunityIcons name="chat-processing-outline" size={18} color={cores.onSurfaceVariant} />}
              style={{ marginTop: Spacing.sm }}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL DEPOIMENTO */}
      <Modal visible={showDep} animationType="slide" onRequestClose={() => setShowDep(false)}>
        <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Novo Depoimento</Text>
            <TouchableOpacity onPress={() => { setShowDep(false); setNewDep({ estrelas: 5 }); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Fechar">
              <MaterialCommunityIcons name="close" size={26} color={cores.onSurface} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: Spacing.base }} keyboardShouldPersistTaps="handled">
            <OlliInput label="Nome do cliente" required value={newDep.nomeCliente ?? ''} onChangeText={v => setNewDep(p => ({ ...p, nomeCliente: v }))} placeholder="Nome completo" leftIcon="account" />
            <Text style={styles.starLabel}>Avaliação</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map(n => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setNewDep(p => ({ ...p, estrelas: n }))}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel={`${n} de 5 estrelas`}
                >
                  <Text style={[styles.star, { color: n <= (newDep.estrelas ?? 5) ? '#F59E0B' : '#E5E7EB' }]}>★</Text>
                </TouchableOpacity>
              ))}
            </View>
            <OlliInput label="Depoimento (opcional)" value={newDep.texto ?? ''} onChangeText={v => setNewDep(p => ({ ...p, texto: v }))} placeholder="O que o cliente falou..." multiline />
          </ScrollView>
          <View style={[styles.modalFooter, { paddingBottom: insets.bottom + Spacing.base }]}>
            <OlliButton label="Salvar depoimento" variant="gradient" size="lg" fullWidth onPress={handleSaveDep} disabled={!newDep.nomeCliente?.trim()} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  backupCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.primaryContainer, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.base, borderWidth: 1, borderColor: c.primary + '40' },
  backupIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.primary, justifyContent: 'center', alignItems: 'center' },
  backupTitle: { fontSize: 15, fontWeight: '800', color: c.primaryContainerText },
  backupSubtitle: { fontSize: 12, color: c.primary, marginTop: 2 },
  card: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.base, ...sombrasDe(c).sm },
  cardTitle: { fontSize: 16, fontWeight: '800', color: c.onSurface, marginBottom: Spacing.base },
  brandRow: { flexDirection: 'row', gap: 16 },
  brandItem: { alignItems: 'center' },
  imageBox: { width: 120, height: 90, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: c.primary, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', backgroundColor: c.primaryContainer + '40' },
  imageFull: { width: '100%', height: '100%' },
  imageHint: { fontSize: 11, color: c.primary, fontWeight: '600', marginTop: 2 },
  brandLabel: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 6, fontWeight: '600' },
  rowFields: { flexDirection: 'row' },
  segLabel: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant, marginBottom: 2 },
  segHint: { fontSize: 11.5, color: c.onSurfaceMuted, marginBottom: 10 },
  segRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.base },
  segChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: c.outline, backgroundColor: c.surfaceVariant },
  segChipActive: { backgroundColor: c.accentLight, borderColor: c.accentLight },
  segChipText: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant },
  // Era '#0A1626' fixo — vira o ink de contraste calculado sobre accentLight
  // (ver `textoSobreAccent` no componente), correto pra qualquer cor de marca.
  segChipTextActive: { color: textoSobre(c.accentLight) },
  aiBrandCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.accentContainer, borderWidth: 1, borderColor: c.accentLight + '55', borderRadius: BorderRadius.lg, padding: 13, marginBottom: Spacing.base },
  aiBrandIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentLight },
  aiBrandTitle: { fontSize: 14, fontWeight: '800', color: c.onSurface },
  aiBrandHint: { fontSize: 11.5, lineHeight: 16, color: c.onSurfaceVariant, marginTop: 2 },
  lookupInfo: { fontSize: 12, lineHeight: 17, color: c.onSurfaceVariant, backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.sm, padding: 10, marginBottom: Spacing.base },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: Spacing.sm },
  swatchCircleWrap: { alignItems: 'center', justifyContent: 'center' },
  // Halo decorativo sobre o círculo de cor (que é ele mesmo arbitrário/qualquer
  // matiz) — não é hairline de superfície do app, mantido fixo nos dois modos.
  swatchCircle: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)', ...sombrasDe(c).sm },
  autoFixBadge: { position: 'absolute', right: -2, bottom: -2, backgroundColor: c.surface, borderRadius: 8, padding: 1 },
  validadeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  validadeChip: { alignItems: 'center', borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface, borderRadius: BorderRadius.full, paddingHorizontal: 14, paddingVertical: 10 },
  validadeChipActive: { backgroundColor: c.accentLight, borderColor: c.accentLight },
  validadeText: { fontSize: 13, fontWeight: '800', color: c.onSurfaceVariant },
  validadeTextActive: { color: textoSobre(c.accentLight) },
  depHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  addDep: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  addDepText: { color: c.primary, fontWeight: '700', fontSize: 13 },
  depEmpty: { fontSize: 13, color: c.onSurfaceMuted },
  depItem: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.outline },
  depName: { fontSize: 14, fontWeight: '700', color: c.onSurface },
  // Ouro fixo de avaliação (★) — convenção universal de "estrela", não segue tema.
  depStars: { fontSize: 15, color: '#F59E0B', marginTop: 2 },
  depText: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 4 },
  saveBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: Spacing.base, paddingBottom: 26, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline, ...sombrasDe(c).lg },
  modal: { flex: 1, backgroundColor: c.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.base, paddingTop: 56, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.outline },
  modalTitle: { fontSize: 20, fontWeight: '800', color: c.onSurface },
  modalSubtitle: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
  modalFooter: { padding: Spacing.base, paddingBottom: 28, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
  aiIntro: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: BorderRadius.md, backgroundColor: c.accentContainer, borderWidth: 1, borderColor: c.accentLight + '44', padding: 12, marginBottom: Spacing.base },
  aiIntroText: { flex: 1, fontSize: 12, lineHeight: 17, color: c.onSurfaceVariant },
  aiErrorCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: BorderRadius.md, backgroundColor: c.warningLight, borderWidth: 1, borderColor: c.warning, padding: 12, marginTop: Spacing.base },
  aiErrorTitle: { fontSize: 13, fontWeight: '800', color: c.onSurface },
  aiErrorText: { fontSize: 12, lineHeight: 17, color: c.onSurfaceVariant, marginTop: 2 },
  aiSuggestionCard: { borderRadius: BorderRadius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.success + '66', padding: Spacing.base, marginTop: Spacing.base, ...sombrasDe(c).sm },
  aiSuggestionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.base },
  aiSuggestionTitle: { fontSize: 14, fontWeight: '800', color: c.onSurface },
  aiSuggestionLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, color: c.onSurfaceMuted, marginTop: 8 },
  aiSuggestionValue: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: c.onSurface, marginTop: 3 },
  aiSuggestionExplanation: { fontSize: 12, lineHeight: 17, color: c.onSurfaceVariant, marginTop: Spacing.base },
  starLabel: { fontSize: 13, fontWeight: '600', color: c.onSurfaceVariant, marginBottom: 8 },
  starsRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.base },
  star: { fontSize: 34 },
});
