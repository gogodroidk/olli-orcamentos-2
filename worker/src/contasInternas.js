/**
 * Contas INTERNAS × CLIENTES no painel ADM (07/10/2026). Puro, sem rede — testável.
 *
 * "Interna" = a MESMA regra do funil de receita (assinaturasPagantes.js → motivoContaInterna): e-mail do dono
 * (ADMIN_EMAIL), `funil_exclusoes` (por id ou e-mail), administrador e etiqueta/domínio de teste.
 * No banco a pergunta é `public.conta_interna`. O placar não a chama: repete a regra aqui.
 *
 * ERRO NUNCA VIRA "CLIENTE": se a lista de internas não pôde ser lida (`leituraOk = false`), o escopo é
 * 'indeterminado' — nenhum número é apresentado como "só clientes" (o painel avisa), em vez de contar a conta do
 * Igor como cliente em silêncio.
 */
import { motivoContaInterna } from './assinaturasPagantes.js';

/** @returns {{ interna: boolean, motivo: string|null }} */
export function classificarConta(userId, email, contexto) {
  const motivo = motivoContaInterna(userId, email, contexto);
  return { interna: motivo !== null, motivo };
}

/**
 * Separa as contas. `leituraOk=false` → nada é marcado como interna e o escopo é 'indeterminado'.
 * @returns {{ escopo: 'confirmado'|'indeterminado', clientes: object[], internas: object[], idsInternas: Set<string> }}
 */
export function particionarContas(users, contexto, leituraOk = true) {
  const clientes = [];
  const internas = [];
  const idsInternas = new Set();
  for (const u of users) {
    if (leituraOk && classificarConta(u.id, u.email, contexto).interna) {
      internas.push(u);
      idsInternas.add(u.id);
    } else {
      clientes.push(u);
    }
  }
  return { escopo: leituraOk ? 'confirmado' : 'indeterminado', clientes, internas, idsInternas };
}

/** Linhas (orçamentos, clientes, atividades…) que pertencem a conta de CLIENTE. */
export function soDeClientes(linhas, idsInternas, campo = 'user_id') {
  if (!idsInternas || idsInternas.size === 0) return linhas;
  return linhas.filter((l) => !idsInternas.has(l?.[campo]));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

/**
 * Prévia da organização para a tela: troca ids por e-mail (só o que o admin já vê na lista) e mantém os números que
 * o banco calculou. Se o banco mandou algo fora do formato, devolve null (a rota responde erro; nunca uma prévia torta).
 */
export function montarPreviaOrg(previa, emailPorId) {
  if (!previa || previa.ok !== true) return null;
  const n = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
  const total = n(previa.total_membros);
  const serao = n(previa.serao_marcadas);
  const preservadas = n(previa.preservadas);
  const ja = n(previa.ja_internas);
  if ([total, serao, preservadas, ja].some((v) => v === null)) return null;
  const rotulo = (ids) => (Array.isArray(ids) ? ids.filter(ehUuid).map((id) => ({ id, email: emailPorId.get(id) || '' })) : []);
  return {
    orgId: String(previa.org_id || ''),
    nome: typeof previa.nome === 'string' ? previa.nome.slice(0, 120) : '',
    jaMarcada: previa.ja_marcada === true,
    totalMembros: total,
    seraoMarcadas: serao,
    preservadas,
    jaInternas: ja,
    marcar: rotulo(previa.marcar_ids),
    preservar: rotulo(previa.preservadas_ids),
  };
}

/** Valida o corpo de POST /admin/api/org/interna. */
export function validarPedidoOrg(body) {
  if (!body || typeof body !== 'object') return { erro: 'payload_invalido' };
  if (!ehUuid(body.id)) return { erro: 'sem_id' };
  const interna = body.interna === true;
  const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : '';
  if (interna) {
    if (!Number.isInteger(body.confirmar) || body.confirmar < 0) return { erro: 'confirmacao_obrigatoria' };
    if (motivo.length < 3 || motivo.length > 200) return { erro: 'motivo_invalido' };
  }
  return { id: body.id, interna, confirmar: interna ? body.confirmar : null, motivo: motivo.slice(0, 200) };
}
