import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, ActivityIndicator, Image, StyleSheet, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, corStatusOS, type Cores } from '../../theme';
import { OlliButton } from '../../components/OlliButton';
import { PressableWebState } from '../../components/web/pressableWebState';
// Contrato da ONDA 4 — mesmas funções de serviço usadas pela OrdemServicoScreen
// mobile (DetalheOS). Nenhuma regra de negócio é reimplementada aqui.
import {
  getOrdem,
  atualizarStatusOS,
  atribuirTecnico,
  atualizarChecklist,
} from '../../services/ordemServico';
import { saveOrdemServico } from '../../database/database';
import { listarMembros, type MembroEquipe } from '../../services/equipe';
import { STATUS_OS_LABELS, STATUS_OS_CORES } from '../../types';
import type { OrdemServico, StatusOS, ItemChecklist } from '../../types';
import { generateId } from '../../utils/id';
import { formatDateTime } from '../../utils/date';
import { avisar } from './dialogo';

const STATUS_OS_ORDEM: StatusOS[] = ['aberta', 'agendada', 'em_execucao', 'pausada', 'concluida', 'cancelada'];

/** Valor numérico → "R$ 1.234,56". */
function formatarValor(v?: number): string {
  if (typeof v !== 'number' || Number.isNaN(v)) return '';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** ISO → valor aceito por um `<input type="datetime-local">` (sem segundos/Z). */
function isoParaDatetimeLocal(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface Props {
  ordemId: string | null;
  orgId?: string;
  /**
   * Papel do usuário — espelha EXATAMENTE a regra da OrdemServicoScreen mobile
   * (DetalheOS): quem chama passa `ehGestao` e `podeAtribuir = ehGestao &&
   * pode('ver_agenda_equipe')`. Sem isto, um técnico reatribuía técnico,
   * reagendava e cancelava OS — ações que a tela mobile nega a ele.
   */
  ehGestao: boolean;
  podeAtribuir: boolean;
  visivel: boolean;
  /** Abre o painel já com a atribuição de técnico ou o agendamento em foco (ações rápidas da tabela). */
  focoInicial?: 'tecnico' | 'agenda';
  aoFechar: () => void;
  aoMudou: () => void;
}

/**
 * Painel lateral de detalhe/edição de uma Ordem de Serviço — generalização do
 * padrão PainelCliente para a OS (ver direção "onda 1", item 3: detalhe em
 * painel lateral, sem sair da lista). Reaproveita EXATAMENTE as funções de
 * `services/ordemServico` usadas pelo app do técnico (mobile); só a casca de
 * UI é desktop. Fotos ficam só como leitura aqui — captura é fluxo de campo.
 */
export function PainelOS({ ordemId, orgId, ehGestao, podeAtribuir, visivel, focoInicial, aoFechar, aoMudou }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [ordem, setOrdem] = useState<OrdemServico | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvandoStatus, setSalvandoStatus] = useState<StatusOS | null>(null);
  const [showAtribuir, setShowAtribuir] = useState(false);
  const [editandoAgenda, setEditandoAgenda] = useState(false);
  const [dataAgendaForm, setDataAgendaForm] = useState('');
  const [salvandoAgenda, setSalvandoAgenda] = useState(false);

  const checklistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback(async () => {
    if (!ordemId) return;
    setCarregando(true);
    const o = await getOrdem(ordemId);
    setOrdem(o);
    setCarregando(false);
  }, [ordemId]);

  useEffect(() => {
    if (visivel && ordemId) carregar();
  }, [visivel, ordemId, carregar]);

  // Foco inicial vindo da ação rápida da linha da tabela (Atribuir técnico / Agendar).
  useEffect(() => {
    if (!visivel || carregando) return;
    // Só abre o foco rápido se o papel PODE fazer a ação (senão o link nem existe).
    if (focoInicial === 'tecnico' && podeAtribuir) setShowAtribuir(true);
    if (focoInicial === 'agenda' && ehGestao) {
      setDataAgendaForm(isoParaDatetimeLocal(ordem?.dataAgendada));
      setEditandoAgenda(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visivel, carregando, focoInicial, podeAtribuir, ehGestao]);

  useEffect(() => () => {
    if (checklistTimer.current) clearTimeout(checklistTimer.current);
  }, []);

  // Reseta os estados de edição locais ao fechar, para o próximo item abrir limpo.
  useEffect(() => {
    if (!visivel) {
      setShowAtribuir(false);
      setEditandoAgenda(false);
      setOrdem(null);
    }
  }, [visivel]);

  async function mudarStatus(status: StatusOS) {
    if (!ordem || ordem.status === status) return;
    setSalvandoStatus(status);
    try {
      await atualizarStatusOS(ordem.id, status);
      setOrdem((prev) => (prev ? { ...prev, status } : prev));
      aoMudou();
    } catch (e: any) {
      avisar('Não deu', e?.message ?? 'Não consegui mudar o status agora.');
    } finally {
      setSalvandoStatus(null);
    }
  }

  function toggleItem(itemId: string) {
    if (!ordem) return;
    let listaParaSalvar: ItemChecklist[] | null = null;
    setOrdem((prev) => {
      if (!prev) return prev;
      const novo = prev.checklist.map((c) => (c.id === itemId ? { ...c, feito: !c.feito } : c));
      listaParaSalvar = novo;
      return { ...prev, checklist: novo };
    });
    if (!listaParaSalvar) return;
    const paraSalvar = listaParaSalvar;
    if (checklistTimer.current) clearTimeout(checklistTimer.current);
    checklistTimer.current = setTimeout(() => {
      atualizarChecklist(ordem.id, paraSalvar).then(aoMudou).catch(() => avisar('Não deu', 'Não consegui salvar a alteração do checklist. Tente de novo.'));
    }, 500);
  }

  function removerItem(itemId: string) {
    if (!ordem) return;
    let listaParaSalvar: ItemChecklist[] | null = null;
    setOrdem((prev) => {
      if (!prev) return prev;
      const novo = prev.checklist.filter((c) => c.id !== itemId);
      listaParaSalvar = novo;
      return { ...prev, checklist: novo };
    });
    if (!listaParaSalvar) return;
    atualizarChecklist(ordem.id, listaParaSalvar).then(aoMudou).catch(() => avisar('Não deu', 'Não consegui salvar a alteração do checklist. Tente de novo.'));
  }

  function adicionarItem(texto: string) {
    if (!ordem) return;
    const t = texto.trim();
    if (!t) return;
    const item: ItemChecklist = { id: generateId(), texto: t, feito: false };
    let listaParaSalvar: ItemChecklist[] | null = null;
    setOrdem((prev) => {
      if (!prev) return prev;
      const novo = [...prev.checklist, item];
      listaParaSalvar = novo;
      return { ...prev, checklist: novo };
    });
    if (!listaParaSalvar) return;
    atualizarChecklist(ordem.id, listaParaSalvar).then(aoMudou).catch(() => avisar('Não deu', 'Não consegui salvar a alteração do checklist. Tente de novo.'));
  }

  // Não há mutação dedicada de agenda no contrato de services/ordemServico (o app
  // de campo não a expõe) — reusa a MESMA função de persistência (saveOrdemServico)
  // que o serviço usa por baixo, sem reimplementar numeração/dedupe/nenhuma regra.
  async function salvarAgenda() {
    if (!ordem) return;
    setSalvandoAgenda(true);
    try {
      const iso = dataAgendaForm ? new Date(dataAgendaForm).toISOString() : undefined;
      // Lê fresco antes de escrever (mesmo padrão do patchOrdem do serviço):
      // evita sobrescrever com estado React defasado se o checklist mudou.
      const base = (await getOrdem(ordem.id)) ?? ordem;
      const atualizada: OrdemServico = { ...base, dataAgendada: iso, atualizadoEm: new Date().toISOString() };
      await saveOrdemServico(atualizada);
      setOrdem(atualizada);
      setEditandoAgenda(false);
      aoMudou();
    } catch (e: any) {
      avisar('Não deu', e?.message ?? 'Não consegui salvar o agendamento agora.');
    } finally {
      setSalvandoAgenda(false);
    }
  }

  const feitos = ordem?.checklist?.filter((c) => c.feito).length ?? 0;
  const total = ordem?.checklist?.length ?? 0;
  const concluida = ordem?.status === 'concluida';

  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={aoFechar}>
      <View style={styles.raiz}>
        <Pressable style={styles.fundoClicavel} onPress={aoFechar} accessibilityRole="button" accessibilityLabel="Fechar" />
        <View style={styles.painel}>
          <View style={styles.cabecalho}>
            <View style={{ flex: 1, marginRight: Spacing.md }}>
              <Text style={styles.titulo} numberOfLines={1}>{ordem?.titulo || 'Ordem de serviço'}</Text>
              <Text style={styles.subtitulo}>{ordem?.numero ? `Nº ${ordem.numero}` : ''}</Text>
            </View>
            {ordem && <StatusChip status={ordem.status} />}
            <Pressable
              onPress={aoFechar}
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ hovered, focused }: PressableWebState) => [styles.botaoFechar, hovered && styles.botaoFecharHover, focused && styles.focoVisivel]}
            >
              <MaterialCommunityIcons name="close" size={22} color={cores.onSurface} />
            </Pressable>
          </View>

          {carregando || !ordem ? (
            <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={cores.primary} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
              {/* Resumo */}
              <View style={styles.bloco}>
                <LinhaInfo icon="account-outline" label="Cliente" valor={ordem.clienteNome || '—'} />
                {typeof ordem.valor === 'number' && (
                  <LinhaInfo icon="cash" label="Valor" valor={formatarValor(ordem.valor)} />
                )}
                <LinhaInfo icon="account-hard-hat" label="Técnico" valor={ordem.tecnicoNome || '—'} />
                {ordem.descricao ? <Text style={styles.descricao}>{ordem.descricao}</Text> : null}
              </View>

              {/* Agendamento */}
              <View style={styles.bloco}>
                <View style={styles.blocoHeaderRow}>
                  <Text style={styles.blocoTitulo}>Agendamento</Text>
                  {/* Agendar/reagendar é ação de gestão (dispatch). O técnico vê a
                      data como leitura, igual ao DetalheOS mobile. */}
                  {ehGestao && !editandoAgenda && (
                    <Pressable
                      onPress={() => { setDataAgendaForm(isoParaDatetimeLocal(ordem.dataAgendada)); setEditandoAgenda(true); }}
                      accessibilityRole="button"
                      accessibilityLabel="Editar agendamento"
                      style={({ hovered, focused }: PressableWebState) => [styles.linkAcao, hovered && styles.linkAcaoHover, focused && styles.focoVisivel]}
                    >
                      <MaterialCommunityIcons name="calendar-edit" size={15} color={cores.accentLight} />
                      <Text style={styles.linkAcaoTexto}>{ordem.dataAgendada ? 'Alterar' : 'Agendar'}</Text>
                    </Pressable>
                  )}
                </View>
                {editandoAgenda ? (
                  <View style={{ marginTop: 8, gap: 10 }}>
                    <CampoDataHora valor={dataAgendaForm} aoMudar={setDataAgendaForm} />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <OlliButton label="Cancelar" variant="ghost" size="sm" onPress={() => setEditandoAgenda(false)} disabled={salvandoAgenda} />
                      <OlliButton label="Salvar agendamento" variant="gradient" size="sm" loading={salvandoAgenda} onPress={salvarAgenda} />
                    </View>
                  </View>
                ) : (
                  <Text style={styles.valorGrande}>{ordem.dataAgendada ? formatDateTime(ordem.dataAgendada) : 'Sem data agendada'}</Text>
                )}
              </View>

              {/* Técnico */}
              <View style={styles.bloco}>
                <View style={styles.blocoHeaderRow}>
                  <Text style={styles.blocoTitulo}>Técnico responsável</Text>
                  {/* Só quem pode atribuir (gestão com ver_agenda_equipe) troca o
                      técnico — igual ao `{podeAtribuir && ...}` do DetalheOS mobile. */}
                  {podeAtribuir && (
                    <Pressable
                      onPress={() => setShowAtribuir(true)}
                      accessibilityRole="button"
                      accessibilityLabel={ordem.tecnicoNome ? 'Trocar técnico' : 'Atribuir técnico'}
                      style={({ hovered, focused }: PressableWebState) => [styles.linkAcao, hovered && styles.linkAcaoHover, focused && styles.focoVisivel]}
                    >
                      <MaterialCommunityIcons name="account-arrow-right-outline" size={15} color={cores.accentLight} />
                      <Text style={styles.linkAcaoTexto}>{ordem.tecnicoNome ? 'Trocar' : 'Atribuir'}</Text>
                    </Pressable>
                  )}
                </View>
                <Text style={styles.valorGrande}>{ordem.tecnicoNome || 'Ninguém atribuído ainda'}</Text>
              </View>

              {/* Status */}
              <View style={styles.bloco}>
                <Text style={styles.blocoTitulo}>Status</Text>
                <View style={styles.statusGrid}>
                  {/* Técnico não cancela OS — mesmo filtro do DetalheOS mobile. */}
                  {STATUS_OS_ORDEM.filter((s) => s !== 'cancelada' || ehGestao).map((s) => {
                    const ativo = ordem.status === s;
                    const corBase = STATUS_OS_CORES[s];
                    const cor = corBase ? corStatusOS(corBase, cores.surface) : cores.primary;
                    const fundo = corBase ?? cores.primary;
                    const salvando = salvandoStatus === s;
                    return (
                      <Pressable
                        key={s}
                        onPress={() => mudarStatus(s)}
                        disabled={salvando}
                        accessibilityRole="button"
                        accessibilityLabel={`Mudar status para ${STATUS_OS_LABELS[s]}`}
                        style={({ hovered, focused }: PressableWebState) => [
                          styles.statusOpt,
                          ativo && { backgroundColor: `${fundo}22`, borderColor: cor },
                          !ativo && hovered && styles.statusOptHover,
                          focused && styles.focoVisivel,
                        ]}
                      >
                        {salvando ? (
                          <ActivityIndicator size="small" color={cor} />
                        ) : (
                          <Text style={[styles.statusOptText, ativo && { color: cor }]}>{STATUS_OS_LABELS[s]}</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Checklist */}
              <View style={styles.bloco}>
                <View style={styles.blocoHeaderRow}>
                  <Text style={styles.blocoTitulo}>Checklist</Text>
                  {total > 0 && <Text style={styles.blocoContador}>{feitos}/{total}</Text>}
                </View>
                {ordem.checklist.length === 0 ? (
                  <Text style={styles.vazioTexto}>Nenhum item ainda.</Text>
                ) : (
                  ordem.checklist.map((c) => (
                    <View key={c.id} style={styles.checkRow}>
                      <Pressable
                        onPress={() => toggleItem(c.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: c.feito }}
                        accessibilityLabel={c.texto}
                        style={styles.checkTap}
                      >
                        <MaterialCommunityIcons
                          name={c.feito ? 'checkbox-marked' : 'checkbox-blank-outline'}
                          size={20}
                          color={c.feito ? cores.success : cores.onSurfaceVariant}
                        />
                        <Text style={[styles.checkTexto, c.feito && styles.checkTextoFeito]} numberOfLines={2}>{c.texto}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => removerItem(c.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel="Remover item"
                      >
                        <MaterialCommunityIcons name="close" size={16} color={cores.onSurfaceMuted} />
                      </Pressable>
                    </View>
                  ))
                )}
                <AdicionarItemChecklist onAdicionar={adicionarItem} />
              </View>

              {/* Fotos (leitura — a captura é feita em campo, no app) */}
              {ordem.fotos.length > 0 && (
                <View style={styles.bloco}>
                  <Text style={styles.blocoTitulo}>Fotos do serviço</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {ordem.fotos.map((uri) => (
                        <Image key={uri} source={{ uri }} style={styles.foto} />
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}

              {ordem.observacoes ? (
                <View style={styles.bloco}>
                  <Text style={styles.blocoTitulo}>Observações</Text>
                  <Text style={styles.descricao}>{ordem.observacoes}</Text>
                </View>
              ) : null}

              <OlliButton
                label={concluida ? 'Serviço concluído' : 'Concluir serviço'}
                variant={concluida ? 'success' : 'gradient'}
                size="lg"
                fullWidth
                loading={salvandoStatus === 'concluida'}
                disabled={concluida}
                onPress={() => mudarStatus('concluida')}
                icon={<MaterialCommunityIcons name="check-circle-outline" size={20} color="#fff" />}
                style={{ marginTop: Spacing.sm }}
              />
            </ScrollView>
          )}
        </View>
      </View>

      {showAtribuir && ordem && (
        <ModalAtribuirTecnico
          orgId={orgId}
          ordemId={ordem.id}
          tecnicoAtual={ordem.tecnicoId}
          onFechar={() => setShowAtribuir(false)}
          onAtribuido={(id, nome) => {
            setOrdem((prev) => (prev ? { ...prev, tecnicoId: id, tecnicoNome: nome } : prev));
            setShowAtribuir(false);
            aoMudou();
          }}
        />
      )}
    </Modal>
  );
}

/** Chip de status — mesmos tokens (STATUS_OS_CORES/LABELS) da OS mobile. */
function StatusChip({ status }: { status: StatusOS }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const corBase = STATUS_OS_CORES[status];
  const cor = corBase ? corStatusOS(corBase, cores.surface) : cores.onSurfaceVariant;
  const fundo = corBase ?? cores.onSurfaceVariant;
  return (
    <View style={[styles.statusChip, { backgroundColor: `${fundo}22`, borderColor: `${fundo}66` }]}>
      <Text style={[styles.statusChipTexto, { color: cor }]}>{STATUS_OS_LABELS[status] ?? status}</Text>
    </View>
  );
}

function LinhaInfo({ icon, label, valor }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; valor: string }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.infoRow}>
      <MaterialCommunityIcons name={icon} size={15} color={cores.onSurfaceVariant} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValor} numberOfLines={1}>{valor}</Text>
    </View>
  );
}

/** Input nativo do navegador (`<input type="datetime-local">`) — RN-Web não tem
 * equivalente de calendário+hora embutido; segue o mesmo precedente de
 * `CelulaComTooltip` (TabelaDados) de usar um elemento DOM cru só na web. */
function CampoDataHora({ valor, aoMudar }: { valor: string; aoMudar: (v: string) => void }) {
  const cores = useCores();
  if (Platform.OS !== 'web') return null;
  return React.createElement('input', {
    type: 'datetime-local',
    value: valor,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => aoMudar(e.target.value),
    style: {
      fontFamily: 'inherit',
      fontSize: 14,
      color: cores.onSurface,
      backgroundColor: cores.surface,
      border: `1px solid ${cores.outline}`,
      borderRadius: BorderRadius.md,
      padding: '10px 12px',
      outline: 'none',
      width: '100%',
      boxSizing: 'border-box',
    },
  });
}

function AdicionarItemChecklist({ onAdicionar }: { onAdicionar: (texto: string) => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [texto, setTexto] = useState('');
  function confirmar() {
    if (!texto.trim()) return;
    onAdicionar(texto);
    setTexto('');
  }
  if (Platform.OS !== 'web') return null;
  return (
    <View style={styles.addItemRow}>
      {React.createElement('input', {
        value: texto,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setTexto(e.target.value),
        onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') confirmar(); },
        placeholder: 'Adicionar item...',
        style: {
          flex: 1, fontFamily: 'inherit', fontSize: 14, color: cores.onSurface,
          backgroundColor: cores.surface, border: `1px solid ${cores.outline}`,
          borderRadius: BorderRadius.md, padding: '10px 12px', outline: 'none',
        },
      })}
      <Pressable onPress={confirmar} accessibilityRole="button" accessibilityLabel="Adicionar item" style={styles.addItemBtn}>
        <MaterialCommunityIcons name="plus" size={18} color={cores.accentLight} />
      </Pressable>
    </View>
  );
}

/** Atribuir/trocar técnico — mesma fonte de dados (listarMembros) e mutação
 * (atribuirTecnico) do ModalAtribuir da OS mobile; casca desktop (hover). */
function ModalAtribuirTecnico({
  orgId, ordemId, tecnicoAtual, onFechar, onAtribuido,
}: {
  orgId?: string; ordemId: string; tecnicoAtual?: string;
  onFechar: () => void; onAtribuido: (id: string, nome: string) => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [membros, setMembros] = useState<MembroEquipe[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      if (!orgId) { setCarregando(false); return; }
      const lista = await listarMembros(orgId);
      if (!ativo) return;
      const ativos = lista.filter((m) => m.ativo);
      const peso = (p: MembroEquipe['papel']) => (p === 'tecnico' ? 0 : 1);
      ativos.sort((a, b) => peso(a.papel) - peso(b.papel));
      setMembros(ativos);
      setCarregando(false);
    })();
    return () => { ativo = false; };
  }, [orgId]);

  async function atribuir(m: MembroEquipe) {
    const nome = m.nome || m.email || 'Técnico';
    setSalvandoId(m.userId);
    try {
      await atribuirTecnico(ordemId, m.userId, nome);
      onAtribuido(m.userId, nome);
    } catch (e: any) {
      avisar('Não deu', e?.message ?? 'Não consegui atribuir agora.');
    } finally {
      setSalvandoId(null);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onFechar}>
      <View style={styles.raiz}>
        <Pressable style={styles.fundoClicavel} onPress={onFechar} accessibilityRole="button" accessibilityLabel="Fechar" />
        <View style={styles.sheet}>
          <View style={styles.cabecalho}>
            <Text style={styles.titulo}>Atribuir técnico</Text>
            <Pressable onPress={onFechar} accessibilityRole="button" accessibilityLabel="Fechar" style={({ hovered, focused }: PressableWebState) => [styles.botaoFechar, hovered && styles.botaoFecharHover, focused && styles.focoVisivel]}>
              <MaterialCommunityIcons name="close" size={22} color={cores.onSurface} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: Spacing.xl }}>
            {carregando ? (
              <ActivityIndicator size="small" color={cores.primary} />
            ) : membros.length === 0 ? (
              <Text style={styles.vazioTexto}>
                {orgId ? 'Nenhum membro ativo na equipe. Convide técnicos na tela Equipe.' : 'Crie a conta empresa para ter uma equipe.'}
              </Text>
            ) : (
              membros.map((m) => {
                const nome = m.nome || m.email || 'Técnico';
                const inicial = nome.charAt(0).toUpperCase();
                const atual = m.userId === tecnicoAtual;
                return (
                  <Pressable
                    key={m.userId}
                    onPress={() => atribuir(m)}
                    disabled={salvandoId === m.userId}
                    accessibilityRole="button"
                    accessibilityLabel={`Atribuir a ${nome}`}
                    style={({ hovered, focused }: PressableWebState) => [
                      styles.membroRow,
                      atual && styles.membroRowAtual,
                      hovered && !atual && styles.membroRowHover,
                      focused && styles.focoVisivel,
                    ]}
                  >
                    <View style={styles.membroAvatar}><Text style={styles.membroAvatarText}>{inicial}</Text></View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.membroNome} numberOfLines={1}>{nome}</Text>
                      <Text style={styles.membroPapel}>{m.papel === 'tecnico' ? 'Técnico' : m.papel}</Text>
                    </View>
                    {salvandoId === m.userId ? (
                      <ActivityIndicator size="small" color={cores.accentLight} />
                    ) : atual ? (
                      <MaterialCommunityIcons name="check-circle" size={20} color={cores.success} />
                    ) : (
                      <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceMuted} />
                    )}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  focoVisivel: { outlineWidth: 2, outlineColor: c.accent, outlineStyle: 'solid', outlineOffset: 2 } as any,
  raiz: { flex: 1, flexDirection: 'row' },
  fundoClicavel: { flex: 1, backgroundColor: 'rgba(5,12,22,0.60)' },
  painel: { width: 420, height: '100%', backgroundColor: c.surface, borderLeftWidth: 1, borderLeftColor: c.outline },
  sheet: { width: 420, maxHeight: '80%', alignSelf: 'center', marginTop: '10%', marginRight: '20%', backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, overflow: 'hidden' },
  cabecalho: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg, borderBottomWidth: 1, borderBottomColor: c.outline, gap: Spacing.sm,
  },
  titulo: { ...Typography.h3, color: c.onSurface },
  subtitulo: { ...Typography.caption, color: c.onSurfaceVariant, marginTop: 2 },
  botaoFechar: { width: 34, height: 34, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center' },
  botaoFecharHover: { backgroundColor: c.surfacePressed },
  conteudo: { padding: Spacing.xl, gap: Spacing.base },

  statusChip: { borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  statusChipTexto: { fontSize: 11, fontWeight: '800' as const },

  bloco: {
    backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: c.outlineDark, padding: Spacing.base,
  },
  blocoHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  blocoTitulo: { ...Typography.body, fontWeight: '800' as const, color: c.onSurface },
  blocoContador: { fontSize: 13, fontWeight: '800' as const, color: c.accentLight },
  valorGrande: { ...Typography.body, fontWeight: '700' as const, color: c.onSurface, marginTop: 6 },

  linkAcao: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: BorderRadius.sm },
  linkAcaoHover: { backgroundColor: c.surfacePressed },
  linkAcaoTexto: { ...Typography.bodySmall, fontWeight: '700' as const, color: c.accentLight },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  infoLabel: { fontSize: 13, color: c.onSurfaceVariant, width: 64 },
  infoValor: { flex: 1, fontSize: 14, color: c.onSurface, fontWeight: '700' as const, textAlign: 'right' },
  descricao: { ...Typography.bodySmall, color: c.onSurfaceVariant, lineHeight: 20, marginTop: 8 },

  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  statusOpt: {
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: BorderRadius.full,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline, minWidth: 88, alignItems: 'center',
  },
  statusOptHover: { backgroundColor: c.surfacePressed },
  statusOptText: { fontSize: 12, fontWeight: '700' as const, color: c.onSurfaceVariant },

  vazioTexto: { fontSize: 13, color: c.onSurfaceVariant, lineHeight: 19, marginTop: 6 },

  checkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.outline },
  checkTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkTexto: { flex: 1, ...Typography.bodySmall, color: c.onSurface },
  checkTextoFeito: { color: c.onSurfaceMuted, textDecorationLine: 'line-through' },

  addItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  addItemBtn: { width: 40, height: 40, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentContainer, borderWidth: 1, borderColor: c.strokeGlow },

  foto: { width: 88, height: 88, borderRadius: BorderRadius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline },

  membroRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceGlass,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outlineDark, padding: Spacing.md, marginBottom: 10,
  },
  membroRowHover: { backgroundColor: c.surfacePressed },
  membroRowAtual: { borderColor: c.success, backgroundColor: c.successLight },
  membroAvatar: { width: 38, height: 38, borderRadius: 12, backgroundColor: c.primaryContainer, justifyContent: 'center', alignItems: 'center' },
  membroAvatarText: { fontSize: 16, fontWeight: '800' as const, color: c.accentLight },
  membroNome: { ...Typography.body, fontWeight: '700' as const, color: c.onSurface },
  membroPapel: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
});
