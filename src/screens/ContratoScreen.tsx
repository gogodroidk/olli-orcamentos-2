import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Platform, KeyboardAvoidingView } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { vibrar } from '../utils/haptico';
import { TimePickerModal } from 'react-native-paper-dates';
import { Spacing, BorderRadius, useCores, useEstilos, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { EmptyState } from '../components/EmptyState';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { OlliInput, OlliMoneyInput } from '../components/OlliInput';
import { OlliButton } from '../components/OlliButton';
import { GuardaPapel } from '../components/GuardaPapel';
import { SeletorResponsavel } from '../components/agenda/CamposEquipeRecorrencia';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';
import { listarContratos, salvarContrato, excluirContrato } from '../services/contratos';
import { getClientes } from '../database/database';
import { getEquipamentos } from '../services/equipamentos';
import { generateId } from '../utils/id';
import { isoToBR, brToISO } from '../utils/masks';
import { parseHoraHHMM, formatHoraHHMM } from '../utils/date';
import {
  PERIODICIDADES_CONTRATO, diaBR, hojeNoBrasil, nomeDoEquipamento, proximasVisitas, validarContrato, valorMensalEquivalente,
} from '../utils/contratoRecorrente';
import { formatCurrency } from '../utils/currency';
import { resumoDaGeracao } from '../utils/contratoRecorrenteGeracao';
import type { AtivoContrato, Cliente, ContratoRecorrente, Equipamento, ModoCobrancaContrato, SituacaoContrato } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rota = RouteProp<RootStackParamList, 'Contrato'>;

/**
 * CRIAR / EDITAR CONTRATO RECORRENTE (celular e desktop centralizado).
 *
 * Um contrato = cliente + ativo(s) + periodicidade + valor. Ao salvar, o OLLI já gera
 * a próxima visita (OS + agenda) e diz o que fez — nada acontece em silêncio.
 * Ativo pode ser equipamento do inventário OU texto livre (piscina, caixa d'água…).
 */
export default function ContratoScreen() {
  return (
    <GuardaPapel acao="ver_valores_agregados" area="Contratos recorrentes">
      <ContratoConteudo />
    </GuardaPapel>
  );
}

interface Form {
  contrato: ContratoRecorrente;
  dataInicioBR: string;
  dataFimBR: string;
  atividadesTexto: string;
}

function novoContrato(): ContratoRecorrente {
  const agora = new Date().toISOString();
  return {
    id: generateId(),
    titulo: '',
    situacao: 'vigente',
    periodicidade: 'mensal',
    dataInicio: hojeNoBrasil(),
    horarioVisita: '08:00',
    ativos: [],
    atividades: [],
    modoCobranca: 'mensal',
    valor: 0,
    renovacao: 'manual',
    criadoEm: agora,
    atualizadoEm: agora,
  };
}

function paraForm(c: ContratoRecorrente): Form {
  return {
    contrato: c,
    dataInicioBR: isoToBR(c.dataInicio),
    dataFimBR: c.dataFim ? isoToBR(c.dataFim) : '',
    atividadesTexto: c.atividades.join('\n'),
  };
}

const SITUACOES_EDITAVEIS: { id: SituacaoContrato; label: string }[] = [
  { id: 'vigente', label: 'Ativo' },
  { id: 'suspenso', label: 'Pausado' },
  { id: 'encerrado', label: 'Encerrado' },
];

function ContratoConteudo() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rota>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const idEdicao = route.params?.id;

  // 3 estados da carga: null = carregando; 'erro' | 'nao_encontrado' | Form.
  const [form, setForm] = useState<Form | 'erro' | 'nao_encontrado' | null>(idEdicao ? null : paraForm(novoContrato()));
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [novoAtivo, setNovoAtivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [relogio, setRelogio] = useState(false);

  useEffect(() => {
    let vivo = true;
    Promise.all([getClientes(), getEquipamentos()])
      .then(([cs, eqs]) => { if (vivo) { setClientes(cs); setEquipamentos(eqs); } })
      .catch(() => {});
    if (idEdicao) {
      listarContratos().then((l) => {
        if (!vivo) return;
        if (l.status !== 'ok') { setForm('erro'); setErro(l.mensagem); return; }
        const achado = l.contratos.find((c) => c.id === idEdicao);
        setForm(achado ? paraForm(achado) : 'nao_encontrado');
      }).catch(() => { if (vivo) setForm('erro'); });
    }
    return () => { vivo = false; };
  }, [idEdicao]);

  const f = typeof form === 'object' && form !== null ? form : null;
  const c = f?.contrato;

  const clientesFiltrados = useMemo(() => {
    const q = buscaCliente.trim().toLowerCase();
    return (q ? clientes.filter((x) => x.nome.toLowerCase().includes(q)) : clientes).slice(0, 20);
  }, [clientes, buscaCliente]);

  // Equipamentos do cliente escolhido (ou todos, se o contrato ainda não tem cliente).
  const equipamentosDoCliente = useMemo(
    () => equipamentos.filter((e) => !c?.clienteId || e.clienteId === c.clienteId).slice(0, 40),
    [equipamentos, c?.clienteId],
  );

  if (form === null) {
    return (
      <View style={styles.container}>
        <GradientHeader onBack={() => goBackOrHome(nav)} title="Contrato" subtitle="Carregando…" />
        <View style={{ padding: Spacing.base, gap: 12 }}>
          {[0, 1, 2, 3].map((i) => <OlliSkeleton key={i} height={56} radius={BorderRadius.md} />)}
        </View>
      </View>
    );
  }
  if (form === 'erro' || form === 'nao_encontrado' || !f || !c) {
    return (
      <View style={styles.container}>
        <GradientHeader onBack={() => goBackOrHome(nav)} title="Contrato" />
        <EmptyState
          icon={form === 'nao_encontrado' ? 'file-question-outline' : 'alert-circle-outline'}
          title={form === 'nao_encontrado' ? 'Contrato não encontrado' : 'Não deu para abrir'}
          subtitle={form === 'nao_encontrado' ? 'Ele pode ter sido excluído em outro aparelho.' : (erro ?? 'Não consegui carregar este contrato. Tente de novo.')}
          actionLabel="Voltar"
          onAction={() => goBackOrHome(nav)}
        />
      </View>
    );
  }

  const setC = (patch: Partial<ContratoRecorrente>) => setForm({ ...f, contrato: { ...c, ...patch } });
  const setF = (patch: Partial<Form>) => setForm({ ...f, ...patch });

  function alternarEquipamento(eq: Equipamento) {
    const existe = c!.ativos.some((a) => a.assetId === eq.id);
    setC({
      ativos: existe
        ? c!.ativos.filter((a) => a.assetId !== eq.id)
        : [...c!.ativos, { id: generateId(), nome: nomeDoEquipamento(eq), assetId: eq.id }],
    });
  }

  function adicionarAtivoLivre() {
    const nome = novoAtivo.trim();
    if (!nome) return;
    setC({ ativos: [...c!.ativos, { id: generateId(), nome }] });
    setNovoAtivo('');
  }

  function removerAtivo(a: AtivoContrato) {
    setC({ ativos: c!.ativos.filter((x) => x.id !== a.id) });
  }

  // O contrato que vai ser salvo, com as datas digitadas já convertidas.
  const montado: ContratoRecorrente = {
    ...c,
    dataInicio: brToISO(f.dataInicioBR),
    dataFim: f.dataFimBR.trim() ? brToISO(f.dataFimBR) || 'invalida' : undefined,
    atividades: f.atividadesTexto.split('\n').map((t) => t.trim()).filter(Boolean),
  };
  const previa = validarContrato(montado).length === 0 ? proximasVisitas(montado, new Date(), 3) : [];

  async function salvar() {
    const erros = validarContrato(montado);
    if (erros.length) { setErro(erros[0]); return; }
    setSalvando(true);
    setErro(null);
    try {
      const { geracao } = await salvarContrato(montado);
      vibrar('sucesso');
      const frase = geracao
        ? resumoDaGeracao(geracao) || 'A próxima visita já estava na agenda.'
        : 'Contrato salvo. Não consegui gerar as visitas agora — tento de novo na próxima vez que o app abrir.';
      if (Platform.OS === 'web') goBackOrHome(nav);
      else Alert.alert('Contrato salvo', frase, [{ text: 'OK', onPress: () => goBackOrHome(nav) }]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui salvar o contrato. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    const confirmado = await new Promise<boolean>((resolve) => {
      if (Platform.OS === 'web') { resolve(typeof globalThis.confirm === 'function' ? globalThis.confirm('Excluir este contrato? As visitas já geradas continuam na agenda.') : false); return; }
      Alert.alert('Excluir contrato', 'O contrato para de gerar visitas. As visitas já geradas continuam na agenda.', [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Excluir', style: 'destructive', onPress: () => resolve(true) },
      ]);
    });
    if (!confirmado) return;
    setSalvando(true);
    try {
      await excluirContrato(c!);
      goBackOrHome(nav);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui excluir agora.');
    } finally {
      setSalvando(false);
    }
  }

  const clienteSelecionado = c.clienteId ? clientes.find((x) => x.id === c.clienteId) : undefined;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <GradientHeader
        onBack={() => goBackOrHome(nav)}
        title={idEdicao ? 'Editar contrato' : 'Novo contrato'}
        subtitle="Cliente + ativos + periodicidade + valor"
      />
      <ScrollView contentContainerStyle={styles.corpo} keyboardShouldPersistTaps="handled">
        <OlliInput
          label="Nome do contrato"
          required
          value={c.titulo}
          onChangeText={(v) => setC({ titulo: v })}
          placeholder='Ex.: "Manutenção mensal da piscina"'
          leftIcon="file-sign"
        />

        {/* CLIENTE */}
        <Text style={styles.label}>Cliente</Text>
        {clienteSelecionado || c.clienteNome ? (
          <View style={styles.selecionado}>
            <MaterialCommunityIcons name="account-check-outline" size={18} color={cores.accentLight} />
            <Text style={styles.selecionadoTexto} numberOfLines={1}>{clienteSelecionado?.nome ?? c.clienteNome}</Text>
            <TouchableOpacity onPress={() => setC({ clienteId: undefined, clienteNome: undefined })} accessibilityRole="button" accessibilityLabel="Trocar cliente">
              <Text style={styles.link}>Trocar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <OlliInput value={buscaCliente} onChangeText={setBuscaCliente} placeholder="Buscar cliente..." leftIcon="magnify" />
            {clientesFiltrados.length === 0 ? (
              <Text style={styles.ajuda}>Nenhum cliente encontrado. Cadastre o cliente em Clientes e volte aqui.</Text>
            ) : (
              clientesFiltrados.map((cl) => (
                <TouchableOpacity
                  key={cl.id}
                  style={styles.linha}
                  onPress={() => setC({ clienteId: cl.id, clienteNome: cl.nome, endereco: c.endereco || cl.endereco || undefined })}
                  accessibilityRole="button"
                >
                  <MaterialCommunityIcons name="account-outline" size={18} color={cores.onSurfaceVariant} />
                  <Text style={styles.linhaTexto} numberOfLines={1}>{cl.nome}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        <OlliInput label="Endereço da visita" value={c.endereco ?? ''} onChangeText={(v) => setC({ endereco: v })} placeholder="Rua, número, bairro" leftIcon="map-marker" />

        {/* ATIVOS */}
        <Text style={styles.label}>Ativos atendidos</Text>
        {c.ativos.length === 0 ? <Text style={styles.ajuda}>Inclua o que é atendido em cada visita: um equipamento do inventário ou um ativo escrito (piscina, caixa d'água, jardim…).</Text> : null}
        <View style={styles.chips}>
          {c.ativos.map((a) => (
            <TouchableOpacity key={a.id} style={[styles.chip, styles.chipAtivo]} onPress={() => removerAtivo(a)} accessibilityRole="button" accessibilityLabel={`Remover ${a.nome}`}>
              <Text style={[styles.chipTexto, styles.chipTextoAtivo]} numberOfLines={1}>{a.nome}</Text>
              <MaterialCommunityIcons name="close" size={14} color={cores.accentLight} />
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.adicionar}>
          <View style={{ flex: 1 }}>
            <OlliInput value={novoAtivo} onChangeText={setNovoAtivo} placeholder="Ex.: Piscina adulto" leftIcon="cube-outline" onSubmitEditing={adicionarAtivoLivre} />
          </View>
          <TouchableOpacity style={styles.adicionarBtn} onPress={adicionarAtivoLivre} accessibilityRole="button" accessibilityLabel="Adicionar ativo">
            <MaterialCommunityIcons name="plus" size={20} color={cores.accentLight} />
          </TouchableOpacity>
        </View>
        {equipamentosDoCliente.length > 0 ? (
          <>
            <Text style={styles.subLabel}>Do inventário{c.clienteId ? ' deste cliente' : ''}</Text>
            <View style={styles.chips}>
              {equipamentosDoCliente.map((eq) => {
                const ativo = c.ativos.some((a) => a.assetId === eq.id);
                return (
                  <TouchableOpacity key={eq.id} style={[styles.chip, ativo && styles.chipAtivo]} onPress={() => alternarEquipamento(eq)} accessibilityRole="button" accessibilityState={{ selected: ativo }}>
                    <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]} numberOfLines={1}>{nomeDoEquipamento(eq)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}

        {/* PERIODICIDADE E AGENDA */}
        <Text style={styles.label}>Visita a cada</Text>
        <View style={styles.chips}>
          {PERIODICIDADES_CONTRATO.map((p) => (
            <TouchableOpacity key={p.id} style={[styles.chip, c.periodicidade === p.id && styles.chipAtivo]} onPress={() => setC({ periodicidade: p.id })} accessibilityRole="button" accessibilityState={{ selected: c.periodicidade === p.id }}>
              <Text style={[styles.chipTexto, c.periodicidade === p.id && styles.chipTextoAtivo]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.duas}>
          <View style={{ flex: 1 }}>
            <OlliInput label="Primeira visita" required value={f.dataInicioBR} onChangeText={(v) => setF({ dataInicioBR: v })} mask="date" placeholder="dd/mm/aaaa" leftIcon="calendar-start" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.labelCampo}>Horário</Text>
            <TouchableOpacity style={styles.horario} onPress={() => setRelogio(true)} accessibilityRole="button" accessibilityLabel="Escolher horário da visita">
              <MaterialCommunityIcons name="clock-outline" size={18} color={cores.onSurfaceMuted} />
              <Text style={styles.horarioTexto}>{c.horarioVisita}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.ajuda}>O dia da primeira visita vira o dia das próximas (dia 31 cai no último dia dos meses curtos).</Text>
        <OlliInput label="Fim do contrato (opcional)" value={f.dataFimBR} onChangeText={(v) => setF({ dataFimBR: v })} mask="date" placeholder="dd/mm/aaaa" leftIcon="calendar-end" helper="Em branco = sem data para acabar." />

        <OlliInput
          label="O que é feito em cada visita (uma por linha)"
          value={f.atividadesTexto}
          onChangeText={(v) => setF({ atividadesTexto: v })}
          placeholder={'Ex.:\nMedir pH e cloro\nAspirar o fundo'}
          leftIcon="format-list-checks"
          multiline
        />

        {/* TÉCNICO */}
        <SeletorResponsavel
          rotulo="Técnico responsável pelas visitas"
          responsavelId={c.responsavelId}
          responsavelNome={c.responsavelNome}
          onChange={(r) => setC(r)}
        />

        {/* COBRANÇA */}
        <Text style={styles.label}>Cobrança</Text>
        <View style={styles.chips}>
          {(['mensal', 'por_visita'] as ModoCobrancaContrato[]).map((m) => (
            <TouchableOpacity key={m} style={[styles.chip, c.modoCobranca === m && styles.chipAtivo]} onPress={() => setC({ modoCobranca: m })} accessibilityRole="button" accessibilityState={{ selected: c.modoCobranca === m }}>
              <Text style={[styles.chipTexto, c.modoCobranca === m && styles.chipTextoAtivo]}>{m === 'mensal' ? 'Valor por mês' : 'Valor por visita'}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <OlliMoneyInput
          label={c.modoCobranca === 'mensal' ? 'Valor mensal' : 'Valor de cada visita'}
          value={c.valor}
          onChangeValue={(v) => setC({ valor: v })}
          helper={
            c.modoCobranca === 'por_visita' && c.valor > 0
              ? `Equivale a ${formatCurrency(valorMensalEquivalente(c))}/mês. Você cobra pelo seu Pix; o OLLI não passa o dinheiro.`
              : 'Você cobra pelo seu Pix; o OLLI não passa o dinheiro.'
          }
        />

        {idEdicao ? (
          <>
            <Text style={styles.label}>Situação</Text>
            <View style={styles.chips}>
              {SITUACOES_EDITAVEIS.map((s) => (
                <TouchableOpacity key={s.id} style={[styles.chip, c.situacao === s.id && styles.chipAtivo]} onPress={() => setC({ situacao: s.id })} accessibilityRole="button" accessibilityState={{ selected: c.situacao === s.id }}>
                  <Text style={[styles.chipTexto, c.situacao === s.id && styles.chipTextoAtivo]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.ajuda}>Pausado ou encerrado não gera visita nova.</Text>
          </>
        ) : null}

        <OlliInput label="Observações" value={c.observacoes ?? ''} onChangeText={(v) => setC({ observacoes: v })} placeholder="Ex.: chave com o zelador" leftIcon="note-text-outline" multiline />

        {previa.length ? (
          <View style={styles.previa}>
            <MaterialCommunityIcons name="calendar-clock" size={16} color={cores.accentLight} />
            <Text style={styles.previaTexto}>Próximas visitas: {previa.map(diaBR).join(' · ')}</Text>
          </View>
        ) : null}

        {erro ? (
          <View style={styles.erro}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color={cores.danger} />
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        ) : null}

        <OlliButton
          label={idEdicao ? 'Salvar contrato' : 'Criar contrato'}
          variant="gradient"
          size="lg"
          fullWidth
          onPress={() => { void salvar(); }}
          loading={salvando}
          disabled={salvando}
          icon={<MaterialCommunityIcons name="check" size={20} color="#fff" />}
        />
        {idEdicao ? (
          <TouchableOpacity style={styles.excluir} onPress={() => { void excluir(); }} disabled={salvando} accessibilityRole="button">
            <MaterialCommunityIcons name="trash-can-outline" size={18} color={cores.danger} />
            <Text style={styles.excluirTexto}>Excluir contrato</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <TimePickerModal
        visible={relogio}
        animationType="fade"
        locale="pt-BR"
        use24HourClock
        label="Horário da visita"
        cancelLabel="Cancelar"
        confirmLabel="Definir"
        hours={parseHoraHHMM(c.horarioVisita).hours}
        minutes={parseHoraHHMM(c.horarioVisita).minutes}
        onDismiss={() => setRelogio(false)}
        onConfirm={({ hours, minutes }) => { setC({ horarioVisita: formatHoraHHMM(hours, minutes) }); setRelogio(false); }}
      />
    </KeyboardAvoidingView>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    corpo: { padding: Spacing.base, paddingBottom: Spacing.xxxl, gap: 4 },
    label: { fontSize: 14, fontWeight: '800', color: c.onSurface, marginTop: Spacing.base, marginBottom: 8 },
    subLabel: { fontSize: 12, fontWeight: '700', color: c.onSurfaceVariant, marginTop: Spacing.sm, marginBottom: 6 },
    labelCampo: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant, marginBottom: 6 },
    ajuda: { fontSize: 12.5, color: c.onSurfaceMuted, lineHeight: 18, marginBottom: 6 },
    link: { fontSize: 13, fontWeight: '700', color: c.accentLight },
    selecionado: {
      flexDirection: 'row', alignItems: 'center', gap: 8, padding: Spacing.md,
      borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface, marginBottom: Spacing.sm,
    },
    selecionadoTexto: { flex: 1, fontSize: 15, fontWeight: '700', color: c.onSurface },
    linha: {
      flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: Spacing.sm,
      borderBottomWidth: 1, borderBottomColor: c.outline,
    },
    linhaTexto: { flex: 1, fontSize: 14, color: c.onSurface },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%',
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.full,
      borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface,
    },
    chipAtivo: { borderColor: c.accentLight, backgroundColor: c.accentLight + '1F' },
    chipTexto: { fontSize: 13, fontWeight: '600', color: c.onSurfaceVariant },
    chipTextoAtivo: { color: c.accentLight },
    adicionar: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: Spacing.sm },
    adicionarBtn: {
      width: 48, height: 48, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface,
    },
    duas: { flexDirection: 'row', gap: 10, marginTop: Spacing.sm },
    horario: {
      flexDirection: 'row', alignItems: 'center', gap: 8, height: 52, paddingHorizontal: Spacing.md,
      borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface,
    },
    horarioTexto: { fontSize: 15, fontWeight: '700', color: c.onSurface },
    previa: {
      flexDirection: 'row', alignItems: 'center', gap: 8, padding: Spacing.md, marginVertical: Spacing.sm,
      borderRadius: BorderRadius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline,
    },
    previaTexto: { flex: 1, fontSize: 13, fontWeight: '600', color: c.onSurface },
    erro: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: Spacing.sm },
    erroTexto: { flex: 1, fontSize: 13, color: c.danger, fontWeight: '600' },
    excluir: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: Spacing.base },
    excluirTexto: { fontSize: 14, fontWeight: '700', color: c.danger },
  });
