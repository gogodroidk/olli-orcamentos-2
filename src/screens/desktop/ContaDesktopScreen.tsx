import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Image, ActivityIndicator, Switch, Modal, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, comAlfa, sombrasDe, type Cores } from '../../theme';
import { LayoutDesktop } from '../../components/web/LayoutDesktop';
import { PressableWebState } from '../../components/web/pressableWebState';
import { OlliInput } from '../../components/OlliInput';
import { OlliButton } from '../../components/OlliButton';
import { SeletorTema } from '../../components/SeletorTema';
import { useTipoConta, recarregarTipoConta } from '../../hooks/useTipoConta';
import { usePermissao } from '../../hooks/usePermissao';
import { usePlano } from '../../hooks/usePlano';
import { salvarFotoPerfil, removerFotoPerfil, excluirConta } from '../../services/conta';
import { estaAtiva, ligarAjuda, desligarAjuda, resetarAjuda } from '../../services/onboarding';
import { adicionarFotoGaleria } from '../../utils/fotosOrcamento';
import { criarOrganizacao, aceitarConvite, extrairToken, PAPEL_LABEL } from '../../services/equipe';
import { isSupabaseConfigured, signOut, getCurrentUser } from '../../services/supabase';
import {
  backupManualVersionado,
  estadoBackupNuvem,
  resumoBackupNuvem,
  COPY_BACKUP_NUVEM,
  getUltimoBackupVersionadoData,
  listBackupsVersionados,
  restoreBackupById,
  type BackupVersionadoResumo,
} from '../../services/backup';
import type { MotivoBackupNuvem } from '../../services/contextoEquipe';
import { abortarSyncEmAndamento, onSyncAplicado } from '../../services/cloudSync';
import { formatDateTime } from '../../utils/date';
import { AUTO_BACKUP_TOGGLE_KEY, APP_DATA_STORAGE_KEYS } from '../../services/storageKeys';
import { navigationRef } from '../../navigation/navigationRef';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { getEmpresa, clearAllLocalData } from '../../database/database';
import { Empresa, SEGMENTOS } from '../../types';
import { avisar, confirmar } from './dialogo';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Rótulo em PT-BR do tipo de backup versionado — mesma tabela da ContaScreen mobile. */
const TIPO_BACKUP_LABEL: Record<BackupVersionadoResumo['tipo'], string> = {
  diario: 'Automático (diário)',
  semanal: 'Automático (semanal)',
  manual: 'Manual',
};

/** Rótulo pt-BR do plano — mesma tabela da ContaScreen mobile. */
const PLANO_LABEL: Record<'gratis' | 'pro' | 'empresa', string> = {
  gratis: 'Grátis',
  pro: 'Pro',
  empresa: 'Empresa',
};

/** Dados do usuário logado exibidos na tela (do Supabase Auth / user_metadata). */
interface PerfilUsuario {
  email?: string;
  nome?: string;
  telefone?: string;
  avatarUrl?: string;
}

/** Formata um telefone em dígitos (com DDI 55) para exibição: +55 (11) 99999-9999. Espelha ContaScreen.tsx. */
function formatarTelefoneExibicao(digits: string): string {
  const d = (digits ?? '').replace(/\D/g, '');
  const semDdi = d.startsWith('55') && (d.length === 12 || d.length === 13) ? d.slice(2) : d;
  if (semDdi.length === 11) return `(${semDdi.slice(0, 2)}) ${semDdi.slice(2, 7)}-${semDdi.slice(7)}`;
  if (semDdi.length === 10) return `(${semDdi.slice(0, 2)}) ${semDdi.slice(2, 6)}-${semDdi.slice(6)}`;
  return digits;
}

/** Chaves da navegação lateral — cada uma corresponde a um card na coluna de conteúdo. */
type ChaveSecao = 'perfil' | 'empresa' | 'plano' | 'equipe' | 'backup' | 'aparencia' | 'perigo';

const SECOES: { chave: ChaveSecao; label: string; icone: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { chave: 'perfil', label: 'Perfil', icone: 'account-circle-outline' },
  { chave: 'empresa', label: 'Minha empresa', icone: 'storefront-outline' },
  { chave: 'plano', label: 'Plano e assinatura', icone: 'crown-outline' },
  { chave: 'equipe', label: 'Organização e equipe', icone: 'account-group-outline' },
  { chave: 'backup', label: 'Backup e sincronização', icone: 'cloud-sync-outline' },
  { chave: 'aparencia', label: 'Aparência', icone: 'palette-swatch-outline' },
  { chave: 'perigo', label: 'Zona de perigo', icone: 'alert-octagon-outline' },
];

/**
 * Conta desktop (v4) — única fora do padrão tabela: navegação interna sticky à
 * esquerda + seções em cards à direita, com scroll-spy acendendo a seção
 * visível. Reagrupa exatamente o que a ContaScreen mobile já mostra (perfil,
 * empresa, plano, equipe, backup, aparência, exclusão de conta), reaproveitando
 * os MESMOS serviços — nenhuma regra de negócio nova. Não toca na mobile.
 */
export default function ContaDesktopScreen() {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const configured = isSupabaseConfigured();

  const { tipo, org, carregando: carregandoConta } = useTipoConta();
  const { pode, carregando: carregandoPermissao } = usePermissao();
  const { plano, carregando: carregandoPlano } = usePlano();

  const [user, setUser] = useState<PerfilUsuario | null>(null);
  const [sessaoPerdida, setSessaoPerdida] = useState(false);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [avatarErro, setAvatarErro] = useState(false);
  const [salvandoFoto, setSalvandoFoto] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  // 3 estados: `null` = carregando; depois o MOTIVO real. Paridade com a
  // ContaScreen mobile — para um membro de equipe a guarda de backup.ts recusa o
  // snapshot, e "Backup automático ativo" seria mentira aqui também.
  const [motivoBackup, setMotivoBackup] = useState<MotivoBackupNuvem | null>(null);
  const [autoBackupAtivo, setAutoBackupAtivo] = useState(true);
  const [ajudaAtiva, setAjudaAtiva] = useState(true);
  const [carregando, setCarregando] = useState(true);

  const [busyBackup, setBusyBackup] = useState(false);
  const [showBackups, setShowBackups] = useState(false);
  const [carregandoBackups, setCarregandoBackups] = useState(false);
  const [backups, setBackups] = useState<BackupVersionadoResumo[]>([]);
  const [restaurandoId, setRestaurandoId] = useState<string | null>(null);

  const [modoOrg, setModoOrg] = useState<'nenhum' | 'criar' | 'entrar'>('nenhum');
  const [nomeEmpresaForm, setNomeEmpresaForm] = useState('');
  const [codigoConviteForm, setCodigoConviteForm] = useState('');
  const [criandoEmpresa, setCriandoEmpresa] = useState(false);
  const [aceitandoConvite, setAceitandoConvite] = useState(false);

  const [saindo, setSaindo] = useState(false);
  const [apagandoLocal, setApagandoLocal] = useState(false);
  const [mostrarExcluir, setMostrarExcluir] = useState(false);
  const [textoExcluir, setTextoExcluir] = useState('');
  const [excluindoConta, setExcluindoConta] = useState(false);

  const load = useCallback(async () => {
    const emp = await getEmpresa();
    setEmpresa(emp);
    try {
      const toggle = await AsyncStorage.getItem(AUTO_BACKUP_TOGGLE_KEY);
      setAutoBackupAtivo(toggle !== '0');
    } catch { /* best-effort: mantém o default (ativo) */ }
    setAjudaAtiva(await estaAtiva());
    if (configured) {
      const u = await getCurrentUser();
      if (u) {
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
        setUser({
          email: u.email,
          nome: typeof meta.full_name === 'string' ? meta.full_name : undefined,
          telefone: typeof meta.telefone === 'string' ? meta.telefone : undefined,
          avatarUrl: typeof meta.avatar_url === 'string' && meta.avatar_url ? meta.avatar_url : undefined,
        });
        setAvatarErro(false);
        setSessaoPerdida(false);
        setLastBackup(await getUltimoBackupVersionadoData());
        // Nunca lança; devolve 'indeterminado' quando não consegue decidir.
        setMotivoBackup(await estadoBackupNuvem());
      } else {
        setUser(null);
        setSessaoPerdida(true);
        setLastBackup(null);
        setMotivoBackup(null);
      }
    }
    setCarregando(false);
  }, [configured]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => onSyncAplicado(() => { load(); }), [load]);

  // ─── Scroll-spy: observa cada card e acende o item correspondente na navegação
  // lateral. Refs por chave têm identidade estável (getRegistrar memoiza por
  // chave) para não recriar o callback de ref a cada render.
  const secaoNodes = useRef<Map<ChaveSecao, unknown>>(new Map());
  const registradores = useRef<Map<ChaveSecao, (node: unknown) => void>>(new Map());
  const getRegistrar = useCallback((chave: ChaveSecao) => {
    let fn = registradores.current.get(chave);
    if (!fn) {
      fn = (node: unknown) => {
        if (node) secaoNodes.current.set(chave, node);
        else secaoNodes.current.delete(chave);
      };
      registradores.current.set(chave, fn);
    }
    return fn;
  }, []);

  const [secaoAtiva, setSecaoAtiva] = useState<ChaveSecao>('perfil');

  useEffect(() => {
    // Este arquivo só monta na web (≥1024px) — document/IntersectionObserver são seguros.
    if (carregando || typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entradas) => {
        setSecaoAtiva((atual) => {
          const visiveis = entradas.filter((e) => e.isIntersecting);
          if (visiveis.length === 0) return atual;
          // Entre as visíveis, a mais próxima do topo é a "atual" (padrão scroll-spy).
          const topo = visiveis.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
          for (const [chave, no] of secaoNodes.current) {
            if (no === topo.target) return chave;
          }
          return atual;
        });
      },
      { rootMargin: '-15% 0px -65% 0px', threshold: [0, 1] },
    );
    secaoNodes.current.forEach((no) => observer.observe(no as Element));
    return () => observer.disconnect();
  }, [carregando]);

  function irParaSecao(chave: ChaveSecao) {
    const no = secaoNodes.current.get(chave) as HTMLElement | undefined;
    no?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  // ─── Foto de perfil (galeria — sem câmera: pouco natural em desktop) ────────
  async function handleEscolherFoto() {
    setSalvandoFoto(true);
    try {
      const resultado = await adicionarFotoGaleria([]);
      if (resultado.erro === 'PERMISSAO_NEGADA_PERMANENTE') {
        avisar('Fotos bloqueadas', 'Libere o acesso às fotos nas permissões do navegador para escolher sua foto.');
        return;
      }
      if (resultado.erro) { avisar('Ops', resultado.erro); return; }
      const uri = resultado.uris[0];
      if (!uri) return;
      await salvarFotoPerfil(uri);
      setUser((prev) => (prev ? { ...prev, avatarUrl: uri } : prev));
      setAvatarErro(false);
    } catch (e: any) {
      avisar('Erro', e?.message ?? 'Não foi possível salvar sua foto agora.');
    } finally {
      setSalvandoFoto(false);
    }
  }

  async function handleRemoverFoto() {
    setSalvandoFoto(true);
    try {
      await removerFotoPerfil();
      setUser((prev) => (prev ? { ...prev, avatarUrl: undefined } : prev));
      setAvatarErro(false);
    } catch (e: any) {
      avisar('Erro', e?.message ?? 'Não foi possível remover sua foto agora.');
    } finally {
      setSalvandoFoto(false);
    }
  }

  // ─── Backup ──────────────────────────────────────────────────────────────
  async function handleBackup() {
    setBusyBackup(true);
    try {
      const when = await backupManualVersionado();
      setLastBackup(when);
      avisar('Backup feito!', 'Seus dados estão seguros na nuvem.');
    } catch (e: any) {
      avisar('Erro', e?.message ?? 'Falha ao fazer backup.');
    }
    setBusyBackup(false);
  }

  async function handleToggleAutoBackup(v: boolean) {
    setAutoBackupAtivo(v);
    try {
      await AsyncStorage.setItem(AUTO_BACKUP_TOGGLE_KEY, v ? '1' : '0');
    } catch {
      avisar('Erro', 'Não foi possível salvar essa preferência agora.');
      setAutoBackupAtivo(!v);
    }
  }

  async function handleAbrirBackups() {
    setShowBackups(true);
    setCarregandoBackups(true);
    try {
      setBackups(await listBackupsVersionados());
    } catch (e: any) {
      avisar('Erro', e?.message ?? 'Não foi possível carregar as cópias de segurança.');
    }
    setCarregandoBackups(false);
  }

  async function handleRestaurarBackup(item: BackupVersionadoResumo) {
    if (!(await confirmar(
      'Restaurar esta cópia?',
      `Isso vai SUBSTITUIR os dados atuais deste navegador pelos da cópia de ${formatDateTime(item.criadoEm)} (${TIPO_BACKUP_LABEL[item.tipo]}). Essa ação não pode ser desfeita.`,
    ))) return;
    if (!(await confirmar(
      'Tem certeza?',
      'Todos os orçamentos, clientes, produtos e serviços salvos neste navegador agora serão substituídos pelos dessa cópia. Não é possível desfazer.',
    ))) return;
    setRestaurandoId(item.id);
    try {
      const when = await restoreBackupById(item.id);
      setShowBackups(false);
      avisar('Restaurado!', `Dados da cópia de ${formatDateTime(when)} aplicados.`);
      await load();
    } catch (e: any) {
      avisar('Erro', e?.message ?? 'Falha ao restaurar essa cópia.');
    }
    setRestaurandoId(null);
  }

  // ─── Organização / equipe ───────────────────────────────────────────────
  function alternarModoOrg(modo: 'criar' | 'entrar') {
    setModoOrg((atual) => (atual === modo ? 'nenhum' : modo));
    if (modo === 'criar') setNomeEmpresaForm(empresa?.nome || empresa?.nomePrestador || '');
  }

  async function handleCriarEmpresa() {
    if (!nomeEmpresaForm.trim()) return;
    setCriandoEmpresa(true);
    try {
      await criarOrganizacao(nomeEmpresaForm);
      avisar('Empresa criada!', 'Agora você pode convidar sua equipe pela aba Equipe.');
      setModoOrg('nenhum');
      await recarregarTipoConta();
      await load();
    } catch (e: any) {
      avisar('Não deu', e?.message ?? 'Não consegui criar a empresa agora.');
    } finally {
      setCriandoEmpresa(false);
    }
  }

  async function handleEntrarEquipe() {
    const token = extrairToken(codigoConviteForm);
    if (!token) {
      avisar('Código inválido', 'Cole o código ou o link completo do convite que você recebeu.');
      return;
    }
    setAceitandoConvite(true);
    try {
      const org2 = await aceitarConvite(token);
      avisar('Bem-vindo à equipe!', `Você entrou em ${org2.nome} como ${PAPEL_LABEL[org2.papel]}.`);
      setModoOrg('nenhum');
      setCodigoConviteForm('');
      await recarregarTipoConta();
      await load();
    } catch (e: any) {
      avisar('Não deu', e?.message ?? 'Não consegui aceitar o convite agora.');
    } finally {
      setAceitandoConvite(false);
    }
  }

  // ─── Zona de perigo ──────────────────────────────────────────────────────
  async function handleSairMantendoDados() {
    if (!(await confirmar('Sair da conta', 'Você continua com os dados salvos neste navegador. É só entrar de novo quando quiser.'))) return;
    setSaindo(true);
    try {
      // Mesma ordem da mobile: aborta o sync ANTES do signOut. Sem isto um pull em
      // voo grava depois da saída e o contexto de equipe de quem sai pode carimbar
      // linha de quem entra (o "apagar dados" logo abaixo já fazia certo).
      abortarSyncEmAndamento();
      // Rastro de sessão fora do SQLite (conversa com a OLLI, checklist do dia,
      // carimbos de sync): o AsyncStorage NÃO é particionado por conta, então isto
      // ficava visível para o próximo usuário deste navegador. Os DADOS, que é o
      // que o botão promete manter, seguem intactos na partição desta conta.
      // Paridade com a ContaScreen mobile — ver o comentário longo lá.
      await AsyncStorage.multiRemove(APP_DATA_STORAGE_KEYS).catch(() => {});
      await signOut();
    } catch (e: any) {
      avisar('Erro', e?.message ?? 'Não foi possível sair agora.');
    }
    setSaindo(false);
  }

  async function handleApagarDadosLocais() {
    if (!(await confirmar(
      'Apagar dados deste navegador?',
      'Isso vai apagar todos os orçamentos, clientes, produtos e serviços salvos NESTE navegador. Seus dados na nuvem (se houver backup) não são afetados — voltam no próximo sync.',
    ))) return;
    if (!(await confirmar('Tem certeza?', 'Essa ação não pode ser desfeita. Confirma a limpeza dos dados locais?'))) return;
    setApagandoLocal(true);
    try {
      // Interrompe qualquer sync em andamento ANTES de apagar — mesma ordem da mobile.
      abortarSyncEmAndamento();
      await clearAllLocalData();
      setEmpresa(null);
      avisar('Pronto', 'Os dados locais deste navegador foram apagados.');
      await load();
    } catch (e: any) {
      avisar('Erro', e?.message ?? 'Não foi possível apagar os dados agora.');
    }
    setApagandoLocal(false);
  }

  const confirmadoExcluir = textoExcluir.trim().toUpperCase() === 'EXCLUIR';

  async function handleExcluirConta() {
    if (!confirmadoExcluir || excluindoConta) return;
    if (!(await confirmar(
      'Excluir a conta agora?',
      'Esta é a última confirmação. Sua conta e todos os dados serão apagados para sempre. Não há como desfazer.',
    ))) return;
    setExcluindoConta(true);
    try {
      const res = await excluirConta();
      if (!res.ok) {
        const msg =
          res.motivo === 'nao_configurado' ? 'A exclusão online ainda não foi configurada. Fale com o suporte.'
          : res.motivo === 'sem_login' ? 'Sua sessão expirou. Entre de novo e tente outra vez.'
          : res.motivo === 'rede' ? 'Sem conexão agora. Verifique a internet e tente novamente.'
          : res.motivo === 'falha_cancelamento' ? 'Não consegui cancelar sua assinatura agora, então não apaguei nada. Sua conta e sua cobrança seguem como estavam. Tente de novo em alguns minutos.'
          : 'Não foi possível excluir a conta agora. Tente novamente em instantes.';
        avisar('Não deu', msg);
        setExcluindoConta(false);
        return;
      }
      setMostrarExcluir(false);
      avisar('Pronto', 'Sua conta foi excluída.');
    } catch (e: any) {
      avisar('Erro', e?.message ?? 'Falha ao excluir a conta.');
      setExcluindoConta(false);
    }
  }

  async function handleReverApresentacao() {
    await resetarAjuda();
    setAjudaAtiva(true);
    avisar('Tudo pronto!', 'A apresentação e as dicas vão aparecer de novo na próxima vez que você abrir o app.');
  }

  async function handleToggleAjuda(v: boolean) {
    setAjudaAtiva(v);
    if (v) await ligarAjuda();
    else await desligarAjuda();
  }

  const primeiroNome = user?.nome?.split(' ')[0] || empresa?.nomePrestador?.split(' ')[0] || 'prestador';
  const nomeExibido = user?.nome || empresa?.nomePrestador || 'Seu nome';
  const segmentoLabel = SEGMENTOS.find((s) => s.id === empresa?.segmento)?.label;
  const avatarUri = (!avatarErro && user?.avatarUrl) ? user.avatarUrl : (empresa?.logoUri || null);
  const temAssinaturaPaga = plano !== 'gratis';

  // GUARDA DEFENSIVO: sessão expirada dentro das Tabs (mesmo caso da mobile).
  if (sessaoPerdida) {
    return (
      <LayoutDesktop titulo="Conta">
        <View style={styles.guarda}>
          <MaterialCommunityIcons name="lock-alert-outline" size={40} color={cores.onSurfaceMuted} />
          <Text style={styles.guardaTitulo}>Sessão expirada</Text>
          <Text style={styles.guardaTexto}>
            Sua sessão terminou. Entre de novo para continuar usando o backup, a nuvem e a OLLI.
          </Text>
          <OlliButton
            label="Entrar de novo"
            variant="gradient"
            size="lg"
            onPress={() => {
              if (navigationRef.isReady()) navigationRef.reset({ index: 0, routes: [{ name: 'Entrar' }] });
            }}
            icon={<MaterialCommunityIcons name="login" size={20} color="#fff" />}
            style={{ marginTop: Spacing.lg }}
          />
        </View>
      </LayoutDesktop>
    );
  }

  return (
    <LayoutDesktop titulo="Conta" subtitulo={user?.email ?? nomeExibido}>
      {carregando ? (
        <View style={styles.carregandoWrap}>
          <ActivityIndicator size="large" color={cores.primary} />
        </View>
      ) : (
        <View style={styles.linha}>
          {/* NAVEGAÇÃO LATERAL — sticky, com scroll-spy */}
          <View style={styles.navColuna}>
            {SECOES.map((s) => {
              const ativo = secaoAtiva === s.chave;
              return (
                <Pressable
                  key={s.chave}
                  onPress={() => irParaSecao(s.chave)}
                  accessibilityRole="button"
                  accessibilityLabel={s.label}
                  style={({ hovered, focused }: PressableWebState) => [
                    styles.navItem,
                    ativo && styles.navItemAtivo,
                    hovered && !ativo && styles.navItemHover,
                    focused && styles.focoVisivel,
                  ]}
                >
                  <MaterialCommunityIcons name={s.icone} size={17} color={ativo ? cores.accentLight : cores.onSurfaceVariant} />
                  <Text style={[styles.navItemTexto, ativo && styles.navItemTextoAtivo]}>{s.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* COLUNA DE CONTEÚDO */}
          <View style={styles.conteudoColuna}>

            {/* PERFIL */}
            <Secao registrarRef={getRegistrar('perfil')} icone="account-circle-outline" titulo="Perfil" descricao="Seus dados de acesso e sua foto pessoal.">
              <View style={styles.perfilLinha}>
                <View style={styles.avatar}>
                  {salvandoFoto ? (
                    <ActivityIndicator color={cores.accentLight} />
                  ) : avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.avatarImg} onError={() => setAvatarErro(true)} />
                  ) : (
                    <Text style={styles.avatarTexto}>{primeiroNome.charAt(0).toUpperCase()}</Text>
                  )}
                </View>
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <Text style={styles.perfilNome} numberOfLines={1}>{nomeExibido}</Text>
                  {user?.email ? <Text style={styles.perfilSub} numberOfLines={1}>{user.email}</Text> : null}
                  {user?.telefone ? <Text style={styles.perfilSub} numberOfLines={1}>{formatarTelefoneExibicao(user.telefone)}</Text> : null}
                  {segmentoLabel ? (
                    <View style={styles.segChip}><Text style={styles.segChipTexto}>{segmentoLabel}</Text></View>
                  ) : null}
                </View>
                <OlliButton
                  label="Editar no Meu Negócio"
                  variant="outline"
                  size="sm"
                  onPress={() => nav.navigate('MeuNegocio')}
                  icon={<MaterialCommunityIcons name="pencil-outline" size={15} color={cores.accentLight} />}
                />
              </View>
              {configured && user && (
                <View style={styles.fotoLinks}>
                  <Pressable onPress={handleEscolherFoto} disabled={salvandoFoto} accessibilityRole="button" accessibilityLabel="Alterar foto de perfil">
                    <Text style={styles.fotoLink}>Alterar foto</Text>
                  </Pressable>
                  {user.avatarUrl ? (
                    <>
                      <Text style={styles.fotoLinkSeparador}>·</Text>
                      <Pressable onPress={handleRemoverFoto} disabled={salvandoFoto} accessibilityRole="button" accessibilityLabel="Remover foto de perfil">
                        <Text style={[styles.fotoLink, { color: cores.danger }]}>Remover foto</Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
              )}
            </Secao>

            {/* MINHA EMPRESA */}
            <Secao registrarRef={getRegistrar('empresa')} icone="storefront-outline" titulo="Minha empresa" descricao="Identidade, logo e marca — o que aparece nos seus PDFs.">
              <View style={styles.perfilLinha}>
                <View style={styles.avatarQuadrado}>
                  {empresa?.logoUri ? (
                    <Image source={{ uri: empresa.logoUri }} style={styles.avatarImgQuadrado} />
                  ) : (
                    <MaterialCommunityIcons name="storefront-outline" size={22} color={cores.accentLight} />
                  )}
                </View>
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <Text style={styles.perfilNome} numberOfLines={1}>{empresa?.nome || empresa?.nomePrestador || 'Sua empresa'}</Text>
                  <Text style={styles.perfilSub} numberOfLines={1}>{segmentoLabel ?? 'Personalize seu ramo, logo e assinatura'}</Text>
                </View>
              </View>
              <View style={styles.botoesLinha}>
                <OlliButton
                  label="Abrir Meu Negócio"
                  variant="primary"
                  size="md"
                  onPress={() => nav.navigate('MeuNegocio')}
                  icon={<MaterialCommunityIcons name="storefront-outline" size={17} color={cores.onPrimary} />}
                />
                <OlliButton
                  label="Modelos de documento"
                  variant="outline"
                  size="md"
                  onPress={() => nav.navigate('ModelosDocumento')}
                  icon={<MaterialCommunityIcons name="palette-swatch-outline" size={17} color={cores.accentLight} />}
                />
              </View>
            </Secao>

            {/* PLANO E ASSINATURA */}
            <Secao registrarRef={getRegistrar('plano')} icone="crown-outline" titulo="Plano e assinatura" descricao="O que o seu plano atual libera — e como evoluir.">
              {carregandoPlano ? (
                <ActivityIndicator color={cores.primary} />
              ) : temAssinaturaPaga ? (
                <View style={styles.planoLinha}>
                  <View style={[styles.linhaAcaoIcone, { backgroundColor: comAlfa(cores.accentLight, 0.14), borderColor: comAlfa(cores.accentLight, 0.32) }]}>
                    <MaterialCommunityIcons name="check-decagram" size={19} color={cores.accentLight} />
                  </View>
                  <View style={{ flex: 1, marginLeft: Spacing.md }}>
                    <Text style={styles.perfilNome}>Plano {PLANO_LABEL[plano]}</Text>
                    <Text style={styles.perfilSub}>Faturas, cobrança e cancelamento</Text>
                  </View>
                  <OlliButton
                    label="Gerenciar assinatura"
                    variant="outline"
                    size="md"
                    onPress={() => nav.navigate('Assinatura' as never)}
                  />
                </View>
              ) : (
                <View style={styles.upsellCard}>
                  <View style={styles.upsellCabecalho}>
                    <View style={styles.upsellBadge}>
                      <MaterialCommunityIcons name="crown-outline" size={15} color="#fff" />
                      <Text style={styles.upsellBadgeTexto}>OLLI PRO</Text>
                    </View>
                    <Text style={styles.upsellPreco}>R$ 39/mês</Text>
                  </View>
                  <Text style={styles.upsellTitulo}>Leve o seu negócio ao próximo nível</Text>
                  <Text style={styles.upsellTexto}>Relatórios avançados, metas de vendas e suporte prioritário. Assine mensal ou anual com desconto.</Text>
                  <OlliButton
                    label="Ver planos e assinar"
                    variant="gradient"
                    size="md"
                    onPress={() => nav.navigate('Planos')}
                    icon={<MaterialCommunityIcons name="arrow-right" size={16} color="#fff" />}
                    style={{ marginTop: Spacing.md, alignSelf: 'flex-start' }}
                  />
                </View>
              )}
            </Secao>

            {/* ORGANIZAÇÃO E EQUIPE */}
            <Secao registrarRef={getRegistrar('equipe')} icone="account-group-outline" titulo="Organização e equipe" descricao="Trabalhe com técnicos e defina o que cada um pode ver.">
              {!configured ? (
                <Text style={styles.textoMuted}>Disponível quando a nuvem estiver conectada.</Text>
              ) : carregandoConta || carregandoPermissao ? (
                <ActivityIndicator color={cores.primary} />
              ) : tipo === 'empresa' && org ? (
                <View style={styles.planoLinha}>
                  <View style={[styles.linhaAcaoIcone, { backgroundColor: comAlfa(cores.accentLight, 0.14), borderColor: comAlfa(cores.accentLight, 0.32) }]}>
                    <MaterialCommunityIcons name="office-building-outline" size={18} color={cores.accentLight} />
                  </View>
                  <View style={{ flex: 1, marginLeft: Spacing.md }}>
                    <Text style={styles.perfilNome} numberOfLines={1}>{org.nome}</Text>
                    <Text style={styles.perfilSub}>Você é {PAPEL_LABEL[org.papel]}</Text>
                  </View>
                  {pode('ver_equipe') && (
                    <OlliButton
                      label="Ir para Equipe"
                      variant="outline"
                      size="md"
                      onPress={() => nav.navigate('Equipe')}
                      icon={<MaterialCommunityIcons name="account-group-outline" size={17} color={cores.accentLight} />}
                    />
                  )}
                </View>
              ) : (
                <View>
                  <LinhaAcao
                    icone="rocket-launch-outline"
                    titulo="Criar conta empresa"
                    descricao="Convide técnicos e defina papéis"
                    onPress={() => alternarModoOrg('criar')}
                    direita={<MaterialCommunityIcons name={modoOrg === 'criar' ? 'chevron-up' : 'chevron-right'} size={18} color={cores.onSurfaceMuted} />}
                  />
                  {modoOrg === 'criar' && (
                    <View style={styles.formInline}>
                      <OlliInput
                        label="Nome da empresa"
                        value={nomeEmpresaForm}
                        onChangeText={setNomeEmpresaForm}
                        placeholder="Ex.: Refrigeração Silva"
                        containerStyle={{ marginBottom: Spacing.sm }}
                      />
                      <OlliButton
                        label="Criar empresa"
                        variant="gradient"
                        size="md"
                        loading={criandoEmpresa}
                        disabled={!nomeEmpresaForm.trim()}
                        onPress={handleCriarEmpresa}
                        icon={<MaterialCommunityIcons name="office-building-outline" size={17} color="#fff" />}
                      />
                    </View>
                  )}

                  <LinhaAcao
                    icone="ticket-confirmation-outline"
                    titulo="Tenho um código de convite"
                    descricao="Entre numa equipe já existente"
                    onPress={() => alternarModoOrg('entrar')}
                    direita={<MaterialCommunityIcons name={modoOrg === 'entrar' ? 'chevron-up' : 'chevron-right'} size={18} color={cores.onSurfaceMuted} />}
                  />
                  {modoOrg === 'entrar' && (
                    <View style={styles.formInline}>
                      <OlliInput
                        label="Código do convite"
                        value={codigoConviteForm}
                        onChangeText={setCodigoConviteForm}
                        placeholder="Cole aqui o código ou o link"
                        autoCapitalize="none"
                        autoCorrect={false}
                        containerStyle={{ marginBottom: Spacing.sm }}
                      />
                      <OlliButton
                        label="Entrar na equipe"
                        variant="gradient"
                        size="md"
                        loading={aceitandoConvite}
                        disabled={!codigoConviteForm.trim()}
                        onPress={handleEntrarEquipe}
                        icon={<MaterialCommunityIcons name="account-multiple-plus-outline" size={17} color="#fff" />}
                      />
                    </View>
                  )}
                </View>
              )}
            </Secao>

            {/* BACKUP E SINCRONIZAÇÃO */}
            <Secao registrarRef={getRegistrar('backup')} icone="cloud-sync-outline" titulo="Backup e sincronização" descricao="Seus dados protegidos e disponíveis em qualquer aparelho.">
              {!configured ? (
                <View>
                  <Text style={styles.textoMuted}>
                    Para ativar o backup na nuvem, é preciso criar um projeto gratuito no Supabase e colar 2 chaves no app.
                  </Text>
                  {['Crie conta grátis em supabase.com', 'Cole a URL e a chave no arquivo de configuração', 'Pronto: login e backup automático'].map((t, i) => (
                    <View key={t} style={styles.passoRow}>
                      <Text style={styles.passoNum}>{i + 1}</Text>
                      <Text style={styles.passoTexto}>{t}</Text>
                    </View>
                  ))}
                </View>
              ) : user ? (
                <View>
                  <View style={styles.planoLinha}>
                    <View style={[styles.linhaAcaoIcone, { backgroundColor: comAlfa(cores.success, 0.14), borderColor: comAlfa(cores.success, 0.32) }]}>
                      <MaterialCommunityIcons name="account" size={18} color={cores.success} />
                    </View>
                    <View style={{ flex: 1, marginLeft: Spacing.md }}>
                      <Text style={styles.perfilNome} numberOfLines={1}>{user.email}</Text>
                      <View style={styles.conectadoLinha}>
                        <View style={styles.conectadoDot} />
                        <Text style={styles.conectadoTexto}>Conectado à nuvem</Text>
                      </View>
                    </View>
                  </View>

                  {(() => {
                    const r = resumoBackupNuvem(motivoBackup, autoBackupAtivo, lastBackup);
                    const corTom = r.tom === 'success' ? cores.success : r.tom === 'warning' ? cores.warning : cores.onSurfaceMuted;
                    return (
                      <View style={styles.backupStatus}>
                        <MaterialCommunityIcons name={r.icone} size={18} color={corTom} />
                        <Text style={styles.textoMuted}>{r.texto}</Text>
                      </View>
                    );
                  })()}

                  {/* MEMBRO DE EQUIPE: paridade com a ContaScreen mobile — a guarda
                      de backup.ts recusa o snapshot dele (o banco local contém a
                      base da empresa), então o toggle e o botão de enviar sairiam
                      de cena em vez de mentir. "Ver cópias de segurança" fica: as
                      cópias que ele tem são dele. */}
                  {motivoBackup === 'somente_dono' ? (
                    <Text style={[styles.perfilSub, { marginBottom: Spacing.md }]}>
                      {COPY_BACKUP_NUVEM.somente_dono.detalhe}
                    </Text>
                  ) : (
                    <>
                      {motivoBackup === 'indeterminado' && (
                        <Text style={[styles.perfilSub, { marginBottom: Spacing.md }]}>
                          {COPY_BACKUP_NUVEM.indeterminado.detalhe}
                        </Text>
                      )}
                      <View style={styles.autoBackupRow}>
                        <View style={{ flex: 1, marginRight: Spacing.md }}>
                          <Text style={styles.perfilNome}>Backup automático diário</Text>
                          <Text style={styles.perfilSub}>Guarda uma cópia por dia na nuvem, sem precisar apertar nada</Text>
                        </View>
                        <Switch
                          value={autoBackupAtivo}
                          onValueChange={handleToggleAutoBackup}
                          trackColor={{ false: cores.outlineDark, true: comAlfa(cores.primary, 0.55) }}
                          thumbColor={autoBackupAtivo ? cores.primary : cores.surface}
                        />
                      </View>
                    </>
                  )}

                  <View style={styles.botoesLinha}>
                    {motivoBackup !== 'somente_dono' && (
                      <OlliButton
                        label="Fazer backup agora"
                        variant="gradient"
                        size="md"
                        loading={busyBackup}
                        onPress={handleBackup}
                        icon={<MaterialCommunityIcons name="cloud-upload" size={17} color="#fff" />}
                      />
                    )}
                    <OlliButton
                      label="Ver cópias de segurança"
                      variant="outline"
                      size="md"
                      onPress={handleAbrirBackups}
                      icon={<MaterialCommunityIcons name="history" size={17} color={cores.accentLight} />}
                    />
                  </View>
                </View>
              ) : null}
            </Secao>

            {/* APARÊNCIA */}
            <Secao registrarRef={getRegistrar('aparencia')} icone="palette-swatch-outline" titulo="Aparência" descricao="Modo claro/escuro, cor da marca e dicas na tela.">
              <SeletorTema />
              <View style={styles.divisor} />
              <LinhaAcao
                icone="lightbulb-on-outline"
                titulo="Mostrar dicas contextuais"
                descricao="Balões curtos explicando elementos da tela"
                direita={
                  <Switch
                    value={ajudaAtiva}
                    onValueChange={handleToggleAjuda}
                    trackColor={{ false: cores.outlineDark, true: comAlfa(cores.primary, 0.55) }}
                    thumbColor={ajudaAtiva ? cores.primary : cores.surface}
                  />
                }
              />
              <LinhaAcao
                icone="restart"
                corIcone="#A78BFA"
                titulo="Rever apresentação e dicas"
                descricao="Mostra a introdução e as dicas de novo"
                onPress={handleReverApresentacao}
                direita={<MaterialCommunityIcons name="chevron-right" size={18} color={cores.onSurfaceMuted} />}
              />
            </Secao>

            {/* ZONA DE PERIGO */}
            <Secao registrarRef={getRegistrar('perigo')} icone="alert-octagon-outline" titulo="Zona de perigo" descricao="Ações permanentes. Use com cuidado." perigo>
              {!configured || !user ? (
                <Text style={styles.textoMuted}>Conecte-se à nuvem para gerenciar sua conta.</Text>
              ) : (
                <View>
                  <LinhaAcao
                    icone="logout"
                    titulo="Sair da conta"
                    descricao="Mantém os dados salvos neste navegador"
                    onPress={handleSairMantendoDados}
                    desabilitado={saindo}
                    direita={saindo ? <ActivityIndicator size="small" color={cores.onSurfaceVariant} /> : <MaterialCommunityIcons name="chevron-right" size={18} color={cores.onSurfaceMuted} />}
                  />
                  <LinhaAcao
                    icone="delete-sweep-outline"
                    corIcone={cores.warning}
                    titulo="Limpar dados locais deste navegador"
                    descricao="Apaga os dados salvos aqui — a nuvem não é afetada"
                    onPress={handleApagarDadosLocais}
                    desabilitado={apagandoLocal}
                    direita={apagandoLocal ? <ActivityIndicator size="small" color={cores.warning} /> : <MaterialCommunityIcons name="chevron-right" size={18} color={cores.onSurfaceMuted} />}
                  />
                  <LinhaAcao
                    icone="account-remove-outline"
                    corIcone={cores.danger}
                    titulo="Excluir minha conta"
                    descricao="Apaga sua conta e todos os dados para sempre"
                    onPress={() => setMostrarExcluir((v) => !v)}
                    direita={<MaterialCommunityIcons name={mostrarExcluir ? 'chevron-up' : 'chevron-right'} size={18} color={cores.danger} />}
                  />

                  {mostrarExcluir && (
                    <View style={styles.excluirBox}>
                      <View style={styles.perigoBanner}>
                        <MaterialCommunityIcons name="alert-octagon-outline" size={20} color={cores.danger} />
                        <Text style={styles.perigoBannerTexto}>Esta ação é permanente e não pode ser desfeita.</Text>
                      </View>
                      <Text style={styles.excluirSub}>Ao excluir a conta, apagamos para sempre:</Text>
                      {[
                        'Seu login e o perfil da sua conta',
                        'Orçamentos, clientes, produtos e serviços',
                        'Agenda, recibos e demais registros',
                        'Backups e dados guardados na nuvem',
                      ].map((item) => (
                        <View key={item} style={styles.excluirItem}>
                          <MaterialCommunityIcons name="close-circle-outline" size={15} color={cores.danger} />
                          <Text style={styles.excluirItemTexto}>{item}</Text>
                        </View>
                      ))}
                      <Text style={styles.excluirNota}>
                        Se você tem uma assinatura ativa, ela será cancelada automaticamente ao excluir a conta.
                      </Text>
                      <OlliInput
                        label="Para confirmar, digite EXCLUIR"
                        value={textoExcluir}
                        onChangeText={setTextoExcluir}
                        placeholder="EXCLUIR"
                        autoCapitalize="characters"
                        autoCorrect={false}
                        containerStyle={{ marginTop: Spacing.md, marginBottom: 0 }}
                      />
                      <View style={styles.botoesLinha}>
                        <OlliButton
                          label="Excluir minha conta"
                          variant="danger"
                          size="md"
                          loading={excluindoConta}
                          disabled={!confirmadoExcluir}
                          onPress={handleExcluirConta}
                          icon={<MaterialCommunityIcons name="account-remove-outline" size={17} color="#fff" />}
                        />
                        <OlliButton
                          label="Cancelar"
                          variant="ghost"
                          size="md"
                          onPress={() => { setMostrarExcluir(false); setTextoExcluir(''); }}
                        />
                      </View>
                    </View>
                  )}
                </View>
              )}
            </Secao>
          </View>
        </View>
      )}

      {/* MODAL: cópias de segurança */}
      <Modal visible={showBackups} transparent animationType="fade" onRequestClose={() => setShowBackups(false)}>
        <View style={styles.modalRaiz}>
          <Pressable style={styles.modalFundo} onPress={() => setShowBackups(false)} accessibilityRole="button" accessibilityLabel="Fechar" />
          <View style={styles.modalCard}>
            <View style={styles.modalCabecalho}>
              <Text style={styles.modalTitulo}>Cópias de segurança</Text>
              <Pressable
                onPress={() => setShowBackups(false)}
                accessibilityRole="button"
                accessibilityLabel="Fechar"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={({ hovered, focused }: PressableWebState) => [styles.modalFechar, hovered && styles.modalFecharHover, focused && styles.focoVisivel]}
              >
                <MaterialCommunityIcons name="close" size={22} color={cores.onSurface} />
              </Pressable>
            </View>
            <View style={styles.modalCorpo}>
              {carregandoBackups ? (
                <ActivityIndicator color={cores.primary} style={{ marginVertical: Spacing.xl }} />
              ) : backups.length === 0 ? (
                <View style={styles.backupsVazio}>
                  <MaterialCommunityIcons name="cloud-off-outline" size={30} color={cores.onSurfaceMuted} />
                  <Text style={styles.backupsVazioTexto}>Nenhuma cópia de segurança ainda. Elas aparecem aqui assim que o primeiro backup automático ou manual for feito.</Text>
                </View>
              ) : (
                backups.map((b) => (
                  <View key={b.id} style={styles.backupItem}>
                    <View style={[styles.linhaAcaoIcone, { backgroundColor: comAlfa(cores.primary, 0.14), borderColor: comAlfa(cores.primary, 0.32) }]}>
                      <MaterialCommunityIcons
                        name={b.tipo === 'manual' ? 'content-save-outline' : b.tipo === 'semanal' ? 'calendar-week' : 'calendar-today'}
                        size={18}
                        color={cores.primary}
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: Spacing.md }}>
                      <Text style={styles.perfilNome}>{formatDateTime(b.criadoEm)}</Text>
                      <Text style={styles.perfilSub}>{TIPO_BACKUP_LABEL[b.tipo]} · ~{b.tamanhoAprox} KB</Text>
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
            </View>
          </View>
        </View>
      </Modal>
    </LayoutDesktop>
  );
}

/** Card de seção — cabeçalho (ícone+título+descrição) + corpo. `registrarRef` alimenta o scroll-spy. */
function Secao({
  registrarRef, icone, titulo, descricao, perigo, children,
}: {
  registrarRef: (node: unknown) => void;
  icone: keyof typeof MaterialCommunityIcons.glyphMap;
  titulo: string;
  descricao?: string;
  perigo?: boolean;
  children: React.ReactNode;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const corIcone = perigo ? cores.danger : cores.accentLight;
  return (
    <View ref={registrarRef} style={[styles.secao, perigo && styles.secaoPerigo]}>
      <View style={styles.secaoCabecalho}>
        <View style={[styles.secaoIcone, { backgroundColor: comAlfa(corIcone, 0.14), borderColor: comAlfa(corIcone, 0.32) }]}>
          <MaterialCommunityIcons name={icone} size={19} color={corIcone} />
        </View>
        <View style={{ flex: 1, marginLeft: Spacing.md }}>
          <Text style={styles.secaoTitulo}>{titulo}</Text>
          {descricao && <Text style={styles.secaoDescricao}>{descricao}</Text>}
        </View>
      </View>
      <View style={styles.secaoCorpo}>{children}</View>
    </View>
  );
}

/** Linha "ícone + título + descrição + controle à direita" — reusada em opções, toggles e ações. */
function LinhaAcao({
  icone, corIcone, titulo, descricao, onPress, direita, desabilitado,
}: {
  icone: keyof typeof MaterialCommunityIcons.glyphMap;
  corIcone?: string;
  titulo: string;
  descricao?: string;
  onPress?: () => void;
  direita?: React.ReactNode;
  desabilitado?: boolean;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const cor = corIcone ?? cores.accentLight;
  const conteudo = (
    <>
      <View style={[styles.linhaAcaoIcone, { backgroundColor: comAlfa(cor, 0.14), borderColor: comAlfa(cor, 0.32) }]}>
        <MaterialCommunityIcons name={icone} size={17} color={cor} />
      </View>
      <View style={{ flex: 1, marginLeft: Spacing.md, marginRight: Spacing.sm }}>
        <Text style={styles.perfilNome}>{titulo}</Text>
        {descricao && <Text style={styles.perfilSub}>{descricao}</Text>}
      </View>
      {direita}
    </>
  );
  if (!onPress) {
    return <View style={styles.linhaAcao}>{conteudo}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={desabilitado}
      accessibilityRole="button"
      accessibilityLabel={titulo}
      style={({ hovered, focused }: PressableWebState) => [
        styles.linhaAcao,
        styles.linhaAcaoClicavel,
        hovered && !desabilitado && styles.linhaAcaoHover,
        focused && styles.focoVisivel,
      ]}
    >
      {conteudo}
    </Pressable>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  focoVisivel: {
    outlineWidth: 2,
    outlineColor: c.accent,
    outlineStyle: 'solid',
    outlineOffset: 2,
  } as any,

  carregandoWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xxxl },

  guarda: { alignItems: 'center', paddingVertical: Spacing.xxxl, paddingHorizontal: Spacing.xl },
  guardaTitulo: { ...Typography.h2, color: c.onBackground, marginTop: Spacing.lg },
  guardaTexto: { ...Typography.body, color: c.onSurfaceVariant, textAlign: 'center', marginTop: Spacing.sm, maxWidth: 420 },

  // ── Layout de duas colunas ──────────────────────────────────────────────
  linha: {
    flexDirection: 'row',
    gap: Spacing.xxl,
    alignItems: 'flex-start',
    width: '100%',
  },
  navColuna: {
    width: 240,
    flexShrink: 0,
    gap: 2,
    position: 'sticky',
    top: Spacing.xxl,
  } as any,
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
  },
  navItemHover: { backgroundColor: c.surfacePressed },
  navItemAtivo: { backgroundColor: c.surfacePressed, borderLeftColor: c.accent },
  navItemTexto: { ...Typography.bodySmall, color: c.onSurfaceVariant, fontWeight: '600' },
  navItemTextoAtivo: { color: c.onSurface, fontWeight: '800' },

  conteudoColuna: {
    flex: 1,
    minWidth: 0,
    maxWidth: 860,
    gap: Spacing.xl,
  },

  // ── Card de seção ────────────────────────────────────────────────────────
  secao: {
    backgroundColor: c.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: c.outline,
    padding: Spacing.lg,
    ...sombrasDe(c).sm,
  },
  secaoPerigo: {
    borderColor: comAlfa(c.danger, 0.4),
  },
  secaoCabecalho: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  secaoIcone: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secaoTitulo: { ...Typography.h4, color: c.onSurface },
  secaoDescricao: { ...Typography.bodySmall, color: c.onSurfaceVariant, marginTop: 2 },
  secaoCorpo: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: c.outline,
    gap: Spacing.md,
  },

  // ── Perfil / Minha empresa ───────────────────────────────────────────────
  perfilLinha: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 52, height: 52, borderRadius: BorderRadius.chip, backgroundColor: c.primaryContainer, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 52, height: 52, borderRadius: 16 },
  avatarTexto: { fontSize: 20, fontWeight: '800', color: c.accentLight },
  avatarQuadrado: { width: 52, height: 52, borderRadius: BorderRadius.md, backgroundColor: c.accentContainer, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImgQuadrado: { width: 52, height: 52, borderRadius: BorderRadius.md },
  perfilNome: { ...Typography.h4, fontSize: 15, color: c.onSurface },
  perfilSub: { ...Typography.bodySmall, color: c.onSurfaceVariant, marginTop: 2 },
  segChip: { alignSelf: 'flex-start', backgroundColor: comAlfa(c.accentLight, 0.14), borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 2, marginTop: 6 },
  segChipTexto: { ...Typography.caption, fontWeight: '700', color: c.accentLight },
  fotoLinks: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: Spacing.md },
  fotoLink: { ...Typography.bodySmall, fontWeight: '700', color: c.accentLight },
  fotoLinkSeparador: { color: c.onSurfaceMuted },

  botoesLinha: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },

  // ── Plano / equipe ───────────────────────────────────────────────────────
  planoLinha: { flexDirection: 'row', alignItems: 'center' },
  upsellCard: { backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline, padding: Spacing.md },
  upsellCabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  upsellBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.plan, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  upsellBadgeTexto: { ...Typography.caption, fontWeight: '800', color: '#fff' },
  upsellPreco: { ...Typography.bodySmall, fontWeight: '700', color: c.onSurfaceVariant },
  upsellTitulo: { ...Typography.h4, color: c.onSurface, marginTop: Spacing.sm },
  upsellTexto: { ...Typography.bodySmall, color: c.onSurfaceVariant, marginTop: 4, lineHeight: 19 },

  textoMuted: { ...Typography.bodySmall, color: c.onSurfaceVariant, lineHeight: 19, flex: 1 },

  formInline: { marginTop: Spacing.sm, marginBottom: Spacing.sm, paddingLeft: Spacing.xl },

  // ── Backup ────────────────────────────────────────────────────────────────
  conectadoLinha: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  conectadoDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.success },
  conectadoTexto: { ...Typography.caption, color: c.success, fontWeight: '700' },
  backupStatus: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  autoBackupRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline, padding: Spacing.md },
  passoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  passoNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: c.primaryContainer, color: c.primary, fontWeight: '800', textAlign: 'center', lineHeight: 22, fontSize: 12 },
  passoTexto: { ...Typography.bodySmall, color: c.onSurface, flex: 1 },

  // ── Linha de ação reusável ───────────────────────────────────────────────
  linhaAcao: { flexDirection: 'row', alignItems: 'center', borderRadius: BorderRadius.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm },
  linhaAcaoClicavel: {},
  linhaAcaoHover: { backgroundColor: c.surfacePressed },
  linhaAcaoIcone: { width: 34, height: 34, borderRadius: BorderRadius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  divisor: { height: 1, backgroundColor: c.outline, marginVertical: Spacing.sm },

  // ── Zona de perigo ───────────────────────────────────────────────────────
  excluirBox: { marginTop: Spacing.sm, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: c.outline },
  perigoBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: comAlfa(c.danger, 0.12), borderRadius: BorderRadius.md, borderWidth: 1, borderColor: comAlfa(c.danger, 0.3), padding: Spacing.md },
  perigoBannerTexto: { flex: 1, ...Typography.bodySmall, fontWeight: '700', color: c.onSurface },
  excluirSub: { ...Typography.bodySmall, color: c.onSurfaceVariant, marginTop: Spacing.md, marginBottom: 4 },
  excluirItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 3 },
  excluirItemTexto: { flex: 1, ...Typography.bodySmall, color: c.onSurface, lineHeight: 18 },
  excluirNota: { ...Typography.caption, color: c.onSurfaceMuted, lineHeight: 17, marginTop: Spacing.sm },

  // ── Modal (cópias de segurança) ──────────────────────────────────────────
  modalRaiz: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  modalFundo: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(5,12,22,0.6)' },
  modalCard: { width: 520, maxHeight: '80%', backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, ...sombrasDe(c).lg },
  modalCabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: c.outline },
  modalTitulo: { ...Typography.h3, color: c.onSurface },
  modalFechar: { width: 32, height: 32, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center' },
  modalFecharHover: { backgroundColor: c.surfacePressed },
  modalCorpo: { padding: Spacing.lg },
  backupsVazio: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  backupsVazioTexto: { ...Typography.bodySmall, color: c.onSurfaceVariant, textAlign: 'center', lineHeight: 19 },
  backupItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline, padding: Spacing.md, marginBottom: Spacing.sm },
});
