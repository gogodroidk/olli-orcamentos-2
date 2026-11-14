import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { vibrar } from '../utils/haptico';
import { useCores, useEstilos, comAlfa, type Cores } from '../theme';
import { OlliButton } from './OlliButton';
import { getEmpresa, saveEmpresa } from '../database/database';
import { recarregarVerticais } from '../hooks/useVerticais';
import { track, Eventos } from '../services/analytics';
import {
  AVISO_EXEMPLO, TITULO_PRIMEIRO_ORCAMENTO, fraseDoPrimeiroCliente, itensPrefillDoExemplo,
  exemploOrcamentoPara, totalDoExemplo, type VazioOrcamentos,
} from '../services/ativacao';
import { VERTICAIS, VERTICAL_GERAL, ferramentasSugeridas, type VerticalId } from '../services/verticais';
import { VERTICAL_PARA_SEGMENTO } from '../services/verticalSegmento';
import { formatCurrency } from '../utils/currency';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const OFICIOS: readonly { id: VerticalId; label: string; emoji: string }[] = [
  ...VERTICAIS.map((v) => ({ id: v.id, label: v.label, emoji: v.emoji })),
  { id: VERTICAL_GERAL.id, label: 'Outro serviço', emoji: VERTICAL_GERAL.emoji },
];

/**
 * Lista de Orçamentos VAZIA, guiada (CQ-ATIVA-1O-ORCAMENTO, atrás de `ATIVA_1O_ORCAMENTO`).
 * Mesma regra do cartão do Início (services/ativacao.ts): exemplo do ofício em 1 toque,
 * ou a pergunta do ofício. Quem decide se aparece é `decidirVazioOrcamentos` na tela.
 */
export function VazioPrimeiroOrcamento({ decisao }: { decisao: Exclude<VazioOrcamentos, { tipo: 'padrao' }> }) {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [salvando, setSalvando] = useState(false);

  const abrir = useCallback((vertical: VerticalId) => {
    const exemplo = exemploOrcamentoPara(vertical);
    if (!exemplo) return;
    vibrar('selecao');
    track(Eventos.exemploAtivacaoAberto, { vertical, origem: 'lista_vazia' });
    nav.navigate('NovoOrcamento', { exemploVertical: vertical, prefillItems: itensPrefillDoExemplo(exemplo) });
  }, [nav]);

  const escolher = useCallback(async (vertical: VerticalId) => {
    if (salvando) return;
    setSalvando(true);
    try {
      const empresa = await getEmpresa();
      if (empresa) {
        await saveEmpresa({
          ...empresa,
          verticais: [vertical],
          segmento: empresa.segmento ?? VERTICAL_PARA_SEGMENTO[vertical],
          ferramentasAtivas: empresa.ferramentasAtivas?.length ? empresa.ferramentasAtivas : ferramentasSugeridas([vertical]),
        });
        void recarregarVerticais();
      }
    } catch {
      // melhor esforço: o exemplo abre mesmo assim.
    } finally {
      setSalvando(false);
    }
    abrir(vertical);
  }, [salvando, abrir]);

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <View style={[styles.icone, { backgroundColor: comAlfa(cores.accentLight, 0.14) }]}>
        <MaterialCommunityIcons name="lightning-bolt" size={26} color={cores.accentLight} accessible={false} importantForAccessibility="no" />
      </View>
      <Text style={styles.titulo} accessibilityRole="header">{TITULO_PRIMEIRO_ORCAMENTO}</Text>
      {decisao.tipo === 'exemplo' ? (
        <>
          <Text style={styles.texto}>
            {fraseDoPrimeiroCliente(decisao.exemplo.titulo.toLowerCase(), formatCurrency(totalDoExemplo(decisao.exemplo)))}
          </Text>
          <OlliButton
            label="Abrir orçamento de exemplo"
            variant="gradient"
            size="md"
            fullWidth
            onPress={() => abrir(decisao.vertical)}
            icon={<MaterialCommunityIcons name="file-document-edit-outline" size={18} color="#fff" />}
          />
          <Text style={styles.aviso}>{AVISO_EXEMPLO}</Text>
          <TouchableOpacity onPress={() => nav.navigate('NovoOrcamento', {})} accessibilityRole="button" style={styles.linkVazio}>
            <Text style={styles.linkTexto}>Prefiro começar do zero</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.texto}>Qual é o seu ofício? Com um toque, preparamos um orçamento de exemplo do seu serviço.</Text>
          <View style={styles.chips} accessibilityLabel="Escolha o seu ofício">
            {OFICIOS.map((o) => (
              <TouchableOpacity
                key={o.id}
                style={styles.chip}
                activeOpacity={0.8}
                disabled={salvando}
                onPress={() => { void escolher(o.id); }}
                accessibilityRole="button"
                accessibilityLabel={`${o.label}. Abrir orçamento de exemplo`}
              >
                <Text style={styles.chipEmoji} accessible={false}>{o.emoji}</Text>
                <Text style={styles.chipTexto} numberOfLines={1}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => nav.navigate('NovoOrcamento', {})} accessibilityRole="button" style={styles.linkVazio}>
            <Text style={styles.linkTexto}>Prefiro começar do zero</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingVertical: 24, gap: 12, alignItems: 'stretch' },
  icone: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  titulo: { fontSize: 18, fontWeight: '800', color: c.onSurface, textAlign: 'center' },
  texto: { fontSize: 14, lineHeight: 20, color: c.onSurfaceVariant, textAlign: 'center' },
  aviso: { fontSize: 12, lineHeight: 17, color: c.onSurfaceVariant, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1,
    borderColor: c.strokeGlow, backgroundColor: c.surface,
  },
  chipEmoji: { fontSize: 15 },
  chipTexto: { fontSize: 13, fontWeight: '700', color: c.onSurface, maxWidth: 220 },
  linkVazio: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkTexto: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant, textDecorationLine: 'underline' },
});
