/**
 * PARTES PURAS do link público do orçamento (`orcamentos_publicos`): token, snapshot que a página
 * do cliente (/o/<token>) lê e dados do Pix do prestador.
 *
 * Moradia própria (extraído de `clienteLink.ts`, 06/10/2026) porque o PAINEL WEB também publica o
 * link ("Enviar pelo WhatsApp") e não pode importar `clienteLink.ts`: ele puxa supabase +
 * async-storage + SQLite do app. Aqui só há TypeScript puro (imports `.ts` explícitos e só
 * tipos de domínio), igual a `mensagensOrcamento.ts`, então roda no app, no painel e em Node.
 * O app continua chamando as MESMAS funções — nada mudou de comportamento.
 */
import type { Empresa, Orcamento } from '../types';
import { normalizarChavePix } from '../utils/pixBrCode.ts';
import { chavePixDoOrcamento, type CobrancaDoLink } from '../utils/cobrancaCliente.ts';

/**
 * Token do link público com aleatoriedade CRIPTOGRÁFICA forte (16 bytes = 128
 * bits) — é a ÚNICA proteção do link que expõe dados do orçamento, então NÃO
 * pode ser previsível (o antigo `Math.random()`/UUID dava ~48 bits). Usa
 * `globalThis.crypto.getRandomValues` (disponível na web e no Hermes novo); cai
 * para o gerador de id só se, em algum runtime exótico, `crypto` faltar.
 * Saída: base64url SEM padding (16 bytes → 22 chars).
 */
export function gerarTokenLink(fallbackId?: () => string): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as any)?.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    // Fallback defensivo (não deve ocorrer em web/Hermes): deriva bytes do UUID.
    if (!fallbackId) throw new Error('Sem gerador aleatório seguro neste ambiente: não dá para criar o link do cliente.');
    const hex = fallbackId().replace(/-/g, '');
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2) || '0', 16) & 0xff;
    }
  }
  return base64url(bytes);
}

const ALFABETO_B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Converte bytes em base64url (A–Z a–z 0–9 - _) sem padding `=`.
 *
 * Implementado em ES puro, de propósito. A versão anterior tentava `btoa`, depois
 * `Buffer`, e — se nenhum existisse — devolvia a string BINÁRIA CRUA como se fosse
 * base64: sem lançar, sem avisar, gerando um token corrompido. Nem o React Native
 * 0.85 nem nenhuma dependência instalam `btoa` ou `Buffer` como global (verificado
 * varrendo `node_modules`), então esse ramo dependia do motor. Este token é a ÚNICA
 * proteção do link que expõe dados do orçamento ao cliente: ele não pode depender de
 * o Hermes expor uma função. Base64 é aritmética de bits — trinta linhas resolvem, e
 * a pergunta "o ambiente tem btoa?" deixa de existir.
 */
function base64url(bytes: Uint8Array): string {
  let saida = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;

    saida += ALFABETO_B64URL[b0 >> 2];
    saida += ALFABETO_B64URL[((b0 & 0x03) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    if (b1 === undefined) break; // 1 byte restante → 2 chars, sem padding
    saida += ALFABETO_B64URL[((b1 & 0x0f) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    if (b2 === undefined) break; // 2 bytes restantes → 3 chars, sem padding
    saida += ALFABETO_B64URL[b2 & 0x3f];
  }
  return saida;
}

export function snapshotPublico(orc: Orcamento, empresa: Empresa | null, cobranca: CobrancaDoLink) {
  return {
    numero: orc.numero,
    revisaoDeNumero: orc.revisaoDeNumero ?? '',
    clienteNome: orc.clienteNome,
    valorTotal: orc.valorTotal,
    subtotal: orc.subtotal,
    desconto: orc.desconto ?? 0,
    dataEmissao: orc.dataEmissao ?? orc.criadoEm ?? '',
    corMarca: orc.corMarca ?? '#0B6FCE',
    modeloPdf: orc.modeloPdf ?? 'editorial',
    modeloNome: orc.modeloNome ?? '',
    exibirAprovacao: orc.exibirAprovacao !== false,
    exibirRecusa: orc.exibirRecusa !== false,
    exibirAssinatura: orc.exibirAssinatura !== false,
    solicitarAssinaturaCliente: orc.solicitarAssinaturaCliente === true,
    prestador: {
      nome: empresa?.nome ?? '',
      whatsapp: empresa?.whatsapp ?? '',
      telefone: empresa?.telefone ?? '',
      // Tagline/especialidade que aparece sob o nome no cabeçalho do Link.
      tagline: empresa?.especialidade ?? empresa?.slogan ?? '',
    },
    itens: orc.itens.map(i => ({
      nome: i.nome,
      descricao: i.descricao ?? '',
      quantidade: i.quantidade,
      unidade: i.unidade,
      preco: i.preco,
      subtotal: i.subtotal,
      // Marca itens de produto/peça para o badge "PEÇA".
      isPeca: i.tipo === 'produto',
    })),
    validade: orc.validadeOrcamento ?? '',
    garantia: orc.garantia ?? '',
    // Campo legado preservado no contrato de dados; na interface é exibido como
    // condição comercial, não como meio de cobrança da OLLI.
    condicoesPagamento: orc.condicoesPagamento ?? '',
    // "Prazo" para o mini-card (agendamento / prestação do serviço, se houver).
    prazo: orc.agendamentoServico ?? orc.dataPrestacaoServico ?? '',
    // "Pagar com Pix" na página do cliente — só aparece DEPOIS da aprovação, e o BR
    // Code (com o valor) é montado no worker a partir destes três campos. Só vai a
    // chave que reconhecemos (`normalizarChavePix`): chave duvidosa não sai do
    // aparelho, e a página cai no "combine o pagamento com o prestador".
    pix: pixPublico(orc, empresa),
    // Quanto e quando cobrar (ver `cobrancaDoLink`): o status do app (decisão do
    // prestador), `cobrarAgora` (fechado no app com valor a receber → a página mostra o
    // Pix mesmo sem o cliente ter tocado "Aprovar"), `valorACobrar` (entrada ou saldo;
    // `null` = não sei quanto já foi pago → a página não monta Pix) e o sinal.
    statusApp: cobranca.statusApp,
    cobrarAgora: cobranca.cobrarAgora,
    valorACobrar: cobranca.valorACobrar,
    cobrancaTipo: cobranca.cobrancaTipo,
    sinal: cobranca.sinal,
  };
}

/**
 * Os dados do Pix do PRESTADOR para a página pública (pagamento do serviço dele,
 * direto na conta dele — o OLLI não intermedeia). `null` sem chave válida.
 */
export function pixPublico(orc: Orcamento, empresa: Empresa | null): { chave: string; nome: string; cidade: string } | null {
  const chave = normalizarChavePix(chavePixDoOrcamento(orc, empresa));
  if (!chave) return null;
  return {
    chave: chave.chave,
    nome: empresa?.nome || empresa?.nomePrestador || '',
    cidade: empresa?.cidade || '',
  };
}

/**
 * O que vai nas colunas de `orcamentos_publicos` (fora `status`, que é a resposta do CLIENTE e só o
 * worker escreve) + o snapshot `dados` que a página /o/<token> renderiza. UMA definição para o app
 * e para o painel: se os dois montassem à mão, a página do cliente leria campos diferentes
 * conforme quem enviou.
 */
export function conteudoDoLink(orc: Orcamento, empresa: Empresa | null, cobranca: CobrancaDoLink) {
  return {
    numero: orc.numero,
    cliente_nome: orc.clienteNome,
    valor_total: orc.valorTotal,
    prestador_nome: empresa?.nome ?? '',
    prestador_whatsapp: (empresa?.whatsapp ?? '').replace(/\D/g, ''),
    dados: snapshotPublico(orc, empresa, cobranca),
  };
}
