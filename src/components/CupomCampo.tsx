import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Spacing, BorderRadius, Fonts, useCores, useEstilos, type Cores } from '../theme';
import { cupomAtivo, consultarCupom, type ConsultaCupom } from '../services/cupom';
import { AVISO_CUPOM_E_INDICACAO, AVISO_CUPOM_NAO_RETROATIVO } from '../utils/cupomTexto';

/**
 * CupomCampo — "Tenho um cupom". Só aparece com o recurso LIGADO no servidor (desligado = nada na tela).
 * Antes de aplicar, a tela já diz que cupom e indicação não se somam e que o desconto vale só na 1ª
 * cobrança. Ao conferir, mostra o desconto ESCRITO (de/por) ou o motivo da recusa; nada é gravado
 * aqui (a reserva acontece ao gerar o Pix/checkout). Estático: sem animação nova.
 */
export interface CupomCampoProps {
  /** Chave do plano Pix (ex.: 'pro_mensal'), para o servidor calcular o "de/por". */
  plano?: string;
  /** Código conferido e válido, ou null quando limpo/recusado. */
  aoMudar: (codigo: string | null) => void;
}

export function CupomCampo({ plano, aoMudar }: CupomCampoProps) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [ativo, setAtivo] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<ConsultaCupom | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let vivo = true;
    void cupomAtivo().then((a) => { if (vivo) setAtivo(a); });
    return () => { vivo = false; };
  }, []);

  if (!ativo) return null;

  async function conferir() {
    const c = codigo.trim();
    if (!c) return;
    setCarregando(true);
    setFalhou(false);
    const r = await consultarCupom(c, plano);
    setCarregando(false);
    if (!r) { setResultado(null); setFalhou(true); aoMudar(null); return; }
    setResultado(r);
    aoMudar(r.valido && r.codigo ? r.codigo : null);
  }

  function limpar() {
    setCodigo('');
    setResultado(null);
    setFalhou(false);
    aoMudar(null);
  }

  if (!aberto) {
    return (
      <TouchableOpacity onPress={() => setAberto(true)} accessibilityRole="button" accessibilityLabel="Tenho um cupom" style={styles.link}>
        <Text style={styles.linkTxt}>Tenho um cupom</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.box}>
      <Text style={styles.aviso}>{AVISO_CUPOM_E_INDICACAO}</Text>
      <Text style={styles.aviso}>{AVISO_CUPOM_NAO_RETROATIVO}</Text>
      <View style={styles.linha}>
        <TextInput
          value={codigo}
          onChangeText={(t) => { setCodigo(t.toUpperCase()); setResultado(null); setFalhou(false); aoMudar(null); }}
          placeholder="Código do cupom"
          placeholderTextColor={cores.onSurfaceVariant}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={20}
          style={styles.input}
          accessibilityLabel="Código do cupom"
        />
        <TouchableOpacity onPress={() => void conferir()} disabled={carregando || !codigo.trim()} style={styles.botao} accessibilityRole="button" accessibilityLabel="Conferir cupom">
          {carregando ? <ActivityIndicator color={cores.accentLight} /> : <Text style={styles.botaoTxt}>Conferir</Text>}
        </TouchableOpacity>
      </View>
      {resultado ? <Text style={resultado.valido ? styles.ok : styles.erro}>{resultado.texto}</Text> : null}
      {falhou ? <Text style={styles.erro}>Não consegui conferir o cupom agora. Tente de novo.</Text> : null}
      {resultado || codigo ? (
        <TouchableOpacity onPress={limpar} accessibilityRole="button" accessibilityLabel="Remover cupom">
          <Text style={styles.linkTxt}>Remover cupom</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    link: { alignSelf: 'center', paddingVertical: Spacing.sm },
    linkTxt: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.accentLight },
    box: { alignSelf: 'stretch', gap: Spacing.xs, backgroundColor: c.surface, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.strokeGlow, padding: Spacing.md, marginVertical: Spacing.sm },
    aviso: { fontSize: 12, fontFamily: Fonts.regular, color: c.onSurfaceVariant, lineHeight: 17 },
    linha: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
    input: { flex: 1, minHeight: 44, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.strokeGlow, paddingHorizontal: Spacing.md, fontSize: 15, fontFamily: Fonts.semiBold, color: c.onSurface, backgroundColor: c.background },
    botao: { minHeight: 44, minWidth: 84, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md },
    botaoTxt: { fontSize: 14, fontFamily: Fonts.bold, color: c.accentLight },
    ok: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.success, lineHeight: 18 },
    erro: { fontSize: 13, fontFamily: Fonts.regular, color: c.danger, lineHeight: 18 },
  });
