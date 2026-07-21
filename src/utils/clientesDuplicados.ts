// Detecção de cliente duplicado — mesmo critério do painel web
// (webapp/src/pages/olli/clientes/FormCliente.tsx): telefone com DDD+número
// completo (>=10 dígitos) OU CPF/CNPJ completo (>=11 dígitos) batendo com
// outro cadastro já ativo. Avisa, NUNCA bloqueia — dois clientes podem
// legitimamente dividir telefone (marido/esposa, duas filiais da mesma
// empresa). A decisão de cadastrar mesmo assim é sempre do usuário.
import { Cliente } from '../types';

const onlyDigits = (v?: string | null): string => (v ?? '').replace(/\D/g, '');

export interface CandidatoCliente {
  telefone?: string;
  cpf?: string;
  cnpj?: string;
}

/**
 * Até 3 clientes ATIVOS que colidem em telefone ou CPF/CNPJ com o candidato
 * (campos ainda sendo digitados no formulário). `excluirId` evita que um
 * cliente em edição se acuse de ser duplicata de si mesmo.
 */
export function encontrarClientesDuplicados(
  todos: Cliente[],
  candidato: CandidatoCliente,
  excluirId?: string,
): Cliente[] {
  const tel = onlyDigits(candidato.telefone);
  const doc = onlyDigits(candidato.cpf) || onlyDigits(candidato.cnpj);
  const temTel = tel.length >= 10;
  const temDoc = doc.length >= 11;
  if (!temTel && !temDoc) return [];

  return todos
    .filter(c => c.id !== excluirId)
    .filter(c => {
      if (temTel && onlyDigits(c.telefone) === tel) return true;
      if (temDoc) {
        const d = onlyDigits(c.cpf) || onlyDigits(c.cnpj);
        if (d && d === doc) return true;
      }
      return false;
    })
    .slice(0, 3);
}
