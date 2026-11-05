import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Modal, ScrollView, StyleSheet, Image, Share, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, cancelAnimation } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, Spacing, Fonts, useCores, useEstilos, sombrasDe, type Cores } from '../../theme';
import { DURACAO, useReduzirMovimento } from '../../theme/motion';
import { curvas } from '../motion/curvas';
import { Aparecer } from '../motion';
import { OlliButton } from '../OlliButton';
import { OlliSkeleton } from '../OlliSkeleton';
import { DicaContextual } from '../DicaContextual';
import { SeloSync } from '../SeloSync';
import { AssinaturaClienteModal } from '../assinatura/AssinaturaClienteModal';
import { RegistrarPagamentoModal, type PagamentoForm } from '../RegistrarPagamentoModal';
import { vibrar } from '../../utils/haptico';
import { qrSvg } from '../../utils/qrcode';
import { formatCurrency } from '../../utils/currency';
import { generateId } from '../../utils/id';
import { abrirWhatsApp, exportarHtmlComoPdf } from '../../utils/exportarDocumento';
import { montarHtmlRecibo } from '../../utils/reciboPdf';
import { montarMensagemPedidoAvaliacao } from '../../utils/mensagensOrcamento';
import { linkAvaliacaoUsavel } from '../../utils/identidadeVisual';
import { retornoDoOficio } from '../../utils/posVenda';
import {
  INFO_PASSO,
  INTERVALOS_RETORNO,
  PASSOS_ENCERRAMENTO,
  dataCurtaBR,
  estadoDoPasso,
  iniciarEncerramento,
  marcarPasso,
  mensagemCobrancaEncerramento,
  mensagemResumoAtendimento,
  pixDoEncerramento,
  progressoEncerramento,
  proximoPasso,
  reabrirPasso,
  sugerirProximaVisita,
  type EncerramentoOS,
  type PassoEncerramento,
} from '../../utils/encerramentoOS';
import { getEmpresa, getOrcamento, getRecibo, getRecibosPorOrcamentoIds } from '../../database/database';
import { conferirCadastroParaEnviar, motivoEnvioSegurado } from '../../services/exigirCadastro';
import { finalizarEncerramentoOS, salvarEncerramentoOS } from '../../services/ordemServico';
import {
  getReciboDoOrcamento, marcarReciboComoPdfEmitido, registrarPagamento, totalRecebidoDoOrcamento,
} from '../../services/pagamentos';
import { saveAgendamento } from '../../services/agenda';
import { RECURSO_REMOVE_MARCA } from '../../services/planos';
import { usePlano } from '../../hooks/usePlano';
import { useVerticais } from '../../hooks/useVerticais';
import { track } from '../../services/analytics';
import type { Cliente, Empresa, Orcamento, OrdemServico, Recibo } from '../../types';

/**
 * ENCERRAR ATENDIMENTO — o fluxo de 60 segundos na casa do cliente.
 *
 * Fotos do depois → assinatura → cobrança (Pix na tela) → recibo → próxima visita
 * → pedido de avaliação. Cada passo é PULÁVEL e cada toque é gravado na OS antes
 * de seguir (SQLite primeiro; a nuvem recebe pelo espelho de sempre). Sem sinal,
 * nada se perde; se o Android matar o app, o botão da OS volta como "Continuar
 * encerramento" exatamente do ponto onde parou.
 *
 * Regras de dinheiro (iguais às do resto do app):
 *  - o Pix é do PRESTADOR (o cliente dele paga o serviço físico), gerado no
 *    aparelho, e só aparece com chave reconhecida e código conferido — nunca um QR
 *    quebrado. Não é venda de plano do OLLI: vale no APK da Play;
 *  - "pago" só quando o prestador registra, com o aviso de conferir no banco;
 *  - o recibo nasce do pagamento registrado, nunca antes (seria um documento
 *    dizendo que um dinheiro entrou sem ter entrado).
 *
 * A regra pura (passos, progresso, Pix, data da próxima visita) mora em
 * `utils/encerramentoOS.ts`; aqui só a tela e as escritas.
 */
export interface EncerrarAtendimentoModalProps {
  visivel: boolean;
  ordem: OrdemServico;
  cliente: Cliente | null;
  /** Papel com permissão de registrar pagamento/emitir recibo. */
  podeFaturar: boolean;
  /** Abre a câmera/galeria pelo caminho da OS (fila de fotos, retomada da câmera). */
  onTirarFoto: (origem: 'camera' | 'galeria') => Promise<void>;
  /** A OS mudou (encerramento gravado, OS concluída). */
  onAtualizada: (o: OrdemServico) => void;
  onFechar: () => void;
  /** Sair do fluxo para outra tela (Meu Negócio, Emitir recibo). O progresso já está gravado. */
  onNavegar: (rota: 'MeuNegocio' | 'EmitirRecibo') => void;
}

type Dados =
  | { estado: 'carregando' }
  | { estado: 'erro' }
  | { estado: 'pronto'; empresa: Empresa | null; orcamento: Orcamento | null; recibo: Recibo | null; recebido: number };

export function EncerrarAtendimentoModal({
  visivel, ordem, cliente, podeFaturar, onTirarFoto, onAtualizada, onFechar, onNavegar,
}: EncerrarAtendimentoModalProps) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const insets = useSafeAreaInsets();
  const { temAcesso } = usePlano();
  const { verticais } = useVerticais();
  const retorno = retornoDoOficio(verticais ?? []);

  const [enc, setEnc] = useState<EncerramentoOS>(() => ordem.encerramento ?? iniciarEncerramento());
  const [aberto, setAberto] = useState<PassoEncerramento | null>(() => proximoPasso(ordem.encerramento));
  const [dados, setDados] = useState<Dados>({ estado: 'carregando' });
  const [salvando, setSalvando] = useState(false);
  // Escrita que falhou: fica guardada para o "Tentar de novo" (nada se perde em silêncio).
  const [falhaSalvar, setFalhaSalvar] = useState<EncerramentoOS | null>(null);
  const [assinando, setAssinando] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erroPasso, setErroPasso] = useState<string | null>(null);
  const [meses, setMeses] = useState<number>(retorno.meses);
  const [finalizado, setFinalizado] = useState(!!ordem.encerramento?.finalizadoEm);
  const contouInicio = useRef(false);
  const retomado = useRef(!!ordem.encerramento);
  // O ofício chega depois do 1º render: o intervalo sugerido acompanha até o
  // prestador escolher um chip (aí a escolha é dele).
  const escolheuMeses = useRef(false);
  useEffect(() => {
    if (!escolheuMeses.current) setMeses(retorno.meses);
  }, [retorno.meses]);

  // ─── dados de apoio (empresa, orçamento, recibo) — 3 estados ──────────────
  const carregar = useCallback(async () => {
    // Recarga com dados na tela não pisca o esqueleto (só a 1ª leitura e o "tentar de novo").
    setDados((d) => (d.estado === 'pronto' ? d : { estado: 'carregando' }));
    try {
      const [empresa, orcamento] = await Promise.all([
        getEmpresa(),
        ordem.orcamentoId ? getOrcamento(ordem.orcamentoId) : Promise.resolve(null),
      ]);
      let recibo: Recibo | null = null;
      let recebido = 0;
      if (orcamento) {
        const recibos = await getRecibosPorOrcamentoIds([orcamento.id]);
        recebido = totalRecebidoDoOrcamento(orcamento.id, recibos);
        recibo = getReciboDoOrcamento(orcamento.id, recibos);
      }
      const idDoFluxo = ordem.encerramento?.reciboId;
      if (idDoFluxo) recibo = (await getRecibo(idDoFluxo)) ?? recibo;
      setDados({ estado: 'pronto', empresa, orcamento, recibo, recebido });
    } catch {
      setDados({ estado: 'erro' });
    }
  }, [ordem.orcamentoId, ordem.encerramento?.reciboId]);

  useEffect(() => {
    if (!visivel) return;
    void carregar();
    if (!contouInicio.current) {
      contouInicio.current = true;
      track('encerramento_aberto', { retomado: retomado.current });
    }
  }, [visivel, carregar]);

  // ─── gravação de cada passo ───────────────────────────────────────────────
  const persistir = useCallback(async (novo: EncerramentoOS): Promise<boolean> => {
    setSalvando(true);
    try {
      const o = await salvarEncerramentoOS(ordem.id, novo);
      setEnc(novo);
      setFalhaSalvar(null);
      onAtualizada(o);
      return true;
    } catch {
      vibrar('erro');
      setFalhaSalvar(novo);
      return false;
    } finally {
      setSalvando(false);
    }
  }, [ordem.id, onAtualizada]);

  async function resolver(
    passo: PassoEncerramento,
    estado: 'feito' | 'pulado',
    extra: Partial<Omit<EncerramentoOS, 'passos' | 'iniciadoEm'>> = {},
  ) {
    setErroPasso(null);
    const novo = marcarPasso(enc, passo, estado, new Date(), extra);
    if (await persistir(novo)) {
      vibrar(estado === 'feito' ? 'sucesso' : 'selecao');
      setAberto(proximoPasso(novo));
    }
  }

  async function refazer(passo: PassoEncerramento) {
    vibrar('selecao');
    const novo = reabrirPasso(enc, passo);
    if (await persistir(novo)) setAberto(passo);
  }

  const progresso = progressoEncerramento(enc);

  // ─── barra de progresso animada (só transform; "reduzir movimento" = corte seco) ──
  const reduzir = useReduzirMovimento();
  const fracao = useSharedValue(progresso.fracao);
  useEffect(() => {
    if (reduzir) { cancelAnimation(fracao); fracao.set(progresso.fracao); return; }
    fracao.set(withTiming(progresso.fracao, { duration: DURACAO.slow, easing: curvas.emphasized }));
  }, [progresso.fracao, reduzir, fracao]);
  const estiloBarra = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.001, fracao.get()) }] }));

  // ─── derivados de dinheiro ────────────────────────────────────────────────
  const pronto = dados.estado === 'pronto' ? dados : null;
  const orcamento = pronto?.orcamento ?? null;
  const empresa = pronto?.empresa ?? null;
  const valorCobrar = useMemo(() => {
    if (orcamento) return Math.max(0, Math.round(((orcamento.valorTotal || 0) - (pronto?.recebido ?? 0)) * 100) / 100);
    return typeof ordem.valor === 'number' && ordem.valor > 0 ? ordem.valor : 0;
  }, [orcamento, pronto?.recebido, ordem.valor]);
  const pix = useMemo(() => pixDoEncerramento({
    chavePix: orcamento?.chavePix || empresa?.chavePix,
    valor: valorCobrar,
    nome: empresa?.nome || empresa?.nomePrestador,
    cidade: empresa?.cidade,
    referencia: orcamento?.numero ?? ordem.numero,
  }), [orcamento, empresa, valorCobrar, ordem.numero]);
  const orcamentoAceitaPagamento = !!orcamento && (orcamento.status === 'aprovado' || orcamento.status === 'convertido');
  const jaQuitado = !!orcamento && (orcamento.valorTotal || 0) > 0 && valorCobrar <= 0;

  const telefone = cliente?.telefone?.trim() || '';
  function whats(mensagem: string, aoAbrir?: () => void) {
    abrirWhatsApp(telefone, mensagem)
      .then(() => aoAbrir?.())
      .catch(() => setErroPasso('Não consegui abrir o WhatsApp. Confira se ele está instalado e tente de novo.'));
  }

  // ─── ações dos passos ─────────────────────────────────────────────────────
  async function salvarPagamento(form: PagamentoForm) {
    if (!orcamento) throw new Error('Esta OS não tem orçamento ligado.');
    const recibo = await registrarPagamento({ orcamento, ...form });
    setRegistrando(false);
    setDados((d) => (d.estado === 'pronto' ? { ...d, recibo, recebido: d.recebido + recibo.valorRecebido } : d));
    track('encerramento_pagamento_registrado', { forma: form.formaPagamento });
    await resolver('cobranca', 'feito', { reciboId: recibo.id });
  }

  async function gerarRecibo(recibo: Recibo) {
    // Mesma porta do envio das telas (services/exigirCadastro.ts); aqui o motivo
    // aparece no próprio passo, sem abrir outra folha por cima do modal.
    const motivo = motivoEnvioSegurado(await conferirCadastroParaEnviar(), 'recibo');
    if (motivo) { setErroPasso(motivo); return; }
    if (!empresa) { setErroPasso('Cadastre os dados da sua empresa em Meu Negócio para gerar o recibo.'); return; }
    setOcupado('recibo');
    setErroPasso(null);
    try {
      const html = await montarHtmlRecibo(recibo, empresa, {
        modelo: empresa.modeloReciboPadrao,
        corMarca: empresa.corMarca,
        removerMarca: temAcesso(RECURSO_REMOVE_MARCA),
      });
      await exportarHtmlComoPdf(html, `Recibo-${recibo.numero}`, { dialogTitle: `Recibo ${recibo.numero}` });
      if (recibo.pdfEmitido === false) {
        const emitido = await marcarReciboComoPdfEmitido(recibo);
        setDados((d) => (d.estado === 'pronto' ? { ...d, recibo: emitido } : d));
      }
      await resolver('recibo', 'feito', { reciboId: recibo.id });
    } catch (e: any) {
      setErroPasso(e?.message || 'Não consegui gerar o PDF do recibo agora. O pagamento continua registrado.');
    } finally {
      setOcupado(null);
    }
  }

  async function agendarProxima() {
    if (!ordem.clienteNome?.trim()) { setErroPasso('A OS não tem cliente: agende pela Agenda.'); return; }
    setOcupado('proxima_visita');
    setErroPasso(null);
    const inicio = sugerirProximaVisita(new Date(), meses);
    const agora = new Date().toISOString();
    const id = generateId();
    const endereco = cliente
      ? [cliente.endereco, cliente.cidade, cliente.estado].map((p) => (p || '').trim()).filter(Boolean).join(', ')
      : '';
    try {
      await saveAgendamento({
        id,
        clienteId: ordem.clienteId,
        clienteNome: ordem.clienteNome,
        titulo: `Manutenção · ${ordem.titulo || 'retorno'}`.slice(0, 120),
        tipo: 'manutencao',
        inicio,
        ...(endereco ? { endereco } : {}),
        status: 'agendado',
        observacao: `Marcada no encerramento da OS ${ordem.numero}.`,
        criadoEm: agora,
        atualizadoEm: agora,
      });
      await resolver('proxima_visita', 'feito', { proximaVisitaId: id, proximaVisitaEm: inicio });
    } catch (e: any) {
      setErroPasso(e?.message || 'Não consegui salvar a visita na agenda agora.');
    } finally {
      setOcupado(null);
    }
  }

  async function concluir() {
    setSalvando(true);
    setErroPasso(null);
    const final: EncerramentoOS = { ...enc, finalizadoEm: new Date().toISOString() };
    try {
      const o = await finalizarEncerramentoOS(ordem.id, final);
      setEnc(final);
      onAtualizada(o);
      vibrar('sucesso');
      setFinalizado(true);
      track('encerramento_concluido', { feitos: progresso.feitos, pulados: progresso.pulados, total: progresso.total });
    } catch {
      vibrar('erro');
      setErroPasso('Não consegui concluir a OS no aparelho. Nada foi perdido: toque de novo em "Concluir atendimento".');
    } finally {
      setSalvando(false);
    }
  }

  // ─── conteúdo de cada passo ───────────────────────────────────────────────
  function pular(passo: PassoEncerramento, rotulo = 'Pular este passo') {
    return (
      <TouchableOpacity
        onPress={() => void resolver(passo, 'pulado')}
        style={styles.pular}
        accessibilityRole="button"
        disabled={salvando}
      >
        <Text style={styles.pularTxt}>{rotulo}</Text>
      </TouchableOpacity>
    );
  }

  function indisponivel() {
    return (
      <Text style={styles.aviso}>
        Não consegui ler os dados do aparelho para este passo.{' '}
        <Text style={styles.link} onPress={() => void carregar()}>Tentar de novo</Text>
      </Text>
    );
  }

  function conteudo(p: PassoEncerramento): React.ReactNode {
    switch (p) {
      case 'fotos': {
        const fotos = ordem.fotos ?? [];
        return (
          <>
            {fotos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {fotos.slice(-6).map((uri) => <Image key={uri} source={{ uri }} style={styles.foto} />)}
              </ScrollView>
            ) : null}
            <Text style={styles.aviso}>
              {fotos.length > 0 ? `${fotos.length} foto${fotos.length === 1 ? '' : 's'} nesta OS.` : 'Nenhuma foto ainda.'}
            </Text>
            <View style={styles.linhaBotoes}>
              <OlliButton label="Câmera" variant="outline" size="md" onPress={() => void onTirarFoto('camera')} style={{ flex: 1 }}
                icon={<MaterialCommunityIcons name="camera-plus-outline" size={18} color={cores.primary} />} />
              <OlliButton label="Galeria" variant="outline" size="md" onPress={() => void onTirarFoto('galeria')} style={{ flex: 1 }}
                icon={<MaterialCommunityIcons name="image-multiple-outline" size={18} color={cores.primary} />} />
            </View>
            <OlliButton label="Fotos prontas" variant="gradient" size="md" fullWidth disabled={fotos.length === 0 || salvando}
              onPress={() => void resolver('fotos', 'feito')} />
            {pular('fotos')}
          </>
        );
      }
      case 'assinatura':
        return (
          <>
            {enc.assinaturaClienteUri ? (
              <View style={styles.assinaturaBox}>
                <Image source={{ uri: enc.assinaturaClienteUri }} style={styles.assinatura} resizeMode="contain" />
                <Text style={styles.assinaturaNome}>{enc.assinanteNome || ordem.clienteNome}</Text>
              </View>
            ) : null}
            <OlliButton
              label={enc.assinaturaClienteUri ? 'Assinar de novo' : 'Colher a assinatura do cliente'}
              variant={enc.assinaturaClienteUri ? 'outline' : 'gradient'}
              size="md"
              fullWidth
              onPress={() => { vibrar('selecao'); setAssinando(true); }}
              icon={<MaterialCommunityIcons name="draw" size={18} color={enc.assinaturaClienteUri ? cores.primary : '#fff'} />}
            />
            <Text style={styles.nota}>Comprova a execução do serviço. Não é assinatura digital certificada.</Text>
            {pular('assinatura')}
          </>
        );
      case 'cobranca': {
        if (dados.estado === 'carregando') return <OlliSkeleton height={120} radius={16} />;
        if (dados.estado === 'erro') return (<>{indisponivel()}{pular('cobranca')}</>);
        if (jaQuitado) {
          return (
            <>
              <Text style={styles.aviso}>Este orçamento já está quitado no app. Nada a cobrar agora.</Text>
              <OlliButton label="Seguir" variant="gradient" size="md" fullWidth
                onPress={() => void resolver('cobranca', 'feito', pronto?.recibo ? { reciboId: pronto.recibo.id } : {})} />
            </>
          );
        }
        if (valorCobrar <= 0) {
          return (
            <>
              <Text style={styles.aviso}>Esta OS não tem valor. Se houver cobrança, registre pelo orçamento.</Text>
              {pular('cobranca', 'Sem cobrança agora')}
            </>
          );
        }
        const textoCobranca = mensagemCobrancaEncerramento({
          clienteNome: ordem.clienteNome,
          titulo: ordem.titulo,
          valorFormatado: formatCurrency(valorCobrar),
          pix: pix.situacao === 'com_pix' ? pix.codigo : undefined,
        });
        return (
          <>
            <Text style={styles.valor}>{formatCurrency(valorCobrar)}</Text>
            {pix.situacao === 'com_pix' ? (
              <Aparecer>
                <View style={styles.qrWrap}>
                  <SvgXml xml={qrSvg(pix.codigo)} width={184} height={184} />
                </View>
                <Text style={styles.nota}>O cliente aponta a câmera do banco. Só marque como pago quando o dinheiro cair na sua conta: comprovante pode ser falso.</Text>
              </Aparecer>
            ) : (
              <View style={{ gap: 6 }}>
                <Text style={styles.aviso}>
                  {pix.situacao === 'sem_chave'
                    ? 'Cadastre sua chave Pix em Meu Negócio para o QR aparecer aqui.'
                    : 'Sua chave Pix não parece válida: o QR não aparece até você conferir em Meu Negócio.'}
                </Text>
                <Text style={styles.link} onPress={() => onNavegar('MeuNegocio')}>Abrir Meu Negócio</Text>
              </View>
            )}
            <View style={styles.linhaBotoes}>
              <OlliButton label="Mandar no WhatsApp" variant="outline" size="md" style={{ flex: 1 }}
                onPress={() => whats(textoCobranca)}
                icon={<MaterialCommunityIcons name="whatsapp" size={18} color={cores.primary} />} />
              {pix.situacao === 'com_pix' ? (
                <OlliButton label="Só o código" variant="outline" size="md" style={{ flex: 1 }}
                  onPress={() => { Share.share({ message: pix.codigo }).catch(() => {}); }}
                  icon={<MaterialCommunityIcons name="content-copy" size={18} color={cores.primary} />} />
              ) : null}
            </View>
            {podeFaturar && orcamentoAceitaPagamento ? (
              <OlliButton label="Recebi: registrar pagamento" variant="gradient" size="md" fullWidth
                onPress={() => { vibrar('selecao'); setRegistrando(true); }}
                icon={<MaterialCommunityIcons name="cash-check" size={18} color="#fff" />} />
            ) : null}
            <OlliButton label="Cobrei, recebo depois" variant="ghost" size="md" fullWidth
              disabled={salvando} onPress={() => void resolver('cobranca', 'feito')} />
            {!podeFaturar ? (
              <Text style={styles.nota}>O registro do pagamento fica com quem cuida do financeiro da empresa.</Text>
            ) : !orcamento ? (
              <Text style={styles.nota}>Esta OS não veio de um orçamento: o recebimento é registrado pelo recibo avulso, no próximo passo.</Text>
            ) : !orcamentoAceitaPagamento ? (
              <Text style={styles.nota}>O orçamento desta OS ainda não está aprovado: aprove-o para registrar o pagamento.</Text>
            ) : null}
            {pular('cobranca', 'Sem cobrança agora')}
          </>
        );
      }
      case 'recibo': {
        if (!podeFaturar) {
          return (<><Text style={styles.aviso}>O recibo é emitido por quem cuida do financeiro da empresa.</Text>{pular('recibo')}</>);
        }
        if (dados.estado === 'carregando') return <OlliSkeleton height={60} radius={16} />;
        if (dados.estado === 'erro') return (<>{indisponivel()}{pular('recibo')}</>);
        const recibo = pronto?.recibo ?? null;
        if (recibo) {
          return (
            <>
              <Text style={styles.aviso}>
                Recibo nº {recibo.numero} · {formatCurrency(recibo.valorRecebido)} ({recibo.formaPagamento}).
              </Text>
              <OlliButton label="Gerar e mandar o recibo" variant="gradient" size="md" fullWidth
                loading={ocupado === 'recibo'} onPress={() => void gerarRecibo(recibo)}
                icon={<MaterialCommunityIcons name="file-pdf-box" size={18} color="#fff" />} />
              {pular('recibo', 'Mando depois')}
            </>
          );
        }
        if (orcamento) {
          return (
            <>
              <Text style={styles.aviso}>O recibo sai do pagamento registrado. Quando o dinheiro cair, registre na Cobrança.</Text>
              <OlliButton label="Voltar para a cobrança" variant="outline" size="md" fullWidth
                onPress={() => { vibrar('selecao'); void refazer('cobranca'); }} />
              {pular('recibo', 'Recibo depois')}
            </>
          );
        }
        return (
          <>
            <Text style={styles.aviso}>Sem orçamento ligado, o recibo é avulso. O que você já fez aqui fica salvo.</Text>
            <OlliButton label="Emitir recibo avulso" variant="outline" size="md" fullWidth onPress={() => onNavegar('EmitirRecibo')} />
            {pular('recibo', 'Recibo depois')}
          </>
        );
      }
      case 'proxima_visita': {
        if (enc.proximaVisitaEm && estadoDoPasso(enc, 'proxima_visita') === 'feito') {
          return <Text style={styles.aviso}>Marcada para {dataCurtaBR(enc.proximaVisitaEm)} às 9h.</Text>;
        }
        const data = sugerirProximaVisita(new Date(), meses);
        return (
          <>
            <Text style={styles.aviso}>
              Para {retorno.servico}, o comum é voltar a cada {retorno.meses} {retorno.meses === 1 ? 'mês' : 'meses'}.
            </Text>
            <View style={styles.chips}>
              {INTERVALOS_RETORNO.map((m) => {
                const ativo = m === meses;
                return (
                  <TouchableOpacity key={m} onPress={() => { vibrar('selecao'); escolheuMeses.current = true; setMeses(m); }}
                    style={[styles.chip, ativo && styles.chipAtivo]} accessibilityRole="button"
                    accessibilityState={{ selected: ativo }}>
                    <Text style={[styles.chipTxt, ativo && styles.chipTxtAtivo]}>{m} {m === 1 ? 'mês' : 'meses'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <OlliButton label={`Agendar ${dataCurtaBR(data)} às 9h`} variant="gradient" size="md" fullWidth
              loading={ocupado === 'proxima_visita'} onPress={() => void agendarProxima()}
              icon={<MaterialCommunityIcons name="calendar-check" size={18} color="#fff" />} />
            <Text style={styles.nota}>Dá para mudar o horário depois, na Agenda.</Text>
            {pular('proxima_visita', 'Não precisa de retorno')}
          </>
        );
      }
      case 'avaliacao': {
        if (dados.estado === 'carregando') return <OlliSkeleton height={60} radius={16} />;
        if (dados.estado === 'erro') return (<>{indisponivel()}{pular('avaliacao')}</>);
        const link = linkAvaliacaoUsavel(empresa?.linkGoogleAvaliacoes);
        if (!link) {
          return (
            <>
              <Text style={styles.aviso}>Cadastre o link das suas avaliações do Google em Meu Negócio para pedir com 1 toque.</Text>
              <Text style={styles.link} onPress={() => onNavegar('MeuNegocio')}>Abrir Meu Negócio</Text>
              {pular('avaliacao')}
            </>
          );
        }
        return (
          <>
            <OlliButton label="Pedir avaliação no WhatsApp" variant="gradient" size="md" fullWidth
              onPress={() => whats(montarMensagemPedidoAvaliacao(ordem.clienteNome, link, empresa), () => void resolver('avaliacao', 'feito'))}
              icon={<MaterialCommunityIcons name="star-outline" size={18} color="#fff" />} />
            <Text style={styles.nota}>Abre o WhatsApp com a mensagem pronta: quem envia é você.</Text>
            {pular('avaliacao', 'Agora não')}
          </>
        );
      }
      default:
        return null;
    }
  }

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={onFechar} presentationStyle="fullScreen">
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo}>{finalizado ? 'Atendimento encerrado' : 'Encerrar atendimento'}</Text>
            <Text style={styles.subtitulo} numberOfLines={1}>{ordem.clienteNome || 'Cliente'} · OS {ordem.numero}</Text>
          </View>
          <TouchableOpacity onPress={onFechar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button" accessibilityLabel="Fechar. O progresso fica salvo">
            <MaterialCommunityIcons name="close" size={26} color={cores.onSurface} />
          </TouchableOpacity>
        </View>

        <View style={styles.progressoLinha} accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: progresso.total, now: progresso.resolvidos }}>
          <View style={styles.trilho}>
            <Animated.View style={[styles.barra, estiloBarra]} />
          </View>
          <Text style={styles.progressoTxt}>{progresso.resolvidos} de {progresso.total}</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: 10, paddingBottom: 120 + insets.bottom }}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <DicaContextual
            id="os.encerramento.primeira-vez"
            texto="Seis passos para sair da casa do cliente com tudo fechado. Cada um é opcional e fica salvo no aparelho, mesmo sem sinal."
          />
          <SeloSync variante="cartao" />

          {falhaSalvar ? (
            <TouchableOpacity style={styles.erroFaixa} onPress={() => void persistir(falhaSalvar)} accessibilityRole="button">
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={cores.danger} />
              <Text style={styles.erroTxt}>Não salvei este passo no aparelho. Toque para tentar de novo.</Text>
            </TouchableOpacity>
          ) : null}
          {erroPasso ? (
            <View style={styles.erroFaixa}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={cores.danger} />
              <Text style={styles.erroTxt}>{erroPasso}</Text>
            </View>
          ) : null}

          {finalizado ? (
            <Aparecer>
              <View style={styles.fimBox}>
                <View style={styles.fimIcone}>
                  <MaterialCommunityIcons name="check-bold" size={34} color="#fff" />
                </View>
                <Text style={styles.fimTitulo}>Tudo fechado</Text>
                <Text style={styles.fimTxt}>
                  {progresso.feitos} {progresso.feitos === 1 ? 'passo feito' : 'passos feitos'}
                  {progresso.pulados ? `, ${progresso.pulados} pulado${progresso.pulados === 1 ? '' : 's'}` : ''}. A OS está concluída.
                </Text>
                <OlliButton label="Mandar resumo no WhatsApp" variant="outline" size="md" fullWidth
                  onPress={() => whats(mensagemResumoAtendimento({ clienteNome: ordem.clienteNome, titulo: ordem.titulo, fotos: ordem.fotos?.length ?? 0, enc }))}
                  icon={<MaterialCommunityIcons name="whatsapp" size={18} color={cores.primary} />} />
              </View>
            </Aparecer>
          ) : null}

          {PASSOS_ENCERRAMENTO.map((p, i) => {
            const estado = estadoDoPasso(enc, p);
            const info = INFO_PASSO[p];
            const expandido = !finalizado && aberto === p;
            return (
              <Aparecer key={p} indice={i}>
                <View style={[styles.passo, expandido && styles.passoAberto]}>
                  <TouchableOpacity style={styles.passoCab} activeOpacity={0.8}
                    onPress={() => { if (finalizado) return; vibrar('selecao'); setErroPasso(null); setAberto(expandido ? null : p); }}
                    accessibilityRole="button" accessibilityState={{ expanded: expandido }}
                    accessibilityLabel={`${info.titulo}: ${estado === 'feito' ? 'feito' : estado === 'pulado' ? 'pulado' : 'pendente'}`}>
                    <View style={[
                      styles.marca,
                      estado === 'feito' && { backgroundColor: cores.success, borderColor: cores.success },
                      estado === 'pulado' && { borderColor: cores.outlineDark },
                    ]}>
                      {estado === 'feito' ? (
                        <MaterialCommunityIcons name="check" size={15} color="#fff" />
                      ) : estado === 'pulado' ? (
                        <MaterialCommunityIcons name="minus" size={15} color={cores.onSurfaceMuted} />
                      ) : (
                        <Text style={styles.marcaNum}>{i + 1}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.passoTitulo, estado === 'pulado' && { color: cores.onSurfaceMuted }]}>{info.titulo}</Text>
                      {!expandido ? (
                        <Text style={styles.passoSub} numberOfLines={1}>
                          {estado === 'feito' ? 'Feito' : estado === 'pulado' ? 'Pulado' : info.descricao}
                        </Text>
                      ) : null}
                    </View>
                    {estado !== 'pendente' && !finalizado ? (
                      <Text style={styles.refazer} onPress={() => void refazer(p)} accessibilityRole="button">Refazer</Text>
                    ) : (
                      <MaterialCommunityIcons name={expandido ? 'chevron-up' : 'chevron-down'} size={20} color={cores.onSurfaceMuted} />
                    )}
                  </TouchableOpacity>
                  {expandido ? (
                    <View style={styles.passoCorpo}>
                      <Text style={styles.descricao}>{info.descricao}</Text>
                      {conteudo(p)}
                    </View>
                  ) : null}
                </View>
              </Aparecer>
            );
          })}
        </ScrollView>

        <View style={[styles.rodape, { paddingBottom: insets.bottom + 12 }]}>
          {finalizado ? (
            <OlliButton label="Fechar" variant="gradient" size="lg" fullWidth onPress={onFechar} />
          ) : (
            <OlliButton
              label={progresso.resolvidos === progresso.total ? 'Concluir atendimento' : `Concluir atendimento (${progresso.resolvidos}/${progresso.total})`}
              variant="gradient"
              size="lg"
              fullWidth
              loading={salvando}
              onPress={() => void concluir()}
              icon={<MaterialCommunityIcons name="check-circle-outline" size={22} color="#fff" />}
            />
          )}
          {salvando ? (
            <View style={styles.salvandoLinha}>
              <ActivityIndicator size="small" color={cores.onSurfaceMuted} />
              <Text style={styles.salvandoTxt}>Salvando no aparelho…</Text>
            </View>
          ) : null}
        </View>
      </View>

      <AssinaturaClienteModal
        visivel={assinando}
        clienteNome={ordem.clienteNome || 'Cliente'}
        referencia={`OS ${ordem.numero}`}
        aoCancelar={() => setAssinando(false)}
        aoConfirmar={async (dataUri, assinadoEm) => {
          const novo = marcarPasso(enc, 'assinatura', 'feito', new Date(), {
            assinaturaClienteUri: dataUri,
            assinaturaEm: assinadoEm,
            assinanteNome: ordem.clienteNome || undefined,
          });
          // LANÇA se não gravou: o modal segura os traços e mostra o erro.
          const o = await salvarEncerramentoOS(ordem.id, novo);
          setEnc(novo);
          onAtualizada(o);
          setAssinando(false);
          vibrar('sucesso');
          setAberto(proximoPasso(novo));
        }}
      />

      <RegistrarPagamentoModal
        visivel={registrando}
        clienteNome={ordem.clienteNome}
        valorSugerido={valorCobrar}
        aoFechar={() => setRegistrando(false)}
        aoSalvar={salvarPagamento}
      />
    </Modal>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingBottom: 10 },
  titulo: { fontSize: 26, fontFamily: Fonts.extraBold, color: c.onSurface, letterSpacing: -0.3 },
  subtitulo: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 2 },
  progressoLinha: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.base, paddingBottom: 8 },
  trilho: { flex: 1, height: 6, borderRadius: 3, backgroundColor: c.surfaceVariant, overflow: 'hidden' },
  barra: { height: 6, width: '100%', borderRadius: 3, backgroundColor: c.success, transformOrigin: 'left center' },
  progressoTxt: { fontSize: 12.5, fontWeight: '800', color: c.onSurfaceVariant, minWidth: 44, textAlign: 'right' },

  passo: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.outline, ...sombrasDe(c).sm },
  passoAberto: { borderColor: c.primary },
  passoCab: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  marca: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: c.outline, alignItems: 'center', justifyContent: 'center' },
  marcaNum: { fontSize: 13, fontWeight: '800', color: c.onSurfaceVariant },
  passoTitulo: { fontSize: 15.5, fontWeight: '800', color: c.onSurface },
  passoSub: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 1 },
  refazer: { fontSize: 13, fontWeight: '800', color: c.primary, paddingHorizontal: 4 },
  passoCorpo: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  descricao: { fontSize: 13.5, lineHeight: 19, color: c.onSurfaceVariant },

  aviso: { fontSize: 13.5, lineHeight: 19, color: c.onSurface },
  nota: { fontSize: 12, lineHeight: 17, color: c.onSurfaceMuted, textAlign: 'center', marginTop: 4 },
  link: { fontSize: 13.5, fontWeight: '800', color: c.primary },
  pular: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 12 },
  pularTxt: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant },
  linhaBotoes: { flexDirection: 'row', gap: 10 },

  foto: { width: 72, height: 72, borderRadius: BorderRadius.md, backgroundColor: c.surfaceVariant },
  assinaturaBox: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline, padding: 8 },
  assinatura: { width: '100%', height: 90 },
  // Texto sobre o papel BRANCO da assinatura (fundo fixo, não segue o tema).
  assinaturaNome: { fontSize: 12, color: '#475569', marginTop: 2 },

  valor: { fontSize: 30, fontFamily: Fonts.serifBold, color: c.onSurface, textAlign: 'center' },
  // QR sempre sobre branco: câmera de banco lê melhor (mesma regra do PixCobrancaModal).
  qrWrap: { alignSelf: 'center', backgroundColor: '#FFFFFF', borderRadius: BorderRadius.md, padding: 12 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: c.outline, backgroundColor: c.surface },
  chipAtivo: { backgroundColor: c.primary, borderColor: c.primary },
  chipTxt: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant },
  chipTxtAtivo: { color: c.onPrimary },

  erroFaixa: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: c.danger, padding: 12, backgroundColor: c.surface },
  erroTxt: { flex: 1, fontSize: 13, lineHeight: 18, color: c.onSurface },

  fimBox: { alignItems: 'center', gap: 10, backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.outline, padding: Spacing.lg, ...sombrasDe(c).md },
  fimIcone: { width: 64, height: 64, borderRadius: 32, backgroundColor: c.success, alignItems: 'center', justifyContent: 'center' },
  fimTitulo: { fontSize: 20, fontFamily: Fonts.extraBold, color: c.onSurface },
  fimTxt: { fontSize: 13.5, lineHeight: 19, color: c.onSurfaceVariant, textAlign: 'center' },

  rodape: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing.base, paddingTop: 12, backgroundColor: c.background, borderTopWidth: 1, borderTopColor: c.outline, gap: 6 },
  salvandoLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  salvandoTxt: { fontSize: 12, color: c.onSurfaceMuted },
});
