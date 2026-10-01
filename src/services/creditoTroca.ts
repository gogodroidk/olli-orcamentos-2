/**
 * Crédito de troca ("Vim de outro app") — lado do APP (rede + arquivo).
 *
 * Fluxo: o prestador escolhe o print → a imagem é reduzida no aparelho (JPEG,
 * lado maior 1600 px) → sobe para o bucket PRIVADO `olli-documentos` na pasta
 * dele (StorageProvider existente) → a RPC `solicitar_credito_troca` grava o
 * pedido. Se a RPC recusar, tenta apagar o arquivo enviado (best-effort). Hoje o
 * bucket `olli-documentos` não tem policy de DELETE para o cliente, então a remoção
 * pode não surtir efeito; por isso a tela só mostra o formulário quando o estado
 * lido do servidor permite pedir (recusa da RPC vira caso raro, não o caminho comum).
 *
 * Regras puras e textos: `creditoTrocaRegras.ts`.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';
import { supabase, getCurrentUser } from './supabase';
import { supabaseStorageProvider } from './adapters/SupabaseStorageProvider';
import { invalidarCachePlano } from './planos';
import {
  interpretarPedidoTroca,
  pedidoVigente,
  dataBrParaIso,
  mensagemErroTroca,
  type EstadoPedidoTroca,
  type PedidoTroca,
} from './creditoTrocaRegras';

const LADO_MAX = 1600;
const ORIGINAL_MAX_BYTES = 25 * 1024 * 1024;
// Abaixo do limite de 20 MB do bucket, com folga; um print em JPEG fica bem menor.
const ENVIO_MAX_BASE64 = 6 * 1024 * 1024;

export interface ComprovantePreparado {
  base64: string;
  /** URI local para pré-visualizar na tela. */
  uri: string;
}

/** Reduz e converte o print escolhido. Nunca lança. */
export async function prepararComprovante(
  asset: ImagePickerAsset,
): Promise<{ ok: true; comprovante: ComprovantePreparado } | { ok: false; erro: string }> {
  try {
    if (!asset?.uri || (asset.type && asset.type !== 'image')) return { ok: false, erro: 'Escolha uma imagem (print ou foto).' };
    if (typeof asset.fileSize === 'number' && asset.fileSize > ORIGINAL_MAX_BYTES) {
      return { ok: false, erro: 'A imagem passa de 25 MB. Escolha um print ou uma foto menor.' };
    }
    const contexto = ImageManipulator.manipulate(asset.uri);
    const largura = Number(asset.width) || 0;
    const altura = Number(asset.height) || 0;
    if (Math.max(largura, altura) > LADO_MAX) {
      contexto.resize(largura >= altura ? { width: LADO_MAX, height: null } : { width: null, height: LADO_MAX });
    }
    const imagem = await contexto.renderAsync();
    for (const compress of [0.8, 0.6]) {
      const salvo = await imagem.saveAsync({ base64: true, format: SaveFormat.JPEG, compress });
      if (salvo.base64 && salvo.base64.length <= ENVIO_MAX_BASE64) {
        return { ok: true, comprovante: { base64: salvo.base64, uri: salvo.uri } };
      }
    }
    return { ok: false, erro: 'Não consegui deixar a imagem leve o bastante. Recorte o print e tente de novo.' };
  } catch {
    return { ok: false, erro: 'Não consegui ler essa imagem. Tente outra.' };
  }
}

/** Lê os pedidos do próprio usuário (RLS: só o dono vê). Três estados. */
export async function obterMeuPedidoTroca(): Promise<EstadoPedidoTroca> {
  if (!supabase) return { tipo: 'indisponivel' };
  const usuario = await getCurrentUser();
  if (!usuario) return { tipo: 'sem_sessao' };
  try {
    const { data, error } = await supabase
      .from('creditos_troca')
      .select('id, status, app_anterior, vence_em, meses_concedidos, concedido_ate, motivo_recusa, criado_em')
      .eq('user_id', usuario.id)
      .order('criado_em', { ascending: false })
      .limit(20);
    if (error || !Array.isArray(data)) return { tipo: 'indisponivel' };
    const pedidos = data.map(interpretarPedidoTroca).filter((p): p is PedidoTroca => p !== null);
    // Linha que não reconheço não pode sumir calada: melhor dizer "não sei".
    if (pedidos.length !== data.length) return { tipo: 'indisponivel' };
    const vigente = pedidoVigente(pedidos);
    // Aprovado = o plano mudou no servidor: o cache local de plano não pode segurar o Grátis.
    if (vigente?.status === 'aprovado') invalidarCachePlano();
    return { tipo: 'pronto', pedido: vigente, totalPedidos: pedidos.length };
  } catch {
    return { tipo: 'indisponivel' };
  }
}

export interface EnvioTroca {
  appAnterior: string;
  venceEm: string; // dd/mm/aaaa ou vazio
  observacao: string;
  comprovante: ComprovantePreparado;
}

/**
 * Sobe o comprovante e grava o pedido. Devolve mensagem pronta em caso de erro;
 * `recusadoPeloServidor` = a RPC recusou por regra (ex.: já tem pedido em análise),
 * então vale reler o estado; falha de rede não relê (a tela manteria o erro).
 */
export async function enviarPedidoTroca(
  envio: EnvioTroca,
): Promise<{ ok: true } | { ok: false; erro: string; recusadoPeloServidor?: boolean }> {
  if (!supabase) return { ok: false, erro: 'Sem conexão com o servidor do OLLI agora.' };
  const usuario = await getCurrentUser();
  if (!usuario) return { ok: false, erro: mensagemErroTroca('sessao_obrigatoria') };
  const venceIso = dataBrParaIso(envio.venceEm);
  if (venceIso === null) return { ok: false, erro: mensagemErroTroca('vencimento_invalido') };

  // tenantId = o PRÓPRIO usuário: o comprovante é documento pessoal dele, não da empresa.
  const arquivo = await supabaseStorageProvider.enviar({
    categoria: 'anexo',
    tenantId: usuario.id,
    conteudoBase64: envio.comprovante.base64,
    mimeType: 'image/jpeg',
    nome: 'comprovante-troca.jpg',
  });
  if (!arquivo.ok) {
    return { ok: false, erro: 'Não consegui enviar o comprovante. Confira a internet e tente de novo.' };
  }
  try {
    const { error } = await supabase.rpc('solicitar_credito_troca', {
      p_app_anterior: envio.appAnterior.trim(),
      p_vence_em: venceIso || null,
      p_observacao: envio.observacao.trim() || null,
      p_comprovante_chave: arquivo.dados.chave,
    });
    if (error) {
      // P0001 = `raise exception` da RPC: o servidor RECUSOU e desfez tudo, então o
      // arquivo ficaria órfão. Erro de rede é diferente: o pedido pode ter sido
      // gravado, e apagar o arquivo deixaria o pedido sem comprovante.
      const recusadoPeloServidor = error.code === 'P0001';
      if (recusadoPeloServidor) await supabaseStorageProvider.remover(arquivo.dados.chave).catch(() => undefined);
      return { ok: false, erro: mensagemErroTroca(error), recusadoPeloServidor };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErroTroca(e) };
  }
}
