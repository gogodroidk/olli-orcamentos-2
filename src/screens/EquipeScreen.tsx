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
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, textoSobre, type Cores } from '../theme';
import { OlliButton } from '../components/OlliButton';
import { GateEquipe } from '../components/GateEquipe';
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

/**
 * Cor do "chip" do papel — dá hierarquia visual (owner destaca).
 * Função (não Record de módulo): as cores vêm da paleta atual — um objeto fixo
 * congelaria as cores no import, como o resto desta migração evita.
 */
function corPapel(c: Cores): Record<Papel, string> {
  return {
    owner: c.accentLight,
    admin: c.primaryLight,
    gestor: '#A78BFA',
    tecnico: c.onSurfaceVariant,
  };
}

/**
 * EquipeScreen — gestão da equipe da organização (Onda 2).
 *
 * Só faz sentido em conta EMPRESA com papel que veja a equipe (owner/admin/gestor).
 * owner/admin podem CONVIDAR e ativar/desativar; gestor vê a lista (read-only).
 * Técnico/pessoal nunca chega aqui (a UI que leva à tela já é gateada), mas a
 * própria tela também degrada com uma mensagem se cair aqui sem permissão.
 */
/**
 * Conteúdo real da tela. O componente EXPORTADO (lá embaixo) é ele envolto no
 * <GatePro> do plano Empresa — ver o porquê no rodapé deste arquivo.
 */
function EquipeConteudo() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
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

  async function aplicarAtivo(m: MembroEquipe, novo: boolean) {
    if (!org) return;
    Haptics.selectionAsync().catch(() => {});
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

  function handleToggleAtivo(m: MembroEquipe) {
    if (!org || m.papel === 'owner') return; // o dono nunca é desativado por aqui
    const novo = !m.ativo;
    // DESATIVAR tira o acesso do membro — pede confirmação (o Switch dispara direto, então
    // sem isto um toque acidental derruba alguém). Reativar é inócuo e vai direto.
    if (!novo) {
      Alert.alert(
        'Desativar este membro?',
        'Ele perderá o acesso à equipe até ser reativado.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Desativar', style: 'destructive', onPress: () => { void aplicarAtivo(m, novo); } },
        ],
      );
      return;
    }
    void aplicarAtivo(m, novo);
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
          <MaterialCommunityIcons name="account-group-outline" size={40} color={cores.accentLight} />
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
              <MaterialCommunityIcons name="office-building-outline" size={22} color={cores.accentLight} />
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
              <MaterialCommunityIcons name="account-plus-outline" size={20} color={textoSobre(cores.accentLight)} />
              <Text style={styles.convidarBtnText}>Convidar para a equipe</Text>
            </TouchableOpacity>
          </AnimatedEntrance>
        )}

        {/* Onda 2 — atalho para a Equipe ao vivo no mapa (plano Empresa). A tela de
            destino já traz o próprio GateEquipe/GuardaPapel — este botão só navega;
            quem chega lá sem plano ou papel de gestão vê a oferta/aviso certos. */}
        <AnimatedEntrance index={podeGerenciar ? 2 : 1}>
          <TouchableOpacity
            style={styles.mapaEquipeBtn}
            activeOpacity={0.85}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); nav.navigate('EquipeAoVivo'); }}
            accessibilityRole="button"
            accessibilityLabel="Ver equipe ao vivo no mapa"
          >
            <View style={styles.mapaEquipeIcon}>
              <MaterialCommunityIcons name="map-marker-radius-outline" size={20} color={cores.accentLight} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.mapaEquipeTitulo}>Equipe ao vivo no mapa</Text>
              <Text style={styles.mapaEquipeSub}>Veja a última localização de cada técnico</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceMuted} />
          </TouchableOpacity>
        </AnimatedEntrance>

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
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const CorPapel = corPapel(cores);
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
          <View style={[styles.papelChip, { borderColor: CorPapel[membro.papel] + '55' }]}>
            <Text style={[styles.papelChipText, { color: CorPapel[membro.papel] }]}>
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
          <ActivityIndicator size="small" color={cores.accentLight} style={{ marginLeft: 8 }} />
        ) : (
          <Switch
            value={membro.ativo}
            onValueChange={onToggle}
            trackColor={{ false: cores.outline, true: cores.primary + '80' }}
            thumbColor={membro.ativo ? cores.primary : '#fff'}
          />
        )
      ) : ehOwner ? (
        <MaterialCommunityIcons name="crown-outline" size={20} color={cores.accentLight} style={{ marginLeft: 8 }} />
      ) : null}
    </View>
  );
}

// ─── modal de convite ────────────────────────────────────────
function ModalConvite({ nomeOrg, onFechar }: { nomeOrg: string; onFechar: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
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
              <MaterialCommunityIcons name="close" size={26} color={cores.onSurface} />
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
                          <Text style={[styles.papelOpcaoTitulo, sel && { color: cores.accentLight }]}>
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
                  placeholderTextColor={cores.onSurfaceMuted}
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
                  <MaterialCommunityIcons name="check-circle-outline" size={40} color={cores.success} />
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
                  icon={<MaterialCommunityIcons name="share-variant-outline" size={20} color={cores.primary} />}
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
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.headRow}>
      <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Voltar">
        <MaterialCommunityIcons name="arrow-left" size={24} color={cores.onSurface} />
      </TouchableOpacity>
      <Text style={styles.screenTitle}>Equipe</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },

  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, marginBottom: Spacing.base },
  screenTitle: { fontSize: 22, fontWeight: '800', color: c.onBackground, letterSpacing: 0 },

  emptyIcon: { width: 76, height: 76, borderRadius: 24, backgroundColor: c.accentContainer, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: c.onBackground, marginTop: Spacing.lg },
  emptyText: { fontSize: 14, color: c.onSurfaceVariant, textAlign: 'center', lineHeight: 21, marginTop: Spacing.sm },

  orgCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: c.strokeGlow, padding: Spacing.base, marginHorizontal: Spacing.base, ...sombrasDe(c).sm },
  orgAvatar: { width: 48, height: 48, borderRadius: BorderRadius.chip, backgroundColor: c.accentContainer, justifyContent: 'center', alignItems: 'center' },
  orgNome: { fontSize: 17, fontWeight: '800', color: c.onSurface },
  orgMeta: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 2 },

  convidarBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.accentLight, borderRadius: BorderRadius.lg, paddingVertical: 14, marginHorizontal: Spacing.base, marginTop: Spacing.base },
  convidarBtnText: { fontSize: 15, fontWeight: '800', color: textoSobre(c.accentLight) },

  mapaEquipeBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outlineDark, paddingHorizontal: Spacing.md, paddingVertical: 12, marginHorizontal: Spacing.base, marginTop: Spacing.base, ...sombrasDe(c).sm },
  mapaEquipeIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.accentContainer, alignItems: 'center', justifyContent: 'center' },
  mapaEquipeTitulo: { fontSize: 14.5, fontWeight: '700', color: c.onSurface },
  mapaEquipeSub: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: c.onBackground, paddingHorizontal: Spacing.base, marginTop: Spacing.xl, marginBottom: Spacing.sm },

  card: { backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.xl, padding: Spacing.base, marginHorizontal: Spacing.base, borderWidth: 1, borderColor: c.outlineDark, ...sombrasDe(c).sm },
  emptyListText: { fontSize: 14, color: c.onSurfaceVariant, lineHeight: 21 },

  listCard: { backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: c.outlineDark, marginHorizontal: Spacing.base, paddingHorizontal: Spacing.base, ...sombrasDe(c).sm },
  membroRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  membroDivider: { borderBottomWidth: 1, borderBottomColor: c.outline },
  membroInativo: { opacity: 0.55 },
  membroAvatar: { width: 42, height: 42, borderRadius: BorderRadius.chip, backgroundColor: c.primaryContainer, justifyContent: 'center', alignItems: 'center' },
  membroAvatarText: { fontSize: 18, fontWeight: '800', color: c.accentLight },
  membroNome: { fontSize: 15, fontWeight: '700', color: c.onSurface },
  membroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  papelChip: { borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 2 },
  papelChipText: { fontSize: 11, fontWeight: '800' },
  inativoTag: { fontSize: 11, fontWeight: '700', color: c.warning },
  membroEmail: { fontSize: 12, color: c.onSurfaceMuted, marginTop: 3 },

  rodapeHint: { fontSize: 12.5, color: c.onSurfaceMuted, lineHeight: 18, paddingHorizontal: Spacing.base, marginTop: Spacing.lg },

  // modal
  // Scrim do bottom sheet: escurece o fundo sempre, nos dois modos (convenção
  // padrão de overlay de modal — sem chave "scrim" na paleta).
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(4,10,20,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', paddingBottom: Platform.OS === 'ios' ? 24 : 8 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.base, borderBottomWidth: 1, borderBottomColor: c.outline },
  modalTitle: { fontSize: 19, fontWeight: '800', color: c.onSurface },
  modalLabel: { fontSize: 13, fontWeight: '800', color: c.onSurfaceVariant, marginBottom: 8, letterSpacing: 0.2 },
  modalHint: { fontSize: 12.5, color: c.onSurfaceMuted, lineHeight: 18, marginTop: 8 },

  papelOpcao: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outlineDark, padding: Spacing.md },
  papelOpcaoSel: { borderColor: c.accent, backgroundColor: c.accentContainer },
  papelRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  papelRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent },
  papelOpcaoTitulo: { fontSize: 15, fontWeight: '800', color: c.onSurface },
  papelOpcaoDesc: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 2, lineHeight: 17 },

  input: { backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outlineDark, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: c.onSurface },

  // Tom fixo de sucesso do handoff cockpit; próximo de `successLight` mas alfa/hex
  // não batem exatamente — deixado como está (ver rule 7 da migração).
  sucessoIcon: { alignSelf: 'center', width: 72, height: 72, borderRadius: 24, backgroundColor: 'rgba(43,215,135,0.14)', alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm },
  sucessoTitulo: { fontSize: 19, fontWeight: '800', color: c.onSurface, textAlign: 'center', marginTop: Spacing.base },
  sucessoSub: { fontSize: 14, color: c.onSurfaceVariant, textAlign: 'center', lineHeight: 21, marginTop: 6, paddingHorizontal: 6 },
  linkBox: { backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: c.strokeGlow, padding: 14, marginTop: Spacing.base },
  linkTexto: { fontSize: 13, color: c.accentLight, fontWeight: '600' },
});


/**
 * PAYWALL DO PLANO EMPRESA (F0c / item O1-12).
 *
 * A gestão de equipe é entitlement do plano Empresa (R$ 99/mês) — `RECURSOS_POR_PLANO`
 * já listava `equipe` lá desde a Onda 1 —, mas NADA checava: qualquer conta, inclusive
 * a Grátis, convidava técnicos e usava o Modo Empresa inteiro sem pagar. A tela até
 * dizia "A gestão de equipe é do plano Empresa", e mesmo assim deixava usar: aviso não
 * é enforcement.
 *
 * O gate é no COMPONENTE EXPORTADO (e não dentro do conteúdo) para o `comCentroDesktop`
 * do navigator herdar a trava sem precisar repeti-la.
 *
 * O `GatePro` erra para o lado certo: enquanto o plano carrega ele mostra o preview
 * BLOQUEADO (não pisca o conteúdo pago para quem não paga) e, se a leitura de rede
 * falhar, o `usePlano` mantém o último plano bom do cache — quem paga não perde a tela
 * por causa de uma oscilação.
 *
 * F0d (17/07): quem decide é o `GateEquipe`, e não o `GatePro` cru — org que já
 * existia quando o paywall entrou continua podendo (grandfathering). Ver
 * `services/entitlementEquipe.ts`.
 *
 * ⚠️ Isto é a camada de UX. O enforcement de verdade é server-side, no worker
 * (`handleConvite` checa `orgTemEmpresaAtivo`, que respeita o mesmo F0d) — paywall
 * no client é vitrine, não fechadura.
 */
export default function EquipeScreen() {
  return (
    <GateEquipe
      recurso="equipe"
      beneficio="Convide técnicos, defina papéis e veja o trabalho de todo mundo num lugar só."
    >
      <EquipeConteudo />
    </GateEquipe>
  );
}
