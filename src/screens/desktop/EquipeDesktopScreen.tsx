import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, Switch, ActivityIndicator, Modal, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, comAlfa, type Cores } from '../../theme';
import { LayoutDesktop } from '../../components/web/LayoutDesktop';
import { TabelaDados, Coluna } from '../../components/web/TabelaDados';
import { BarraBusca, normalizarBusca } from '../../components/web/BarraBusca';
import { EmptyState } from '../../components/EmptyState';
import { OlliInput } from '../../components/OlliInput';
import { OlliButton } from '../../components/OlliButton';
import { PressableWebState } from '../../components/web/pressableWebState';
import { useTipoConta } from '../../hooks/useTipoConta';
import { usePermissao } from '../../hooks/usePermissao';
import {
  listarMembros,
  definirAtivoMembro,
  criarConvite,
  PAPEL_LABEL,
  PAPEL_DESCRICAO,
  PAPEIS_CONVIDAVEIS,
  type MembroEquipe,
  type Papel,
} from '../../services/equipe';
import { formatDate } from '../../utils/date';
import { avisar } from './dialogo';

type LinhaMembro = MembroEquipe & { id: string };

/**
 * Cor do chip de papel — mesmo critério visual da EquipeScreen mobile (função,
 * não Record de módulo: as cores vêm da paleta atual). Owner destaca.
 */
function corPapel(c: Cores): Record<Papel, string> {
  return {
    owner: c.accentLight,
    admin: c.primaryLight,
    gestor: '#A78BFA',
    tecnico: c.onSurfaceVariant,
  };
}

/** Descrição do papel para o tooltip da coluna Papel. Owner não está em
 * PAPEL_DESCRICAO (nunca é alvo de convite — é quem cria a organização). */
function descricaoPapel(papel: Papel): string {
  if (papel === 'owner') return 'Acesso total: gerencia tudo, inclusive cobrança e exclusão da empresa.';
  return PAPEL_DESCRICAO[papel];
}

/**
 * Equipe desktop (v4) — tabela de membros com busca e painel lateral de
 * convite (escolha de papel + link gerado, cópia em um clique). Reaproveita
 * listarMembros/definirAtivoMembro/criarConvite já usados na EquipeScreen
 * mobile — mesmo gate de conta (empresa + ver_equipe) — sem tocar nela.
 */
export default function EquipeDesktopScreen() {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const { org, tipo, carregando: carregandoConta } = useTipoConta();
  const { pode } = usePermissao();
  const podeGerenciar = pode('gerenciar_equipe');
  const podeVer = pode('ver_equipe');

  const [membros, setMembros] = useState<MembroEquipe[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [alterandoId, setAlterandoId] = useState<string | null>(null);
  const [painelVisivel, setPainelVisivel] = useState(false);

  const carregar = useCallback(async () => {
    if (!org) { setCarregando(false); return; }
    setCarregando(true);
    const lista = await listarMembros(org.id);
    // Mesma ordenação padrão da EquipeScreen mobile: ativos primeiro; owner/admin no topo.
    const peso: Record<Papel, number> = { owner: 0, admin: 1, gestor: 2, tecnico: 3 };
    lista.sort((a, b) => {
      if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
      return (peso[a.papel] ?? 9) - (peso[b.papel] ?? 9);
    });
    setMembros(lista);
    setCarregando(false);
  }, [org]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  async function handleToggleAtivo(m: MembroEquipe) {
    if (!org || m.papel === 'owner') return; // o dono nunca é desativado por aqui
    const novo = !m.ativo;
    setAlterandoId(m.userId);
    try {
      await definirAtivoMembro(org.id, m.userId, novo);
      setMembros((prev) => prev.map((x) => (x.userId === m.userId ? { ...x, ativo: novo } : x)));
    } catch (e: any) {
      avisar('Não deu', e?.message ?? 'Não consegui alterar esse membro agora.');
    }
    setAlterandoId(null);
  }

  const linhas: LinhaMembro[] = useMemo(() => {
    let r: LinhaMembro[] = membros.map((m) => ({ ...m, id: m.userId }));
    if (busca.trim()) {
      const q = normalizarBusca(busca);
      r = r.filter((m) => normalizarBusca(m.nome ?? '').includes(q) || normalizarBusca(m.email ?? '').includes(q));
    }
    return r;
  }, [membros, busca]);

  const colunas: Coluna<LinhaMembro>[] = useMemo(() => [
    {
      chave: 'membro',
      titulo: 'Membro',
      largura: '30%',
      ordenavel: true,
      valorOrdenacao: (m) => m.nome || m.email || '',
      render: (m) => <MembroCelula membro={m} />,
      tituloCompleto: (m) => m.nome || m.email,
    },
    {
      chave: 'papel',
      titulo: 'Papel',
      largura: 170,
      ordenavel: true,
      valorOrdenacao: (m) => PAPEL_LABEL[m.papel],
      render: (m) => <PapelChip papel={m.papel} />,
      tituloCompleto: (m) => descricaoPapel(m.papel),
    },
    {
      chave: 'status',
      titulo: 'Status',
      largura: 130,
      ordenavel: true,
      valorOrdenacao: (m) => (m.ativo ? 0 : 1),
      render: (m) => <StatusBadgeMembro ativo={m.ativo} />,
    },
    {
      chave: 'desde',
      titulo: 'Desde',
      largura: 120,
      ordenavel: true,
      valorOrdenacao: (m) => m.criadoEm ?? '',
      render: (m) => <Text style={styles.celulaTexto}>{m.criadoEm ? formatDate(m.criadoEm) : '—'}</Text>,
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      largura: 110,
      render: (m) => (
        <AcoesMembro
          membro={m}
          podeGerenciar={podeGerenciar}
          alterando={alterandoId === m.userId}
          onToggle={() => handleToggleAtivo(m)}
        />
      ),
    },
  ], [styles, podeGerenciar, alterandoId]);

  // Conta pessoal ou papel sem visão de equipe: mesma mensagem honesta da tela mobile.
  if (!carregandoConta && (tipo !== 'empresa' || !org || !podeVer)) {
    return (
      <LayoutDesktop titulo="Equipe">
        <EmptyState
          icon="account-group-outline"
          title="Equipe"
          subtitle={
            tipo !== 'empresa'
              ? 'A gestão de equipe é do plano Empresa. Crie sua conta empresa na aba Conta para convidar técnicos.'
              : 'Seu papel não permite ver a equipe. Fale com o dono ou um administrador.'
          }
        />
      </LayoutDesktop>
    );
  }

  const ativos = membros.filter((m) => m.ativo).length;

  return (
    <LayoutDesktop
      titulo="Equipe"
      subtitulo={
        carregandoConta
          ? undefined
          : `${membros.length} ${membros.length === 1 ? 'membro' : 'membros'} · ${ativos} ${ativos === 1 ? 'ativo' : 'ativos'}`
      }
      acoes={
        <>
          <BarraBusca valor={busca} aoMudar={setBusca} placeholder="Buscar por nome ou e-mail…" />
          {podeGerenciar && (
            <Pressable
              onPress={() => setPainelVisivel(true)}
              accessibilityRole="button"
              accessibilityLabel="Convidar para a equipe"
              style={({ hovered, focused }: PressableWebState) => [styles.botaoNovo, hovered && styles.botaoNovoHover, focused && styles.focoVisivel]}
            >
              <MaterialCommunityIcons name="account-plus-outline" size={18} color={cores.onPrimary} />
              <Text style={styles.botaoNovoLabel}>Convidar</Text>
            </Pressable>
          )}
        </>
      }
    >
      <TabelaDados<LinhaMembro>
        colunas={colunas}
        dados={linhas}
        carregando={carregandoConta || carregando}
        vazio={
          <EmptyState
            icon="account-group-outline"
            title="Só você por aqui ainda"
            subtitle={podeGerenciar ? 'Convide seu primeiro técnico para a equipe.' : 'Ainda não há outros membros na equipe.'}
            actionLabel={podeGerenciar ? 'Convidar para a equipe' : undefined}
            onAction={podeGerenciar ? () => setPainelVisivel(true) : undefined}
          />
        }
      />

      {podeGerenciar && org && (
        <PainelConvite nomeOrg={org.nome} visivel={painelVisivel} aoFechar={() => setPainelVisivel(false)} />
      )}
    </LayoutDesktop>
  );
}

// ─── célula: membro (avatar + nome + e-mail) ──────────────────
function MembroCelula({ membro }: { membro: MembroEquipe }) {
  const styles = useEstilos(criarEstilos);
  const nome = membro.nome || membro.email || 'Membro da equipe';
  const inicial = nome.charAt(0).toUpperCase();
  return (
    <View style={styles.membroCelula}>
      <View style={styles.membroAvatar}>
        <Text style={styles.membroAvatarTexto}>{inicial}</Text>
      </View>
      <View style={styles.membroTextos}>
        <Text style={styles.membroNome} numberOfLines={1}>{nome}</Text>
        {membro.email && membro.nome ? (
          <Text style={styles.membroEmail} numberOfLines={1}>{membro.email}</Text>
        ) : null}
      </View>
    </View>
  );
}

// ─── célula: chip do papel (com tooltip da descrição) ─────────
function PapelChip({ papel }: { papel: Papel }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const cor = corPapel(cores)[papel];
  return (
    <View style={[styles.papelChip, { borderColor: comAlfa(cor, 0.35), backgroundColor: comAlfa(cor, 0.12) }]}>
      <Text style={[styles.papelChipTexto, { color: cor }]}>{PAPEL_LABEL[papel]}</Text>
    </View>
  );
}

// ─── célula: badge de status (ativo/desativado) ───────────────
function StatusBadgeMembro({ ativo }: { ativo: boolean }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const cor = ativo ? cores.success : cores.warning;
  return (
    <View style={[styles.statusBadge, { borderColor: comAlfa(cor, 0.35), backgroundColor: comAlfa(cor, 0.12) }]}>
      <View style={[styles.statusDot, { backgroundColor: cor }]} />
      <Text style={[styles.statusTexto, { color: cor }]}>{ativo ? 'Ativo' : 'Desativado'}</Text>
    </View>
  );
}

// ─── célula: ações (switch p/ quem gerencia, coroa p/ dono, — p/ leitura) ───
function AcoesMembro({
  membro, podeGerenciar, alterando, onToggle,
}: {
  membro: MembroEquipe;
  podeGerenciar: boolean;
  alterando: boolean;
  onToggle: () => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const ehOwner = membro.papel === 'owner';

  if (ehOwner) {
    return (
      <View style={styles.acoesLinha}>
        <MaterialCommunityIcons name="crown-outline" size={18} color={cores.accentLight} accessibilityLabel="Dono da empresa" />
      </View>
    );
  }
  if (!podeGerenciar) {
    return <Text style={styles.celulaTextoMuted}>—</Text>;
  }
  if (alterando) {
    return <ActivityIndicator size="small" color={cores.accentLight} />;
  }
  return (
    <Switch
      value={membro.ativo}
      onValueChange={onToggle}
      trackColor={{ false: cores.outline, true: comAlfa(cores.primary, 0.5) }}
      thumbColor={membro.ativo ? cores.primary : '#fff'}
      accessibilityLabel={membro.ativo ? 'Desativar membro' : 'Ativar membro'}
    />
  );
}

// ─── painel lateral: convidar (mesmo idioma visual do PainelCliente) ───────
function PainelConvite({
  nomeOrg, visivel, aoFechar,
}: {
  nomeOrg: string;
  visivel: boolean;
  aoFechar: () => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [papel, setPapel] = useState<Exclude<Papel, 'owner'>>('tecnico');
  const [email, setEmail] = useState('');
  const [gerando, setGerando] = useState(false);
  const [resultado, setResultado] = useState<{ token: string; link: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  function reset() {
    setPapel('tecnico');
    setEmail('');
    setResultado(null);
    setCopiado(false);
  }

  function fechar() {
    aoFechar();
    // Limpa depois do fade — evita "piscar" o formulário zerado antes de sumir.
    setTimeout(reset, 200);
  }

  async function gerar() {
    setGerando(true);
    try {
      const r = await criarConvite(papel, email.trim() || undefined);
      setResultado(r);
    } catch (e: any) {
      avisar('Não deu', e?.message ?? 'Não consegui criar o convite agora.');
    }
    setGerando(false);
  }

  function mensagemConvite(link: string): string {
    return `Você foi convidado para a equipe de ${nomeOrg} no OLLI, como ${PAPEL_LABEL[papel]}. Toque para entrar:\n${link}`;
  }

  async function copiarLink() {
    if (!resultado) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(resultado.link);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      } else {
        avisar('Copiar link', 'Selecione e copie o link manualmente.');
      }
    } catch {
      avisar('Copiar link', 'Não foi possível copiar automaticamente. Selecione e copie o link manualmente.');
    }
  }

  function enviarWhatsApp() {
    if (!resultado) return;
    // Sem número específico: wa.me/?text= abre o WhatsApp com a mensagem pronta
    // para o dono ESCOLHER o contato — mesma decisão da EquipeScreen mobile
    // (abrirWhatsApp exigiria um número, que aqui não existe).
    const url = `https://wa.me/?text=${encodeURIComponent(mensagemConvite(resultado.link))}`;
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={fechar}>
      <View style={styles.raiz}>
        <Pressable style={styles.fundoClicavel} onPress={fechar} accessibilityRole="button" accessibilityLabel="Fechar" />
        <View style={styles.painel}>
          <View style={styles.cabecalho}>
            <Text style={styles.tituloPainel}>{resultado ? 'Convite pronto' : 'Convidar para a equipe'}</Text>
            <Pressable
              onPress={fechar}
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ hovered, focused }: PressableWebState) => [styles.botaoFechar, hovered && styles.botaoFecharHover, focused && styles.focoVisivel]}
            >
              <MaterialCommunityIcons name="close" size={22} color={cores.onSurface} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.conteudo}>
            {!resultado ? (
              <>
                <Text style={styles.rotulo}>Papel na equipe</Text>
                <View style={{ gap: Spacing.sm, marginBottom: Spacing.lg }}>
                  {PAPEIS_CONVIDAVEIS.map((p) => (
                    <OpcaoPapel key={p} papel={p} selecionado={papel === p} onPress={() => setPapel(p)} />
                  ))}
                </View>

                <OlliInput
                  label="E-mail (opcional)"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="para lembrar quem você convidou"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  leftIcon="email-outline"
                />
                <Text style={styles.dica}>
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
                  style={{ marginTop: Spacing.lg }}
                />
              </>
            ) : (
              <>
                <View style={styles.sucessoIcone}>
                  <MaterialCommunityIcons name="check-circle-outline" size={36} color={cores.success} />
                </View>
                <Text style={styles.sucessoTitulo}>Link do convite gerado</Text>
                <Text style={styles.sucessoSub}>
                  Compartilhe com quem você quer na equipe como {PAPEL_LABEL[papel]}. O link vale por 7 dias.
                </Text>

                <View style={styles.linkBox}>
                  <Text style={styles.linkTexto} numberOfLines={2}>{resultado.link}</Text>
                </View>

                <Pressable
                  onPress={copiarLink}
                  accessibilityRole="button"
                  accessibilityLabel="Copiar link do convite"
                  style={({ hovered, focused }: PressableWebState) => [styles.botaoCopiar, hovered && styles.botaoCopiarHover, focused && styles.focoVisivel]}
                >
                  <MaterialCommunityIcons name={copiado ? 'check' : 'content-copy'} size={17} color={cores.primary} />
                  <Text style={styles.botaoCopiarTexto}>{copiado ? 'Copiado!' : 'Copiar link'}</Text>
                </Pressable>

                <OlliButton
                  label="Enviar pelo WhatsApp"
                  variant="success"
                  size="lg"
                  fullWidth
                  onPress={enviarWhatsApp}
                  icon={<MaterialCommunityIcons name="whatsapp" size={20} color="#fff" />}
                  style={{ marginTop: Spacing.md }}
                />
                <OlliButton
                  label="Convidar outra pessoa"
                  variant="ghost"
                  size="md"
                  fullWidth
                  onPress={reset}
                  style={{ marginTop: Spacing.xs }}
                />
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── opção de papel (radio card) no painel de convite ─────────
function OpcaoPapel({
  papel, selecionado, onPress,
}: {
  papel: Exclude<Papel, 'owner'>;
  selecionado: boolean;
  onPress: () => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selecionado }}
      accessibilityLabel={PAPEL_LABEL[papel]}
      style={({ hovered, focused }: PressableWebState) => [
        styles.opcaoPapel,
        selecionado && styles.opcaoPapelSel,
        !selecionado && hovered && styles.opcaoPapelHover,
        focused && styles.focoVisivel,
      ]}
    >
      <View style={[styles.radio, selecionado && styles.radioSel]}>
        {selecionado ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.opcaoTextos}>
        <Text style={[styles.opcaoTitulo, selecionado && { color: cores.accentLight }]}>{PAPEL_LABEL[papel]}</Text>
        <Text style={styles.opcaoDesc}>{PAPEL_DESCRICAO[papel]}</Text>
      </View>
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
  botaoNovo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: c.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  botaoNovoHover: {
    backgroundColor: c.primaryLight,
  },
  botaoNovoLabel: {
    ...Typography.button,
    color: c.onPrimary,
    fontSize: 13,
  },
  celulaTexto: {
    ...Typography.bodySmall,
    color: c.onSurface,
  },
  celulaTextoMuted: {
    ...Typography.bodySmall,
    color: c.onSurfaceMuted,
  },

  // coluna Membro
  membroCelula: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  membroAvatar: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.sm,
    backgroundColor: c.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  membroAvatarTexto: {
    fontSize: 14,
    fontWeight: '800',
    color: c.accentLight,
  },
  membroTextos: {
    marginLeft: Spacing.sm,
    minWidth: 0,
    flexShrink: 1,
  },
  membroNome: {
    ...Typography.bodySmall,
    fontWeight: '700',
    color: c.onSurface,
  },
  membroEmail: {
    fontSize: 11.5,
    color: c.onSurfaceMuted,
    marginTop: 1,
  },

  // coluna Papel
  papelChip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  papelChipTexto: {
    fontSize: 11,
    fontWeight: '800',
  },

  // coluna Status
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusTexto: {
    fontSize: 11.5,
    fontWeight: '700',
  },

  // coluna Ações
  acoesLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },

  // painel de convite (mesmo idioma do PainelCliente)
  raiz: {
    flex: 1,
    flexDirection: 'row',
  },
  fundoClicavel: {
    flex: 1,
    backgroundColor: 'rgba(5,12,22,0.60)',
  },
  painel: {
    width: 420,
    height: '100%',
    backgroundColor: c.surface,
    borderLeftWidth: 1,
    borderLeftColor: c.outline,
  },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: c.outline,
  },
  tituloPainel: {
    ...Typography.h3,
    color: c.onSurface,
  },
  botaoFechar: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoFecharHover: {
    backgroundColor: c.surfacePressed,
  },
  conteudo: {
    padding: Spacing.xl,
  },
  rotulo: {
    fontSize: 13,
    fontWeight: '800',
    color: c.onSurfaceVariant,
    marginBottom: Spacing.sm,
    letterSpacing: 0.2,
  },
  dica: {
    fontSize: 12.5,
    color: c.onSurfaceMuted,
    lineHeight: 18,
    marginTop: Spacing.sm,
  },

  opcaoPapel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surfaceGlass,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: c.outlineDark,
    padding: Spacing.md,
  },
  opcaoPapelHover: {
    backgroundColor: c.surfacePressed,
  },
  opcaoPapelSel: {
    borderColor: c.accent,
    backgroundColor: c.accentContainer,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: c.outlineDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSel: {
    borderColor: c.accent,
  },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: c.accent,
  },
  opcaoTextos: {
    flex: 1,
    marginLeft: Spacing.sm,
    minWidth: 0,
  },
  opcaoTitulo: {
    fontSize: 14.5,
    fontWeight: '800',
    color: c.onSurface,
  },
  opcaoDesc: {
    fontSize: 12,
    color: c.onSurfaceVariant,
    marginTop: 2,
    lineHeight: 16,
  },

  sucessoIcone: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: BorderRadius.lg,
    backgroundColor: c.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  sucessoTitulo: {
    fontSize: 18,
    fontWeight: '800',
    color: c.onSurface,
    textAlign: 'center',
    marginTop: Spacing.base,
  },
  sucessoSub: {
    fontSize: 13.5,
    color: c.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 6,
  },
  linkBox: {
    backgroundColor: c.surfaceGlass,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: c.strokeGlow,
    padding: Spacing.md,
    marginTop: Spacing.lg,
  },
  linkTexto: {
    fontSize: 12.5,
    color: c.accentLight,
    fontWeight: '600',
  },
  botaoCopiar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: c.outlineDark,
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    marginTop: Spacing.sm,
  },
  botaoCopiarHover: {
    backgroundColor: c.surfacePressed,
  },
  botaoCopiarTexto: {
    fontSize: 13,
    fontWeight: '700',
    color: c.primary,
  },
});
