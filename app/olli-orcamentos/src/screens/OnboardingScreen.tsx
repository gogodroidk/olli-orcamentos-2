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
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius, Shadow, Gradients } from '../theme';
import { OlliButton } from '../components/OlliButton';
import { OlliInput, OlliMoneyInput } from '../components/OlliInput';
import { OlliMascot } from '../components/OlliMascot';
import { StepIndicator } from '../components/StepIndicator';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { saveEmpresa, saveServico } from '../database/database';
import { Empresa, ServicoItem, Segmento, SEGMENTOS } from '../types';
import { generateId } from '../utils/id';
import { nowISO } from '../utils/date';
import { isValidCPF } from '../utils/masks';
import { buscarCep } from '../services/cep';
import { track, Eventos } from '../services/analytics';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

export const ONBOARDED_KEY = 'olli.onboarded';

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

export default function OnboardingScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const scrollRef = useRef<ScrollView>(null);

  // dados da empresa (acumulados ao longo das etapas)
  const [emp, setEmp] = useState<Empresa>(empresaEmBranco());
  // partes do endereço (compostas em emp.endereco ao concluir)
  const [end, setEnd] = useState<EnderecoForm>({ cep: '', rua: '', numero: '', complemento: '', bairro: '' });
  const [cepLoading, setCepLoading] = useState(false);
  const [cepInfo, setCepInfo] = useState<string | null>(null);
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

  // marca como concluído (idempotente) — usado tanto no "pular" quanto no "concluir"
  async function marcarConcluido() {
    try { await AsyncStorage.setItem(ONBOARDED_KEY, '1'); } catch { /* best-effort */ }
  }

  function irParaApp() {
    // reset: o app abre normal nas abas e o usuário não consegue "voltar" para o onboarding
    nav.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: 'Tabs' }] }),
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
      if (tel.length < 10) e.whatsapp = 'Informe um WhatsApp válido.';
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
      irParaApp();
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

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* HEADER COM GRADIENTE DA MARCA */}
      <LinearGradient colors={Gradients.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerTop}>
          <View style={styles.brandRow}>
            <OlliMascot size={40} onDark float={false} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.brand}>Bem-vindo ao OLLI</Text>
              <Text style={styles.brandSub} numberOfLines={1}>Vamos montar o seu cadastro completo</Text>
            </View>
          </View>
          <TouchableOpacity onPress={pular} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Pular configuração">
            <Text style={styles.skip}>Pular</Text>
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

              <Text style={styles.segLabel}>Qual o seu segmento?</Text>
              <View style={styles.segRow}>
                {SEGMENTOS.map(s => {
                  const active = emp.segmento === s.id;
                  return (
                    <TouchableOpacity key={s.id} style={[styles.segChip, active && styles.segChipActive]} onPress={() => chooseSegmento(s.id)} activeOpacity={0.85}>
                      <MaterialCommunityIcons name={s.icon as any} size={16} color={active ? '#0A1626' : Colors.onSurfaceVariant} />
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
                {cepLoading && <ActivityIndicator size="small" color={Colors.accent} style={styles.cepSpinner} />}
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
                      <><MaterialCommunityIcons name="image-plus" size={28} color={Colors.primaryLight} /><Text style={styles.imageHint}>Logo</Text></>
                    )}
                  </TouchableOpacity>
                  <Text style={styles.brandLabel}>Logotipo</Text>
                </View>
                <View style={styles.brandItem}>
                  <TouchableOpacity style={styles.imageBox} onPress={() => pickImage('assinaturaUri')} activeOpacity={0.8}>
                    {emp.assinaturaUri ? <Image source={{ uri: emp.assinaturaUri }} style={styles.imageFull} resizeMode="contain" /> : (
                      <><MaterialCommunityIcons name="draw" size={28} color={Colors.primaryLight} /><Text style={styles.imageHint}>Assinatura</Text></>
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
            icon={<MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />}
          />
        ) : (
          <View style={styles.footerRow}>
            <OlliButton label="Voltar" variant="outline" size="lg" onPress={voltar} haptic={false} icon={<MaterialCommunityIcons name="chevron-left" size={18} color={Colors.primary} />} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              {step === ULTIMO ? (
                <OlliButton
                  label={servNome.trim() ? 'Concluir e começar' : 'Concluir cadastro'}
                  variant="gradient" size="lg" fullWidth
                  loading={saving}
                  onPress={concluir}
                  icon={<MaterialCommunityIcons name="check-circle" size={20} color="#fff" />}
                />
              ) : (
                <OlliButton
                  label="Continuar"
                  variant="gradient" size="lg" fullWidth
                  onPress={avancar}
                  icon={<MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />}
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
  return (
    <View style={styles.assure}>
      <MaterialCommunityIcons name={icon} size={15} color={Colors.accentLight} />
      <Text style={styles.assureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.base },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  brand: { fontSize: 18, fontWeight: '800', color: '#fff' },
  brandSub: { fontSize: 12.5, color: 'rgba(255,255,255,0.78)', marginTop: 2 },
  skip: { fontSize: 14, fontWeight: '700', color: Colors.accentLight },

  title: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.3, marginTop: Spacing.sm },
  hint: { fontSize: 13.5, color: Colors.onSurfaceVariant, marginTop: 4, marginBottom: Spacing.lg, lineHeight: 19 },

  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.outline, padding: Spacing.base, ...Shadow.sm },

  rowFields: { flexDirection: 'row' },

  segLabel: { fontSize: 13, fontWeight: '700', color: Colors.onSurfaceVariant, marginBottom: 8 },
  segRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.base },
  segChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: Colors.outline, backgroundColor: Colors.surfaceVariant },
  segChipActive: { backgroundColor: Colors.accentLight, borderColor: Colors.accentLight },
  segChipText: { fontSize: 13, fontWeight: '700', color: Colors.onSurfaceVariant },
  segChipTextActive: { color: '#0A1626' },

  cepRow: { flexDirection: 'row', alignItems: 'flex-end' },
  cepSpinner: { marginLeft: 10, marginBottom: 14 },
  cepInfo: { fontSize: 12.5, color: Colors.accentLight, marginTop: 8, fontWeight: '600' },

  brandPickRow: { flexDirection: 'row', justifyContent: 'center', gap: 24 },
  brandItem: { alignItems: 'center' },
  imageBox: { width: 130, height: 96, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.primary, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', backgroundColor: Colors.primaryContainer },
  imageFull: { width: '100%', height: '100%' },
  imageHint: { fontSize: 11, color: Colors.primaryLight, fontWeight: '600', marginTop: 2 },
  brandLabel: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 6, fontWeight: '600' },

  assure: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: Spacing.base, paddingHorizontal: 4 },
  assureText: { flex: 1, fontSize: 12.5, color: Colors.onSurfaceVariant, lineHeight: 18 },

  footer: { paddingHorizontal: Spacing.base, paddingTop: 12, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.outline },
  footerRow: { flexDirection: 'row', alignItems: 'center' },
});
