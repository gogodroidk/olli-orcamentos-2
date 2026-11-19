import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, comAlfa, sombrasDe, useCores, useEstilos, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { DicaContextual } from '../components/DicaContextual';
import { TelaRecursoPlano } from '../components/RecursoPlano';
import { Aparecer, PressableAnimado, Skeleton } from '../components/motion';
import { corDoSelo } from '../components/vespera/SeloConfirmacao';
import { toast, confirmar } from '../components/feedback';
import { goBackOrHome } from '../navigation/safeBack';
import { useEhDesktop } from '../hooks/useEhDesktop';
import { getAgendamentosExpandidos } from '../services/agenda';
import { getClientes, getEmpresa } from '../database/database';
import {
  atualizarConfirmacoes,
  lerEnviados,
  pedirLinkConfirmacao,
  registrarEnviado,
  useConfirmacoesVisitas,
} from '../services/confirmacaoVisita';
import { clientesParaReconquistar, type ClienteParaReconquistar } from '../services/radarClientes';
import { registrarLembreteEnviado } from '../services/registroEnvios';
import { abrirWhatsApp } from '../utils/exportarDocumento';
import { limitesDoDiaLocal } from '../utils/agendaDia';
import { diaNoBrasil, type OcorrenciaAgendamento } from '../utils/contratoRecorrente';
import {
  candidatosParaVaga,
  chaveConfirmacao,
  diaAmigavel,
  diaDaVisita,
  horaBrasilia,
  idBaseDaVisita,
  mensagemConfirmacao,
  mensagemOfertaVaga,
  montarFilaVespera,
  resumoFila,
  seloDaConfirmacao,
  type ItemFilaVespera,
} from '../utils/confirmacaoVisita';
import { textoDistancia } from '../services/encaixe';
import type { Cliente } from '../types';

type Alvo = 'amanha' | 'hoje';
type Dados =
  | { estado: 'carregando' }
  | { estado: 'erro' }
  | { estado: 'ok'; visitas: OcorrenciaAgendamento[]; clientes: Cliente[]; nomePrestador: string | null; radar: ClienteParaReconquistar[] | null };

/**
 * CONFIRMAR VISITAS (Onda I3, jogada 5) — a fila das 18h.
 *
 * Cada visita de amanhã (ou de hoje) com o cliente, a hora e o status da
 * confirmação. [WhatsApp] gera o link /v/<token> com a marca do prestador e abre a
 * conversa com a mensagem pronta — o prestador revisa e envia (nada sai sozinho,
 * só link oficial wa.me). Quem pediu para remarcar abre uma VAGA, que pode ser
 * oferecida a clientes com manutenção vencida ali perto (radar + distância).
 *
 * Três estados em tudo: a agenda que não leu não vira "nenhuma visita"; a resposta
 * que não leu não vira "ninguém confirmou".
 */
export default function ConfirmarVisitasScreen() {
  return (
    <TelaRecursoPlano recurso="vespera_garantia" titulo="Confirmar visitas">
      <ConfirmarVisitasConteudo />
    </TelaRecursoPlano>
  );
}

function ConfirmarVisitasConteudo() {
  const nav = useNavigation<any>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const ehDesktop = useEhDesktop();
  const store = useConfirmacoesVisitas();
  const [alvo, setAlvo] = useState<Alvo>('amanha');
  const [dados, setDados] = useState<Dados>({ estado: 'carregando' });
  const [enviados, setEnviados] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  const dataAlvo = useMemo(() => new Date(Date.now() + (alvo === 'amanha' ? 86_400_000 : 0)), [alvo]);

  const carregar = useCallback(async () => {
    try {
      const { inicio, fim } = limitesDoDiaLocal(dataAlvo);
      const [visitas, clientes, empresa, env, radar] = await Promise.all([
        getAgendamentosExpandidos(inicio.toISOString(), fim.toISOString()),
        getClientes(),
        getEmpresa().catch(() => null),
        lerEnviados(),
        // O radar só serve para a vaga: falhar nele não derruba a fila.
        clientesParaReconquistar().catch(() => null),
      ]);
      setEnviados(env);
      setDados({ estado: 'ok', visitas, clientes, nomePrestador: empresa?.nomePrestador || empresa?.nome || null, radar });
    } catch {
      setDados({ estado: 'erro' });
    }
  }, [dataAlvo]);

  useFocusEffect(useCallback(() => {
    void carregar();
    void atualizarConfirmacoes(true);
  }, [carregar]));

  async function atualizar() {
    setAtualizando(true);
    await Promise.all([carregar(), atualizarConfirmacoes(true)]);
    setAtualizando(false);
  }

  const fila: ItemFilaVespera<OcorrenciaAgendamento>[] = dados.estado === 'ok'
    ? montarFilaVespera({ visitas: dados.visitas, clientes: dados.clientes, confirmacoes: store.mapa, dia: diaNoBrasil(dataAlvo.toISOString()) })
    : [];
  const resumo = resumoFila(fila);

  async function pedir(item: ItemFilaVespera<OcorrenciaAgendamento>) {
    if (enviando || !item.telefone || dados.estado !== 'ok') return;
    const v = item.visita;
    setEnviando(v.id);
    try {
      const r = await pedirLinkConfirmacao(v);
      let link: string | null = null;
      if (r.ok) {
        link = r.link;
      } else if (r.motivo === 'indisponivel') {
        toast.info(r.mensagem);
      } else if (r.motivo === 'erro') {
        const semLink = await confirmar({
          titulo: 'Não consegui gerar o link',
          mensagem: 'Pode ser a internet. Quer mandar a mensagem pedindo a confirmação por escrito, sem o link?',
          rotuloConfirmar: 'Mandar sem link',
        });
        if (!semLink) return;
      } else {
        toast.erro(r.mensagem);
        return;
      }
      await abrirWhatsApp(item.telefone, mensagemConfirmacao({
        clienteNome: item.cliente?.nome || v.clienteNome,
        nomePrestador: dados.nomePrestador,
        inicio: v.inicio,
        servico: v.titulo,
        link,
      }));
      await registrarEnviado(v);
      setEnviados((e) => ({ ...e, [chaveConfirmacao(idBaseDaVisita(v), diaDaVisita(v))]: new Date().toISOString() }));
    } catch {
      toast.erro('Não consegui abrir o WhatsApp neste aparelho.');
    } finally {
      setEnviando(null);
    }
  }

  async function oferecerVaga(item: ItemFilaVespera<OcorrenciaAgendamento>, candidato: Cliente) {
    if (dados.estado !== 'ok') return;
    try {
      await abrirWhatsApp(candidato.telefone, mensagemOfertaVaga({
        clienteNome: candidato.nome,
        nomePrestador: dados.nomePrestador,
        inicio: item.visita.inicio,
      }));
      // Sai do radar por 30 dias (o mesmo registro do "Lembrar no WhatsApp").
      await registrarLembreteEnviado(candidato.id);
    } catch {
      toast.erro('Não consegui abrir o WhatsApp neste aparelho.');
    }
  }

  function abrirNaAgenda(item: ItemFilaVespera<OcorrenciaAgendamento>) {
    nav.navigate('Tabs', { screen: 'Agenda', params: { abrirAgendamentoId: item.visita.id } });
  }

  const subtitulo = `${alvo === 'amanha' ? 'Amanhã' : 'Hoje'} · ${diaAmigavel(dataAlvo.toISOString()).replace(/^(amanhã|hoje) \((.*)\)$/, '$2')}`;
  let k = 0;

  return (
    <View style={styles.tela}>
      <GradientHeader title="Confirmar visitas" subtitle={subtitulo} onBack={() => goBackOrHome(nav)} />
      <ScrollView
        contentContainerStyle={[styles.scroll, ehDesktop && styles.scrollDesktop]}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={cores.accentLight} colors={[cores.accentLight]} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.seletor} accessibilityRole="tablist">
          {(['amanha', 'hoje'] as const).map((a) => (
            <PressableAnimado
              key={a}
              onPress={() => { setAlvo(a); setDados({ estado: 'carregando' }); }}
              haptic="selection"
              style={[styles.opcao, alvo === a && styles.opcaoAtiva]}
              accessibilityRole="tab"
              accessibilityState={{ selected: alvo === a }}
            >
              <Text style={[styles.opcaoTxt, alvo === a && styles.opcaoTxtAtiva]}>{a === 'amanha' ? 'Amanhã' : 'Hoje'}</Text>
            </PressableAnimado>
          ))}
        </View>

        <DicaContextual
          id="vespera.fila"
          icon="whatsapp"
          texto="Toque em WhatsApp: a OLLI gera um link com a sua marca e abre a conversa com a mensagem pronta. Você revisa e envia. A resposta do cliente aparece aqui e na Agenda."
        />

        {store.estado === 'indisponivel' ? (
          <Faixa icone="cloud-off-outline" cor={cores.onSurfaceVariant} texto="A confirmação com link ainda não está disponível nesta conta. A mensagem pede a resposta por escrito." />
        ) : store.estado === 'erro' ? (
          <Faixa icone="cloud-alert-outline" cor={cores.warning} texto="Não consegui conferir as respostas agora. O que já chegou continua aqui; puxe para tentar de novo." />
        ) : null}

        {dados.estado === 'carregando' ? (
          <View style={{ gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.card}>
                <Skeleton width={70} height={14} />
                <Skeleton width="65%" height={14} style={{ marginTop: 8 }} />
                <Skeleton width="40%" height={12} style={{ marginTop: 6 }} />
              </View>
            ))}
          </View>
        ) : dados.estado === 'erro' ? (
          <View style={styles.card}>
            <Text style={styles.titulo}>Não deu para ler a agenda</Text>
            <Text style={styles.texto}>Nada foi perdido. Confira e tente de novo.</Text>
            <PressableAnimado onPress={() => void carregar()} haptic="light" style={styles.botaoSec} accessibilityRole="button">
              <MaterialCommunityIcons name="refresh" size={16} color={cores.accentLight} />
              <Text style={styles.botaoSecTxt}>Tentar de novo</Text>
            </PressableAnimado>
          </View>
        ) : fila.length === 0 ? (
          <View style={styles.vazio}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={30} color={cores.onSurfaceMuted} />
            <Text style={styles.titulo}>{alvo === 'amanha' ? 'Nenhuma visita marcada para amanhã' : 'Nenhuma visita marcada para hoje'}</Text>
            <Text style={styles.texto}>Quando houver visita na agenda, ela aparece aqui para pedir a confirmação.</Text>
          </View>
        ) : (
          <>
            <Aparecer indice={k++}>
              <View style={styles.resumo}>
                <Numero n={resumo.confirmadas} rotulo="confirmadas" cor={cores.success} />
                <Numero n={resumo.remarcar} rotulo="remarcar" cor={cores.warning} />
                <Numero n={resumo.aguardando} rotulo="aguardando" cor={cores.accentLight} />
                <Numero n={resumo.aPedir + resumo.semTelefone} rotulo="sem pedido" cor={cores.onSurfaceVariant} />
              </View>
            </Aparecer>
            {fila.map((item) => (
              <Aparecer key={item.visita.id} indice={k++}>
                <LinhaVisita
                  item={item}
                  enviadoEm={enviados[chaveConfirmacao(idBaseDaVisita(item.visita), diaDaVisita(item.visita))]}
                  enviando={enviando === item.visita.id}
                  onPedir={() => void pedir(item)}
                  onAbrir={() => abrirNaAgenda(item)}
                  radar={dados.estado === 'ok' ? dados.radar : null}
                  onOferecer={(c) => void oferecerVaga(item, c)}
                />
              </Aparecer>
            ))}
            <Text style={styles.rodape}>
              O link mostra só o dia, a hora e o título da visita, com a sua marca, e expira 2 horas depois do horário da visita. Evite pôr endereço ou telefone no título.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Faixa({ icone, cor, texto }: { icone: React.ComponentProps<typeof MaterialCommunityIcons>['name']; cor: string; texto: string }) {
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.faixa}>
      <MaterialCommunityIcons name={icone} size={16} color={cor} />
      <Text style={styles.faixaTxt}>{texto}</Text>
    </View>
  );
}

function Numero({ n, rotulo, cor }: { n: number; rotulo: string; cor: string }) {
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.numero}>
      <Text style={[styles.numeroN, { color: cor }]}>{n}</Text>
      <Text style={styles.numeroR}>{rotulo}</Text>
    </View>
  );
}

function LinhaVisita({
  item, enviadoEm, enviando, onPedir, onAbrir, radar, onOferecer,
}: {
  item: ItemFilaVespera<OcorrenciaAgendamento>;
  enviadoEm?: string;
  enviando: boolean;
  onPedir: () => void;
  onAbrir: () => void;
  radar: ClienteParaReconquistar[] | null;
  onOferecer: (c: Cliente) => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const v = item.visita;
  const selo = seloDaConfirmacao(item.confirmacao);
  const cor = selo ? corDoSelo(selo.tipo, cores) : cores.onSurfaceVariant;
  const situacao = selo
    ? selo.rotulo
    : item.situacao === 'sem_telefone'
      ? 'Sem WhatsApp no cadastro do cliente'
      : enviadoEm
        ? 'Mensagem aberta no WhatsApp · sem link de resposta'
        : 'Ainda sem pedido de confirmação';
  const podePedir = !!item.telefone && item.situacao !== 'confirmada';
  const rotuloBotao = item.situacao === 'pendente' || enviadoEm ? 'Reenviar' : 'WhatsApp';

  return (
    <View style={[styles.card, item.situacao === 'remarcar' && { borderColor: comAlfa(cores.warning, 0.5) }]}>
      <PressableAnimado onPress={onAbrir} haptic="selection" accessibilityRole="button" accessibilityLabel={`${horaBrasilia(v.inicio)}, ${v.clienteNome}, ${v.titulo}. Abrir na agenda`}>
        <View style={styles.topo}>
          <Text style={styles.hora}>{horaBrasilia(v.inicio)}</Text>
          <View style={[styles.status, { backgroundColor: comAlfa(cor, 0.12), borderColor: comAlfa(cor, 0.35) }]}>
            <MaterialCommunityIcons name={selo?.icone ?? (item.situacao === 'sem_telefone' ? 'phone-off-outline' : 'circle-outline')} size={12} color={cor} />
            <Text style={[styles.statusTxt, { color: cor }]} numberOfLines={1}>{situacao}</Text>
          </View>
        </View>
        <Text style={styles.cliente} numberOfLines={1}>{v.clienteNome || 'Cliente sem nome'}</Text>
        <Text style={styles.texto} numberOfLines={1}>{v.titulo}</Text>
      </PressableAnimado>

      {podePedir ? (
        <PressableAnimado
          onPress={onPedir}
          disabled={enviando}
          haptic="light"
          style={[styles.botaoZap, enviando && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={`Pedir confirmação a ${v.clienteNome} no WhatsApp`}
        >
          <MaterialCommunityIcons name="whatsapp" size={16} color="#FFFFFF" />
          <Text style={styles.botaoZapTxt}>{enviando ? 'Gerando o link…' : rotuloBotao}</Text>
        </PressableAnimado>
      ) : null}

      {item.situacao === 'remarcar' ? (
        <VagaAberta item={item} radar={radar} onOferecer={onOferecer} onAbrir={onAbrir} />
      ) : null}
    </View>
  );
}

function VagaAberta({
  item, radar, onOferecer, onAbrir,
}: {
  item: ItemFilaVespera<OcorrenciaAgendamento>;
  radar: ClienteParaReconquistar[] | null;
  onOferecer: (c: Cliente) => void;
  onAbrir: () => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const r = radar
    ? candidatosParaVaga({ origem: item.cliente, radar, ignorarIds: item.cliente ? [item.cliente.id] : [] })
    : null;
  return (
    <View style={styles.vaga}>
      <Text style={styles.vagaTitulo}>Vaga aberta às {horaBrasilia(item.visita.inicio)}</Text>
      {r === null ? (
        <Text style={styles.texto}>Não consegui ler os clientes com manutenção vencida agora.</Text>
      ) : !r.ok ? (
        <Text style={styles.texto}>Cadastre o CEP de {item.visita.clienteNome || 'este cliente'} para a OLLI sugerir quem mora perto.</Text>
      ) : r.candidatos.length === 0 ? (
        <Text style={styles.texto}>Nenhum cliente com manutenção vencida a até 10 km daqui.</Text>
      ) : (
        <>
          <Text style={styles.texto}>Ofereça a clientes com manutenção vencida aqui perto:</Text>
          {r.candidatos.map((c) => (
            <View key={c.cliente.id} style={styles.candidato}>
              <View style={{ flex: 1 }}>
                <Text style={styles.candNome} numberOfLines={1}>{c.cliente.nome}</Text>
                <Text style={styles.candSub}>{textoDistancia(c.cliente.distanciaKm)} · último serviço há {c.mesesSemContato} {c.mesesSemContato === 1 ? 'mês' : 'meses'}</Text>
              </View>
              {(c.cliente as Cliente).telefone ? (
                <PressableAnimado onPress={() => onOferecer(c.cliente as Cliente)} haptic="light" style={styles.botaoMini} accessibilityRole="button" accessibilityLabel={`Oferecer a vaga a ${c.cliente.nome} no WhatsApp`}>
                  <MaterialCommunityIcons name="whatsapp" size={14} color={cores.accentLight} />
                  <Text style={styles.botaoMiniTxt}>Oferecer</Text>
                </PressableAnimado>
              ) : null}
            </View>
          ))}
          {r.semLocalizacao > 0 ? (
            <Text style={styles.candSub}>{r.semLocalizacao} cliente{r.semLocalizacao === 1 ? '' : 's'} do radar sem endereço localizado ficaram de fora.</Text>
          ) : null}
        </>
      )}
      <PressableAnimado onPress={onAbrir} haptic="selection" style={styles.botaoSec} accessibilityRole="button">
        <MaterialCommunityIcons name="calendar-edit" size={16} color={cores.accentLight} />
        <Text style={styles.botaoSecTxt}>Remarcar na agenda</Text>
      </PressableAnimado>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: c.background },
  scroll: { padding: Spacing.base, gap: Spacing.md, paddingBottom: 120 },
  scrollDesktop: { maxWidth: 680, width: '100%', alignSelf: 'center' },
  seletor: { flexDirection: 'row', backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.full, padding: 4, alignSelf: 'flex-start' },
  opcao: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: BorderRadius.full },
  opcaoAtiva: { backgroundColor: c.surface, ...sombrasDe(c).sm },
  opcaoTxt: { fontSize: 13.5, fontWeight: '700', color: c.onSurfaceVariant },
  opcaoTxtAtiva: { color: c.onSurface },
  faixa: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.md, padding: 12 },
  faixaTxt: { flex: 1, fontSize: 12.5, color: c.onSurfaceVariant, lineHeight: 18 },
  resumo: { flexDirection: 'row', backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, paddingVertical: 12, ...sombrasDe(c).sm },
  numero: { flex: 1, alignItems: 'center' },
  numeroN: { fontSize: 22, fontWeight: '800' },
  numeroR: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 2 },
  card: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.base, gap: 10, ...sombrasDe(c).sm },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hora: { fontSize: 17, fontWeight: '800', color: c.onSurface, fontVariant: ['tabular-nums'] },
  status: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 3 },
  statusTxt: { fontSize: 13, fontWeight: '800', flexShrink: 1 },
  cliente: { fontSize: 15, fontWeight: '800', color: c.onSurface, marginTop: 8 },
  titulo: { fontSize: 15, fontWeight: '800', color: c.onSurface, textAlign: 'center' },
  texto: { fontSize: 13, color: c.onSurfaceVariant, lineHeight: 18, marginTop: 2 },
  vazio: { alignItems: 'center', gap: 8, paddingVertical: Spacing.xxl, paddingHorizontal: Spacing.base },
  botaoZap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.whatsapp, borderRadius: BorderRadius.md, paddingVertical: 11 },
  botaoZapTxt: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  botaoSec: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.strokeGlow, paddingVertical: 10, marginTop: 4 },
  botaoSecTxt: { color: c.accentLight, fontSize: 13.5, fontWeight: '800' },
  vaga: { backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.md, padding: 12, gap: 6 },
  vagaTitulo: { fontSize: 14, fontWeight: '800', color: c.onSurface },
  candidato: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  candNome: { fontSize: 13.5, fontWeight: '700', color: c.onSurface },
  candSub: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 1 },
  botaoMini: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: c.strokeGlow, borderRadius: BorderRadius.full, paddingHorizontal: 11, paddingVertical: 6 },
  botaoMiniTxt: { color: c.accentLight, fontSize: 12.5, fontWeight: '800' },
  rodape: { fontSize: 13, color: c.onSurfaceMuted, textAlign: 'center', lineHeight: 17, marginTop: 4 },
});
