import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { vibrar } from '../utils/haptico';
import {
  Spacing, BorderRadius, Typography, useCores, useGradientes, useEstilos, sombrasDe, comAlfa, textoSobre,
  sobreSecundario, type Cores,
} from '../theme';
import { DURACAO, MOLA, useReduzirMovimento } from '../theme/motion';
import { OlliButton } from '../components/OlliButton';
import { OlliInput, OlliMoneyInput } from '../components/OlliInput';
import { OlliMascot } from '../components/OlliMascot';
import { AuroraBackground } from '../components/AuroraBackground';
import { Aparecer, ContadorAnimado, PressableAnimado } from '../components/motion';
import { curvas } from '../components/motion/curvas';
import { saveEmpresa } from '../database/database';
import { Empresa } from '../types';
import { isValidCNPJ } from '../utils/masks';
import { useCepLookup } from '../services/cep';
import { AvisoCep } from '../components/AvisoCep';
import { consultarCnpj } from '../services/cnpj';
import { deduzirVerticais, verticalPorId, type VerticalId } from '../services/verticais';
import { camposPendentesPerfil, perfilOperacionalCompleto } from '../services/perfilOperacional';
import { getCurrentUser } from '../services/supabase';
import { track, Eventos } from '../services/analytics';
import { ONBOARDED_KEY } from '../services/onboarding';
import { resolverEstadoEmpresaDaSessao } from '../services/cloudSync';
import { RootStackParamList } from '../navigation/AppNavigator';
import { ConviteImportar } from '../components/ConviteImportar';
import { DicaDoRoteiro } from '../components/ajuda/DicaDoRoteiro';
import { registrarEventoDica } from '../services/dicasRoteiroStore';
import { AVISO_EXEMPLO } from '../services/ativacao';
import {
  OFICIOS_ONBOARDING, camposDoOficio, itensIniciais, nomeDoNegocio, oficioPorVertical,
  paramsPrimeiroOrcamento, telefoneNormalizado, totalRascunho, validarBase,
  type CampoBase, type DadosBase, type ItemRascunho,
} from '../services/onboardingRapido';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

/** Reexportada por compat: EntrarScreen ainda importa daqui. Fonte real: services/onboarding.ts. */
export { ONBOARDED_KEY };

/** O estado de onboarding pertence à conta, não ao aparelho compartilhado. */
export function onboardedKeyForUser(userId: string): string {
  return `${ONBOARDED_KEY}.${userId}`;
}

/**
 * ONBOARDING EM 4 TELAS (Onda I5.2) — termina com o PRIMEIRO ORÇAMENTO pronto.
 *
 *   0. Olá           — a OLLI se apresenta (o mascote entra com mola).
 *   1. Seu ofício    — um toque num ícone grande.
 *   2. Você e a base — nome, WhatsApp, cidade (o CEP preenche). Uma linha de "por quê".
 *   3. 1º orçamento  — itens do ofício com valor de exemplo, editáveis, e o total.
 *
 * A regra mora em `services/onboardingRapido.ts` (testada). Logo, Pix, assinatura e
 * o endereço completo ficam para o checklist do Início — sem travar ninguém.
 *
 * O portão de 3 estados continua o mesmo de antes: o formulário só existe depois
 * que a AUSÊNCIA da empresa foi confirmada na conta. "Não sei" mostra retry —
 * nunca uma empresa em branco por cima de um cadastro que ainda não baixou.
 */
const TOTAL_TELAS = 4;
/** Nome estável de cada tela (chave dos pontos de progresso). */
const NOMES_TELAS = ['ola', 'oficio', 'base', 'orcamento'] as const;

/** Partes do endereço que o CEP traz (o número o prestador completa depois em Meu Negócio). */
interface EnderecoCep { cep: string; rua: string; bairro: string }

function montarEndereco(e: EnderecoCep): string {
  const partes: string[] = [];
  if (e.rua.trim()) partes.push(e.rua.trim());
  if (e.bairro.trim()) partes.push(`(${e.bairro.trim()})`);
  return partes.join(' ').trim();
}

const BASE_VAZIA: DadosBase = {
  tipoNegocio: undefined,
  nomePrestador: '',
  nomeNegocio: '',
  whatsapp: '',
  cnpj: '',
  cidade: '',
  estado: '',
};

export default function OnboardingScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const cores = useCores();
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);

  const [tela, setTela] = useState(0);
  const [saving, setSaving] = useState(false);
  const [acessoCadastro, setAcessoCadastro] = useState<'verificando' | 'liberado' | 'bloqueado'>('verificando');
  const verificacaoRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);

  // Tela 1 — ofício.
  const [vertical, setVertical] = useState<VerticalId | null>(null);
  const [erroOficio, setErroOficio] = useState(false);
  // Tela 2 — você e a base.
  const [base, setBase] = useState<DadosBase>(BASE_VAZIA);
  const [errors, setErrors] = useState<Partial<Record<CampoBase, string>>>({});
  const [end, setEnd] = useState<EnderecoCep>({ cep: '', rua: '', bairro: '' });
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjInfo, setCnpjInfo] = useState<string | null>(null);
  // Tela 3 — o primeiro orçamento.
  const [itens, setItens] = useState<ItemRascunho[]>([]);
  const [clienteNome, setClienteNome] = useState('');

  // Nome e telefone do cadastro (user_metadata) entram sozinhos. Best-effort.
  useEffect(() => {
    (async () => {
      try {
        const u = await getCurrentUser();
        const meta = u?.user_metadata as { telefone?: string; phone?: string; full_name?: string; name?: string } | undefined;
        const tel = meta?.telefone ?? meta?.phone ?? '';
        const nome = meta?.full_name ?? meta?.name ?? '';
        setBase(p => ({
          ...p,
          whatsapp: p.whatsapp.trim() ? p.whatsapp : tel,
          nomePrestador: p.nomePrestador.trim() ? p.nomePrestador : nome,
        }));
      } catch { /* sem sessão: segue vazio */ }
    })();
  }, []);

  async function verificarAcessoAoCadastro() {
    const verificacao = ++verificacaoRef.current;
    setAcessoCadastro('verificando');
    const estado = await resolverEstadoEmpresaDaSessao();
    if (verificacao !== verificacaoRef.current) return;
    if (estado === 'tem') {
      // A empresa real já foi aplicada ao SQLite pelo resolver.
      try {
        const usuario = await getCurrentUser();
        if (usuario?.id) await AsyncStorage.setItem(onboardedKeyForUser(usuario.id), '1');
      } catch { /* tenta de novo no próximo boot */ }
      irParaApp('inicio');
      return;
    }
    setAcessoCadastro(estado === 'nao_tem' ? 'liberado' : 'bloqueado');
  }

  useEffect(() => {
    void verificarAcessoAoCadastro();
    return () => { verificacaoRef.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setCampo = useCallback(<K extends CampoBase>(campo: K, valor: DadosBase[K]) => {
    setBase(p => ({ ...p, [campo]: valor }));
    setErrors(p => (p[campo] ? { ...p, [campo]: undefined } : p));
  }, []);

  // ─── CEP: mesma busca das outras telas (campo com conteúdo não é tocado) ───
  const endRef = useRef(end);
  endRef.current = end;
  const baseRef = useRef(base);
  baseRef.current = base;
  const { estadoCep, enderecoCep, divergencias, onCepChange, usarDoCep } = useCepLookup(
    (campos, achado) => {
      setEnd(p => ({
        ...p,
        ...(campos.endereco !== undefined ? { rua: campos.endereco } : null),
        ...(!p.bairro.trim() && achado.bairro ? { bairro: achado.bairro } : null),
      }));
      setBase(p => ({
        ...p,
        ...(campos.cidade !== undefined ? { cidade: campos.cidade } : null),
        ...(campos.estado !== undefined ? { estado: campos.estado } : null),
      }));
      setErrors(p => ({ ...p, cidade: undefined, estado: undefined }));
      vibrar('selecao');
    },
    () => ({ endereco: endRef.current.rua, cidade: baseRef.current.cidade, estado: baseRef.current.estado }),
    'onboarding',
  );

  // ─── CNPJ: preenche nome/cidade e sugere o ofício pelo CNAE (só campo vazio) ───
  async function buscarCnpj() {
    const digits = base.cnpj.replace(/\D/g, '');
    if (digits.length !== 14) {
      setErrors(p => ({ ...p, cnpj: 'Informe o CNPJ com 14 dígitos para buscar.' }));
      return;
    }
    setCnpjLoading(true);
    setCnpjInfo(null);
    const r = await consultarCnpj(digits);
    if (r.estado === 'ok') {
      const e = r.empresa;
      const deduzidas = deduzirVerticais(e.cnaePrincipal.codigo, e.cnaesSecundarios.map(c => c.codigo));
      const nomeEmpresa = e.nomeFantasia || e.razaoSocial;
      setBase(p => ({
        ...p,
        nomeNegocio: p.nomeNegocio.trim() || nomeEmpresa,
        cidade: p.cidade.trim() || e.municipio,
        estado: p.estado.trim() || e.uf,
      }));
      setEnd(p => ({ ...p, rua: p.rua.trim() || e.logradouro, bairro: p.bairro.trim() || e.bairro }));
      const principal = deduzidas[0];
      setCnpjInfo(
        vertical || principal === 'geral'
          ? `Achei ${nomeEmpresa}. Confira os dados.`
          : `Achei ${nomeEmpresa}. Pelo CNPJ, parece ${verticalPorId(principal).label}.`,
      );
      vibrar('selecao');
    } else if (r.estado === 'nao_encontrado') {
      setCnpjInfo('Não achei esse CNPJ. Confira o número ou preencha na mão.');
    } else if (r.estado === 'invalido') {
      setCnpjInfo('O CNPJ precisa ter 14 dígitos.');
    } else {
      setCnpjInfo('Não consegui buscar agora. Você pode preencher na mão.');
    }
    setCnpjLoading(false);
  }

  /**
   * Sai do onboarding. "orcamento" abre o editor com o 1º orçamento já montado
   * (Tabs embaixo: voltar leva ao app normal — é convite, não sequestro);
   * "importar" abre "Trazer meus dados"; "inicio" vai direto às abas.
   */
  function irParaApp(destino: 'inicio' | 'orcamento' | 'importar', params?: RootStackParamList['NovoOrcamento']) {
    nav.dispatch(
      CommonActions.reset(
        destino === 'orcamento'
          ? { index: 1, routes: [{ name: 'Tabs' }, { name: 'NovoOrcamento', params: params ?? {} }] }
          : destino === 'importar'
            ? { index: 1, routes: [{ name: 'Tabs' }, { name: 'Importar' }] }
            : { index: 0, routes: [{ name: 'Tabs' }] },
      ),
    );
  }

  /** Empresa COMPLETA (o perfil operacional exige nome, telefone, ofício e cidade). */
  function montarEmpresa(): Empresa {
    const oficio = vertical ? camposDoOficio(vertical) : null;
    const tel = telefoneNormalizado(base.whatsapp);
    return {
      id: 'empresa_1',
      nome: nomeDoNegocio(base),
      nomePrestador: base.nomePrestador.trim(),
      especialidade: vertical ? verticalPorId(vertical).label : '',
      slogan: '',
      cnpj: base.cnpj.trim(),
      cpf: '',
      endereco: montarEndereco(end),
      cidade: base.cidade.trim(),
      estado: base.estado.trim().toUpperCase().slice(0, 2),
      telefone: tel,
      whatsapp: tel,
      site: '',
      email: '',
      chavePix: '',
      normas: '',
      tipoNegocio: base.tipoNegocio,
      ...(oficio ?? {}),
    };
  }

  async function marcarConcluido() {
    const usuario = await getCurrentUser();
    if (!usuario?.id) throw new Error('sessao_indeterminada');
    await AsyncStorage.setItem(onboardedKeyForUser(usuario.id), '1');
  }

  /** Confirma de novo logo antes da escrita (a tela pode ter ficado aberta minutos). */
  async function confirmarAusenciaAntesDeSalvar(): Promise<boolean> {
    const estado = await resolverEstadoEmpresaDaSessao();
    if (estado === 'nao_tem') return true;
    if (estado === 'tem') {
      try {
        const usuario = await getCurrentUser();
        if (usuario?.id) await AsyncStorage.setItem(onboardedKeyForUser(usuario.id), '1');
      } catch { /* empresa local já está segura */ }
      Alert.alert('Cadastro encontrado', 'Carregamos os dados que já existiam na sua conta. Nada foi substituído.');
      irParaApp('inicio');
      return false;
    }
    Alert.alert(
      'Não foi possível confirmar sua conta',
      'Nada foi salvo ou substituído. Conecte-se à internet e tente de novo para confirmarmos se já existe um cadastro.',
    );
    return false;
  }

  function irParaTela(n: number) {
    setTela(n);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function avancar() {
    if (tela === 1) {
      if (!vertical) { vibrar('erro'); setErroOficio(true); return; }
      vibrar('selecao');
      irParaTela(2);
      return;
    }
    if (tela === 2) {
      const e = validarBase(base, isValidCNPJ);
      setErrors(e);
      if (Object.keys(e).length) { vibrar('erro'); return; }
      vibrar('selecao');
      // O orçamento nasce do ofício escolhido; voltar e trocar de ofício refaz os itens.
      setItens(itensIniciais(vertical).itens);
      registrarEventoDica('onboarding_primeiro_orcamento');
      irParaTela(3);
      return;
    }
    vibrar('selecao');
    irParaTela(Math.min(tela + 1, TOTAL_TELAS - 1));
  }

  function voltar() {
    vibrar('selecao');
    setErrors({});
    irParaTela(Math.max(tela - 1, 0));
  }

  async function concluir(destino: 'orcamento' | 'importar' | 'inicio') {
    if (saving) return;
    const empresaFinal = montarEmpresa();
    if (!perfilOperacionalCompleto(empresaFinal)) {
      const pendentes = camposPendentesPerfil(empresaFinal);
      irParaTela(pendentes.includes('verticais') ? 1 : 2);
      Alert.alert('Falta um dado', 'Complete os campos destacados para começar.');
      return;
    }
    setSaving(true);
    try {
      if (!(await confirmarAusenciaAntesDeSalvar())) return;
      await saveEmpresa(empresaFinal);
      track(Eventos.empresaSaved, { origem: 'onboarding', segmento: empresaFinal.segmento });
      vibrar('sucesso');
      track(Eventos.onboardingCompleted, { destino, vertical, versao: 'quatro_telas' });
      await marcarConcluido();
      if (destino === 'orcamento' && vertical) {
        track(Eventos.exemploAtivacaoAberto, { origem: 'onboarding', vertical });
        irParaApp('orcamento', paramsPrimeiroOrcamento(vertical, itens, clienteNome));
        return;
      }
      irParaApp(destino);
    } catch {
      Alert.alert('Ops', 'Não consegui salvar agora. Tente de novo.');
    } finally {
      setSaving(false);
    }
  }

  // ─── Portão de 3 estados ────────────────────────────────────────────────────
  if (acessoCadastro !== 'liberado') {
    const verificando = acessoCadastro === 'verificando';
    return (
      <View style={[styles.verificationRoot, { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl }]}>
        <OlliMascot size={86} float={false} />
        <View style={styles.verificationCard}>
          {verificando ? (
            <ActivityIndicator size="large" color={cores.primary} />
          ) : (
            <MaterialCommunityIcons name="cloud-alert-outline" size={42} color={cores.primary} />
          )}
          <Text style={styles.verificationTitle}>
            {verificando ? 'Confirmando seus dados…' : 'Precisamos confirmar sua conta'}
          </Text>
          <Text style={styles.verificationText}>
            {verificando
              ? 'Estamos verificando se sua empresa já está cadastrada para não substituir nenhuma informação.'
              : 'Preciso de internet só agora, para confirmar se sua empresa já existe antes de criar outra. Seus dados neste aparelho continuam intactos.'}
          </Text>
          {!verificando && (
            <OlliButton label="Tentar novamente" variant="gradient" size="lg" fullWidth onPress={verificarAcessoAoCadastro} />
          )}
        </View>
      </View>
    );
  }

  // ─── Tela 0: Olá ────────────────────────────────────────────────────────────
  if (tela === 0) {
    return <Ola insets={insets} onStart={() => { vibrar('selecao'); irParaTela(1); }} />;
  }

  const oficio = oficioPorVertical(vertical);
  const total = totalRascunho(itens);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.topo, { paddingTop: insets.top + 12 }]}>
        <PressableAnimado onPress={voltar} haptic="selection" hitSlop={10} style={styles.voltar} accessibilityLabel="Voltar">
          <MaterialCommunityIcons name="chevron-left" size={26} color={cores.onSurface} />
        </PressableAnimado>
        <PontosProgresso total={TOTAL_TELAS} atual={tela} />
        <View style={styles.voltar} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ─── 1. SEU OFÍCIO ─────────────────────────────────────────── */}
        {tela === 1 && (
          <Aparecer key="oficio">
            <Text style={styles.title}>O que você faz?</Text>
            <PorQue texto="Isso liga o catálogo, o checklist e os documentos do seu ofício. Dá para mudar depois." />
            <View style={styles.grade} accessibilityRole="radiogroup">
              {OFICIOS_ONBOARDING.map((o, i) => (
                <CartaoOficio
                  key={o.vertical}
                  indice={i}
                  label={o.label}
                  icone={o.icone}
                  ativo={vertical === o.vertical}
                  onPress={() => { vibrar('selecao'); setVertical(o.vertical); setErroOficio(false); }}
                />
              ))}
            </View>
            {erroOficio ? <Text style={styles.fieldError}>Toque no seu ofício para seguir.</Text> : null}
          </Aparecer>
        )}

        {/* ─── 2. VOCÊ E A BASE ──────────────────────────────────────── */}
        {tela === 2 && (
          <Aparecer key="base">
            <Text style={styles.title}>Você e sua base</Text>
            <PorQue texto="Seu nome e o WhatsApp saem no orçamento. A cidade serve para a OLLI avisar se vai chover onde você trabalha." />

            <View style={styles.card}>
              <Text style={styles.segLabel}>Como você trabalha?</Text>
              <View style={styles.segRow} accessibilityRole="radiogroup">
                {([
                  { id: 'autonomo' as const, label: 'Autônomo', icon: 'account-hard-hat' },
                  { id: 'empresa' as const, label: 'Empresa com CNPJ', icon: 'domain' },
                ]).map(opcao => {
                  const ativo = base.tipoNegocio === opcao.id;
                  return (
                    <PressableAnimado
                      key={opcao.id}
                      style={[styles.segChip, ativo && styles.segChipActive]}
                      onPress={() => setCampo('tipoNegocio', opcao.id)}
                      haptic="selection"
                      accessibilityRole="radio"
                      accessibilityState={{ checked: ativo }}
                      accessibilityLabel={opcao.label}
                    >
                      <MaterialCommunityIcons name={opcao.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={16} color={ativo ? textoSobre(cores.accentLight) : cores.onSurfaceVariant} />
                      <Text style={[styles.segChipText, ativo && styles.segChipTextActive]}>{opcao.label}</Text>
                    </PressableAnimado>
                  );
                })}
              </View>
              {errors.tipoNegocio ? <Text style={styles.fieldError}>{errors.tipoNegocio}</Text> : null}

              <OlliInput label="Seu nome" required value={base.nomePrestador} error={errors.nomePrestador}
                onChangeText={v => setCampo('nomePrestador', v)} placeholder="Ex: João da Silva" leftIcon="account" />

              {base.tipoNegocio === 'empresa' ? (
                <>
                  <OlliInput label="CNPJ" required mask="cnpj" value={base.cnpj} error={errors.cnpj}
                    onChangeText={v => setCampo('cnpj', v)} placeholder="00.000.000/0001-00" leftIcon="domain" />
                  <PressableAnimado
                    onPress={buscarCnpj}
                    disabled={cnpjLoading}
                    haptic="selection"
                    style={styles.cnpjBtn}
                    accessibilityLabel="Preencher dados da empresa pelo CNPJ"
                  >
                    {cnpjLoading
                      ? <ActivityIndicator size="small" color={cores.accentLight} />
                      : <MaterialCommunityIcons name="magnify" size={16} color={cores.accentLight} />}
                    <Text style={styles.cnpjBtnText}>{cnpjLoading ? 'Buscando…' : 'Preencher pelo CNPJ'}</Text>
                  </PressableAnimado>
                  {cnpjInfo ? <Text style={styles.hint}>{cnpjInfo}</Text> : null}
                </>
              ) : null}

              <OlliInput
                label={base.tipoNegocio === 'empresa' ? 'Nome da empresa' : 'Nome do negócio (opcional)'}
                required={base.tipoNegocio === 'empresa'}
                value={base.nomeNegocio}
                error={errors.nomeNegocio}
                onChangeText={v => setCampo('nomeNegocio', v)}
                placeholder={base.tipoNegocio === 'empresa' ? 'Ex: Clima Frio Refrigeração' : 'Em branco, vale o seu nome'}
                leftIcon="store"
              />

              <OlliInput label="WhatsApp" required mask="phone" value={base.whatsapp} error={errors.whatsapp}
                onChangeText={v => setCampo('whatsapp', v)} placeholder="(11) 99999-9999" leftIcon="whatsapp" />

              <OlliInput label="CEP" mask="cep" value={end.cep}
                onChangeText={v => onCepChange(v, masked => setEnd(p => ({ ...p, cep: masked })))}
                placeholder="00000-000" leftIcon="map-marker-radius" containerStyle={{ marginBottom: Spacing.sm }} />
              <AvisoCep estado={estadoCep} endereco={enderecoCep} divergencias={divergencias} onUsarDoCep={usarDoCep} />

              <View style={styles.rowFields}>
                <OlliInput label="Cidade" required error={errors.cidade} value={base.cidade}
                  onChangeText={v => setCampo('cidade', v)} placeholder="São Paulo"
                  containerStyle={{ flex: 2, marginRight: 10, marginBottom: 0 }} />
                <OlliInput label="UF" required error={errors.estado} value={base.estado}
                  onChangeText={v => setCampo('estado', v.toUpperCase().slice(0, 2))}
                  autoCapitalize="characters" maxLength={2} placeholder="SP"
                  containerStyle={{ flex: 1, marginBottom: 0 }} />
              </View>
            </View>

            <PorQue icone="lock-outline" texto="Ninguém vai te ligar: o WhatsApp é para o seu cliente falar com você. Logo, Pix e endereço completo você coloca depois, em Meu Negócio." />
          </Aparecer>
        )}

        {/* ─── 3. SEU PRIMEIRO ORÇAMENTO ─────────────────────────────── */}
        {tela === 3 && (
          <Aparecer key="orcamento">
            <Text style={styles.title}>Seu primeiro orçamento</Text>
            <DicaDoRoteiro local="onboarding" style={{ marginBottom: Spacing.md }} />

            <View style={styles.card}>
              <View style={styles.orcTopo}>
                <View style={styles.orcIcone}>
                  <MaterialCommunityIcons name={(oficio?.icone ?? 'file-document-edit-outline') as keyof typeof MaterialCommunityIcons.glyphMap} size={22} color={cores.accentLight} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orcEyebrow}>{oficio?.label ?? 'Seu ofício'}</Text>
                  <Text style={styles.orcTitulo}>{itensIniciais(vertical).exemplo?.titulo ?? 'Orçamento'}</Text>
                </View>
              </View>

              <OlliInput
                label="Para quem é?"
                value={clienteNome}
                onChangeText={setClienteNome}
                placeholder="Nome do cliente"
                leftIcon="account-outline"
                containerStyle={{ marginBottom: Spacing.sm }}
              />
              <PressableAnimado
                style={styles.euMesmo}
                haptic="selection"
                onPress={() => setClienteNome(base.nomePrestador.trim())}
                accessibilityLabel="Usar meu nome, para ver como o cliente recebe"
              >
                <MaterialCommunityIcons name="account-arrow-right-outline" size={16} color={cores.accentLight} />
                <Text style={styles.euMesmoText}>Eu mesmo, para ver como o cliente recebe</Text>
              </PressableAnimado>

              {itens.map((item, i) => (
                <Aparecer key={`${item.nome}-${i}`} indice={i + 1}>
                  <View style={styles.item}>
                    <Text style={styles.itemNome} numberOfLines={2}>{item.nome}</Text>
                    <View style={styles.itemLinha}>
                      <Text style={styles.itemQtd}>{`${item.quantidade} ${item.unidade} ×`}</Text>
                      <OlliMoneyInput
                        value={item.preco}
                        onChangeValue={(n) => setItens(lista => lista.map((x, j) => (j === i ? { ...x, preco: n } : x)))}
                        containerStyle={{ flex: 1, marginBottom: 0 }}
                        accessibilityLabel={`Valor de ${item.nome}`}
                      />
                    </View>
                  </View>
                </Aparecer>
              ))}

              <View style={styles.totalLinha}>
                <Text style={styles.totalRotulo}>Total</Text>
                <ContadorAnimado valor={total} formato="brl" style={styles.totalValor} />
              </View>
              <Text style={styles.aviso}>{AVISO_EXEMPLO}</Text>
            </View>

            <Text style={styles.outroAppTitulo}>Vem de outro app ou planilha?</Text>
            <ConviteImportar onAbrir={() => { void concluir('importar'); }} />

            <PressableAnimado
              style={styles.depois}
              haptic="selection"
              onPress={() => { void concluir('inicio'); }}
              disabled={saving}
              accessibilityLabel="Agora não, ir para o início"
            >
              <Text style={styles.depoisText}>Agora não, ir para o início</Text>
            </PressableAnimado>
          </Aparecer>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 18 }]}>
        {tela === 3 ? (
          <OlliButton
            label="Revisar e enviar"
            variant="gradient" size="lg" fullWidth
            loading={saving}
            disabled={saving || itens.length === 0}
            onPress={() => { void concluir('orcamento'); }}
            icon={<MaterialCommunityIcons name="send" size={20} color={gradientes.sobreBrand} />}
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
    </KeyboardAvoidingView>
  );
}

/** A linha de "por quê" de cada tela (ícone + frase curta). */
function PorQue({ texto, icone = 'information-outline' }: { texto: string; icone?: keyof typeof MaterialCommunityIcons.glyphMap }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.porQue}>
      <MaterialCommunityIcons name={icone} size={15} color={cores.accentLight} />
      <Text style={styles.porQueText}>{texto}</Text>
    </View>
  );
}

/** Cartão grande de ofício: toque com escala (PressableAnimado) e o check entra com mola. */
function CartaoOficio({ label, icone, ativo, onPress, indice }: {
  label: string; icone: string; ativo: boolean; onPress: () => void; indice: number;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const reduzir = useReduzirMovimento();
  const marca = useSharedValue(ativo ? 1 : 0);
  useEffect(() => {
    marca.set(reduzir ? (ativo ? 1 : 0) : withSpring(ativo ? 1 : 0, MOLA.snappy));
  }, [ativo, reduzir, marca]);
  const estiloCheck = useAnimatedStyle(() => ({ opacity: marca.get(), transform: [{ scale: 0.6 + marca.get() * 0.4 }] }));
  return (
    <Aparecer indice={indice} style={styles.oficioCelula}>
      <PressableAnimado
        onPress={onPress}
        style={[styles.oficio, ativo && styles.oficioAtivo]}
        accessibilityRole="radio"
        accessibilityState={{ checked: ativo }}
        accessibilityLabel={label}
      >
        <View style={[styles.oficioIcone, ativo && { backgroundColor: cores.accentLight }]}>
          <MaterialCommunityIcons
            name={icone as keyof typeof MaterialCommunityIcons.glyphMap}
            size={28}
            color={ativo ? textoSobre(cores.accentLight) : cores.accentLight}
          />
        </View>
        <Text style={[styles.oficioLabel, ativo && { color: cores.onSurface }]} numberOfLines={2}>{label}</Text>
        <Animated.View style={[styles.oficioCheck, estiloCheck]}>
          <MaterialCommunityIcons name="check-circle" size={20} color={cores.accentLight} />
        </Animated.View>
      </PressableAnimado>
    </Aparecer>
  );
}

/** Progresso em pontos: o atual cresce (escala) e acende; só transform/opacity. */
function PontosProgresso({ total, atual }: { total: number; atual: number }) {
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.pontos} accessibilityRole="progressbar" accessibilityLabel={`Passo ${atual + 1} de ${total}`}>
      {NOMES_TELAS.slice(0, total).map((nome, i) => <Ponto key={nome} ativo={i === atual} feito={i < atual} />)}
    </View>
  );
}

function Ponto({ ativo, feito }: { ativo: boolean; feito: boolean }) {
  const styles = useEstilos(criarEstilos);
  const reduzir = useReduzirMovimento();
  const v = useSharedValue(ativo ? 1 : 0);
  useEffect(() => {
    v.set(reduzir ? (ativo ? 1 : 0) : withTiming(ativo ? 1 : 0, { duration: DURACAO.base, easing: curvas.standard }));
  }, [ativo, reduzir, v]);
  const estilo = useAnimatedStyle(() => ({ opacity: 0.35 + v.get() * 0.65, transform: [{ scaleX: 1 + v.get() * 1.6 }] }));
  return <Animated.View style={[styles.ponto, (ativo || feito) && styles.pontoAceso, estilo]} />;
}

/** Tela 0: a OLLI se apresenta (o mascote entra com mola; Aparecer escalona as linhas). */
function Ola({ onStart, insets }: { onStart: () => void; insets: { top: number; bottom: number } }) {
  const cores = useCores();
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);
  const reduzir = useReduzirMovimento();
  const entrada = useSharedValue(reduzir ? 1 : 0);
  useEffect(() => {
    if (!reduzir) entrada.set(withSpring(1, MOLA.gentle));
  }, [reduzir, entrada]);
  const estiloMascote = useAnimatedStyle(() => ({
    opacity: entrada.get(),
    transform: [{ scale: 0.7 + entrada.get() * 0.3 }, { rotate: `${(1 - entrada.get()) * -12}deg` }],
  }));
  const secundario = sobreSecundario(gradientes.sobrePrimary, gradientes.primary);
  return (
    <LinearGradient colors={gradientes.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.wcRoot}>
      <AuroraBackground cores={[cores.accent, cores.accentLight, cores.primaryLight, cores.accent]} intensidade={0.13} />
      <View style={{ height: insets.top + 10 }} />
      <View style={styles.wcCenter}>
        <Animated.View style={estiloMascote}>
          <OlliMascot size={104} onDark />
        </Animated.View>
        <Aparecer indice={1}>
          <Text style={[styles.wcHi, { color: gradientes.sobrePrimary }]}>Olá! Eu sou a OLLI</Text>
        </Aparecer>
        <Aparecer indice={2}>
          <Text style={[styles.wcSub, { color: secundario }]}>
            Em 3 passos seu primeiro orçamento fica pronto para mandar ao cliente.
          </Text>
        </Aparecer>
        <View style={styles.wcFeatures}>
          <WcFeature indice={3} icon="file-document-edit-outline" text="Os itens do seu ofício já vêm prontos" />
          <WcFeature indice={4} icon="link-variant" text="O cliente aprova pelo link, sem instalar nada" />
          <WcFeature indice={5} icon="database-import-outline" text="Vem de outro app? No final você traz seus dados" />
        </View>
      </View>
      <View style={[styles.wcFooter, { paddingBottom: insets.bottom + 18 }]}>
        <PressableAnimado style={styles.wcStart} onPress={onStart} haptic="selection" accessibilityLabel="Começar">
          <Text style={styles.wcStartText}>Começar</Text>
          <MaterialCommunityIcons name="arrow-right" size={20} color={cores.primaryDark} />
        </PressableAnimado>
      </View>
    </LinearGradient>
  );
}

function WcFeature({ icon, text, indice }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string; indice: number }) {
  const cores = useCores();
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);
  return (
    <Aparecer indice={indice}>
      <View style={styles.wcFeat}>
        <View style={styles.wcFeatIcon}>
          <MaterialCommunityIcons
            name={icon}
            size={18}
            color={cores.accent} // contraste-ok: gradientes.primary #0B6FCE→#042646 (marca, escuro e fixo nos dois modos) — accentLight cairia a 1.03:1 na ponta mais clara (2.45:1)
          />
        </View>
        <Text style={[styles.wcFeatText, { color: gradientes.sobrePrimary }]}>{text}</Text>
      </View>
    </Aparecer>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },

  verificationRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background, paddingHorizontal: Spacing.xl, gap: Spacing.lg },
  verificationCard: { width: '100%', maxWidth: 440, alignItems: 'center', backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.xl, ...sombrasDe(c).md },
  verificationTitle: { color: c.onSurface, fontSize: 21, fontWeight: '800', textAlign: 'center', marginTop: Spacing.base },
  verificationText: { color: c.onSurfaceVariant, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: Spacing.sm, marginBottom: Spacing.lg },

  // Tela 0 — vive inteira sobre gradientes.primary (colorido nos dois modos).
  wcRoot: { flex: 1, overflow: 'hidden' },
  wcCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  wcHi: { fontSize: 28, fontWeight: '800', marginTop: 22, textAlign: 'center', letterSpacing: 0 },
  wcSub: { fontSize: 16, textAlign: 'center', marginTop: 10, lineHeight: 23 },
  wcFeatures: { alignSelf: 'stretch', marginTop: 28, gap: 12 },
  wcFeat: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: comAlfa(c.accentLight, 0.25), borderRadius: BorderRadius.md, padding: 12 },
  wcFeatIcon: { width: 36, height: 36, borderRadius: BorderRadius.chip, backgroundColor: comAlfa(c.accentLight, 0.14), justifyContent: 'center', alignItems: 'center' },
  wcFeatText: { flex: 1, fontSize: 14, fontWeight: '600' },
  wcFooter: { paddingHorizontal: Spacing.base, paddingTop: 12 },
  wcStart: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.accentLight, borderRadius: 16, paddingVertical: 16, ...sombrasDe(c).glowCyan },
  wcStartText: { fontSize: 16, fontWeight: '800', color: c.primaryDark },

  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.sm, paddingBottom: 8 },
  voltar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pontos: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ponto: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.outline },
  pontoAceso: { backgroundColor: c.accentLight },

  title: { ...Typography.h1, color: c.onSurface, marginTop: Spacing.sm },
  hint: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 4, marginBottom: Spacing.md, lineHeight: 18 },
  porQue: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: Spacing.sm, marginBottom: Spacing.lg, paddingHorizontal: 2 },
  porQueText: { flex: 1, fontSize: 13.5, color: c.onSurfaceVariant, lineHeight: 19 },

  grade: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
  oficioCelula: { width: '50%', padding: 6 },
  oficio: {
    minHeight: 112, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: c.outline,
    backgroundColor: c.surface, padding: Spacing.md, justifyContent: 'space-between', ...sombrasDe(c).sm,
  },
  oficioAtivo: { borderColor: c.accentLight, backgroundColor: comAlfa(c.accentLight, 0.08) },
  oficioIcone: { width: 48, height: 48, borderRadius: BorderRadius.chip, alignItems: 'center', justifyContent: 'center', backgroundColor: comAlfa(c.accentLight, 0.12) },
  oficioLabel: { fontSize: 15, fontWeight: '700', color: c.onSurfaceVariant, marginTop: Spacing.sm },
  oficioCheck: { position: 'absolute', top: 10, right: 10 },

  card: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.base, ...sombrasDe(c).sm },
  rowFields: { flexDirection: 'row' },
  segLabel: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant, marginBottom: 8 },
  segRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.base },
  segChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: c.outline, backgroundColor: c.surfaceVariant },
  segChipActive: { backgroundColor: c.accentLight, borderColor: c.accentLight },
  segChipText: { fontSize: 13.5, fontWeight: '700', color: c.onSurfaceVariant },
  segChipTextActive: { color: textoSobre(c.accentLight) },
  fieldError: { color: c.danger, fontSize: 12.5, fontWeight: '600', marginTop: 4, marginBottom: Spacing.md },
  cnpjBtn: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: BorderRadius.md,
    backgroundColor: comAlfa(c.accent, 0.12), marginBottom: Spacing.md, marginTop: -4,
  },
  cnpjBtnText: { color: c.accentLight, fontWeight: '700', fontSize: 13 },

  orcTopo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: Spacing.base },
  orcIcone: { width: 44, height: 44, borderRadius: BorderRadius.chip, alignItems: 'center', justifyContent: 'center', backgroundColor: comAlfa(c.accentLight, 0.12) },
  orcEyebrow: { ...Typography.label, color: c.accentLight, textTransform: 'uppercase' },
  orcTitulo: { ...Typography.h3, color: c.onSurface, marginTop: 2 },
  euMesmo: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6, marginBottom: Spacing.md },
  euMesmoText: { fontSize: 13, fontWeight: '700', color: c.accentLight },
  item: { paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: c.outline },
  itemNome: { fontSize: 14, fontWeight: '700', color: c.onSurface, marginBottom: 6 },
  itemLinha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemQtd: { fontSize: 13, color: c.onSurfaceVariant, minWidth: 64 },
  totalLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: c.outline, paddingTop: Spacing.md, marginTop: Spacing.sm },
  totalRotulo: { ...Typography.h4, color: c.onSurfaceVariant },
  totalValor: { ...Typography.value, color: c.onSurface },
  aviso: { fontSize: 12, color: c.onSurfaceVariant, lineHeight: 17, marginTop: Spacing.sm },

  outroAppTitulo: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  depois: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16, marginTop: Spacing.base },
  depoisText: { fontSize: 14, fontWeight: '700', color: c.onSurfaceVariant },

  footer: { paddingHorizontal: Spacing.base, paddingTop: 12, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
});
