/**
 * PALCO DO DINHEIRO PARADO — a primeira coisa que o prestador vê na Home.
 *
 * POR QUE ESTE COMPONENTE EXISTE: os radares de cobrança (`radarCobranca.ts`) e
 * de follow-up (`radarFollowUp.ts`) já calculavam certo há tempo, mas eram
 * desenhados como MAIS UM CARD ENTRE CARDS, no meio da rolagem, com o mesmo
 * peso visual de um atalho de menu. Um aviso de "R$ 800 parados há 12 dias" é a
 * informação que faz o prestador ganhar dinheiro — ela precisa de palco, não de
 * uma vaga na lista. Aqui a lógica NÃO muda (continua toda nos services): muda a
 * hierarquia (dinheiro grande, em reais, com o tempo) e a distância até a ação
 * (cobrar no WhatsApp sem navegar).
 *
 * MÉTRICAS: nada é estimado ou projetado. O total é a SOMA do que os radares já
 * devolvem (`OrcamentoParaCobrar.valor` = valorTotal do orçamento;
 * `OrcamentoParaFollowUp.orcamento.valorTotal`) e o tempo é o `diasParado` que
 * eles já calculam. Nenhuma métrica nova nasce nesta camada de apresentação.
 *
 * HONESTIDADE (P0 — "erro nunca vira vazio", e muito menos SUCESSO): cada radar
 * entra aqui com os SEUS três estados (carregando | erro | ok). Quando um deles
 * falhou, este componente jamais mostra R$ 0, jamais some com a área e jamais
 * deixa a outra metade passar por "quadro completo" — ele diz que não deu para
 * verificar e oferece o retry. "Não sei" virando "você não tem dinheiro parado"
 * é a mentira mais cara que este app poderia contar.
 *
 * MOVIMENTO: um só, funcional — o número conta até o valor (CountUp, que respeita
 * "reduzir movimento"). Sem pulso perpétuo: número piscando sem parar vira
 * ansiedade e o prestador desliga o app.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Spacing, BorderRadius, useCores, useEstilos, sombrasDe,
  achatarVeu, ajustarParaContraste, comAlfa, type Cores,
} from '../theme';
import { formatCurrency } from '../utils/currency';
import { OlliPressable } from './OlliPressable';
import { OlliSkeleton } from './OlliSkeleton';
import { CountUp } from './CountUp';
import type { OrcamentoParaCobrar } from '../services/radarCobranca';
import type { OrcamentoParaFollowUp } from '../services/radarFollowUp';

/** Quantos itens de cada radar cabem no palco antes do "ver todos". */
const MAX_LINHAS_PRINCIPAL = 3;
const MAX_LINHAS_SECUNDARIO = 2;
/** Área de toque mínima confortável (dedo em obra, celular na mão suja). */
const TOQUE_MIN = 44;

/** Os 3 estados de um radar, explícitos — nunca dois colapsados em um. */
type Estado = 'carregando' | 'erro' | 'ok';

function estadoDe(carregando: boolean, erro: boolean): Estado {
  if (carregando) return 'carregando';
  if (erro) return 'erro';
  return 'ok';
}

function dias(n: number): string {
  return `${n} ${n === 1 ? 'dia' : 'dias'}`;
}

/**
 * Tinta do palco, derivada do fundo EFETIVO.
 *
 * O palco é um véu translúcido (`warningLight`/`accentContainer`) sobre
 * `background` — e um véu âmbar puxa o fundo PARA PERTO do âmbar do texto,
 * comendo justamente o contraste do rótulo mais importante. Medido: `warning`
 * sobre o palco de alerta no modo claro cai a 4.17:1 e `accentLight` a 4.13:1
 * (o gate de contraste não pega isso, porque ele prova as superfícies OPACAS da
 * paleta, não véus). Então achatamos o véu, ficamos com um fundo opaco de
 * verdade e fazemos cada cor de primeiro plano ceder luminosidade contra ELE —
 * o mesmo remédio que o hero da HomeScreen já usa.
 */
interface Tons {
  fundo: string;
  destaque: string;
  forte: string;
  secundario: string;
  link: string;
  ok: string;
  aviso: string;
}

function criarTons(cores: Cores, veu: string, matizDestaque: string): Tons {
  const fundo = achatarVeu(cores.background, veu);
  const ajustar = (cor: string) => ajustarParaContraste(cor, fundo, 4.5);
  return {
    fundo,
    destaque: ajustar(matizDestaque),
    // `onSurface`/`onSurfaceVariant` são a tinta do tema; a variante é
    // TRANSLÚCIDA, então precisa ser achatada sobre o palco antes de medir.
    forte: ajustar(cores.onSurface),
    secundario: ajustar(achatarVeu(fundo, cores.onSurfaceVariant)),
    link: ajustar(cores.accentLight),
    ok: ajustar(cores.success),
    aviso: ajustar(cores.warning),
  };
}

interface Props {
  cobranca: OrcamentoParaCobrar[];
  cobrancaCarregando: boolean;
  cobrancaErro: boolean;
  onRecarregarCobranca: () => void | Promise<void>;
  onCobrar: (item: OrcamentoParaCobrar) => void;

  followUp: OrcamentoParaFollowUp[];
  followUpCarregando: boolean;
  followUpErro: boolean;
  onRecarregarFollowUp: () => void | Promise<void>;
  onFollowUp: (item: OrcamentoParaFollowUp) => void;

  /**
   * `false` só quando SABEMOS que ainda não existe nenhum orçamento; `null`
   * quando não deu para saber (a leitura dos KPIs falhou). Com `false` o palco
   * some por inteiro: quem nunca emitiu um orçamento não precisa ouvir "tudo
   * recebido" — é a StarterCard que conduz esse primeiro passo. Com `null`
   * NÃO escondemos nada: não saber não pode virar decisão de esconder.
   */
  temHistorico: boolean | null;

  /** Abre a lista completa de orçamentos (só aparece quando há mais do que cabe). */
  onVerTodos: () => void;
}

/** Botão de retry com feedback real: fica "Verificando…" enquanto o load roda. */
function BotaoTentarNovamente({ tons, onPress }: { tons: Tons; onPress: () => void | Promise<void> }) {
  const styles = useEstilos(criarEstilos);
  const [tentando, setTentando] = useState(false);

  const tentar = useCallback(async () => {
    if (tentando) return;
    setTentando(true);
    try {
      await onPress();
    } finally {
      setTentando(false);
    }
  }, [onPress, tentando]);

  return (
    <OlliPressable
      style={styles.retryBtn}
      onPress={tentar}
      disabled={tentando}
      haptic="selection"
      accessibilityLabel="Tentar verificar de novo"
    >
      <MaterialCommunityIcons name="refresh" size={15} color={tons.link} />
      <Text style={[styles.retryTexto, { color: tons.link }]}>{tentando ? 'Verificando…' : 'Tentar de novo'}</Text>
    </OlliPressable>
  );
}

/**
 * Aviso de radar que não pôde ser lido. O texto é explícito sobre o que o app
 * NÃO sabe — sem isso o prestador lê a ausência do número como "não tenho nada
 * a receber" e deixa dinheiro na mesa por causa de uma falha de rede.
 */
function AvisoNaoVerificado({ tons, oQue, onTentar }: { tons: Tons; oQue: string; onTentar: () => void | Promise<void> }) {
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.avisoErro}>
      <MaterialCommunityIcons name="alert-circle-outline" size={20} color={tons.aviso} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.avisoErroTitulo, { color: tons.forte }]}>Não deu para verificar {oQue}.</Text>
        <Text style={[styles.avisoErroSub, { color: tons.secundario }]}>
          Isso não quer dizer que está tudo em dia — só que não conseguimos conferir agora.
        </Text>
      </View>
      <BotaoTentarNovamente tons={tons} onPress={onTentar} />
    </View>
  );
}

/** Uma linha de aviso com a ação pronta ao lado: cobrar/chamar sem sair da tela. */
function LinhaAcao({
  nome, valor, diasParado, rotuloBotao, onPress,
}: {
  nome: string;
  valor: number;
  diasParado: number;
  rotuloBotao: string;
  onPress: () => void;
}) {
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.linha}>
      <View style={styles.linhaInfo}>
        <Text style={styles.linhaNome} numberOfLines={1}>{nome}</Text>
        <Text style={styles.linhaMeta}>{formatCurrency(valor)} · parado há {dias(diasParado)}</Text>
      </View>
      <OlliPressable
        style={styles.linhaBtn}
        onPress={onPress}
        haptic={false}
        accessibilityLabel={`${rotuloBotao} — ${nome}, ${formatCurrency(valor)} parado há ${dias(diasParado)}`}
      >
        <MaterialCommunityIcons
          name="whatsapp"
          size={16}
          color="#0A1626" // contraste-ok: sobre c.whatsapp #25D366, dark-on-green proposital (9.16:1)
        />
        <Text style={styles.linhaBtnTexto}>{rotuloBotao}</Text>
      </OlliPressable>
    </View>
  );
}

/** "+ N esperando" → abre a lista completa. */
function VerTodos({ tons, texto, onPress, rotulo }: { tons: Tons; texto: string; onPress: () => void; rotulo: string }) {
  const styles = useEstilos(criarEstilos);
  return (
    <OlliPressable style={styles.verTodos} onPress={onPress} haptic="selection" accessibilityLabel={rotulo}>
      <Text style={[styles.verTodosTexto, { color: tons.link }]}>{texto}</Text>
      <MaterialCommunityIcons name="chevron-right" size={18} color={tons.link} />
    </OlliPressable>
  );
}

export function PainelDinheiroParado({
  cobranca, cobrancaCarregando, cobrancaErro, onRecarregarCobranca, onCobrar,
  followUp, followUpCarregando, followUpErro, onRecarregarFollowUp, onFollowUp,
  temHistorico, onVerTodos,
}: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  const estadoCobranca = estadoDe(cobrancaCarregando, cobrancaErro);
  const estadoFollowUp = estadoDe(followUpCarregando, followUpErro);

  // Somas do que os radares JÁ devolvem — sem estimativa, sem projeção.
  const totalCobranca = useMemo(() => cobranca.reduce((s, i) => s + i.valor, 0), [cobranca]);
  const totalFollowUp = useMemo(
    () => followUp.reduce((s, i) => s + i.orcamento.valorTotal, 0),
    [followUp],
  );
  const maisAntigoCobranca = useMemo(
    () => cobranca.reduce((m, i) => Math.max(m, i.diasParado), 0),
    [cobranca],
  );
  const maisAntigoFollowUp = useMemo(
    () => followUp.reduce((m, i) => Math.max(m, i.diasParado), 0),
    [followUp],
  );

  // Um jogo de tons por variante de fundo — todos derivados do fundo EFETIVO.
  const tonsAlerta = useMemo(() => criarTons(cores, cores.warningLight, cores.warning), [cores]);
  const tonsAtencao = useMemo(() => criarTons(cores, cores.accentContainer, cores.accentLight), [cores]);
  const tonsNeutro = useMemo(() => criarTons(cores, cores.surfaceGlass, cores.warning), [cores]);

  const temCobranca = estadoCobranca === 'ok' && cobranca.length > 0;
  const temFollowUp = estadoFollowUp === 'ok' && followUp.length > 0;
  const algumErro = estadoCobranca === 'erro' || estadoFollowUp === 'erro';
  const algumCarregando = estadoCobranca === 'carregando' || estadoFollowUp === 'carregando';

  // ── nada conhecido ainda e nenhum erro: esqueleto NO FORMATO do palco ──
  // A condição é "ainda estou lendo ALGUMA das duas metades", não "as duas".
  // Com só uma pendente e a outra vazia não dá para dizer nada: o palco fica em
  // carregamento em vez de afirmar um "tudo em dia" que ainda não foi apurado.
  if (!temCobranca && !temFollowUp && !algumErro && algumCarregando) {
    return (
      <View style={[styles.palco, { backgroundColor: tonsNeutro.fundo, borderColor: cores.outlineDark }]}>
        <OlliSkeleton width="42%" height={12} />
        <OlliSkeleton width="58%" height={38} style={{ marginTop: 10 }} />
        <OlliSkeleton width="72%" height={13} style={{ marginTop: 8 }} />
      </View>
    );
  }

  // ── sem NENHUM item para mostrar ──────────────────────────────────────────
  if (!temCobranca && !temFollowUp) {
    // Com erro em alguma metade a área NÃO some e NÃO mostra R$ 0: aqui não há
    // item nenhum para exibir justamente porque parte da leitura falhou, e um
    // silêncio seria lido como "não tenho nada a receber".
    if (algumErro) {
      return (
        <View style={[styles.palco, { backgroundColor: tonsNeutro.fundo, borderColor: cores.outlineDark, gap: Spacing.md }]}>
          {estadoCobranca === 'erro' && (
            <AvisoNaoVerificado
              tons={tonsNeutro}
              oQue={estadoFollowUp === 'erro' ? 'seu dinheiro parado' : 'os orçamentos aprovados sem pagamento'}
              onTentar={estadoFollowUp === 'erro'
                ? async () => { await Promise.all([onRecarregarCobranca(), onRecarregarFollowUp()]); }
                : onRecarregarCobranca}
            />
          )}
          {estadoFollowUp === 'erro' && estadoCobranca !== 'erro' && (
            <AvisoNaoVerificado tons={tonsNeutro} oQue="as propostas sem resposta" onTentar={onRecarregarFollowUp} />
          )}
        </View>
      );
    }

    // ── calmo de verdade: as DUAS metades responderam e não há nada parado ──
    // Sem histórico nenhum (`false`), o palco some: quem ainda não emitiu um
    // orçamento não precisa de um "tudo recebido" sobre dinheiro que não existiu.
    // Com histórico desconhecido (`null`) NÃO escondemos — não saber não decide.
    if (temHistorico === false) return null;
    return (
      <View style={[styles.calmo, { backgroundColor: tonsNeutro.fundo }]}>
        <MaterialCommunityIcons name="check-circle-outline" size={17} color={tonsNeutro.ok} />
        <Text style={[styles.calmoTexto, { color: tonsNeutro.secundario }]} numberOfLines={2}>
          Nada parado: todo orçamento aprovado já foi recebido e nenhuma proposta está sem resposta.
        </Text>
      </View>
    );
  }

  // ── palco de alerta ──────────────────────────────────────────────────────
  // O DINHEIRO APROVADO E NÃO RECEBIDO manda no palco: o cliente já disse sim,
  // é o dinheiro mais próximo do bolso. Sem ele, quem sobe é a proposta sem
  // resposta (o degrau anterior). Um dos dois sempre existe aqui.
  const cobrancaNoTopo = temCobranca;
  const tons = cobrancaNoTopo ? tonsAlerta : tonsAtencao;
  const borda = cobrancaNoTopo ? comAlfa(cores.warning, 0.34) : comAlfa(cores.accent, 0.30);
  const restantesCobranca = Math.max(0, cobranca.length - MAX_LINHAS_PRINCIPAL);
  const limiteFollowUp = cobrancaNoTopo ? MAX_LINHAS_SECUNDARIO : MAX_LINHAS_PRINCIPAL;
  const restantesFollowUp = Math.max(0, followUp.length - limiteFollowUp);

  return (
    <View style={[styles.palco, { backgroundColor: tons.fundo, borderColor: borda }]}>
      {cobrancaNoTopo ? (
        <>
          <View style={styles.kickerRow}>
            <View style={[styles.kickerDot, { backgroundColor: tons.destaque }]} />
            <Text style={[styles.kicker, { color: tons.destaque }]}>DINHEIRO PARADO</Text>
          </View>
          <CountUp value={totalCobranca} format="currency" style={[styles.numerao, { color: tons.forte }]} duration={700} />
          <Text style={[styles.subtitulo, { color: tons.secundario }]}>
            {cobranca.length === 1
              ? `1 orçamento aprovado, sem pagamento há ${dias(maisAntigoCobranca)}`
              : `em ${cobranca.length} orçamentos aprovados · o mais antigo há ${dias(maisAntigoCobranca)}`}
          </Text>

          <View style={styles.linhas}>
            {cobranca.slice(0, MAX_LINHAS_PRINCIPAL).map(item => (
              <LinhaAcao
                key={item.orcamento.id}
                nome={item.orcamento.clienteNome}
                valor={item.valor}
                diasParado={item.diasParado}
                rotuloBotao="Cobrar no WhatsApp"
                onPress={() => onCobrar(item)}
              />
            ))}
          </View>
          {restantesCobranca > 0 && (
            <VerTodos
              tons={tons}
              texto={`+ ${restantesCobranca} aprovado${restantesCobranca > 1 ? 's' : ''} esperando pagamento`}
              rotulo="Ver todos os orçamentos"
              onPress={onVerTodos}
            />
          )}

          {/* Metade que não pôde ser lida: dita explicitamente, nunca omitida —
              senão o número acima passa por "quadro completo" sem ser. Mesma
              regra enquanto ela carrega: o palco diz que ainda está conferindo,
              em vez de deixar o silêncio significar "não há mais nada". */}
          {estadoFollowUp === 'erro' && (
            <View style={{ marginTop: Spacing.md }}>
              <AvisoNaoVerificado tons={tons} oQue="as propostas sem resposta" onTentar={onRecarregarFollowUp} />
            </View>
          )}
          {estadoFollowUp === 'carregando' && (
            <View style={styles.rodapeOk}>
              <MaterialCommunityIcons name="progress-clock" size={15} color={tons.secundario} />
              <Text style={[styles.rodapeOkTexto, { color: tons.secundario }]}>
                Conferindo as propostas sem resposta…
              </Text>
            </View>
          )}

          {temFollowUp && (
            <View style={[styles.secundario, { borderTopColor: cores.outlineDark }]}>
              <Text style={[styles.secundarioTitulo, { color: tons.forte }]}>
                {formatCurrency(totalFollowUp)} esperando resposta
                {followUp.length === 1
                  ? ` · 1 proposta parada há ${dias(maisAntigoFollowUp)}`
                  : ` · ${followUp.length} propostas, a mais antiga há ${dias(maisAntigoFollowUp)}`}
              </Text>
              <View style={styles.linhas}>
                {followUp.slice(0, limiteFollowUp).map(item => (
                  <LinhaAcao
                    key={item.orcamento.id}
                    nome={item.orcamento.clienteNome}
                    valor={item.orcamento.valorTotal}
                    diasParado={item.diasParado}
                    rotuloBotao="Chamar no WhatsApp"
                    onPress={() => onFollowUp(item)}
                  />
                ))}
              </View>
              {restantesFollowUp > 0 && (
                <VerTodos
                  tons={tons}
                  texto={`+ ${restantesFollowUp} proposta${restantesFollowUp > 1 ? 's' : ''} sem resposta`}
                  rotulo="Ver todas as propostas"
                  onPress={onVerTodos}
                />
              )}
            </View>
          )}
        </>
      ) : (
        <>
          {/* Sem dinheiro aprovado parado, o palco é da proposta sem resposta.
              Só afirmamos "nada aprovado esperando" quando a cobrança de fato
              respondeu OK — se ela falhou, o aviso abaixo assume o lugar. */}
          <View style={styles.kickerRow}>
            <View style={[styles.kickerDot, { backgroundColor: tons.destaque }]} />
            <Text style={[styles.kicker, { color: tons.destaque }]}>ESPERANDO RESPOSTA</Text>
          </View>
          <CountUp value={totalFollowUp} format="currency" style={[styles.numerao, { color: tons.forte }]} duration={700} />
          <Text style={[styles.subtitulo, { color: tons.secundario }]}>
            {followUp.length === 1
              ? `1 proposta enviada, sem resposta há ${dias(maisAntigoFollowUp)}`
              : `em ${followUp.length} propostas enviadas · a mais antiga há ${dias(maisAntigoFollowUp)}`}
          </Text>

          <View style={styles.linhas}>
            {followUp.slice(0, MAX_LINHAS_PRINCIPAL).map(item => (
              <LinhaAcao
                key={item.orcamento.id}
                nome={item.orcamento.clienteNome}
                valor={item.orcamento.valorTotal}
                diasParado={item.diasParado}
                rotuloBotao="Chamar no WhatsApp"
                onPress={() => onFollowUp(item)}
              />
            ))}
          </View>
          {restantesFollowUp > 0 && (
            <VerTodos
              tons={tons}
              texto={`+ ${restantesFollowUp} proposta${restantesFollowUp > 1 ? 's' : ''} sem resposta`}
              rotulo="Ver todas as propostas"
              onPress={onVerTodos}
            />
          )}

          {/* Três estados, nunca dois: só afirmamos "nenhum aprovado esperando"
              depois que a cobrança RESPONDEU. Enquanto ela carrega dizemos que
              ainda estamos conferindo — um "está tudo recebido" dito antes da
              resposta é a mesma mentira que dizê-lo depois de um erro. */}
          {estadoCobranca === 'erro' ? (
            <View style={{ marginTop: Spacing.md }}>
              <AvisoNaoVerificado tons={tons} oQue="os orçamentos aprovados sem pagamento" onTentar={onRecarregarCobranca} />
            </View>
          ) : estadoCobranca === 'carregando' ? (
            <View style={styles.rodapeOk}>
              <MaterialCommunityIcons name="progress-clock" size={15} color={tons.secundario} />
              <Text style={[styles.rodapeOkTexto, { color: tons.secundario }]}>
                Conferindo os orçamentos aprovados…
              </Text>
            </View>
          ) : (
            <View style={styles.rodapeOk}>
              <MaterialCommunityIcons name="check-circle-outline" size={15} color={tons.ok} />
              <Text style={[styles.rodapeOkTexto, { color: tons.secundario }]}>
                Nenhum orçamento aprovado esperando pagamento.
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  // Fundo e tinta chegam por `style` inline: são derivados do fundo EFETIVO
  // (ver `criarTons`), coisa que `criarEstilos` — que só conhece a paleta —
  // não tem como calcular.
  palco: {
    marginHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    padding: Spacing.base,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    ...sombrasDe(c).md,
  },

  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  kickerDot: { width: 8, height: 8, borderRadius: 4 },
  kicker: { fontSize: 11, fontWeight: '800' },

  // O número é o herói: grande, em reais, na tinta de maior contraste da tela.
  // Dinheiro é FATO — quem carrega a urgência é o tempo (subtítulo), não o susto.
  numerao: { fontSize: 38, lineHeight: 44, fontWeight: '800', marginTop: 6 },
  subtitulo: { fontSize: 13.5, fontWeight: '600', marginTop: 2, lineHeight: 19 },

  linhas: { marginTop: Spacing.md, gap: 8 },
  // A linha volta para uma superfície OPACA do tema: o texto dela é o par
  // padrão onSurface/onSurfaceVariant sobre `surface`, sem véu no caminho.
  linha: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: c.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: c.outline,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  linhaInfo: { flex: 1 },
  linhaNome: { fontSize: 14.5, fontWeight: '800', color: c.onSurface },
  linhaMeta: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
  linhaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: c.whatsapp, borderRadius: BorderRadius.full,
    paddingHorizontal: 14, minHeight: TOQUE_MIN,
  },
  linhaBtnTexto: { fontSize: 12.5, fontWeight: '800', color: '#0A1626' }, // contraste-ok: sobre c.whatsapp #25D366, dark-on-green proposital (9.16:1)

  verTodos: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    marginTop: 10, minHeight: TOQUE_MIN,
  },
  verTodosTexto: { fontSize: 12.5, fontWeight: '800' },

  secundario: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1 },
  secundarioTitulo: { fontSize: 13.5, fontWeight: '800', lineHeight: 19 },

  rodapeOk: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.md },
  rodapeOkTexto: { flex: 1, fontSize: 12 },

  avisoErro: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avisoErroTitulo: { fontSize: 13.5, fontWeight: '800' },
  avisoErroSub: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderWidth: 1, borderColor: c.strokeGlow, backgroundColor: c.surfacePressed,
    borderRadius: BorderRadius.full, paddingHorizontal: 12, minHeight: TOQUE_MIN,
  },
  retryTexto: { fontSize: 12.5, fontWeight: '800' },

  // Estado calmo: uma linha discreta de confirmação, não um card vazio com
  // moldura. Ele existe para dizer "conferi e está tudo em dia" — o palco só
  // ocupa espaço grande quando há dinheiro em jogo.
  calmo: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: Spacing.base, marginTop: Spacing.sm,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: c.outline,
  },
  calmoTexto: { flex: 1, fontSize: 12.5, lineHeight: 17 },
});
