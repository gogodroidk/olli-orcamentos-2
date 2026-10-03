import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, Alert, Platform } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { vibrar } from '../utils/haptico';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, corCategoriaEmChip, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { EmptyState } from '../components/EmptyState';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { GuardaPapel } from '../components/GuardaPapel';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';
import { listarContratos, gerarVisitasAgora, lerStatusMotorContratos, type LeituraContratos } from '../services/contratos';
import { getClientes, getEmpresa } from '../database/database';
import { abrirWhatsApp } from '../utils/exportarDocumento';
import { formatCurrency } from '../utils/currency';
import {
  MODO_COBRANCA_LABEL, SITUACAO_CONTRATO_LABEL, diaBR, fraseReceitaMensal, hojeNoBrasil, prepararCobrancaContrato,
  proximasVisitas, resumirContratos, rotuloPeriodicidade, situacaoEfetiva,
} from '../utils/contratoRecorrente';
import { resumoDaGeracao } from '../utils/contratoRecorrenteGeracao';
import { convitePrimeiroContrato, fraseMotorContratos, type StatusMotorContratos } from '../utils/contratosMotorStatus';
import type { ContratoRecorrente, SituacaoContrato } from '../types';
import { TelaRecursoPlano } from '../components/RecursoPlano';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * CONTRATOS RECORRENTES — a lista (celular e desktop; no desktop entra centralizada
 * pelo shell). Topo: "R$ X/mês em contratos" (a soma da receita recorrente em vigor).
 * Cada cartão: próximas visitas, técnico, valor e "Cobrar" (WhatsApp com o Pix do
 * PRÓPRIO prestador — o OLLI não intermedeia).
 *
 * Quatro estados, nunca colapsados: carregando | erro (com "Tentar de novo") |
 * desligado (servidor sem o recurso — diz que está desligado, não finge) | valor.
 * Gate de papel: contrato é dinheiro → só quem vê valores (dono/admin/gestor).
 *
 * Geração AUTOMÁTICA (motor do servidor, CONTRATOS_MOTOR_MODE): a tela lê o modo no
 * worker (`lerStatusMotorContratos`) e diz se está ligada, desligada ou não
 * confirmada — nunca promete visita "sozinha" com o motor desligado (B09). Ligar o
 * motor em produção é decisão do dono; até lá o aviso manda agendar manualmente.
 */
function ContratosScreenConteudo() {
  return (
    <GuardaPapel acao="ver_valores_agregados" area="Contratos recorrentes">
      <ContratosConteudo />
    </GuardaPapel>
  );
}

function corSituacao(c: Cores, s: SituacaoContrato): string {
  switch (s) {
    case 'vigente':
      return c.success;
    case 'suspenso':
      return c.warning;
    case 'rascunho':
      return c.onSurfaceVariant;
    default:
      return c.onSurfaceMuted;
  }
}

function ContratosConteudo() {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [leitura, setLeitura] = useState<LeituraContratos | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // null = ainda conferindo; o aviso só aparece com a resposta (ou o "não confirmei").
  const [motor, setMotor] = useState<StatusMotorContratos | null>(null);

  const load = useCallback(async () => {
    // O status do motor corre em paralelo e nunca segura a lista (nunca lança).
    void lerStatusMotorContratos().then(setMotor);
    setLeitura(await listarContratos());
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const contratos = leitura?.status === 'ok' ? leitura.contratos : [];
  const resumo = useMemo(() => resumirContratos(contratos), [contratos]);
  const hoje = hojeNoBrasil();

  async function gerarAgora() {
    setGerando(true);
    setAviso(null);
    try {
      const r = await gerarVisitasAgora();
      setAviso(resumoDaGeracao(r) || 'Tudo em dia: as próximas visitas já estão na agenda.');
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Não consegui gerar as visitas agora. Tente de novo.');
    } finally {
      setGerando(false);
    }
  }

  async function cobrar(c: ContratoRecorrente) {
    vibrar('selecao');
    try {
      const [empresa, clientes] = await Promise.all([getEmpresa(), getClientes()]);
      const telefone = c.clienteId ? clientes.find((x) => x.id === c.clienteId)?.telefone ?? '' : '';
      const cobranca = prepararCobrancaContrato({ contrato: c, empresa });
      const enviar = () => { void abrirWhatsApp(telefone, cobranca.texto).catch(() => {}); };
      const faltaPix =
        cobranca.situacaoPix === 'sem_chave'
          ? 'Sua chave Pix não está cadastrada: a mensagem vai sem o Pix copia e cola.'
          : cobranca.situacaoPix === 'chave_invalida'
            ? 'Sua chave Pix não parece válida: a mensagem vai sem o Pix até você conferir em Meu Negócio.'
            : cobranca.situacaoPix === 'sem_valor'
              ? 'O contrato está sem valor: a mensagem vai sem Pix.'
              : null;
      const semTelefone = !telefone ? 'O cliente está sem telefone: o WhatsApp abre para você escolher o contato.' : null;
      const avisos = [faltaPix, semTelefone].filter(Boolean).join('\n\n');
      if (!avisos || Platform.OS === 'web') {
        if (avisos) setAviso(avisos);
        enviar();
        return;
      }
      Alert.alert('Antes de enviar', avisos, [
        { text: 'Cancelar', style: 'cancel' },
        ...(cobranca.situacaoPix === 'com_pix' ? [] : [{ text: 'Cadastrar chave Pix', onPress: () => nav.navigate('MeuNegocio') }]),
        { text: 'Enviar assim', onPress: enviar },
      ]);
    } catch {
      Alert.alert('Erro', 'Não consegui montar a cobrança agora. Tente de novo.');
    }
  }

  const renderItem = ({ item: c, index }: { item: ContratoRecorrente; index: number }) => {
    const situacao = situacaoEfetiva(c, hoje);
    const cor = corSituacao(cores, situacao);
    const proximas = proximasVisitas(c);
    return (
      <AnimatedEntrance index={index}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.9}
          onPress={() => nav.navigate('Contrato', { id: c.id })}
          accessibilityRole="button"
          accessibilityLabel={`Contrato ${c.titulo}, ${c.clienteNome ?? ''}`}
        >
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitulo} numberOfLines={1}>{c.titulo}</Text>
              <Text style={styles.cardCliente} numberOfLines={1}>{c.clienteNome || 'Sem cliente'}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: cor + '22', borderColor: cor + '66' }]}>
              <Text style={[styles.badgeTexto, { color: corCategoriaEmChip(cor, cores.surface) }]}>{SITUACAO_CONTRATO_LABEL[situacao]}</Text>
            </View>
          </View>

          <View style={styles.metaLinha}>
            <Meta icon="repeat" texto={rotuloPeriodicidade(c.periodicidade)} />
            <Meta icon="cash" texto={`${formatCurrency(c.valor)} ${MODO_COBRANCA_LABEL[c.modoCobranca]}`} />
            <Meta icon="cube-outline" texto={`${c.ativos.length} ${c.ativos.length === 1 ? 'ativo' : 'ativos'}`} />
            {c.responsavelNome ? <Meta icon="account-hard-hat-outline" texto={c.responsavelNome} /> : null}
          </View>

          <View style={styles.rodape}>
            <MaterialCommunityIcons name="calendar-clock" size={16} color={cores.accentLight} />
            <Text style={styles.proximas} numberOfLines={1}>
              {proximas.length ? `Próximas: ${proximas.map(diaBR).join(' · ')}` : c.dataFim && c.dataFim < hoje ? `Terminou em ${diaBR(c.dataFim)}` : 'Sem visitas previstas'}
            </Text>
            <TouchableOpacity
              style={styles.cobrarBtn}
              onPress={() => { void cobrar(c); }}
              accessibilityRole="button"
              accessibilityLabel={`Cobrar ${c.clienteNome ?? 'cliente'} no WhatsApp`}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <MaterialCommunityIcons name="whatsapp" size={16} color={corCategoriaEmChip(cores.success, cores.surface)} />
              <Text style={[styles.cobrarTexto, { color: corCategoriaEmChip(cores.success, cores.surface) }]}>Cobrar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </AnimatedEntrance>
    );
  };

  return (
    <View style={styles.container}>
      <GradientHeader
        onBack={() => goBackOrHome(nav)}
        title="Contratos recorrentes"
        subtitle={leitura?.status === 'ok' ? fraseReceitaMensal(resumo) : 'Visitas e cobrança todo mês'}
        right={
          leitura?.status === 'ok' ? (
            <TouchableOpacity
              style={styles.novoBtn}
              activeOpacity={0.85}
              onPress={() => nav.navigate('Contrato', undefined)}
              accessibilityRole="button"
              accessibilityLabel="Novo contrato"
            >
              <MaterialCommunityIcons name="plus" size={20} color="#fff" />
              <Text style={styles.novoBtnTexto}>Novo</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {leitura === null ? (
        <View style={{ padding: Spacing.base, gap: 12 }}>
          {[0, 1, 2].map((i) => <OlliSkeleton key={i} height={118} radius={BorderRadius.lg} />)}
        </View>
      ) : leitura.status === 'erro' ? (
        <EmptyState icon="alert-circle-outline" title="Não deu para carregar" subtitle={leitura.mensagem} actionLabel="Tentar de novo" onAction={() => { setLeitura(null); void load(); }} />
      ) : leitura.status === 'desligado' ? (
        <EmptyState icon="power-plug-off-outline" title="Recurso ainda desligado" subtitle={leitura.mensagem} />
      ) : contratos.length === 0 ? (
        <EmptyState
          icon="calendar-sync-outline"
          title="Nenhum contrato ainda"
          subtitle={convitePrimeiroContrato(motor ?? 'desconhecido')}
          actionLabel="Criar primeiro contrato"
          onAction={() => nav.navigate('Contrato', undefined)}
        />
      ) : (
        <FlatList
          data={contratos}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: Spacing.base, paddingBottom: Spacing.xxl, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={cores.accentLight} />}
          ListHeaderComponent={
            <View style={styles.resumo}>
              <Text style={styles.resumoValor}>{fraseReceitaMensal(resumo)}</Text>
              <Text style={styles.resumoLinha}>
                {resumo.ativos} {resumo.ativos === 1 ? 'contrato ativo' : 'contratos ativos'}
                {resumo.terminandoEm30Dias ? ` · ${resumo.terminandoEm30Dias} terminando em 30 dias` : ''}
              </Text>
              <TouchableOpacity
                style={[styles.gerarBtn, gerando && { opacity: 0.6 }]}
                onPress={() => { void gerarAgora(); }}
                disabled={gerando}
                accessibilityRole="button"
              >
                <MaterialCommunityIcons name="calendar-refresh-outline" size={16} color={cores.accentLight} />
                <Text style={styles.gerarTexto}>{gerando ? 'Conferindo…' : 'Conferir visitas agora'}</Text>
              </TouchableOpacity>
              {aviso ? <Text style={styles.aviso}>{aviso}</Text> : null}
              {motor ? <AvisoMotor status={motor} /> : null}
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

/** Aviso honesto sobre a geração automática de visitas (motor do servidor). */
function AvisoMotor({ status }: { status: StatusMotorContratos }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const frase = fraseMotorContratos(status);
  const ligado = status === 'ligado';
  return (
    <View style={styles.motor} accessibilityRole="text">
      <MaterialCommunityIcons
        name={ligado ? 'calendar-check-outline' : 'calendar-alert'}
        size={16}
        color={ligado ? corCategoriaEmChip(cores.success, cores.surface) : cores.onSurfaceVariant}
        style={{ marginTop: 1 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.motorTitulo}>{frase.titulo}</Text>
        <Text style={styles.motorTexto}>{frase.texto}</Text>
      </View>
    </View>
  );
}

function Meta({ icon, texto }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; texto: string }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.meta}>
      <MaterialCommunityIcons name={icon} size={13} color={cores.onSurfaceVariant} />
      <Text style={styles.metaTexto} numberOfLines={1}>{texto}</Text>
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    // Dentro do GradientHeader (sempre colorido) — glass branco fixo, como no PMOC.
    novoBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)',
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.full,
    },
    novoBtnTexto: { color: '#fff', fontWeight: '800', fontSize: 13 },
    resumo: {
      backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline,
      padding: Spacing.base, marginBottom: 4, gap: 4,
    },
    resumoValor: { fontSize: 20, fontWeight: '800', color: c.onSurface },
    resumoLinha: { fontSize: 13, color: c.onSurfaceVariant },
    gerarBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, alignSelf: 'flex-start', paddingVertical: 4 },
    gerarTexto: { fontSize: 13, fontWeight: '700', color: c.accentLight },
    aviso: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 4 },
    motor: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8,
      backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.md, padding: Spacing.sm,
    },
    motorTitulo: { fontSize: 13, fontWeight: '700', color: c.onSurface },
    motorTexto: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2, lineHeight: 17 },
    card: {
      backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline,
      padding: Spacing.base, gap: 10, ...sombrasDe(c).sm,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    cardTitulo: { fontSize: 16, fontWeight: '800', color: c.onSurface },
    cardCliente: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 2 },
    badge: { borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
    badgeTexto: { fontSize: 11, fontWeight: '800' },
    metaLinha: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    meta: {
      flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%',
      backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4,
    },
    metaTexto: { fontSize: 11, color: c.onSurfaceVariant, fontWeight: '600' },
    rodape: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, borderTopColor: c.outline, paddingTop: 8 },
    proximas: { flex: 1, fontSize: 13, color: c.accentLight, fontWeight: '600' },
    cobrarBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6,
      borderRadius: BorderRadius.full, borderWidth: 1, borderColor: c.success + '66',
    },
    cobrarTexto: { fontSize: 12, fontWeight: '800' },
  });

/**
 * PMOC e contratos são do plano Empresa (`pmoc_contratos`, decisão do dono em
 * 01/10/2026). Com o plano confirmado sem o recurso, a tela mostra "Disponível no
 * Empresa"; com o plano ilegível, "não consegui confirmar seu plano" — os dados já
 * cadastrados não são tocados, só ficam fora de alcance até o plano voltar.
 * Membro de equipe vale pelo plano da EMPRESA (ver `RECURSOS_DO_TENANT`).
 */
export default function ContratosScreen() {
  return (
    <TelaRecursoPlano recurso="pmoc_contratos" titulo="Contratos recorrentes">
      <ContratosScreenConteudo />
    </TelaRecursoPlano>
  );
}
