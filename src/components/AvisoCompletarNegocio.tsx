import React, { createContext, useContext } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { BorderRadius, Spacing, comAlfa, useCores, useEstilos, type Cores } from '../theme';
import { OlliButton } from './OlliButton';
import {
  ROTULO_CAMPO_PERFIL,
  juntarPendentes,
  type EstadoCadastroNegocio,
} from '../services/perfilOperacional';

/**
 * Estado do cadastro do negócio que as abas compartilham. Quem mede é o
 * `TabsComPerfilGuard` (AppNavigator): relê a empresa a cada foco das abas e
 * publica aqui. Quem desenha é o banner do Início, logo abaixo.
 */
export interface CadastroNegocioContexto {
  estado: EstadoCadastroNegocio;
  /** Relê o cadastro agora (botão "Tentar de novo"). */
  reler: () => void;
}

const Contexto = createContext<CadastroNegocioContexto>({
  estado: { tipo: 'carregando' },
  reler: () => {},
});

export const CadastroNegocioProvider = Contexto.Provider;

export function useCadastroNegocio(): CadastroNegocioContexto {
  return useContext(Contexto);
}

/**
 * Banner FIXO no Início: "Complete seu negócio" (decisão de 02/10/2026).
 *
 * Antes era uma parede que trocava as abas inteiras por um cartão sem saída — a
 * causa da rejeição da Play ("o login não dá acesso ao app") e de 8 contas reais
 * presas. Agora as abas ficam liberadas (Conta, Sair e Excluir conta sempre ao
 * alcance) e só gerar/enviar orçamento, PDF ou recibo exige o cadastro
 * (services/exigirCadastro.ts). O banner fica preso no rodapé do Início, por
 * cima do conteúdo e acima da barra de abas, até o cadastro ficar completo.
 *
 * Três estados, como sempre: carregando não mostra nada; erro mostra "não
 * consegui conferir" com "Tentar de novo" (nunca vira "falta preencher" nem
 * some como se estivesse tudo certo); incompleto mostra o que falta.
 */
export function AvisoCompletarNegocio() {
  const { estado, reler } = useCadastroNegocio();
  const nav = useNavigation<any>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  // "Tentar de novo" mostra o giro até a próxima resposta chegar: guarda o
  // estado em que o toque aconteceu; qualquer resposta nova (outro objeto) o
  // desliga sozinho, inclusive outro erro.
  const [relendoNoEstado, setRelendoNoEstado] = React.useState<EstadoCadastroNegocio | null>(null);
  const relendo = relendoNoEstado === estado;

  if (estado.tipo === 'carregando' || estado.tipo === 'completo') return null;

  const erro = estado.tipo === 'erro';
  const titulo = erro ? 'Não consegui conferir os dados do negócio' : 'Complete seu negócio';
  const texto = erro
    ? 'Enquanto isso, o envio de orçamentos e recibos fica parado. O resto do app funciona normalmente.'
    : `Seus orçamentos e recibos saem com esses dados. Falta: ${juntarPendentes(estado.pendentes.map(c => ROTULO_CAMPO_PERFIL[c]))}.`;

  return (
    <View pointerEvents="box-none" style={styles.camada}>
      <View style={styles.card} accessibilityRole="summary">
        <View style={styles.cabeca}>
          <View style={[styles.icone, { backgroundColor: comAlfa(erro ? cores.danger : cores.primary, 0.12) }]}>
            <MaterialCommunityIcons
              name={erro ? 'alert-circle-outline' : 'store-cog-outline'}
              size={20}
              color={erro ? cores.danger : cores.primary}
              accessible={false}
              importantForAccessibility="no"
            />
          </View>
          <View style={styles.textos}>
            <Text style={styles.titulo} accessibilityRole="header">{titulo}</Text>
            <Text style={styles.texto}>{texto}</Text>
          </View>
        </View>
        <View style={styles.botoes}>
          {erro ? (
            relendo ? (
              <ActivityIndicator color={cores.primary} />
            ) : (
              <OlliButton label="Tentar de novo" size="sm" onPress={() => { setRelendoNoEstado(estado); reler(); }} />
            )
          ) : (
            <OlliButton label="Completar agora" size="sm" onPress={() => nav.navigate('MeuNegocio')} />
          )}
        </View>
      </View>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  camada: { position: 'absolute', left: Spacing.base, right: Spacing.base, bottom: Spacing.md, zIndex: 10, alignItems: 'center' },
  card: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.outline,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  cabeca: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  icone: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  textos: { flex: 1, gap: 2 },
  titulo: { color: c.onSurface, fontWeight: '800', fontSize: 15 },
  texto: { color: c.onSurfaceVariant, fontSize: 13, lineHeight: 19 },
  botoes: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: Spacing.sm },
});
