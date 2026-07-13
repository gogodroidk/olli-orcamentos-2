/**
 * pixBrCode.ts — gera o "Pix Copia e Cola" (BR Code EMV, padrão BACEN/Pix) a partir
 * da chave Pix do prestador + valor. O cliente cola no app do banco (ou escaneia o
 * QR via `qrSvg`) e paga o valor EXATO, direto na conta do prestador.
 *
 * 100% LOCAL/OFFLINE: monta a string no aparelho, nunca sai dele, NÃO processa
 * pagamento nem toca Stripe/gateway. É o "pagar com gosto" sem custo nem risco — o
 * técnico gera o orçamento/recibo no meio da rua e o cliente paga na hora.
 *
 * Referência: EMV MPM (Merchant Presented Mode) + arranjo Pix (br.gov.bcb.pix).
 * O CRC16-CCITT (0x1021, init 0xFFFF) fecha o payload — errar 1 dígito = o banco
 * recusa o código, então a montagem é conservadora e testável (ver testes ao pé).
 */

/* eslint-disable no-bitwise */

/** Nome/cidade do BR Code só aceitam ASCII e têm teto — tira acento e limita. */
function limpar(txt: string, max: number): string {
  return (txt || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos (combinantes)
    .replace(/[^\x20-\x7E]/g, '') // só ASCII imprimível
    .toUpperCase()
    .trim()
    .slice(0, max);
}

/** Campo EMV: id (2) + tamanho (2 dígitos, com zero à esquerda) + valor. */
function campo(id: string, valor: string): string {
  const len = valor.length.toString().padStart(2, '0');
  return `${id}${len}${valor}`;
}

/** CRC16-CCITT (polinômio 0x1021, init 0xFFFF) de `s`, em 4 hex MAIÚSCULOS. */
export function crc16(s: string): string {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface PixParams {
  /** Chave Pix do recebedor (CPF/CNPJ só dígitos, e-mail, telefone +55…, ou aleatória). */
  chave: string;
  /** Valor em R$. Ausente/0 = valor livre (o cliente digita no banco). */
  valor?: number;
  /** Nome do recebedor (máx. 25, ASCII maiúsculo). */
  nome: string;
  /** Cidade do recebedor (máx. 15). */
  cidade: string;
  /** Referência/txid (máx. 25). Default '***' (sem conciliação). */
  txid?: string;
}

/**
 * Monta o Pix Copia e Cola. Devolve '' quando não há chave (o chamador esconde o
 * bloco em vez de mostrar um código quebrado). Nunca lança.
 */
export function gerarPixCopiaECola({ chave, valor, nome, cidade, txid }: PixParams): string {
  const key = (chave || '').trim();
  if (!key) return '';

  // Conta Pix (ID 26): GUI fixa + a chave. A chave NÃO é alterada (case pode importar).
  const merchantAccount = campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', key));

  // Campo adicional (ID 62 → subID 05 = txid). '***' = sem identificador de conciliação.
  const txidLimpo = limpar(txid || '***', 25) || '***';
  const adicional = campo('62', campo('05', txidLimpo));

  const payload =
    campo('00', '01') + // Payload Format Indicator
    merchantAccount +
    campo('52', '0000') + // Merchant Category Code (não especificado)
    campo('53', '986') + // moeda = BRL
    (valor && valor > 0 ? campo('54', valor.toFixed(2)) : '') + // valor fixo (opcional)
    campo('58', 'BR') + // país
    campo('59', limpar(nome, 25) || 'RECEBEDOR') +
    campo('60', limpar(cidade, 15) || 'BRASIL') +
    adicional +
    '6304'; // ID+tam do CRC; o valor de 4 hex entra logo após

  return payload + crc16(payload);
}
