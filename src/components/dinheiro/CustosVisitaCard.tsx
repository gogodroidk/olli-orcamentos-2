/**
 * "Custos da visita" em Meu negócio (Onda I4 · Lucro real da visita).
 *
 * Três números, informados UMA vez, que transformam "quanto eu cobrei" em
 * "quanto sobrou": custo por km (com a conta combustível ÷ consumo para quem não
 * sabe de cabeça), comissão (%) e o ponto de saída (achado pelo endereço do
 * cadastro com o geocodificador grátis do worker — nada de Google). Tudo vai no
 * rascunho da tela e só grava no "Salvar alterações", como o resto de Meu negócio.
 *
 * Honestidade: o deslocamento é ESTIMADO (linha reta × 1,4, ida e volta) e a
 * tela diz isso. Custo por km 0 = "não conto deslocamento" (escolha explícita).
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, sombrasDe, useCores, useEstilos, type Cores } from '../../theme';
import { PressableAnimado } from '../motion/PressableAnimado';
import { DicaContextual } from '../DicaContextual';
import { vibrar } from '../../utils/haptico';
import { parseCurrency } from '../../utils/currency';
import { cepDoEndereco } from '../../utils/cidadeClima';
import { ROTULO_GEO_PRECISAO } from '../../utils/geoCliente';
import { geocodificarEndereco } from '../../services/cep';
import { reais, FATOR_RUA } from '../../services/lucroVisita';
import type { Empresa } from '../../types';

interface Props {
  empresa: Empresa;
  onMudar: (patch: Partial<Empresa>) => void;
}

function numeroOuVazio(v: number | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? String(v).replace('.', ',') : '';
}

export function CustosVisitaCard({ empresa, onMudar }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [custoKm, setCustoKm] = useState(numeroOuVazio(empresa.custoKm));
  const [comissao, setComissao] = useState(numeroOuVazio(empresa.comissaoPercentual));
  const [litro, setLitro] = useState('');
  const [kmPorLitro, setKmPorLitro] = useState('');
  const [localizando, setLocalizando] = useState(false);
  const [avisoBase, setAvisoBase] = useState<string | null>(null);

  function mudarCustoKm(t: string) {
    setCustoKm(t);
    onMudar({ custoKm: t.trim() ? Math.max(0, parseCurrency(t)) : undefined });
  }

  function mudarComissao(t: string) {
    setComissao(t);
    onMudar({ comissaoPercentual: t.trim() ? Math.min(100, Math.max(0, parseCurrency(t))) : undefined });
  }

  const precoLitro = parseCurrency(litro);
  const consumo = parseCurrency(kmPorLitro);
  const sugestao = precoLitro > 0 && consumo > 0 ? Math.round((precoLitro / consumo) * 100) / 100 : null;

  async function localizarBase() {
    if (localizando) return;
    vibrar('selecao');
    setLocalizando(true);
    setAvisoBase(null);
    try {
      const r = await geocodificarEndereco({
        cep: cepDoEndereco(empresa.endereco),
        endereco: empresa.endereco,
        cidade: empresa.cidade,
        estado: empresa.estado,
      });
      if (r.estado === 'ok') {
        vibrar('sucesso');
        onMudar({ baseLat: r.lat, baseLon: r.lon, baseGeoPrecisao: r.precisao });
        setAvisoBase(r.atribuicao ?? null);
      } else if (r.estado === 'invalido') {
        setAvisoBase('Preencha cidade e UF (ou um CEP no endereço) em Dados e tente de novo.');
      } else if (r.estado === 'sem_resultado') {
        setAvisoBase('Não achei esse endereço. Confira o CEP ou a cidade em Dados.');
      } else {
        setAvisoBase('Não consegui localizar agora (sem internet ou serviço fora). Tente de novo.');
      }
    } catch {
      setAvisoBase('Não consegui localizar agora. Tente de novo.');
    } finally {
      setLocalizando(false);
    }
  }

  const temBase = typeof empresa.baseLat === 'number' && typeof empresa.baseLon === 'number';
  const precisao = empresa.baseGeoPrecisao ? ROTULO_GEO_PRECISAO[empresa.baseGeoPrecisao] : null;

  return (
    <View style={styles.card}>
      <Text style={styles.titulo}>Custos da visita</Text>
      <Text style={styles.hint}>
        Com estes três números a OLLI mostra quanto SOBROU de cada serviço: preço − material − deslocamento − comissão.
      </Text>

      <Text style={styles.label}>Custo por km rodado (R$)</Text>
      <TextInput
        style={styles.input}
        value={custoKm}
        onChangeText={mudarCustoKm}
        keyboardType="decimal-pad"
        placeholder="Ex.: 0,65"
        placeholderTextColor={cores.onSurfaceMuted}
        accessibilityLabel="Custo por quilômetro rodado em reais"
      />
      <Text style={styles.mini}>Não sabe? Preço do litro ÷ km por litro:</Text>
      <View style={styles.linha}>
        <TextInput
          style={[styles.input, styles.inputCurto]}
          value={litro}
          onChangeText={setLitro}
          keyboardType="decimal-pad"
          placeholder="R$ do litro"
          placeholderTextColor={cores.onSurfaceMuted}
          accessibilityLabel="Preço do litro de combustível"
        />
        <TextInput
          style={[styles.input, styles.inputCurto]}
          value={kmPorLitro}
          onChangeText={setKmPorLitro}
          keyboardType="decimal-pad"
          placeholder="km por litro"
          placeholderTextColor={cores.onSurfaceMuted}
          accessibilityLabel="Quilômetros por litro do veículo"
        />
      </View>
      {sugestao !== null ? (
        <PressableAnimado
          style={styles.chip}
          onPress={() => { vibrar('selecao'); mudarCustoKm(String(sugestao).replace('.', ',')); }}
          accessibilityLabel={`Usar ${reais(sugestao)} por km`}
        >
          <MaterialCommunityIcons name="calculator-variant-outline" size={14} color={cores.accentLight} />
          <Text style={styles.chipTxt}>Usar {reais(sugestao)}/km (só combustível)</Text>
        </PressableAnimado>
      ) : null}
      <PressableAnimado
        style={styles.chip}
        onPress={() => { vibrar('selecao'); mudarCustoKm('0'); }}
        accessibilityLabel="Não contar o deslocamento"
      >
        <Text style={styles.chipTxt}>Não contar deslocamento (R$ 0)</Text>
      </PressableAnimado>

      <Text style={[styles.label, { marginTop: Spacing.base }]}>Comissão por serviço (%)</Text>
      <TextInput
        style={styles.input}
        value={comissao}
        onChangeText={mudarComissao}
        keyboardType="decimal-pad"
        placeholder="Ex.: 10 (deixe vazio se não paga)"
        placeholderTextColor={cores.onSurfaceMuted}
        accessibilityLabel="Comissão por serviço em porcentagem"
      />

      <Text style={[styles.label, { marginTop: Spacing.base }]}>Ponto de saída</Text>
      <Text style={styles.hint}>
        {temBase
          ? `Localizado ${precisao ?? 'pelo endereço'}. A distância até o cliente é estimada: linha reta × ${String(FATOR_RUA).replace('.', ',')}, ida e volta, sem trânsito.`
          : 'De onde você sai para as visitas. Uso o endereço de Dados, uma vez, para estimar a distância até cada cliente.'}
      </Text>
      <PressableAnimado
        style={[styles.chip, localizando && { opacity: 0.6 }]}
        onPress={() => void localizarBase()}
        disabled={localizando}
        accessibilityLabel={temBase ? 'Localizar o ponto de saída de novo' : 'Localizar o ponto de saída pelo endereço'}
        accessibilityState={{ busy: localizando }}
      >
        <MaterialCommunityIcons name="map-marker-radius-outline" size={14} color={cores.accentLight} />
        <Text style={styles.chipTxt}>{localizando ? 'Localizando…' : temBase ? 'Localizar de novo' : 'Localizar pelo endereço'}</Text>
      </PressableAnimado>
      {avisoBase ? <Text style={styles.mini}>{avisoBase}</Text> : null}

      <DicaContextual
        id="negocio.custos-visita"
        icon="cash-multiple"
        texto="Preencha uma vez e salve. Ao concluir uma OS, a OLLI mostra quanto sobrou de verdade; no Painel, quanto sobrou no mês."
      />
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: BorderRadius.lg,
      padding: Spacing.base,
      marginBottom: Spacing.base,
      gap: 6,
      ...sombrasDe(c).sm,
    },
    titulo: { fontSize: 16, fontWeight: '800', color: c.onSurface },
    hint: { fontSize: 12.5, lineHeight: 17, color: c.onSurfaceVariant },
    label: { fontSize: 13, fontWeight: '700', color: c.onSurface, marginTop: 6 },
    mini: { fontSize: 12, lineHeight: 16, color: c.onSurfaceMuted },
    input: {
      minHeight: 44,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: c.outlineDark,
      backgroundColor: c.surfaceGlass,
      paddingHorizontal: Spacing.md,
      color: c.onSurface,
      fontSize: 14,
    },
    inputCurto: { flex: 1 },
    linha: { flexDirection: 'row', gap: Spacing.sm },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      minHeight: 36,
      paddingHorizontal: 14,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: c.outlineDark,
      backgroundColor: c.surfaceGlass,
      marginTop: 4,
    },
    chipTxt: { fontSize: 12.5, fontWeight: '700', color: c.accentLight },
  });
