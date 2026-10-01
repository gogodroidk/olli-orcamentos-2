/**
 * Status da GERAÇÃO AUTOMÁTICA de visitas dos contratos (B09 / item 1.17).
 *
 * O motor do servidor (worker/src/contratosJob.js) só roda com
 * CONTRATOS_MOTOR_MODE=production e publica o modo no GET / do worker
 * (`contratos_motor: 'on' | 'off'`). Ligar é decisão do dono; até lá a tela de
 * Contratos tem de dizer que está desligado em vez de prometer automação.
 *
 * Três estados, nunca colapsados: `ligado` | `desligado` | `desconhecido` (sem rede,
 * worker antigo sem o campo, app sem URL do worker). "Não sei" NÃO vira "ligado".
 *
 * Fatos usados na copy (derivados do código, não de memória):
 *  - servidor: rodadas às 06:05, 12:05 e 18:05 de Brasília (CONTRATOS_HORAS_BRASILIA);
 *  - app: gera ao abrir, para quem é gestão (`gerarVisitasAutomatico` no sync) e no
 *    botão "Conferir visitas agora" da própria tela.
 */
export type StatusMotorContratos = 'ligado' | 'desligado' | 'desconhecido';

/** Lê o corpo do GET / do worker. Qualquer coisa fora do contrato = desconhecido. */
export function interpretarStatusMotor(corpo: unknown): StatusMotorContratos {
  if (!corpo || typeof corpo !== 'object') return 'desconhecido';
  const valor = (corpo as { contratos_motor?: unknown }).contratos_motor;
  if (valor === 'on') return 'ligado';
  if (valor === 'off') return 'desligado';
  return 'desconhecido';
}

export interface FraseMotorContratos {
  titulo: string;
  texto: string;
}

/** O aviso da tela de Contratos para cada estado do motor. */
export function fraseMotorContratos(status: StatusMotorContratos): FraseMotorContratos {
  switch (status) {
    case 'ligado':
      return {
        titulo: 'Geração automática de visitas: ligada',
        texto: 'O OLLI coloca as visitas dos contratos na agenda às 6h, 12h e 18h, mesmo com o app fechado.',
      };
    case 'desligado':
      return {
        titulo: 'Geração automática de visitas: desligada — agende manualmente',
        texto:
          'Com o app fechado, nenhuma visita nasce sozinha. Elas entram na agenda quando alguém da gestão abre o OLLI ou toca em "Conferir visitas agora". Se faltar alguma, agende pela Agenda.',
      };
    default:
      return {
        titulo: 'Não consegui confirmar a geração automática de visitas',
        texto: 'Toque em "Conferir visitas agora" e, se faltar alguma visita, agende manualmente pela Agenda.',
      };
  }
}

/** Texto do estado vazio (nenhum contrato ainda), sem prometer o que está desligado. */
export function convitePrimeiroContrato(status: StatusMotorContratos): string {
  return status === 'ligado'
    ? 'Cadastre a manutenção do cliente uma vez: o OLLI coloca cada visita na agenda sozinho e deixa a cobrança pronta no WhatsApp, com o seu Pix quando ele estiver cadastrado.'
    : 'Cadastre a manutenção do cliente uma vez: as visitas entram na agenda quando você abre o OLLI ou toca em "Conferir visitas agora", e a cobrança sai pronta no WhatsApp, com o seu Pix quando ele estiver cadastrado.';
}
