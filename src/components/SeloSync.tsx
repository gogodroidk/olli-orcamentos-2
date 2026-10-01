import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, comAlfa, useCores, type Cores } from '../theme';
import type { EstadoFoto, LeituraResumo } from '../services/filaFotos';
import {
  estadosDasFotos,
  lerResumoFotos,
  nuvemDeFotosLigada,
  ouvirFilaFotos,
} from '../services/filaFotosNativa';
import { tentarSincronizarAgora } from '../services/cloudSync';
import { rotuloSeloFoto, textoSeloSync, type TomSelo } from '../services/seloSyncTexto';

/**
 * SeloSync — "nuvem honesta" (Onda I0).
 *
 * Mostra quantas fotos ainda estão SÓ no aparelho ("3 fotos aguardando sinal"),
 * e, se alguma passar de 24h parada (ou a nuvem recusar), um alerta com
 * [Tentar agora]. Nunca diz "enviado" sem ter lido a fila: se a leitura falhar,
 * diz que não conseguiu conferir.
 *
 * Peça ISOLADA, pronta para encaixe: hoje aparece na OS (lista e detalhe). A
 * barra superior do Painel da Rua / Hoje (Onda 2B) encaixa com
 * `<SeloSync variante="barra" />` sem mudar nada aqui.
 *
 *  - `variante="barra"` (padrão): faixa compacta; some quando está tudo enviado
 *    (`ocultarQuandoOk`, padrão true) para não ocupar espaço à toa;
 *  - `variante="cartao"`: bloco com título + detalhe, para telas de detalhe.
 */
export function SeloSync({
  variante = 'barra',
  ocultarQuandoOk = true,
  style,
}: {
  variante?: 'barra' | 'cartao';
  ocultarQuandoOk?: boolean;
  /** Margens de encaixe (o selo some inteiro quando oculto, margem junto). */
  style?: StyleProp<ViewStyle>;
}) {
  const cores = useCores();
  const [leitura, setLeitura] = useState<LeituraResumo | null>(null);
  const [tentando, setTentando] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());
  const ligada = nuvemDeFotosLigada();

  const reler = useCallback(async () => {
    const l = await lerResumoFotos();
    setLeitura(l);
    setAgora(Date.now());
  }, []);

  useEffect(() => {
    let ativo = true;
    void lerResumoFotos().then((l) => {
      if (ativo) {
        setLeitura(l);
        setAgora(Date.now());
      }
    });
    const parar = ouvirFilaFotos((l) => {
      if (!ativo) return;
      setLeitura(l);
      setAgora(Date.now());
    });
    return () => {
      ativo = false;
      parar();
    };
  }, []);

  const tentarAgora = useCallback(async () => {
    setTentando(true);
    try {
      await tentarSincronizarAgora();
    } finally {
      await reler();
      setTentando(false);
    }
  }, [reler]);

  const texto = textoSeloSync(leitura, agora, ligada);
  if (!texto) return null;
  if (texto.tom === 'ok' && ocultarQuandoOk) return null;

  const visual = visualDoTom(texto.tom, cores);
  const ehCartao = variante === 'cartao';

  return (
    <View
      style={[
        ehCartao ? estilos.cartao : estilos.barra,
        { backgroundColor: visual.fundo, borderColor: comAlfa(visual.cor, 0.35) },
        style,
      ]}
    >
      <MaterialCommunityIcons name={visual.icone} size={ehCartao ? 20 : 16} color={visual.cor} />
      {/* O texto é UM elemento para o leitor de tela; o [Tentar agora] fica de
          fora dele. Com `accessible` no contêiner, o TalkBack/VoiceOver juntava
          tudo num nó só e o botão ficava inalcançável. */}
      <View
        style={{ flex: 1 }}
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={texto.detalhe ? `${texto.titulo}. ${texto.detalhe}` : texto.titulo}
      >
        <Text style={[estilos.titulo, { color: visual.cor }]} numberOfLines={2}>{texto.titulo}</Text>
        {ehCartao && texto.detalhe ? (
          <Text style={[estilos.detalhe, { color: cores.onSurfaceVariant }]}>{texto.detalhe}</Text>
        ) : null}
      </View>
      {texto.tentarAgora ? (
        <TouchableOpacity
          onPress={tentarAgora}
          disabled={tentando}
          style={[estilos.botao, { borderColor: visual.cor }]}
          accessibilityRole="button"
          accessibilityLabel="Tentar enviar agora"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {tentando ? (
            <ActivityIndicator size="small" color={visual.cor} />
          ) : (
            <Text style={[estilos.botaoTexto, { color: visual.cor }]}>Tentar agora</Text>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/**
 * Selo de UMA foto ("No aparelho" / "Enviada"), para sobrepor à miniatura.
 * `estado` vem de `useEstadosFotos`. null = não consegui ler: sem selo.
 */
export function SeloFoto({ estado }: { estado: EstadoFoto | 'sem_registro' | null | undefined }) {
  const cores = useCores();
  const rotulo = rotuloSeloFoto(estado ?? null);
  if (!rotulo) return null;
  const visual = visualDoTom(rotulo.tom, cores);
  return (
    <View
      style={[estilos.seloFoto, { backgroundColor: comAlfa(cores.surface, 0.92), borderColor: comAlfa(visual.cor, 0.5) }]}
      accessible
      accessibilityLabel={`Foto: ${rotulo.texto}`}
    >
      <MaterialCommunityIcons name={visual.icone} size={11} color={visual.cor} />
      <Text style={[estilos.seloFotoTexto, { color: visual.cor }]} numberOfLines={1}>{rotulo.texto}</Text>
    </View>
  );
}

/**
 * Estado de cada foto da lista, atualizado a cada mudança da fila. null = a
 * fila não pôde ser lida (os selos somem em vez de mentir).
 */
export function useEstadosFotos(uris: string[]): Record<string, EstadoFoto | 'sem_registro'> | null {
  const [estados, setEstados] = useState<Record<string, EstadoFoto | 'sem_registro'> | null>(null);
  const chave = uris.join('|');
  useEffect(() => {
    let ativo = true;
    const lista = chave ? chave.split('|') : [];
    const ler = () => {
      void estadosDasFotos(lista).then((e) => {
        if (ativo) setEstados(e);
      });
    };
    ler();
    const parar = ouvirFilaFotos(ler);
    return () => {
      ativo = false;
      parar();
    };
  }, [chave]);
  return estados;
}

function visualDoTom(tom: TomSelo, cores: Cores): {
  cor: string;
  fundo: string;
  icone: keyof typeof MaterialCommunityIcons.glyphMap;
} {
  switch (tom) {
    case 'ok':
      return { cor: cores.success, fundo: cores.successLight, icone: 'cloud-check-outline' };
    case 'aguardando':
      return { cor: cores.accentLight, fundo: cores.accentContainer, icone: 'cellphone-arrow-down' };
    case 'alerta':
      return { cor: cores.warning, fundo: comAlfa(cores.warning, 0.14), icone: 'cloud-alert' };
    case 'indisponivel':
      return { cor: cores.onSurfaceVariant, fundo: cores.surfaceVariant, icone: 'cloud-question' };
    case 'desligado':
      return { cor: cores.onSurfaceVariant, fundo: cores.surfaceVariant, icone: 'cloud-off-outline' };
  }
}

const estilos = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: Spacing.base,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  cartao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: Spacing.base,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  titulo: { fontSize: 13, fontWeight: '700' },
  detalhe: { fontSize: 12.5, marginTop: 2 },
  botao: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoTexto: { fontSize: 12.5, fontWeight: '800' },
  seloFoto: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  seloFotoTexto: { fontSize: 10, fontWeight: '700', flexShrink: 1 },
});
