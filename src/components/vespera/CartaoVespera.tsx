import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, useCores, useEstilos, type Cores } from '../../theme';
import { Aparecer } from '../motion';
import { AcaoNo, NoLinhaDoTempo } from '../hoje/LinhaDoTempo';
import { RecursoPlanoChip } from '../RecursoPlano';
import { DicaContextual } from '../DicaContextual';
import { getAgendamentosExpandidos } from '../../services/agenda';
import { useConfirmacoesVisitas } from '../../services/confirmacaoVisita';
import { limitesDoDiaLocal } from '../../utils/agendaDia';
import { aplicarEscopo, type EscopoAgenda } from '../../utils/agendaDominio';
import { diaNoBrasil, type OcorrenciaAgendamento } from '../../utils/contratoRecorrente';
import { fraseResumoFila, montarFilaVespera, resumoFila } from '../../utils/confirmacaoVisita';
import type { Cliente } from '../../types';

/**
 * "CONFIRMAR VISITAS DE AMANHÃ" no Hoje (Onda I3, jogada 5) — o nó da linha do
 * tempo que o aviso das 18h abre. Mostra o retrato de amanhã (confirmadas,
 * pediram para remarcar, aguardando, sem pedido) e leva à fila com o WhatsApp de
 * cada cliente.
 *
 * Não ocupa espaço quando amanhã não tem visita (nada a confirmar). Se a agenda
 * de amanhã não puder ser lida, diz isso — nunca "nenhuma visita".
 */
export function CartaoVespera({ escopo, clientes, indice }: { escopo: EscopoAgenda; clientes: Cliente[]; indice: number }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const nav = useNavigation<any>();
  const store = useConfirmacoesVisitas();
  const [visitas, setVisitas] = useState<OcorrenciaAgendamento[] | 'carregando' | 'erro'>('carregando');

  const carregar = useCallback(async () => {
    try {
      const { inicio, fim } = limitesDoDiaLocal(new Date(Date.now() + 86_400_000));
      setVisitas(await getAgendamentosExpandidos(inicio.toISOString(), fim.toISOString()));
    } catch {
      setVisitas('erro');
    }
  }, []);
  useFocusEffect(useCallback(() => { void carregar(); }, [carregar]));

  if (escopo.status !== 'equipe' && escopo.status !== 'propria') return null;
  if (visitas === 'carregando') return null;

  let corpo: React.ReactNode;
  if (visitas === 'erro') {
    corpo = <Text style={styles.sub}>Não consegui ler a agenda de amanhã agora. Puxe a tela para tentar de novo.</Text>;
  } else {
    const fila = montarFilaVespera({
      visitas: aplicarEscopo(visitas, escopo),
      clientes,
      confirmacoes: store.mapa,
      dia: diaNoBrasil(new Date(Date.now() + 86_400_000).toISOString()),
    });
    if (fila.length === 0) return null;
    const r = resumoFila(fila);
    const pendentes = r.aPedir + r.semTelefone;
    corpo = (
      <>
        <Text style={styles.sub}>{fraseResumoFila(r)}</Text>
        {store.estado === 'erro' ? (
          <View style={styles.avisoLinha}>
            <MaterialCommunityIcons name="cloud-alert-outline" size={14} color={cores.warning} />
            <Text style={styles.aviso}>Não consegui conferir as respostas agora.</Text>
          </View>
        ) : null}
        <DicaContextual
          id="vespera.confirmar"
          icon="gesture-tap"
          texto="O cliente recebe um link com a sua marca e confirma com 1 toque. A resposta vira um selo na Agenda."
          style={{ marginTop: Spacing.sm }}
        />
        <View style={styles.acoes}>
          <RecursoPlanoChip recurso="vespera_garantia">
            <AcaoNo
              variante={pendentes > 0 ? 'whatsapp' : 'secundaria'}
              icone={pendentes > 0 ? 'whatsapp' : 'calendar-check-outline'}
              rotulo={pendentes > 0 ? 'Pedir confirmação' : r.remarcar > 0 ? 'Ver quem pediu para remarcar' : 'Ver as respostas'}
              accessibilityLabel="Abrir a fila de confirmação das visitas de amanhã"
              onPress={() => nav.navigate('ConfirmarVisitas')}
            />
          </RecursoPlanoChip>
        </View>
      </>
    );
  }

  return (
    <Aparecer indice={indice}>
      <NoLinhaDoTempo marcador={{ tipo: 'secao', icone: 'calendar-check-outline' }}>
        <Text style={styles.titulo}>Confirmar visitas de amanhã</Text>
        {corpo}
      </NoLinhaDoTempo>
    </Aparecer>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  titulo: { fontSize: 15, fontWeight: '800', color: c.onBackground, lineHeight: 44 },
  sub: { fontSize: 13, color: c.onSurfaceVariant, lineHeight: 18 },
  avisoLinha: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  aviso: { fontSize: 12, color: c.warning },
  acoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: Spacing.sm },
});
