import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Spacing, BorderRadius, useCores, useGradientes, useEstilos, sombrasDe, comAlfa, textoSobre, sobreSecundario, type Cores } from '../theme';
import { OlliButton } from '../components/OlliButton';
import { OlliInput, OlliMoneyInput } from '../components/OlliInput';
import { OlliMascot } from '../components/OlliMascot';
import { AuroraBackground } from '../components/AuroraBackground';
import { StepIndicator } from '../components/StepIndicator';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { saveEmpresa, saveServico } from '../database/database';
import { Empresa, ServicoItem, Segmento, SEGMENTOS } from '../types';
import { generateId } from '../utils/id';
import { nowISO } from '../utils/date';
import { isValidCPF } from '../utils/masks';
import { buscarCep } from '../services/cep';
import { consultarCnpj } from '../services/cnpj';
import { deduzirVerticais, verticalPorId, ferramentasSugeridas, type VerticalId } from '../services/verticais';
import { VERTICAL_PARA_SEGMENTO } from '../services/verticalSegmento';
import { getCurrentUser } from '../services/supabase';
import { track, Eventos } from '../services/analytics';
import { ONBOARDED_KEY, marcarVisto } from '../services/onboarding';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

/** Reexportada por compat: EntrarScreen ainda importa daqui. Fonte real: services/onboarding.ts. */
export { ONBOARDED_KEY };

/** Empresa em branco (mesma base de MeuNegocioScreen) para o 1º cadastro. */
function empresaEmBranco(): Empresa {
  return {
    id: 'empresa_1',
    nome: '', especialidade: '', slogan: '', cnpj: '', cpf: '',
    endereco: '', cidade: '', estado: '', telefone: '', whatsapp: '',
    site: '', email: '', chavePix: '', normas: '', nomePrestador: '',
  };
}

/**
 * Partes do endereço coletadas separadamente para um cadastro completo. O tipo
 * Empresa guarda só `endereco` (string), `cidade` e `estado`, então as partes de
 * logradouro são compostas numa única string ao concluir (ver `montarEndereco`).
 * `cep` não é persistido no tipo — serve à busca automática (ViaCEP).
 */
interface EnderecoForm {
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
}

/**
 * Compõe a string de `endereco` (logradouro) a partir das partes. Ex.:
 * "Rua das Flores, 120 — Apto 2 (Centro)". Cidade/UF vão em campos próprios.
 */
function montarEndereco(e: EnderecoForm): string {
  const ruaNum = [e.rua.trim(), e.numero.trim()].filter(Boolean).join(', ');
  const partes: string[] = [];
  if (ruaNum) partes.push(ruaNum);
  if (e.complemento.trim()) partes.push(`— ${e.complemento.trim()}`);
  if (e.bairro.trim()) partes.push(`(${e.bairro.trim()})`);
  return partes.join(' ').trim();
}

// Etapas do cadastro completo. Rótulos curtos para o StepIndicator.
const STEPS = ['Empresa', 'Você', 'Endereço', 'PIX', 'Visual', 'Serviço'];
const ULTIMO = STEPS.length - 1;

type Errors = Partial<Record<string, string>>;

// VERTICAL_PARA_SEGMENTO vive em services/verticalSegmento.ts (compartilhado com MeuNegócio).

export default function OnboardingScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const cores = useCores();
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);
  // Ink de contraste sobre `accentLight` (chip ativo) — substitui '#0A1626' fixo.
  const textoSobreAccent = textoSobre(cores.accentLight);

  const [welcomed, setWelcomed] = useState(false);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const scrollRef = useRef<ScrollView>(null);

  // dados da empresa (acumulados ao longo das etapas)
  const [emp, setEmp] = useState<Empresa>(empresaEmBranco());
  // Pre-preenche o WhatsApp com o telefone informado no cadastro (user_metadata)
  // — o usuario nao precisa digitar duas vezes. Best-effort, nunca bloqueia.
  React.useEffect(() => {
    (async () => {
      try {
        const u = await getCurrentUser();
        const tel = (u?.user_metadata as { telefone?: string } | undefined)?.telefone ?? '';
        if (tel) setEmp(p2 => (p2.whatsapp?.trim() ? p2 : { ...p2, whatsapp: tel, telefone: p2.telefone || tel }));
      } catch { /* sem sessao/erro: segue vazio */ }
    })();
  }, []);
  // partes do endereço (compostas em emp.endereco ao concluir)
  const [end, setEnd] = useState<EnderecoForm>({ cep: '', rua: '', numero: '', complemento: '', bairro: '' });
  const [cepLoading, setCepLoading] = useState(false);
  const [cepInfo, setCepInfo] = useState<string | null>(null);
  // CNPJ: cadastro mágico (autofill + dedução da vertical).
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjInfo, setCnpjInfo] = useState<string | null>(null);
  // último serviço (opcional)
  const [servNome, setServNome] = useState('');
  const [servPreco, setServPreco] = useState(0);

  const setField = useCallback((field: keyof Empresa, value: string) => {
    setEmp(p => ({ ...p, [field]: value }));
  }, []);

  const clearError = useCallback((key: string) => {
    setErrors(p => (p[key] ? { ...p, [key]: undefined } : p));
  }, []);

  function chooseSegmento(id: Segmento) {
    Haptics.selectionAsync().catch(() => {});
    setEmp(p => ({ ...p, segmento: id }));
  }

  // ─── CEP: busca automática ao completar 8 dígitos ──────────────
  function onCepChange(masked: string) {
    setEnd(p => ({ ...p, cep: masked }));
    setCepInfo(null);
    const digits = masked.replace(/\D/g, '');
    if (digits.length === 8) void lookupCep(digits);
  }

  async function lookupCep(digits: string) {
    setCepLoading(true);
    setCepInfo(null);
    try {
      const r = await buscarCep(digits);
      if (r) {
        // preenche e mantém editável; só sobrescreve cidade/UF e a rua/bairro
        setEnd(p => ({
          ...p,
          rua: r.logradouro || p.rua,
          bairro: r.bairro || p.bairro,
        }));
        setEmp(p => ({
          ...p,
          cidade: r.cidade || p.cidade,
          estado: r.uf || p.estado,
        }));
        setCepInfo('Endereço encontrado — confira e complete o número.');
        Haptics.selectionAsync().catch(() => {});
      } else {
        setCepInfo('Não achei esse CEP. Pode preencher manualmente.');
      }
    } catch {
      setCepInfo('Não consegui buscar agora. Preencha manualmente.');
    } finally {
      setCepLoading(false);
    }
  }

  // ─── CNPJ: cadastro mágico (F1 da estratégia) ──────────────────
  // Preenche a empresa pela BrasilAPI (via worker) e DEDUZ a vertical pelo CNAE,
  // pré-selecionando o segmento. Só preenche campo VAZIO (nunca sobrescreve o que
  // o usuário já digitou). Nunca lança; cada estado do serviço vira um aviso.
  async function buscarCnpj() {
    const digits = emp.cnpj.replace(/\D/g, '');
    if (digits.length !== 14) {
      setErrors(p => ({ ...p, cnpj: 'Informe o CNPJ com 14 dígitos para buscar.' }));
      return;
    }
    setCnpjLoading(true);
    setCnpjInfo(null);
    clearError('cnpj');
    const r = await consultarCnpj(digits);
    if (r.estado === 'ok') {
      const e = r.empresa;
      const verticais = deduzirVerticais(e.cnaePrincipal.codigo, e.cnaesSecundarios.map(c => c.codigo));
      const principal = verticais[0];
      const nomeEmpresa = e.nomeFantasia || e.razaoSocial;
      setEmp(p => ({
        ...p,
        nome: p.nome.trim() || nomeEmpresa,
        segmento: p.segmento ?? VERTICAL_PARA_SEGMENTO[principal] ?? 'outro',
        // Persiste a vertical deduzida (F1 do SISTEMA_SUPERIOR): vira o "ofício" da
        // empresa (editável depois), e alimenta o gate de ferramentas por segmento.
        verticais: (p.verticais && p.verticais.length) ? p.verticais : verticais,
        ferramentasAtivas: (p.ferramentasAtivas && p.ferramentasAtivas.length) ? p.ferramentasAtivas : ferramentasSugeridas(verticais),
        cidade: p.cidade.trim() || e.municipio,
        estado: p.estado.trim() || e.uf,
      }));
      setEnd(p => ({
        ...p,
        rua: p.rua.trim() || e.logradouro,
        bairro: p.bairro.trim() || e.bairro,
      }));
      setCnpjInfo(
        principal === 'geral'
          ? `Achei ${nomeEmpresa}. Confira os dados abaixo.`
          : `Achei ${nomeEmpresa} — detectei ${verticalPorId(principal).label}. Confira e ajuste se precisar.`,
      );
      Haptics.selectionAsync().catch(() => {});
    } else if (r.estado === 'nao_encontrado') {
      setCnpjInfo('Não achei esse CNPJ. Confira o número ou preencha na mão.');
    } else if (r.estado === 'invalido') {
      setCnpjInfo('O CNPJ precisa ter 14 dígitos.');
    } else {
      setCnpjInfo('Não consegui buscar agora — você pode preencher na mão.');
    }
    setCnpjLoading(false);
  }

  // marca como concluído (idempotente) — usado tanto no "pular" quanto no "concluir"
  async function marcarConcluido() {
    await marcarVisto();
  }

  /**
   * Sai do onboarding. `comPrimeiroOrcamento` manda o usuário direto para o wizard.
   *
   * POR QUE (prioridade 11 do plano): a meta declarada é "onboarding mágico terminando
   * em 1º ORÇAMENTO ENVIADO", com 5 minutos até o primeiro — e a ativação do produto é
   * definida como "orçamento real enviado em até 7 dias". Terminar o cadastro e largar
   * a pessoa na home das abas deixa justamente o passo que ATIVA por conta dela: ela
   * acabou de dizer o nome do negócio, o PIX e até um serviço, e a recompensa disso é
   * uma tela de menu. O caminho mais curto entre "configurei" e "vi valor" é o
   * orçamento — então é nele que o onboarding desemboca.
   *
   * `index: 1` com Tabs ABAIXO, e não um reset só para o wizard: o botão voltar leva
   * para o app normal. É um convite, não um sequestro — quem não quiser orçar agora
   * volta com um toque, e o onboarding continua irretornável (o que era o ponto do
   * reset original).
   */
  function irParaApp(comPrimeiroOrcamento = false) {
    nav.dispatch(
      CommonActions.reset(
        comPrimeiroOrcamento
          ? { index: 1, routes: [{ name: 'Tabs' }, { name: 'NovoOrcamento' }] }
          : { index: 0, routes: [{ name: 'Tabs' }] },
      ),
    );
  }

  /** Monta o objeto Empresa COMPLETO (sem undefined em obrigatórios). */
  function montarEmpresa(): Empresa {
    const segLabel = SEGMENTOS.find(s => s.id === emp.segmento)?.label;
    return {
      ...emp,
      nome: emp.nome.trim(),
      nomePrestador: emp.nomePrestador.trim() || emp.nome.trim(),
      especialidade: emp.especialidade.trim() || segLabel || '',
      slogan: emp.slogan.trim(),
      endereco: montarEndereco(end),
      cidade: emp.cidade.trim(),
      estado: emp.estado.trim().toUpperCase().slice(0, 2),
      telefone: emp.telefone.trim() || emp.whatsapp.replace(/\D/g, ''),
      whatsapp: emp.whatsapp.replace(/\D/g, ''),
      chavePix: emp.chavePix.trim(),
    };
  }

  async function salvarTudo() {
    await saveEmpresa(montarEmpresa());
    track(Eventos.empresaSaved, { origem: 'onboarding', segmento: emp.segmento });
    if (servNome.trim()) {
      const s: ServicoItem = {
        id: generateId(),
        nome: servNome.trim(),
        preco: servPreco,
        unidade: 'un',
        criadoEm: nowISO(),
      };
      await saveServico(s);
      track(Eventos.servicoCreated, { origem: 'onboarding' });
    }
  }

  // "Pular": grava o que já foi preenchido, marca o flag e abre o app.
  async function pular() {
    Haptics.selectionAsync().catch(() => {});
    track(Eventos.onboardingSkipped, { step });
    try { await salvarTudo(); } catch { /* best-effort: pular nunca trava */ }
    await marcarConcluido();
    irParaApp();
  }

  /** Valida a etapa atual; preenche `errors` e retorna se pode avançar. */
  function validarEtapa(): boolean {
    const e: Errors = {};
    if (step === 0) {
      if (!emp.nome.trim()) e.nome = 'Conte o nome do seu negócio.';
      // CNPJ ou CPF: opcionais, mas se preenchidos precisam ser válidos.
      const cnpjDigits = emp.cnpj.replace(/\D/g, '');
      const cpfDigits = emp.cpf.replace(/\D/g, '');
      if (cnpjDigits.length > 0 && cnpjDigits.length !== 14) e.cnpj = 'CNPJ deve ter 14 dígitos.';
      if (cpfDigits.length > 0 && !isValidCPF(cpfDigits)) e.cpf = 'CPF inválido.';
    } else if (step === 1) {
      if (!emp.nomePrestador.trim()) e.nomePrestador = 'Diga seu nome.';
      const tel = emp.whatsapp.replace(/\D/g, '');
      if (tel.length !== 11) e.whatsapp = 'Informe um WhatsApp com DDD + 9 dígitos (ex: 11 99999-9999).';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function avancar() {
    if (!validarEtapa()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    setErrors({});
    setStep(s => Math.min(s + 1, ULTIMO));
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function voltar() {
    Haptics.selectionAsync().catch(() => {});
    setErrors({});
    setStep(s => Math.max(s - 1, 0));
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  async function concluir() {
    // revalida tudo o que é obrigatório antes de gravar (segurança extra)
    if (!emp.nome.trim()) { setStep(0); setErrors({ nome: 'Conte o nome do seu negócio.' }); return; }
    setSaving(true);
    try {
      await salvarTudo();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      track(Eventos.onboardingCompleted, { comServico: !!servNome.trim() });
      await marcarConcluido();
      // Concluiu = quer usar: cai no wizard do primeiro orçamento (ver irParaApp).
      // Quem PULOU não passa por aqui de propósito — ele disse que não queria
      // configurar agora, e empurrar um wizard seria ignorar o que ele acabou de
      // dizer. O "pular" segue direto para as abas.
      irParaApp(true);
    } catch {
      Alert.alert('Ops', 'Não consegui salvar agora. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  async function pickImage(field: 'logoUri' | 'assinaturaUri') {
    // mesmo padrão da MeuNegocioScreen (funciona no app e na web)
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permissão', 'Permita o acesso às fotos.'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.9 });
    if (!r.canceled) {
      setEmp(p => ({ ...p, [field]: r.assets[0].uri }));
      Haptics.selectionAsync().catch(() => {});
    }
  }

  // 1ª tela: boas-vindas calorosas da OLLI (protótipo 04). "Começar" abre o
  // cadastro. Quem chega no Onboarding JÁ está logado (é pós-login), então não
  // há mais o link "Já tenho conta · Entrar".
  if (!welcomed) {
    return (
      <BoasVindas
        insets={insets}
        onStart={() => { Haptics.selectionAsync().catch(() => {}); setWelcomed(true); }}
      />
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* HEADER COM GRADIENTE DA MARCA */}
      <LinearGradient colors={gradientes.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerTop}>
          <View style={styles.brandRow}>
            <OlliMascot size={40} onDark float={false} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={[styles.brand, { color: gradientes.sobreHeader }]}>Bem-vindo ao OLLI</Text>
              {/* Subtítulo SECUNDÁRIO sobre o header em gradiente: sobreSecundario rebaixa o
                  branco só até onde as DUAS pontas passam 4.5:1. O 'rgba(255,255,255,0.78)'
                  cravado que estava aqui media 3.67:1 na ponta clara (#0B6FCE) no modo claro. */}
              <Text style={[styles.brandSub, { color: sobreSecundario(gradientes.sobreHeader, gradientes.header) }]} numberOfLines={1}>Vamos montar o seu cadastro completo</Text>
            </View>
          </View>
          <TouchableOpacity onPress={pular} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Pular configuração">
            <Text style={[styles.skip, { color: gradientes.sobreHeader }]}>Pular</Text>
          </TouchableOpacity>
        </View>
        <StepIndicator steps={STEPS} current={step} />
      </LinearGradient>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ─── 1. SUA EMPRESA ─────────────────────────────── */}
        {step === 0 && (
          <AnimatedEntrance index={0}>
            <Text style={styles.title}>Sua empresa</Text>
            <Text style={styles.hint}>Isso aparece no cabeçalho dos seus orçamentos, recibos e no link do cliente.</Text>

            <View style={styles.card}>
              <OlliInput label="Nome do negócio" required value={emp.nome} error={errors.nome}
                onChangeText={v => { setField('nome', v); clearError('nome'); }}
                placeholder="Ex: Clima Frio Refrigeração" leftIcon="store" />

              <View style={styles.rowFields}>
                <OlliInput label="CNPJ" mask="cnpj" value={emp.cnpj} error={errors.cnpj}
                  onChangeText={v => { setField('cnpj', v); clearError('cnpj'); }}
                  placeholder="00.000.000/0001-00" containerStyle={{ flex: 1, marginRight: 10 }} />
                <OlliInput label="CPF" mask="cpf" value={emp.cpf} error={errors.cpf}
                  onChangeText={v => { setField('cpf', v); clearError('cpf'); }}
                  placeholder="000.000.000-00" containerStyle={{ flex: 1 }} />
              </View>

              {/* Cadastro mágico: preenche empresa + deduz a vertical pelo CNPJ. */}
              <TouchableOpacity
                onPress={buscarCnpj}
                disabled={cnpjLoading}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Preencher dados da empresa pelo CNPJ"
                style={{
                  flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6,
                  paddingVertical: 8, paddingHorizontal: 12, borderRadius: BorderRadius.md,
                  backgroundColor: comAlfa(cores.accent, 0.12), marginBottom: Spacing.md,
                }}
              >
                {/* accentLight, não accent: `accent` como cor de TEXTO não passa
                    contraste no claro (é idêntico no escuro, então não muda lá). */}
                {cnpjLoading
                  ? <ActivityIndicator size="small" color={cores.accentLight} />
                  : <MaterialCommunityIcons name="magnify" size={16} color={cores.accentLight} />}
                <Text style={{ color: cores.accentLight, fontWeight: '600', fontSize: 13 }}>
                  {cnpjLoading ? 'Buscando…' : 'Preencher pelo CNPJ'}
                </Text>
              </TouchableOpacity>
              {cnpjInfo ? <Text style={styles.hint}>{cnpjInfo}</Text> : null}

              <Text style={styles.segLabel}>Qual o seu segmento?</Text>
              <View style={styles.segRow}>
                {SEGMENTOS.map(s => {
                  const active = emp.segmento === s.id;
                  return (
                    <TouchableOpacity key={s.id} style={[styles.segChip, active && styles.segChipActive]} onPress={() => chooseSegmento(s.id)} activeOpacity={0.85}>
                      <MaterialCommunityIcons name={s.icon as any} size={16} color={active ? textoSobreAccent : cores.onSurfaceVariant} />
                      <Text style={[styles.segChipText, active && styles.segChipTextActive]}>{s.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <OlliInput label="Especialidade" value={emp.especialidade} onChangeText={v => setField('especialidade', v)} placeholder="Ex: Assistência técnica de ar condicionado" leftIcon="star-outline" />
              <OlliInput label="Slogan" value={emp.slogan} onChangeText={v => setField('slogan', v)} placeholder="Frase da sua marca" leftIcon="format-quote-close" containerStyle={{ marginBottom: 0 }} />
            </View>

            <Assure icon="lock-outline" text="Seus dados ficam no seu aparelho. Quanto mais completo, mais profissional fica o seu PDF." />
          </AnimatedEntrance>
        )}

        {/* ─── 2. VOCÊ (PRESTADOR) ────────────────────────── */}
        {step === 1 && (
          <AnimatedEntrance index={0}>
            <Text style={styles.title}>Você (prestador)</Text>
            <Text style={styles.hint}>A Home te saúda pelo nome e o cliente fala com você por aqui.</Text>

            <View style={styles.card}>
              <OlliInput label="Seu nome (prestador)" required value={emp.nomePrestador} error={errors.nomePrestador}
                onChangeText={v => { setField('nomePrestador', v); clearError('nomePrestador'); }}
                placeholder="Ex: João da Silva" leftIcon="account" />
              <OlliInput label="E-mail comercial" value={emp.email} onChangeText={v => setField('email', v)}
                placeholder="contato@suaempresa.com.br" keyboardType="email-address" autoCapitalize="none" leftIcon="email" />
              <OlliInput label="WhatsApp / Telefone" required mask="phone" value={emp.whatsapp} error={errors.whatsapp}
                onChangeText={v => { setField('whatsapp', v); clearError('whatsapp'); }}
                placeholder="(11) 99999-9999" leftIcon="whatsapp" containerStyle={{ marginBottom: 0 }} />
            </View>

            <Assure icon="shield-check-outline" text="O WhatsApp vira o botão de contato no link que você manda ao cliente." />
          </AnimatedEntrance>
        )}

        {/* ─── 3. ENDEREÇO (com busca por CEP) ────────────── */}
        {step === 2 && (
          <AnimatedEntrance index={0}>
            <Text style={styles.title}>Endereço</Text>
            <Text style={styles.hint}>Digite o CEP que a gente preenche o resto pra você.</Text>

            <View style={styles.card}>
              <View style={styles.cepRow}>
                <OlliInput label="CEP" mask="cep" value={end.cep} onChangeText={onCepChange}
                  placeholder="00000-000" leftIcon="map-marker-radius" containerStyle={{ flex: 1, marginBottom: 0 }} />
                {cepLoading && <ActivityIndicator size="small" color={cores.accentLight} style={styles.cepSpinner} />}
              </View>
              {cepInfo ? <Text style={styles.cepInfo}>{cepInfo}</Text> : null}

              <View style={{ height: Spacing.base }} />

              <OlliInput label="Rua / Logradouro" value={end.rua} onChangeText={v => setEnd(p => ({ ...p, rua: v }))} placeholder="Ex: Rua das Flores" leftIcon="road-variant" />
              <View style={styles.rowFields}>
                <OlliInput label="Número" value={end.numero} onChangeText={v => setEnd(p => ({ ...p, numero: v }))} placeholder="120" keyboardType="numeric" containerStyle={{ flex: 1, marginRight: 10 }} />
                <OlliInput label="Complemento" value={end.complemento} onChangeText={v => setEnd(p => ({ ...p, complemento: v }))} placeholder="Apto / Sala" containerStyle={{ flex: 2 }} />
              </View>
              <OlliInput label="Bairro" value={end.bairro} onChangeText={v => setEnd(p => ({ ...p, bairro: v }))} placeholder="Centro" leftIcon="home-group" />
              <View style={styles.rowFields}>
                <OlliInput label="Cidade" value={emp.cidade} onChangeText={v => setField('cidade', v)} placeholder="São Paulo" containerStyle={{ flex: 2, marginRight: 10, marginBottom: 0 }} />
                <OlliInput label="UF" value={emp.estado} onChangeText={v => setField('estado', v.toUpperCase().slice(0, 2))} autoCapitalize="characters" maxLength={2} placeholder="SP" containerStyle={{ flex: 1, marginBottom: 0 }} />
              </View>
            </View>

            <Assure icon="information-outline" text="O endereço aparece no cabeçalho dos documentos. Tudo continua editável." />
          </AnimatedEntrance>
        )}

        {/* ─── 4. RECEBIMENTO (PIX) ───────────────────────── */}
        {step === 3 && (
          <AnimatedEntrance index={0}>
            <Text style={styles.title}>Recebimento</Text>
            <Text style={styles.hint}>Sua chave PIX aparece nos orçamentos e recibos para o cliente te pagar rápido.</Text>

            <View style={styles.card}>
              <OlliInput label="Chave PIX" value={emp.chavePix} onChangeText={v => setField('chavePix', v)}
                placeholder="CPF/CNPJ, e-mail, telefone ou aleatória" leftIcon="key-variant" autoCapitalize="none" containerStyle={{ marginBottom: 0 }} />
            </View>

            <Assure icon="cash-fast" text="Sem pressa: dá para configurar depois em “Meu Negócio”." />
          </AnimatedEntrance>
        )}

        {/* ─── 5. IDENTIDADE VISUAL (logo + assinatura) ───── */}
        {step === 4 && (
          <AnimatedEntrance index={0}>
            <Text style={styles.title}>Identidade visual</Text>
            <Text style={styles.hint}>Sua logo e assinatura deixam cada documento com a sua cara.</Text>

            <View style={styles.card}>
              <View style={styles.brandPickRow}>
                <View style={styles.brandItem}>
                  <TouchableOpacity style={styles.imageBox} onPress={() => pickImage('logoUri')} activeOpacity={0.8}>
                    {emp.logoUri ? <Image source={{ uri: emp.logoUri }} style={styles.imageFull} resizeMode="contain" /> : (
                      <><MaterialCommunityIcons name="image-plus" size={28} color={cores.primaryLight} /><Text style={styles.imageHint}>Logo</Text></>
                    )}
                  </TouchableOpacity>
                  <Text style={styles.brandLabel}>Logotipo</Text>
                </View>
                <View style={styles.brandItem}>
                  <TouchableOpacity style={styles.imageBox} onPress={() => pickImage('assinaturaUri')} activeOpacity={0.8}>
                    {emp.assinaturaUri ? <Image source={{ uri: emp.assinaturaUri }} style={styles.imageFull} resizeMode="contain" /> : (
                      <><MaterialCommunityIcons name="draw" size={28} color={cores.primaryLight} /><Text style={styles.imageHint}>Assinatura</Text></>
                    )}
                  </TouchableOpacity>
                  <Text style={styles.brandLabel}>Assinatura</Text>
                </View>
              </View>
            </View>

            <Assure icon="palette-outline" text="Toque em cada quadro para escolher uma imagem da galeria. Você vê a prévia aqui mesmo." />
          </AnimatedEntrance>
        )}

        {/* ─── 6. PRIMEIRO SERVIÇO (opcional) ─────────────── */}
        {step === 5 && (
          <AnimatedEntrance index={0}>
            <Text style={styles.title}>Primeiro serviço</Text>
            <Text style={styles.hint}>Com um serviço no catálogo, você monta orçamentos em segundos. (Opcional)</Text>

            <View style={styles.card}>
              <OlliInput label="Nome do serviço" value={servNome} onChangeText={setServNome} placeholder="Ex: Limpeza de ar-condicionado split" leftIcon="wrench" />
              <OlliMoneyInput label="Preço de venda" value={servPreco} onChangeValue={setServPreco} containerStyle={{ marginBottom: 0 }} />
            </View>

            <Assure icon="lightbulb-on-outline" text="Pode deixar em branco e cadastrar vários serviços depois, em “Serviços”." />
          </AnimatedEntrance>
        )}
      </ScrollView>

      {/* AÇÕES */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 18 }]}>
        {step === 0 ? (
          <OlliButton
            label="Continuar"
            variant="gradient" size="lg" fullWidth
            onPress={avancar}
            icon={<MaterialCommunityIcons name="arrow-right" size={20} color={gradientes.sobreBrand} />}
          />
        ) : (
          <View style={styles.footerRow}>
            <OlliButton label="Voltar" variant="outline" size="lg" onPress={voltar} haptic={false} icon={<MaterialCommunityIcons name="chevron-left" size={18} color={cores.primary} />} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              {step === ULTIMO ? (
                <OlliButton
                  label={servNome.trim() ? 'Concluir e começar' : 'Concluir cadastro'}
                  variant="gradient" size="lg" fullWidth
                  loading={saving}
                  onPress={concluir}
                  icon={<MaterialCommunityIcons name="check-circle" size={20} color={gradientes.sobreBrand} />}
                />
              ) : (
                <OlliButton
                  label="Continuar"
                  variant="gradient" size="lg" fullWidth
                  onPress={avancar}
                  icon={<MaterialCommunityIcons name="arrow-right" size={20} color={gradientes.sobreBrand} />}
                />
              )}
            </View>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

/** Linha de tranquilização (ícone + texto) reutilizada em todas as etapas. */
function Assure({ icon, text }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.assure}>
      <MaterialCommunityIcons name={icon} size={15} color={cores.accentLight} />
      <Text style={styles.assureText}>{text}</Text>
    </View>
  );
}

/** Tela de boas-vindas (protótipo 04): a OLLI se apresenta antes do cadastro. */
function BoasVindas({ onStart, insets }: {
  onStart: () => void;
  insets: { top: number; bottom: number };
}) {
  const cores = useCores();
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);
  return (
    <LinearGradient colors={gradientes.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.wcRoot}>
      {/* Aurora animado atras da tela de boas-vindas — mesma linguagem do login.
          Intensidade baixa: o subtitulo secundario ja e medido em 4.5:1 aqui. */}
      <AuroraBackground
        cores={[cores.accent, cores.accentLight, cores.primaryLight, cores.accent]}
        intensidade={0.13}
      />
      <View style={{ height: insets.top + 10 }} />
      <View style={styles.wcCenter}>
        <OlliMascot size={104} onDark />
        <Text style={[styles.wcHi, { color: gradientes.sobrePrimary }]}>Olá! Eu sou a OLLI 👋</Text>
        {/* Subtítulo SECUNDÁRIO sobre gradientes.primary: sobreSecundario mantém 4.5:1 nas
            duas pontas. O 'rgba(255,255,255,0.82)' cravado media 3.90:1 na ponta clara (#0B6FCE). */}
        <Text style={[styles.wcSub, { color: sobreSecundario(gradientes.sobrePrimary, gradientes.primary) }]}>O sistema completo pra quem presta serviço técnico: você monta o orçamento, o cliente aprova pelo próprio celular, e você organiza a execução em campo até fechar com o recibo — tudo funciona mesmo sem internet.</Text>
        <View style={styles.wcFeatures}>
          <WcFeature icon="file-document-edit-outline" text="Orçamento pronto em minutos — dá até pra ditar por voz" />
          <WcFeature icon="link-variant" text="O cliente aprova ou recusa pelo link, sem instalar nada" />
          <WcFeature icon="toolbox-outline" text="Ordens de serviço e equipe organizadas em campo" />
          <WcFeature icon="wifi-off" text="Funciona sem internet — sincroniza sozinho quando ela voltar" />
        </View>
      </View>
      <View style={[styles.wcFooter, { paddingBottom: insets.bottom + 18 }]}>
        <TouchableOpacity style={styles.wcStart} onPress={onStart} activeOpacity={0.9} accessibilityRole="button">
          <Text style={styles.wcStartText}>Começar</Text>
          <MaterialCommunityIcons name="arrow-right" size={20} color={cores.primaryDark} />
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

function WcFeature({ icon, text }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string }) {
  const cores = useCores();
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.wcFeat}>
      <View style={styles.wcFeatIcon}>
        {/* Sobre gradientes.primary (marca, escuro e fixo nos dois modos): o ciano
            BRILHANTE (accent) é a cor certa. No escuro accent === accentLight: no-op. */}
        <MaterialCommunityIcons
          name={icon}
          size={18}
          color={cores.accent} // contraste-ok: gradientes.primary #0B6FCE→#042646 (marca, escuro e fixo nos dois modos) — accentLight cairia a 1.03:1 na ponta mais clara (2.45:1)
        />
      </View>
      <Text style={[styles.wcFeatText, { color: gradientes.sobrePrimary }]}>{text}</Text>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },

  // Boas-vindas (protótipo 04) — vive inteira sobre gradientes.primary
  // (sempre colorido, nos dois modos), por isso texto/glass ficam fixos aqui,
  // como no GradientHeader.
  wcRoot: { flex: 1, overflow: 'hidden' },
  wcCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  // Cor de texto aplicada inline no ponto de uso (gradientes.sobrePrimary) — StyleSheet
  // de escopo de módulo não enxerga o tema.
  wcHi: { fontSize: 26, fontWeight: '800', marginTop: 22, textAlign: 'center', letterSpacing: 0 },
  // Cor aplicada inline no ponto de uso (sobreSecundario sobre gradientes.primary) —
  // StyleSheet de escopo de módulo não enxerga o tema. Era 'rgba(255,255,255,0.82)' (3.90:1).
  wcSub: { fontSize: 15, textAlign: 'center', marginTop: 10, lineHeight: 22 },
  wcFeatures: { alignSelf: 'stretch', marginTop: 28, gap: 12 },
  // rgba(127,233,245,x) era o accentLight estático — vira o accentLight do tema
  // (o branco translúcido do glass em si continua fixo, é o próprio efeito).
  wcFeat: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: comAlfa(c.accentLight, 0.25), borderRadius: BorderRadius.md, padding: 12 },
  wcFeatIcon: { width: 36, height: 36, borderRadius: BorderRadius.chip, backgroundColor: comAlfa(c.accentLight, 0.14), justifyContent: 'center', alignItems: 'center' },
  // Idem: cor aplicada inline (gradientes.sobrePrimary) em WcFeature.
  wcFeatText: { flex: 1, fontSize: 14, fontWeight: '600' },
  wcFooter: { paddingHorizontal: Spacing.base, paddingTop: 12 },
  wcStart: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.accentLight, borderRadius: 16, paddingVertical: 16, ...sombrasDe(c).glowCyan },
  wcStartText: { fontSize: 16, fontWeight: '800', color: c.primaryDark },
  header: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.base },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  // Idem: cor aplicada inline (gradientes.sobreHeader) no ponto de uso.
  brand: { fontSize: 18, fontWeight: '800' },
  // Cor aplicada inline no ponto de uso (sobreSecundario sobre gradientes.header) —
  // era 'rgba(255,255,255,0.78)', que media 3.67:1 na ponta clara no modo claro.
  brandSub: { fontSize: 12.5, marginTop: 2 },
  // Cor aplicada inline (gradientes.sobreHeader) no ponto de uso — mesmo padrão de
  // `brand`. Era c.accentLight, que no claro escurece e some sobre o header (1.03:1).
  skip: { fontSize: 14, fontWeight: '700' },

  // Era '#fff' fixo, mas este título fica sobre o fundo da PÁGINA (c.background),
  // não sobre o header em gradiente — no claro (padrão do app) ficava ilegível.
  title: { fontSize: 22, fontWeight: '800', color: c.onSurface, letterSpacing: 0, marginTop: Spacing.sm },
  hint: { fontSize: 13.5, color: c.onSurfaceVariant, marginTop: 4, marginBottom: Spacing.lg, lineHeight: 19 },

  card: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.base, ...sombrasDe(c).sm },

  rowFields: { flexDirection: 'row' },

  segLabel: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant, marginBottom: 8 },
  segRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.base },
  segChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: c.outline, backgroundColor: c.surfaceVariant },
  segChipActive: { backgroundColor: c.accentLight, borderColor: c.accentLight },
  segChipText: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant },
  // Era '#0A1626' fixo — vira o ink de contraste calculado sobre accentLight.
  segChipTextActive: { color: textoSobre(c.accentLight) },

  cepRow: { flexDirection: 'row', alignItems: 'flex-end' },
  cepSpinner: { marginLeft: 10, marginBottom: 14 },
  cepInfo: { fontSize: 12.5, color: c.accentLight, marginTop: 8, fontWeight: '600' },

  brandPickRow: { flexDirection: 'row', justifyContent: 'center', gap: 24 },
  brandItem: { alignItems: 'center' },
  imageBox: { width: 130, height: 96, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: c.primary, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', backgroundColor: c.primaryContainer },
  imageFull: { width: '100%', height: '100%' },
  imageHint: { fontSize: 11, color: c.primaryLight, fontWeight: '600', marginTop: 2 },
  brandLabel: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 6, fontWeight: '600' },

  assure: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: Spacing.base, paddingHorizontal: 4 },
  assureText: { flex: 1, fontSize: 12.5, color: c.onSurfaceVariant, lineHeight: 18 },

  footer: { paddingHorizontal: Spacing.base, paddingTop: 12, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
  footerRow: { flexDirection: 'row', alignItems: 'center' },
});
