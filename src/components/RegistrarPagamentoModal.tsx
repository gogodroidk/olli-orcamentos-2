import React, { useEffect, useState } from 'react';
import { Alert, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { BorderRadius, Spacing, useCores, useEstilos, type Cores } from '../theme';
import { OlliButton } from './OlliButton';
import { OlliInput, OlliMoneyInput } from './OlliInput';
import { todayISO } from '../utils/date';
import { isoToBR } from '../utils/masks';
import { enviarComprovanteLocal, type ComprovantePagamento } from '../services/comprovantePagamento';

export type PagamentoForm = {
  valorRecebido: number;
  formaPagamento: string;
  dataRecebimento: string;
  comprovante?: Pick<ComprovantePagamento, 'chave' | 'hash' | 'mime' | 'tamanhoBytes'>;
};

type Props = {
  visivel: boolean;
  clienteNome: string;
  valorSugerido: number;
  aoFechar: () => void;
  aoSalvar: (form: PagamentoForm) => Promise<void>;
};

const FORMAS = ['PIX', 'Cartão', 'Dinheiro', 'Boleto', 'Outro'];

/**
 * Registro rápido de recebimento. O pagamento é financeiro e não sobrescreve
 * o status comercial do orçamento (Aprovado/Convertido); o badge "Pago" nasce
 * do recibo salvo e continua auditável.
 */
export function RegistrarPagamentoModal({ visivel, clienteNome, valorSugerido, aoFechar, aoSalvar }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [valor, setValor] = useState(valorSugerido);
  const [forma, setForma] = useState('PIX');
  const [data, setData] = useState(isoToBR(todayISO()));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [comprovante, setComprovante] = useState<ComprovantePagamento | null>(null);
  const [carregandoComprovante, setCarregandoComprovante] = useState(false);

  useEffect(() => {
    if (!visivel) return;
    setValor(valorSugerido);
    setForma('PIX');
    setData(isoToBR(todayISO()));
    setErro(null);
    setSalvando(false);
    setComprovante(null);
    setCarregandoComprovante(false);
  }, [visivel, valorSugerido]);

  async function escolherComprovante() {
    if (carregandoComprovante || salvando) return;
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert('Permissão necessária', 'Permita acesso às fotos para anexar o comprovante do pagamento.');
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: false });
    if (resultado.canceled || !resultado.assets?.[0]?.uri) return;
    setCarregandoComprovante(true);
    setErro(null);
    try {
      setComprovante(await enviarComprovanteLocal(resultado.assets[0].uri));
    } catch (e: any) {
      setErro(e?.message ?? 'Não foi possível anexar o comprovante.');
    } finally {
      setCarregandoComprovante(false);
    }
  }

  async function salvar() {
    if (!Number.isFinite(valor) || valor <= 0) {
      setErro('Informe um valor recebido maior que zero.');
      return;
    }
    if (!data.trim()) {
      setErro('Informe a data do recebimento.');
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      await aoSalvar({
        valorRecebido: valor,
        formaPagamento: forma,
        dataRecebimento: data,
        ...(comprovante ? { comprovante: { chave: comprovante.chave, hash: comprovante.hash, mime: comprovante.mime, tamanhoBytes: comprovante.tamanhoBytes } } : {}),
      });
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui registrar o pagamento agora.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={aoFechar}>
      <View style={styles.fundo}>
        <View style={styles.caixa}>
          <View style={styles.cabecalho}>
            <View style={{ flex: 1 }}>
              <Text style={styles.titulo}>Registrar pagamento</Text>
              <Text style={styles.subtitulo}>{clienteNome || 'Cliente do orçamento'}</Text>
            </View>
            <TouchableOpacity onPress={aoFechar} accessibilityRole="button" accessibilityLabel="Fechar registro de pagamento">
              <MaterialCommunityIcons name="close" size={24} color={cores.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
            <View style={styles.aviso}>
              <MaterialCommunityIcons name="information-outline" size={20} color={cores.primaryLight} />
              <Text style={styles.avisoTexto}>
                Isso marca o financeiro como Pago. O status comercial do orçamento continua separado e o recibo pode ser gerado depois.
              </Text>
            </View>

            <OlliMoneyInput label="Valor recebido" required value={valor} onChangeValue={setValor} />
            <OlliInput label="Data do recebimento" mask="date" value={data} onChangeText={setData} leftIcon="calendar" />

            <Text style={styles.rotulo}>Forma de pagamento</Text>
            <View style={styles.formas}>
              {FORMAS.map(item => (
                <TouchableOpacity
                  key={item}
                  style={[styles.forma, forma === item && { backgroundColor: cores.primary, borderColor: cores.primary }]}
                  onPress={() => setForma(item)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: forma === item }}
                >
                  <Text style={[styles.formaTexto, forma === item && { color: cores.onPrimary, fontWeight: '800' }]}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.comprovanteBtn} onPress={() => { void escolherComprovante(); }} disabled={carregandoComprovante || salvando} accessibilityRole="button" accessibilityLabel="Anexar comprovante de pagamento">
              <MaterialCommunityIcons name="paperclip" size={19} color={cores.primaryLight} />
              <Text style={styles.comprovanteBtnTexto}>{carregandoComprovante ? 'Salvando comprovante…' : comprovante ? 'Trocar comprovante' : 'Anexar comprovante (opcional)'}</Text>
            </TouchableOpacity>
            {comprovante && (
              <View style={styles.comprovanteSelecionado}>
                <Image source={{ uri: comprovante.url }} style={styles.comprovanteThumb} />
                <View style={{ flex: 1 }}><Text style={styles.comprovanteNome}>Comprovante salvo na nuvem</Text><Text style={styles.comprovanteHash}>SHA-256 {comprovante.hash.slice(0, 12)}…</Text></View>
                <TouchableOpacity onPress={() => setComprovante(null)} disabled={salvando} accessibilityRole="button" accessibilityLabel="Remover comprovante"><MaterialCommunityIcons name="close-circle-outline" size={20} color={cores.onSurfaceMuted} /></TouchableOpacity>
              </View>
            )}

            {erro ? <Text style={styles.erro} accessibilityRole="alert">{erro}</Text> : null}

            <OlliButton
              label="Registrar recebimento"
              variant="success"
              size="lg"
              fullWidth
              loading={salvando}
              onPress={salvar}
              icon={<MaterialCommunityIcons name="cash-check" size={21} color="#fff" />}
              style={{ marginTop: Spacing.md }}
            />
            <OlliButton label="Cancelar" variant="outline" size="lg" fullWidth onPress={aoFechar} disabled={salvando} style={{ marginTop: Spacing.sm }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  fundo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  caixa: { maxHeight: '92%', backgroundColor: c.surface, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, paddingBottom: Spacing.xl },
  cabecalho: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.base, borderBottomWidth: 1, borderBottomColor: c.outline },
  titulo: { color: c.onSurface, fontSize: 19, fontWeight: '800' },
  subtitulo: { color: c.onSurfaceVariant, fontSize: 13, marginTop: 3 },
  conteudo: { padding: Spacing.base, paddingBottom: Spacing.xl },
  aviso: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', padding: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: c.primaryLight + '14', marginBottom: Spacing.md },
  avisoTexto: { flex: 1, color: c.onSurfaceVariant, fontSize: 13, lineHeight: 19 },
  rotulo: { color: c.onSurfaceVariant, fontSize: 13, fontWeight: '700', marginTop: Spacing.sm, marginBottom: Spacing.sm },
  formas: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  forma: { minWidth: 86, paddingHorizontal: 12, paddingVertical: 10, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline, alignItems: 'center' },
  formaTexto: { color: c.onSurfaceVariant, fontSize: 13 },
  erro: { color: c.danger, fontSize: 13, marginTop: Spacing.md },
  comprovanteBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: c.primaryLight + '70', borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 12, marginTop: Spacing.lg },
  comprovanteBtnTexto: { flex: 1, color: c.primaryLight, fontSize: 13, fontWeight: '700' },
  comprovanteSelecionado: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: Spacing.sm, padding: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: c.surfaceVariant, borderWidth: 1, borderColor: c.outline },
  comprovanteThumb: { width: 42, height: 42, borderRadius: BorderRadius.sm, backgroundColor: c.surfaceElevated },
  comprovanteNome: { color: c.onSurface, fontSize: 12.5, fontWeight: '700' },
  comprovanteHash: { color: c.onSurfaceMuted, fontSize: 10.5, marginTop: 2 },
});
