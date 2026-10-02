import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, type Cores } from '../../theme';
import { vibrar } from '../../utils/haptico';
import { abrirWhatsApp } from '../../utils/exportarDocumento';
import { diaBr } from '../../utils/historicoEquipamento';
import { telefoneLegivel } from '../../utils/qrEtiqueta';
import {
  listarPedidosQr,
  marcarPedidoQrAtendido,
  mensagemRespostaPedidoQr,
  type LeituraPedidosQr,
} from '../../services/pedidosQr';
import type { PedidoOrcamentoQr } from '../../types';

/**
 * PEDIDOS DE ORÇAMENTO PELA ETIQUETA QR — a caixa de entrada do lead que a
 * etiqueta gera. Componente ISOLADO e reaproveitável:
 *
 *  - `modo="equipamento"` (ficha do equipamento): todos os pedidos daquele
 *    equipamento, com os três estados visíveis (lendo / não consegui ler /
 *    nenhum pedido). "Ainda não disponível" quando o servidor não tem a migration.
 *  - `modo="aviso"` (topo da lista de equipamentos — e o encaixe sugerido para a
 *    Home/Hoje): só os pedidos NOVOS de todos os equipamentos; não ocupa espaço
 *    quando não há nada novo, quando a leitura falha ou sem a migration (é aviso,
 *    não lista — não afirma "zero pedidos" em caso de erro).
 *
 * O primeiro contato é humano: "Responder no WhatsApp" abre a conversa com a
 * mensagem pronta (editável); "Atendido" tira o pedido da fila de novos.
 */
export function PedidosQrBloco({
  modo,
  equipamentoId,
  nomeEquipamento,
  nomeEmpresa,
  onAbrirEquipamento,
}: {
  modo: 'equipamento' | 'aviso';
  equipamentoId?: string;
  /** Nome humano do equipamento de um pedido (para a mensagem e a lista). */
  nomeEquipamento: (equipamentoId: string) => string;
  nomeEmpresa?: string;
  /** Só no modo aviso: tocar no pedido abre a ficha do equipamento. */
  onAbrirEquipamento?: (equipamentoId: string) => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [leitura, setLeitura] = useState<LeituraPedidosQr | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLeitura(await listarPedidosQr(
      modo === 'equipamento' ? { equipamentoId, limite: 20 } : { soNovos: true, limite: 20 },
    ));
  }, [modo, equipamentoId]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function responder(p: PedidoOrcamentoQr) {
    vibrar('selecao');
    try {
      await abrirWhatsApp(p.telefone, mensagemRespostaPedidoQr(p, nomeEquipamento(p.equipamentoId), nomeEmpresa));
    } catch {
      Alert.alert('WhatsApp', 'Não consegui abrir o WhatsApp neste aparelho.');
    }
  }

  async function atendido(p: PedidoOrcamentoQr) {
    if (marcando) return;
    setMarcando(p.id);
    try {
      const quando = await marcarPedidoQrAtendido(p.id);
      vibrar('sucesso');
      setLeitura((l) => {
        if (!l || l.estado !== 'ok') return l;
        const pedidos = modo === 'aviso'
          ? l.pedidos.filter((x) => x.id !== p.id)
          : l.pedidos.map((x) => (x.id === p.id ? { ...x, atendidoEm: quando } : x));
        return { estado: 'ok', pedidos };
      });
    } catch (e: any) {
      vibrar('erro');
      Alert.alert('Não deu', e?.message ?? 'Tente de novo.');
    } finally {
      setMarcando(null);
    }
  }

  // ── modo AVISO: some quando não há o que avisar ─────────────────────────
  if (modo === 'aviso') {
    if (!leitura || leitura.estado !== 'ok' || leitura.pedidos.length === 0) return null;
    const n = leitura.pedidos.length;
    return (
      <View style={[styles.bloco, styles.blocoAviso]}>
        <View style={styles.topo}>
          <MaterialCommunityIcons name="qrcode-scan" size={18} color={cores.accentLight} />
          <Text style={styles.titulo}>
            {n} pedido{n === 1 ? '' : 's'} de orçamento pela etiqueta QR
          </Text>
        </View>
        {leitura.pedidos.slice(0, 3).map((p) => (
          <LinhaPedido
            key={p.id}
            pedido={p}
            equipamento={nomeEquipamento(p.equipamentoId)}
            marcando={marcando === p.id}
            onResponder={() => responder(p)}
            onAtendido={() => atendido(p)}
            onAbrir={onAbrirEquipamento ? () => onAbrirEquipamento(p.equipamentoId) : undefined}
          />
        ))}
        {n > 3 ? <Text style={styles.mais}>+ {n - 3} na ficha de cada equipamento</Text> : null}
      </View>
    );
  }

  // ── modo EQUIPAMENTO: três estados visíveis ─────────────────────────────
  return (
    <View style={styles.bloco}>
      <View style={styles.topo}>
        <MaterialCommunityIcons name="message-text-outline" size={18} color={cores.accentLight} />
        <Text style={styles.titulo}>Pedidos pela etiqueta</Text>
      </View>
      {!leitura ? (
        <Text style={styles.info}>Lendo os pedidos…</Text>
      ) : leitura.estado === 'erro' ? (
        <TouchableOpacity onPress={() => { void carregar(); }} accessibilityRole="button">
          <Text style={styles.info}>Não consegui ler os pedidos agora. Toque para tentar de novo.</Text>
        </TouchableOpacity>
      ) : leitura.estado === 'indisponivel' ? (
        <Text style={styles.info}>Os pedidos pela etiqueta ainda não estão disponíveis nesta conta.</Text>
      ) : leitura.pedidos.length === 0 ? (
        <Text style={styles.info}>
          Nenhum pedido ainda. Quem escanear a etiqueta pode tocar em "Pedir orçamento" — o pedido aparece aqui.
        </Text>
      ) : (
        leitura.pedidos.map((p) => (
          <LinhaPedido
            key={p.id}
            pedido={p}
            marcando={marcando === p.id}
            onResponder={() => responder(p)}
            onAtendido={p.atendidoEm ? undefined : () => atendido(p)}
          />
        ))
      )}
    </View>
  );
}

function LinhaPedido({
  pedido, equipamento, marcando, onResponder, onAtendido, onAbrir,
}: {
  pedido: PedidoOrcamentoQr;
  equipamento?: string;
  marcando: boolean;
  onResponder: () => void;
  onAtendido?: () => void;
  onAbrir?: () => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.pedido}>
      <TouchableOpacity disabled={!onAbrir} onPress={onAbrir} activeOpacity={0.85}>
        <Text style={styles.pedidoNome} numberOfLines={1}>
          {pedido.nome}{equipamento ? ` · ${equipamento}` : ''}
        </Text>
        <Text style={styles.pedidoSub}>
          {telefoneLegivel(pedido.telefone) || pedido.telefone} · {diaBr(pedido.criadoEm)}
          {pedido.atendidoEm ? ' · atendido' : ' · novo'}
        </Text>
        {pedido.mensagem ? <Text style={styles.pedidoMsg} numberOfLines={3}>“{pedido.mensagem}”</Text> : null}
      </TouchableOpacity>
      <View style={styles.acoes}>
        <TouchableOpacity style={styles.btnZap} onPress={onResponder} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`Responder ${pedido.nome} no WhatsApp`}>
          <MaterialCommunityIcons name="whatsapp" size={17} color="#fff" />
          <Text style={styles.btnZapTxt}>Responder</Text>
        </TouchableOpacity>
        {onAtendido ? (
          <TouchableOpacity style={styles.btnOk} onPress={onAtendido} disabled={marcando} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Marcar pedido como atendido">
            <MaterialCommunityIcons name="check" size={17} color={cores.accentLight} />
            <Text style={styles.btnOkTxt}>{marcando ? 'Marcando…' : 'Atendido'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  bloco: {
    backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: c.outlineDark, padding: Spacing.base, gap: 10, ...sombrasDe(c).sm,
  },
  blocoAviso: { marginHorizontal: Spacing.base, marginBottom: 10, borderColor: c.strokeGlow },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { flex: 1, fontSize: 14.5, fontWeight: '800', color: c.onSurface },
  info: { fontSize: 13, color: c.onSurfaceVariant, lineHeight: 19 },
  mais: { fontSize: 12, color: c.onSurfaceVariant },
  pedido: {
    backgroundColor: c.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: c.outline, padding: 12, gap: 8,
  },
  pedidoNome: { fontSize: 14, fontWeight: '800', color: c.onSurface },
  pedidoSub: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
  pedidoMsg: { fontSize: 13, color: c.onSurface, marginTop: 6, lineHeight: 18 },
  acoes: { flexDirection: 'row', gap: 8 },
  btnZap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: c.whatsapp, borderRadius: BorderRadius.md, paddingVertical: 10,
  },
  btnZapTxt: { color: '#fff', fontSize: 13.5, fontWeight: '800' },
  btnOk: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: c.surface, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.strokeGlow, paddingVertical: 10,
  },
  btnOkTxt: { color: c.accentLight, fontSize: 13.5, fontWeight: '800' },
});
