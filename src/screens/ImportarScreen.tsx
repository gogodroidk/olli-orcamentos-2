/**
 * TROQUE EM 5 MINUTOS — trazer clientes, serviços e produtos do app antigo.
 *
 * Três portas, uma prévia só:
 *  1. Contatos do celular: arquivo .vcf (app Contatos → Exportar) ou o CSV do
 *     Google Contatos. Sem `expo-contacts` no app, o arquivo é o caminho honesto
 *     (e não pede permissão de agenda inteira).
 *  2. Planilha CSV/XLSX de clientes, serviços ou produtos — com modelos de
 *     colunas conhecidos e mapeamento manual (`services/importacao.ts`, a mesma
 *     regra da Central de dados do painel).
 *  3. Foto/PDF de orçamento antigo: a IA do Autopilot lê
 *     (`services/iaAutopilot.ts`) e o resultado cai na MESMA prévia.
 *
 * Nada é gravado sem prévia; cada linha mostra novo / possível duplicado / erro
 * com motivo, e o relatório final traz o resultado de cada linha. A gravação usa
 * os mesmos `save*` das telas de cadastro (sync + espelho na nuvem).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { GradientHeader } from '../components/GradientHeader';
import { registrarEventoDica } from '../services/dicasRoteiroStore';
import { OlliButton } from '../components/OlliButton';
import { Spacing, BorderRadius, useCores, useEstilos, type Cores } from '../theme';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';
import { getClientes, getProdutos, getServicos, saveCliente, saveProduto, saveServico } from '../database/database';
import { usePermissao } from '../hooks/usePermissao';
import { generateId } from '../utils/id';
import { nowISO } from '../utils/date';
import { montarParamsOrcamento } from '../utils/autopilotCadastro';
import { prepararPreviaAutopilot, IA_AUTOPILOT_MAX_BYTES, type AutopilotPrevia } from '../services/iaAutopilot';
import {
  base64ParaBytes, CAMPOS_IMPORTACAO, contatosParaLinhas, detectarModelo, gravarImportacao, LIMITE_ARQUIVO_BYTES, linhasDaFoto,
  MAPEAMENTO_FIXO, mapeamentoInicial, modeloPorId, MODELOS_COLUNAS, montarPrevia, normalizarChave, prepararLinhas,
  previaConferida, resumoRelatorio, selecaoInicialImportacao, totaisPrevia,
  type AcaoLinhaImportacao, type ExistentesImportacao, type LinhaBruta, type LinhaPrevia, type RelatorioImportacao,
  type TipoImportacaoCadastro,
} from '../services/importacao';
import { lerArquivoImportacao, type FormatoImportacao } from '../services/importacaoArquivo';
import { lerContatosDoCelular } from '../services/contatosCelular';
import { puxarTelefoneDosContatos } from '../services/puxarTelefoneDosContatos';
import { CartaoRecursoPlano, useRecursoPlano } from '../components/RecursoPlano';
import { importacaoLoteTrancada } from '../services/cadeadoRecurso';
import { resumoImportacaoContatos } from '../services/contatosCelularNucleo';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rota = RouteProp<RootStackParamList, 'Importar'>;
const NOME_ESCOLHIDOS = 'Contatos escolhidos';
type Origem = 'contatos' | 'planilha' | 'foto';
type ArquivoCarregado = { nome: string; formato: FormatoImportacao; linhas: LinhaBruta[] };
type Filtro = 'todos' | AcaoLinhaImportacao;

const TIPOS: Array<{ id: TipoImportacaoCadastro; rotulo: string; icone: 'account-group-outline' | 'wrench-outline' | 'package-variant-closed' }> = [
  { id: 'clientes', rotulo: 'Clientes', icone: 'account-group-outline' },
  { id: 'servicos', rotulo: 'Serviços', icone: 'wrench-outline' },
  { id: 'produtos', rotulo: 'Produtos', icone: 'package-variant-closed' },
];

const PAGINA = 60;

const PEDIDO_FOTO = 'Isto é um orçamento antigo feito em outro aplicativo ou à mão. Extraia o cliente (nome e telefone, se aparecerem) e cada serviço e produto com o preço unitário cobrado. Não invente valores.';

function mensagemErroIa(erro: string): string {
  const mensagens: Record<string, string> = {
    ia_nao_configurada: 'A leitura por IA ainda não está habilitada neste ambiente.',
    nao_autorizado: 'Entre na sua conta para ler a foto com a IA.',
    arquivo_grande_demais: `Use uma foto ou PDF de até ${Math.round(IA_AUTOPILOT_MAX_BYTES / 1024 / 1024)} MB.`,
    parser_arquivo_nao_configurado: 'A leitura de PDF/imagem ainda não está habilitada neste ambiente.',
    assinatura_arquivo_invalida: 'O tipo interno do arquivo não confere; por segurança, nada foi lido.',
    tipo_arquivo_nao_permitido: 'Use foto (JPG, PNG, WEBP) ou PDF.',
    fonte_vazia: 'Não consegui ler texto nesta foto. Tente uma foto mais nítida, de frente e com boa luz.',
    resposta_invalida: 'A IA não devolveu uma leitura confiável. Tente outra foto. Nada foi alterado.',
    timeout: 'A leitura demorou demais. Confira a internet e tente de novo. Nada foi alterado.',
    offline: 'Sem internet: a leitura da foto precisa de conexão. Planilha e contatos funcionam sem internet.',
  };
  return mensagens[erro] ?? 'Não consegui ler esta foto agora. Nada foi alterado.';
}

async function lerBytes(asset: DocumentPicker.DocumentPickerAsset): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const arquivo = (asset as { file?: File }).file;
    if (arquivo) return new Uint8Array(await arquivo.arrayBuffer());
    const resposta = await fetch(asset.uri);
    return new Uint8Array(await resposta.arrayBuffer());
  }
  // Require preguiçoso, como em services/iaAutopilot.ts: FileSystem fora do boot.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  return base64ParaBytes(base64);
}

/**
 * D-2267: importar CLIENTES em lote (contatos, planilha, vCard) é do Pro, com carência do Grátis até
 * `TRANCA_GRATIS_D2267` (entitlement `importar_lote`; `estadoAcessoRecurso` já aplica a carência).
 * Catálogo (serviços/produtos) e foto de orçamento seguem no Grátis, como em `planosBase` e no painel.
 * Trancado: no lugar do botão aparece o cartão "Disponível no Pro" (3 estados: carregando | não confirmei | bloqueado).
 * Puxar UM telefone no orçamento NÃO passa por aqui e segue Grátis.
 */
export default function ImportarScreen() {
  const nav = useNavigation<Nav>();
  const rota = useRoute<Rota>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const { pode, carregando: papelCarregando } = usePermissao();
  const podeClientes = pode('ver_clientes');
  const podeCatalogo = pode('ver_valores_agregados');
  const { estado: estadoLote } = useRecursoPlano('importar_lote');
  const loteTrancado = estadoLote !== 'liberado' && estadoLote !== 'em_breve';

  const [origem, setOrigem] = useState<Origem | null>(rota.params?.origem === 'contatos' ? 'contatos' : null);
  // Agenda negada: guarda se dá para pedir de novo (senão o caminho é Ajustes) — 3 estados, nunca "sem contatos" por engano.
  const [agendaNegada, setAgendaNegada] = useState<{ podePedirDeNovo: boolean } | null>(null);
  // Contatos escolhidos 1 a 1 no seletor nativo: já vêm marcados (o usuário acabou de escolher).
  const escolhidosRef = useRef<Set<string>>(new Set());
  const [tipo, setTipo] = useState<TipoImportacaoCadastro>('clientes');
  const [arquivo, setArquivo] = useState<ArquivoCarregado | null>(null);
  const [modeloId, setModeloId] = useState<string>('generica');
  const [mapeamento, setMapeamento] = useState<Record<string, string>>({});
  const [campoAberto, setCampoAberto] = useState<string | null>(null);
  const [ddd, setDdd] = useState('');
  const [fotoIa, setFotoIa] = useState<AutopilotPrevia | null>(null);
  // 3 estados: 'carregando' | lido (listas `null` = não deu para conferir) — nunca "vazio" por erro.
  const [existentes, setExistentes] = useState<ExistentesImportacao | 'carregando'>('carregando');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [gravados, setGravados] = useState<Map<string, string>>(new Map());
  const [relatorio, setRelatorio] = useState<RelatorioImportacao | null>(null);
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(PAGINA);
  const gravandoRef = useRef(false);

  const carregarExistentes = useCallback(async () => {
    setExistentes('carregando');
    async function ler<T>(permitido: boolean, fn: () => Promise<T[]>): Promise<T[] | null> {
      if (!permitido) return null;
      try { return await fn(); } catch { return null; }
    }
    const [clientes, produtos, servicos] = await Promise.all([
      ler(podeClientes, getClientes), ler(podeCatalogo, getProdutos), ler(podeCatalogo, getServicos),
    ]);
    setExistentes({ clientes, produtos, servicos });
  }, [podeClientes, podeCatalogo]);

  // Relê o cadastro a cada fonte nova (arquivo ou foto): a prévia confere duplicados contra o estado atual.
  useEffect(() => {
    if (papelCarregando || (!arquivo && !fotoIa)) return;
    void carregarExistentes();
  }, [arquivo, fotoIa, papelCarregando, carregarExistentes]);

  const modelo = modeloPorId(modeloId) ?? null;
  const linhasPreparadas = useMemo(() => (arquivo ? prepararLinhas(arquivo.linhas, modelo) : []), [arquivo, modelo]);
  const cabecalhos = useMemo(() => Object.keys(linhasPreparadas[0] ?? {}), [linhasPreparadas]);

  const previa = useMemo<LinhaPrevia[]>(() => {
    if (existentes === 'carregando') return [];
    if (fotoIa) {
      const linhas = linhasDaFoto(fotoIa.candidatos, (existentes.produtos ?? []).map((p) => p.nome));
      // O que o papel não pode cadastrar fica fora da prévia (aviso logo abaixo), em vez de travar tudo.
      return (['clientes', 'servicos', 'produtos'] as const)
        .filter((t) => (t === 'clientes' ? podeClientes : podeCatalogo))
        .flatMap((t) => montarPrevia(t, linhas[t], MAPEAMENTO_FIXO[t], existentes, { rotulo: 'item', precoObrigatorio: false }));
    }
    if (!arquivo) return [];
    return montarPrevia(tipo, linhasPreparadas, mapeamento, existentes, {
      dddPadrao: ddd, rotulo: arquivo.formato === 'vcf' ? 'contato' : 'linha',
    });
  }, [arquivo, fotoIa, existentes, tipo, linhasPreparadas, mapeamento, ddd, podeClientes, podeCatalogo]);

  // Prévia nova → seleção inicial (contatos começam desmarcados: agenda pessoal mistura família e clientes).
  const origemSelecao: 'planilha' | 'contatos' | 'foto' = fotoIa ? 'foto' : origem === 'contatos' ? 'contatos' : 'planilha';
  // O que JÁ foi gravado nesta tela nunca volta a ser marcado: sem isto, mexer no
  // DDD ou numa coluna depois de importar recalculava a prévia, remarcava os
  // mesmos "novos" e um segundo toque em Importar duplicava o cadastro.
  const gravadosRef = useRef(gravados);
  gravadosRef.current = gravados;
  useEffect(() => {
    const inicial = selecaoInicialImportacao(previa, origemSelecao);
    for (const chave of escolhidosRef.current) if (previa.some((l) => l.chave === chave && l.acao !== 'erro')) inicial.add(chave);
    for (const chave of gravadosRef.current.keys()) inicial.delete(chave);
    setSelecionados(inicial);
    setLimite(PAGINA);
  }, [previa, origemSelecao]);

  const tiposNaPrevia = useMemo(() => new Set(previa.map((l) => l.tipo)), [previa]);
  const conferida = existentes !== 'carregando' && previaConferida(tiposNaPrevia, existentes);
  const totais = useMemo(() => totaisPrevia(previa), [previa]);
  const visiveis = useMemo(() => {
    const termo = normalizarChave(busca);
    return previa.filter((l) => (filtro === 'todos' || l.acao === filtro)
      && (!termo || normalizarChave(`${l.nome} ${l.detalhe}`).includes(termo)));
  }, [previa, filtro, busca]);
  const resultadoPorChave = useMemo(() => new Map((relatorio?.itens ?? []).map((i) => [i.chave, i])), [relatorio]);
  const errosDaPrevia = previa.filter((l) => l.acao === 'erro');

  function limparFonte() {
    setArquivo(null); setFotoIa(null); setMapeamento({}); setCampoAberto(null); setErro(null);
    setGravados(new Map()); setRelatorio(null); setFiltro('todos'); setBusca(''); setProgresso(null);
    setAgendaNegada(null); escolhidosRef.current = new Set();
  }

  function escolherOrigem(nova: Origem) {
    if (gravando) return;
    limparFonte();
    setOrigem(nova);
    if (nova === 'contatos') setTipo('clientes');
  }

  async function escolherArquivo() {
    if (lendo || gravando) return;
    setErro(null);
    let resultado: DocumentPicker.DocumentPickerResult;
    try {
      resultado = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
    } catch {
      setErro('Não consegui abrir o seletor de arquivos. Tente de novo.');
      return;
    }
    if (resultado.canceled || !resultado.assets?.[0]) return;
    const asset = resultado.assets[0];
    if (asset.size && asset.size > LIMITE_ARQUIVO_BYTES) {
      setErro(`Use arquivos de até ${Math.round(LIMITE_ARQUIVO_BYTES / 1024 / 1024)} MB.`);
      return;
    }
    setLendo(true);
    limparFonte();
    try {
      const lido = lerArquivoImportacao(asset.name ?? 'arquivo', await lerBytes(asset));
      if (!lido.linhas.length) throw new Error('Não encontrei linhas de dados depois do cabeçalho.');
      let tipoFinal = tipo;
      if (lido.formato === 'vcf' && tipo !== 'clientes') { tipoFinal = 'clientes'; setTipo('clientes'); }
      const detectado = lido.formato === 'vcf' ? null : detectarModelo(Object.keys(lido.linhas[0] ?? {}));
      const modeloInicial = detectado ?? modeloPorId('generica') ?? null;
      setModeloId(modeloInicial?.id ?? 'generica');
      const preparadas = prepararLinhas(lido.linhas, modeloInicial);
      setMapeamento(lido.formato === 'vcf'
        ? MAPEAMENTO_FIXO.clientes
        : mapeamentoInicial(tipoFinal, Object.keys(preparadas[0] ?? {}), modeloInicial));
      setArquivo({ nome: asset.name ?? 'arquivo', formato: lido.formato, linhas: lido.linhas });
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : 'Não consegui ler este arquivo.');
    } finally {
      setLendo(false);
    }
  }

  /** Lê a agenda do celular (permissão pedida AQUI, ao tocar) e entrega a mesma prévia do arquivo .vcf. */
  async function lerAgenda() {
    if (lendo || gravando) return;
    setLendo(true);
    limparFonte();
    try {
      const r = await lerContatosDoCelular();
      if (r.estado === 'ok') {
        setTipo('clientes');
        setMapeamento(MAPEAMENTO_FIXO.clientes);
        setArquivo({ nome: 'Contatos do celular', formato: 'vcf', linhas: contatosParaLinhas(r.contatos) });
      } else if (r.estado === 'negada') {
        setAgendaNegada({ podePedirDeNovo: r.podePedirDeNovo });
      } else if (r.estado === 'vazio') {
        setErro('Não achei contatos salvos neste celular. Você pode escolher um por vez ou usar um arquivo.');
      } else if (r.estado === 'indisponivel') {
        setErro('Ler a agenda só funciona no app do celular. Aqui, use o arquivo de contatos.');
      } else {
        setErro(`${r.mensagem} Nada foi alterado.`);
      }
    } finally {
      setLendo(false);
    }
  }

  /** Seletor nativo, 1 contato por vez: não precisa de permissão da agenda. Cada escolha entra já marcada. */
  async function escolherUm() {
    if (lendo || gravando) return;
    setErro(null);
    setLendo(true);
    try {
      const r = await puxarTelefoneDosContatos();
      if (r.estado === 'cancelado') return;
      if (r.estado === 'erro') { setErro(r.mensagem); return; }
      const nova = contatosParaLinhas([{ nome: r.nome, telefones: [r.telefone], endereco: '', cidade: '', estado: '', cep: '', empresa: '' }]);
      const base = arquivo?.nome === NOME_ESCOLHIDOS ? arquivo.linhas : [];
      if (!base.length) {
        limparFonte();
        setTipo('clientes');
        setMapeamento(MAPEAMENTO_FIXO.clientes);
      }
      escolhidosRef.current.add(`cliente:${base.length}`);
      setArquivo({ nome: NOME_ESCOLHIDOS, formato: 'vcf', linhas: [...base, ...nova] });
    } finally {
      setLendo(false);
    }
  }

  function trocarModelo(id: string) {
    const novo = modeloPorId(id) ?? null;
    setModeloId(id);
    if (!arquivo) return;
    const preparadas = prepararLinhas(arquivo.linhas, novo);
    setMapeamento(mapeamentoInicial(tipo, Object.keys(preparadas[0] ?? {}), novo));
  }

  function trocarTipo(novo: TipoImportacaoCadastro) {
    if (gravando || novo === tipo) return;
    setTipo(novo);
    if (arquivo && arquivo.formato !== 'vcf') {
      setMapeamento(mapeamentoInicial(novo, cabecalhos, modelo));
      setGravados(new Map()); setRelatorio(null);
    }
  }

  async function lerFoto(fonte: 'camera' | 'galeria' | 'pdf') {
    if (lendo || gravando) return;
    setErro(null);
    let alvo: { uri: string; nome: string; mime: string; bytes?: number } | null = null;
    try {
      if (fonte === 'pdf') {
        const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: false });
        const a = r.canceled ? null : r.assets?.[0];
        if (a) alvo = { uri: a.uri, nome: a.name, mime: a.mimeType ?? 'application/pdf', bytes: a.size };
      } else {
        if (fonte === 'camera') {
          const permissao = await ImagePicker.requestCameraPermissionsAsync();
          if (!permissao.granted) { setErro('Sem permissão para a câmera. Escolha uma foto da galeria.'); return; }
        }
        const opcoes: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', quality: 0.6, allowsEditing: false };
        const r = fonte === 'camera' ? await ImagePicker.launchCameraAsync(opcoes) : await ImagePicker.launchImageLibraryAsync(opcoes);
        const a = r.canceled ? null : r.assets?.[0];
        if (a) alvo = { uri: a.uri, nome: a.fileName ?? 'orcamento-antigo.jpg', mime: a.mimeType ?? 'image/jpeg', bytes: a.fileSize };
      }
    } catch {
      setErro(fonte === 'camera' ? 'Não consegui abrir a câmera. Escolha uma foto da galeria.' : 'Não consegui abrir o arquivo escolhido. Tente de novo.');
      return;
    }
    if (!alvo) return;
    setLendo(true);
    limparFonte();
    // `prepararPreviaAutopilot` lê o arquivo do disco ANTES do try dele: uma URI
    // ilegível lança. Sem o finally, o "Lendo a foto…" ficava girando para sempre
    // e todos os botões travados (lendo = true).
    try {
      const resultado = await prepararPreviaAutopilot({
        uri: alvo.uri, nomeArquivo: alvo.nome, mimeType: alvo.mime, tamanhoBytes: alvo.bytes,
        intencao: 'cadastro', pedidoOriginal: PEDIDO_FOTO,
      });
      if (resultado.ok) setFotoIa(resultado.previa);
      else setErro(mensagemErroIa(resultado.erro));
    } catch {
      setErro(mensagemErroIa('falha_leitura'));
    } finally {
      setLendo(false);
    }
  }

  function alternar(linha: LinhaPrevia) {
    if (gravando || linha.acao === 'erro' || gravados.has(linha.chave)) return;
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(linha.chave)) proximo.delete(linha.chave); else proximo.add(linha.chave);
      return proximo;
    });
  }

  function marcarVisiveis(marcar: boolean) {
    if (gravando) return;
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      for (const l of visiveis) {
        if (l.acao === 'erro' || gravados.has(l.chave)) continue;
        if (marcar) proximo.add(l.chave); else proximo.delete(l.chave);
      }
      return proximo;
    });
  }

  async function importar() {
    if (!conferida || !selecionados.size || gravando || gravandoRef.current) return;
    // Conferida na hora de gravar, pelo tipo FINAL (não só ao abrir): trocar o tipo com a planilha já lida não fura a trava.
    if (importacaoLoteTrancada(origem, tipo, loteTrancado)) return;
    // Defesa em profundidade: o que já foi gravado nesta tela nunca grava de novo.
    const alvo = new Set([...selecionados].filter((chave) => !gravados.has(chave)));
    if (!alvo.size) return;
    gravandoRef.current = true;
    setGravando(true);
    setProgresso({ feitos: 0, total: alvo.size });
    let gravouAlgo = false;
    try {
      const r = await gravarImportacao(previa, alvo, {
        saveCliente, saveProduto, saveServico, gerarId: generateId, agora: nowISO,
        permissoes: { clientes: podeClientes, catalogo: podeCatalogo },
        aoProgredir: (feitos, total) => { if (feitos % 10 === 0 || feitos === total) setProgresso({ feitos, total }); },
      });
      const novos = new Map(gravados);
      for (const item of r.itens) if (item.ok) novos.set(item.chave, item.id);
      gravadosRef.current = novos;
      setGravados(novos);
      // Quem gravou sai da seleção; quem falhou continua marcado para tentar de novo.
      setSelecionados((atual) => new Set([...atual].filter((chave) => !novos.has(chave))));
      setRelatorio(r);
      gravouAlgo = r.gravados > 0;
      // Roteiro de dicas: a 1ª importação apresenta a conferência em Clientes.
      if (gravouAlgo) registrarEventoDica('primeira_importacao');
    } finally {
      gravandoRef.current = false;
      setGravando(false);
      setProgresso(null);
    }
    // Relê o cadastro: o que acabou de entrar passa a contar como "já existe" se o
    // usuário trocar o tipo/colunas e voltar — senão a prévia velha o mostraria
    // como "novo" de novo e uma nova importação o duplicaria.
    if (gravouAlgo) void carregarExistentes();
  }

  const paramsOrcamento = useMemo(() => {
    if (!fotoIa || existentes === 'carregando') return null;
    const nomeCliente = fotoIa.candidatos.orcamento.clienteNome.trim() || (fotoIa.candidatos.clientes.length === 1 ? fotoIa.candidatos.clientes[0]?.nome ?? '' : '');
    let cliente: { id?: string; nome: string } | null = null;
    if (nomeCliente) {
      const alvo = normalizarChave(nomeCliente);
      const importado = previa.find((l) => l.tipo === 'cliente' && normalizarChave(l.nome) === alvo && gravados.has(l.chave));
      const existente = (existentes.clientes ?? []).find((c) => !c.excluidoEm && normalizarChave(c.nome) === alvo);
      cliente = importado ? { id: gravados.get(importado.chave), nome: importado.nome } : existente ? { id: existente.id, nome: existente.nome } : { nome: nomeCliente };
    }
    return montarParamsOrcamento({
      itens: fotoIa.candidatos.orcamento.itens.length ? fotoIa.candidatos.orcamento.itens : [...fotoIa.candidatos.servicos, ...fotoIa.candidatos.produtos],
      nomesProdutos: [...fotoIa.candidatos.produtos.map((p) => p.nome), ...(existentes.produtos ?? []).map((p) => p.nome)],
      cliente,
    });
  }, [fotoIa, existentes, previa, gravados]);

  const temFonte = Boolean(arquivo || fotoIa);
  // Só importar CLIENTES é Pro; catálogo e foto ficam livres.
  const bloqueioLote = importacaoLoteTrancada(origem, tipo, loteTrancado);
  // Trancado: nem prévia nem botão de importar (a trava vale pelo tipo final, também depois de trocar o tipo com a planilha lida).
  const fonteLiberada = temFonte && !bloqueioLote;
  const semPermissaoTipo = !papelCarregando && origem !== 'foto' && origem !== null && (tipo === 'clientes' ? !podeClientes : !podeCatalogo);

  return (
    <View style={styles.raiz}>
      <GradientHeader title="Trazer meus dados" subtitle="Troque de app em 5 minutos" onBack={() => goBackOrHome(nav)} comoFunciona="importar" />
      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>Traga clientes, serviços e produtos do app antigo, da agenda do celular ou de uma planilha. Você confere tudo numa prévia antes de gravar; nada é apagado nem sobrescrito.</Text>

        {/* 1. ORIGEM */}
        <View style={styles.origens}>
          {([
            { id: 'contatos', titulo: 'Contatos do celular', sub: 'Arquivo .vcf ou CSV do Google Contatos', icone: 'card-account-phone-outline' },
            { id: 'planilha', titulo: 'Planilha', sub: 'CSV ou XLSX de clientes, serviços ou produtos', icone: 'file-table-outline' },
            { id: 'foto', titulo: 'Foto de orçamento antigo', sub: 'Foto ou PDF lido pela IA', icone: 'camera-document' },
          ] as const).map((o) => (
            <TouchableOpacity key={o.id} style={[styles.origem, origem === o.id && styles.origemAtiva]} onPress={() => escolherOrigem(o.id)} disabled={gravando} accessibilityRole="button" accessibilityState={{ selected: origem === o.id }}>
              <MaterialCommunityIcons name={o.icone} size={24} color={origem === o.id ? cores.primary : cores.accentLight} />
              <View style={{ flex: 1 }}>
                <Text style={styles.origemTitulo}>{o.titulo}</Text>
                <Text style={styles.origemSub}>{o.sub}</Text>
              </View>
              <MaterialCommunityIcons name={origem === o.id ? 'radiobox-marked' : 'radiobox-blank'} size={20} color={origem === o.id ? cores.primary : cores.onSurfaceMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {origem === 'contatos' && bloqueioLote && <CartaoRecursoPlano recurso="importar_lote" />}
        {origem === 'contatos' && !bloqueioLote && (
          <View style={styles.card}>
            {Platform.OS !== 'web' && (
              <>
                <Text style={styles.cardTitulo}>Pegar direto da agenda</Text>
                <Text style={styles.texto}>O OLLI vai ler seus contatos só para você escolher quais virar clientes. Nada é enviado sem você escolher.</Text>
                <OlliButton label={lendo ? 'Lendo…' : 'Ler meus contatos'} variant="gradient" fullWidth onPress={() => { void lerAgenda(); }} disabled={lendo || gravando} loading={lendo} icon={!lendo ? <MaterialCommunityIcons name="card-account-phone-outline" size={18} color="#fff" /> : undefined} style={{ marginTop: Spacing.sm }} />
                {agendaNegada && (
                  <View style={[styles.aviso, { marginTop: Spacing.sm }]} accessibilityRole="alert">
                    <MaterialCommunityIcons name="alert-circle-outline" size={19} color={cores.warning} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.texto}>Sem acesso à sua agenda. Você ainda pode escolher um contato por vez ou usar um arquivo.</Text>
                      {agendaNegada.podePedirDeNovo
                        ? <TouchableOpacity onPress={() => { void lerAgenda(); }} accessibilityRole="button"><Text style={styles.link}>Permitir e tentar de novo</Text></TouchableOpacity>
                        : <TouchableOpacity onPress={() => { void Linking.openSettings(); }} accessibilityRole="button"><Text style={styles.link}>Abrir os ajustes do celular</Text></TouchableOpacity>}
                    </View>
                  </View>
                )}
                <OlliButton label="Escolher um contato por vez" variant="outline" fullWidth onPress={() => { void escolherUm(); }} disabled={lendo || gravando} icon={<MaterialCommunityIcons name="account-search-outline" size={18} color={cores.primary} />} style={{ marginTop: Spacing.sm }} />
                <Text style={[styles.rotulo, { marginTop: Spacing.base }]}>Ou use um arquivo</Text>
              </>
            )}
            {Platform.OS === 'web' && <Text style={styles.cardTitulo}>Como pegar seus contatos</Text>}
            <Text style={styles.texto}>• Android: no app Contatos, use a opção de exportar contatos para arquivo (.vcf).</Text>
            <Text style={styles.texto}>• Google: em contacts.google.com, toque em Exportar e escolha vCard ou CSV do Google.</Text>
            <Text style={styles.texto}>• iPhone: em icloud.com/contacts, selecione os contatos e exporte o vCard.</Text>
            <Text style={styles.textoMudo}>Os contatos chegam desmarcados: marque só quem é cliente.</Text>
            <OlliButton label={lendo ? 'Lendo…' : 'Escolher arquivo de contatos'} variant="gradient" fullWidth onPress={() => { void escolherArquivo(); }} disabled={lendo || gravando} loading={lendo} icon={!lendo ? <MaterialCommunityIcons name="folder-open-outline" size={18} color="#fff" /> : undefined} style={{ marginTop: Spacing.md }} />
          </View>
        )}

        {origem === 'planilha' && (
          <View style={styles.card}>
            <Text style={styles.cardTitulo}>O que tem na planilha?</Text>
            <View style={styles.chips}>
              {TIPOS.map((t) => (
                <TouchableOpacity key={t.id} style={[styles.chip, tipo === t.id && styles.chipAtivo]} onPress={() => trocarTipo(t.id)} disabled={gravando} accessibilityRole="button" accessibilityState={{ selected: tipo === t.id }}>
                  <MaterialCommunityIcons name={t.icone} size={15} color={tipo === t.id ? cores.primaryLight : cores.onSurfaceVariant} />
                  <Text style={[styles.chipTexto, tipo === t.id && styles.chipTextoAtivo]}>{t.rotulo}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {bloqueioLote ? <CartaoRecursoPlano recurso="importar_lote" /> : (
              <>
              <Text style={styles.textoMudo}>CSV ou XLSX até {Math.round(LIMITE_ARQUIVO_BYTES / 1024 / 1024)} MB, com uma linha de cabeçalho. Só a primeira aba do XLSX é lida; fórmulas não são executadas.</Text>
              <OlliButton label={lendo ? 'Lendo…' : 'Escolher planilha'} variant="gradient" fullWidth onPress={() => { void escolherArquivo(); }} disabled={lendo || gravando} loading={lendo} icon={!lendo ? <MaterialCommunityIcons name="folder-open-outline" size={18} color="#fff" /> : undefined} style={{ marginTop: Spacing.md }} />
              </>
            )}
          </View>
        )}

        {origem === 'foto' && (
          <View style={styles.card}>
            <Text style={styles.cardTitulo}>Foto de um orçamento antigo</Text>
            <Text style={styles.texto}>A IA lê o cliente, os serviços e os produtos com preço. É só uma prévia: você confere cada item antes de gravar. Precisa de internet.</Text>
            <View style={styles.acoesFoto}>
              <OlliButton label="Tirar foto" variant="outline" size="sm" onPress={() => { void lerFoto('camera'); }} disabled={lendo || gravando} icon={<MaterialCommunityIcons name="camera-outline" size={17} color={cores.primary} />} />
              <OlliButton label="Da galeria" variant="outline" size="sm" onPress={() => { void lerFoto('galeria'); }} disabled={lendo || gravando} icon={<MaterialCommunityIcons name="image-outline" size={17} color={cores.primary} />} />
              <OlliButton label="PDF" variant="outline" size="sm" onPress={() => { void lerFoto('pdf'); }} disabled={lendo || gravando} icon={<MaterialCommunityIcons name="file-pdf-box" size={17} color={cores.primary} />} />
            </View>
            {lendo && <View style={styles.carregando}><ActivityIndicator color={cores.primary} /><Text style={styles.textoMudo}>Lendo a foto…</Text></View>}
          </View>
        )}

        {semPermissaoTipo && <Aviso cores={cores} styles={styles} tom="erro" texto={`Seu papel na empresa não permite importar ${tipo === 'clientes' ? 'clientes' : 'o catálogo'}.`} />}
        {erro && <Aviso cores={cores} styles={styles} tom="erro" texto={erro} />}

        {/* 2. MODELO + MAPEAMENTO (planilha/CSV de contatos) */}
        {arquivo && (
          <View style={styles.card}>
            <View style={styles.linhaArquivo}>
              <MaterialCommunityIcons name="file-check-outline" size={18} color={cores.success} />
              <Text style={styles.arquivoNome} numberOfLines={1}>{arquivo.nome}</Text>
              <Text style={styles.textoMudo}>{arquivo.linhas.length} {arquivo.formato === 'vcf' ? 'contatos' : 'linhas'}</Text>
            </View>
            {arquivo.formato !== 'vcf' && (
              <>
                <Text style={styles.rotulo}>De onde veio a planilha?</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  {MODELOS_COLUNAS.map((m) => (
                    <TouchableOpacity key={m.id} style={[styles.chip, modeloId === m.id && styles.chipAtivo]} onPress={() => trocarModelo(m.id)} disabled={gravando} accessibilityRole="button" accessibilityState={{ selected: modeloId === m.id }}>
                      <Text style={[styles.chipTexto, modeloId === m.id && styles.chipTextoAtivo]}>{m.rotulo}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {modelo && <Text style={[styles.textoMudo, !modelo.conferido && { color: cores.warning }]}>{modelo.nota}</Text>}
                <Text style={styles.rotulo}>Confira as colunas</Text>
                {CAMPOS_IMPORTACAO[tipo].map((campo) => {
                  const atual = mapeamento[campo.id] ?? '';
                  const aberto = campoAberto === campo.id;
                  return (
                    <View key={campo.id} style={styles.campo}>
                      <TouchableOpacity style={styles.campoLinha} onPress={() => setCampoAberto(aberto ? null : campo.id)} disabled={gravando} accessibilityRole="button" accessibilityLabel={`${campo.rotulo}: ${atual || 'não importar'}. Toque para trocar a coluna.`}>
                        <Text style={styles.campoRotulo}>{campo.rotulo}{campo.obrigatorio ? ' *' : ''}</Text>
                        <Text style={[styles.campoValor, !atual && { color: campo.obrigatorio ? cores.danger : cores.onSurfaceMuted }]} numberOfLines={1}>{atual || (campo.obrigatorio ? 'Escolha a coluna' : 'Não importar')}</Text>
                        <MaterialCommunityIcons name={aberto ? 'chevron-up' : 'chevron-down'} size={18} color={cores.onSurfaceMuted} />
                      </TouchableOpacity>
                      {aberto && (
                        <View style={styles.chips}>
                          {['', ...cabecalhos].map((c) => (
                            <TouchableOpacity key={c || '__vazio'} style={[styles.chip, atual === c && styles.chipAtivo]} onPress={() => { setMapeamento((m) => ({ ...m, [campo.id]: c })); setCampoAberto(null); }} accessibilityRole="button">
                              <Text style={[styles.chipTexto, atual === c && styles.chipTextoAtivo]}>{c || 'Não importar'}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </>
            )}
            {tipo === 'clientes' && (
              <View style={styles.ddd}>
                <Text style={styles.campoRotulo}>DDD para telefones sem DDD</Text>
                <TextInput value={ddd} onChangeText={(v) => setDdd(v.replace(/\D/g, '').slice(0, 2))} placeholder="ex.: 11" placeholderTextColor={cores.onSurfaceMuted} keyboardType="number-pad" maxLength={2} style={styles.dddInput} editable={!gravando} accessibilityLabel="DDD padrão para telefones sem DDD" />
              </View>
            )}
          </View>
        )}

        {fotoIa && (
          <View style={styles.card}>
            <View style={styles.linhaArquivo}>
              <MaterialCommunityIcons name="robot-happy-outline" size={18} color={cores.accentLight} />
              <Text style={styles.arquivoNome} numberOfLines={1}>{fotoIa.fonte.nome}</Text>
            </View>
            {fotoIa.candidatos.avisos.map((a) => <Text key={a} style={styles.textoAviso}>• {a}</Text>)}
            {!papelCarregando && (!podeClientes || !podeCatalogo) && <Text style={styles.textoAviso}>• Seu papel na empresa não permite cadastrar {!podeClientes && !podeCatalogo ? 'clientes nem catálogo' : !podeClientes ? 'clientes' : 'serviços e produtos'}; esses itens ficaram fora da prévia.</Text>}
            <OlliButton label="Abrir como orçamento rascunho" variant="outline" size="sm" fullWidth onPress={() => { if (paramsOrcamento) nav.navigate('NovoOrcamento', paramsOrcamento); }} disabled={!paramsOrcamento || gravando} icon={<MaterialCommunityIcons name="file-plus-outline" size={17} color={cores.primary} />} style={{ marginTop: Spacing.sm }} />
          </View>
        )}

        {/* 3. PRÉVIA */}
        {fonteLiberada && existentes === 'carregando' && <View style={styles.carregando}><ActivityIndicator color={cores.primary} /><Text style={styles.textoMudo}>Conferindo o que você já tem cadastrado…</Text></View>}
        {fonteLiberada && existentes !== 'carregando' && !conferida && !semPermissaoTipo && (
          <View style={[styles.aviso, styles.avisoErro]} accessibilityRole="alert">
            <MaterialCommunityIcons name="alert-circle-outline" size={19} color={cores.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.texto}>Não consegui ler seu cadastro atual para evitar duplicados. Por segurança, a importação está travada.</Text>
              <TouchableOpacity onPress={() => { void carregarExistentes(); }} accessibilityRole="button"><Text style={styles.link}>Tentar de novo</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {fonteLiberada && existentes !== 'carregando' && previa.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitulo}>Prévia antes de gravar</Text>
            <View style={styles.chips}>
              {([['todos', `Todos ${previa.length}`], ['novo', `Novos ${totais.novo}`], ['duplicado', `Duplicados ${totais.duplicado}`], ['erro', `Erros ${totais.erro}`]] as const).map(([id, rotulo]) => (
                <TouchableOpacity key={id} style={[styles.chip, filtro === id && styles.chipAtivo]} onPress={() => { setFiltro(id); setLimite(PAGINA); }} accessibilityRole="button" accessibilityState={{ selected: filtro === id }}>
                  <Text style={[styles.chipTexto, filtro === id && styles.chipTextoAtivo, id === 'erro' && totais.erro > 0 && { color: cores.danger }]}>{rotulo}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {previa.length > 15 && <TextInput value={busca} onChangeText={(v) => { setBusca(v); setLimite(PAGINA); }} placeholder="Buscar nesta prévia" placeholderTextColor={cores.onSurfaceMuted} style={styles.busca} accessibilityLabel="Buscar na prévia" />}
            <View style={styles.marcarTodos}>
              <TouchableOpacity onPress={() => marcarVisiveis(true)} disabled={gravando} accessibilityRole="button"><Text style={styles.link}>Marcar todos{filtro !== 'todos' || busca ? ' os filtrados' : ''}</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => marcarVisiveis(false)} disabled={gravando} accessibilityRole="button"><Text style={styles.link}>Desmarcar</Text></TouchableOpacity>
            </View>
            {visiveis.slice(0, limite).map((l) => {
              const feito = gravados.has(l.chave);
              const marcado = selecionados.has(l.chave);
              const falha = resultadoPorChave.get(l.chave);
              const corMotivo = l.acao === 'erro' ? cores.danger : l.acao === 'duplicado' ? cores.warning : cores.onSurfaceMuted;
              const icone = l.tipo === 'cliente' ? 'account-outline' : l.tipo === 'produto' ? 'package-variant-closed' : 'wrench-outline';
              return (
                <TouchableOpacity key={l.chave} style={[styles.linha, (feito || l.acao === 'erro') && styles.linhaInativa]} onPress={() => alternar(l)} disabled={feito || gravando || l.acao === 'erro'} accessibilityRole="checkbox" accessibilityState={{ checked: feito || marcado, disabled: feito || gravando || l.acao === 'erro' }} accessibilityLabel={`${l.rotulo}, ${l.nome}. ${l.motivo}`}>
                  <MaterialCommunityIcons name={feito ? 'check-circle' : l.acao === 'erro' ? 'close-circle-outline' : marcado ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={feito ? cores.success : l.acao === 'erro' ? cores.danger : marcado ? cores.primary : cores.onSurfaceMuted} />
                  <MaterialCommunityIcons name={icone} size={17} color={cores.accentLight} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linhaTitulo} numberOfLines={1}>{l.nome}</Text>
                    <Text style={styles.linhaSub} numberOfLines={1}>{l.rotulo}{l.detalhe ? ` · ${l.detalhe}` : ''}</Text>
                    {feito ? <Text style={[styles.linhaMotivo, { color: cores.success }]}>Importado</Text> : <Text style={[styles.linhaMotivo, { color: corMotivo }]}>{l.motivo}</Text>}
                    {!feito && l.avisos.map((a) => <Text key={a} style={styles.textoAviso}>{a}</Text>)}
                    {!feito && falha && !falha.ok && <Text style={[styles.linhaMotivo, { color: cores.danger }]}>{falha.erro}</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
            {visiveis.length > limite && <TouchableOpacity style={styles.mais} onPress={() => setLimite((n) => n + PAGINA)} accessibilityRole="button"><Text style={styles.link}>Mostrar mais ({visiveis.length - limite})</Text></TouchableOpacity>}
            {!visiveis.length && <Text style={styles.textoMudo}>Nenhuma linha neste filtro.</Text>}

            {progresso && <Text style={styles.textoMudo}>Gravando {progresso.feitos} de {progresso.total}…</Text>}
            <OlliButton
              label={gravando ? 'Importando…' : `Importar ${selecionados.size} selecionado${selecionados.size === 1 ? '' : 's'}`}
              variant="gradient" size="lg" fullWidth onPress={() => { void importar(); }}
              disabled={!conferida || gravando || selecionados.size === 0 || semPermissaoTipo} loading={gravando}
              icon={!gravando ? <MaterialCommunityIcons name="database-import-outline" size={20} color="#fff" /> : undefined}
              style={{ marginTop: Spacing.md }}
            />
          </View>
        )}

        {fonteLiberada && existentes !== 'carregando' && previa.length === 0 && (
          <Aviso cores={cores} styles={styles} tom="erro" texto={fotoIa ? 'A IA não encontrou cliente, serviço nem produto nesta foto. Tente uma foto mais nítida.' : 'Nenhuma linha para conferir neste arquivo.'} />
        )}

        {/* 4. RELATÓRIO */}
        {relatorio && (
          <View style={[styles.card, relatorio.falhas > 0 ? styles.cardErro : styles.cardOk]} accessibilityLiveRegion="polite">
            <Text style={styles.cardTitulo}>{origem === 'contatos' && relatorio.itens.length ? resumoImportacaoContatos(relatorio.gravados, previa.filter((l) => l.acao === 'duplicado' && !gravados.has(l.chave)).length, relatorio.falhas) : resumoRelatorio(relatorio)}</Text>
            {relatorio.itens.filter((i) => !i.ok).map((i) => <Text key={i.chave} style={[styles.texto, { color: cores.danger }]}>• {i.rotulo} ({i.nome}): {i.ok ? '' : i.erro}</Text>)}
            {errosDaPrevia.length > 0 && (
              <>
                <Text style={[styles.rotulo, { marginTop: Spacing.sm }]}>Linhas do arquivo que não entraram</Text>
                {errosDaPrevia.slice(0, 50).map((l) => <Text key={l.chave} style={styles.texto}>• {l.rotulo} ({l.nome}): {l.motivo}</Text>)}
                {errosDaPrevia.length > 50 && <Text style={styles.textoMudo}>…e mais {errosDaPrevia.length - 50}. Use o filtro “Erros” na prévia.</Text>}
              </>
            )}
            {relatorio.gravados > 0 && (
              <View style={styles.acoesFoto}>
                {tiposNaPrevia.has('cliente') && <OlliButton label="Ver clientes" variant="outline" size="sm" onPress={() => nav.navigate('Clientes')} />}
                {tiposNaPrevia.has('servico') && <OlliButton label="Ver serviços" variant="outline" size="sm" onPress={() => nav.navigate('Servicos')} />}
                {tiposNaPrevia.has('produto') && <OlliButton label="Ver produtos" variant="outline" size="sm" onPress={() => nav.navigate('Produtos')} />}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Aviso({ cores, styles, tom, texto }: { cores: Cores; styles: ReturnType<typeof criarEstilos>; tom: 'erro'; texto: string }) {
  return (
    <View style={[styles.aviso, tom === 'erro' && styles.avisoErro]} accessibilityRole="alert">
      <MaterialCommunityIcons name="alert-circle-outline" size={19} color={cores.danger} />
      <Text style={[styles.texto, { flex: 1 }]}>{texto}</Text>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.background },
  conteudo: { padding: Spacing.base, paddingBottom: 60, gap: Spacing.md },
  intro: { color: c.onSurfaceVariant, fontSize: 13, lineHeight: 19 },
  origens: { gap: 8 },
  origem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: Spacing.md, borderRadius: BorderRadius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline, minHeight: 64 },
  origemAtiva: { borderColor: c.primary, backgroundColor: c.primary + '14' },
  origemTitulo: { color: c.onSurface, fontSize: 14.5, fontWeight: '800' },
  origemSub: { color: c.onSurfaceMuted, fontSize: 12, marginTop: 2 },
  card: { padding: Spacing.base, borderRadius: BorderRadius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline, gap: 6 },
  cardOk: { borderColor: c.success + '66', backgroundColor: c.success + '10' },
  cardErro: { borderColor: c.danger + '55', backgroundColor: c.danger + '0D' },
  cardTitulo: { color: c.onSurface, fontSize: 15, fontWeight: '800', marginBottom: 2 },
  rotulo: { color: c.onSurface, fontSize: 13, fontWeight: '800', marginTop: Spacing.sm },
  texto: { color: c.onSurfaceVariant, fontSize: 12.5, lineHeight: 18 },
  textoMudo: { color: c.onSurfaceMuted, fontSize: 13, lineHeight: 17 },
  textoAviso: { color: c.warning, fontSize: 13, lineHeight: 17, marginTop: 2 },
  link: { color: c.accentLight, fontSize: 12.5, fontWeight: '800', paddingVertical: 6, minHeight: 44, textAlignVertical: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingVertical: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: c.outline, borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.surfaceVariant, minHeight: 44 },
  chipAtivo: { borderColor: c.primary, backgroundColor: c.primary + '22' },
  chipTexto: { color: c.onSurfaceVariant, fontSize: 12, fontWeight: '700' },
  chipTextoAtivo: { color: c.primaryLight },
  acoesFoto: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: Spacing.sm },
  carregando: { alignItems: 'center', gap: 8, paddingVertical: Spacing.base },
  aviso: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.warning + '55', backgroundColor: c.warning + '12' },
  avisoErro: { borderColor: c.danger + '55', backgroundColor: c.danger + '10' },
  linhaArquivo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  arquivoNome: { flex: 1, color: c.onSurface, fontSize: 13, fontWeight: '700' },
  campo: { borderBottomWidth: 1, borderBottomColor: c.outline },
  campoLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46 },
  campoRotulo: { color: c.onSurface, fontSize: 13, fontWeight: '700', flexShrink: 0 },
  campoValor: { flex: 1, textAlign: 'right', color: c.primaryLight, fontSize: 12.5, fontWeight: '700' },
  ddd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: Spacing.sm },
  dddInput: { width: 72, minHeight: 44, borderWidth: 1, borderColor: c.outline, borderRadius: BorderRadius.md, paddingHorizontal: 12, color: c.onSurface, fontSize: 15, textAlign: 'center', backgroundColor: c.background },
  busca: { minHeight: 44, borderWidth: 1, borderColor: c.outline, borderRadius: BorderRadius.md, paddingHorizontal: 12, color: c.onSurface, fontSize: 13, backgroundColor: c.background, marginTop: 4 },
  marcarTodos: { flexDirection: 'row', justifyContent: 'space-between' },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.outline, minHeight: 56 },
  linhaInativa: { opacity: 0.78 },
  linhaTitulo: { color: c.onSurface, fontSize: 13, fontWeight: '700' },
  linhaSub: { color: c.onSurfaceMuted, fontSize: 13, marginTop: 1 },
  linhaMotivo: { fontSize: 13, lineHeight: 17, marginTop: 2, fontWeight: '600' },
  mais: { alignItems: 'center', paddingVertical: 6 },
});
