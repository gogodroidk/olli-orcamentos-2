import React, { useCallback, useEffect, useState } from 'react';
import { registrarAtividadeUsuario } from '../services/equipe';
import { View, Text, StyleSheet, TouchableOpacity, type ViewStyle } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { vibrar } from '../utils/haptico';
import { BorderRadius, Spacing, useCores, useEstilos, comAlfa, type Cores } from '../theme';
import { OlliButton } from './OlliButton';
import { AnimatedEntrance } from './AnimatedEntrance';
import { OlliSkeleton } from './OlliSkeleton';
import {
  getEmpresa, saveEmpresa, getOrcamentosTotalAtivos, getOrcamentosAgregadoPorStatus, getRecibosPagina,
} from '../database/database';
import { onSyncAplicado } from '../services/cloudSync';
import { recarregarVerticais } from '../hooks/useVerticais';
import { usePermissao } from '../hooks/usePermissao';
import { useSyncInicial } from '../hooks/useSyncInicial';
import {
  AVISO_EXEMPLO, STATUS_JA_ENVIADO, TITULO_PRIMEIRO_ORCAMENTO,
  calcularChecklistAtivacao, contaMadura, exemploOrcamentoPara, fatosDaEmpresa, itensPrefillDoExemplo,
  mostrarCartaoPrimeiroOrcamento, totalDoExemplo, verticalDoExemplo,
  type ChecklistAtivacao, type PassoAtivacaoId,
} from '../services/ativacao';
import { VERTICAIS, VERTICAL_GERAL, ferramentasSugeridas, type VerticalId } from '../services/verticais';
import { VERTICAL_PARA_SEGMENTO } from '../services/verticalSegmento';
import { formatCurrency } from '../utils/currency';
import { track, Eventos } from '../services/analytics';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Os ofícios que a pergunta de 1 toque oferece: os especializados + "Outro serviço". */
const OFICIOS: readonly { id: VerticalId; label: string; emoji: string }[] = [
  ...VERTICAIS.map((v) => ({ id: v.id, label: v.label, emoji: v.emoji })),
  { id: VERTICAL_GERAL.id, label: 'Outro serviço', emoji: VERTICAL_GERAL.emoji },
];

/** Para onde cada passo do checklist leva. */
const DESTINO: Record<PassoAtivacaoId, keyof RootStackParamList | 'exemplo'> = {
  empresa: 'MeuNegocio',
  primeiro_envio: 'exemplo',
  pix: 'MeuNegocio',
  primeiro_recibo: 'EmitirRecibo',
};

type Leitura =
  | { estado: 'carregando' }
  | { estado: 'erro' }
  | { estado: 'pronto'; totalOrcamentos: number; temRecibo: boolean; vertical: VerticalId | undefined; checklist: ChecklistAtivacao };

/**
 * ATIVAÇÃO NA TELA DE INÍCIO (mobile e desktop do app) — dois blocos, um objetivo:
 * levar a conta nova ao primeiro orçamento ENVIADO.
 *
 *  1. "Seu primeiro orçamento em 1 minuto" — só para quem tem ZERO orçamentos.
 *     Um toque abre o editor com o exemplo do ofício já preenchido (itens e
 *     valores de referência); o prestador troca cliente e valores e envia. Sem
 *     ofício definido, a pergunta é de 1 toque e a escolha fica salva.
 *  2. Checklist de 4 passos com progresso — visível até concluir; some depois.
 *
 * Regra de ouro (3 estados): enquanto lê ou se a leitura falhar, NÃO desenha nada.
 * E o SQLite vazio antes do primeiro download da nuvem (`useSyncInicial` ainda
 * 'baixando') não é "conta nova": mostra um esqueleto "Baixando seus dados da
 * nuvem…" no lugar do convite. Download que falhou também não desenha nada (o
 * Início oferece "tentar de novo"). Conta que já trabalha (3+ orçamentos e 1
 * recibo) não vê o checklist (`contaMadura`).
 * Este bloco é um empurrão, não um dado — escondê-lo num erro não custa nada;
 * mostrar "crie o primeiro orçamento" para quem já tem 40 (erro virando vazio)
 * custaria a confiança do dono. A regra mora em services/ativacao.ts (testada).
 *
 * Só o DONO vê (conta pessoal ou `owner` da organização — quem pode assinar o
 * plano): o checklist fala do cadastro da empresa, e a escolha do ofício grava
 * nele. Papel ainda indeterminado = não mostra.
 */
export function AtivacaoInicio({ style }: { style?: ViewStyle }) {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [leitura, setLeitura] = useState<Leitura>({ estado: 'carregando' });
  const [salvandoOficio, setSalvandoOficio] = useState(false);
  const { pode, carregando: papelCarregando } = usePermissao();
  const ehDono = !papelCarregando && pode('gerenciar_faturamento');
  const { estado: download } = useSyncInicial();

  const carregar = useCallback(async () => {
    try {
      const [total, enviados, empresa, recibos] = await Promise.all([
        getOrcamentosTotalAtivos(),
        getOrcamentosAgregadoPorStatus(STATUS_JA_ENVIADO),
        getEmpresa(),
        getRecibosPagina(1, 0),
      ]);
      const checklist = calcularChecklistAtivacao(
        {
          ...fatosDaEmpresa(empresa),
          primeiroOrcamentoEnviado: enviados.contagem > 0,
          primeiroRecibo: recibos.length > 0,
        },
        { totalOrcamentos: total },
      );
      setLeitura({
        estado: 'pronto',
        totalOrcamentos: total,
        temRecibo: recibos.length > 0,
        vertical: verticalDoExemplo(empresa),
        checklist,
      });
    } catch {
      setLeitura({ estado: 'erro' });
    }
  }, []);

  useFocusEffect(useCallback(() => { void carregar(); }, [carregar]));
  // O app é local-first: num aparelho novo (ou logo depois do login) o SQLite ainda
  // está vazio quando o Início abre, e só o pull da nuvem traz os orçamentos, a
  // empresa e os recibos. Sem reler aqui, o cartão "Seu primeiro orçamento" e o
  // checklist "0 de 4" ficavam na tela de quem já tem 40 orçamentos até trocar de
  // aba — o mesmo "vazio que não é vazio" que o Início já trata com onSyncAplicado.
  useEffect(() => onSyncAplicado(() => { void carregar(); }), [carregar]);

  const abrirExemplo = useCallback((vertical: VerticalId) => {
    const exemplo = exemploOrcamentoPara(vertical);
    if (!exemplo) return;
    vibrar('selecao');
    track(Eventos.exemploAtivacaoAberto, { vertical });
    nav.navigate('NovoOrcamento', { exemploVertical: vertical, prefillItems: itensPrefillDoExemplo(exemplo) });
  }, [nav]);

  /**
   * Ofício escolhido em 1 toque: salva no cadastro (melhor esforço — é o mesmo campo
   * de "Meu negócio") e já abre o exemplo. Se salvar falhar, o exemplo abre mesmo
   * assim com o ofício escolhido; a pergunta só volta a aparecer se o prestador
   * voltar sem criar o orçamento.
   */
  const escolherOficio = useCallback(async (vertical: VerticalId) => {
    if (salvandoOficio) return;
    setSalvandoOficio(true);
    try {
      const empresa = await getEmpresa();
      if (empresa) {
        await saveEmpresa({
          ...empresa,
          verticais: [vertical],
          segmento: empresa.segmento ?? VERTICAL_PARA_SEGMENTO[vertical],
          ferramentasAtivas: empresa.ferramentasAtivas?.length ? empresa.ferramentasAtivas : ferramentasSugeridas([vertical]),
        });
        void recarregarVerticais();
      }
    } catch {
      // melhor esforço — ver comentário acima.
    } finally {
      setSalvandoOficio(false);
    }
    abrirExemplo(vertical);
  }, [salvandoOficio, abrirExemplo]);

  const irPara = useCallback((passo: PassoAtivacaoId, vertical: VerticalId | undefined, semOrcamento: boolean) => {
    vibrar('selecao');
    const destino = DESTINO[passo];
    if (destino === 'exemplo') {
      // Quem já tem rascunho vai para a lista enviar o que já fez; o exemplo é
      // para quem ainda não tem nenhum.
      if (semOrcamento && vertical) abrirExemplo(vertical);
      else nav.navigate('Orcamentos');
      return;
    }
    if (destino === 'EmitirRecibo') nav.navigate('EmitirRecibo', {});
    else nav.navigate('MeuNegocio');
  }, [nav, abrirExemplo]);

  // Telemetria do funil: o cartão "Seu primeiro orçamento" foi de fato desenhado.
  const cartaoVisivel = ehDono && leitura.estado === 'pronto' && download === 'pronto'
    && mostrarCartaoPrimeiroOrcamento(leitura.totalOrcamentos, true);
  useEffect(() => {
    if (cartaoVisivel) void registrarAtividadeUsuario('ativacao_card_visto');
  }, [cartaoVisivel]);

  if (!ehDono || leitura.estado !== 'pronto') return null;
  const { totalOrcamentos, temRecibo, vertical, checklist } = leitura;
  if (download !== 'pronto') {
    // O local só pode CRESCER com o download: quem já é conta madura aqui
    // continua madura depois — não há o que esperar. O resto espera o download.
    if (contaMadura(totalOrcamentos, temRecibo) || download === 'falhou') return null;
    return (
      <View style={[styles.card, style]} accessibilityRole="progressbar" accessibilityLabel="Baixando seus dados da nuvem">
        <Text style={styles.texto}>Baixando seus dados da nuvem…</Text>
        <OlliSkeleton width="70%" height={15} />
        <OlliSkeleton width="100%" height={6} radius={3} />
        <OlliSkeleton width="55%" height={12} />
      </View>
    );
  }
  const mostrarPrimeiro = mostrarCartaoPrimeiroOrcamento(totalOrcamentos, true);
  if (!mostrarPrimeiro && checklist.estado !== 'pendente') return null;
  const exemplo = exemploOrcamentoPara(vertical);

  return (
    <AnimatedEntrance index={0} style={style}>
      <View style={styles.wrap}>
        {mostrarPrimeiro ? (
          <View style={styles.card} accessibilityRole="summary">
            <View style={styles.head}>
              <View style={[styles.iconWrap, { backgroundColor: comAlfa(cores.accentLight, 0.14) }]}>
                <MaterialCommunityIcons name="lightning-bolt" size={18} color={cores.accentLight} accessible={false} importantForAccessibility="no" />
              </View>
              <View style={styles.textos}>
                <Text style={styles.titulo} accessibilityRole="header">{TITULO_PRIMEIRO_ORCAMENTO}</Text>
                <Text style={styles.texto}>
                  {exemplo
                    ? `Preparamos um exemplo de ${exemplo.titulo.toLowerCase()} (${formatCurrency(totalDoExemplo(exemplo))}). Troque o cliente e os valores pelos seus e envie.`
                    : 'Qual é o seu ofício? Com um toque, preparamos um orçamento de exemplo do seu serviço.'}
                </Text>
              </View>
            </View>

            {exemplo && vertical ? (
              <>
                <OlliButton
                  label="Abrir orçamento de exemplo"
                  variant="gradient"
                  size="md"
                  onPress={() => { void registrarAtividadeUsuario('ativacao_card_clicado'); abrirExemplo(vertical); }}
                  icon={<MaterialCommunityIcons name="file-document-edit-outline" size={18} color="#fff" />}
                  fullWidth
                />
                <Text style={styles.aviso}>{AVISO_EXEMPLO}</Text>
              </>
            ) : (
              <View style={styles.chips} accessibilityLabel="Escolha o seu ofício">
                {OFICIOS.map((o) => (
                  <TouchableOpacity
                    key={o.id}
                    style={styles.chip}
                    activeOpacity={0.8}
                    disabled={salvandoOficio}
                    onPress={() => {
                      void registrarAtividadeUsuario('ativacao_card_clicado');
                      void registrarAtividadeUsuario('oficio_escolhido');
                      void escolherOficio(o.id);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${o.label}. Abrir orçamento de exemplo`}
                  >
                    <Text style={styles.chipEmoji} accessible={false}>{o.emoji}</Text>
                    <Text style={styles.chipTexto} numberOfLines={1}>{o.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {checklist.estado === 'pendente' ? (
          <View style={styles.card} accessibilityRole="summary">
            <View style={styles.checklistHead}>
              <Text style={styles.titulo} accessibilityRole="header">Deixe o OLLI pronto para trabalhar</Text>
              <Text style={styles.progressoTexto}>{checklist.feitos} de {checklist.total}</Text>
            </View>
            <View
              style={styles.trilho}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: checklist.total, now: checklist.feitos }}
            >
              <View style={[styles.preenchido, { width: `${(checklist.feitos / checklist.total) * 100}%` }]} />
            </View>
            {checklist.passos.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={styles.passo}
                activeOpacity={0.8}
                disabled={p.feito}
                onPress={() => irPara(p.id, vertical, mostrarPrimeiro)}
                accessibilityRole="button"
                accessibilityState={{ checked: p.feito, disabled: p.feito }}
                accessibilityLabel={`${p.titulo}. ${p.feito ? 'Feito' : p.descricao}`}
              >
                <MaterialCommunityIcons
                  name={p.feito ? 'check-circle' : 'checkbox-blank-circle-outline'}
                  size={20}
                  color={p.feito ? cores.success : cores.onSurfaceVariant}
                  accessible={false}
                  importantForAccessibility="no"
                />
                <View style={styles.textos}>
                  <Text style={[styles.passoTitulo, p.feito && styles.passoFeito]}>{p.titulo}</Text>
                  {!p.feito ? <Text style={styles.passoDescricao}>{p.descricao}</Text> : null}
                </View>
                {!p.feito ? (
                  <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceVariant} accessible={false} importantForAccessibility="no" />
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>
    </AnimatedEntrance>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  wrap: { gap: Spacing.md },
  card: {
    backgroundColor: c.surfaceVariant,
    borderWidth: 1,
    borderColor: c.outline,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  textos: { flex: 1, gap: 3 },
  titulo: { fontSize: 15, fontWeight: '800', color: c.onSurface },
  texto: { fontSize: 13, lineHeight: 18, color: c.onSurfaceVariant },
  aviso: { fontSize: 12, lineHeight: 17, color: c.onSurfaceVariant },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    minHeight: 44,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999, borderWidth: 1, borderColor: c.strokeGlow,
    backgroundColor: c.surface,
  },
  chipEmoji: { fontSize: 15 },
  chipTexto: { fontSize: 13, fontWeight: '700', color: c.onSurface, maxWidth: 220 },
  checklistHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  progressoTexto: { fontSize: 12, fontWeight: '800', color: c.onSurfaceVariant },
  trilho: { height: 6, borderRadius: 3, backgroundColor: c.outline, overflow: 'hidden' },
  preenchido: { height: '100%', borderRadius: 3, backgroundColor: c.success },
  passo: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingVertical: 6 },
  passoTitulo: { fontSize: 14, fontWeight: '700', color: c.onSurface },
  passoFeito: { color: c.onSurfaceVariant, textDecorationLine: 'line-through' },
  passoDescricao: { fontSize: 12, lineHeight: 16, color: c.onSurfaceVariant },
});
