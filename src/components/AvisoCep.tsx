import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, useCores, useEstilos, comAlfa, type Cores } from '../theme';
import { OlliPressable } from './OlliPressable';
import type { EstadoBuscaCep, EnderecoCEP, DivergenciaCep } from '../services/cep';

interface Props {
  estado: EstadoBuscaCep;
  endereco: EnderecoCEP | null;
  divergencias: DivergenciaCep[];
  /** Toque do usuário aceitando os valores do CEP. Sem isto, o botão não aparece. */
  onUsarDoCep?: () => void;
}

/**
 * As quatro respostas possíveis de uma busca de CEP, em UM lugar só.
 *
 * POR QUE COMPONENTE, E NÃO TEXTO EM CADA TELA: quatro telas fazem esta mesma
 * busca (Clientes, Step1 do orçamento, Painel desktop, Onboarding). Este repo
 * já viu três cópias da mesma máquina de estados divergirem em silêncio — foi o
 * que motivou extrair <SinalizarIA>. Aqui o risco é maior, porque a divergência
 * que importa é justamente entre as DUAS mensagens negativas.
 *
 * A distinção que este componente existe para proteger:
 *   `nao_encontrado` → "esse CEP não existe". Ação: conferir o número COM o
 *                      cliente. Só sai quando o ViaCEP confirma (é o árbitro).
 *   `indisponivel`   → "não consegui consultar". Ação: digitar e seguir.
 * Renderizar as duas igual faria o prestador ligar para o cliente conferir um
 * endereço correto porque a internet piscou — na frente do cliente.
 *
 * Nenhum estado aqui bloqueia nada: o formulário continua editável em todos.
 */
export function AvisoCep({ estado, endereco, divergencias, onUsarDoCep }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  if (estado === 'ocioso' || estado === 'invalido') {
    // `invalido` = ainda não são 8 dígitos. A máscara do campo já mostra isso;
    // acusar "CEP inválido" enquanto ele digita seria brigar com o dedo dele.
    return null;
  }

  if (estado === 'consultando') {
    return (
      <View style={styles.linha}>
        <ActivityIndicator size="small" color={cores.onSurfaceMuted} />
        <Text style={styles.linhaTexto}>Buscando o endereço...</Text>
      </View>
    );
  }

  if (estado === 'nao_encontrado') {
    return (
      <View style={styles.linha} accessibilityRole="alert">
        <MaterialCommunityIcons name="map-marker-question-outline" size={15} color={cores.warning} />
        <Text style={[styles.linhaTexto, { color: cores.onSurface }]}>
          Esse CEP não existe nos Correios. Vale conferir o número com o cliente — ou preencher o endereço à mão.
        </Text>
      </View>
    );
  }

  if (estado === 'indisponivel') {
    return (
      <View style={styles.linha} accessibilityRole="alert">
        <MaterialCommunityIcons name="wifi-off" size={15} color={cores.onSurfaceMuted} />
        <Text style={styles.linhaTexto}>
          Não consegui consultar o CEP agora. Pode preencher o endereço à mão — o cadastro salva do mesmo jeito.
        </Text>
      </View>
    );
  }

  // estado === 'ok'
  if (!endereco) return null;

  // O bairro não tem campo próprio no cadastro de cliente (ver `types.Cliente`),
  // e some se não for dito aqui. Mostrar o que foi achado também é o que permite
  // ele PERCEBER um CEP digitado errado que, por azar, existe.
  const resumo = [endereco.bairro, `${endereco.cidade}/${endereco.uf}`].filter(Boolean).join(' · ');

  return (
    <View style={styles.card}>
      <View style={styles.linha}>
        <MaterialCommunityIcons name="map-marker-check-outline" size={15} color={cores.success} />
        <Text style={[styles.linhaTexto, { color: cores.onSurface }]}>
          {endereco.logradouro ? `${endereco.logradouro} — ${resumo}` : resumo}
          {endereco.logradouro ? ' · falta só o número.' : ''}
        </Text>
      </View>

      {divergencias.length > 0 && (
        <View style={styles.divergencia} accessibilityRole="alert">
          <Text style={styles.divergenciaTexto}>
            {divergencias.map(d => `${d.rotulo}: você escreveu "${d.seu}", o CEP diz "${d.doCep}"`).join('. ')}.
            {' '}Não mudei nada — você decide.
          </Text>
          {onUsarDoCep && (
            <OlliPressable onPress={onUsarDoCep} style={styles.botao} accessibilityLabel="Usar os dados do CEP">
              <Text style={styles.botaoTexto}>Usar o do CEP</Text>
            </OlliPressable>
          )}
        </View>
      )}
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  card: { gap: 8, marginBottom: Spacing.sm },
  linha: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: Spacing.sm },
  linhaTexto: { flex: 1, fontSize: 12, lineHeight: 16, color: c.onSurfaceVariant },
  divergencia: {
    backgroundColor: c.warningLight,
    borderWidth: 1,
    borderColor: comAlfa(c.warning, 0.35),
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: 10,
  },
  divergenciaTexto: { fontSize: 12, lineHeight: 17, color: c.onSurface },
  // 44px de altura de toque (regra da casa) — dedo de luva, tela no sol.
  botao: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: c.warning,
  },
  botaoTexto: { fontSize: 13, fontWeight: '800', color: c.warning },
});
