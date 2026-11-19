// Primeira mensagem da ativação. Tom da Lívia, pessoa da equipe.
// Não diz que é IA (D-2022). Não pede "responda SAIR" (D-1392). Sem promessa.
// Preço só de tabela, e só nas duas contas em que o pagamento não concluiu.

export const LINK_APP = 'https://olliorcamentos.online';
export const OFERTA = 'Me fala o serviço e o valor que eu monto com você agora.';

const LUIZ = '8d2c59dd';
const MK = 'ac0f2c80';

export function id8(contaId) {
  return String(contaId ?? '').replace(/-/g, '').slice(0, 8).toLowerCase();
}

export function papelDe(pessoa) {
  if (pessoa?.papel === 'luiz' || pessoa?.papel === 'mk') return pessoa.papel;
  const id = id8(pessoa?.conta_id);
  // Só o prefixo da conta. Prioridade 0/null não pode virar o texto do pagamento.
  if (id.startsWith(LUIZ)) return 'luiz';
  if (id.startsWith(MK)) return 'mk';
  return '';
}

export function primeiroNome(nome) {
  const bruto = String(nome ?? '').trim().split(/\s+/)[0] ?? '';
  if (bruto.length < 2 || /^\+?\d+$/.test(bruto)) return '';
  return bruto.charAt(0).toUpperCase() + bruto.slice(1);
}

function oi(pessoa) {
  const nome = primeiroNome(pessoa?.nome);
  return nome ? `Oi ${nome}` : 'Oi';
}

function deOficio(pessoa) {
  const esp = String(pessoa?.especialidade ?? '').trim();
  return esp ? ` de ${esp}` : '';
}

export function mensagemAtivacao(pessoa) {
  const papel = papelDe(pessoa);
  if (papel === 'luiz') {
    return `${oi(pessoa)}, aqui é a Lívia, da OLLI. O pagamento do Pro (R$ 39) não chegou a concluir e nada foi cobrado. Dá para pagar por Pix no app, em Planos. Se a tela travou, me responde aqui. ${LINK_APP}`;
  }
  if (papel === 'mk') {
    return `${oi(pessoa)}, aqui é a Lívia, da OLLI. O pagamento do plano Empresa (R$ 99) no cartão não passou e nada foi cobrado. Dá para pagar por Pix no app, em Planos. Se quiser, eu também monto o próximo orçamento com você por aqui. ${LINK_APP}`;
  }
  const oficio = deOficio(pessoa);
  const etapa = String(pessoa?.etapa ?? 'cadastrou');
  const um = Number(pessoa?.orcamentos) === 1;
  let meio;
  if (etapa === 'orcamento' || (um && etapa !== 'enviado' && etapa !== 'aprovado')) {
    meio = `Seu orçamento${oficio} ficou parado no app. ${OFERTA}`;
  } else if (etapa === 'enviado') {
    meio = `Você já enviou um orçamento${oficio}. Quer fazer o próximo comigo? ${OFERTA}`;
  } else if (etapa === 'cliente' || etapa === 'perfil') {
    meio = `Sua conta${oficio} já está encaminhada e falta o primeiro orçamento. ${OFERTA}`;
  } else {
    meio = `Vi que você criou a conta${oficio} e ainda não saiu o primeiro orçamento. ${OFERTA}`;
  }
  return `${oi(pessoa)}, aqui é a Lívia, da OLLI. ${meio} O app: ${LINK_APP}`;
}
