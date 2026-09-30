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
  // No Pix estático o txid só aceita letras e dígitos: um "2026-0012" com hífen faz
  // parte dos bancos recusarem o código inteiro. Por isso o número do documento entra
  // só com [A-Z0-9]; sem sobrar nada, cai no '***' (sem conciliação, sempre aceito).
  const txidLimpo = txid ? limpar(txid, 64).replace(/[^A-Z0-9]/g, '').slice(0, 25) || '***' : '***';
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

/* ═══════════════  CHAVE PIX: reconhecer antes de embutir  ═══════════════ */

/** Os cinco tipos de chave do DICT (BACEN). */
export type TipoChavePix = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';

export interface ChavePixNormalizada {
  /** A chave no formato que o DICT guarda (é ela que entra no BR Code). */
  chave: string;
  tipo: TipoChavePix;
}

/** Dígito verificador de CPF/CNPJ (módulo 11) para os pesos dados. */
function dvMod11(digitos: string, pesos: number[]): number {
  let soma = 0;
  for (let i = 0; i < pesos.length; i++) soma += Number(digitos[i]) * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cpfValido(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const dv1 = dvMod11(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = dvMod11(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return dv1 === Number(d[9]) && dv2 === Number(d[10]);
}

export function cnpjValido(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const dv1 = dvMod11(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = dvMod11(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return dv1 === Number(d[12]) && dv2 === Number(d[13]);
}

/**
 * Reconhece a chave Pix que o prestador digitou e devolve no formato do DICT — ou
 * `null` quando não dá para ter certeza de que é uma chave de verdade.
 *
 * POR QUE EXISTE: o BR Code embute a chave CRUA. Uma chave "(11) 98888-7777" ou
 * "123.456.789-09" gera um código com CRC perfeito que o banco do cliente RECUSA
 * (a chave não existe com essa máscara). Para o cliente, é o Pix do prestador que
 * "não funciona". Dinheiro é fail-closed: chave que não reconhecemos NÃO vira Pix —
 * quem chama manda a cobrança sem Pix e pede para o prestador conferir a chave.
 *
 * AMBIGUIDADE CPF × CELULAR (11 dígitos nos dois): parênteses ou "+" indicam telefone;
 * senão, CPF com dígito verificador válido é CPF; senão, 11 dígitos com o 9 do
 * celular na 3ª posição é celular (+55). Nunca lança.
 */
export function normalizarChavePix(bruta: string | null | undefined): ChavePixNormalizada | null {
  const s = (bruta ?? '').trim();
  if (!s || s.length > 99) return null;

  // Chave aleatória (EVP): UUID em minúsculas.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return { chave: s.toLowerCase(), tipo: 'aleatoria' };
  }
  // E-mail (o DICT limita a 77 caracteres).
  if (s.includes('@')) {
    const email = s.toLowerCase();
    return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email) && email.length <= 77
      ? { chave: email, tipo: 'email' }
      : null;
  }
  // Daqui em diante só sobra número: qualquer letra = não é chave que conhecemos.
  if (!/^[\d\s().+/-]+$/.test(s)) return null;
  const d = s.replace(/\D/g, '');

  if (s.startsWith('+')) {
    return /^55\d{10,11}$/.test(d) ? { chave: `+${d}`, tipo: 'telefone' } : null;
  }
  if (d.length === 14) return cnpjValido(d) ? { chave: d, tipo: 'cnpj' } : null;
  if (d.length === 11 && !s.includes('(') && cpfValido(d)) return { chave: d, tipo: 'cpf' };
  if (d.length === 11 && d[2] === '9') return { chave: `+55${d}`, tipo: 'telefone' };
  if (d.length === 13 && d.startsWith('55') && d[4] === '9') return { chave: `+${d}`, tipo: 'telefone' };
  return null;
}

/**
 * Confere um Pix Copia e Cola por inteiro: campos EMV bem formados (id + tamanho +
 * valor, sem sobra), arranjo `br.gov.bcb.pix` com chave, moeda 986, país BR e o CRC16
 * batendo com o resto do código. É a trava final antes de o código sair do aparelho:
 * se algo na montagem der errado, a mensagem vai SEM Pix — nunca com um Pix quebrado.
 */
export function pixCopiaEColaValido(codigo: string | null | undefined): boolean {
  const s = codigo ?? '';
  if (s.length < 30 || !/^[\x20-\x7E]+$/.test(s)) return false;
  const corpo = s.slice(0, -4);
  if (!corpo.endsWith('6304') || crc16(corpo) !== s.slice(-4)) return false;

  const campos = new Map<string, string>();
  let i = 0;
  const fim = corpo.length - 4; // o '6304' final é o cabeçalho do próprio CRC
  while (i < fim) {
    const id = corpo.slice(i, i + 2);
    const tamTxt = corpo.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(tamTxt)) return false;
    const tam = Number(tamTxt);
    if (i + 4 + tam > fim) return false;
    campos.set(id, corpo.slice(i + 4, i + 4 + tam));
    i += 4 + tam;
  }

  const conta = campos.get('26') ?? '';
  const valorPix = campos.get('54');
  return (
    campos.get('00') === '01' &&
    /^0014br\.gov\.bcb\.pix01\d{2}./.test(conta) &&
    campos.get('53') === '986' &&
    campos.get('58') === 'BR' &&
    (valorPix === undefined || /^\d+\.\d{2}$/.test(valorPix))
  );
}
