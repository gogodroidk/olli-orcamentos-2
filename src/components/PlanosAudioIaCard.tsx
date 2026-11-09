/**
 * D1438-G20 — o mesmo protótipo da tela de Planos, no app.
 * Só monta com EXPO_PUBLIC_PLANOS_AUDIO_IA=1. A escuta reusa o reconhecimento
 * de fala que o app já tem. Não chama /voz nem /transcrever. Não grava.
 */
import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, useCores, useEstilos, type Cores } from '../theme';
import { useReconhecimentoVoz } from '../services/reconhecimentoVoz';
import {
  FALA_MAX,
  formatarReaisAudio,
  formatarTelefoneAudio,
  interpretarFalaPlanos,
  planosAudioIaLigada,
  rotuloTipoAudioIa,
  type RascunhoAudioIa,
} from '../services/planosAudioIa';

function CardLigado() {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [texto, setTexto] = useState('');
  const [parcial, setParcial] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<RascunhoAudioIa | null>(null);
  const textoRef = useRef('');
  textoRef.current = texto;

  function montar(fala: string) {
    const saida = interpretarFalaPlanos(fala);
    if (!saida.ok) {
      setErro('Fale ou escreva o que você quer montar.');
      setRascunho(null);
      return;
    }
    setErro(null);
    setRascunho(saida.rascunho);
    if (saida.rascunho.documentoFalado) {
      textoRef.current = saida.textoUsado;
      setTexto(saida.textoUsado);
    }
  }

  const voz = useReconhecimentoVoz({
    onParcial: (trecho) => setParcial(trecho),
    onFinal: (frase) => {
      const junto = `${textoRef.current} ${frase}`.trim().slice(0, FALA_MAX);
      textoRef.current = junto;
      setTexto(junto);
      setParcial('');
    },
    onErro: (mensagem) => setErro(mensagem),
    onFimEscuta: () => {
      const fala = textoRef.current.trim();
      if (fala) montar(fala);
    },
  });

  function limpar() {
    if (voz.ouvindo) voz.parar();
    textoRef.current = '';
    setTexto('');
    setParcial('');
    setErro(null);
    setRascunho(null);
  }

  const visivel = parcial ? `${texto} ${parcial}`.trim() : texto;

  return (
    <View style={styles.caixa} accessibilityRole="summary" accessibilityLabel="Protótipo de áudio para montar rascunho. Não está no ar.">
      <Text style={styles.selo}>Protótipo · não está no ar</Text>
      <Text style={styles.titulo}>Fale e eu monto o rascunho</Text>
      <Text style={styles.texto}>
        Isto não faz parte do plano que está à venda. O aparelho ouve aqui e eu monto um orçamento ou um cadastro. Nada é gravado. O áudio não sai do aparelho.
      </Text>
      <TextInput
        style={styles.campo}
        multiline
        maxLength={FALA_MAX}
        value={visivel}
        onChangeText={(valor) => {
          textoRef.current = valor;
          setTexto(valor);
          setParcial('');
        }}
        placeholder="Orçamento para o João, instalação, 450 reais. Ou: cadastra o cliente Ana."
        placeholderTextColor={cores.onSurfaceVariant}
        accessibilityLabel="O que você falou"
      />
      {!voz.checandoDisponibilidade && !voz.disponivel ? (
        <Text style={styles.nota}>{voz.motivoIndisponivel ?? 'Este aparelho não ouve agora. Escreva o que você falaria.'}</Text>
      ) : null}
      <View style={styles.botoes}>
        <TouchableOpacity
          style={styles.botao}
          onPress={() => { void (voz.ouvindo ? voz.parar() : voz.iniciar()); }}
          accessibilityRole="button"
          accessibilityLabel={voz.ouvindo ? 'Parar de ouvir' : 'Falar'}
        >
          <MaterialCommunityIcons name={voz.ouvindo ? 'stop' : 'microphone'} size={18} color={cores.accentLight} />
          <Text style={styles.botaoTexto}>{voz.ouvindo ? 'Parar' : 'Falar'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.botao}
          onPress={() => montar(texto)}
          disabled={!texto.trim()}
          accessibilityRole="button"
          accessibilityLabel="Montar rascunho"
        >
          <Text style={styles.botaoTexto}>Montar rascunho</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.botao} onPress={limpar} accessibilityRole="button" accessibilityLabel="Limpar">
          <Text style={styles.botaoTexto}>Limpar</Text>
        </TouchableOpacity>
      </View>
      {erro ? <Text style={styles.nota}>{erro}</Text> : null}
      {rascunho ? (
        <View style={styles.resultado}>
          <Text style={styles.titulo}>{rotuloTipoAudioIa(rascunho.tipo)}</Text>
          <Text style={styles.texto}>{rascunho.aviso}</Text>
          {rascunho.clienteNome ? <Text style={styles.texto}>Cliente: {rascunho.clienteNome}</Text> : null}
          {rascunho.telefone ? <Text style={styles.texto}>Telefone: {formatarTelefoneAudio(rascunho.telefone)}</Text> : null}
          {rascunho.email ? <Text style={styles.texto}>E-mail: {rascunho.email}</Text> : null}
          {rascunho.itemNome ? <Text style={styles.texto}>{rascunho.itemTipo === 'peca' ? 'Produto' : 'Serviço'}: {rascunho.itemNome}</Text> : null}
          {rascunho.itens.map((item) => (
            <Text key={`${item.tipo}-${item.descricao}`} style={styles.texto}>
              {item.quantidade} × {item.descricao} — {item.valorUnitario === null ? 'preço não falado' : item.valorUnitario === 0 ? `${formatarReaisAudio(0)} (cortesia)` : formatarReaisAudio(item.valorUnitario)}
            </Text>
          ))}
          {rascunho.faltando.length > 0 ? <Text style={styles.nota}>Faltou: {rascunho.faltando.join('; ')}.</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

export function PlanosAudioIaCard() {
  const flag = (process.env as { EXPO_PUBLIC_PLANOS_AUDIO_IA?: string }).EXPO_PUBLIC_PLANOS_AUDIO_IA;
  if (!planosAudioIaLigada(flag)) return null;
  return <CardLigado />;
}

function criarEstilos(c: Cores) {
  return StyleSheet.create({
    caixa: {
      marginTop: Spacing.lg,
      padding: Spacing.md,
      borderRadius: BorderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.outline,
      gap: Spacing.sm,
    },
    selo: { color: c.onSurfaceVariant, fontSize: 12, fontWeight: '600' },
    titulo: { color: c.onSurface, fontSize: 16, fontWeight: '700' },
    texto: { color: c.onSurface, fontSize: 14, lineHeight: 20 },
    nota: { color: c.onSurfaceVariant, fontSize: 13, lineHeight: 18 },
    campo: {
      minHeight: 88,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.outline,
      borderRadius: BorderRadius.sm,
      padding: Spacing.sm,
      color: c.onSurface,
      textAlignVertical: 'top',
    },
    botoes: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    botao: {
      minHeight: 44,
      paddingHorizontal: Spacing.md,
      borderRadius: BorderRadius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.outline,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
    },
    botaoTexto: { color: c.onSurface, fontSize: 14, fontWeight: '600' },
    resultado: {
      padding: Spacing.sm,
      borderRadius: BorderRadius.sm,
      backgroundColor: c.surface,
      gap: Spacing.xs,
    },
  });
}
