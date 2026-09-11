import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, useCores, useEstilos, type Cores } from '../theme';
import { OlliButton } from './OlliButton';

type Props = {
  visivel: boolean;
  referencia: string;
  aoFechar: () => void;
  aoSalvar: (motivo: string) => Promise<void>;
};

/** Estorno é uma transição auditável, nunca exclusão silenciosa do pagamento. */
export function EstornarPagamentoModal({ visivel, referencia, aoFechar, aoSalvar }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!visivel) return;
    setMotivo('');
    setErro(null);
    setSalvando(false);
  }, [visivel]);

  async function salvar() {
    const texto = motivo.trim();
    if (texto.length < 3) {
      setErro('Informe o motivo do estorno.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await aoSalvar(texto);
    } catch (e: any) {
      setErro(e?.message ?? 'Não foi possível estornar o pagamento.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={aoFechar}>
      <View style={styles.fundo}>
        <View style={styles.caixa}>
          <View style={styles.cabecalho}>
            <View style={styles.icone}><MaterialCommunityIcons name="undo-variant" size={22} color={cores.danger} /></View>
            <View style={{ flex: 1 }}><Text style={styles.titulo}>Estornar recebimento</Text><Text style={styles.subtitulo}>{referencia}</Text></View>
            <TouchableOpacity onPress={aoFechar} disabled={salvando} accessibilityRole="button" accessibilityLabel="Fechar estorno"><MaterialCommunityIcons name="close" size={23} color={cores.onSurfaceVariant} /></TouchableOpacity>
          </View>
          <View style={styles.conteudo}>
            <Text style={styles.aviso}>O registro financeiro será marcado como estornado e continuará no histórico. O recibo não será apagado.</Text>
            <Text style={styles.rotulo}>Motivo do estorno</Text>
            <TextInput value={motivo} onChangeText={setMotivo} placeholder="Ex.: pagamento duplicado" placeholderTextColor={cores.onSurfaceMuted} multiline maxLength={500} editable={!salvando} style={styles.input} accessibilityLabel="Motivo do estorno" />
            {erro ? <Text style={styles.erro} accessibilityRole="alert">{erro}</Text> : null}
            <OlliButton label="Confirmar estorno" variant="danger" fullWidth size="lg" loading={salvando} onPress={() => { void salvar(); }} icon={<MaterialCommunityIcons name="undo-variant" size={20} color="#fff" />} style={{ marginTop: Spacing.md }} />
            <OlliButton label="Cancelar" variant="outline" fullWidth size="lg" disabled={salvando} onPress={aoFechar} style={{ marginTop: Spacing.sm }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  fundo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  caixa: { backgroundColor: c.surface, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, paddingBottom: Spacing.xl },
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: c.outline },
  icone: { width: 40, height: 40, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: c.danger + '18' },
  titulo: { color: c.onSurface, fontSize: 18, fontWeight: '800' },
  subtitulo: { color: c.onSurfaceMuted, fontSize: 12, marginTop: 3 },
  conteudo: { padding: Spacing.base },
  aviso: { color: c.onSurfaceVariant, fontSize: 13, lineHeight: 19, padding: Spacing.md, backgroundColor: c.warning + '12', borderRadius: BorderRadius.md },
  rotulo: { color: c.onSurface, fontSize: 13, fontWeight: '700', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  input: { minHeight: 92, color: c.onSurface, backgroundColor: c.surfaceVariant, borderWidth: 1, borderColor: c.outline, borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: 14, textAlignVertical: 'top' },
  erro: { color: c.danger, fontSize: 13, marginTop: Spacing.sm },
});
