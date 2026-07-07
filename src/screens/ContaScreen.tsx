import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, ActivityIndicator, TouchableOpacity, Switch, Modal, RefreshControl, Animated } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius, Shadow } from '../theme';
import { OlliButton } from '../components/OlliButton';
import { OlliMascot } from '../components/OlliMascot';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { OlliSkeleton } from '../components/OlliSkeleton';
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
      <MaterialCommunityIcons name="cloud-sync-outline" size={13} color={Colors.accentLight} />
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
}

// Ferramentas que JÁ existem no app (todas no stack). Só listamos o que funciona de verdade.
const FERRAMENTAS: {
  key: string;
  icon: string;
  label: string;
  desc: string;
  color: string;
  route: keyof RootStackParamList;
}[] = [
  { key: 'olliVoz', icon: 'microphone', label: 'OLLI por voz', desc: 'Monte orçamentos falando', color: Colors.accent, route: 'OlliVoz' },
  { key: 'olliChat', icon: 'chat-processing-outline', label: 'Chat com a OLLI', desc: 'Sua assistente técnica', color: Colors.primaryLight, route: 'OlliChat' },
  { key: 'servicos', icon: 'wrench-outline', label: 'Catálogo de serviços', desc: 'Serviços e preços', color: Colors.primary, route: 'Servicos' },
  { key: 'produtos', icon: 'package-variant-closed', label: 'Produtos e peças', desc: 'Materiais e estoque', color: Colors.primary, route: 'Produtos' },
  { key: 'clientes', icon: 'account-group-outline', label: 'Clientes', desc: 'Sua base de clientes', color: '#A78BFA', route: 'Clientes' },
  { key: 'erro', icon: 'card-search-outline', label: 'Códigos de erro', desc: 'Diagnóstico · OLLI Técnica', color: Colors.accent, route: 'Diagnostico' },
  { key: 'recibo', icon: 'receipt', label: 'Recibos', desc: 'Emita recibos de pagamento', color: Colors.success, route: 'EmitirRecibo' },
  { key: 'negocio', icon: 'storefront-outline', label: 'Personalizar', desc: 'Seu negócio, logo e marca', color: '#F7B23B', route: 'MeuNegocio' },
];

export default function ContaScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const configured = isSupabaseConfigured();

  const [user, setUser] = useState<PerfilUsuario | null>(null);
  // Sessão perdida DENTRO das Tabs (só deveria acontecer com sessão corrompida/
  // expirada). Dispara o guarda defensivo "Sessão expirada".
  const [sessaoPerdida, setSessaoPerdida] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [autoBackupAtivo, setAutoBackupAtivo] = useState(true);
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
    if (configured) {
      const u = await getCurrentUser();
      if (u) {
        const meta = (u.user_metadata ?? {}) as Record<string, any>;
        setUser({
          email: u.email,
          nome: typeof meta.full_name === 'string' ? meta.full_name : undefined,
          telefone: typeof meta.telefone === 'string' ? meta.telefone : undefined,
        });
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

  function abrirFerramenta(f: typeof FERRAMENTAS[number]) {
    Haptics.selectionAsync().catch(() => {});
    if (f.route === 'EmitirRecibo') nav.navigate('EmitirRecibo', {});
    else nav.navigate(f.route as never);
  }

  const primeiroNome = user?.nome?.split(' ')[0] || empresa?.nomePrestador?.split(' ')[0] || 'prestador';
  const nomeExibido = user?.nome || empresa?.nomePrestador || 'Seu nome';
  const segmentoLabel = SEGMENTOS.find(s => s.id === empresa?.segmento)?.label;

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accent} colors={[Colors.accent]} />}
      >
        <View style={styles.headRow}>
          <Text style={styles.screenTitle}>Conta</Text>
          <OlliMascot size={34} onDark />
        </View>

        {carregando ? (
          <View style={[styles.profileCard, { marginBottom: Spacing.base }]}>
            <OlliSkeleton width={56} height={56} radius={18} />
            <View style={{ flex: 1, marginLeft: 14, gap: 8 }}>
              <OlliSkeleton width="55%" height={16} />
              <OlliSkeleton width="70%" height={12} />
            </View>
          </View>
        ) : (
        <>
        {/* CARD DE PERFIL (nome/e-mail/telefone do usuário logado) */}
        <AnimatedEntrance index={0}>
          <TouchableOpacity style={styles.profileCard} onPress={() => nav.navigate('MeuNegocio')} activeOpacity={0.85}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{primeiroNome.charAt(0).toUpperCase()}</Text>
            </View>
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
              <MaterialCommunityIcons name="pencil-outline" size={16} color={Colors.accent} />
              <Text style={styles.editBtnText}>editar</Text>
            </View>
          </TouchableOpacity>
        </AnimatedEntrance>

        {/* OLLI PRO (informativo) */}
        <AnimatedEntrance index={1}>
          <View style={styles.proCard}>
            <View style={styles.proHead}>
              <View style={styles.proBadge}>
                <MaterialCommunityIcons name="crown-outline" size={16} color="#0A1626" />
                <Text style={styles.proBadgeText}>OLLI PRO</Text>
              </View>
              <View style={styles.soonPill}><Text style={styles.soonPillText}>R$ 39/mês</Text></View>
            </View>
            <Text style={styles.proTitle}>Leve o seu negócio ao próximo nível</Text>
            <Text style={styles.proSub}>Relatórios avançados, metas de vendas e suporte prioritário. Assine direto no app — mensal ou anual com desconto.</Text>
            <TouchableOpacity
              style={styles.proBtn}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); nav.navigate('Planos'); }}
              activeOpacity={0.85}
            >
              <Text style={styles.proBtnText}>Ver planos e assinar</Text>
              <MaterialCommunityIcons name="arrow-right" size={16} color={Colors.accentLight} />
            </TouchableOpacity>
          </View>
        </AnimatedEntrance>

        {/* FERRAMENTAS */}
        <Text style={styles.sectionTitle}>Ferramentas</Text>
        <View style={styles.toolsCard}>
          {FERRAMENTAS.map((f, i) => (
            <TouchableOpacity
              key={f.key}
              style={[styles.toolRow, i < FERRAMENTAS.length - 1 && styles.toolDivider]}
              onPress={() => abrirFerramenta(f)}
              activeOpacity={0.7}
            >
              <View style={[styles.toolIcon, { backgroundColor: f.color + '1E', borderColor: f.color + '3A' }]}>
                <MaterialCommunityIcons name={f.icon as any} size={20} color={f.color} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.toolLabel}>{f.label}</Text>
                <Text style={styles.toolDesc}>{f.desc}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.onSurfaceMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* CONTA E BACKUP */}
        <Text style={styles.sectionTitle}>Conta e backup</Text>

        {!configured && (
          <View style={styles.card}>
            <View style={styles.iconHeader}>
              <MaterialCommunityIcons name="cloud-cog-outline" size={24} color={Colors.warning} />
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
        )}

        {/* LOGADO (dentro das Tabs sempre há sessão) */}
        {configured && user && (
          <>
            <View style={styles.card}>
              <View style={styles.userRow}>
                <View style={styles.avatarSm}><MaterialCommunityIcons name="account" size={24} color={Colors.primary} /></View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.userEmail}>{user.email}</Text>
                  <View style={styles.connected}>
                    <View style={styles.dot} />
                    <Text style={styles.connectedText}>Conectado à nuvem</Text>
                  </View>
                </View>
              </View>
              <View style={styles.backupStatus}>
                <MaterialCommunityIcons name={lastBackup ? 'cloud-check' : 'cloud-alert'} size={20} color={lastBackup ? Colors.success : Colors.warning} />
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
                  trackColor={{ false: Colors.outline, true: Colors.primary + '80' }}
                  thumbColor={autoBackupAtivo ? Colors.primary : '#fff'}
                />
              </View>

              <OlliButton label="Fazer backup agora" variant="gradient" size="lg" fullWidth loading={busy} onPress={handleBackup} icon={<MaterialCommunityIcons name="cloud-upload" size={20} color="#fff" />} style={{ marginBottom: 10 }} />
              <OlliButton label="Ver cópias de segurança" variant="outline" size="lg" fullWidth onPress={handleAbrirBackups} icon={<MaterialCommunityIcons name="history" size={20} color={Colors.primary} />} />
            </View>

            <OlliButton label="Sair da conta" variant="ghost" size="md" fullWidth loading={busy} onPress={handleLogout} haptic={false} icon={<MaterialCommunityIcons name="logout" size={18} color={Colors.danger} />} textStyle={{ color: Colors.danger }} />
          </>
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
              <MaterialCommunityIcons name="close" size={26} color={Colors.onSurface} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: Spacing.base }}>
            {carregandoBackups ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
            ) : backups.length === 0 ? (
              <View style={styles.backupsEmpty}>
                <MaterialCommunityIcons name="cloud-off-outline" size={32} color={Colors.onSurfaceMuted} />
                <Text style={styles.backupsEmptyText}>Nenhuma cópia de segurança ainda. Elas aparecem aqui assim que o primeiro backup automático ou manual for feito.</Text>
              </View>
            ) : (
              backups.map((b) => (
                <View key={b.id} style={styles.backupItem}>
                  <View style={styles.backupItemIcon}>
                    <MaterialCommunityIcons
                      name={b.tipo === 'manual' ? 'content-save-outline' : b.tipo === 'semanal' ? 'calendar-week' : 'calendar-today'}
                      size={20}
                      color={Colors.primary}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  syncPill: {
    position: 'absolute', alignSelf: 'center', zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(10,22,38,0.92)', borderWidth: 1, borderColor: Colors.strokeGlow,
    borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 6,
    ...Shadow.sm,
  },
  syncPillText: { fontSize: 11.5, fontWeight: '700', color: Colors.accentLight },

  guardWrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  guardTitle: { fontSize: 22, fontWeight: '800', color: '#fff', marginTop: Spacing.lg },
  guardText: { fontSize: 14, color: Colors.onSurfaceVariant, textAlign: 'center', lineHeight: 21, marginTop: Spacing.sm },

  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, marginBottom: Spacing.base },
  screenTitle: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: 0 },

  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceGlass, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.strokeGlow, padding: Spacing.base, marginHorizontal: Spacing.base, ...Shadow.sm },
  avatar: { width: 56, height: 56, borderRadius: 18, backgroundColor: Colors.primaryContainer, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 24, fontWeight: '800', color: Colors.accentLight },
  profileName: { fontSize: 18, fontWeight: '800', color: '#fff' },
  profileCompany: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2 },
  profilePhone: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 1 },
  segChip: { alignSelf: 'flex-start', backgroundColor: 'rgba(52,198,217,0.14)', borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 3, marginTop: 6 },
  segChipText: { fontSize: 11.5, fontWeight: '700', color: Colors.accentLight },
  editBtn: { alignItems: 'center', gap: 2 },
  editBtnText: { fontSize: 11, fontWeight: '700', color: Colors.accent },

  proCard: { backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.strokeGlow, padding: Spacing.base, marginHorizontal: Spacing.base, marginTop: Spacing.base, ...Shadow.sm },
  proHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.accentLight, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  proBadgeText: { fontSize: 12, fontWeight: '800', color: '#0A1626', letterSpacing: 0 },
  soonPill: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  soonPillText: { fontSize: 11, fontWeight: '700', color: Colors.onSurfaceVariant },
  proTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  proSub: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 4, lineHeight: 19 },
  proBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  proBtnText: { fontSize: 14, fontWeight: '800', color: Colors.accentLight },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#fff', paddingHorizontal: Spacing.base, marginTop: Spacing.xl, marginBottom: Spacing.sm },

  toolsCard: { backgroundColor: Colors.surfaceGlass, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.outlineDark, marginHorizontal: Spacing.base, paddingHorizontal: Spacing.base, ...Shadow.sm },
  toolRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  toolDivider: { borderBottomWidth: 1, borderBottomColor: Colors.outline },
  toolIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  toolLabel: { fontSize: 15, fontWeight: '700', color: '#fff' },
  toolDesc: { fontSize: 12.5, color: Colors.onSurfaceVariant, marginTop: 1 },
  card: { backgroundColor: Colors.surfaceGlass, borderRadius: BorderRadius.xl, padding: Spacing.base, marginHorizontal: Spacing.base, marginBottom: Spacing.base, borderWidth: 1, borderColor: Colors.outlineDark, ...Shadow.sm },
  iconHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: Spacing.base },
  cardTitle: { fontSize: 16, fontWeight: '800', color: Colors.onSurface },
  text: { fontSize: 14, color: Colors.onSurfaceVariant, lineHeight: 21, marginBottom: Spacing.base },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primaryContainer, color: Colors.primary, fontWeight: '800', textAlign: 'center', lineHeight: 24, fontSize: 13 },
  stepText: { flex: 1, fontSize: 13, color: Colors.onSurface },

  userRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.base },
  avatarSm: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.primaryContainer, justifyContent: 'center', alignItems: 'center' },
  userEmail: { fontSize: 15, fontWeight: '700', color: Colors.onSurface },
  connected: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  connectedText: { fontSize: 12, color: Colors.success, fontWeight: '600' },
  backupStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.base },
  backupText: { fontSize: 13, color: Colors.onSurfaceVariant, flex: 1 },

  autoBackupRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.outlineDark, padding: Spacing.md, marginBottom: Spacing.base },
  autoBackupLabel: { fontSize: 14, fontWeight: '700', color: Colors.onSurface },
  autoBackupHint: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2, lineHeight: 16 },

  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.base, paddingTop: 56, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.outline },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.onSurface },

  backupsEmpty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: Spacing.lg, gap: 12 },
  backupsEmptyText: { fontSize: 13.5, color: Colors.onSurfaceVariant, textAlign: 'center', lineHeight: 20 },
  backupItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceGlass, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.outlineDark, padding: Spacing.md, marginBottom: 10 },
  backupItemIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.primaryContainer, justifyContent: 'center', alignItems: 'center' },
  backupItemDate: { fontSize: 14, fontWeight: '700', color: Colors.onSurface },
  backupItemMeta: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },

  version: { textAlign: 'center', fontSize: 12, color: Colors.onSurfaceMuted, marginTop: Spacing.xl },
});
