/**
 * MAPA DE VERDADE, GRÁTIS — MapLibre + tiles OpenFreeMap (Onda I2).
 *
 * Sem Google, sem chave, sem cota: o estilo vem de `tiles.openfreemap.org` e a
 * atribuição obrigatória ("© OpenMapTiles © OpenStreetMap") fica SEMPRE visível
 * no canto do mapa (tocar abre a página de direitos do OSM).
 *
 * ─── HERMES E APK ANTIGO ───────────────────────────────────────────────────
 * O MapLibre é módulo NATIVO: só existe num APK gerado DEPOIS desta frente
 * (prebuild com o config plugin `@maplibre/maplibre-react-native`). Um import no
 * topo do arquivo derrubaria o app inteiro num binário sem o módulo (lição do
 * release v6). Por isso: `TurboModuleRegistry.get` primeiro, `require` depois,
 * os dois dentro de try. Sem o módulo, a tela mostra o ESQUEMA das paradas com o
 * aviso "atualize o app" — nunca um mapa falso, nunca um crash.
 *
 * Três estados: carregando (o próprio mapa com os pins), pronto, e falhou ao
 * carregar o estilo (sem internet) — aí aparece o aviso por cima, e o esquema
 * das paradas continua útil.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TurboModuleRegistry, View } from 'react-native';
import { BorderRadius, comAlfa, useCores, useEstilos, useTema, type Cores } from '../../theme';
import { useReduzirMovimento } from '../../theme/motion';
import { ATRIBUICAO_MAPA, ESTILO_MAPA, URL_ATRIBUICAO_MAPA, limitesDosPontos, linhaParcial } from '../../utils/mapaDia';
import { EsquemaRota } from './EsquemaRota';
import { PinView } from './PinView';
import type { MapaBaseProps } from './tipos';

type ModuloMapLibre = typeof import('@maplibre/maplibre-react-native');
type DadosGeo = import('@maplibre/maplibre-react-native').GeoJSONSourceProps['data'];

let moduloCache: ModuloMapLibre | null | undefined;

/** O módulo do MapLibre, ou `null` se este binário não o tem. Nunca lança. */
function carregarMapLibre(): ModuloMapLibre | null {
  if (moduloCache !== undefined) return moduloCache;
  try {
    if (!TurboModuleRegistry.get('MLRNMapViewModule')) {
      moduloCache = null;
      return null;
    }
    moduloCache = require('@maplibre/maplibre-react-native') as ModuloMapLibre;
  } catch {
    moduloCache = null;
  }
  return moduloCache;
}

/** A linha "se desenha" da primeira à última parada em 600 ms (12 passos). */
const DESENHO_MS = 600;
const DESENHO_PASSOS = 12;

function useLinhaAnimada(linha: readonly [number, number][] | undefined, chave: string | undefined): [number, number][] | null {
  const reduzir = useReduzirMovimento();
  const [progresso, setProgresso] = useState(reduzir ? 1 : 0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `chave` é o gatilho de propósito — a ordem mudou, a linha se redesenha.
  useEffect(() => {
    if (reduzir) {
      setProgresso(1);
      return;
    }
    setProgresso(0);
    let passo = 0;
    const id = setInterval(() => {
      passo += 1;
      setProgresso(Math.min(1, passo / DESENHO_PASSOS));
      if (passo >= DESENHO_PASSOS) clearInterval(id);
    }, DESENHO_MS / DESENHO_PASSOS);
    return () => clearInterval(id);
  }, [chave, reduzir]);
  return useMemo(() => (linha && linha.length > 1 ? linhaParcial(linha, progresso) : null), [linha, progresso]);
}

export function MapaBase(props: MapaBaseProps) {
  const ML = carregarMapLibre();
  if (!ML) {
    return <EsquemaRota {...props} aviso="Esquema das paradas, sem mapa de fundo · atualize o app para ver o mapa" />;
  }
  return <MapaNativo ML={ML} {...props} />;
}

function MapaNativo({ ML, pins, linha, interativo = true, onPinPress, selecionado, margens, chaveAnimacao, style }: MapaBaseProps & { ML: ModuloMapLibre }) {
  const c = useCores();
  const { modo } = useTema();
  const styles = useEstilos(criarEstilos);
  const [falhou, setFalhou] = useState(false);
  const linhaVisivel = useLinhaAnimada(linha, chaveAnimacao);

  const limites = useMemo(() => limitesDosPontos(pins), [pins]);
  const padding = useMemo(() => {
    const m = margens ?? { topo: 36, base: 36, lados: 36 };
    return { top: m.topo, bottom: m.base, left: m.lados, right: m.lados };
  }, [margens]);

  const dadosLinha = useMemo(
    () =>
      linhaVisivel
        ? ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: linhaVisivel } } as DadosGeo)
        : null,
    [linhaVisivel],
  );

  return (
    <View style={[styles.caixa, style]}>
      <ML.Map
        style={StyleSheet.absoluteFill}
        mapStyle={modo === 'escuro' ? ESTILO_MAPA.escuro : ESTILO_MAPA.claro}
        attribution={false}
        logo={false}
        compass={false}
        scaleBar={false}
        dragPan={interativo}
        touchZoom={interativo}
        doubleTapZoom={interativo}
        doubleTapHoldZoom={interativo}
        touchRotate={false}
        touchPitch={false}
        onDidFailLoadingMap={() => setFalhou(true)}
        onDidFinishLoadingMap={() => setFalhou(false)}
        accessibilityLabel="Mapa das visitas do dia"
      >
        {limites ? <ML.Camera bounds={limites} padding={padding} duration={0} /> : null}
        {dadosLinha ? (
          <ML.GeoJSONSource id="olli-rota" data={dadosLinha}>
            <ML.Layer
              type="line"
              id="olli-rota-linha"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': c.accent, 'line-width': 4, 'line-opacity': 0.85 }}
            />
          </ML.GeoJSONSource>
        ) : null}
        {pins.map((p, i) => (
          <ML.Marker
            key={p.id}
            id={`pin-${p.id}`}
            lngLat={[p.lon, p.lat]}
            anchor="center"
            selected={selecionado === p.id}
            onPress={onPinPress ? () => onPinPress(p.id) : undefined}
            accessibilityLabel={p.acessibilidade}
          >
            <PinView rotulo={p.rotulo} tom={p.tom} chuva={p.chuva} aproximado={p.aproximado} selecionado={selecionado === p.id} indice={i} />
          </ML.Marker>
        ))}
      </ML.Map>

      {falhou ? (
        <View style={styles.falhou} pointerEvents="none">
          <Text style={styles.falhouTexto}>Não consegui carregar o mapa (sem internet?). As paradas continuam na lista.</Text>
        </View>
      ) : null}

      <Pressable
        style={styles.atribuicao}
        onPress={() => { void Linking.openURL(URL_ATRIBUICAO_MAPA).catch(() => {}); }}
        accessibilityRole="link"
        accessibilityLabel="Dados do mapa: OpenMapTiles e OpenStreetMap. Abrir os créditos."
        hitSlop={8}
      >
        <Text style={styles.atribuicaoTexto}>{ATRIBUICAO_MAPA}</Text>
      </Pressable>
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    caixa: { overflow: 'hidden', backgroundColor: c.surfaceVariant },
    atribuicao: {
      position: 'absolute',
      left: 6,
      bottom: 6,
      backgroundColor: comAlfa(c.surface, 0.82),
      borderRadius: BorderRadius.fio,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    atribuicaoTexto: { fontSize: 10, fontWeight: '600', color: c.onSurfaceVariant },
    falhou: {
      position: 'absolute',
      left: 12,
      right: 12,
      top: 12,
      backgroundColor: comAlfa(c.surface, 0.94),
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: c.outline,
      padding: 10,
    },
    falhouTexto: { fontSize: 12.5, fontWeight: '600', color: c.onSurface },
  });
