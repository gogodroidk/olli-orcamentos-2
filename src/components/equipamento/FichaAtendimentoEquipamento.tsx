import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, type Cores } from '../../theme';
import { OlliButton } from '../OlliButton';
import { OlliSkeleton } from '../OlliSkeleton';
import { vibrar } from '../../utils/haptico';
import {
  carregarHistoricoEquipamento,
  iniciarAtendimento,
  type TecnicoAtendimento,
} from '../../services/atendimentoEquipamento';
import { diaBr, osParaRetomarPor, type HistoricoEquipamento } from '../../utils/historicoEquipamento';
import { STATUS_OS_CORES, STATUS_OS_LABELS, type Equipamento } from '../../types';

/**
 * FICHA DE ATENDIMENTO do equipamento — o que o técnico vê logo depois de ler o
 * QR colado na máquina: o botão "Iniciar atendimento" (cria ou retoma a OS ligada
 * ao equipamento) e o histórico — último serviço, próxima manutenção, garantia,
 * visitas PMOC, OS e fotos.
 *
 * Três estados explícitos (nunca colapsar erro em vazio): carregando → skeleton;
 * erro → aviso com "tentar de novo" (NUNCA "nenhum serviço"); ok → dados, e
 * "nenhum serviço registrado ainda" só quando a leitura deu certo e veio vazia.
 */
export function FichaAtendimentoEquipamento({
  equipamento,
  tecnico,
  podeAtender = true,
  onAbrirOS,
}: {
  equipamento: Equipamento;
  /** Técnico de equipe que escaneou: a OS nova sai atribuída a ele. */
  tecnico?: TecnicoAtendimento;
  /** false esconde o botão (ex.: equipamento na lixeira / fora de operação). */
  podeAtender?: boolean;
  /** O histórico recarrega sozinho quando o objeto `equipamento` muda (editar/fotografar). */
  onAbrirOS: (ordemId: string) => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [hist, setHist] = useState<HistoricoEquipamento | null>(null);
  const [erro, setErro] = useState(false);
  const [iniciando, setIniciando] = useState(false);

  const carregar = useCallback(async () => {
    setErro(false);
    try {
      setHist(await carregarHistoricoEquipamento(equipamento));
    } catch {
      setHist(null);
      setErro(true);
    }
  }, [equipamento]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function atender() {
    if (!hist || iniciando) return;
    vibrar('selecao');
    setIniciando(true);
    try {
      const { ordem, criada } = await iniciarAtendimento(equipamento, hist, tecnico);
      vibrar('sucesso');
      if (criada) {
        Alert.alert('Atendimento iniciado', `${ordem.numero} aberta e ligada a este equipamento.`);
      }
      onAbrirOS(ordem.id);
      void carregar();
    } catch (e: any) {
      vibrar('erro');
      Alert.alert('Não deu', e?.message ?? 'Não consegui iniciar o atendimento agora.');
    } finally {
      setIniciando(false);
    }
  }

  if (erro) {
    return (
      <View style={styles.bloco}>
        <View style={styles.avisoErro}>
          <MaterialCommunityIcons name="alert-circle-outline" size={20} color={cores.danger} />
          <Text style={styles.avisoErroTxt}>Não consegui carregar o histórico deste equipamento.</Text>
        </View>
        <OlliButton label="Tentar de novo" variant="outline" fullWidth onPress={() => { void carregar(); }} />
      </View>
    );
  }

  if (!hist) {
    return (
      <View style={{ gap: 10 }}>
        <OlliSkeleton width="100%" height={56} radius={16} />
        <OlliSkeleton width="100%" height={120} radius={16} />
      </View>
    );
  }

  const retomar = osParaRetomarPor(hist.abertas, tecnico?.id);
  const rotuloBotao = retomar
    ? (retomar.status === 'em_execucao' ? `Continuar atendimento (${retomar.numero})` : `Retomar atendimento (${retomar.numero})`)
    : 'Iniciar atendimento';

  return (
    <View style={{ gap: Spacing.base }}>
      {podeAtender ? (
        <OlliButton
          label={rotuloBotao}
          variant="gradient"
          size="lg"
          fullWidth
          loading={iniciando}
          onPress={atender}
          icon={<MaterialCommunityIcons name="clipboard-play-outline" size={20} color="#fff" />}
        />
      ) : null}

      <View style={styles.bloco}>
        <Text style={styles.blocoTitulo}>Histórico do equipamento</Text>

        <View style={styles.resumoGrid}>
          <Resumo
            icone="wrench-check-outline"
            rotulo="Último serviço"
            valor={hist.ultimoServico ? diaBr(hist.ultimoServico.data) : '—'}
            sub={hist.ultimoServico ? hist.ultimoServico.numero : 'Nenhum concluído ainda'}
          />
          <Resumo
            icone="calendar-clock"
            rotulo="Próxima manutenção"
            valor={hist.proximaManutencao ? diaBr(hist.proximaManutencao.dia) : '—'}
            sub={hist.proximaManutencao
              ? (hist.proximaManutencao.origem === 'pmoc' ? 'Plano PMOC' : 'Visita agendada')
              : 'Nada agendado'}
          />
        </View>

        {hist.pmocVencida ? (
          <TouchableOpacity
            style={styles.alerta}
            activeOpacity={0.85}
            onPress={() => onAbrirOS(hist.pmocVencida!.osId)}
            accessibilityRole="button"
            accessibilityLabel="Abrir a visita PMOC vencida"
          >
            <MaterialCommunityIcons name="alert-outline" size={18} color={cores.warning} />
            <Text style={styles.alertaTxt}>Visita PMOC vencida em {diaBr(hist.pmocVencida.dia)} — ainda não concluída.</Text>
          </TouchableOpacity>
        ) : null}

        {hist.garantia ? (
          <View style={styles.linha}>
            <MaterialCommunityIcons
              name={hist.garantia.vigente === false ? 'shield-off-outline' : 'shield-check-outline'}
              size={18}
              color={hist.garantia.vigente === false ? cores.onSurfaceMuted : cores.success}
            />
            <Text style={styles.linhaTxt}>
              Garantia: {hist.garantia.texto}
              {hist.garantia.ate
                ? (hist.garantia.vigente ? ` · vale até ${diaBr(hist.garantia.ate)}` : ` · venceu em ${diaBr(hist.garantia.ate)}`)
                : ` · desde ${diaBr(hist.garantia.desde)}`}
              {` (${hist.garantia.osNumero})`}
            </Text>
          </View>
        ) : null}

        {hist.visitasPmoc > 0 ? (
          <View style={styles.linha}>
            <MaterialCommunityIcons name="clipboard-list-outline" size={18} color={cores.accentLight} />
            <Text style={styles.linhaTxt}>
              {hist.visitasPmoc} visita{hist.visitasPmoc === 1 ? '' : 's'} PMOC no plano deste equipamento
            </Text>
          </View>
        ) : null}

        <Text style={styles.sub}>Ordens de serviço</Text>
        {hist.ordens.length === 0 ? (
          <Text style={styles.vazio}>Nenhum serviço registrado neste equipamento ainda. O primeiro nasce no "Iniciar atendimento".</Text>
        ) : (
          hist.ordens.slice(0, 6).map((os) => (
            <TouchableOpacity
              key={os.id}
              style={styles.osLinha}
              activeOpacity={0.85}
              onPress={() => onAbrirOS(os.id)}
              accessibilityRole="button"
              accessibilityLabel={`Abrir ${os.numero}`}
            >
              <View style={[styles.osPonto, { backgroundColor: STATUS_OS_CORES[os.status] }]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.osTitulo} numberOfLines={1}>{os.numero} · {os.titulo}</Text>
                <Text style={styles.osSub} numberOfLines={1}>
                  {STATUS_OS_LABELS[os.status]}
                  {os.status === 'concluida' && os.concluidoEm ? ` em ${diaBr(os.concluidoEm)}` : ''}
                  {os.status !== 'concluida' && os.dataAgendada ? ` · ${diaBr(os.dataAgendada)}` : ''}
                  {os.tecnicoNome ? ` · ${os.tecnicoNome}` : ''}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceMuted} />
            </TouchableOpacity>
          ))
        )}
        {hist.ordens.length > 6 ? (
          <Text style={styles.mais}>+ {hist.ordens.length - 6} ordem(ns) mais antiga(s) na lista de OS</Text>
        ) : null}

        {hist.fotos.length > 0 ? (
          <>
            <Text style={styles.sub}>Fotos (equipamento e serviços)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {hist.fotos.slice(0, 12).map((uri) => (
                  <Image key={uri} source={{ uri }} style={styles.foto} />
                ))}
              </View>
            </ScrollView>
          </>
        ) : null}
      </View>
    </View>
  );

}

function Resumo({ icone, rotulo, valor, sub }: {
  icone: keyof typeof MaterialCommunityIcons.glyphMap;
  rotulo: string;
  valor: string;
  sub: string;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.resumo}>
      <View style={styles.resumoTopo}>
        <MaterialCommunityIcons name={icone} size={15} color={cores.accentLight} />
        <Text style={styles.resumoRotulo}>{rotulo}</Text>
      </View>
      <Text style={styles.resumoValor}>{valor}</Text>
      <Text style={styles.resumoSub} numberOfLines={1}>{sub}</Text>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  bloco: {
    backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: c.outlineDark, padding: Spacing.base, gap: 10, ...sombrasDe(c).sm,
  },
  blocoTitulo: { fontSize: 15, fontWeight: '800', color: c.onSurface },
  resumoGrid: { flexDirection: 'row', gap: 10 },
  resumo: {
    flex: 1, backgroundColor: c.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: c.outline, padding: 12,
  },
  resumoTopo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  resumoRotulo: { fontSize: 11.5, fontWeight: '700', color: c.onSurfaceVariant },
  resumoValor: { fontSize: 16, fontWeight: '800', color: c.onSurface, marginTop: 6 },
  resumoSub: { fontSize: 11.5, color: c.onSurfaceVariant, marginTop: 2 },
  alerta: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: c.warningLight, borderRadius: BorderRadius.md, padding: 10,
  },
  alertaTxt: { flex: 1, fontSize: 12.5, color: c.onSurface, fontWeight: '600', lineHeight: 17 },
  linha: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  linhaTxt: { flex: 1, fontSize: 13, color: c.onSurface, lineHeight: 18 },
  sub: { fontSize: 12.5, fontWeight: '800', color: c.onSurfaceVariant, marginTop: 4 },
  vazio: { fontSize: 13, color: c.onSurfaceVariant, lineHeight: 19 },
  osLinha: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: c.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: c.outline, paddingHorizontal: 12, paddingVertical: 10,
  },
  osPonto: { width: 9, height: 9, borderRadius: 5 },
  osTitulo: { fontSize: 13.5, fontWeight: '800', color: c.onSurface },
  osSub: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
  mais: { fontSize: 12, color: c.onSurfaceVariant },
  foto: { width: 84, height: 84, borderRadius: BorderRadius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline },
  avisoErro: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avisoErroTxt: { flex: 1, fontSize: 13.5, color: c.onSurface, fontWeight: '600' },
});
