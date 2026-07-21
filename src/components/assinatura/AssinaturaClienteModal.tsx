import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, Modal, StyleSheet, PanResponder, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Fonts, useCores, useEstilos, sombrasDe, type Cores } from '../../theme';
import { useReducedMotion } from '../../theme/motion';
import { OlliButton } from '../OlliButton';
import { rasterizarAssinatura, type PontoAssinatura, type TracoAssinatura } from './rasterizarAssinatura';

/**
 * O cliente assina COM O DEDO, na hora, na casa dele.
 *
 * CONTRATO (é onde mora a regra da casa): este modal NÃO grava nada. Ele desenha,
 * rasteriza e ENTREGA o data URI para `aoConfirmar`, que é quem persiste. O modal
 * só fecha quando essa promessa RESOLVE. Se ela rejeitar, o modal permanece
 * aberto, COM OS TRAÇOS INTACTOS, mostrando o erro e um "Tentar de novo" — a
 * assinatura do cliente não pode evaporar porque o SQLite tossiu, e "não gravei"
 * jamais pode aparecer como "assinado".
 *
 * OFFLINE por construção: nada aqui toca a rede. Nem para desenhar (PanResponder
 * + react-native-svg), nem para virar imagem (rasterizarAssinatura, JS puro).
 *
 * O QUE ESTA ASSINATURA É: comprovação de aceite/execução entre as duas partes,
 * do mesmo naipe do canhoto que se assina na entrega. O QUE NÃO É: assinatura
 * digital certificada (ICP-Brasil) — não há certificado, carimbo de tempo de
 * terceiro nem autoridade certificadora aqui. A cópia da tela diz isso com todas
 * as letras, e não deve ser "melhorada" para sugerir o contrário.
 */
export interface AssinaturaClienteModalProps {
  visivel: boolean;
  /** Quem assina — vem do cadastro do orçamento e é o nome impresso no PDF. */
  clienteNome: string;
  /** Ex.: "Orçamento nº 0012". */
  referencia?: string;
  /**
   * Persiste. DEVE lançar se não gravou — é a rejeição que segura o modal
   * aberto. Resolver sem ter gravado é o bug que este desenho existe para
   * impedir.
   */
  aoConfirmar: (dataUri: string, assinadoEmISO: string) => Promise<void>;
  aoCancelar: () => void;
}

/** Distância mínima entre pontos capturados: corta ruído e encurta o traço sem
 *  mudança visível (o traço tem 2.4px de espessura na saída). */
const PASSO_MINIMO = 1.2;

type Estado = 'desenhando' | 'salvando' | 'erro';

export function AssinaturaClienteModal({
  visivel, clienteNome, referencia, aoConfirmar, aoCancelar,
}: AssinaturaClienteModalProps) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const reduzirMovimento = useReducedMotion();

  const [tracos, setTracos] = useState<PontoAssinatura[][]>([]);
  const [estado, setEstado] = useState<Estado>('desenhando');
  const [erro, setErro] = useState<string | null>(null);
  // O último traço é sempre o que está sendo desenhado; o ref evita que o
  // PanResponder (criado uma vez) leia um `tracos` congelado do primeiro render.
  const tracosRef = useRef<PontoAssinatura[][]>([]);
  const salvandoRef = useRef(false);

  const aplicar = useCallback((proximos: PontoAssinatura[][]) => {
    tracosRef.current = proximos;
    setTracos(proximos);
  }, []);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // Enquanto grava, o dedo não escreve mais: o que for desenhado depois do
    // "Confirmar" não estaria na imagem que está sendo gravada.
    onPanResponderGrant: evt => {
      if (salvandoRef.current) return;
      const { locationX, locationY } = evt.nativeEvent;
      aplicar([...tracosRef.current, [{ x: locationX, y: locationY }]]);
    },
    onPanResponderMove: evt => {
      if (salvandoRef.current) return;
      const { locationX, locationY } = evt.nativeEvent;
      const atuais = tracosRef.current;
      if (atuais.length === 0) return;
      const traco = atuais[atuais.length - 1];
      const ultimo = traco[traco.length - 1];
      if (ultimo && Math.abs(locationX - ultimo.x) < PASSO_MINIMO && Math.abs(locationY - ultimo.y) < PASSO_MINIMO) return;
      const proximos = atuais.slice();
      proximos[proximos.length - 1] = [...traco, { x: locationX, y: locationY }];
      aplicar(proximos);
    },
  }), [aplicar]);

  const temTraco = tracos.some(t => t.length > 0);

  function limparTudo() {
    if (salvandoRef.current) return;
    aplicar([]);
    setErro(null);
    setEstado('desenhando');
  }

  function fechar() {
    if (salvandoRef.current) return;
    aplicar([]);
    setErro(null);
    setEstado('desenhando');
    aoCancelar();
  }

  async function confirmar() {
    if (salvandoRef.current || !temTraco) return;
    salvandoRef.current = true;
    setEstado('salvando');
    setErro(null);
    try {
      const imagem = await rasterizarAssinatura(tracosRef.current as readonly TracoAssinatura[]);
      if (!imagem.ok) {
        // 'vazio' aqui é defesa em profundidade (o botão já exige traço);
        // 'falha' é o encoder. Nenhum dos dois vira assinatura gravada.
        setErro(imagem.motivo === 'vazio'
          ? 'Não veio nenhum traço. Peça para assinar de novo.'
          : 'Não consegui transformar o desenho em imagem. Tente assinar de novo.');
        setEstado('erro');
        return;
      }
      // A data/hora do aceite é a do CONFIRMAR, não a de quando a tela abriu.
      await aoConfirmar(imagem.dataUri, new Date().toISOString());
      // Só limpa depois que gravou — antes disso o desenho é a única cópia.
      aplicar([]);
      setEstado('desenhando');
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message;
      setErro(msg || 'Não consegui salvar a assinatura. O desenho continua aqui — tente de novo.');
      setEstado('erro');
    } finally {
      salvandoRef.current = false;
    }
  }

  const salvando = estado === 'salvando';

  return (
    <Modal
      visible={visivel}
      transparent
      // Fade é opacidade pura (transform/opacity), e some quando o sistema pede
      // menos movimento — a tela é idêntica, só sem a transição.
      animationType={reduzirMovimento ? 'none' : 'fade'}
      onRequestClose={fechar}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.titulo}>Assinatura do cliente</Text>
              {referencia ? <Text style={styles.ref}>{referencia}</Text> : null}
            </View>
            <TouchableOpacity
              onPress={fechar}
              disabled={salvando}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Fechar sem assinar"
            >
              <MaterialCommunityIcons name="close" size={22} color={cores.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          <View style={styles.quemAssina}>
            <MaterialCommunityIcons name="account-outline" size={16} color={cores.onSurfaceVariant} />
            <Text style={styles.quemAssinaTexto} numberOfLines={2}>
              Assina <Text style={styles.quemAssinaNome}>{clienteNome}</Text>
            </Text>
          </View>

          {/* ÁREA DE ASSINATURA — grande de propósito: é o dedo do cliente, não o
              mouse de ninguém. */}
          <View
            style={styles.pad}
            {...pan.panHandlers}
            accessibilityLabel="Área de assinatura. Assine com o dedo."
          >
            <Svg style={StyleSheet.absoluteFill}>
              {tracos.map((traco, i) => (
                traco.length > 0 ? (
                  <Path
                    key={i}
                    d={caminhoDe(traco)}
                    stroke={cores.onSurface}
                    strokeWidth={2.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                ) : null
              ))}
            </Svg>
            {!temTraco && (
              <View pointerEvents="none" style={styles.padVazio}>
                <MaterialCommunityIcons name="gesture" size={26} color={cores.onSurfaceVariant} />
                <Text style={styles.padVazioTexto}>Assine aqui com o dedo</Text>
              </View>
            )}
            <View pointerEvents="none" style={styles.padLinha} />
          </View>

          <Text style={styles.aviso}>
            Vale como comprovação de aceite e execução entre você e o cliente. Não é
            assinatura digital certificada (ICP-Brasil). A data e a hora são
            registradas quando você confirmar.
          </Text>

          {estado === 'erro' && erro ? (
            <View style={styles.erroBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={cores.warning} />
              <Text style={styles.erroTexto}>{erro}</Text>
            </View>
          ) : null}

          <View style={styles.acoes}>
            <TouchableOpacity
              style={styles.limpar}
              onPress={limparTudo}
              disabled={salvando || !temTraco}
              accessibilityRole="button"
              accessibilityLabel="Limpar assinatura"
            >
              <MaterialCommunityIcons
                name="eraser"
                size={18}
                color={temTraco && !salvando ? cores.onSurfaceVariant : cores.outline}
              />
              <Text style={[styles.limparTexto, (!temTraco || salvando) && { color: cores.outline }]}>Limpar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelar}
              onPress={fechar}
              disabled={salvando}
              accessibilityRole="button"
              accessibilityLabel="Agora não"
            >
              <Text style={styles.cancelarTexto}>Agora não</Text>
            </TouchableOpacity>
          </View>

          <OlliButton
            label={estado === 'erro' ? 'Tentar de novo' : 'Confirmar assinatura'}
            variant="gradient"
            fullWidth
            loading={salvando}
            disabled={!temTraco || salvando}
            onPress={confirmar}
            icon={salvando
              ? <ActivityIndicator size="small" color="#fff" />
              : <MaterialCommunityIcons name="check" size={18} color="#fff" />}
          />
        </View>
      </View>
    </Modal>
  );
}

/** Traço → atributo `d` de um <Path>. */
function caminhoDe(traco: PontoAssinatura[]): string {
  if (traco.length === 0) return '';
  if (traco.length === 1) {
    // Um ponto só ainda precisa aparecer (linecap round desenha o pingo).
    return `M ${traco[0].x} ${traco[0].y} L ${traco[0].x} ${traco[0].y}`;
  }
  return traco.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    backdrop: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center', justifyContent: 'center', padding: Spacing.base,
    },
    card: {
      width: '100%', maxWidth: 520,
      backgroundColor: c.surface,
      borderRadius: BorderRadius.xl,
      borderWidth: 1, borderColor: c.strokeGlow,
      padding: Spacing.lg,
      ...sombrasDe(c).lg,
    },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
    titulo: { fontSize: 19, fontFamily: Fonts.extraBold, color: c.onSurface },
    ref: { fontSize: 13, fontFamily: Fonts.regular, color: c.onSurfaceVariant, marginTop: 2 },

    quemAssina: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.md },
    quemAssinaTexto: { flex: 1, fontSize: 13, fontFamily: Fonts.regular, color: c.onSurfaceVariant },
    quemAssinaNome: { fontFamily: Fonts.bold, color: c.onSurface },

    pad: {
      height: 220,
      marginTop: Spacing.sm,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: c.strokeGlow,
      backgroundColor: c.surfaceVariant,
      overflow: 'hidden',
      justifyContent: 'center',
    },
    padVazio: { alignItems: 'center', gap: 6 },
    padVazioTexto: { fontSize: 13, fontFamily: Fonts.regular, color: c.onSurfaceVariant },
    padLinha: {
      position: 'absolute', left: 24, right: 24, bottom: 34,
      height: 1, backgroundColor: c.outline,
    },

    aviso: {
      fontSize: 11.5, fontFamily: Fonts.regular, color: c.onSurfaceVariant,
      lineHeight: 17, marginTop: Spacing.sm,
    },

    erroBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: 'rgba(247,178,59,0.10)',
      borderWidth: 1, borderColor: 'rgba(247,178,59,0.3)',
      borderRadius: BorderRadius.md, padding: Spacing.md, marginTop: Spacing.sm,
    },
    erroTexto: { flex: 1, fontSize: 12.5, fontFamily: Fonts.regular, color: c.onSurface, lineHeight: 18 },

    acoes: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.sm },
    // minHeight 48: alvo de toque de dedo, não de ponteiro.
    limpar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      minHeight: 48, paddingHorizontal: Spacing.base,
      borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline,
    },
    limparTexto: { fontSize: 13.5, fontFamily: Fonts.bold, color: c.onSurfaceVariant },
    cancelar: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    cancelarTexto: { fontSize: 13.5, fontFamily: Fonts.bold, color: c.onSurfaceVariant },
  });
