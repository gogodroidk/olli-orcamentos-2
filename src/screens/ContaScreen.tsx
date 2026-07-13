import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, ActivityIndicator, TouchableOpacity, Switch, Modal, RefreshControl, Animated, TextInput, Image } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, textoSobre, comAlfa, type Cores } from '../theme';
import { OlliButton } from '../components/OlliButton';
import { OlliMascot } from '../components/OlliMascot';
import { OlliPressable } from '../components/OlliPressable';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { SeletorTema } from '../components/SeletorTema';
import { useTipoConta, recarregarTipoConta } from '../hooks/useTipoConta';
import { usePermissao } from '../hooks/usePermissao';
import { usePlano } from '../hooks/usePlano';
import { useVerticais } from '../hooks/useVerticais';
import type { VerticalId } from '../services/verticais';
import { salvarFotoPerfil, removerFotoPerfil, excluirConta } from '../services/conta';
import { estaAtiva, ligarAjuda, desligarAjuda, resetarAjuda } from '../services/onboarding';
import { adicionarFotoCamera, adicionarFotoGaleria, abrirConfiguracoesPermissao } from '../utils/fotosOrcamento';
import { criarOrganizacao, aceitarConvite, extrairToken, PAPEL_LABEL } from '../services/equipe';
import { navigationRef } from '../navigation/navigationRef';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Empresa, SEGMENTOS } from '../types';
import { getEmpresa, clearAllLocalData } from '../database/database';

import { isSupabaseConfigured, signOut, getCurrentUser } from '../services/supabase';
import {
  backupManualVersionado,
  getUltimoBackupVersionadoData,
  listBackupsVersionados,
  restoreBackupById,
  BackupVersionadoResumo,
} from '../services/backup';
import { abortarSyncEmAndamento, onSyncAplicado } from '../services/cloudSync';
import { formatDateTime } from '../utils/date';
import { AUTO_BACKUP_TOGGLE_KEY } from '../services/storageKeys';

/** Rótulo em PT-BR do tipo de backup versionado, para a lista de cópias. */
const TIPO_BACKUP_LABEL: Record<BackupVersionadoResumo['tipo'], string> = {
  diario: 'Automático (diário)',
  semanal: 'Automático (semanal)',
  manual: 'Manual',
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Pill discreto "Sincronizando..." — some com fade sozinho depois de exibido.
 * Dá feedback visual de que a tela está de fato conectada à nuvem quando o
 * `onSyncAplicado` recarrega os dados em segundo plano.
 */
function SincronizandoPill({ onDone, top = 8 }: { onDone: () => void; top?: number }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(900),
      Animated.timing(opacity, { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) onDone(); });
  }, [opacity]);

  return (
    <Animated.View pointerEvents="none" style={[styles.syncPill, { top, opacity }]}>
      <MaterialCommunityIcons name="cloud-sync-outline" size={13} color={cores.accentLight} />
      <Text style={styles.syncPillText}>Sincronizando...</Text>
    </Animated.View>
  );
}

/** Formata um telefone em dígitos (com DDI 55) para exibição amigável: +55 (11) 99999-9999. */
function formatarTelefoneExibicao(digits: string): string {
  const d = (digits ?? '').replace(/\D/g, '');
  const semDdi = d.startsWith('55') && (d.length === 12 || d.length === 13) ? d.slice(2) : d;
  if (semDdi.length === 11) return `(${semDdi.slice(0, 2)}) ${semDdi.slice(2, 7)}-${semDdi.slice(7)}`;
  if (semDdi.length === 10) return `(${semDdi.slice(0, 2)}) ${semDdi.slice(2, 6)}-${semDdi.slice(6)}`;
  return digits;
}

/** Dados do usuário logado que a tela exibe (do Supabase Auth / user_metadata). */
interface PerfilUsuario {
  email?: string;
  nome?: string;
  telefone?: string;
  /** Foto de perfil do usuário (user_metadata.avatar_url) — distinta da logo da empresa. */
  avatarUrl?: string;
}

/** Rótulo pt-BR do plano, para o card discreto "Sua assinatura" de quem já paga. */
const PLANO_LABEL: Record<'gratis' | 'pro' | 'empresa', string> = {
  gratis: 'Grátis',
  pro: 'Pro',
  empresa: 'Empresa',
};

/** Metadados de uma ferramenta listada em Conta (ver `criarFerramentas`). */
interface Ferramenta {
  key: string;
  icon: string;
  label: string;
  desc: string;
  color: string;
  route: keyof RootStackParamList;
  /**
   * Mesmo critério de SidebarNav.tsx (ITENS_PRINCIPAIS): itens de dono do
   * catálogo/financeiro que o menu enxuto do técnico não deve mostrar. Sem
   * isso o técnico chegava a Serviços/Produtos/Recibos/Meu Negócio por esta
   * lista mesmo com a sidebar escondendo os mesmos itens.
   */
  ocultarTecnico?: boolean;
  /** Ferramenta de HVAC (diagnóstico/códigos de ar-condicionado). Some para quem
   *  definiu outra vertical no ofício. Ver src/hooks/useVerticais.ts. */
  verticalHvac?: boolean;
  /** Ferramenta ÚNICA de um ofício (ex.: calculadora de tinta → 'pintura'). Só
   *  aparece para quem tem essa vertical. Genérico, sucessor do verticalHvac. */
  vertical?: VerticalId;
}

// Ferramentas que JÁ existem no app (todas no stack). Só listamos o que funciona de verdade.
// Função (não array de módulo) porque as cores vêm da paleta atual — um array
// fixo congelaria as cores no import, como o resto desta migração evita.
function criarFerramentas(c: Cores): Ferramenta[] {
  return [
    { key: 'olliVoz', icon: 'microphone', label: 'OLLI por voz', desc: 'Monte orçamentos falando', color: c.accentLight, route: 'OlliVoz' },
    { key: 'olliChat', icon: 'chat-processing-outline', label: 'Chat com a OLLI', desc: 'Sua assistente técnica', color: c.primaryLight, route: 'OlliChat' },
    { key: 'servicos', icon: 'wrench-outline', label: 'Catálogo de serviços', desc: 'Serviços e preços', color: c.primary, route: 'Servicos', ocultarTecnico: true },
    { key: 'produtos', icon: 'package-variant-closed', label: 'Produtos e peças', desc: 'Materiais e estoque', color: c.primary, route: 'Produtos', ocultarTecnico: true },
    { key: 'clientes', icon: 'account-group-outline', label: 'Clientes', desc: 'Sua base de clientes', color: '#A78BFA', route: 'Clientes' },
    { key: 'erro', icon: 'card-search-outline', label: 'Códigos de erro', desc: 'Diagnóstico · OLLI Técnica', color: c.accentLight, route: 'Diagnostico', verticalHvac: true },
    { key: 'tinta', icon: 'format-paint', label: 'Calculadora de tinta', desc: 'Litros e latas pela área', color: '#F7B23B', route: 'CalculadoraTinta', vertical: 'pintura' },
    { key: 'anvisa', icon: 'file-certificate-outline', label: 'Certificado ANVISA', desc: 'Comprovante RDC 52 de dedetização', color: c.success, route: 'CertificadoAnvisa', vertical: 'dedetizacao' },
    { key: 'recibo', icon: 'receipt', label: 'Recibos', desc: 'Emita recibos de pagamento', color: c.success, route: 'EmitirRecibo', ocultarTecnico: true },
    { key: 'negocio', icon: 'storefront-outline', label: 'Personalizar', desc: 'Seu negócio, logo e marca', color: '#F7B23B', route: 'MeuNegocio', ocultarTecnico: true },
    { key: 'modelos', icon: 'palette-swatch-outline', label: 'Modelos de documento', desc: 'O visual dos seus orçamentos', color: c.accentLight, route: 'ModelosDocumento', ocultarTecnico: true },
  ];
}

export default function ContaScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const configured = isSupabaseConfigured();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  // Onda 2 — tipo de conta (pessoal vs empresa) e permissão de gerenciar equipe.
  const { tipo, org, carregando: carregandoConta } = useTipoConta();
  const { pode, papel, carregando: carregandoPermissao } = usePermissao();
  const { mostraHvac, mostraVertical } = useVerticais();
  // Fail-closed: enquanto o papel ainda carrega, trata como se pudesse ser
  // técnico — evita o flash de um item de dono (Serviços/Produtos/Recibos/
  // Meu Negócio) antes da permissão real chegar.
  const FERRAMENTAS = criarFerramentas(cores);
  const ferramentasVisiveis = FERRAMENTAS.filter(
    (f) =>
      !(f.ocultarTecnico && (papel === 'tecnico' || carregandoPermissao)) &&
      !(f.verticalHvac && !mostraHvac) &&
      !(f.vertical && !mostraVertical(f.vertical)),
  );
  // Frente 2 — plano atual: pagante não vê propaganda; vê "Sua assinatura".
  const { plano } = usePlano();
  const [showCriarEmpresa, setShowCriarEmpresa] = useState(false);
  const [showEntrarEquipe, setShowEntrarEquipe] = useState(false);

  // Frente 2 — foto de perfil (identidade do usuário) e exclusão de conta.
  const [avatarErro, setAvatarErro] = useState(false);
  const [showFotoOpcoes, setShowFotoOpcoes] = useState(false);
  const [salvandoFoto, setSalvandoFoto] = useState(false);
  const [showExcluir, setShowExcluir] = useState(false);

  const [user, setUser] = useState<PerfilUsuario | null>(null);
  // Sessão perdida DENTRO das Tabs (só deveria acontecer com sessão corrompida/
  // expirada). Dispara o guarda defensivo "Sessão expirada".
  const [sessaoPerdida, setSessaoPerdida] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [autoBackupAtivo, setAutoBackupAtivo] = useState(true);
  // Toggle "Mostrar dicas contextuais" (onboarding.ts) — carregado no foco.
  const [ajudaAtiva, setAjudaAtiva] = useState(true);
  const [showBackups, setShowBackups] = useState(false);
  const [backups, setBackups] = useState<BackupVersionadoResumo[]>([]);
  const [carregandoBackups, setCarregandoBackups] = useState(false);
  const [restaurandoId, setRestaurandoId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  const load = useCallback(async () => {
    const emp = await getEmpresa();
    setEmpresa(emp);
    try {
      const toggle = await AsyncStorage.getItem(AUTO_BACKUP_TOGGLE_KEY);
      setAutoBackupAtivo(toggle !== '0');
    } catch { /* best-effort: mantém o default (ativo) */ }
    // Estado da Central de Ajuda/dicas (estaAtiva nunca lança — default: ligada).
    setAjudaAtiva(await estaAtiva());
    if (configured) {
      const u = await getCurrentUser();
      if (u) {
        const meta = (u.user_metadata ?? {}) as Record<string, any>;
        setUser({
          email: u.email,
          nome: typeof meta.full_name === 'string' ? meta.full_name : undefined,
          telefone: typeof meta.telefone === 'string' ? meta.telefone : undefined,
          avatarUrl: typeof meta.avatar_url === 'string' && meta.avatar_url ? meta.avatar_url : undefined,
        });
        setAvatarErro(false);
        setSessaoPerdida(false);
        setLastBackup(await getUltimoBackupVersionadoData());
      } else {
        // Dentro das Tabs SEMPRE há sessão. Se caiu aqui sem usuário, a sessão
        // expirou/corrompeu — mostra o guarda defensivo em vez de um form de login.
        setUser(null);
        setSessaoPerdida(true);
        setLastBackup(null);
      }
    }
    setCarregando(false);
  }, [configured]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Recarrega quando um sync com a nuvem terminar (ex.: login recém-feito
  // trazendo backup/negócio atualizados que ainda não existiam localmente).
  useEffect(() => onSyncAplicado(() => { setSincronizando(true); load(); }), [load]);

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  async function handleBackup() {
    setBusy(true);
    try {
      const when = await backupManualVersionado();
      setLastBackup(when);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Backup feito!', 'Seus dados estão seguros na nuvem.');
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Erro', e?.message ?? 'Falha ao fazer backup.');
    }
    setBusy(false);
  }

  /** Liga/desliga o backup automático (respeitado por services/autoBackup.ts). Persistido de imediato. */
  async function handleToggleAutoBackup(v: boolean) {
    Haptics.selectionAsync().catch(() => {});
    setAutoBackupAtivo(v);
    try {
      await AsyncStorage.setItem(AUTO_BACKUP_TOGGLE_KEY, v ? '1' : '0');
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar essa preferência agora.');
      setAutoBackupAtivo(!v);
    }
  }

  /** Liga/desliga as dicas contextuais (onboarding.ts). Otimista. */
  async function handleToggleAjuda(v: boolean) {
    Haptics.selectionAsync().catch(() => {});
    setAjudaAtiva(v);
    // ligar/desligarAjuda são best-effort e nunca lançam (persistem em AsyncStorage).
    if (v) await ligarAjuda();
    else await desligarAjuda();
  }

  /** "Rever apresentação e dicas": religa a ajuda, esquece dicas vistas e refaz o onboarding. */
  async function handleReverApresentacao() {
    Haptics.selectionAsync().catch(() => {});
    await resetarAjuda();
    setAjudaAtiva(true); // resetarAjuda religa a Central de Ajuda
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Alert.alert(
      'Tudo pronto!',
      'A apresentação e as dicas vão aparecer de novo na próxima vez que você abrir o app.',
    );
  }

  /** Abre o modal "Ver cópias de segurança" e carrega a lista da nuvem. */
  async function handleAbrirBackups() {
    Haptics.selectionAsync().catch(() => {});
    setShowBackups(true);
    setCarregandoBackups(true);
    try {
      setBackups(await listBackupsVersionados());
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível carregar as cópias de segurança.');
    }
    setCarregandoBackups(false);
  }

  /** Restaura uma cópia específica da lista, com confirmação dupla (é destrutivo). */
  function handleRestaurarBackup(item: BackupVersionadoResumo) {
    Alert.alert(
      'Restaurar esta cópia?',
      `Isso vai SUBSTITUIR os dados atuais deste aparelho pelos da cópia de ${formatDateTime(item.criadoEm)} (${TIPO_BACKUP_LABEL[item.tipo]}). Essa ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar', style: 'destructive',
          onPress: () => {
            // Confirmação DUPLA: a primeira já avisa a substituição; a segunda
            // reforça que é definitivo antes de tocar nos dados do aparelho.
            Alert.alert(
              'Tem certeza?',
              'Todos os orçamentos, clientes, produtos e serviços salvos neste aparelho agora serão substituídos pelos dessa cópia. Não é possível desfazer.',
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Restaurar', style: 'destructive',
                  onPress: async () => {
                    setRestaurandoId(item.id);
                    try {
                      const when = await restoreBackupById(item.id);
                      setShowBackups(false);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                      Alert.alert('Restaurado!', `Dados da cópia de ${formatDateTime(when)} aplicados.`);
                      await load();
                    } catch (e: any) {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
                      Alert.alert('Erro', e?.message ?? 'Falha ao restaurar essa cópia.');
                    }
                    setRestaurandoId(null);
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }

  function handleLogout() {
    Haptics.selectionAsync().catch(() => {});
    Alert.alert(
      'Sair da conta',
      'O que você quer fazer com os dados salvos neste aparelho?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair e manter dados neste aparelho',
          onPress: async () => {
            setBusy(true);
            try {
              // Apenas signOut: o reset da navegação para 'Entrar' vem do listener
              // global do App.tsx (evento SIGNED_OUT). Não resetamos aqui para não
              // competir com ele (corrida de navegação).
              await signOut();
            } catch (e: any) {
              Alert.alert('Erro', e?.message ?? 'Não foi possível sair agora.');
            }
            setBusy(false);
          },
        },
        {
          text: 'Sair e apagar dados deste aparelho',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Tem certeza?',
              'Isso vai APAGAR todos os orçamentos, clientes, produtos e serviços salvos neste aparelho. Essa ação não pode ser desfeita. Seus dados na nuvem (se houver backup) não são afetados.',
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Apagar e sair', style: 'destructive',
                  onPress: async () => {
                    setBusy(true);
                    try {
                      // Interrompe qualquer sync em segundo plano ANTES de apagar:
                      // sem isso, um pull que já buscou dados da nuvem pode gravá-los
                      // de volta no SQLite logo depois do wipe, deixando sobras da
                      // conta anterior num aparelho que deveria estar limpo.
                      abortarSyncEmAndamento();
                      // Wipe ANTES do signOut: o SIGNED_OUT reseta para a Entrar,
                      // que checa dados locais no mount — com a ordem invertida o
                      // banner de migracao apareceria para quem acabou de apagar.
                      await clearAllLocalData();
                      await signOut();
                      setEmpresa(null);
                      // O reset para 'Entrar' vem do listener global (SIGNED_OUT).
                    } catch (e: any) {
                      Alert.alert('Erro', e?.message ?? 'Não foi possível apagar os dados agora.');
                    }
                    setBusy(false);
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }

  function abrirFerramenta(f: Ferramenta) {
    Haptics.selectionAsync().catch(() => {});
    if (f.route === 'EmitirRecibo') nav.navigate('EmitirRecibo', {});
    else nav.navigate(f.route as never);
  }

  /**
   * Escolhe a foto de perfil (câmera ou galeria) reusando o pipeline de fotos
   * (compressão + cópia persistente) e salva a URI em user_metadata.avatar_url.
   * A foto de perfil é do USUÁRIO — a logo/identidade da empresa fica em Meu Negócio.
   */
  async function handleEscolherFoto(fonte: 'camera' | 'galeria') {
    setShowFotoOpcoes(false);
    setSalvandoFoto(true);
    try {
      const resultado = fonte === 'camera'
        ? await adicionarFotoCamera([])
        : await adicionarFotoGaleria([]);

      if (resultado.erro === 'PERMISSAO_NEGADA_PERMANENTE') {
        Alert.alert(
          fonte === 'camera' ? 'Câmera bloqueada' : 'Fotos bloqueadas',
          'Libere o acesso nas configurações do aparelho para escolher sua foto.',
          [
            { text: 'Agora não', style: 'cancel' },
            { text: 'Abrir configurações', onPress: () => { abrirConfiguracoesPermissao(); } },
          ],
        );
        return;
      }
      if (resultado.erro) {
        Alert.alert('Ops', resultado.erro);
        return;
      }
      const uri = resultado.uris[0];
      if (!uri) return; // usuário cancelou o picker

      await salvarFotoPerfil(uri);
      setUser(prev => (prev ? { ...prev, avatarUrl: uri } : prev));
      setAvatarErro(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Erro', e?.message ?? 'Não foi possível salvar sua foto agora.');
    } finally {
      setSalvandoFoto(false);
    }
  }

  /** Remove a foto de perfil (volta a usar a logo da empresa, ou a inicial). */
  async function handleRemoverFoto() {
    setShowFotoOpcoes(false);
    setSalvandoFoto(true);
    try {
      await removerFotoPerfil();
      setUser(prev => (prev ? { ...prev, avatarUrl: undefined } : prev));
      setAvatarErro(false);
      Haptics.selectionAsync().catch(() => {});
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível remover sua foto agora.');
    } finally {
      setSalvandoFoto(false);
    }
  }

  /**
   * Executa a exclusão da conta (já com dupla confirmação: o usuário digitou
   * 'EXCLUIR' no modal e confirma neste Alert final). Ao concluir, o serviço faz
   * logout local + wipe do SQLite; o reset da navegação vem do listener global.
   */
  function confirmarExclusaoFinal() {
    Alert.alert(
      'Excluir a conta agora?',
      'Esta é a última confirmação. Sua conta e todos os dados serão apagados para sempre. Não há como desfazer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir para sempre',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const res = await excluirConta();
              if (!res.ok) {
                const msg =
                  res.motivo === 'nao_configurado'
                    ? 'A exclusão online ainda não foi configurada. Fale com o suporte.'
                    : res.motivo === 'sem_login'
                      ? 'Sua sessão expirou. Entre de novo e tente outra vez.'
                      : res.motivo === 'rede'
                        ? 'Sem conexão agora. Verifique a internet e tente novamente.'
                        : res.motivo === 'falha_cancelamento'
                          // O servidor não apagou NADA de propósito: apagar a conta com a
                          // assinatura viva deixaria o cartão sendo cobrado sem nenhuma
                          // conta pela qual cancelar. O usuário precisa saber que está
                          // seguro para tentar de novo.
                          ? 'Não consegui cancelar sua assinatura agora, então não apaguei nada. Sua conta e sua cobrança seguem como estavam. Tente de novo em alguns minutos.'
                          : 'Não foi possível excluir a conta agora. Tente novamente em instantes.';
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
                Alert.alert('Não deu', msg);
                setBusy(false);
                return;
              }
              // Sucesso: o SIGNED_OUT (logout local no serviço) reseta a navegação
              // para 'Entrar'. Fecha o modal por garantia; a tela será desmontada.
              setShowExcluir(false);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            } catch (e: any) {
              Alert.alert('Erro', e?.message ?? 'Falha ao excluir a conta.');
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  const primeiroNome = user?.nome?.split(' ')[0] || empresa?.nomePrestador?.split(' ')[0] || 'prestador';
  const nomeExibido = user?.nome || empresa?.nomePrestador || 'Seu nome';
  const segmentoLabel = SEGMENTOS.find(s => s.id === empresa?.segmento)?.label;

  // Foto do avatar: prioridade para a foto de perfil do usuário; se não houver
  // (ou falhar ao carregar — URI local pode não existir em outro aparelho), usa
  // a logo da empresa (regra do produto); por fim, a inicial do nome.
  const avatarUri = (!avatarErro && user?.avatarUrl) ? user.avatarUrl : (empresa?.logoUri || null);
  const temAssinaturaPaga = plano !== 'gratis';

  // GUARDA DEFENSIVO: sessão expirada dentro das Tabs → botão para voltar à porta.
  if (sessaoPerdida) {
    return (
      <View style={[styles.container, styles.guardWrap, { paddingTop: insets.top + 40 }]}>
        <OlliMascot size={64} onDark />
        <Text style={styles.guardTitle}>Sessão expirada</Text>
        <Text style={styles.guardText}>
          Sua sessão terminou. Entre de novo para continuar usando o backup, a nuvem e a OLLI.
        </Text>
        <OlliButton
          label="Entrar de novo"
          variant="gradient" size="lg" fullWidth
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            if (navigationRef.isReady()) navigationRef.reset({ index: 0, routes: [{ name: 'Entrar' }] });
          }}
          icon={<MaterialCommunityIcons name="login" size={20} color="#fff" />}
          style={{ marginTop: Spacing.lg, alignSelf: 'stretch' }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {sincronizando && <SincronizandoPill onDone={() => setSincronizando(false)} top={insets.top + 8} />}
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={cores.accentLight} colors={[cores.accentLight]} />}
      >
        <View style={styles.headRow}>
          <Text style={styles.screenTitle}>Conta</Text>
          <OlliMascot size={34} onDark />
        </View>

        {carregando ? (
          // Skeleton coerente com o layout real: cartão de perfil + faixa PRO +
          // linhas de ferramentas — evita a tela "piscar" de vazia pra cheia.
          <>
            <View style={[styles.profileCard, { marginBottom: Spacing.base }]}>
              <OlliSkeleton width={56} height={56} radius={18} />
              <View style={{ flex: 1, marginLeft: 14, gap: 8 }}>
                <OlliSkeleton width="55%" height={16} />
                <OlliSkeleton width="70%" height={12} />
                <OlliSkeleton width="35%" height={12} />
              </View>
            </View>
            <View style={[styles.proCard, { marginTop: 0 }]}>
              <OlliSkeleton width="40%" height={14} />
              <OlliSkeleton width="80%" height={13} style={{ marginTop: 12 }} />
              <OlliSkeleton width="95%" height={12} style={{ marginTop: 8 }} />
            </View>
            <View style={[styles.toolsCard, { marginTop: Spacing.lg }]}>
              {[0, 1, 2].map(i => (
                <View key={i} style={[styles.toolRow, i < 2 && styles.toolDivider]}>
                  <OlliSkeleton width={40} height={40} radius={12} />
                  <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                    <OlliSkeleton width="50%" height={14} />
                    <OlliSkeleton width="72%" height={12} />
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : (
        <>
        {/* CARD DE PERFIL (nome/e-mail/telefone do usuário logado) */}
        <AnimatedEntrance index={0}>
          <OlliPressable style={styles.profileCard} scaleTo={0.98} accessibilityLabel="Editar perfil e negócio" onPress={() => nav.navigate('MeuNegocio')}>
            <TouchableOpacity
              style={styles.avatar}
              activeOpacity={0.85}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowFotoOpcoes(true); }}
              disabled={salvandoFoto}
              accessibilityRole="button"
              accessibilityLabel="Trocar foto de perfil"
            >
              {salvandoFoto ? (
                <ActivityIndicator color={cores.accentLight} />
              ) : avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={styles.avatarImg}
                  onError={() => setAvatarErro(true)}
                />
              ) : (
                <Text style={styles.avatarText}>{primeiroNome.charAt(0).toUpperCase()}</Text>
              )}
              <View style={styles.avatarBadge}>
                <MaterialCommunityIcons name="camera" size={12} color={textoSobre(cores.accentLight)} />
              </View>
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.profileName} numberOfLines={1}>{nomeExibido}</Text>
              {user?.email ? <Text style={styles.profileCompany} numberOfLines={1}>{user.email}</Text> : null}
              {user?.telefone ? (
                <Text style={styles.profilePhone} numberOfLines={1}>
                  {formatarTelefoneExibicao(user.telefone)}
                </Text>
              ) : null}
              {segmentoLabel ? (
                <View style={styles.segChip}>
                  <Text style={styles.segChipText}>{segmentoLabel}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.editBtn}>
              <MaterialCommunityIcons name="pencil-outline" size={16} color={cores.accentLight} />
              <Text style={styles.editBtnText}>editar</Text>
            </View>
          </OlliPressable>
          <Text style={styles.identidadeHint}>
            Toque na foto para trocar a <Text style={styles.identidadeHintForte}>sua foto de perfil</Text>. A logo e a identidade visual da empresa (que aparecem nos PDFs) ficam em{' '}
            <Text style={styles.identidadeLink} onPress={() => { Haptics.selectionAsync().catch(() => {}); nav.navigate('MeuNegocio'); }}>Meu Negócio</Text>.
          </Text>
        </AnimatedEntrance>

        {/* ASSINATURA — pagante vê um card discreto "Sua assinatura"; grátis vê o
            convite para conhecer os planos (sem propaganda para quem já paga). */}
        <AnimatedEntrance index={1}>
          {temAssinaturaPaga ? (
            <OlliPressable
              style={styles.assinaturaCard}
              haptic={false}
              scaleTo={0.98}
              accessibilityLabel="Ver sua assinatura"
              onPress={() => { Haptics.selectionAsync().catch(() => {}); nav.navigate('Assinatura' as never); }}
            >
              <View style={styles.assinaturaIcon}>
                <MaterialCommunityIcons name="check-decagram" size={20} color={cores.accentLight} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.assinaturaTitle}>Sua assinatura</Text>
                <Text style={styles.assinaturaSub}>Plano {PLANO_LABEL[plano]} · faturas, cobrança e cancelamento</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceMuted} />
            </OlliPressable>
          ) : (
            <View style={styles.proCard}>
              <View style={styles.proHead}>
                <View style={styles.proBadge}>
                  <MaterialCommunityIcons name="crown-outline" size={16} color={textoSobre(cores.accentLight)} />
                  <Text style={styles.proBadgeText}>OLLI PRO</Text>
                </View>
                <View style={styles.soonPill}><Text style={styles.soonPillText}>R$ 39/mês</Text></View>
              </View>
              <Text style={styles.proTitle}>Leve o seu negócio ao próximo nível</Text>
              <Text style={styles.proSub}>Relatórios avançados, metas de vendas e suporte prioritário. Assine direto no app — mensal ou anual com desconto.</Text>
              <OlliPressable
                style={styles.proBtn}
                haptic={false}
                scaleTo={0.97}
                accessibilityLabel="Ver planos e assinar"
                onPress={() => { Haptics.selectionAsync().catch(() => {}); nav.navigate('Planos'); }}
              >
                <Text style={styles.proBtnText}>Ver planos e assinar</Text>
                <MaterialCommunityIcons name="arrow-right" size={16} color={cores.accentLight} />
              </OlliPressable>
            </View>
          )}
        </AnimatedEntrance>

        {/* EMPRESA / EQUIPE (Onda 2) — só quando a nuvem está configurada. */}
        {configured && !carregandoConta && (
          <AnimatedEntrance index={2}>
            {tipo === 'empresa' && org ? (
              <View style={styles.empresaCard}>
                <View style={styles.empresaHead}>
                  <View style={styles.empresaIcon}>
                    <MaterialCommunityIcons name="office-building-outline" size={18} color={cores.accentLight} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.empresaNome} numberOfLines={1}>{org.nome}</Text>
                    <Text style={styles.empresaPapel}>Você é {PAPEL_LABEL[org.papel]}</Text>
                  </View>
                </View>
                {pode('ver_equipe') && (
                  <OlliPressable
                    style={styles.empresaBtn}
                    haptic={false}
                    accessibilityLabel="Gerenciar equipe"
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); nav.navigate('Equipe'); }}
                  >
                    <MaterialCommunityIcons name="account-group-outline" size={18} color={cores.accentLight} />
                    <Text style={styles.empresaBtnText}>Gerenciar equipe</Text>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={cores.onSurfaceMuted} />
                  </OlliPressable>
                )}
              </View>
            ) : (
              <View style={styles.empresaCard}>
                <View style={styles.empresaHead}>
                  <View style={styles.empresaIcon}>
                    <MaterialCommunityIcons name="account-group-outline" size={18} color={cores.accentLight} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.empresaNome}>Trabalha com uma equipe?</Text>
                    <Text style={styles.empresaPapel}>Crie a conta empresa e convide seus técnicos</Text>
                  </View>
                </View>
                <OlliPressable
                  style={styles.empresaBtn}
                  haptic={false}
                  accessibilityLabel="Criar conta empresa"
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowCriarEmpresa(true); }}
                >
                  <MaterialCommunityIcons name="rocket-launch-outline" size={18} color={cores.accentLight} />
                  <Text style={styles.empresaBtnText}>Criar conta empresa</Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={cores.onSurfaceMuted} />
                </OlliPressable>
                <OlliPressable
                  style={[styles.empresaBtn, styles.empresaBtnGhost]}
                  haptic={false}
                  scaleTo={0.98}
                  accessibilityLabel="Tenho um código de convite"
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowEntrarEquipe(true); }}
                >
                  <MaterialCommunityIcons name="ticket-confirmation-outline" size={18} color={cores.onSurfaceVariant} />
                  <Text style={styles.empresaBtnGhostText}>Tenho um código de convite</Text>
                </OlliPressable>
              </View>
            )}
          </AnimatedEntrance>
        )}

        {/* FERRAMENTAS */}
        <AnimatedEntrance index={3}>
          <Text style={styles.sectionTitle}>Ferramentas</Text>
          <View style={styles.toolsCard}>
            {ferramentasVisiveis.map((f, i) => (
              <OlliPressable
                key={f.key}
                style={[styles.toolRow, i < ferramentasVisiveis.length - 1 && styles.toolDivider]}
                onPress={() => abrirFerramenta(f)}
                haptic={false}
                scaleTo={0.985}
                accessibilityLabel={f.label}
              >
                <View style={[styles.toolIcon, { backgroundColor: f.color + '1E', borderColor: f.color + '3A' }]}>
                  <MaterialCommunityIcons name={f.icon as any} size={20} color={f.color === cores.accent ? cores.accentLight : f.color} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.toolLabel}>{f.label}</Text>
                  <Text style={styles.toolDesc}>{f.desc}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceMuted} />
              </OlliPressable>
            ))}
          </View>
        </AnimatedEntrance>

        {/* APARÊNCIA — modo claro/escuro e cor da marca. O app abre SEMPRE no claro
            (TemaProvider não lê `useColorScheme()` de propósito); esta é a única porta
            para o escuro. As 12 cores oferecidas passam pelo gate `check:contraste`. */}
        <AnimatedEntrance index={4}>
          <Text style={styles.sectionTitle}>Aparência</Text>
          <View style={styles.blocoAparencia}>
            <SeletorTema />
          </View>
        </AnimatedEntrance>

        {/* AJUDA E PREFERÊNCIAS — suporte, lixeira (gestão) e controle das dicas. */}
        <AnimatedEntrance index={5}>
          <Text style={styles.sectionTitle}>Ajuda e preferências</Text>
          <View style={styles.toolsCard}>
            {/* Ajuda e suporte — disponível para todos os papéis. */}
            <OlliPressable
              style={[styles.toolRow, styles.toolDivider]}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); nav.navigate('Ajuda'); }}
              haptic={false}
              scaleTo={0.985}
              accessibilityLabel="Ajuda e suporte"
            >
              <View style={[styles.toolIcon, { backgroundColor: cores.accent + '1E', borderColor: cores.accent + '3A' }]}>
                <MaterialCommunityIcons name="help-circle-outline" size={20} color={cores.accentLight} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.toolLabel}>Ajuda e suporte</Text>
                <Text style={styles.toolDesc}>Dúvidas, tutoriais e falar com a gente</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceMuted} />
            </OlliPressable>

            {/* Lixeira — ação de GESTÃO: o técnico não vê. */}
            {papel !== 'tecnico' && (
              <OlliPressable
                style={[styles.toolRow, styles.toolDivider]}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); nav.navigate('Lixeira'); }}
                haptic={false}
                scaleTo={0.985}
                accessibilityLabel="Lixeira"
              >
                <View style={[styles.toolIcon, { backgroundColor: cores.onSurfaceVariant + '1E', borderColor: cores.onSurfaceVariant + '3A' }]}>
                  <MaterialCommunityIcons name="delete-outline" size={20} color={cores.onSurfaceVariant} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.toolLabel}>Lixeira</Text>
                  <Text style={styles.toolDesc}>Recupere itens excluídos nos últimos 30 dias</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceMuted} />
              </OlliPressable>
            )}

            {/* Toggle "Mostrar dicas contextuais" — só controla DicaContextual (onboarding.ts);
                a Central de Ajuda abaixo continua acessível independente deste switch. */}
            <View style={[styles.toolRow, styles.toolDivider]}>
              <View style={[styles.toolIcon, { backgroundColor: cores.primaryLight + '1E', borderColor: cores.primaryLight + '3A' }]}>
                <MaterialCommunityIcons name="lightbulb-on-outline" size={20} color={cores.primaryLight} />
              </View>
              <View style={{ flex: 1, marginLeft: 12, marginRight: 10 }}>
                <Text style={styles.toolLabel}>Mostrar dicas contextuais</Text>
                <Text style={styles.toolDesc}>Balões curtos explicando elementos da tela</Text>
              </View>
              <Switch
                value={ajudaAtiva}
                onValueChange={handleToggleAjuda}
                trackColor={{ false: cores.outline, true: cores.primary + '80' }}
                thumbColor={ajudaAtiva ? cores.primary : '#fff'}
              />
            </View>

            {/* Rever apresentação e dicas — item secundário (último, sem divisória). */}
            <OlliPressable
              style={styles.toolRow}
              onPress={handleReverApresentacao}
              haptic={false}
              scaleTo={0.985}
              accessibilityLabel="Rever apresentação e dicas"
            >
              <View style={[styles.toolIcon, { backgroundColor: '#A78BFA1E', borderColor: '#A78BFA3A' }]}>
                <MaterialCommunityIcons name="restart" size={20} color="#A78BFA" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.toolLabel}>Rever apresentação e dicas</Text>
                <Text style={styles.toolDesc}>Mostra a introdução e as dicas de novo</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceMuted} />
            </OlliPressable>
          </View>
        </AnimatedEntrance>

        {/* CONTA E BACKUP */}
        <AnimatedEntrance index={5}>
          <Text style={styles.sectionTitle}>Conta e backup</Text>
        </AnimatedEntrance>

        {!configured && (
          <AnimatedEntrance index={5}>
            <View style={styles.card}>
              <View style={styles.iconHeader}>
                <MaterialCommunityIcons name="cloud-cog-outline" size={24} color={cores.warning} />
                <Text style={styles.cardTitle}>Backup ainda não ativado</Text>
              </View>
              <Text style={styles.text}>
                Para ativar o backup na nuvem, é preciso criar um projeto gratuito no Supabase e colar 2 chaves no app.
                É rápido — peça ao assistente para te guiar.
              </Text>
              <View style={styles.stepRow}><Text style={styles.stepNum}>1</Text><Text style={styles.stepText}>Crie conta grátis em supabase.com</Text></View>
              <View style={styles.stepRow}><Text style={styles.stepNum}>2</Text><Text style={styles.stepText}>Cole a URL e a chave no arquivo de configuração</Text></View>
              <View style={styles.stepRow}><Text style={styles.stepNum}>3</Text><Text style={styles.stepText}>Pronto: login e backup automático</Text></View>
            </View>
          </AnimatedEntrance>
        )}

        {/* LOGADO (dentro das Tabs sempre há sessão) */}
        {configured && user && (
          <AnimatedEntrance index={5}>
            <View style={styles.card}>
              <View style={styles.userRow}>
                <View style={styles.avatarSm}><MaterialCommunityIcons name="account" size={24} color={cores.primary} /></View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.userEmail}>{user.email}</Text>
                  <View style={styles.connected}>
                    <View style={styles.dot} />
                    <Text style={styles.connectedText}>Conectado à nuvem</Text>
                  </View>
                </View>
              </View>
              <View style={styles.backupStatus}>
                <MaterialCommunityIcons name={lastBackup ? 'cloud-check' : 'cloud-alert'} size={20} color={lastBackup ? cores.success : cores.warning} />
                <Text style={styles.backupText}>
                  {autoBackupAtivo
                    ? (lastBackup ? `Backup automático: ativo — última cópia ${formatDateTime(lastBackup)}` : 'Backup automático: ativo — ainda sem cópias')
                    : 'Backup automático: desativado'}
                </Text>
              </View>

              <View style={styles.autoBackupRow}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.autoBackupLabel}>Backup automático diário</Text>
                  <Text style={styles.autoBackupHint}>Guarda uma cópia por dia na nuvem, sem precisar apertar nada</Text>
                </View>
                <Switch
                  value={autoBackupAtivo}
                  onValueChange={handleToggleAutoBackup}
                  trackColor={{ false: cores.outline, true: cores.primary + '80' }}
                  thumbColor={autoBackupAtivo ? cores.primary : '#fff'}
                />
              </View>

              <OlliButton label="Fazer backup agora" variant="gradient" size="lg" fullWidth loading={busy} onPress={handleBackup} icon={<MaterialCommunityIcons name="cloud-upload" size={20} color="#fff" />} style={{ marginBottom: 10 }} />
              <OlliButton label="Ver cópias de segurança" variant="outline" size="lg" fullWidth onPress={handleAbrirBackups} icon={<MaterialCommunityIcons name="history" size={20} color={cores.primary} />} />
            </View>

            <OlliButton label="Sair da conta" variant="ghost" size="md" fullWidth loading={busy} onPress={handleLogout} haptic={false} icon={<MaterialCommunityIcons name="logout" size={18} color={cores.danger} />} textStyle={{ color: cores.danger }} />

            {/* ZONA DE PERIGO — exclusão de conta (requisito Apple + LGPD) */}
            <TouchableOpacity
              style={styles.excluirLink}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowExcluir(true); }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Excluir minha conta"
            >
              <MaterialCommunityIcons name="account-remove-outline" size={16} color={cores.onSurfaceMuted} />
              <Text style={styles.excluirLinkText}>Excluir minha conta</Text>
            </TouchableOpacity>
          </AnimatedEntrance>
        )}
        </>
        )}

        <Text style={styles.version}>OLLI · Orçamentos que fecham negócio</Text>
      </ScrollView>

      {/* MODAL: VER CÓPIAS DE SEGURANÇA */}
      <Modal visible={showBackups} animationType="slide" onRequestClose={() => setShowBackups(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Cópias de segurança</Text>
            <TouchableOpacity onPress={() => setShowBackups(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Fechar">
              <MaterialCommunityIcons name="close" size={26} color={cores.onSurface} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: Spacing.base }}>
            {carregandoBackups ? (
              <ActivityIndicator color={cores.primary} style={{ marginTop: 24 }} />
            ) : backups.length === 0 ? (
              <View style={styles.backupsEmpty}>
                <MaterialCommunityIcons name="cloud-off-outline" size={32} color={cores.onSurfaceMuted} />
                <Text style={styles.backupsEmptyText}>Nenhuma cópia de segurança ainda. Elas aparecem aqui assim que o primeiro backup automático ou manual for feito.</Text>
              </View>
            ) : (
              backups.map((b) => (
                <View key={b.id} style={styles.backupItem}>
                  <View style={styles.backupItemIcon}>
                    <MaterialCommunityIcons
                      name={b.tipo === 'manual' ? 'content-save-outline' : b.tipo === 'semanal' ? 'calendar-week' : 'calendar-today'}
                      size={20}
                      color={cores.primary}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.backupItemDate}>{formatDateTime(b.criadoEm)}</Text>
                    <Text style={styles.backupItemMeta}>{TIPO_BACKUP_LABEL[b.tipo]} · ~{b.tamanhoAprox} KB</Text>
                  </View>
                  <OlliButton
                    label="Restaurar"
                    variant="outline"
                    size="sm"
                    loading={restaurandoId === b.id}
                    disabled={restaurandoId !== null && restaurandoId !== b.id}
                    onPress={() => handleRestaurarBackup(b)}
                  />
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* MODAL: CRIAR CONTA EMPRESA (Onda 2) */}
      {showCriarEmpresa && (
        <ModalCriarEmpresa
          nomeSugerido={empresa?.nome || empresa?.nomePrestador || ''}
          onFechar={() => setShowCriarEmpresa(false)}
          onCriada={async () => {
            setShowCriarEmpresa(false);
            await recarregarTipoConta();
            await load();
          }}
        />
      )}

      {/* MODAL: ENTRAR NA EQUIPE POR CÓDIGO (Onda 2) */}
      {showEntrarEquipe && (
        <ModalEntrarEquipe
          onFechar={() => setShowEntrarEquipe(false)}
          onAceito={async () => {
            setShowEntrarEquipe(false);
            await recarregarTipoConta();
            await load();
          }}
        />
      )}

      {/* SHEET: OPÇÕES DE FOTO DE PERFIL */}
      <Modal visible={showFotoOpcoes} animationType="slide" transparent onRequestClose={() => setShowFotoOpcoes(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Foto de perfil</Text>
              <TouchableOpacity onPress={() => setShowFotoOpcoes(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Fechar">
                <MaterialCommunityIcons name="close" size={26} color={cores.onSurface} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: Spacing.base }}>
              <Text style={styles.sheetSub}>
                Esta é a sua foto pessoal — diferente da logo da empresa (que fica em Meu Negócio e aparece nos PDFs).
              </Text>
              <OlliPressable style={styles.fotoOpcao} haptic={false} accessibilityLabel="Tirar foto" onPress={() => handleEscolherFoto('camera')}>
                <MaterialCommunityIcons name="camera-outline" size={22} color={cores.accentLight} />
                <Text style={styles.fotoOpcaoText}>Tirar foto</Text>
              </OlliPressable>
              <OlliPressable style={styles.fotoOpcao} haptic={false} accessibilityLabel="Escolher da galeria" onPress={() => handleEscolherFoto('galeria')}>
                <MaterialCommunityIcons name="image-outline" size={22} color={cores.accentLight} />
                <Text style={styles.fotoOpcaoText}>Escolher da galeria</Text>
              </OlliPressable>
              {user?.avatarUrl ? (
                <OlliPressable style={[styles.fotoOpcao, styles.fotoOpcaoRemover]} haptic={false} accessibilityLabel="Remover foto" onPress={handleRemoverFoto}>
                  <MaterialCommunityIcons name="trash-can-outline" size={22} color={cores.danger} />
                  <Text style={[styles.fotoOpcaoText, { color: cores.danger }]}>Remover foto</Text>
                </OlliPressable>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: EXCLUIR MINHA CONTA (dupla confirmação — digitar EXCLUIR) */}
      {showExcluir && (
        <ModalExcluirConta
          busy={busy}
          onFechar={() => setShowExcluir(false)}
          onConfirmar={confirmarExclusaoFinal}
        />
      )}
    </View>
  );
}

/**
 * Modal "Excluir minha conta": lista o que será apagado, deixa claro que é
 * irreversível e exige que o usuário digite EXCLUIR (1ª confirmação). O botão
 * dispara o Alert final do pai (2ª confirmação) que efetiva a exclusão.
 */
function ModalExcluirConta({
  busy, onFechar, onConfirmar,
}: { busy: boolean; onFechar: () => void; onConfirmar: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [texto, setTexto] = useState('');
  const confirmado = texto.trim().toUpperCase() === 'EXCLUIR';

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onFechar}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Excluir minha conta</Text>
            <TouchableOpacity onPress={onFechar} disabled={busy} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Fechar">
              <MaterialCommunityIcons name="close" size={26} color={cores.onSurface} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: Spacing.base }} keyboardShouldPersistTaps="handled">
            <View style={styles.perigoBanner}>
              <MaterialCommunityIcons name="alert-octagon-outline" size={22} color={cores.danger} />
              <Text style={styles.perigoBannerText}>Esta ação é permanente e não pode ser desfeita.</Text>
            </View>

            <Text style={styles.excluirSub}>Ao excluir a conta, apagamos para sempre:</Text>
            {[
              'Seu login e o perfil da sua conta',
              'Orçamentos, clientes, produtos e serviços',
              'Agenda, recibos e demais registros',
              'Backups e dados guardados na nuvem',
            ].map(item => (
              <View key={item} style={styles.excluirItem}>
                <MaterialCommunityIcons name="close-circle-outline" size={16} color={cores.danger} />
                <Text style={styles.excluirItemText}>{item}</Text>
              </View>
            ))}

            <Text style={styles.excluirNota}>
              Se você tem uma assinatura ativa, ela será cancelada automaticamente ao excluir a conta. Você também pode cancelá-la antes em Assinatura → Gerenciar assinatura.
            </Text>

            <Text style={styles.sheetLabel}>Para confirmar, digite EXCLUIR</Text>
            <TextInput
              value={texto}
              onChangeText={setTexto}
              placeholder="EXCLUIR"
              placeholderTextColor={cores.onSurfaceMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!busy}
              style={styles.sheetInput}
            />

            <OlliButton
              label="Excluir minha conta"
              variant="gradient"
              size="lg"
              fullWidth
              loading={busy}
              disabled={!confirmado || busy}
              onPress={onConfirmar}
              icon={<MaterialCommunityIcons name="account-remove-outline" size={20} color="#fff" />}
              style={{ marginTop: Spacing.base, opacity: confirmado ? 1 : 0.5 }}
            />
            <TouchableOpacity style={styles.excluirCancelar} onPress={onFechar} disabled={busy} accessibilityRole="button" accessibilityLabel="Cancelar">
              <Text style={styles.excluirCancelarText}>Cancelar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Modal "Criar conta empresa": pede o nome e cria a org com o user como owner. */
function ModalCriarEmpresa({
  nomeSugerido, onFechar, onCriada,
}: { nomeSugerido: string; onFechar: () => void; onCriada: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [nome, setNome] = useState(nomeSugerido);
  const [criando, setCriando] = useState(false);

  async function criar() {
    setCriando(true);
    try {
      await criarOrganizacao(nome);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Empresa criada!', 'Agora você pode convidar sua equipe pela tela Equipe.');
      onCriada();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Não deu', e?.message ?? 'Não consegui criar a empresa agora.');
      setCriando(false);
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onFechar}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Criar conta empresa</Text>
            <TouchableOpacity onPress={onFechar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Fechar">
              <MaterialCommunityIcons name="close" size={26} color={cores.onSurface} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: Spacing.base }} keyboardShouldPersistTaps="handled">
            <Text style={styles.sheetSub}>
              A conta empresa deixa você convidar técnicos, definir papéis e ver a equipe. Seus orçamentos e clientes continuam os mesmos — a empresa é uma camada por cima.
            </Text>
            <Text style={styles.sheetLabel}>Nome da empresa</Text>
            <TextInput
              value={nome}
              onChangeText={setNome}
              placeholder="Ex.: Refrigeração Silva"
              placeholderTextColor={cores.onSurfaceMuted}
              style={styles.sheetInput}
              autoFocus
            />
            <OlliButton
              label="Criar empresa"
              variant="gradient"
              size="lg"
              fullWidth
              loading={criando}
              onPress={criar}
              icon={<MaterialCommunityIcons name="office-building-outline" size={20} color="#fff" />}
              style={{ marginTop: Spacing.base }}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Modal "Entrar na equipe": cola o código/link do convite e aceita. */
function ModalEntrarEquipe({ onFechar, onAceito }: { onFechar: () => void; onAceito: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [codigo, setCodigo] = useState('');
  const [aceitando, setAceitando] = useState(false);

  async function aceitar() {
    const token = extrairToken(codigo);
    if (!token) {
      Alert.alert('Código inválido', 'Cole o código ou o link completo do convite que você recebeu.');
      return;
    }
    setAceitando(true);
    try {
      const org = await aceitarConvite(token);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Bem-vindo à equipe!', `Você entrou em ${org.nome} como ${PAPEL_LABEL[org.papel]}.`);
      onAceito();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Não deu', e?.message ?? 'Não consegui aceitar o convite agora.');
      setAceitando(false);
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onFechar}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Entrar na equipe</Text>
            <TouchableOpacity onPress={onFechar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Fechar">
              <MaterialCommunityIcons name="close" size={26} color={cores.onSurface} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: Spacing.base }} keyboardShouldPersistTaps="handled">
            <Text style={styles.sheetSub}>
              Cole o código ou o link do convite que você recebeu de quem te chamou.
            </Text>
            <Text style={styles.sheetLabel}>Código do convite</Text>
            <TextInput
              value={codigo}
              onChangeText={setCodigo}
              placeholder="cole aqui o código ou o link"
              placeholderTextColor={cores.onSurfaceMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.sheetInput}
              autoFocus
            />
            <OlliButton
              label="Entrar na equipe"
              variant="gradient"
              size="lg"
              fullWidth
              loading={aceitando}
              onPress={aceitar}
              icon={<MaterialCommunityIcons name="account-multiple-plus-outline" size={20} color="#fff" />}
              style={{ marginTop: Spacing.base }}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  syncPill: {
    position: 'absolute', alignSelf: 'center', zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    // Pill sempre escura de propósito (como um toast): sem chave que represente
    // "fundo escuro fixo" nos dois modos — ver rule 7 da migração.
    backgroundColor: 'rgba(10,22,38,0.92)', borderWidth: 1, borderColor: c.strokeGlow,
    borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 6,
    ...sombrasDe(c).sm,
  },
  syncPillText: { fontSize: 11.5, fontWeight: '700', color: c.accentLight },

  guardWrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  guardTitle: { fontSize: 22, fontWeight: '800', color: c.onBackground, marginTop: Spacing.lg },
  guardText: { fontSize: 14, color: c.onSurfaceVariant, textAlign: 'center', lineHeight: 21, marginTop: Spacing.sm },

  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, marginBottom: Spacing.base },
  screenTitle: { fontSize: 24, fontWeight: '800', color: c.onBackground, letterSpacing: 0 },

  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: c.strokeGlow, padding: Spacing.base, marginHorizontal: Spacing.base, ...sombrasDe(c).sm },
  avatar: { width: 56, height: 56, borderRadius: 18, backgroundColor: c.primaryContainer, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 24, fontWeight: '800', color: c.accentLight },
  avatarImg: { width: 56, height: 56, borderRadius: 18, backgroundColor: c.surfaceElevated },
  avatarBadge: {
    position: 'absolute', right: -3, bottom: -3, width: 22, height: 22, borderRadius: 11,
    backgroundColor: c.accentLight, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: c.surface,
  },
  identidadeHint: { fontSize: 12, color: c.onSurfaceMuted, lineHeight: 17, marginHorizontal: Spacing.base, marginTop: 8 },
  identidadeHintForte: { color: c.onSurfaceVariant, fontWeight: '700' },
  identidadeLink: { color: c.accentLight, fontWeight: '700' },

  // Card discreto "Sua assinatura" (pagante)
  assinaturaCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceElevated,
    borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: c.strokeGlow,
    padding: Spacing.base, marginHorizontal: Spacing.base, marginTop: Spacing.base, ...sombrasDe(c).sm,
  },
  assinaturaIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: c.accentContainer, justifyContent: 'center', alignItems: 'center' },
  assinaturaTitle: { fontSize: 15, fontWeight: '800', color: c.onSurface },
  assinaturaSub: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 2 },

  // Excluir conta
  excluirLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginTop: 4 },
  excluirLinkText: { fontSize: 13, fontWeight: '700', color: c.onSurfaceMuted },

  fotoOpcao: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outlineDark, paddingHorizontal: 16, paddingVertical: 14, marginTop: 10 },
  fotoOpcaoText: { fontSize: 15, fontWeight: '700', color: c.onSurface },
  // Borda no tom fixo do danger do handoff cockpit; sem chave semântica exata (ver rule 7).
  fotoOpcaoRemover: { borderColor: 'rgba(255,107,107,0.35)' },

  perigoBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.dangerLight, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: 'rgba(255,107,107,0.35)', padding: Spacing.base },
  perigoBannerText: { flex: 1, fontSize: 13.5, fontWeight: '700', color: c.onSurface },
  excluirSub: { fontSize: 14, color: c.onSurfaceVariant, marginTop: Spacing.base, marginBottom: 6 },
  excluirItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  excluirItemText: { flex: 1, fontSize: 13.5, color: c.onSurface, lineHeight: 19 },
  excluirNota: { fontSize: 12.5, color: c.onSurfaceMuted, lineHeight: 18, marginTop: Spacing.base },
  excluirCancelar: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  excluirCancelarText: { fontSize: 14, fontWeight: '700', color: c.onSurfaceVariant },
  profileName: { fontSize: 18, fontWeight: '800', color: c.onSurface },
  profileCompany: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 2 },
  profilePhone: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 1 },
  // Cyan fixo (não segue a cor de marca escolhida): decorativo, sem chave semântica exata.
  segChip: { alignSelf: 'flex-start', backgroundColor: 'rgba(52,198,217,0.14)', borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 3, marginTop: 6 },
  segChipText: { fontSize: 11.5, fontWeight: '700', color: c.accentLight },
  editBtn: { alignItems: 'center', gap: 2 },
  editBtnText: { fontSize: 11, fontWeight: '700', color: c.accentLight },

  proCard: { backgroundColor: c.surfaceElevated, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: c.strokeGlow, padding: Spacing.base, marginHorizontal: Spacing.base, marginTop: Spacing.base, ...sombrasDe(c).sm },
  proHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.accentLight, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  proBadgeText: { fontSize: 12, fontWeight: '800', color: textoSobre(c.accentLight), letterSpacing: 0 },
  soonPill: { backgroundColor: comAlfa(c.onSurface, 0.06), borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  soonPillText: { fontSize: 11, fontWeight: '700', color: c.onSurfaceVariant },
  proTitle: { fontSize: 16, fontWeight: '800', color: c.onSurface },
  proSub: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 4, lineHeight: 19 },
  proBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  proBtnText: { fontSize: 14, fontWeight: '800', color: c.accentLight },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: c.onBackground, paddingHorizontal: Spacing.base, marginTop: Spacing.xl, marginBottom: Spacing.sm },

  toolsCard: { backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: c.outlineDark, marginHorizontal: Spacing.base, paddingHorizontal: Spacing.base, ...sombrasDe(c).sm },
  // O SeletorTema traz o próprio cartão (borda, fundo, padding); aqui só o alinhamento
  // horizontal com os outros blocos da tela.
  blocoAparencia: { marginHorizontal: Spacing.base },
  toolRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  toolDivider: { borderBottomWidth: 1, borderBottomColor: c.outline },
  toolIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  toolLabel: { fontSize: 15, fontWeight: '700', color: c.onSurface },
  toolDesc: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 1 },
  card: { backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.xl, padding: Spacing.base, marginHorizontal: Spacing.base, marginBottom: Spacing.base, borderWidth: 1, borderColor: c.outlineDark, ...sombrasDe(c).sm },
  iconHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: Spacing.base },
  cardTitle: { fontSize: 16, fontWeight: '800', color: c.onSurface },
  text: { fontSize: 14, color: c.onSurfaceVariant, lineHeight: 21, marginBottom: Spacing.base },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: c.primaryContainer, color: c.primary, fontWeight: '800', textAlign: 'center', lineHeight: 24, fontSize: 13 },
  stepText: { flex: 1, fontSize: 13, color: c.onSurface },

  userRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.base },
  avatarSm: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.primaryContainer, justifyContent: 'center', alignItems: 'center' },
  userEmail: { fontSize: 15, fontWeight: '700', color: c.onSurface },
  connected: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.success },
  connectedText: { fontSize: 12, color: c.success, fontWeight: '600' },
  backupStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.base },
  backupText: { fontSize: 13, color: c.onSurfaceVariant, flex: 1 },

  autoBackupRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceElevated, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outlineDark, padding: Spacing.md, marginBottom: Spacing.base },
  autoBackupLabel: { fontSize: 14, fontWeight: '700', color: c.onSurface },
  autoBackupHint: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2, lineHeight: 16 },

  modal: { flex: 1, backgroundColor: c.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.base, paddingTop: 56, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.outline },
  modalTitle: { fontSize: 20, fontWeight: '800', color: c.onSurface },

  backupsEmpty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: Spacing.lg, gap: 12 },
  backupsEmptyText: { fontSize: 13.5, color: c.onSurfaceVariant, textAlign: 'center', lineHeight: 20 },
  backupItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outlineDark, padding: Spacing.md, marginBottom: 10 },
  backupItemIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: c.primaryContainer, justifyContent: 'center', alignItems: 'center' },
  backupItemDate: { fontSize: 14, fontWeight: '700', color: c.onSurface },
  backupItemMeta: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },

  version: { textAlign: 'center', fontSize: 12, color: c.onSurfaceMuted, marginTop: Spacing.xl },

  // Empresa / Equipe (Onda 2)
  empresaCard: { backgroundColor: c.surfaceElevated, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: c.strokeGlow, padding: Spacing.base, marginHorizontal: Spacing.base, marginTop: Spacing.base, ...sombrasDe(c).sm },
  empresaHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  empresaIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: c.accentContainer, justifyContent: 'center', alignItems: 'center' },
  empresaNome: { fontSize: 15, fontWeight: '800', color: c.onSurface },
  empresaPapel: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 2 },
  empresaBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outlineDark, paddingHorizontal: 14, paddingVertical: 12 },
  empresaBtnText: { flex: 1, fontSize: 14, fontWeight: '700', color: c.onSurface },
  empresaBtnGhost: { backgroundColor: 'transparent', borderColor: 'transparent', marginTop: 4, paddingVertical: 10 },
  empresaBtnGhostText: { flex: 1, fontSize: 13.5, fontWeight: '700', color: c.onSurfaceVariant },

  // Bottom sheets (criar empresa / entrar na equipe)
  // Scrim do bottom sheet: escurece o fundo sempre, nos dois modos (convenção
  // padrão de overlay de modal — sem chave "scrim" na paleta).
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(4,10,20,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%', paddingBottom: 16 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.base, borderBottomWidth: 1, borderBottomColor: c.outline },
  sheetTitle: { fontSize: 19, fontWeight: '800', color: c.onSurface },
  sheetSub: { fontSize: 14, color: c.onSurfaceVariant, lineHeight: 21, marginBottom: Spacing.base },
  sheetLabel: { fontSize: 13, fontWeight: '800', color: c.onSurfaceVariant, marginBottom: 8, letterSpacing: 0.2 },
  sheetInput: { backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outlineDark, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: c.onSurface },
});
