/**
 * CLIMA DO DIA no Painel da Rua (item 2.6, sobre o 2.5).
 *
 * Fonte: worker `/clima` (MET Norway, grátis e de uso comercial, CC BY 4.0). A
 * licença exige crédito, então TODA vez que um dado do MET aparece, a linha
 * "Previsão: MET Norway" aparece junto (`atribuicaoClima`). Quando o ponto da
 * cidade veio do OpenStreetMap, o crédito da ODbL (`ATRIBUICAO_OSM`) também.
 *
 * 3 estados, nunca calado: carregando → esqueleto curto; falha → "Clima
 * indisponível" (com o motivo acionável quando o cadastro não tem cidade);
 * dados → temperatura + a frase útil ("Chuva prevista às 15h — leve capa").
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, useCores, useEstilos, type Cores } from '../../theme';
import { atribuicaoClima, simboloEhChuva, textoClima, type EstadoClima } from '../../services/clima';
import type { ReservaClima } from '../../services/climaReserva';
import { PressableAnimado } from '../motion/PressableAnimado';
import { Skeleton } from '../motion/Skeleton';

type Icone = keyof typeof MaterialCommunityIcons.glyphMap;

/** Símbolo do MET → ícone. Desconhecido vira nuvem (neutro), nunca sol. */
export function iconeDoTempo(simbolo: string, ehDia: boolean | null): Icone {
  const s = simbolo.replace(/_(day|night|polartwilight)$/, '');
  if (s.includes('thunder')) return 'weather-lightning-rainy';
  if (s.includes('snow')) return 'weather-snowy';
  if (simboloEhChuva(s)) return 'weather-rainy';
  if (s === 'clearsky') return ehDia === false ? 'weather-night' : 'weather-sunny';
  if (s === 'fair' || s === 'partlycloudy') return ehDia === false ? 'weather-night-partly-cloudy' : 'weather-partly-cloudy';
  if (s === 'fog') return 'weather-fog';
  return 'weather-cloudy';
}

interface Props {
  clima: EstadoClima;
  /** De onde viria a coordenada sem GPS (cidade do cadastro). */
  reserva: ReservaClima;
  /** Atalho quando o cadastro não tem cidade: abre Meu negócio. */
  onCadastrarCidade: () => void;
}

export function ClimaDoDia({ clima, reserva, onCadastrarCidade }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  if (clima !== 'carregando' && clima.ok === true) {
    const credito = atribuicaoClima(clima);
    // Ponto da cidade vindo do OpenStreetMap: a ODbL exige o crédito junto.
    const creditoLocal = reserva.estado === 'ok' ? reserva.atribuicao : null;
    return (
      <View style={styles.linha} accessibilityLabel={`${Math.round(clima.temperatura)} graus, ${clima.descricao}. ${clima.resumo}. ${credito ?? ''}${creditoLocal ? `. ${creditoLocal}` : ''}`}>
        <MaterialCommunityIcons name={iconeDoTempo(clima.simbolo, clima.ehDia)} size={20} color={cores.accentLight} />
        <Text style={styles.temp}>{Math.round(clima.temperatura)}°</Text>
        <View style={styles.textos}>
          <Text style={styles.resumo} numberOfLines={1}>{clima.resumo}</Text>
          {credito ? <Text style={styles.credito}>{credito}</Text> : null}
          {creditoLocal ? <Text style={styles.credito} numberOfLines={1}>{creditoLocal}</Text> : null}
        </View>
      </View>
    );
  }

  // Sem dados ainda e a cidade de reserva em busca: é "carregando", não falha —
  // o hook do clima responde 'sem_localizacao' antes de a reserva chegar.
  if (clima === 'carregando' || reserva.estado === 'carregando') {
    return (
      <View style={styles.linha} accessibilityLabel="Carregando clima">
        <MaterialCommunityIcons name="weather-cloudy" size={18} color={cores.onSurfaceMuted} />
        <Skeleton width={150} height={12} radius={BorderRadius.fio} />
      </View>
    );
  }

  // Falha. A única que o prestador resolve sozinho: sem GPS e sem cidade no cadastro.
  const semCidade = clima.motivo === 'sem_localizacao' && reserva.estado === 'sem_cidade';
  return (
    <View style={styles.linha}>
      <MaterialCommunityIcons name="weather-cloudy-alert" size={18} color={cores.onSurfaceMuted} />
      <Text style={styles.indisponivel} numberOfLines={1}>
        {textoClima(clima)}
        {semCidade ? ' · falta a cidade no cadastro' : ''}
      </Text>
      {semCidade ? (
        <PressableAnimado onPress={onCadastrarCidade} haptic="selection" hitSlop={8} accessibilityLabel="Cadastrar a cidade em Meu negócio para ver o clima">
          <Text style={styles.acao}>Cadastrar</Text>
        </PressableAnimado>
      ) : null}
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  linha: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.base, marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 9, minHeight: 44,
    backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: c.outlineDark,
  },
  temp: { fontSize: 16, fontWeight: '800', color: c.onSurface },
  textos: { flex: 1 },
  resumo: { fontSize: 12.5, fontWeight: '600', color: c.onSurface },
  credito: { fontSize: 10, color: c.onSurfaceMuted, marginTop: 1 },
  indisponivel: { flex: 1, fontSize: 12.5, color: c.onSurfaceVariant },
  acao: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },
});
