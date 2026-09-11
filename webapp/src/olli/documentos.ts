import type { Empresa, Orcamento } from "@dominio";
import { supabase } from "@/lib/supabase";

type TipoDocumentoWeb = "contrato" | "garantia" | "conclusao" | "laudo" | "checklist" | "certificado";

/**
 * Registra uma versão de documento gerado pelo painel. O PDF continua sendo
 * entregue pelo navegador; este registro guarda o snapshot que originou a
 * impressão e nunca sobrescreve um documento já enviado/assinado.
 */
export async function registrarDocumentoWeb(input: {
  tipo: TipoDocumentoWeb;
  titulo: string;
  orcamento: Orcamento;
  empresa: Empresa;
  dados: Record<string, unknown>;
  status?: "rascunho" | "pronto";
}): Promise<{ id: string; versao: number }> {
  const sessao = await supabase.auth.getSession();
  const userId = sessao.data.session?.user?.id;
  if (!userId) throw new Error("sessao_obrigatoria");
  const origem = { origem_tipo: "orcamento", origem_id: input.orcamento.id };
  const existenteQuery = await supabase
    .from("documentos")
    .select("id,status,versao_atual,dados,cliente_id,cliente_nome,origem_numero")
    .match({ tipo: input.tipo, ...origem })
    .is("excluido_em", null)
    .maybeSingle();
  if (existenteQuery.error) throw existenteQuery.error;
  const existente = existenteQuery.data;
  if (existente && ["enviado", "assinado", "arquivado"].includes(String(existente.status))) {
    return { id: existente.id, versao: Number(existente.versao_atual ?? 1) };
  }
  const agora = new Date().toISOString();
  if (!existente) {
    const id = crypto.randomUUID();
    const versao = {
      id: crypto.randomUUID(), documento_id: id, user_id: userId, numero_versao: 1,
      dados: input.dados, criado_por: userId, criado_em: agora,
    };
    const documento = {
      id, user_id: userId, criado_por: userId, tipo: input.tipo, status: input.status ?? "pronto",
      titulo: input.titulo.trim(), cliente_id: input.orcamento.clienteId ?? null,
      cliente_nome: input.orcamento.clienteNome ?? "", origem_tipo: "orcamento",
      origem_id: input.orcamento.id, origem_numero: input.orcamento.numero,
      versao_atual: 1, dados: input.dados, criado_em: agora, atualizado_em: agora,
    };
    const criado = await supabase.from("documentos").insert(documento);
    if (criado.error) throw criado.error;
    const versaoCriada = await supabase.from("documento_versoes").insert(versao);
    if (versaoCriada.error) throw versaoCriada.error;
    return { id, versao: 1 };
  }

  const versoesQuery = await supabase.from("documento_versoes").select("numero_versao").eq("documento_id", existente.id).order("numero_versao", { ascending: false }).limit(1);
  if (versoesQuery.error) throw versoesQuery.error;
  const versao = Math.max(Number(existente.versao_atual ?? 1), Number(versoesQuery.data?.[0]?.numero_versao ?? 0)) + 1;
  const novaVersao = await supabase.from("documento_versoes").insert({
    id: crypto.randomUUID(), documento_id: existente.id, user_id: userId, numero_versao: versao,
    dados: input.dados, criado_por: userId, criado_em: agora,
  });
  if (novaVersao.error) throw novaVersao.error;
  const atualizado = await supabase.from("documentos").update({
    dados: input.dados, versao_atual: versao, status: input.status ?? "pronto", atualizado_em: agora,
  }).eq("id", existente.id).eq("user_id", userId);
  if (atualizado.error) throw atualizado.error;
  return { id: existente.id, versao };
}
