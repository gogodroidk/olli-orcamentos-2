import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, textoSobre, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { OlliInput } from '../components/OlliInput';
import { GuardaPapel } from '../components/GuardaPapel';
import { PressableAnimado } from '../components/motion/PressableAnimado';
import { getEmpresa } from '../database/database';
import { enviarFeedback } from '../services/feedback';
import { track, Eventos } from '../services/analytics';
import { goBackOrHome } from '../navigation/safeBack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { generateId } from '../utils/id';
import {
  PECAS_IDENTIDADE,
  FRASES_REVISAO,
  BRIEFING_MAX,
  textoOferta,
  montarPedido,
  mensagemPedido,
  rotuloQuando,
  nomeDaPeca,
  textoResultado,
  type PedidoIdentidade,
  type PecaId,
} from '../services/identidadeUpsell';
import { gravarPedidoLocal, lerPedidoLocal } from '../services/identidadeUpsellStore';

type Passo = 'oferta' | 'escolha' | 'briefing' | 'revisao' | 'pronto';
type AvisoTela = 'ok' | 'sem_sessao' | 'erro';

const ICONE: Record<PecaId, keyof typeof MaterialCommunityIcons.glyphMap> = {
  logo: 'image-outline',
  identidade: 'palette-swatch-outline',
  camiseta: 'tshirt-crew-outline',
};

export default function IdentidadeUpsellScreen() {
  return (
    <GuardaPapel acao="ver_valores_agregados" area="Identidade visual">
      <IdentidadeUpsellConteudo />
    </GuardaPapel>
  );
}

function IdentidadeUpsellConteudo() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [passo, setPasso] = useState<Passo>('oferta');
  const [temLogo, setTemLogo] = useState(false);
  const [pedidoGuardado, setPedidoGuardado] = useState<PedidoIdentidade | null>(null);
  const [pecas, setPecas] = useState<PecaId[]>([]);
  const [briefing, setBriefing] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ aviso: AvisoTela; gravou: boolean } | null>(null);
  const oferta = textoOferta(temLogo);
  const jaMediu = useRef(false);

  useFocusEffect(useCallback(() => {
    let vivo = true;
    void (async () => {
      const [empresa, pedido] = await Promise.all([getEmpresa(), lerPedidoLocal()]);
      if (!vivo) return;
      const comLogo = !!empresa?.logoUri;
      setTemLogo(comLogo);
      setPedidoGuardado((atual) => atual ?? pedido);
      if (!jaMediu.current) {
        jaMediu.current = true;
        track(Eventos.identidadeUpsellAberto, { temLogo: comLogo });
      }
    })();
    return () => { vivo = false; };
  }, []));

  const alternar = (id: PecaId) => {
    setErro(null);
    setPecas((atual) => (atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]));
  };

  const seguirEscolha = () => {
    if (pecas.length === 0) {
      setErro('Escolha ao menos uma peça.');
      return;
    }
    setErro(null);
    setPasso('briefing');
  };

  const seguirBriefing = () => {
    const montado = montarPedido({ pecas, briefing }, { id: 'rascunho', agoraIso: new Date().toISOString() });
    if (!montado.ok) {
      setErro(montado.motivo);
      return;
    }
    setBriefing(montado.pedido.briefing);
    setErro(null);
    setPasso('revisao');
  };

  const anotar = async () => {
    if (enviando) return;
    const montado = montarPedido({ pecas, briefing }, { id: generateId(), agoraIso: new Date().toISOString() });
    if (!montado.ok) {
      setErro(montado.motivo);
      return;
    }
    setEnviando(true);
    setErro(null);
    const base: PedidoIdentidade = { ...montado.pedido, avisoEquipe: 'nao_enviado' };
    const gravouAntes = await gravarPedidoLocal(base);
    const avisoBruto = await enviarFeedback('sugestao', mensagemPedido(base), {
      tela: 'IdentidadeUpsell',
      assunto: 'identidade_visual_upsell',
      pecas: base.pecas.join(','),
    });
    const aviso: AvisoTela = avisoBruto === 'ok' ? 'ok' : avisoBruto === 'sem_sessao' ? 'sem_sessao' : 'erro';
    const final: PedidoIdentidade = { ...base, avisoEquipe: aviso === 'ok' ? 'enviado' : 'nao_enviado' };
    if (gravouAntes) await gravarPedidoLocal(final);
    // Se o segundo save falhar, a primeira cópia ainda está no aparelho.
    const ficou = gravouAntes;
    setPedidoGuardado((atual) => (ficou ? final : atual));
    setResultado({ aviso, gravou: ficou });
    setPasso('pronto');
    setEnviando(false);
    if (aviso === 'ok' || ficou) {
      track(Eventos.identidadeUpsellAnotado, {
        logo: final.pecas.includes('logo'),
        identidade: final.pecas.includes('identidade'),
        camiseta: final.pecas.includes('camiseta'),
        aviso: final.avisoEquipe,
      });
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <GradientHeader title="Identidade à parte" subtitle="Serviço extra, fora do plano" onBack={() => goBackOrHome(nav)} />
      <ScrollView
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: Spacing.base + insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {passo === 'oferta' && (
          <View style={styles.card}>
            <Text style={styles.titulo}>{oferta.titulo}</Text>
            <Text style={styles.corpo}>{oferta.corpo}</Text>
            {PECAS_IDENTIDADE.map((peca) => (
              <View key={peca.id} style={styles.pecaLinha}>
                <MaterialCommunityIcons name={ICONE[peca.id]} size={22} color={cores.primary} />
                <View style={styles.pecaTexto}>
                  <Text style={styles.pecaNome}>{peca.nome}</Text>
                  <Text style={styles.corpo}>{peca.entrega}</Text>
                  <Text style={styles.limite}>{peca.limite}</Text>
                </View>
              </View>
            ))}
            <Text style={styles.aviso}>{FRASES_REVISAO[0]} {FRASES_REVISAO[1]}</Text>
            {pedidoGuardado && (
              <Text style={styles.ultimo}>
                Último pedido {rotuloQuando(pedidoGuardado.criadoEm)}: {pedidoGuardado.pecas.map(nomeDaPeca).join(', ')}.
                {pedidoGuardado.avisoEquipe === 'enviado' ? ' A equipe recebeu.' : ' A equipe ainda não recebeu este.'}
              </Text>
            )}
            <OlliButton label="Escolher o que preciso" onPress={() => { setErro(null); setPasso('escolha'); }} style={styles.botao} />
          </View>
        )}

        {passo === 'escolha' && (
          <View style={styles.card}>
            <Text style={styles.titulo}>O que você quer que a gente desenhe?</Text>
            <Text style={styles.corpo}>Pode marcar mais de uma. Nada é cobrado ao marcar.</Text>
            {PECAS_IDENTIDADE.map((peca) => {
              const ativa = pecas.includes(peca.id);
              return (
                <PressableAnimado
                  key={peca.id}
                  onPress={() => alternar(peca.id)}
                  haptic="selection"
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: ativa }}
                  accessibilityLabel={`${peca.nome}. ${peca.limite}`}
                  style={[styles.escolha, ativa && styles.escolhaAtiva]}
                >
                  <MaterialCommunityIcons name={ativa ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={ativa ? textoSobre(cores.accentLight) : cores.primary} />
                  <View style={styles.pecaTexto}>
                    <Text style={[styles.pecaNome, ativa && { color: textoSobre(cores.accentLight) }]}>{peca.nome}</Text>
                    <Text style={[styles.corpo, ativa && { color: textoSobre(cores.accentLight) }]}>{peca.entrega} {peca.limite}</Text>
                  </View>
                </PressableAnimado>
              );
            })}
            {erro && <Text style={styles.erro} accessibilityRole="alert">{erro}</Text>}
            <OlliButton label="Continuar" onPress={seguirEscolha} style={styles.botao} />
            <OlliButton label="Voltar" variant="ghost" onPress={() => { setErro(null); setPasso('oferta'); }} />
          </View>
        )}

        {passo === 'briefing' && (
          <View style={styles.card}>
            <Text style={styles.titulo}>Conta da marca</Text>
            <Text style={styles.corpo}>Ofício, cores e onde a marca vai aparecer. Sem CPF, sem CNPJ e sem dado de cliente.</Text>
            <OlliInput
              label="O que a marca precisa passar"
              required
              multiline
              maxLength={BRIEFING_MAX}
              value={briefing}
              onChangeText={(valor) => { setBriefing(valor); setErro(null); }}
              error={erro ?? undefined}
              helper={`${briefing.trim().length}/${BRIEFING_MAX}`}
              placeholder="Ex.: assistência de ar em Campinas, sóbrio, azul e branco, para o orçamento e a arte da camiseta."
              accessibilityLabel="Descrição da marca"
            />
            <OlliButton label="Revisar pedido" onPress={seguirBriefing} style={styles.botao} />
            <OlliButton label="Voltar" variant="ghost" onPress={() => { setErro(null); setPasso('escolha'); }} />
          </View>
        )}

        {passo === 'revisao' && (
          <View style={styles.card}>
            <Text style={styles.titulo}>Confira antes de anotar</Text>
            <Text style={styles.pecaNome}>{pecas.map(nomeDaPeca).join(', ')}</Text>
            <Text style={styles.corpo}>{briefing}</Text>
            {FRASES_REVISAO.map((frase) => (
              <Text key={frase} style={styles.limite}>• {frase}</Text>
            ))}
            {erro && <Text style={styles.erro} accessibilityRole="alert">{erro}</Text>}
            <OlliButton label="Anotar pedido" onPress={() => { void anotar(); }} loading={enviando} disabled={enviando} style={styles.botao} />
            <OlliButton label="Voltar" variant="ghost" onPress={() => { setErro(null); setPasso('briefing'); }} disabled={enviando} />
          </View>
        )}

        {passo === 'pronto' && resultado && (
          <View style={styles.card}>
            <Text style={styles.titulo}>{resultado.aviso === 'ok' || resultado.gravou ? 'Pedido anotado' : 'Pedido não saiu'}</Text>
            <Text style={styles.corpo}>{textoResultado(resultado.aviso, resultado.gravou, 'aparelho')}</Text>
            <OlliButton label="Voltar para Meu negócio" onPress={() => goBackOrHome(nav)} style={styles.botao} />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  card: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, ...sombrasDe(c).sm },
  titulo: { fontSize: 18, fontWeight: '800', color: c.onSurface, marginBottom: Spacing.sm },
  corpo: { fontSize: 14, lineHeight: 20, color: c.onSurfaceVariant },
  pecaLinha: { flexDirection: 'row', gap: 12, marginTop: Spacing.base },
  pecaTexto: { flex: 1 },
  pecaNome: { fontSize: 15, fontWeight: '800', color: c.onSurface, marginBottom: 2 },
  limite: { fontSize: 13, lineHeight: 18, color: c.onSurfaceVariant, marginTop: 4 },
  aviso: { fontSize: 13, lineHeight: 18, color: c.onSurface, marginTop: Spacing.base },
  ultimo: { fontSize: 13, lineHeight: 18, color: c.onSurfaceVariant, marginTop: Spacing.sm },
  botao: { marginTop: Spacing.base },
  escolha: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderWidth: 1.5, borderColor: c.outline, borderRadius: BorderRadius.md, padding: 12, marginTop: Spacing.sm },
  escolhaAtiva: { backgroundColor: c.accentLight, borderColor: c.accentLight },
  erro: { fontSize: 13, lineHeight: 18, color: c.danger, marginTop: Spacing.sm },
});
