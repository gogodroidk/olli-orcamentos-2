/**
 * ClimaVisitaChip — "Chuva forte às 15h · Jardim X" em cada visita (Onda I1,
 * jogada 1). Componente ISOLADO e presentacional: quem chama faz
 * `useClimaVisita(...)` (ou `analisarClimaVisita` com um clima já buscado) e
 * passa o resultado. Pronto para a Onda 2B encaixar na Agenda, no Hoje e no
 * Painel da Rua.
 *
 * Estados (nenhum some calado — regra `olli-gate-erro-vira-vazio`):
 *  - carregando      → skeleton do tamanho do chip;
 *  - previsão        → chuva forte/chuva/pode chover/sem chuva/incompleta;
 *  - alerta oficial  → chip laranja (perigo potencial/perigo) ou vermelho
 *                      (grande perigo) com "Alerta INMET: tempestade até 18h";
 *  - indisponível / sem localização / fora da janela de 12h → chip cinza que DIZ isso;
 *  - feed de alertas caído → linha "Alertas oficiais indisponíveis";
 *  - visita já passada → não renderiza (não é erro: não há o que prever).
 *
 * Crédito CC BY 4.0 ("Previsão: MET Norway") sai embaixo sempre que houver dado
 * de terceiro na tela (`mostrarAtribuicao` desliga quando a tela já mostra o
 * crédito uma vez no rodapé da lista).
 *
 * Motion: `Aparecer` (entrada única, respeita "Reduzir movimento") e
 * `PressableAnimado` quando o chip é tocável; `Skeleton` no carregando.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, comAlfa, useCores, useEstilos, type Cores } from '../../theme';
import { Aparecer, PressableAnimado, Skeleton } from '../motion';
import type { ResultadoClimaVisita, TomClimaVisita } from '../../services/climaVisitaRegra';
import { RecursoPlanoChip } from '../RecursoPlano';

export interface ClimaVisitaChipProps {
  analise: ResultadoClimaVisita;
  /** Toque no chip (ex.: abrir a `FolhaRemarcarChuva` quando `analise.sugerirRemarcar`). */
  onPress?: () => void;
  /** Mostrar o crédito da previsão embaixo do chip. Padrão `true`. */
  mostrarAtribuicao?: boolean;
  /** Posição na lista (escalona a entrada). */
  indice?: number;
}

type NomeIcone = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

function iconeDe(a: ResultadoClimaVisita): NomeIcone {
  if (a.alerta) return a.alerta.nivel === 'vermelho' ? 'alert-octagon' : 'alert';
  switch (a.estado) {
    case 'sem_local':
      return 'map-marker-off-outline';
    case 'indisponivel':
      return 'cloud-off-outline';
    case 'fora_da_janela':
      return 'weather-cloudy-clock';
    default:
      break;
  }
  switch (a.nivel) {
    case 'forte':
      return 'weather-pouring';
    case 'chuva':
      return 'weather-rainy';
    case 'talvez':
      return 'weather-partly-rainy';
    case 'seco':
      return 'weather-partly-cloudy';
    default:
      return 'weather-cloudy-clock';
  }
}

function coresDoTom(tom: TomClimaVisita, c: Cores): { bg: string; fg: string; borda: string } {
  switch (tom) {
    case 'perigo':
      return { bg: c.dangerLight, fg: c.danger, borda: comAlfa(c.danger, 0.45) };
    case 'aviso':
      return { bg: c.warningLight, fg: c.warning, borda: comAlfa(c.warning, 0.45) };
    case 'chuva':
      return { bg: c.accentContainer, fg: c.accentLight, borda: comAlfa(c.accentLight, 0.4) };
    case 'neutro':
      return { bg: c.surfaceVariant, fg: c.onSurfaceVariant, borda: c.outline };
    default:
      return { bg: c.surfaceVariant, fg: c.onSurfaceMuted, borda: c.outline };
  }
}

function ClimaVisitaChipConteudo({ analise, onPress, mostrarAtribuicao = true, indice = 0 }: ClimaVisitaChipProps) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  if (analise.estado === 'passada') return null;

  if (analise.estado === 'carregando' && !analise.alerta) {
    return (
      <View accessibilityLabel="Carregando clima da visita" accessible>
        <Skeleton width={180} height={28} radius={BorderRadius.full} />
      </View>
    );
  }

  const tom = coresDoTom(analise.tom, cores);
  const forte = analise.nivel === 'forte' || analise.alerta !== null;
  const principal = analise.textoAlerta ?? analise.texto;
  const secundario = analise.textoAlerta ? analise.texto : null;

  const conteudo = (
    <View style={[styles.chip, { backgroundColor: tom.bg, borderColor: tom.borda }]}>
      <MaterialCommunityIcons name={iconeDe(analise)} size={15} color={tom.fg} />
      <Text style={[styles.texto, { color: tom.fg }, forte && styles.textoForte]} numberOfLines={1}>
        {principal}
      </Text>
      {analise.sugerirRemarcar && onPress ? (
        <MaterialCommunityIcons name="chevron-right" size={16} color={tom.fg} />
      ) : null}
    </View>
  );

  return (
    <Aparecer indice={indice}>
      {onPress ? (
        <PressableAnimado
          onPress={onPress}
          haptic="selection"
          accessibilityLabel={analise.acessibilidade}
          accessibilityRole="button"
          style={styles.toque}
        >
          {conteudo}
        </PressableAnimado>
      ) : (
        <View accessible accessibilityLabel={analise.acessibilidade} style={styles.toque}>
          {conteudo}
        </View>
      )}
      {secundario ? (
        <Text style={styles.linha} numberOfLines={1}>
          {secundario}
        </Text>
      ) : null}
      {analise.alertasIndisponiveis ? (
        <Text style={styles.linha} numberOfLines={1}>
          Alertas oficiais indisponíveis
        </Text>
      ) : null}
      {mostrarAtribuicao && analise.atribuicao ? (
        <Text style={styles.credito} numberOfLines={1}>
          {analise.atribuicao}
        </Text>
      ) : null}
    </Aparecer>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    toque: { alignSelf: 'flex-start', maxWidth: '100%' },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs + 2,
      paddingHorizontal: Spacing.md,
      minHeight: 30,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      maxWidth: '100%',
    },
    texto: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
    textoForte: { fontWeight: '800' },
    linha: { color: c.onSurfaceVariant, fontSize: 12, marginTop: Spacing.xs, marginLeft: Spacing.xs },
    credito: { color: c.onSurfaceMuted, fontSize: 11, marginTop: 2, marginLeft: Spacing.xs },
  });

/**
 * Chuva na visita é inteligência do Pro (`clima_visita`, decisão de 01/10/2026).
 * Com o recurso liberado (Pro/Empresa) é a peça de sempre; no Grátis vira o chip
 * "Disponível no Pro"; com o plano ilegível, "plano não confirmado" — os 3 estados
 * de `RecursoPlano.tsx`. Quem encaixa a peça numa tela não precisa saber de plano.
 */
export function ClimaVisitaChip(props: ClimaVisitaChipProps) {
  return (
    <RecursoPlanoChip recurso="clima_visita">
      <ClimaVisitaChipConteudo {...props} />
    </RecursoPlanoChip>
  );
}
