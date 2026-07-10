import React, { useState } from 'react';
import { View, Text, StyleSheet, Linking, Alert, LayoutAnimation, Platform, UIManager } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Spacing, BorderRadius, useCores, useGradientes, useEstilos, sombrasDe, textoSobre, sobreSecundario, type Cores } from '../../theme';
import { Fonts } from '../../theme/fonts';
import { useReducedMotion } from '../../theme/motion';
import { OlliMascot } from '../OlliMascot';
import { OlliButton } from '../OlliButton';
import { OlliPressable } from '../OlliPressable';
import { AnimatedEntrance } from '../AnimatedEntrance';
import { StatusBadge } from '../StatusBadge';
import { KpiCard } from './KpiCard';
import { Tilt3D } from './Tilt3D';
import { abrirWhatsApp } from '../../utils/exportarDocumento';
import { WHATSAPP_SUPORTE } from '../../config';

/**
 * Seções da LandingScreen (página de produto para quem chega deslogado no
 * domínio). Cada seção é 100% apresentacional — nenhuma chamada de auth/rede
 * própria, nenhum estado de navegação. A LandingScreen injeta os callbacks
 * (navegar para Entrar/Planos/Ajuda/Privacidade/Termos) e decide `ehDesktop`
 * uma vez (mesmo hook `useEhDesktop` do resto do app v4).
 *
 * Reaproveita o kit existente (Colors/Gradients/Typography/Fonts, OlliMascot,
 * OlliButton, OlliPressable, AnimatedEntrance, KpiCard, StatusBadge) — nada de
 * biblioteca nova, nada de imagem externa.
 */

// ─── Links de download — CONSTANTES, preenchidas quando as fichas existirem ──
// TODO(loja): colar a URL real da ficha na Google Play quando o app for publicado.
const GOOGLE_PLAY_URL = '';
// TODO(loja): colar a URL real da ficha na App Store quando o app for publicado.
const APP_STORE_URL = '';
// TODO(loja): colar a URL de download direto do APK quando ele estiver hospedado.
const APK_DOWNLOAD_URL = '';

// WhatsApp de suporte/vendas exibido no rodapé e na CTA final. Usa a variável de
// ambiente quando configurada; cai no número informado para a landing (mesmo
// contrato de `abrirWhatsApp`: dígitos com DDI).
const WHATSAPP_LANDING = WHATSAPP_SUPORTE || '5511941727487';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Abre a URL de uma loja/APK; se ainda não configurada, avisa em vez de fingir. */
function abrirDownload(url: string, nome: string) {
  if (!url) {
    Alert.alert('Ainda não disponível', `O download pelo(a) ${nome} ainda não foi publicado. Crie sua conta pelo navegador enquanto isso.`);
    return;
  }
  Linking.openURL(url).catch(() => {
    Alert.alert('Ops', 'Não consegui abrir esse link agora. Tente novamente.');
  });
}

function falarNoWhatsApp() {
  abrirWhatsApp(WHATSAPP_LANDING, 'Olá! Vim pelo site e quero saber mais sobre o OLLI Orçamentos.').catch(() => {
    Alert.alert('Ops', 'Não consegui abrir o WhatsApp agora. Tente novamente.');
  });
}

// ─── Cabeçalho reutilizado pelas seções de conteúdo ──────────────────────────
function CabecalhoSecao({ kicker, titulo, subtitulo }: { kicker: string; titulo: string; subtitulo?: string }) {
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.cabecalho}>
      <Text style={styles.kicker}>{kicker}</Text>
      <Text style={styles.tituloSecao}>{titulo}</Text>
      {subtitulo ? <Text style={styles.subtituloSecao}>{subtitulo}</Text> : null}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TOPO — logo + CTAs de entrar/criar conta
// ═══════════════════════════════════════════════════════════════════════════
interface TopoProps {
  onEntrar: () => void;
  onCriarConta: () => void;
}

export function TopoLanding({ onEntrar, onCriarConta }: TopoProps) {
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.topoWrap}>
      <View style={styles.topoConteudo}>
        <View style={styles.topoMarca}>
          <OlliMascot size={34} float={false} pulse={false} />
          <Text style={styles.topoMarcaTexto}>OLLI</Text>
        </View>
        <View style={styles.topoAcoes}>
          <OlliPressable onPress={onEntrar} haptic={false} style={styles.topoEntrarBtn}>
            <Text style={styles.topoEntrarTexto}>Entrar</Text>
          </OlliPressable>
          <OlliButton label="Criar conta grátis" onPress={onCriarConta} variant="gradient" size="sm" haptic={false} />
        </View>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HERO
// ═══════════════════════════════════════════════════════════════════════════
interface HeroProps {
  ehDesktop: boolean;
  onCriarConta: () => void;
  onVerPlanos: () => void;
}

const PROVAS_HERO: readonly string[] = [
  'Sem cartão pra começar',
  'Cancele quando quiser',
  'Dados salvos e sincronizados na nuvem',
] as const;

export function HeroLanding({ ehDesktop, onCriarConta, onVerPlanos }: HeroProps) {
  const cores = useCores();
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);
  // Texto secundário sobre `gradientes.primary` — rebaixado por alfa só até onde
  // as DUAS pontas do gradiente ainda passam 4.5:1 (ver comentário no rodapé do
  // arquivo). Calculado uma vez e reaproveitado no subheadline e nas provas.
  const corSecundariaHero = sobreSecundario(gradientes.sobrePrimary, gradientes.primary);
  return (
    <LinearGradient colors={gradientes.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroFundo}>
      <View style={styles.heroGlow1} pointerEvents="none" />
      <View style={styles.heroGlow2} pointerEvents="none" />
      <View style={[styles.heroConteudo, ehDesktop && styles.heroConteudoDesktop]}>
        <AnimatedEntrance index={0}>
          <Text style={[styles.heroHeadline, { color: gradientes.sobrePrimary }]}>O sistema de quem trabalha na rua</Text>
        </AnimatedEntrance>
        <AnimatedEntrance index={1}>
          <Text style={[styles.heroSubheadline, { color: corSecundariaHero }]}>
            Do chamado ao recibo assinado, sem voltar pra base — orçamento, ordem de serviço, agenda e
            cobrança no celular, funcionando até sem sinal. Nascido na refrigeração, feito pra todo prestador de campo.
          </Text>
        </AnimatedEntrance>
        <AnimatedEntrance index={2}>
          <View style={[styles.heroCtas, ehDesktop && styles.heroCtasDesktop]}>
            <OlliButton
              label="Criar conta grátis"
              onPress={onCriarConta}
              variant="gradient"
              size="lg"
              haptic={false}
              icon={<MaterialCommunityIcons name="rocket-launch-outline" size={19} color={gradientes.sobreBrand} />}
            />
            <OlliButton
              label="Ver planos e preços"
              onPress={onVerPlanos}
              variant="outline"
              size="lg"
              haptic={false}
              // O botão "outline" pinta o próprio fundo com um véu translúcido
              // (accentContainer, 12-15% alfa) — aqui composto sobre gradientes.primary.
              // TANTO o ícone (prop `icon`) QUANTO o rótulo (que o OlliButton pinta com
              // `accentLight` por padrão) erram o alvo sobre esse fundo: accentLight mede
              // 1.15:1 no claro / 2.12:1 no escuro contra a ponta clara já composta com o
              // véu — reprova o rótulo (texto, 4.5:1) e o ícone (3:1). `sobrePrimary` é a
              // cor que o resto do HERO usa sobre este mesmo gradiente e passa nas duas
              // pontas nos dois modos (4.51/12.08 claro, 4.36/11.30 escuro). Sem o
              // `textStyle` o rótulo ficaria teal escuro ao lado de um ícone branco.
              textStyle={{ color: gradientes.sobrePrimary }}
              icon={<MaterialCommunityIcons name="tag-outline" size={18} color={gradientes.sobrePrimary} />}
            />
          </View>
        </AnimatedEntrance>
        <AnimatedEntrance index={3}>
          <View style={styles.heroProvas}>
            {PROVAS_HERO.map((p) => (
              <View key={p} style={styles.heroProva}>
                <MaterialCommunityIcons name="check-circle" size={15} color={cores.success} />
                <Text style={[styles.heroProvaTexto, { color: corSecundariaHero }]}>{p}</Text>
              </View>
            ))}
          </View>
        </AnimatedEntrance>
      </View>
    </LinearGradient>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PILARES — os 3 pilares de valor
// ═══════════════════════════════════════════════════════════════════════════
const PILARES = [
  {
    icone: 'file-check-outline' as const,
    titulo: 'Orçamento que aprova online',
    descricao: 'O cliente abre pelo link, revisa os itens e aprova com um toque — sem ligação, sem ida até o cliente.',
  },
  {
    icone: 'clipboard-check-outline' as const,
    titulo: 'Ordem de serviço no campo',
    descricao: 'Cada visita técnica vira uma OS com fotos, assinatura do cliente e histórico — sem papel.',
  },
  {
    icone: 'chart-box-outline' as const,
    titulo: 'Equipe e financeiro num só lugar',
    descricao: 'Agenda, técnicos, contas a receber e o que entra e sai da empresa, tudo no mesmo painel.',
  },
];

export function PilaresLanding() {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.secao}>
      <CabecalhoSecao
        kicker="POR QUE O OLLI"
        titulo="Três coisas que tiram sua empresa da planilha"
        subtitulo="Cada pilar resolve uma dor real de quem vive orçamento e serviço em campo."
      />
      <View style={styles.grade3}>
        {PILARES.map((p, i) => (
          <AnimatedEntrance key={p.titulo} index={i} style={styles.cartaoFlex}>
            <View style={styles.pilarCartao}>
              <View style={styles.pilarIconeWrap}>
                <MaterialCommunityIcons name={p.icone} size={24} color={cores.accentLight} />
              </View>
              <Text style={styles.pilarTitulo}>{p.titulo}</Text>
              <Text style={styles.pilarDescricao}>{p.descricao}</Text>
            </View>
          </AnimatedEntrance>
        ))}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMO FUNCIONA — 3 passos
// ═══════════════════════════════════════════════════════════════════════════
const PASSOS = [
  {
    icone: 'clipboard-text-outline' as const,
    titulo: 'Monte o orçamento',
    descricao: 'Escolha do catálogo de serviços e produtos — ou dite os itens por voz para a OLLI montar pra você.',
  },
  {
    icone: 'link-variant' as const,
    titulo: 'Envie o link, o cliente aprova',
    descricao: 'Ele abre pelo WhatsApp ou e-mail, revisa e aprova com um toque, direto do celular dele.',
  },
  {
    icone: 'receipt' as const,
    titulo: 'Emita o recibo e gere a OS',
    descricao: 'O pagamento vira recibo na hora; o serviço vira uma ordem de serviço pronta pro técnico ir a campo.',
  },
];

export function ComoFuncionaLanding() {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.faixaAlt}>
      <View style={styles.secao}>
        <CabecalhoSecao kicker="COMO FUNCIONA" titulo="Do orçamento à visita em 3 passos" />
        <View style={styles.grade3}>
          {PASSOS.map((p, i) => (
            <AnimatedEntrance key={p.titulo} index={i} style={styles.cartaoFlex}>
              <View style={styles.passoCartao}>
                <View style={styles.passoNumero}>
                  <Text style={styles.passoNumeroTexto}>{i + 1}</Text>
                </View>
                <MaterialCommunityIcons name={p.icone} size={26} color={cores.accentLight} style={{ marginTop: Spacing.sm }} />
                <Text style={styles.pilarTitulo}>{p.titulo}</Text>
                <Text style={styles.pilarDescricao}>{p.descricao}</Text>
              </View>
            </AnimatedEntrance>
          ))}
        </View>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK DO PRODUTO — sem imagem externa, só tema + componentes existentes
// ═══════════════════════════════════════════════════════════════════════════
export function MockProdutoLanding({ ehDesktop }: { ehDesktop: boolean }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.secao}>
      <CabecalhoSecao
        kicker="O PRODUTO"
        titulo="Assim fica o seu painel"
        subtitulo="Exemplo ilustrativo com os mesmos componentes do app — os números do seu negócio aparecem aqui assim que você começa a usar."
      />
      <View style={[styles.mockLinha, ehDesktop && styles.mockLinhaDesktop]}>
        {/* Mock 1: orçamento aprovado — janela com tilt 3D (só web, brilho da marca) */}
        <Tilt3D style={styles.cartaoFlex} intensidade={7}>
        <View style={[styles.mockJanela, ehDesktop && styles.mockJanelaGlow]}>
          <View style={styles.mockBarra}>
            {/* Bolinhas de janela (estilo macOS) — convenção fixa de semáforo
                vermelho/amarelo/verde, não status do app: NÃO mapeadas para
                c.danger/warning/success (mudariam de tom por contraste e
                quebrariam a semelhança com a barra de título real). */}
            <View style={[styles.mockBolinha, { backgroundColor: '#FF6B6B' }]} />
            <View style={[styles.mockBolinha, { backgroundColor: '#F7B23B' }]} />
            <View style={[styles.mockBolinha, { backgroundColor: '#2BD787' }]} />
            <Text style={styles.mockBarraTitulo}>Orçamento #042</Text>
          </View>
          <View style={styles.mockCorpo}>
            <View style={styles.mockOrcamentoHeader}>
              <Text style={styles.mockOrcamentoCliente}>João da Silva</Text>
              <StatusBadge status="aprovado" size="sm" />
            </View>
            <View style={styles.mockItemLinha}>
              <Text style={styles.mockItemTexto}>Visita técnica + diagnóstico</Text>
              <Text style={styles.mockItemValor}>R$ 120</Text>
            </View>
            <View style={styles.mockItemLinha}>
              <Text style={styles.mockItemTexto}>Peça de reposição</Text>
              <Text style={styles.mockItemValor}>R$ 340</Text>
            </View>
            <View style={styles.mockItemLinha}>
              <Text style={styles.mockItemTexto}>Mão de obra</Text>
              <Text style={styles.mockItemValor}>R$ 180</Text>
            </View>
            <View style={styles.mockTotalLinha}>
              <Text style={styles.mockTotalTexto}>Total</Text>
              <Text style={styles.mockTotalValor}>R$ 640</Text>
            </View>
          </View>
        </View>
        </Tilt3D>

        {/* Mock 2: painel com KPIs reais do produto — janela com tilt 3D */}
        <Tilt3D style={styles.cartaoFlex} intensidade={7}>
        <View style={[styles.mockJanela, ehDesktop && styles.mockJanelaGlow]}>
          <View style={styles.mockBarra}>
            <View style={[styles.mockBolinha, { backgroundColor: '#FF6B6B' }]} />
            <View style={[styles.mockBolinha, { backgroundColor: '#F7B23B' }]} />
            <View style={[styles.mockBolinha, { backgroundColor: '#2BD787' }]} />
            <Text style={styles.mockBarraTitulo}>Painel</Text>
          </View>
          <View style={[styles.mockCorpo, styles.mockKpiGrade]}>
            <KpiCard titulo="Receita do mês" valor="R$ 8.420" icone="cash-multiple" corIcone={cores.success} />
            <KpiCard titulo="Em aberto" valor="R$ 2.180" icone="clock-outline" corIcone={cores.warning} />
            <KpiCard titulo="Taxa de aprovação" valor="78%" icone="chart-line" corIcone={cores.primaryLight} />
          </View>
        </View>
        </Tilt3D>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PLANOS — preview com preços reais (fonte: src/screens/PlanosScreen.tsx)
// ═══════════════════════════════════════════════════════════════════════════
interface PlanoPreview {
  id: 'gratis' | 'pro' | 'empresa';
  nome: string;
  preco: string;
  periodo: string;
  tagline: string;
  bullets: string[];
  destaque?: boolean;
  icone: keyof typeof MaterialCommunityIcons.glyphMap;
}

// Mesmos valores de src/screens/PlanosScreen.tsx (PLANOS_BASE) — manter
// sincronizado com a tela de Planos, que é a fonte de verdade do checkout.
const PLANOS_PREVIEW: PlanoPreview[] = [
  {
    id: 'gratis',
    nome: 'Grátis',
    preco: 'R$ 0',
    periodo: '',
    tagline: 'Tudo pra começar a fechar negócio.',
    icone: 'rocket-launch-outline',
    bullets: ['Orçamentos e recibos ilimitados', 'Clientes e agenda', 'Diagnóstico offline por código de erro', 'Link do orçamento para o cliente'],
  },
  {
    id: 'pro',
    nome: 'Pro',
    preco: 'R$ 39',
    periodo: '/mês',
    destaque: true,
    tagline: 'Pra vender mais e ganhar tempo.',
    icone: 'crown-outline',
    bullets: ['Tudo do Grátis', 'Relatórios de faturamento e conversão', 'Metas de vendas por período', 'Suporte prioritário no WhatsApp'],
  },
  {
    id: 'empresa',
    nome: 'Empresa',
    preco: 'R$ 99',
    periodo: '/mês',
    tagline: 'Pra equipes que atendem em campo todos os dias.',
    icone: 'office-building-outline',
    // Os 3 recursos de equipe ainda não existem — mesmo rótulo "(em breve)" da
    // fonte de verdade (PlanosScreen.tsx PLANOS_BASE), pra não vender como
    // pronto o que o checkout já avisa que ainda está chegando.
    bullets: ['Tudo do Pro', 'Vários técnicos e permissões por papel (em breve)', 'Equipe ao vivo no mapa (em breve)', 'Painel de gestão da equipe (em breve)'],
  },
];

interface PlanosProps {
  onEscolherGratis: () => void;
  onVerPlano: () => void;
}

export function PlanosLanding({ onEscolherGratis, onVerPlano }: PlanosProps) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.faixaAlt}>
      <View style={styles.secao}>
      <CabecalhoSecao
        kicker="PLANOS"
        titulo="Comece grátis. Cresça quando quiser."
        subtitulo="Mensal, anual com 20% de desconto ou 12x sem juros no cartão (Pro). Sem fidelidade."
      />
      <View style={styles.grade3}>
        {PLANOS_PREVIEW.map((p, i) => (
          <AnimatedEntrance key={p.id} index={i} style={styles.cartaoFlex}>
            <View style={[styles.planoCartao, p.destaque && styles.planoCartaoDestaque]}>
              {p.destaque ? (
                <View style={styles.planoPopular}><Text style={styles.planoPopularTexto}>MAIS POPULAR</Text></View>
              ) : null}
              <View style={styles.pilarIconeWrap}>
                <MaterialCommunityIcons name={p.icone} size={22} color={cores.accentLight} />
              </View>
              <Text style={styles.planoNome}>{p.nome}</Text>
              <Text style={styles.planoTagline}>{p.tagline}</Text>
              <View style={styles.planoPrecoLinha}>
                <Text style={styles.planoPreco}>{p.preco}</Text>
                {p.periodo ? <Text style={styles.planoPeriodo}>{p.periodo}</Text> : null}
              </View>
              <View style={styles.planoBullets}>
                {p.bullets.map((b) => (
                  <View key={b} style={styles.planoBulletLinha}>
                    <MaterialCommunityIcons name="check-circle" size={15} color={p.destaque ? cores.accentLight : cores.success} />
                    <Text style={styles.planoBulletTexto}>{b}</Text>
                  </View>
                ))}
              </View>
              <OlliButton
                label={p.id === 'gratis' ? 'Criar conta grátis' : `Ver plano ${p.nome}`}
                onPress={p.id === 'gratis' ? onEscolherGratis : onVerPlano}
                variant={p.destaque ? 'gradient' : 'outline'}
                size="md"
                fullWidth
                haptic={false}
                style={{ marginTop: Spacing.lg }}
              />
            </View>
          </AnimatedEntrance>
        ))}
      </View>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVA / CREDIBILIDADE — sem número inventado, só o que o produto faz
// ═══════════════════════════════════════════════════════════════════════════
const CREDIBILIDADE = [
  { icone: 'cloud-sync-outline' as const, titulo: 'Backup automático na nuvem', descricao: 'Troque de aparelho ou formate o celular: seus orçamentos e clientes continuam lá.' },
  { icone: 'shield-check-outline' as const, titulo: 'Dados isolados por empresa', descricao: 'Cada conta enxerga só os próprios dados — segurança de verdade, seguindo a LGPD.' },
  { icone: 'devices' as const, titulo: 'No celular do técnico e no PC do escritório', descricao: 'O mesmo sistema, sincronizado, nos dois lugares ao mesmo tempo.' },
  { icone: 'wifi-off' as const, titulo: 'Funciona sem internet', descricao: 'Orçamento, recibo, cliente e agenda seguem funcionando offline; sincroniza quando a rede volta.' },
];

// Segmentos atendidos — a prova de que o OLLI passou de "app de refrigeração"
// para "sistema de todo prestador de campo" (pedido do dono).
const SEGMENTOS = ['Refrigeração', 'Elétrica', 'Energia solar', 'Portões e automação', 'Manutenção predial', 'Dedetização'];

export function ProvaLanding() {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.secao}>
      <CabecalhoSecao kicker="CONFIANÇA" titulo="Feito pra rotina de quem presta serviço" />
      <View style={styles.grade4}>
        {CREDIBILIDADE.map((item, i) => (
          <AnimatedEntrance key={item.titulo} index={i} style={styles.cartaoFlex4}>
            <View style={styles.credCartao}>
              <MaterialCommunityIcons name={item.icone} size={22} color={cores.accentLight} />
              <Text style={styles.credTitulo}>{item.titulo}</Text>
              <Text style={styles.credDescricao}>{item.descricao}</Text>
            </View>
          </AnimatedEntrance>
        ))}
      </View>

      <AnimatedEntrance index={4}>
        <View style={styles.segmentosWrap}>
          <Text style={styles.segmentosTitulo}>Nasceu na refrigeração. Serve pra todo serviço de campo.</Text>
          <View style={styles.segmentosChips}>
            {SEGMENTOS.map((s) => (
              <View key={s} style={styles.segmentoChip}>
                <Text style={styles.segmentoTexto}>{s}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.segmentosRodape}>Se o serviço acontece na casa do cliente, o OLLI serve.</Text>
        </View>
      </AnimatedEntrance>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FAQ — mesmas perguntas do JSON-LD FAQPage em public/index.html
// ═══════════════════════════════════════════════════════════════════════════
export const FAQ_LANDING: readonly { pergunta: string; resposta: string }[] = [
  {
    pergunta: 'O OLLI é pago?',
    resposta: 'Não. O plano Grátis já traz orçamentos, recibos, clientes e agenda ilimitados, sem cartão de crédito e sem prazo de teste. Os planos Pro e Empresa liberam relatórios, metas e outros recursos avançados, mas o essencial do dia a dia é gratuito para sempre.',
  },
  {
    pergunta: 'Serve pra quem não é de refrigeração?',
    resposta: 'Serve. O OLLI nasceu na climatização — por isso tem PMOC, 698 códigos de defeito e diagnóstico por IA —, mas orçamento, ordem de serviço, agenda, rotas, equipe no mapa e cobrança valem pra qualquer serviço de campo: elétrica, energia solar, portões e automação, manutenção predial, dedetização e mais. Se o serviço acontece na casa do cliente, o OLLI serve.',
  },
  {
    pergunta: 'Como o cliente aprova o orçamento?',
    resposta: 'Você envia um link pelo WhatsApp ou e-mail. O cliente abre no celular dele, revisa os itens e aprova com um toque, sem precisar instalar nada. Assim que ele aprova, você já pode emitir o recibo.',
  },
  {
    pergunta: 'O OLLI funciona sem internet?',
    resposta: 'Sim. Orçamentos, recibos, clientes, agenda e o diagnóstico por código de erro funcionam offline, salvos no aparelho. Quando a internet volta, tudo sincroniza automaticamente com a nuvem.',
  },
  {
    pergunta: 'Dá para usar no computador e no celular ao mesmo tempo?',
    resposta: 'Sim. O OLLI é o mesmo sistema no navegador do computador e no aplicativo do celular, com os dados sincronizados na nuvem entre os dois.',
  },
  {
    pergunta: 'Como funciona a ordem de serviço no campo?',
    resposta: 'Cada visita técnica vira uma ordem de serviço com fotos, assinatura do cliente e histórico, sem papel. A gestão acompanha o andamento de cada técnico em tempo real.',
  },
  {
    pergunta: 'Posso cancelar minha assinatura quando quiser?',
    resposta: "Sim. Os planos Pro e Empresa são assinaturas mensais ou anuais que você cancela quando quiser direto pelo app, em 'Gerenciar assinatura'. Não há fidelidade.",
  },
  {
    pergunta: 'O plano Empresa serve para equipes com vários técnicos?',
    resposta: 'O plano Empresa já traz tudo do Pro e suporte prioritário. Os recursos de equipe — vários técnicos com permissões por papel, mapa da equipe ao vivo e painel de gestão — ainda estão chegando (em breve).',
  },
  {
    pergunta: 'Meus dados e os dos meus clientes estão seguros?',
    resposta: 'Sim. Os dados ficam isolados por empresa (cada conta só enxerga os próprios dados) e têm backup automático na nuvem, seguindo a LGPD.',
  },
];

function ItemFaq({ pergunta, resposta }: { pergunta: string; resposta: string }) {
  const [aberto, setAberto] = useState(false);
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const reduzirMovimento = useReducedMotion();

  function alternar() {
    if (!reduzirMovimento) {
      try {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      } catch {
        // best-effort: sem animação de layout, o conteúdo alterna igual
      }
    }
    setAberto((v) => !v);
  }

  return (
    <OlliPressable onPress={alternar} haptic={false} style={styles.faqItem}>
      <View style={styles.faqPergunta}>
        <Text style={styles.faqPerguntaTexto}>{pergunta}</Text>
        <MaterialCommunityIcons name={aberto ? 'chevron-up' : 'chevron-down'} size={20} color={cores.accentLight} />
      </View>
      {aberto ? <Text style={styles.faqResposta}>{resposta}</Text> : null}
    </OlliPressable>
  );
}

export function FaqLanding() {
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.faixaAlt}>
      <View style={styles.secao}>
        <CabecalhoSecao kicker="DÚVIDAS" titulo="Perguntas frequentes" />
        <View style={styles.faqLista}>
          {FAQ_LANDING.map((f) => (
            <ItemFaq key={f.pergunta} pergunta={f.pergunta} resposta={f.resposta} />
          ))}
        </View>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CTA FINAL — conversão + botões de download
// ═══════════════════════════════════════════════════════════════════════════
interface CtaFinalProps {
  onCriarConta: () => void;
}

export function CtaFinalLanding({ onCriarConta }: CtaFinalProps) {
  const cores = useCores();
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);
  // `primaryDiagonal` É `gradientes.brand` (mesmas pontas — ver criarGradientes em
  // theme/cores.ts). Texto secundário rebaixado por alfa só até onde as DUAS
  // pontas ainda passam 4.5:1 (ver comentário no rodapé do arquivo).
  const corSecundariaCta = sobreSecundario(gradientes.sobreBrand, gradientes.brand);
  return (
    <LinearGradient colors={gradientes.primaryDiagonal} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ctaFinalFundo}>
      <Text style={[styles.ctaFinalTitulo, { color: gradientes.sobreBrand }]}>Pronto pra tirar sua empresa da planilha?</Text>
      <Text style={[styles.ctaFinalSub, { color: corSecundariaCta }]}>Crie sua conta grátis agora — leva menos de 2 minutos.</Text>
      <OlliButton
        label="Criar conta grátis"
        onPress={onCriarConta}
        variant="primary"
        size="lg"
        haptic={false}
        style={styles.ctaFinalBotao}
        textStyle={{ color: cores.primaryDark }}
        icon={<MaterialCommunityIcons name="arrow-right" size={19} color={cores.primaryDark} />}
      />

      <Text style={[styles.ctaFinalBaixe, { color: corSecundariaCta }]}>ou baixe o app</Text>
      <View style={styles.ctaFinalDownloads}>
        <OlliPressable
          onPress={() => abrirDownload(GOOGLE_PLAY_URL, 'Google Play')}
          haptic={false}
          style={styles.downloadBtn}
          accessibilityLabel="Baixar na Google Play"
        >
          <MaterialCommunityIcons name="google-play" size={18} color={gradientes.sobreBrand} />
          <Text style={[styles.downloadBtnTexto, { color: gradientes.sobreBrand }]}>Google Play</Text>
        </OlliPressable>
        <OlliPressable
          onPress={() => abrirDownload(APP_STORE_URL, 'App Store')}
          haptic={false}
          style={styles.downloadBtn}
          accessibilityLabel="Baixar na App Store"
        >
          <MaterialCommunityIcons name="apple" size={19} color={gradientes.sobreBrand} />
          <Text style={[styles.downloadBtnTexto, { color: gradientes.sobreBrand }]}>App Store</Text>
        </OlliPressable>
        <OlliPressable
          onPress={() => abrirDownload(APK_DOWNLOAD_URL, 'APK direto')}
          haptic={false}
          style={styles.downloadBtn}
          accessibilityLabel="Baixar o APK"
        >
          <MaterialCommunityIcons name="android" size={19} color={gradientes.sobreBrand} />
          <Text style={[styles.downloadBtnTexto, { color: gradientes.sobreBrand }]}>Baixar APK</Text>
        </OlliPressable>
      </View>
    </LinearGradient>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RODAPÉ
// ═══════════════════════════════════════════════════════════════════════════
interface FooterProps {
  onAjuda: () => void;
  onPrivacidade: () => void;
  onTermos: () => void;
}

export function FooterLanding({ onAjuda, onPrivacidade, onTermos }: FooterProps) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.footer}>
      <View style={styles.footerTopo}>
        <View style={styles.topoMarca}>
          <OlliMascot size={28} float={false} pulse={false} />
          <Text style={styles.footerMarcaTexto}>OLLI</Text>
        </View>
        <Text style={styles.footerTagline}>Orçamentos que fecham negócio.</Text>
      </View>

      <View style={styles.footerLinks}>
        <OlliPressable onPress={onAjuda} haptic={false} style={styles.footerLink}>
          <MaterialCommunityIcons name="help-circle-outline" size={15} color={cores.onSurfaceVariant} />
          <Text style={styles.footerLinkTexto}>Ajuda</Text>
        </OlliPressable>
        <OlliPressable onPress={onPrivacidade} haptic={false} style={styles.footerLink}>
          <MaterialCommunityIcons name="lock-outline" size={15} color={cores.onSurfaceVariant} />
          <Text style={styles.footerLinkTexto}>Política de Privacidade</Text>
        </OlliPressable>
        <OlliPressable onPress={onTermos} haptic={false} style={styles.footerLink}>
          <MaterialCommunityIcons name="file-document-outline" size={15} color={cores.onSurfaceVariant} />
          <Text style={styles.footerLinkTexto}>Termos</Text>
        </OlliPressable>
        <OlliPressable onPress={falarNoWhatsApp} haptic={false} style={styles.footerLink}>
          <MaterialCommunityIcons name="whatsapp" size={15} color={cores.whatsapp} />
          <Text style={styles.footerLinkTexto}>Suporte (WhatsApp)</Text>
        </OlliPressable>
      </View>

      <Text style={styles.footerCopy}>© {new Date().getFullYear()} OLLI Orçamentos. Todos os direitos reservados.</Text>
    </View>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────
const LARGURA_MAXIMA = 1120;

/**
 * HERO e CTA FINAL ficam sobre `gradientes.primary`/`primaryDiagonal` (marca →
 * marca escura), que — como o `header` do próprio tema (ver theme/index.ts) —
 * é igual nos dois modos. `primaryDiagonal` É `gradientes.brand` (mesmas pontas,
 * ver `criarGradientes` em theme/cores.ts).
 *
 * O texto/ícone PRINCIPAL (headline, título do CTA, ícone e rótulo dos botões
 * de download) usa `gradientes.sobrePrimary`/`sobreBrand`, aplicado inline no
 * ponto de uso (a folha de estilo de escopo de módulo não enxerga o tema).
 *
 * O texto SECUNDÁRIO (`heroSubheadline`, `heroProvaTexto`, `ctaFinalSub`,
 * `ctaFinalBaixe`) media 2.7–3.4:1 contra a ponta clara do gradiente com um
 * rgba(255,255,255,alfa) fixo — reprovava AA (4.5:1). Passou a usar
 * `sobreSecundario(gradientes.sobreX, gradientes.X)`, calculado uma vez por
 * componente (`corSecundariaHero`/`corSecundariaCta`) e aplicado inline: o
 * alfa desce a partir de 0.82 só até onde as DUAS pontas do gradiente ainda
 * passam 4.5:1 — um alfa cravado não é seguro pra qualquer cor de marca.
 * O `color` correspondente SAIU destes estilos de módulo (StyleSheet não lê
 * `gradientes`) — só sobrou o resto do estilo (fonte, tamanho, margem).
 *
 * A borda de `downloadBtn` continua com rgba(255,255,255,alpha) fixo de
 * propósito: é hairline (borda), não texto — não segue a cor de contraste
 * calculada. `ctaFinalBotao` também: o pill branco sobre o gradiente é um
 * `backgroundColor`, não texto, e é o mesmo nos dois modos.
 */
const criarEstilos = (c: Cores) => StyleSheet.create({
  // Layout base de seção
  secao: {
    width: '100%',
    maxWidth: LARGURA_MAXIMA,
    alignSelf: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxxl,
  },
  // Faixa full-bleed (fundo alternado) que ENVOLVE `secao` — o filho interno
  // continua limitado a LARGURA_MAXIMA e centralizado; só a cor de fundo
  // ocupa a largura toda da viewport.
  faixaAlt: {
    width: '100%',
    backgroundColor: c.surfaceVariant,
  },
  cabecalho: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
    maxWidth: 640,
    alignSelf: 'center',
  },
  kicker: {
    fontSize: 12.5,
    fontFamily: Fonts.extraBold,
    color: c.accentLight,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  tituloSecao: {
    fontSize: 26,
    lineHeight: 32,
    fontFamily: Fonts.extraBold,
    color: c.onBackground,
    textAlign: 'center',
  },
  subtituloSecao: {
    fontSize: 14.5,
    lineHeight: 21,
    fontFamily: Fonts.regular,
    color: c.onSurfaceVariant,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  grade3: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg },
  grade4: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  cartaoFlex: { flexGrow: 1, flexBasis: 280, minWidth: 260 },
  cartaoFlex4: { flexGrow: 1, flexBasis: 230, minWidth: 220 },

  // TOPO
  topoWrap: {
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: c.outline,
    backgroundColor: c.background,
  },
  topoConteudo: {
    width: '100%',
    maxWidth: LARGURA_MAXIMA,
    alignSelf: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  topoMarca: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  topoMarcaTexto: { fontSize: 18, fontFamily: Fonts.extraBold, color: c.onBackground, letterSpacing: 1 },
  topoAcoes: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  topoEntrarBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  topoEntrarTexto: { fontSize: 14.5, fontFamily: Fonts.bold, color: c.onSurface },

  // HERO (banner — ver comentário acima; glows e texto ficam hardcoded)
  heroFundo: { width: '100%', overflow: 'hidden', paddingVertical: Spacing.xxxl, alignItems: 'center' },
  heroGlow1: { position: 'absolute', top: -100, right: -80, width: 340, height: 340, borderRadius: 170, backgroundColor: 'rgba(127,233,245,0.14)' },
  heroGlow2: { position: 'absolute', bottom: -110, left: -90, width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(52,198,217,0.10)' },
  heroConteudo: { width: '100%', maxWidth: 720, paddingHorizontal: Spacing.xl, alignItems: 'center' },
  heroConteudoDesktop: { maxWidth: 820 },
  heroHeadline: {
    fontSize: 42,
    lineHeight: 50,
    fontFamily: Fonts.extraBold,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  heroSubheadline: {
    fontSize: 16,
    lineHeight: 25,
    fontFamily: Fonts.medium,
    // cor aplicada inline no ponto de uso — ver comentário no topo da seção de estilos
    textAlign: 'center',
    marginTop: Spacing.lg,
    maxWidth: 560,
    alignSelf: 'center',
  },
  heroCtas: { flexDirection: 'column', gap: Spacing.md, marginTop: Spacing.xxl, width: '100%', alignItems: 'center' },
  heroCtasDesktop: { flexDirection: 'row', justifyContent: 'center' },
  heroProvas: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg, justifyContent: 'center', marginTop: Spacing.xxl },
  heroProva: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // cor aplicada inline no ponto de uso — ver comentário no topo da seção de estilos
  heroProvaTexto: { fontSize: 13, fontFamily: Fonts.semiBold },

  // PILARES / PASSOS (cartões)
  pilarCartao: {
    backgroundColor: c.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: c.outline,
    padding: Spacing.xl,
    height: '100%',
    gap: Spacing.sm,
  },
  pilarIconeWrap: {
    width: 46,
    height: 46,
    borderRadius: BorderRadius.md,
    backgroundColor: c.accentContainer,
    borderWidth: 1,
    borderColor: c.strokeGlow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  pilarTitulo: { fontSize: 16.5, fontFamily: Fonts.bold, color: c.onSurface },
  pilarDescricao: { fontSize: 13.5, lineHeight: 20, fontFamily: Fonts.regular, color: c.onSurfaceVariant },

  passoCartao: {
    backgroundColor: c.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: c.outline,
    padding: Spacing.xl,
    height: '100%',
    gap: Spacing.sm,
  },
  passoNumero: {
    width: 30,
    height: 30,
    borderRadius: BorderRadius.full,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sobre `c.primary` sólido (não gradiente) — `onPrimary` é a tinta correta,
  // calculada por contraste real contra a marca escolhida.
  passoNumeroTexto: { fontSize: 14, fontFamily: Fonts.extraBold, color: c.onPrimary },

  // MOCK DO PRODUTO
  mockLinha: { gap: Spacing.lg },
  mockLinhaDesktop: { flexDirection: 'row' },
  mockJanela: {
    backgroundColor: c.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: c.outline,
    overflow: 'hidden',
    ...sombrasDe(c).md,
  },
  // Brilho ciano da marca sob as janelas do produto (só desktop) — a profundidade
  // que o tilt 3D pede, dentro da identidade do app (nada de sombra industrial).
  mockJanelaGlow: {
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 34,
    elevation: 14,
  },
  mockBarra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: c.surfaceVariant,
    borderBottomWidth: 1,
    borderBottomColor: c.outline,
  },
  mockBolinha: { width: 9, height: 9, borderRadius: 5 },
  mockBarraTitulo: { fontSize: 12, fontFamily: Fonts.semiBold, color: c.onSurfaceVariant, marginLeft: Spacing.sm },
  mockCorpo: { padding: Spacing.lg, gap: Spacing.sm },
  mockOrcamentoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  mockOrcamentoCliente: { fontSize: 15, fontFamily: Fonts.bold, color: c.onSurface },
  mockItemLinha: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.outline },
  mockItemTexto: { fontSize: 13, fontFamily: Fonts.regular, color: c.onSurfaceVariant, flex: 1 },
  mockItemValor: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.onSurface },
  mockTotalLinha: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.sm },
  mockTotalTexto: { fontSize: 14, fontFamily: Fonts.bold, color: c.onSurface },
  mockTotalValor: { fontSize: 18, fontFamily: Fonts.serifBold, color: c.accentLight },
  mockKpiGrade: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },

  // PLANOS
  planoCartao: {
    backgroundColor: c.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: c.outline,
    padding: Spacing.xl,
    height: '100%',
  },
  planoCartaoDestaque: {
    borderColor: c.accentLight,
    borderWidth: 1.5,
    ...sombrasDe(c).glowCyan,
  },
  planoPopular: {
    alignSelf: 'flex-start',
    backgroundColor: c.accentLight,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: Spacing.sm,
  },
  // Era '#0A1626' fixo — falha AA no claro (3.51:1), porque `accentLight` no
  // claro é um teal ESCURO (ajustado pra contrastar com o fundo da página, não
  // pra servir de fundo de badge). `textoSobre` escolhe branco/tinta pela
  // razão de contraste real contra o próprio `accentLight`: 5.17:1 no claro,
  // 8.42:1 no escuro — os dois passam AA.
  planoPopularTexto: { fontSize: 10, fontFamily: Fonts.extraBold, color: textoSobre(c.accentLight), letterSpacing: 0.5 },
  planoNome: { fontSize: 20, fontFamily: Fonts.extraBold, color: c.onSurface, marginTop: Spacing.sm },
  planoTagline: { fontSize: 13, fontFamily: Fonts.regular, color: c.onSurfaceVariant, marginTop: 4, lineHeight: 18 },
  planoPrecoLinha: { flexDirection: 'row', alignItems: 'flex-end', marginTop: Spacing.lg },
  planoPreco: { fontSize: 30, fontFamily: Fonts.serifBold, color: c.onSurface },
  planoPeriodo: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.onSurfaceVariant, marginLeft: 6, marginBottom: 6 },
  planoBullets: { marginTop: Spacing.lg, gap: Spacing.sm },
  planoBulletLinha: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  planoBulletTexto: { flex: 1, fontSize: 13, lineHeight: 19, fontFamily: Fonts.regular, color: c.onSurface },

  // PROVA / CREDIBILIDADE
  credCartao: {
    backgroundColor: c.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: c.outline,
    padding: Spacing.lg,
    gap: 6,
    height: '100%',
  },
  credTitulo: { fontSize: 14.5, fontFamily: Fonts.bold, color: c.onSurface, marginTop: 4 },
  credDescricao: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.regular, color: c.onSurfaceVariant },

  segmentosWrap: { alignItems: 'center', marginTop: Spacing.xxl, gap: Spacing.md },
  segmentosTitulo: { fontSize: 18, fontFamily: Fonts.bold, color: c.onSurface, textAlign: 'center' },
  segmentosChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, maxWidth: 720 },
  segmentoChip: {
    backgroundColor: c.accentContainer,
    borderWidth: 1,
    borderColor: c.strokeGlow,
    borderRadius: BorderRadius.full,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  segmentoTexto: { fontSize: 13.5, fontFamily: Fonts.semiBold, color: c.accentLight },
  segmentosRodape: { fontSize: 13.5, fontFamily: Fonts.regular, color: c.onSurfaceVariant, textAlign: 'center' },

  // FAQ
  faqLista: { gap: Spacing.sm, maxWidth: 760, alignSelf: 'center', width: '100%' },
  faqItem: {
    backgroundColor: c.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: c.outline,
    padding: Spacing.lg,
  },
  faqPergunta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  faqPerguntaTexto: { flex: 1, fontSize: 14.5, fontFamily: Fonts.bold, color: c.onSurface },
  faqResposta: { fontSize: 13.5, lineHeight: 20, fontFamily: Fonts.regular, color: c.onSurfaceVariant, marginTop: Spacing.sm },

  // CTA FINAL (banner — ver comentário acima)
  ctaFinalFundo: { width: '100%', alignItems: 'center', paddingVertical: Spacing.xxxl, paddingHorizontal: Spacing.xl },
  ctaFinalTitulo: { fontSize: 26, lineHeight: 32, fontFamily: Fonts.extraBold, textAlign: 'center', maxWidth: 520 },
  // cor aplicada inline no ponto de uso — ver comentário no topo da seção de estilos
  ctaFinalSub: { fontSize: 14.5, fontFamily: Fonts.medium, textAlign: 'center', marginTop: Spacing.sm },
  ctaFinalBotao: { marginTop: Spacing.xxl, backgroundColor: '#fff' },
  // cor aplicada inline no ponto de uso — ver comentário no topo da seção de estilos
  ctaFinalBaixe: { fontSize: 12.5, fontFamily: Fonts.semiBold, marginTop: Spacing.xl, textTransform: 'uppercase', letterSpacing: 0.8 },
  ctaFinalDownloads: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, justifyContent: 'center', marginTop: Spacing.md },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  downloadBtnTexto: { fontSize: 13, fontFamily: Fonts.bold },

  // RODAPÉ
  footer: {
    width: '100%',
    backgroundColor: c.surfaceVariant,
    borderTopWidth: 1,
    borderTopColor: c.outline,
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.lg,
  },
  footerTopo: { alignItems: 'center', gap: Spacing.xs },
  footerMarcaTexto: { fontSize: 16, fontFamily: Fonts.extraBold, color: c.onBackground, letterSpacing: 1 },
  footerTagline: { fontSize: 12.5, fontFamily: Fonts.regular, color: c.onSurfaceVariant },
  footerLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg, justifyContent: 'center' },
  footerLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  footerLinkTexto: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.onSurfaceVariant },
  footerCopy: { fontSize: 11.5, fontFamily: Fonts.regular, color: c.onSurfaceMuted, textAlign: 'center' },
});
