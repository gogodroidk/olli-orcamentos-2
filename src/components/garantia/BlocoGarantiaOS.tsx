import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, comAlfa, useCores, useEstilos, type Cores } from '../../theme';
import { PressableAnimado } from '../motion';
import { DicaContextual } from '../DicaContextual';
import { toast } from '../feedback';
import { definirGarantiaOS, getOrdem } from '../../services/ordemServico';
import { getOrcamento } from '../../database/database';
import { diaBr, hojeLocal } from '../../utils/historicoEquipamento';
import { PRAZOS_SUGERIDOS, garantiaAteDaOS, prazoLegivel, textoGarantiaDaOS } from '../../utils/garantiaServico';
import type { OrdemServico } from '../../types';

/**
 * GARANTIA DA OS (Onda I3, jogada 12) — o prazo desta ordem de serviço, de onde
 * ele veio e até quando vale. Editável: o prestador escreve "90 dias" (ou toca
 * numa sugestão) e a OLLI acompanha — avisa antes de vencer e a etiqueta QR do
 * equipamento passa a oferecer "chamar a garantia".
 *
 * Retorno de garantia (OS aberta pelo chamado da etiqueta) mostra de qual OS ela é.
 * Sem prazo escrito, diz isso — nunca inventa uma garantia.
 */
export function BlocoGarantiaOS({
  ordem,
  onAtualizada,
}: {
  ordem: OrdemServico;
  onAtualizada: (o: OrdemServico) => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [garantiaOrc, setGarantiaOrc] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(ordem.garantia ?? '');
  const [salvando, setSalvando] = useState(false);
  // Número da OS original quando esta é retorno de garantia (só para exibir).
  const [numeroOriginal, setNumeroOriginal] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    if (!ordem.garantiaDeOsId) { setNumeroOriginal(null); return; }
    getOrdem(ordem.garantiaDeOsId)
      .then((o) => { if (vivo) setNumeroOriginal(o?.numero ?? null); })
      .catch(() => { if (vivo) setNumeroOriginal(null); });
    return () => { vivo = false; };
  }, [ordem.garantiaDeOsId]);

  useEffect(() => {
    let vivo = true;
    if (!ordem.orcamentoId) { setGarantiaOrc(null); return; }
    getOrcamento(ordem.orcamentoId)
      .then((o) => { if (vivo) setGarantiaOrc(o?.garantia?.trim() || null); })
      .catch(() => { if (vivo) setGarantiaOrc(null); });
    return () => { vivo = false; };
  }, [ordem.orcamentoId]);

  const atual = textoGarantiaDaOS(ordem, garantiaOrc);
  const ate = garantiaAteDaOS(ordem, garantiaOrc);
  const vigente = ate ? ate >= hojeLocal() : undefined;

  async function salvar(valor: string) {
    if (salvando) return;
    setSalvando(true);
    try {
      const nova = await definirGarantiaOS(ordem.id, valor);
      onAtualizada(nova);
      setEditando(false);
      toast.sucesso(valor.trim() ? 'Garantia salva.' : 'Garantia da OS removida.');
    } catch {
      toast.erro('Não consegui salvar a garantia. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <View style={styles.bloco}>
      <View style={styles.topo}>
        <MaterialCommunityIcons
          name={vigente === false ? 'shield-off-outline' : 'shield-check-outline'}
          size={18}
          color={vigente === false ? cores.onSurfaceMuted : cores.success}
        />
        <Text style={styles.titulo}>Garantia</Text>
        {!editando ? (
          <PressableAnimado
            onPress={() => { setTexto(ordem.garantia ?? atual?.texto ?? ''); setEditando(true); }}
            haptic="selection"
            style={styles.editar}
            accessibilityRole="button"
            accessibilityLabel="Editar o prazo de garantia desta OS"
          >
            <Text style={styles.editarTxt}>{atual ? 'Editar' : 'Definir'}</Text>
          </PressableAnimado>
        ) : null}
      </View>

      {ordem.garantiaDeOsId ? (
        <View style={[styles.retorno, { backgroundColor: comAlfa(cores.warning, 0.12) }]}>
          <MaterialCommunityIcons name="backup-restore" size={14} color={cores.warning} />
          <Text style={[styles.retornoTxt, { color: cores.warning }]}>
            Retorno de garantia{numeroOriginal ? ` da ${numeroOriginal}` : ''}
          </Text>
        </View>
      ) : null}

      {!editando ? (
        atual ? (
          <Text style={styles.texto}>
            {atual.texto}
            {atual.origem === 'orcamento' ? ' (do orçamento)' : ''}
            {ate
              ? vigente ? ` · vale até ${diaBr(ate)}` : ` · venceu em ${diaBr(ate)}`
              : ordem.status === 'concluida'
                ? prazoLegivel(atual.texto) ? '' : ' · sem prazo em dias, meses ou anos: a OLLI não calcula o fim'
                : ' · conta a partir da conclusão do serviço'}
          </Text>
        ) : (
          <Text style={styles.texto}>Sem garantia escrita nesta OS. Defina um prazo para a OLLI avisar antes de vencer.</Text>
        )
      ) : (
        <View style={{ gap: Spacing.sm }}>
          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder="Ex.: 90 dias"
            placeholderTextColor={cores.onSurfaceMuted}
            style={styles.input}
            maxLength={200}
            autoFocus
            accessibilityLabel="Prazo de garantia"
          />
          <View style={styles.chips}>
            {PRAZOS_SUGERIDOS.map((p) => (
              <PressableAnimado key={p} onPress={() => setTexto(p)} haptic="selection" style={[styles.chip, texto === p && styles.chipAtivo]} accessibilityRole="button">
                <Text style={[styles.chipTxt, texto === p && styles.chipTxtAtivo]}>{p}</Text>
              </PressableAnimado>
            ))}
          </View>
          <View style={styles.acoes}>
            <PressableAnimado onPress={() => setEditando(false)} haptic="selection" style={styles.botaoSec} accessibilityRole="button">
              <Text style={styles.botaoSecTxt}>Cancelar</Text>
            </PressableAnimado>
            <PressableAnimado onPress={() => void salvar(texto)} disabled={salvando} haptic="light" style={[styles.botao, salvando && { opacity: 0.6 }]} accessibilityRole="button">
              <Text style={styles.botaoTxt}>{salvando ? 'Salvando…' : 'Salvar'}</Text>
            </PressableAnimado>
          </View>
        </View>
      )}
      <DicaContextual
        id="garantia.os"
        icon="shield-check-outline"
        texto="Com o prazo escrito, a OLLI lembra você de perguntar se está tudo certo e a etiqueta do equipamento mostra até quando vale."
      />
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  bloco: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.base, gap: Spacing.sm },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { flex: 1, fontSize: 15, fontWeight: '800', color: c.onSurface },
  editar: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: c.strokeGlow },
  editarTxt: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },
  texto: { fontSize: 13.5, color: c.onSurfaceVariant, lineHeight: 19 },
  retorno: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  retornoTxt: { fontSize: 12, fontWeight: '800' },
  input: { borderWidth: 1, borderColor: c.outlineDark, borderRadius: BorderRadius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: c.onSurface, backgroundColor: c.surfaceVariant },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surfaceVariant },
  chipAtivo: { borderColor: c.accentLight, backgroundColor: comAlfa(c.accentLight, 0.14) },
  chipTxt: { fontSize: 12.5, fontWeight: '700', color: c.onSurfaceVariant },
  chipTxtAtivo: { color: c.accentLight },
  acoes: { flexDirection: 'row', gap: 8 },
  botao: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primary, borderRadius: BorderRadius.md, paddingVertical: 10 },
  botaoTxt: { color: c.onPrimary, fontSize: 14, fontWeight: '800' },
  botaoSec: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline, paddingVertical: 10 },
  botaoSecTxt: { color: c.onSurfaceVariant, fontSize: 14, fontWeight: '700' },
});
