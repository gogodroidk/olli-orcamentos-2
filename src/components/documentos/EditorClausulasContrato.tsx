import React, { useEffect, useState } from 'react';
import { View, Text, Modal, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Fonts, useCores, useEstilos, type Cores } from '../../theme';
import { OlliButton } from '../OlliButton';
import { OlliInput } from '../OlliInput';
import { saveEmpresa } from '../../database/database';
import { ContratoPadrao, Empresa } from '../../types';
import {
  AVISO_PREVIO_MAX,
  AVISO_PREVIO_PADRAO,
  GARANTIA_PADRAO,
  JUROS_MES_MAX,
  JUROS_MES_PADRAO,
  MULTA_ATRASO_MAX,
  MULTA_ATRASO_PADRAO,
  OBRIGACOES_CONTRATADA_PADRAO,
  OBRIGACOES_CONTRATANTE_PADRAO,
} from '../../utils/contratoPdf';

/**
 * EditorClausulasContrato — as cláusulas que o prestador ajusta UMA VEZ e passam
 * a valer em todo contrato novo.
 *
 * O desenho é deliberado: NENHUM campo é obrigatório e NENHUM campo começa
 * vazio-de-verdade. Cada caixa mostra como placeholder o texto padrão que o
 * documento usará se ele não escrever nada — então "não mexi" e "apaguei de
 * propósito" levam ao mesmo lugar seguro (o padrão), e o prestador vê o que vai
 * sair antes de decidir mudar.
 *
 * O que ele NÃO consegue fazer aqui, de propósito: baixar a multa de mora acima
 * de 2%. Esse é o teto do art. 52, §1º, do CDC para relação de consumo — deixar
 * digitar 10% seria o app ajudando o prestador a escrever uma cláusula que um
 * juiz derruba, com o cliente dele no meio.
 */

// Os tetos vêm de `contratoPdf` (fonte única, ver o bloco "Tetos" lá). Esta tela
// já grampeia com o MESMO número que o gerador aplica no PDF, por construção e
// não por coincidência — antes eram três `const` locais que só batiam de sorte.
const MULTA_MAX = MULTA_ATRASO_MAX;
const JUROS_MAX = JUROS_MES_MAX;
const AVISO_MAX = AVISO_PREVIO_MAX;

interface Props {
  visivel: boolean;
  empresa: Empresa | null;
  aoFechar: () => void;
  /** Chamado após gravar, com a empresa já atualizada. */
  aoSalvar: (empresa: Empresa) => void;
}

/** Número digitado → valor válido, ou `undefined` (= usar o padrão do app). */
function numeroOuIndefinido(texto: string, min: number, max: number): number | undefined {
  const t = texto.trim().replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

/** Texto digitado → string aparada, ou `undefined` (= usar o padrão do app). */
function textoOuIndefinido(texto: string): string | undefined {
  const t = texto.trim();
  return t.length > 0 ? t : undefined;
}

export function EditorClausulasContrato({ visivel, empresa, aoFechar, aoSalvar }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const insets = useSafeAreaInsets();

  const [garantia, setGarantia] = useState('');
  const [multa, setMulta] = useState('');
  const [juros, setJuros] = useState('');
  const [aviso, setAviso] = useState('');
  const [foro, setForo] = useState('');
  const [obrContratada, setObrContratada] = useState('');
  const [obrContratante, setObrContratante] = useState('');
  const [extras, setExtras] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(false);

  // Recarrega do cadastro toda vez que abre: o editor nunca mostra o rascunho
  // de uma sessão anterior como se fosse o que está salvo.
  useEffect(() => {
    if (!visivel) return;
    const p: ContratoPadrao = empresa?.contratoPadrao ?? {};
    setGarantia(p.garantia ?? '');
    setMulta(p.multaAtrasoPercent === undefined ? '' : String(p.multaAtrasoPercent));
    setJuros(p.jurosMesPercent === undefined ? '' : String(p.jurosMesPercent));
    setAviso(p.avisoPrevioDias === undefined ? '' : String(p.avisoPrevioDias));
    setForo(p.foro ?? '');
    setObrContratada(p.obrigacoesContratada ?? '');
    setObrContratante(p.obrigacoesContratante ?? '');
    setExtras(p.clausulasExtras ?? '');
    setErro(false);
    setSalvando(false);
  }, [visivel, empresa]);

  async function salvar() {
    if (!empresa || salvando) return;
    setSalvando(true);
    setErro(false);
    const padrao: ContratoPadrao = {
      garantia: textoOuIndefinido(garantia),
      multaAtrasoPercent: numeroOuIndefinido(multa, 0, MULTA_MAX),
      jurosMesPercent: numeroOuIndefinido(juros, 0, JUROS_MAX),
      avisoPrevioDias: numeroOuIndefinido(aviso, 0, AVISO_MAX),
      foro: textoOuIndefinido(foro),
      obrigacoesContratada: textoOuIndefinido(obrContratada),
      obrigacoesContratante: textoOuIndefinido(obrContratante),
      clausulasExtras: textoOuIndefinido(extras),
    };
    const atualizada: Empresa = { ...empresa, contratoPadrao: padrao };
    try {
      await saveEmpresa(atualizada);
    } catch {
      // Falha de gravação NUNCA vira "salvo": o editor continua aberto, com o
      // texto do prestador intacto, e diz o que aconteceu.
      setErro(true);
      setSalvando(false);
      return;
    }
    setSalvando(false);
    aoSalvar(atualizada);
    aoFechar();
  }

  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={aoFechar} presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo}>Cláusulas padrão do contrato</Text>
            <Text style={styles.sub}>Ajuste uma vez; vale para todo contrato novo</Text>
          </View>
          <TouchableOpacity onPress={aoFechar} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar sem salvar">
            <MaterialCommunityIcons name="close" size={24} color={cores.onSurface} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: Spacing.base, paddingBottom: Spacing.xl + insets.bottom, gap: Spacing.md }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.dica}>
            <MaterialCommunityIcons name="lightbulb-outline" size={16} color={cores.accentLight} />
            <Text style={styles.dicaTexto}>
              Campo em branco usa o texto padrão que aparece em cinza. Você não precisa preencher nada para
              o contrato sair completo.
            </Text>
          </View>

          <OlliInput
            label="Garantia"
            value={garantia}
            onChangeText={setGarantia}
            placeholder={GARANTIA_PADRAO}
            multiline
            numberOfLines={3}
            helper="A garantia combinada no orçamento tem prioridade sobre este texto."
          />

          <View style={styles.linha}>
            <View style={{ flex: 1 }}>
              <OlliInput
                label="Multa por atraso (%)"
                value={multa}
                onChangeText={setMulta}
                placeholder={String(MULTA_ATRASO_PADRAO)}
                keyboardType="decimal-pad"
                helper={`Teto de ${MULTA_MAX}% (CDC art. 52, §1º)`}
              />
            </View>
            <View style={{ flex: 1 }}>
              <OlliInput
                label="Juros ao mês (%)"
                value={juros}
                onChangeText={setJuros}
                placeholder={String(JUROS_MES_PADRAO)}
                keyboardType="decimal-pad"
                helper={`Padrão: ${JUROS_MES_PADRAO}%`}
              />
            </View>
          </View>

          <View style={styles.linha}>
            <View style={{ flex: 1 }}>
              <OlliInput
                label="Aviso de rescisão (dias)"
                value={aviso}
                onChangeText={setAviso}
                placeholder={String(AVISO_PREVIO_PADRAO)}
                keyboardType="number-pad"
                helper={`Padrão: ${AVISO_PREVIO_PADRAO} dias`}
              />
            </View>
            <View style={{ flex: 1 }}>
              <OlliInput
                label="Foro"
                value={foro}
                onChangeText={setForo}
                placeholder="Sua cidade/UF"
                helper="Em branco: a cidade do seu cadastro"
              />
            </View>
          </View>

          <OlliInput
            label="Suas obrigações"
            value={obrContratada}
            onChangeText={setObrContratada}
            placeholder={OBRIGACOES_CONTRATADA_PADRAO}
            multiline
            numberOfLines={5}
            helper="Uma obrigação por linha."
          />

          <OlliInput
            label="Obrigações do cliente"
            value={obrContratante}
            onChangeText={setObrContratante}
            placeholder={OBRIGACOES_CONTRATANTE_PADRAO}
            multiline
            numberOfLines={5}
            helper="Uma obrigação por linha."
          />

          <OlliInput
            label="Cláusulas complementares"
            value={extras}
            onChangeText={setExtras}
            placeholder="Ex.: acesso ao imóvel entre 8h e 18h; estacionamento por conta do cliente."
            multiline
            numberOfLines={4}
            helper="Opcional. Entra como a última cláusula do contrato."
          />

          {erro && (
            <View style={styles.erroBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={cores.danger} />
              <Text style={styles.erroTexto}>
                Não consegui salvar agora. Seu texto continua aqui — toque em salvar de novo.
              </Text>
            </View>
          )}

          <OlliButton
            label={erro ? 'Tentar salvar de novo' : 'Salvar cláusulas'}
            variant="gradient"
            fullWidth
            loading={salvando}
            disabled={!empresa || salvando}
            onPress={salvar}
            icon={<MaterialCommunityIcons name="content-save-outline" size={18} color="#fff" />}
          />
          {!empresa && (
            <Text style={styles.semEmpresa}>
              Preencha os dados em "Meu Negócio" antes de salvar suas cláusulas.
            </Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.outline,
  },
  titulo: { fontSize: 17, fontFamily: Fonts.extraBold, color: c.onSurface },
  sub: { fontSize: 12.5, fontFamily: Fonts.regular, color: c.onSurfaceVariant, marginTop: 1 },

  dica: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: c.accentContainer, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: c.strokeGlow, padding: Spacing.md,
  },
  dicaTexto: { flex: 1, fontSize: 12.5, fontFamily: Fonts.regular, color: c.onSurface, lineHeight: 18 },

  linha: { flexDirection: 'row', gap: Spacing.sm },

  erroBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: c.dangerLight, borderRadius: BorderRadius.md, padding: Spacing.md,
  },
  erroTexto: { flex: 1, fontSize: 12.5, fontFamily: Fonts.regular, color: c.danger, lineHeight: 18 },
  semEmpresa: { fontSize: 12, fontFamily: Fonts.regular, color: c.onSurfaceVariant, textAlign: 'center' },
});
