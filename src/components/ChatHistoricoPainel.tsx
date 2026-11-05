import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, Spacing, useCores, useEstilos, type Cores } from '../theme';
import type { ConversaGuardada } from '../utils/chatUi';

const formatoHora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Lista das conversas guardadas neste aparelho. Abrir uma não chama a IA.
 * Apagar tira só o registro local.
 */
export function ChatHistoricoPainel({
  aberto,
  conversas,
  ativaId,
  onFechar,
  onNova,
  onAbrir,
  onApagar,
}: {
  aberto: boolean;
  conversas: ConversaGuardada[];
  ativaId: string;
  onFechar: () => void;
  onNova: () => void;
  onAbrir: (id: string) => void;
  onApagar: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <Modal visible={aberto} animationType="fade" transparent onRequestClose={onFechar}>
      <View style={styles.fundo}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onFechar} accessibilityLabel="Fechar histórico" />
        <View style={[styles.folha, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.cabecalho}>
            <Text style={styles.titulo}>Conversas</Text>
            <TouchableOpacity onPress={onFechar} accessibilityRole="button" accessibilityLabel="Fechar histórico" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialCommunityIcons name="close" size={22} color={cores.onSurface} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.nova} onPress={onNova} accessibilityRole="button" accessibilityLabel="Nova conversa">
            <MaterialCommunityIcons name="square-edit-outline" size={18} color={cores.primary} />
            <Text style={styles.novaTexto}>Nova conversa</Text>
          </TouchableOpacity>
          <ScrollView style={styles.lista} keyboardShouldPersistTaps="handled">
            {conversas.length === 0 && (
              <Text style={styles.vazio}>Quando você conversar com a OLLI, as conversas ficam aqui neste aparelho.</Text>
            )}
            {conversas.map((conversa) => {
              const ativa = conversa.id === ativaId;
              return (
                <View key={conversa.id} style={[styles.item, ativa && styles.itemAtivo]}>
                  <TouchableOpacity style={styles.itemCorpo} onPress={() => onAbrir(conversa.id)} accessibilityRole="button" accessibilityLabel={`Abrir conversa ${conversa.titulo}`}>
                    <Text style={styles.itemTitulo} numberOfLines={2}>{conversa.titulo}</Text>
                    <Text style={styles.itemQuando}>{formatoHora.format(conversa.atualizadoEm)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => onApagar(conversa.id)} accessibilityRole="button" accessibilityLabel={`Apagar conversa ${conversa.titulo}`} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color={cores.onSurfaceMuted} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  folha: { maxHeight: '78%', backgroundColor: c.surface, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, paddingTop: 14 },
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, marginBottom: 8 },
  titulo: { fontSize: 18, fontWeight: '800', color: c.onSurface },
  nova: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: Spacing.base, marginBottom: 8, paddingVertical: 12, paddingHorizontal: 12, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline },
  novaTexto: { fontSize: 15, fontWeight: '700', color: c.primary },
  lista: { paddingHorizontal: Spacing.base },
  vazio: { color: c.onSurfaceVariant, fontSize: 14, lineHeight: 20, paddingVertical: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.outline },
  itemAtivo: { backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.md, paddingHorizontal: 8, borderTopWidth: 0, marginBottom: 4 },
  itemCorpo: { flex: 1 },
  itemTitulo: { fontSize: 14.5, fontWeight: '700', color: c.onSurface },
  itemQuando: { marginTop: 2, fontSize: 12, color: c.onSurfaceMuted },
});
