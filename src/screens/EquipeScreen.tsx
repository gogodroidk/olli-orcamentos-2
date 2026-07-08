import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch,
  Alert, Share, ActivityIndicator, Modal, TextInput, Platform,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius, Shadow } from '../theme';
import { OlliButton } from '../components/OlliButton';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useTipoConta } from '../hooks/useTipoConta';
import { usePermissao } from '../hooks/usePermissao';
import {
  listarMembros,
  definirAtivoMembro,
  criarConvite,
  PAPEL_LABEL,
  PAPEL_DESCRICAO,
  PAPEIS_CONVIDAVEIS,
  type MembroEquipe,
  type Papel,
} from '../services/equipe';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Cor do "chip" do papel — dá hierarquia visual (owner destaca). */
const COR_PAPEL: Record<Papel, string> = {
  owner: Colors.accentLight,
  admin: Colors.primaryLight,
  gestor: '#A78BFA',
  tecnico: Colors.onSurfaceVariant,
};

/**
 * EquipeScreen — gestão da equipe da organização (Onda 2).
 *
 * Só faz sentido em conta EMPRESA com papel que veja a equipe (owner/admin/gestor).
 * owner/admin podem CONVIDAR e ativar/desativar; gestor vê a lista (read-only).
 * Técnico/pessoal nunca chega aqui (a UI que leva à tela já é gateada), mas a
 * própria tela também degrada com uma mensagem se cair aqui sem permissão.
 */
export default function EquipeScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { org, tipo, carregando: carregandoConta } = useTipoConta();
  const { pode } = usePermissao();

  const podeGerenciar = pode('gerenciar_equipe');
  const podeVer = pode('ver_equipe');

  const [membros, setMembros] = useState<MembroEquipe[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [alterandoId, setAlterandoId] = useState<string | null>(null);
  const [showConvite, setShowConvite] = useState(false);

  const load = useCallback(async () => {
    if (!org) { setCarregando(false); return; }
    setCarregando(true);
    const lista = await listarMembros(org.id);
    // Ordena: ativos primeiro; owner/admin no topo (peso por papel).
    const peso: Record<Papel, number> = { owner: 0, admin: 1, gestor: 2, tecnico: 3 };
    lista.sort((a, b) => {
      if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
      return (peso[a.papel] ?? 9) - (peso[b.papel] ?? 9);
    });
    setMembros(lista);
    setCarregando(false);
  }, [org]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleToggleAtivo(m: MembroEquipe) {
    if (!org || m.papel === 'owner') return; // o dono nunca é desativado por aqui
    Haptics.selectionAsync().catch(() => {});
    const novo = !m.ativo;
    setAlterandoId(m.userId);
    try {
      await definirAtivoMembro(org.id, m.userId, novo);
      setMembros((prev) => prev.map((x) => (x.userId === m.userId ? { ...x, ativo: novo } : x)));
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Não deu', e?.message ?? 'Não consegui alterar esse membro agora.');
    }
    setAlterandoId(null);
  }

  // ─── guardas de estado ─────────────────────────────────────
  if (carregandoConta) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 14 }]}>
        <Cabecalho onVoltar={() => nav.goBack()} />
        <View style={{ padding: Spacing.base, gap: 12 }}>
          <OlliSkeleton width="100%" height={64} radius={16} />
          <OlliSkeleton width="100%" height={64} radius={16} />
          <OlliSkeleton width="100%" height={64} radius={16} />
        </View>
      </View>
    );
  }

  // Conta pessoal ou sem permissão: mensagem honesta + caminho de saída.
  if (tipo !== 'empresa' || !org || !podeVer) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top + 40 }]}>
        <View style={styles.emptyIcon}>
          <MaterialCommunityIcons name="account-group-outline" size={40} color={Colors.accentLight} />
        </View>
        <Text style={styles.emptyTitle}>Equipe</Text>
        <Text style={styles.emptyText}>
          {tipo !== 'empresa'
            ? 'A gestão de equipe é do plano Empresa. Crie sua conta empresa na aba Conta para convidar técnicos.'
            : 'Seu papel não permite ver a equipe. Fale com o dono ou um administrador.'}
        </Text>
        <OlliButton
          label="Voltar"
          variant="outline"
          size="lg"
          onPress={() => nav.goBack()}
          style={{ marginTop: Spacing.lg, alignSelf: 'stretch' }}
        />
      </View>
    );
  }

  const ativos = membros.filter((m) => m.ativo).length;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        <Cabecalho onVoltar={() => nav.goBack()} />

        <AnimatedEntrance index={0}>
          <View style={styles.orgCard}>
            <View style={styles.orgAvatar}>
              <MaterialCommunityIcons name="office-building-outline" size={22} color={Colors.accentLight} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.orgNome} numberOfLines={1}>{org.nome}</Text>
              <Text style={styles.orgMeta}>
                {membros.length} {membros.length === 1 ? 'membro' : 'membros'} · {ativos} {ativos === 1 ? 'ativo' : 'ativos'}
              </Text>
            </View>
          </View>
        </AnimatedEntrance>

        {podeGerenciar && (
          <AnimatedEntrance index={1}>
            <TouchableOpacity
              style={styles.convidarBtn}
              activeOpacity={0.85}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowConvite(true); }}
            >
              <MaterialCommunityIcons name="account-plus-outline" size={20} color="#0A1626" />
              <Text style={styles.convidarBtnText}>Convidar para a equipe</Text>
            </TouchableOpacity>
          </AnimatedEntrance>
        )}

        <Text style={styles.sectionTitle}>Membros</Text>

        {carregando ? (
          <View style={{ paddingHorizontal: Spacing.base, gap: 10 }}>
            <OlliSkeleton width="100%" height={64} radius={16} />
            <OlliSkeleton width="100%" height={64} radius={16} />
          </View>
        ) : membros.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyListText}>
              Só você por aqui ainda. {podeGerenciar ? 'Convide seu primeiro técnico acima.' : ''}
            </Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {membros.map((m, i) => (
              <MembroRow
                key={m.userId}
                membro={m}
                divisor={i < membros.length - 1}
                podeGerenciar={podeGerenciar}
                alterando={alterandoId === m.userId}
                onToggle={() => handleToggleAtivo(m)}
              />
            ))}
          </View>
        )}

        {podeGerenciar && (
          <Text style={styles.rodapeHint}>
            Convites vencem em 7 dias. Desativar um membro tira o acesso dele na hora, sem apagar o histórico.
          </Text>
        )}
      </ScrollView>

      {showConvite && org && (
        <ModalConvite
          nomeOrg={org.nome}
          onFechar={() => setShowConvite(false)}
        />
      )}
    </View>
  );
}

// ─── linha de membro ─────────────────────────────────────────
function MembroRow({
  membro, divisor, podeGerenciar, alterando, onToggle,
}: {
  membro: MembroEquipe;
  divisor: boolean;
  podeGerenciar: boolean;
  alterando: boolean;
  onToggle: () => void;
}) {
  const nome = membro.nome || membro.email || 'Membro da equipe';
  const inicial = nome.charAt(0).toUpperCase();
  const ehOwner = membro.papel === 'owner';
  return (
    <View style={[styles.membroRow, divisor && styles.membroDivider, !membro.ativo && styles.membroInativo]}>
      <View style={styles.membroAvatar}>
        <Text style={styles.membroAvatarText}>{inicial}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.membroNome} numberOfLines={1}>{nome}</Text>
        <View style={styles.membroMetaRow}>
          <View style={[styles.papelChip, { borderColor: COR_PAPEL[membro.papel] + '55' }]}>
            <Text style={[styles.papelChipText, { color: COR_PAPEL[membro.papel] }]}>
              {PAPEL_LABEL[membro.papel]}
            </Text>
          </View>
          {!membro.ativo && <Text style={styles.inativoTag}>desativado</Text>}
        </View>
        {membro.email && membro.nome ? (
          <Text style={styles.membroEmail} numberOfLines={1}>{membro.email}</Text>
        ) : null}
      </View>
      {/* O dono nunca é desativável por aqui; para os demais, só quem gerencia. */}
      {podeGerenciar && !ehOwner ? (
        alterando ? (
          <ActivityIndicator size="small" color={Colors.accent} style={{ marginLeft: 8 }} />
        ) : (
          <Switch
            value={membro.ativo}
            onValueChange={onToggle}
            trackColor={{ false: Colors.outline, true: Colors.primary + '80' }}
            thumbColor={membro.ativo ? Colors.primary : '#fff'}
          />
        )
      ) : ehOwner ? (
        <MaterialCommunityIcons name="crown-outline" size={20} color={Colors.accentLight} style={{ marginLeft: 8 }} />
      ) : null}
    </View>
  );
}

// ─── modal de convite ────────────────────────────────────────
function ModalConvite({ nomeOrg, onFechar }: { nomeOrg: string; onFechar: () => void }) {
  const [papel, setPapel] = useState<Exclude<Papel, 'owner'>>('tecnico');
  const [email, setEmail] = useState('');
  const [gerando, setGerando] = useState(false);
  const [resultado, setResultado] = useState<{ token: string; link: string } | null>(null);

  async function gerar() {
    setGerando(true);
    try {
      const r = await criarConvite(papel, email.trim() || undefined);
      setResultado(r);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Não deu', e?.message ?? 'Não consegui criar o convite agora.');
    }
    setGerando(false);
  }

  function mensagemConvite(link: string): string {
    return `Você foi convidado para a equipe de ${nomeOrg} no OLLI, como ${PAPEL_LABEL[papel]}. Toque para entrar:\n${link}`;
  }

  async function compartilhar() {
    if (!resultado) return;
    Haptics.selectionAsync().catch(() => {});
    const msg = mensagemConvite(resultado.link);
    try {
      await Share.share({ message: msg });
    } catch {
      // usuário cancelou o share sheet — silêncio
    }
  }

  async function enviarWhatsApp() {
    if (!resultado) return;
    Haptics.selectionAsync().catch(() => {});
    // Sem número específico: wa.me/?text= abre o WhatsApp com a mensagem pronta
    // para o dono ESCOLHER o contato (o convite vai pelo link, não por número).
    // Não usamos abrirWhatsApp() aqui porque ela força um DDI '55' num número
    // vazio; para o convite queremos o seletor de contatos.
    const msg = encodeURIComponent(mensagemConvite(resultado.link));
    const url = `https://wa.me/?text=${msg}`;
    try {
      // require dentro do handler (nunca em module-scope) — lição Hermes.
      const { Linking } = require('react-native');
      await Linking.openURL(url);
    } catch {
      // fallback: share sheet (sempre disponível)
      try { await Share.share({ message: mensagemConvite(resultado.link) }); } catch { /* cancelado */ }
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onFechar}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{resultado ? 'Convite pronto' : 'Convidar para a equipe'}</Text>
            <TouchableOpacity onPress={onFechar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Fechar">
              <MaterialCommunityIcons name="close" size={26} color={Colors.onSurface} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: Spacing.base }} keyboardShouldPersistTaps="handled">
            {!resultado ? (
              <>
                <Text style={styles.modalLabel}>Papel na equipe</Text>
                <View style={{ gap: 10, marginBottom: Spacing.base }}>
                  {PAPEIS_CONVIDAVEIS.map((p) => {
                    const sel = papel === p;
                    return (
                      <TouchableOpacity
                        key={p}
                        style={[styles.papelOpcao, sel && styles.papelOpcaoSel]}
                        activeOpacity={0.85}
                        onPress={() => { Haptics.selectionAsync().catch(() => {}); setPapel(p); }}
                      >
                        <View style={styles.papelRadio}>
                          {sel ? <View style={styles.papelRadioDot} /> : null}
                        </View>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={[styles.papelOpcaoTitulo, sel && { color: Colors.accentLight }]}>
                            {PAPEL_LABEL[p]}
                          </Text>
                          <Text style={styles.papelOpcaoDesc}>{PAPEL_DESCRICAO[p]}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.modalLabel}>E-mail (opcional)</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="para lembrar quem você convidou"
                  placeholderTextColor={Colors.onSurfaceMuted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={styles.input}
                />
                <Text style={styles.modalHint}>
                  O convite vai por link — você compartilha por WhatsApp ou onde quiser. O e-mail é só uma anotação.
                </Text>

                <OlliButton
                  label="Gerar convite"
                  variant="gradient"
                  size="lg"
                  fullWidth
                  loading={gerando}
                  onPress={gerar}
                  icon={<MaterialCommunityIcons name="link-variant" size={20} color="#fff" />}
                  style={{ marginTop: Spacing.base }}
                />
              </>
            ) : (
              <>
                <View style={styles.sucessoIcon}>
                  <MaterialCommunityIcons name="check-circle-outline" size={40} color={Colors.success} />
                </View>
                <Text style={styles.sucessoTitulo}>Link do convite gerado</Text>
                <Text style={styles.sucessoSub}>
                  Compartilhe com quem você quer na equipe como {PAPEL_LABEL[papel]}. O link vale por 7 dias.
                </Text>

                <View style={styles.linkBox}>
                  <Text style={styles.linkTexto} numberOfLines={2}>{resultado.link}</Text>
                </View>

                <OlliButton
                  label="Enviar pelo WhatsApp"
                  variant="success"
                  size="lg"
                  fullWidth
                  onPress={enviarWhatsApp}
                  icon={<MaterialCommunityIcons name="whatsapp" size={20} color="#fff" />}
                  style={{ marginTop: Spacing.base }}
                />
                <OlliButton
                  label="Compartilhar de outro jeito"
                  variant="outline"
                  size="lg"
                  fullWidth
                  onPress={compartilhar}
                  icon={<MaterialCommunityIcons name="share-variant-outline" size={20} color={Colors.primary} />}
                  style={{ marginTop: 10 }}
                />
                <OlliButton
                  label="Convidar outra pessoa"
                  variant="ghost"
                  size="md"
                  fullWidth
                  onPress={() => { setResultado(null); setEmail(''); }}
                  style={{ marginTop: 6 }}
                />
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── cabeçalho ───────────────────────────────────────────────
function Cabecalho({ onVoltar }: { onVoltar: () => void }) {
  return (
    <View style={styles.headRow}>
      <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Voltar">
        <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.onSurface} />
      </TouchableOpacity>
      <Text style={styles.screenTitle}>Equipe</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },

  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, marginBottom: Spacing.base },
  screenTitle: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: 0 },

  emptyIcon: { width: 76, height: 76, borderRadius: 24, backgroundColor: Colors.accentContainer, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#fff', marginTop: Spacing.lg },
  emptyText: { fontSize: 14, color: Colors.onSurfaceVariant, textAlign: 'center', lineHeight: 21, marginTop: Spacing.sm },

  orgCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceGlass, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.strokeGlow, padding: Spacing.base, marginHorizontal: Spacing.base, ...Shadow.sm },
  orgAvatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: Colors.accentContainer, justifyContent: 'center', alignItems: 'center' },
  orgNome: { fontSize: 17, fontWeight: '800', color: '#fff' },
  orgMeta: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2 },

  convidarBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.accentLight, borderRadius: BorderRadius.lg, paddingVertical: 14, marginHorizontal: Spacing.base, marginTop: Spacing.base },
  convidarBtnText: { fontSize: 15, fontWeight: '800', color: '#0A1626' },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#fff', paddingHorizontal: Spacing.base, marginTop: Spacing.xl, marginBottom: Spacing.sm },

  card: { backgroundColor: Colors.surfaceGlass, borderRadius: BorderRadius.xl, padding: Spacing.base, marginHorizontal: Spacing.base, borderWidth: 1, borderColor: Colors.outlineDark, ...Shadow.sm },
  emptyListText: { fontSize: 14, color: Colors.onSurfaceVariant, lineHeight: 21 },

  listCard: { backgroundColor: Colors.surfaceGlass, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.outlineDark, marginHorizontal: Spacing.base, paddingHorizontal: Spacing.base, ...Shadow.sm },
  membroRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  membroDivider: { borderBottomWidth: 1, borderBottomColor: Colors.outline },
  membroInativo: { opacity: 0.55 },
  membroAvatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: Colors.primaryContainer, justifyContent: 'center', alignItems: 'center' },
  membroAvatarText: { fontSize: 18, fontWeight: '800', color: Colors.accentLight },
  membroNome: { fontSize: 15, fontWeight: '700', color: '#fff' },
  membroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  papelChip: { borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 2 },
  papelChipText: { fontSize: 11, fontWeight: '800' },
  inativoTag: { fontSize: 11, fontWeight: '700', color: Colors.warning },
  membroEmail: { fontSize: 12, color: Colors.onSurfaceMuted, marginTop: 3 },

  rodapeHint: { fontSize: 12.5, color: Colors.onSurfaceMuted, lineHeight: 18, paddingHorizontal: Spacing.base, marginTop: Spacing.lg },

  // modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(4,10,20,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', paddingBottom: Platform.OS === 'ios' ? 24 : 8 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.outline },
  modalTitle: { fontSize: 19, fontWeight: '800', color: Colors.onSurface },
  modalLabel: { fontSize: 13, fontWeight: '800', color: Colors.onSurfaceVariant, marginBottom: 8, letterSpacing: 0.2 },
  modalHint: { fontSize: 12.5, color: Colors.onSurfaceMuted, lineHeight: 18, marginTop: 8 },

  papelOpcao: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceGlass, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.outlineDark, padding: Spacing.md },
  papelOpcaoSel: { borderColor: Colors.accent, backgroundColor: Colors.accentContainer },
  papelRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  papelRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.accent },
  papelOpcaoTitulo: { fontSize: 15, fontWeight: '800', color: '#fff' },
  papelOpcaoDesc: { fontSize: 12.5, color: Colors.onSurfaceVariant, marginTop: 2, lineHeight: 17 },

  input: { backgroundColor: Colors.surfaceGlass, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.outlineDark, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.onSurface },

  sucessoIcon: { alignSelf: 'center', width: 72, height: 72, borderRadius: 24, backgroundColor: 'rgba(43,215,135,0.14)', alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm },
  sucessoTitulo: { fontSize: 19, fontWeight: '800', color: '#fff', textAlign: 'center', marginTop: Spacing.base },
  sucessoSub: { fontSize: 14, color: Colors.onSurfaceVariant, textAlign: 'center', lineHeight: 21, marginTop: 6, paddingHorizontal: 6 },
  linkBox: { backgroundColor: Colors.surfaceGlass, borderRadius: BorderRadius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.strokeGlow, padding: 14, marginTop: Spacing.base },
  linkTexto: { fontSize: 13, color: Colors.accentLight, fontWeight: '600' },
});
