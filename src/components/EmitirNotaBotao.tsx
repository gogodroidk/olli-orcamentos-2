import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, textoSobre, Typography, useCores, useEstilos, type Cores } from '../theme';
import { OlliCard } from './OlliCard';
import { OlliPressable } from './OlliPressable';
import { usePlano } from '../hooks/usePlano';
import { emitirNfse, nfseDisponivel, statusNfse, type NotaFiscalApp } from '../services/nfse';
import { montarPedidoNfse, podeMostrarEmitirNota, ROTULO_FALTA } from '../services/nfseRegras';
import type { Orcamento } from '../types';

/**
 * <EmitirNotaBotao> — NFS-e do orçamento aprovado (Fase 1, atrás da flag NFSE_ENABLED do servidor).
 *
 * Devolve `null` (nada na tela, nenhuma chamada de rede) quando QUALQUER uma destas falha: plano Empresa, orçamento
 * aprovado, flag ligada no servidor. Só consulta a flag depois que plano e status já passaram — quem não é Empresa
 * nunca gera tráfego. Com a flag desligada, o app fica idêntico ao de antes.
 *
 * Fluxo: botão → conferência ("Confira antes", com o que falta) → emitir → resultado (nº, PDF, XML).
 * O envio no WhatsApp e o assistente fiscal do prestador (CNPJ, inscrição municipal, certificado) são as próximas fases.
 */
export function EmitirNotaBotao({ orc }: { orc: Orcamento }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const { plano } = usePlano();
  const [flag, setFlag] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [issRetido, setIssRetido] = useState(false);
  const [emitindo, setEmitindo] = useState(false);
  const [nota, setNota] = useState<NotaFiscalApp | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const elegivel = plano === 'empresa' && (orc.status === 'aprovado' || orc.status === 'convertido');

  useEffect(() => {
    if (!elegivel) return;
    let vivo = true;
    void nfseDisponivel().then((v) => {
      if (!vivo) return;
      setFlag(v);
      if (v) void statusNfse(orc.id).then((n) => vivo && n && setNota(n));
    });
    return () => { vivo = false; };
  }, [elegivel, orc.id]);

  if (!podeMostrarEmitirNota({ flagServidor: flag, plano, status: orc.status })) return null;

  const montado = montarPedidoNfse(orc, issRetido);

  async function emitir() {
    if (!montado.ok || emitindo) return;
    setEmitindo(true);
    setAviso(null);
    const r = await emitirNfse(montado.pedido);
    setEmitindo(false);
    if (r.ok) { setNota(r.nota); setAberto(false); return; }
    setAviso(
      r.erro === 'perfil_fiscal_incompleto'
        ? 'Faltam os dados fiscais da sua empresa (CNPJ, inscrição municipal, serviço). Em breve você preenche aqui no app.'
        : r.erro === 'plano_insuficiente'
          ? 'Emitir nota é do plano Empresa.'
          : r.erro === 'pedido_invalido'
            ? 'Algum dado do orçamento não passou na conferência. Revise o cliente e o serviço.'
            : 'Não consegui emitir agora. Seu orçamento está salvo; tente de novo em instantes.',
    );
  }

  if (nota && nota.status !== 'erro') {
    const simulada = nota.ambiente !== 'producao';
    return (
      <OlliCard style={styles.cartao}>
        <View style={styles.linha}>
          <MaterialCommunityIcons name={nota.status === 'autorizada' ? 'check-decagram' : 'timer-sand'} size={22} color={nota.status === 'autorizada' ? cores.success : cores.accentLight} />
          <Text style={styles.titulo}>{nota.status === 'autorizada' ? `Nota fiscal${nota.numero ? ` nº ${nota.numero}` : ''} emitida` : 'Nota em processamento'}</Text>
        </View>
        {simulada && <Text style={styles.texto}>Nota de teste ({nota.ambiente === 'homologacao' ? 'homologação' : 'simulada'}): não tem valor fiscal.</Text>}
        {nota.status === 'autorizada' && (
          <View style={styles.acoes}>
            {nota.pdfUrl && <OlliPressable style={styles.botaoSec} accessibilityRole="button" accessibilityLabel="Ver PDF da nota" onPress={() => void Linking.openURL(nota.pdfUrl!).catch(() => {})}><Text style={styles.botaoSecTexto}>Ver PDF</Text></OlliPressable>}
            {nota.xmlUrl && <OlliPressable style={styles.botaoSec} accessibilityRole="button" accessibilityLabel="Baixar XML da nota" onPress={() => void Linking.openURL(nota.xmlUrl!).catch(() => {})}><Text style={styles.botaoSecTexto}>Baixar XML</Text></OlliPressable>}
          </View>
        )}
      </OlliCard>
    );
  }

  if (!aberto) {
    return (
      <OlliCard style={styles.cartao}>
        {nota?.status === 'erro' && <Text style={styles.erro}>{nota.erro || 'A última tentativa não foi aceita.'}</Text>}
        <OlliPressable style={styles.botao} accessibilityRole="button" accessibilityLabel="Emitir nota fiscal" onPress={() => setAberto(true)}>
          <MaterialCommunityIcons name="file-document-check-outline" size={20} color={textoSobre(cores.accent)} />
          <Text style={styles.botaoTexto}>Emitir nota</Text>
        </OlliPressable>
      </OlliCard>
    );
  }

  return (
    <OlliCard style={styles.cartao}>
      <Text style={styles.titulo}>Confira antes de emitir</Text>
      <Text style={styles.texto}>A nota sai em nome da sua empresa.</Text>
      <Text style={styles.texto}>Para: {orc.clienteNome}</Text>
      <Text style={styles.texto}>Serviço: {montado.ok ? montado.pedido.servico.descricao : '—'}</Text>
      <Text style={styles.texto}>Valor: R$ {(Number(orc.valorTotal) || 0).toFixed(2).replace('.', ',')}</Text>
      <OlliPressable style={styles.linha} accessibilityRole="checkbox" accessibilityState={{ checked: issRetido }} accessibilityLabel="ISS retido pelo cliente" onPress={() => setIssRetido((v) => !v)}>
        <MaterialCommunityIcons name={issRetido ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={cores.accentLight} />
        <Text style={styles.texto}>ISS retido pelo cliente</Text>
      </OlliPressable>
      {!montado.ok && (
        <View style={styles.faltas}>
          <Text style={styles.erro}>Falta no orçamento:</Text>
          {montado.faltando.map((f) => <Text key={f} style={styles.erro}>• {ROTULO_FALTA[f]}</Text>)}
        </View>
      )}
      {aviso && <Text style={styles.erro}>{aviso}</Text>}
      <View style={styles.acoes}>
        <OlliPressable style={styles.botaoSec} accessibilityRole="button" onPress={() => setAberto(false)}><Text style={styles.botaoSecTexto}>Voltar</Text></OlliPressable>
        <OlliPressable style={[styles.botao, (!montado.ok || emitindo) && styles.desligado]} disabled={!montado.ok || emitindo} accessibilityRole="button" accessibilityLabel="Emitir nota fiscal" onPress={() => void emitir()}>
          <Text style={styles.botaoTexto}>{emitindo ? 'Emitindo…' : 'Emitir nota'}</Text>
        </OlliPressable>
      </View>
    </OlliCard>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    cartao: { marginTop: Spacing.base },
    linha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 },
    titulo: { ...Typography.h3, color: c.onSurface },
    texto: { ...Typography.body, color: c.onSurfaceVariant, marginTop: 4 },
    erro: { ...Typography.body, color: c.danger, marginTop: 6 },
    faltas: { marginTop: 8 },
    acoes: { flexDirection: 'row', gap: 10, marginTop: 12 },
    botao: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, minHeight: 48, borderRadius: BorderRadius.md, backgroundColor: c.accent, paddingHorizontal: 16 },
    botaoTexto: { ...Typography.button, color: textoSobre(c.accent) },
    botaoSec: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline, paddingHorizontal: 16 },
    botaoSecTexto: { ...Typography.button, color: c.onSurface },
    desligado: { opacity: 0.45 },
  });
