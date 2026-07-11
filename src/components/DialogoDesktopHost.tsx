import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, sombrasDe, type Cores } from '../theme';
import { useReducedMotion } from '../theme/motion';
import { OlliButton } from './OlliButton';

/**
 * Host imperativo dos diálogos temáticos das telas DESKTOP (achado P1-10 do
 * gate de design system): `avisar`/`confirmar` (src/screens/desktop/dialogo.ts)
 * usavam window.alert/confirm crus — no-op-feio no react-native-web e fora do
 * tema. Este componente é o único lugar que DESENHA o diálogo; `dialogo.ts` só
 * empurra pedidos nesta fila module-scoped e este Host renderiza o que estiver
 * na frente. Monta UMA VEZ no topo do App (dentro do PaperProvider, para herdar
 * cor/tipografia do tema) — nunca dentro de uma tela, senão fecha junto com ela.
 *
 * Fila FIFO (não pilha de Modals): se dois avisos disparam em sequência, o
 * segundo só aparece quando o primeiro fechar — nunca sobrepõe diálogo em
 * diálogo. `Modal` do RN (react-native-web) já resolve foco/acessibilidade de
 * graça: trap de Tab dentro do diálogo, Esc/back fecha (onRequestClose) e o
 * foco volta pra quem abriu ao desmontar — mesmo padrão que PainelProduto/
 * PainelServico já usam pros painéis laterais.
 */

interface PedidoAviso {
  tipo: 'aviso';
  id: number;
  titulo: string;
  mensagem?: string;
}

interface PedidoConfirmar {
  tipo: 'confirmar';
  id: number;
  titulo: string;
  mensagem?: string;
  resolve: (valor: boolean) => void;
}

type Pedido = PedidoAviso | PedidoConfirmar;

let proximoId = 1;
let fila: Pedido[] = [];
const ouvintes = new Set<() => void>();

function notificar() {
  ouvintes.forEach((fn) => fn());
}

/** Chamado só por `avisar()` em dialogo.ts — nunca direto pelas telas. */
export function enfileirarAviso(titulo: string, mensagem?: string): void {
  fila = [...fila, { tipo: 'aviso', id: proximoId++, titulo, mensagem }];
  notificar();
}

/** Chamado só por `confirmar()` em dialogo.ts — nunca direto pelas telas. */
export function enfileirarConfirmacao(titulo: string, mensagem?: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    fila = [...fila, { tipo: 'confirmar', id: proximoId++, titulo, mensagem, resolve }];
    notificar();
  });
}

function useFilaDeDialogos(): Pedido[] {
  const [, forcarRender] = useState(0);
  useEffect(() => {
    const ouvinte = () => forcarRender((n) => n + 1);
    ouvintes.add(ouvinte);
    return () => { ouvintes.delete(ouvinte); };
  }, []);
  return fila;
}

export function DialogoDesktopHost() {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const reduzMovimento = useReducedMotion();
  const filaAtual = useFilaDeDialogos();
  const pedido = filaAtual[0] ?? null;

  if (!pedido) return null;

  const ehConfirmar = pedido.tipo === 'confirmar';

  function remover(alvo: Pedido) {
    fila = fila.filter((p) => p.id !== alvo.id);
    notificar();
  }

  function responder(valor: boolean) {
    if (pedido!.tipo === 'confirmar') pedido!.resolve(valor);
    remover(pedido!);
  }

  return (
    <Modal
      visible
      transparent
      animationType={reduzMovimento ? 'none' : 'fade'}
      onRequestClose={() => responder(false)}
    >
      <View style={styles.backdrop}>
        {/* Clique fora só fecha o aviso (sem decisão a tomar). Num `confirmar`,
            a saída tem que ser um botão explícito — igual ao window.confirm
            original, que não tinha "fora" pra clicar. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={ehConfirmar ? undefined : () => responder(false)}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <View style={styles.card} accessibilityRole="alert">
          <View style={[styles.iconWrap, { backgroundColor: ehConfirmar ? cores.dangerLight : cores.accentContainer }]}>
            <MaterialCommunityIcons
              name={ehConfirmar ? 'help-circle-outline' : 'information-outline'}
              size={24}
              color={ehConfirmar ? cores.danger : cores.accentLight}
            />
          </View>
          <Text style={styles.titulo}>{pedido.titulo}</Text>
          {pedido.mensagem ? <Text style={styles.mensagem}>{pedido.mensagem}</Text> : null}
          <View style={styles.acoes}>
            {ehConfirmar && (
              <OlliButton
                label="Cancelar"
                variant="ghost"
                onPress={() => responder(false)}
                style={styles.botao}
                haptic={false}
              />
            )}
            <OlliButton
              label={ehConfirmar ? 'Confirmar' : 'OK'}
              variant="primary"
              onPress={() => responder(true)}
              style={styles.botao}
              haptic={false}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      // Véu do modal sempre escuro (ink fixa), não a superfície do tema — mesmo
      // padrão do OverlayProgresso/GatePro: um bloqueio de decisão precisa de
      // contraste forte nos dois modos.
      backgroundColor: 'rgba(7,17,31,0.86)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: Spacing.lg,
    },
    card: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: c.surface,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: c.strokeGlow,
      padding: Spacing.xl,
      alignItems: 'center',
      ...sombrasDe(c).lg,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: BorderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.md,
    },
    titulo: {
      ...Typography.h3,
      color: c.onSurface,
      textAlign: 'center',
    },
    mensagem: {
      ...Typography.body,
      color: c.onSurfaceVariant,
      textAlign: 'center',
      marginTop: Spacing.sm,
      lineHeight: 20,
    },
    acoes: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginTop: Spacing.xl,
      alignSelf: 'stretch',
    },
    botao: {
      flex: 1,
    },
  });
