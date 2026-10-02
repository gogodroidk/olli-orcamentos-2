import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, Linking, RefreshControl, TouchableOpacity, Platform } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { vibrar } from '../utils/haptico';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, textoSobre, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { OlliPressable } from '../components/OlliPressable';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';
import { formatDate } from '../utils/date';
import type { PlanoId } from '../services/planos';
import { PRECO_EMPRESA, PRECO_PRO, reais } from '../services/precosPlanos';
import { PixPlanoModal } from '../components/PixPlanoModal';
import { chavePixPlano, criarPixPlano, pixPlanoDisponivel, type CobrancaPixPlano } from '../services/pixPlano';
import { ESTADO_PLAY_BILLING, gerenciarAssinaturaNaPlay } from '../services/playBilling';
import { urlGerenciarNaPlay } from '../services/playBillingRegras';
import { PLANOS_BASE } from '../services/planosBase';
import { ANDROID_PACKAGE } from '../config';
import {
  lerResumoAssinatura,
  getFaturas,
  getMetodoPagamento,
  getAssinaturaNaPlay,
  abrirPortalAssinatura,
  type AssinaturaNaPlay,
  type LeituraAssinatura,
  type Fatura,
  type MetodoPagamento,
} from '../services/assinatura';
import {
  linhaValidade,
  mostraPortalStripe,
  pilulaAssinatura,
  rotuloMetodo,
  temCobranca,
  type TomPilula,
} from '../services/assinaturaTextos';
import { BUILD_PLAY_SEM_COMPRA_EXTERNA, COMPRA_NO_APP } from '../config/loja';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * iOS (Guideline 3.1.1): gerenciar uma assinatura JÁ existente (cancelar, ver
 * método de pagamento, baixar recibo) é tolerado mesmo sem StoreKit — não é
 * uma compra nova, então o botão que abre o Portal da Stripe continua ativo
 * aqui. O que não pode é ANUNCIAR troca/upgrade de plano por esse caminho —
 * isso lê como oferta de compra por fora do app. Por isso a dica abaixo do
 * botão não menciona "trocar de plano" no iOS (`ANUNCIA_TROCA_PLANO`; o
 * Portal em si é da Stripe e foge do nosso controle, mas nosso próprio texto
 * não precisa convidar).
 * O card de upsell do plano Grátis (mais abaixo) é outra história: para quem
 * ainda NÃO paga, ele oferece assinar o Pro — isso É uma compra nova. No iOS
 * ele perde a moldura de venda (`COMPRA_NO_APP`, mesmo interruptor de
 * PlanosScreen/ContaScreen): sem "assinando o Pro...", e o botão vira "Ver os
 * planos" (ainda navega para dentro do app — não é link-out).
 */
const ANUNCIA_TROCA_PLANO = Platform.OS !== 'ios';
// `COMPRA_NO_APP` (iOS sem StoreKit: o upsell do Grátis não oferece assinar) e
// `BUILD_PLAY_SEM_COMPRA_EXTERNA` (Android da Play: sem portal externo nem upsell;
// status e recibos seguem visíveis) vêm de config/loja.ts — flag única do app.
/** Este binário sabe vender pela própria Google Play (mesmo interruptor da
 * PlanosScreen; o servidor ainda pode desligar a venda — a tela de Planos diz).
 * Só muda o upsell do Grátis: leva à tela de Planos, onde a compra é pela Play. */
const VENDA_PELA_PLAY = ESTADO_PLAY_BILLING === 'ligado';

/** O que o Pro oferece, da tabela única (`planosBase.ts`) — nunca escrito aqui.
 * Sem o "Tudo do plano Grátis" (o card já diz que a pessoa está no Grátis). */
const BENEFICIOS_PRO: readonly string[] =
  (PLANOS_BASE.find((p) => p.id === 'pro')?.beneficios ?? []).filter((b) => b !== 'Tudo do plano Grátis');

const PLANO_LABEL: Record<PlanoId, string> = { gratis: 'Grátis', pro: 'Pro', empresa: 'Empresa' };

const PLANO_ICONE: Record<PlanoId, string> = {
  gratis: 'rocket-launch-outline',
  pro: 'crown-outline',
  empresa: 'office-building-outline',
};

/** Cor do tema para o tom da pílula (o texto vem de `pilulaAssinatura`). */
function corDoTom(tom: TomPilula, c: Cores): string {
  switch (tom) {
    case 'sucesso': return c.success;
    case 'destaque': return c.accentLight;
    case 'aviso': return c.warning;
    case 'perigo': return c.danger;
    default: return c.onSurfaceMuted;
  }
}

/** Rótulo pt-BR do status de uma fatura. */
function statusFaturaInfo(f: Fatura, c: Cores): { label: string; cor: string } {
  if (f.pago || f.status === 'paid') return { label: 'Paga', cor: c.success };
  if (f.status === 'open') return { label: 'Em aberto', cor: c.warning };
  if (f.status === 'void') return { label: 'Anulada', cor: c.onSurfaceMuted };
  if (f.status === 'uncollectible') return { label: 'Não recebida', cor: c.danger };
  if (f.status === 'draft') return { label: 'Rascunho', cor: c.onSurfaceMuted };
  return { label: f.status ?? '—', cor: c.onSurfaceMuted };
}

/** Formata centavos numa moeda ISO como valor pt-BR (ex.: 3900,'brl' → "R$ 39,00"). */
function formatarValor(centavos: number, moeda: string): string {
  const valor = (centavos || 0) / 100;
  try {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: (moeda || 'brl').toUpperCase() });
  } catch {
    // Moeda não reconhecida pelo Intl: cai num formato simples com o código.
    return `${(moeda || '').toUpperCase()} ${valor.toFixed(2)}`;
  }
}

/** epoch ms → data pt-BR (DD/MM/AAAA), ou '' se ausente/ inválido. */
function formatarDataMs(ms: number | null): string {
  if (typeof ms !== 'number' || !isFinite(ms)) return '';
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
}

function sufixoIntervalo(intervalo: Fatura['intervalo']): string {
  if (intervalo === 'month') return ' / mês';
  if (intervalo === 'year') return ' / ano';
  return '';
}

/** Nome amigável da bandeira do cartão. */
function nomeBandeira(brand: string | null): string {
  if (!brand) return 'Cartão';
  const map: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
    elo: 'Elo',
    hipercard: 'Hipercard',
    discover: 'Discover',
    diners: 'Diners Club',
    jcb: 'JCB',
    unionpay: 'UnionPay',
  };
  return map[brand.toLowerCase()] ?? (brand.charAt(0).toUpperCase() + brand.slice(1));
}

/**
 * Cache module-level das 3 leituras (resumo + faturas + método) com TTL curto.
 * `useFocusEffect` recarrega a CADA foco da tela — inclusive troca rápida de aba
 * ou o usuário indo e voltando do menu — e faturas/método batem no worker, que
 * compartilha o MESMO balde de rate limit (10/60s por usuário) do checkout, do
 * portal e do excluir-conta. Sem esse cache, poucas aberturas em sequência
 * esgotam o balde e o botão "Gerenciar assinatura / Cancelar" passa a falhar.
 * Pull-to-refresh (`forcar: true`) sempre ignora o cache. `gerenciar()` também
 * o invalida ao abrir o Portal, porque o usuário pode voltar de lá com o estado
 * da assinatura realmente mudado (cancelou, trocou de plano).
 */
// Só leitura `ok` entra no cache: um erro não pode ficar 30 s "valendo" sem nova tentativa.
let cacheAssinatura: { leitura: LeituraAssinatura; faturas: Fatura[]; metodo: MetodoPagamento | null; play: AssinaturaNaPlay; ts: number } | null = null;
const CACHE_TTL_MS = 30_000;

export default function AssinaturaScreen() {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  // 3 estados: `null` = carregando; `ok` = resposta do servidor; `erro` = não sei
  // (com o último estado conhecido, se houver). Erro NUNCA vira "plano Grátis".
  const [leitura, setLeitura] = useState<LeituraAssinatura | null>(null);
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [metodo, setMetodo] = useState<MetodoPagamento | null>(null);
  // Assinatura vendida pela Google Play? (qualquer plataforma: quem assinou no
  // Android e abre a web precisa saber que se gerencia na Play Store.)
  const [play, setPlay] = useState<AssinaturaNaPlay>({ estado: 'indisponivel' });
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [abrindoPortal, setAbrindoPortal] = useState(false);
  // Renovar por Pix (quem pagou no Pix não tem cobrança automática).
  const [pixLigado, setPixLigado] = useState(false);
  const [cobrancaPix, setCobrancaPix] = useState<CobrancaPixPlano | null>(null);
  const [gerandoPix, setGerandoPix] = useState<'mensal' | 'anual' | null>(null);

  useEffect(() => {
    if (!COMPRA_NO_APP || BUILD_PLAY_SEM_COMPRA_EXTERNA) return;
    let vivo = true;
    pixPlanoDisponivel().then((ok) => { if (vivo) setPixLigado(ok); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  const carregar = useCallback(async (opts?: { forcar?: boolean }) => {
    if (!opts?.forcar && cacheAssinatura && Date.now() - cacheAssinatura.ts < CACHE_TTL_MS) {
      setLeitura(cacheAssinatura.leitura);
      setFaturas(cacheAssinatura.faturas);
      setMetodo(cacheAssinatura.metodo);
      setPlay(cacheAssinatura.play);
      setCarregando(false);
      return;
    }
    try {
      // As leituras são independentes — dispara em paralelo.
      const [r, f, m, pl] = await Promise.all([
        lerResumoAssinatura(),
        getFaturas(),
        getMetodoPagamento(),
        getAssinaturaNaPlay(),
      ]);
      cacheAssinatura = r.estado === 'ok' ? { leitura: r, faturas: f, metodo: m, play: pl, ts: Date.now() } : null;
      setLeitura(r);
      setFaturas(f);
      setMetodo(m);
      setPlay(pl);
    } catch {
      // Nenhuma leitura lança; o catch é cinto de segurança — e mesmo assim é erro,
      // não Grátis. Mantém o último estado bom que a tela já mostrava.
      setLeitura((ant) => ({
        estado: 'erro',
        ultimoBom: ant?.estado === 'ok' ? ant.resumo : ant?.estado === 'erro' ? ant.ultimoBom : undefined,
      }));
    } finally {
      setCarregando(false);
    }
  }, []);

  const tentarDeNovo = useCallback(() => {
    vibrar('selecao');
    setCarregando(true);
    void carregar({ forcar: true });
  }, [carregar]);

  // Recarrega ao focar — cobre a volta do Portal Stripe (usuário sai pro
  // navegador e volta pelo "voltar" do sistema). O cache acima decide se isso
  // vira uma leitura de rede de verdade ou só reaproveita o último resultado.
  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  async function refresh() {
    setRefreshing(true);
    await carregar({ forcar: true });
    setRefreshing(false);
  }

  async function gerenciar() {
    if (BUILD_PLAY_SEM_COMPRA_EXTERNA) return;
    vibrar('selecao');
    setAbrindoPortal(true);
    try {
      const res = await abrirPortalAssinatura();
      if (res.ok) {
        // O usuário pode voltar do Portal com a assinatura de fato mudada
        // (cancelou, trocou de cartão) — o próximo foco deve ler de novo, não
        // reaproveitar o cache.
        cacheAssinatura = null;
      } else {
        const msg =
          res.motivo === 'nao_configurado'
            ? 'O pagamento online ainda não foi configurado. Tente novamente em breve.'
            : res.motivo === 'sem_login'
              ? 'Entre na sua conta para gerenciar a assinatura.'
              : res.motivo === 'sem_assinatura'
                ? 'Você ainda não tem uma assinatura para gerenciar.'
                : 'Não consegui abrir o gerenciamento agora. Tente novamente.';
        Alert.alert('Assinatura', msg);
      }
    } finally {
      setAbrindoPortal(false);
    }
  }

  async function renovarComPix(plano: 'pro' | 'empresa', periodo: 'mensal' | 'anual') {
    if (!COMPRA_NO_APP || BUILD_PLAY_SEM_COMPRA_EXTERNA || !pixLigado || gerandoPix) return;
    vibrar('selecao');
    setGerandoPix(periodo);
    try {
      const c = await criarPixPlano(chavePixPlano(plano, periodo));
      if (!c) {
        Alert.alert('Não deu para gerar o Pix', 'Verifique sua conexão e tente de novo.');
        return;
      }
      setCobrancaPix(c);
    } finally {
      setGerandoPix(null);
    }
  }

  const aoPixPago = useCallback(() => {
    cacheAssinatura = null;
    void carregar({ forcar: true });
  }, [carregar]);

  async function abrirRecibo(f: Fatura) {
    if (!f.recibo) {
      Alert.alert('Recibo', 'Esta fatura ainda não tem um recibo disponível.');
      return;
    }
    vibrar('selecao');
    try {
      await Linking.openURL(f.recibo);
    } catch {
      Alert.alert('Ops', 'Não consegui abrir o recibo agora. Tente novamente.');
    }
  }

  const resumo = leitura?.estado === 'ok' ? leitura.resumo : leitura?.estado === 'erro' ? leitura.ultimoBom ?? null : null;
  const erroLeitura = leitura?.estado === 'erro';
  const planoEfetivo = resumo?.planoEfetivo ?? 'gratis';
  const ehPagante = planoEfetivo !== 'gratis';
  // Sem resposta do servidor e sem um plano pago conhecido, não há o que afirmar:
  // a tela mostra o erro com "Tentar de novo" — nunca "você está no Grátis" + upsell.
  const semDadoConfiavel = erroLeitura && !ehPagante;
  const pilula = resumo?.parcial
    ? { rotulo: 'Sem atualização', tom: 'neutro' as const }
    : pilulaAssinatura(resumo ?? { planoEfetivo });
  const corPilula = corDoTom(pilula.tom, cores);
  const validade = resumo ? linhaValidade(resumo) : null;
  const ultimaFatura = faturas.length > 0 ? faturas[0] : null;
  const ultimoPagamento = faturas.find(f => f.pago) ?? null;

  // "Valor e ciclo" honesto: usa a última fatura quando existe (avulso 12x pode
  // não gerar fatura); senão, cai no nome do plano (sem inventar preço).
  const precoValor =
    ultimaFatura && ultimaFatura.valorCentavos > 0
      ? formatarValor(ultimaFatura.valorCentavos, ultimaFatura.moeda)
      : planoEfetivo === 'gratis'
        ? 'R$ 0'
        : `Plano ${PLANO_LABEL[planoEfetivo]}`;
  const precoSufixo = ultimaFatura && ultimaFatura.valorCentavos > 0 ? sufixoIntervalo(ultimaFatura.intervalo) : '';

  // Pago sem cobrança automática (Pix / 12x): renova-se pagando de novo.
  const planoPago = planoEfetivo === 'pro' || planoEfetivo === 'empresa' ? planoEfetivo : null;
  const semRenovacao = !!planoPago && resumo?.origem === 'pagamento' && resumo?.renovaSozinho === false;
  const mostraRenovarPix = semRenovacao && pixLigado && COMPRA_NO_APP && !BUILD_PLAY_SEM_COMPRA_EXTERNA;
  const precoPlano = planoPago === 'empresa' ? PRECO_EMPRESA : PRECO_PRO;
  // Só quem já foi cliente da Stripe tem o que ver no portal (recibos, cartão,
  // cancelar). Concessão do admin, teste grátis, Pix e Google Play não passam por lá.
  const mostraPortal = !!resumo && mostraPortalStripe(resumo);
  const produtoPlay = play.estado === 'ok' ? play.produto : null;

  const subtituloHeader = ehPagante ? `Plano ${PLANO_LABEL[planoEfetivo]}` : 'Seu plano e cobranças';

  return (
    <View style={styles.container}>
      <GradientHeader title="Assinatura" subtitle={subtituloHeader} onBack={() => goBackOrHome(nav)} />

      <ScrollView
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={cores.accentLight} colors={[cores.accentLight]} />}
      >
        {carregando ? (
          <>
            <View style={styles.planCard}>
              <OlliSkeleton width="45%" height={18} />
              <OlliSkeleton width="60%" height={28} style={{ marginTop: 14 }} />
              <OlliSkeleton width="80%" height={13} style={{ marginTop: 10 }} />
            </View>
            <View style={[styles.card, { marginTop: Spacing.base }]}>
              <OlliSkeleton width="50%" height={14} />
              <OlliSkeleton width="90%" height={13} style={{ marginTop: 12 }} />
              <OlliSkeleton width="70%" height={13} style={{ marginTop: 8 }} />
            </View>
          </>
        ) : semDadoConfiavel ? (
          <AnimatedEntrance index={0}>
            <View style={styles.erroCard}>
              <MaterialCommunityIcons name="cloud-alert-outline" size={36} color={cores.warning} />
              <Text style={styles.erroTitulo}>Não deu para carregar sua assinatura</Text>
              <Text style={styles.erroTexto}>
                Verifique a conexão e tente de novo. Seu plano não muda por causa disso.
              </Text>
              <OlliButton
                label="Tentar de novo"
                variant="gradient"
                fullWidth
                onPress={tentarDeNovo}
                icon={<MaterialCommunityIcons name="refresh" size={18} color="#fff" />}
                style={{ marginTop: Spacing.base }}
              />
            </View>
          </AnimatedEntrance>
        ) : (
          <>
            {/* Erro com último estado conhecido: mostra o que se sabe e diz que é antigo. */}
            {erroLeitura ? (
              <View style={styles.avisoCard}>
                <MaterialCommunityIcons name="cloud-alert-outline" size={20} color={cores.warning} />
                <Text style={styles.avisoText}>
                  Não deu para atualizar agora. Mostrando o último estado conhecido neste aparelho.{' '}
                  <Text style={styles.avisoLink} onPress={tentarDeNovo}>Tentar de novo</Text>
                </Text>
              </View>
            ) : null}
            {/* CARTÃO DO PLANO */}
            <AnimatedEntrance index={0}>
              <View style={styles.planCard}>
                <View style={styles.planHead}>
                  <View style={styles.planIcon}>
                    <MaterialCommunityIcons name={PLANO_ICONE[planoEfetivo] as any} size={22} color={cores.accentLight} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.planLabel}>Seu plano</Text>
                    <Text style={styles.planName}>{PLANO_LABEL[planoEfetivo]}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: corPilula + '22', borderColor: corPilula + '55' }]}>
                    <View style={[styles.statusDot, { backgroundColor: corPilula }]} />
                    <Text style={[styles.statusText, { color: corPilula }]}>{pilula.rotulo}</Text>
                  </View>
                </View>

                <View style={styles.priceRow}>
                  <Text style={styles.priceValue}>{precoValor}</Text>
                  {precoSufixo ? <Text style={styles.pricePeriod}>{precoSufixo}</Text> : null}
                </View>
              </View>
            </AnimatedEntrance>

            {/* PAGANTE: detalhes de cobrança + gerenciar + histórico */}
            {ehPagante ? (
              <>
                {/* Piso do cache local: só o plano é conhecido — sem inventar validade nem método. */}
                {resumo && !resumo.parcial && validade ? (
                <AnimatedEntrance index={1}>
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>{temCobranca(resumo) ? 'Cobrança' : 'Acesso'}</Text>

                    <LinhaDetalhe
                      icon="calendar-clock"
                      label={validade.rotulo}
                      valor={validade.semFim ? 'Sem data de término' : validade.valorIso ? formatDate(validade.valorIso) : '—'}
                      semDivisor={!temCobranca(resumo)}
                    />
                    {temCobranca(resumo) ? (
                      <>
                        <LinhaDetalhe
                          icon="cash-check"
                          label="Último pagamento"
                          valor={ultimoPagamento && ultimoPagamento.dataMs ? formatarDataMs(ultimoPagamento.dataMs) : '—'}
                        />
                        <LinhaDetalhe
                          icon="credit-card-outline"
                          label="Método de pagamento"
                          valor={rotuloMetodo(resumo, metodo && metodo.last4 ? `${nomeBandeira(metodo.brand)} •••• ${metodo.last4}` : null)}
                          semDivisor
                        />
                      </>
                    ) : (
                      <Text style={styles.gerenciarHint}>
                        {resumo.origem === 'trial'
                          ? 'O teste não cobra nada e não vira assinatura sozinho. Quando acabar, você volta ao Grátis sem perder dados.'
                          : 'Este plano foi liberado pela equipe OLLI.'}
                      </Text>
                    )}
                  </View>
                </AnimatedEntrance>
                ) : null}

                {mostraRenovarPix && planoPago ? (
                  <AnimatedEntrance index={2}>
                    <View style={[styles.card, { marginTop: Spacing.base }]}>
                      <Text style={styles.cardTitle}>Renovar com Pix</Text>
                      <Text style={styles.gerenciarHint}>
                        O pagamento por Pix não renova sozinho. Renove antes do vencimento — os dias que faltam não se perdem.
                      </Text>
                      <OlliButton
                        label={`Renovar 1 mês — ${reais(precoPlano.mensalCentavos)}`}
                        variant="gradient"
                        fullWidth
                        loading={gerandoPix === 'mensal'}
                        onPress={() => { void renovarComPix(planoPago, 'mensal'); }}
                        icon={<MaterialCommunityIcons name="qrcode" size={18} color="#fff" />}
                        style={{ marginTop: Spacing.base }}
                      />
                      <OlliButton
                        label={`Renovar 1 ano — ${reais(precoPlano.anualCentavos)}`}
                        variant="outline"
                        fullWidth
                        loading={gerandoPix === 'anual'}
                        onPress={() => { void renovarComPix(planoPago, 'anual'); }}
                        style={{ marginTop: Spacing.sm }}
                      />
                    </View>
                  </AnimatedEntrance>
                ) : null}

                {/* Assinatura da GOOGLE PLAY: cancelar/pausar/trocar cartão é na
                    própria Play Store (é a loja gerenciando a compra que ela fez,
                    não um link-out de pagamento). Só aparece com a leitura 'ok' —
                    'indisponivel' não vira "não é da Play" nem esconde o resto. */}
                {produtoPlay ? (
                  <AnimatedEntrance index={3}>
                    <View style={[styles.card, { marginTop: Spacing.base }]}>
                      <Text style={styles.cardTitle}>Assinatura pela Google Play</Text>
                      <Text style={styles.gerenciarHint}>
                        A cobrança é feita na sua conta Google. Para cancelar, pausar ou trocar a forma de pagamento, use a Play Store.
                      </Text>
                      {/* iOS: só o texto — nenhum link para outra loja no iPhone. */}
                      {Platform.OS === 'ios' ? null : (
                      <OlliButton
                        label="Gerenciar na Google Play"
                        variant="outline"
                        fullWidth
                        onPress={() => {
                          vibrar('selecao');
                          // Android: deep link da própria Play (central de assinaturas).
                          // Web: a página de assinaturas da Play Store.
                          const abrir = Platform.OS === 'android'
                            ? gerenciarAssinaturaNaPlay(produtoPlay)
                            : Linking.openURL(urlGerenciarNaPlay(ANDROID_PACKAGE, produtoPlay)).then(() => true, () => false);
                          void abrir.then((ok) => {
                            if (!ok) Alert.alert('Google Play', 'Não consegui abrir a Play Store. Abra a Play Store › Pagamentos e assinaturas.');
                          });
                        }}
                        icon={<MaterialCommunityIcons name="google-play" size={18} color={cores.primaryLight} />}
                        style={{ marginTop: Spacing.base }}
                      />
                      )}
                    </View>
                  </AnimatedEntrance>
                ) : null}

                {mostraPortal ? (
                <AnimatedEntrance index={3}>
                  {BUILD_PLAY_SEM_COMPRA_EXTERNA ? (
                    <View style={styles.avisoCard}>
                      <MaterialCommunityIcons name="information-outline" size={20} color={cores.accentLight} />
                      <Text style={styles.avisoText}>
                        O status da assinatura e os recibos em PDF das faturas pagas ficam disponíveis aqui.
                      </Text>
                    </View>
                  ) : (
                  <>
                  <OlliButton
                    label="Gerenciar assinatura / Cancelar"
                    variant="gradient"
                    size="lg"
                    fullWidth
                    loading={abrindoPortal}
                    onPress={gerenciar}
                    icon={<MaterialCommunityIcons name="cog-outline" size={20} color="#fff" />}
                    style={{ marginTop: Spacing.base }}
                  />
                  <Text style={styles.gerenciarHint}>
                    {ANUNCIA_TROCA_PLANO
                      ? 'Você é levado ao ambiente seguro da Stripe para trocar de plano, atualizar o cartão, baixar recibos ou cancelar quando quiser.'
                      : 'Você é levado ao ambiente seguro da Stripe para atualizar o cartão, baixar recibos ou cancelar quando quiser.'}
                  </Text>
                  </>
                  )}
                </AnimatedEntrance>
                ) : null}
              </>
            ) : (
              /* GRÁTIS: explica o que ganha assinando + CTA para Planos */
              <AnimatedEntrance index={1}>
                {resumo?.planoContratado && resumo.planoContratado !== 'gratis' ? (
                  <View style={styles.avisoCard}>
                    <MaterialCommunityIcons name="information-outline" size={20} color={cores.warning} />
                    <Text style={styles.avisoText}>
                      Sua assinatura {PLANO_LABEL[resumo.planoContratado]} foi encerrada. Você voltou ao plano Grátis — seus dados continuam com você.
                    </Text>
                  </View>
                ) : null}

                <View style={styles.upsellCard}>
                  <View style={styles.upsellBadge}>
                    <MaterialCommunityIcons name="crown-outline" size={16} color={textoSobre(cores.accentLight)} />
                    <Text style={styles.upsellBadgeText}>OLLI PRO</Text>
                  </View>
                  <Text style={styles.upsellTitle}>Você está no plano Grátis</Text>
                  <Text style={styles.upsellSub}>
                    {COMPRA_NO_APP && !BUILD_PLAY_SEM_COMPRA_EXTERNA
                      ? 'Assinando o Pro, seu escritório de bolso ganha músculo:'
                      : 'O plano Pro oferece:'}
                  </Text>
                  <View style={styles.beneficios}>
                    {BENEFICIOS_PRO.map((b) => (
                      <View key={b} style={styles.beneficioRow}>
                        <MaterialCommunityIcons name="check-circle" size={17} color={cores.success} />
                        <Text style={styles.beneficioText}>{b}</Text>
                      </View>
                    ))}
                  </View>
                  {BUILD_PLAY_SEM_COMPRA_EXTERNA && !VENDA_PELA_PLAY ? (
                    <Text style={[styles.gerenciarHint, { marginTop: Spacing.base }]}>A assinatura pelo app está indisponível no momento.</Text>
                  ) : (
                    <OlliButton
                      label={COMPRA_NO_APP && !BUILD_PLAY_SEM_COMPRA_EXTERNA ? 'Ver planos e assinar' : 'Ver os planos'}
                      variant="gradient"
                      size="lg"
                      fullWidth
                      onPress={() => { vibrar('selecao'); nav.navigate('Planos'); }}
                      icon={<MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />}
                      style={{ marginTop: Spacing.base }}
                    />
                  )}
                </View>
              </AnimatedEntrance>
            )}

            {/* HISTÓRICO DE FATURAS (aparece sempre que houver faturas) */}
            {faturas.length > 0 && (
              <AnimatedEntrance index={3}>
                <Text style={styles.sectionTitle}>Histórico de faturas</Text>
                <View style={styles.faturasCard}>
                  {faturas.map((f, i) => {
                    const st = statusFaturaInfo(f, cores);
                    return (
                      <View key={f.id} style={[styles.faturaRow, i < faturas.length - 1 && styles.faturaDivider]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.faturaValor}>{formatarValor(f.valorCentavos, f.moeda)}</Text>
                          <Text style={styles.faturaData}>{formatarDataMs(f.dataMs) || 'Data indisponível'}</Text>
                        </View>
                        <View style={[styles.faturaStatus, { backgroundColor: st.cor + '22' }]}>
                          <Text style={[styles.faturaStatusText, { color: st.cor }]}>{st.label}</Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.reciboBtn, !f.recibo && styles.reciboBtnOff]}
                          onPress={() => abrirRecibo(f)}
                          disabled={!f.recibo}
                          accessibilityRole="button"
                          accessibilityLabel={BUILD_PLAY_SEM_COMPRA_EXTERNA ? 'Abrir o PDF do recibo' : 'Ver recibo'}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <MaterialCommunityIcons name="receipt" size={18} color={f.recibo ? cores.accentLight : cores.onSurfaceMuted} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
                <Text style={styles.faturasHint}>
                  {/* Android: só o PDF de fatura paga, sem citar o processador (Payments policy). */}
                  {BUILD_PLAY_SEM_COMPRA_EXTERNA
                    ? 'Toque no recibo para abrir o PDF de uma fatura paga.'
                    : 'Toque no recibo para abrir o comprovante na Stripe.'}
                </Text>
              </AnimatedEntrance>
            )}
          </>
        )}
      </ScrollView>
      <PixPlanoModal
        cobranca={cobrancaPix}
        aoFechar={() => { setCobrancaPix(null); cacheAssinatura = null; void carregar({ forcar: true }); }}
        aoPago={aoPixPago}
        aoGerarNovo={() => {
          const atual = cobrancaPix;
          setCobrancaPix(null);
          if (atual && planoPago) void renovarComPix(planoPago, atual.plano.meses >= 12 ? 'anual' : 'mensal');
        }}
      />
    </View>
  );
}

/** Linha "rótulo — valor" com ícone, usada nos detalhes de cobrança. */
function LinhaDetalhe({
  icon, label, valor, semDivisor,
}: { icon: string; label: string; valor: string; semDivisor?: boolean }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={[styles.detalheRow, !semDivisor && styles.detalheDivider]}>
      <MaterialCommunityIcons name={icon as any} size={18} color={cores.onSurfaceVariant} />
      <Text style={styles.detalheLabel}>{label}</Text>
      <Text style={styles.detalheValor} numberOfLines={1}>{valor}</Text>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },

  planCard: {
    backgroundColor: c.surfaceElevated, borderRadius: BorderRadius.xl, borderWidth: 1,
    borderColor: c.strokeGlow, padding: Spacing.base, ...sombrasDe(c).sm,
  },
  planHead: { flexDirection: 'row', alignItems: 'center' },
  planIcon: {
    width: 44, height: 44, borderRadius: BorderRadius.chip, backgroundColor: c.accentContainer,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: c.strokeGlow,
  },
  planLabel: { fontSize: 12, fontWeight: '700', color: c.onSurfaceVariant },
  planName: { fontSize: 20, fontWeight: '800', color: c.onSurface, marginTop: 1 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11.5, fontWeight: '800' },

  priceRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: Spacing.base },
  priceValue: { fontSize: 26, fontWeight: '800', color: c.accentLight },
  pricePeriod: { fontSize: 14, color: c.onSurfaceVariant, fontWeight: '600', marginLeft: 6, marginBottom: 4 },

  card: {
    backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.xl, borderWidth: 1,
    borderColor: c.outlineDark, padding: Spacing.base, marginTop: Spacing.base, ...sombrasDe(c).sm,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: c.onSurface, marginBottom: 6 },

  detalheRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  detalheDivider: { borderBottomWidth: 1, borderBottomColor: c.outline },
  detalheLabel: { flex: 1, fontSize: 13.5, color: c.onSurfaceVariant },
  detalheValor: { fontSize: 14, fontWeight: '700', color: c.onSurface, maxWidth: '55%', textAlign: 'right' },

  gerenciarHint: { fontSize: 12, color: c.onSurfaceMuted, lineHeight: 17, marginTop: 10, paddingHorizontal: 4 },

  // Upsell (grátis)
  avisoCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: c.warningLight, borderRadius: BorderRadius.lg, borderWidth: 1,
    // Borda no tom fixo do warning do handoff cockpit; sem chave semântica exata (ver rule 7).
    borderColor: 'rgba(247,178,59,0.35)', padding: Spacing.base, marginBottom: Spacing.base,
  },
  avisoText: { flex: 1, fontSize: 13, color: c.onSurface, lineHeight: 19 },
  avisoLink: { fontWeight: '800', color: c.accentLight },
  erroCard: {
    alignItems: 'center', backgroundColor: c.surfaceElevated, borderRadius: BorderRadius.xl, borderWidth: 1,
    borderColor: c.strokeGlow, padding: Spacing.lg, ...sombrasDe(c).sm,
  },
  erroTitulo: { fontSize: 17, fontWeight: '800', color: c.onSurface, marginTop: 12, textAlign: 'center' },
  erroTexto: { fontSize: 13.5, color: c.onSurfaceVariant, marginTop: 6, lineHeight: 19, textAlign: 'center' },
  upsellCard: {
    backgroundColor: c.surfaceElevated, borderRadius: BorderRadius.xl, borderWidth: 1,
    borderColor: c.strokeGlow, padding: Spacing.base, ...sombrasDe(c).sm,
  },
  upsellBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: c.accentLight, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4,
  },
  upsellBadgeText: { fontSize: 12, fontWeight: '800', color: textoSobre(c.accentLight) },
  upsellTitle: { fontSize: 17, fontWeight: '800', color: c.onSurface, marginTop: 12 },
  upsellSub: { fontSize: 13.5, color: c.onSurfaceVariant, marginTop: 4, lineHeight: 19 },
  beneficios: { marginTop: Spacing.base, gap: 10 },
  beneficioRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  beneficioText: { flex: 1, fontSize: 13.5, color: c.onSurface, lineHeight: 19 },

  // Faturas
  sectionTitle: { fontSize: 16, fontWeight: '800', color: c.onBackground, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  faturasCard: {
    backgroundColor: c.surfaceGlass, borderRadius: BorderRadius.xl, borderWidth: 1,
    borderColor: c.outlineDark, paddingHorizontal: Spacing.base, ...sombrasDe(c).sm,
  },
  faturaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  faturaDivider: { borderBottomWidth: 1, borderBottomColor: c.outline },
  faturaValor: { fontSize: 15, fontWeight: '800', color: c.onSurface },
  faturaData: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 2 },
  faturaStatus: { borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  faturaStatusText: { fontSize: 11.5, fontWeight: '800' },
  reciboBtn: {
    width: 38, height: 38, borderRadius: BorderRadius.chip, justifyContent: 'center', alignItems: 'center',
    backgroundColor: c.accentContainer, borderWidth: 1, borderColor: c.strokeGlow,
  },
  reciboBtnOff: { backgroundColor: 'transparent', borderColor: c.outline },
  faturasHint: { fontSize: 12, color: c.onSurfaceMuted, marginTop: 10, paddingHorizontal: 4 },
});
