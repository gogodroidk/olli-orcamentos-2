/**
 * FolhaNovaDataVisita — o passo 2 do "Remarcar por chuva": PARA QUANDO.
 *
 * Depois do WhatsApp aberto pela `FolhaRemarcarChuva`, esta folha sobe com:
 *  - os horários do Encaixe Inteligente (perto de onde o prestador já vai
 *    estar), um toque remarca;
 *  - "Escolher dia e hora" (calendário + relógio), para quando o cliente pediu
 *    outro horário.
 *
 * Gravar é `remarcarVisita`: visita de SÉRIE muda só ESTA ocorrência (exceção via
 * `editarRecorrente`, alcance "só esta"); avulsa muda a própria linha. Dá para
 * desfazer pelo toast. Se gravar falhar, o erro fica NA folha e a visita segue
 * onde estava — nada é dado como remarcado.
 *
 * Motion: a folha sobe com a animação do Modal (corte seco com "Reduzir
 * movimento"); dentro dela, `Aparecer` e `PressableAnimado` dos componentes de
 * motion. Nada além de transform/opacity.
 */
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DatePickerModal, TimePickerModal } from 'react-native-paper-dates';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BorderRadius, Spacing, comAlfa, useCores, useEstilos, type Cores } from '../../theme';
import { useReduzirMovimento } from '../../theme/motion';
import { OlliButton } from '../OlliButton';
import { Aparecer, PressableAnimado } from '../motion';
import { SugestaoEncaixe } from '../agenda/SugestaoEncaixe';
import { toast } from '../feedback';
import { vibrar } from '../../utils/haptico';
import { capitalizeFirst } from '../../utils/date';
import { desfazerRemarcacao, remarcarVisita } from '../../services/remarcarVisita';
import type { EstadoEncaixe } from '../../hooks/useEncaixe';
import type { OcorrenciaAgendamento } from '../../utils/contratoRecorrente';

export interface FolhaNovaDataVisitaProps {
  visivel: boolean;
  visita: OcorrenciaAgendamento;
  /** Do `useEncaixe` (3 estados). */
  encaixe: EstadoEncaixe;
  aoFechar: () => void;
  /** Depois de gravar: a tela relê a agenda. */
  aoRemarcado: () => void;
}

function quandoVisita(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return capitalizeFirst(format(d, "EEEE, d 'de' MMM 'às' HH:mm", { locale: ptBR }));
}

export function FolhaNovaDataVisita({ visivel, visita, encaixe, aoFechar, aoRemarcado }: FolhaNovaDataVisitaProps) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const reduzir = useReduzirMovimento();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [passo, setPasso] = useState<'lista' | 'dia' | 'hora'>('lista');
  const [diaEscolhido, setDiaEscolhido] = useState<Date | null>(null);
  const serie = !!(visita.recorrencia || visita.ocorrenciaDe);

  useEffect(() => {
    if (visivel) {
      setErro(null);
      setSalvando(false);
      setPasso('lista');
      setDiaEscolhido(null);
    }
  }, [visivel]);

  async function gravar(novoInicio: Date) {
    if (salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      const { antes } = await remarcarVisita(visita, novoInicio);
      vibrar('sucesso');
      aoFechar();
      aoRemarcado();
      toast.sucesso(`Visita de ${visita.clienteNome} remarcada para ${format(novoInicio, "d 'de' MMM 'às' HH:mm", { locale: ptBR })}.`, {
        acao: {
          rotulo: 'Desfazer',
          aoTocar: () => {
            void desfazerRemarcacao(antes)
              .then(() => {
                toast.info('A visita voltou para o horário de antes.');
                aoRemarcado();
              })
              .catch(() => toast.erro('Não deu para desfazer agora. Abra a visita na Agenda e ajuste à mão.'));
          },
        },
      });
    } catch (e) {
      vibrar('erro');
      setErro(e instanceof Error && e.message ? e.message : 'Não deu para remarcar agora. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  const horaAtual = (() => {
    const d = new Date(visita.inicio);
    return Number.isNaN(d.getTime()) ? { hours: 9, minutes: 0 } : { hours: d.getHours(), minutes: d.getMinutes() };
  })();

  return (
    <Modal visible={visivel} transparent animationType={reduzir ? 'none' : 'slide'} onRequestClose={aoFechar}>
      <View style={styles.fundo}>
        <Pressable style={StyleSheet.absoluteFill} onPress={aoFechar} accessibilityLabel="Fechar" accessibilityRole="button" />
        <View style={styles.caixa}>
          <View style={styles.cabecalho}>
            <View style={[styles.icone, { backgroundColor: comAlfa(cores.accentLight, 0.14) }]}>
              <MaterialCommunityIcons name="calendar-edit" size={22} color={cores.accentLight} />
            </View>
            <View style={styles.cabecalhoTexto}>
              <Text style={styles.titulo}>Para quando remarcar?</Text>
              <Text style={styles.subtitulo} numberOfLines={2}>
                {visita.clienteNome} · {quandoVisita(visita.inicio)}
              </Text>
            </View>
            <PressableAnimado onPress={aoFechar} accessibilityLabel="Fechar" hitSlop={10}>
              <MaterialCommunityIcons name="close" size={23} color={cores.onSurfaceVariant} />
            </PressableAnimado>
          </View>

          <View style={styles.conteudo}>
            <Aparecer indice={0}>
              <SugestaoEncaixe
                resultado={encaixe}
                titulo="Horários perto de onde você já vai estar"
                onEscolher={(s) => { vibrar('selecao'); void gravar(new Date(s.inicio)); }}
              />
            </Aparecer>
            {serie ? (
              <Text style={styles.nota}>Visita que repete: só esta muda. As outras repetições continuam.</Text>
            ) : null}
            {erro ? (
              <Text style={styles.erro} accessibilityRole="alert">
                {erro}
              </Text>
            ) : null}
            <OlliButton
              label="Escolher dia e hora"
              variant="outline"
              fullWidth
              size="lg"
              loading={salvando}
              disabled={salvando}
              onPress={() => setPasso('dia')}
              icon={<MaterialCommunityIcons name="calendar-search" size={20} color={cores.accentLight} />}
              style={{ marginTop: Spacing.md }}
            />
          </View>
        </View>
      </View>

      <DatePickerModal
        locale="pt-BR"
        mode="single"
        visible={passo === 'dia'}
        date={diaEscolhido ?? new Date(visita.inicio)}
        validRange={{ startDate: new Date(new Date().setHours(0, 0, 0, 0)) }}
        startWeekOnMonday
        label="Novo dia da visita"
        saveLabel="Próximo"
        onDismiss={() => setPasso('lista')}
        onConfirm={({ date }) => {
          if (!date) { setPasso('lista'); return; }
          setDiaEscolhido(date);
          setPasso('hora');
        }}
      />
      <TimePickerModal
        visible={passo === 'hora'}
        animationType="fade"
        locale="pt-BR"
        use24HourClock
        label="Novo horário"
        cancelLabel="Voltar"
        confirmLabel="Remarcar"
        hours={horaAtual.hours}
        minutes={horaAtual.minutes}
        onDismiss={() => setPasso('lista')}
        onConfirm={({ hours, minutes }) => {
          setPasso('lista');
          if (!diaEscolhido) return;
          const novo = new Date(diaEscolhido);
          novo.setHours(hours, minutes, 0, 0);
          void gravar(novo);
        }}
      />
    </Modal>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    fundo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
    caixa: {
      backgroundColor: c.surface,
      borderTopLeftRadius: BorderRadius.xl,
      borderTopRightRadius: BorderRadius.xl,
      paddingBottom: Spacing.xl,
    },
    cabecalho: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      padding: Spacing.base,
      borderBottomWidth: 1,
      borderBottomColor: c.outline,
    },
    cabecalhoTexto: { flex: 1 },
    icone: { width: 40, height: 40, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
    titulo: { color: c.onSurface, fontSize: 17, fontWeight: '800' },
    subtitulo: { color: c.onSurfaceMuted, fontSize: 13, marginTop: 2 },
    conteudo: { padding: Spacing.base },
    nota: { color: c.onSurfaceVariant, fontSize: 12, lineHeight: 17, marginTop: Spacing.sm },
    erro: { color: c.danger, fontSize: 13, marginTop: Spacing.sm },
  });
