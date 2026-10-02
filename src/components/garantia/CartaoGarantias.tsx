import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, useCores, useEstilos, type Cores } from '../../theme';
import { Aparecer } from '../motion';
import { AcaoNo, NoLinhaDoTempo } from '../hoje/LinhaDoTempo';
import { RecursoPlanoChip } from '../RecursoPlano';
import { DicaContextual } from '../DicaContextual';
import { carregarGarantias, type LeituraGarantias } from '../../services/garantias';
import { rotuloItemGarantia } from '../../utils/garantiaServico';

/**
 * "GARANTIAS PARA CUIDAR" no Hoje (Onda I3, jogada 12): a garantia que entra na
 * última semana e o "pergunte se está tudo certo" (D+15 dedetização, D+30 nos
 * outros ofícios). Some quando não há nada a cuidar; quando a leitura falha, diz
 * que não conseguiu conferir (nunca "nenhuma garantia").
 *
 * O dado é real e local (OS concluídas + prazo escrito); o que é do Pro é o
 * acompanhamento — o botão passa pelo `RecursoPlanoChip`.
 */
export function CartaoGarantias({ indice, visivel = true }: { indice: number; visivel?: boolean }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const nav = useNavigation<any>();
  const [leitura, setLeitura] = useState<LeituraGarantias | null>(null);

  useFocusEffect(useCallback(() => {
    if (!visivel) return undefined;
    let vivo = true;
    void carregarGarantias().then((r) => { if (vivo) setLeitura(r); });
    return () => { vivo = false; };
  }, [visivel]));

  if (!visivel || !leitura) return null;
  if (leitura.estado === 'ok' && leitura.itens.length === 0) return null;

  const primeiro = leitura.estado === 'ok' ? leitura.itens[0] : null;
  const n = leitura.estado === 'ok' ? leitura.itens.length : 0;
  return (
    <Aparecer indice={indice}>
      <NoLinhaDoTempo marcador={{ tipo: 'secao', icone: 'shield-check-outline' }}>
        <Text style={styles.titulo}>Garantias para cuidar</Text>
        {leitura.estado === 'erro' ? (
          <View style={styles.linha}>
            <MaterialCommunityIcons name="alert-circle-outline" size={14} color={cores.warning} />
            <Text style={styles.sub}>Não consegui conferir as garantias agora.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.sub}>
              {n === 1 ? '1 garantia para cuidar' : `${n} garantias para cuidar`}
              {primeiro ? ` · ${primeiro.garantia.clienteNome || 'Cliente'}: ${rotuloItemGarantia(primeiro).toLowerCase()}` : ''}
            </Text>
            <DicaContextual
              id="garantia.cuidar"
              icon="shield-check-outline"
              texto="Perguntar se está tudo certo antes da garantia vencer evita reclamação e rende avaliação."
              style={{ marginTop: Spacing.sm }}
            />
            <View style={styles.acoes}>
              <RecursoPlanoChip recurso="vespera_garantia">
                <AcaoNo
                  variante="secundaria"
                  icone="shield-check-outline"
                  rotulo="Ver garantias"
                  accessibilityLabel="Abrir as garantias para cuidar"
                  onPress={() => nav.navigate('Garantias')}
                />
              </RecursoPlanoChip>
            </View>
          </>
        )}
      </NoLinhaDoTempo>
    </Aparecer>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  titulo: { fontSize: 15, fontWeight: '800', color: c.onBackground, lineHeight: 44 },
  sub: { fontSize: 13, color: c.onSurfaceVariant, lineHeight: 18, flexShrink: 1 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  acoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: Spacing.sm },
});
