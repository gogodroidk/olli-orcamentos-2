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

export type DocumentoWebEditavel = {
  id: string;
  titulo: string;
  status: "rascunho" | "pronto" | "enviado" | "assinado" | "arquivado";
  versao: number;
  dados: Record<string, unknown>;
};

/** Lê o snapshot atual para o editor — o blob completo, nunca só os espelhos. */
export async function buscarDocumentoWeb(id: string): Promise<DocumentoWebEditavel> {
  const { data, error } = await supabase
    .from("documentos")
    .select("id,titulo,status,versao_atual,dados")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.id) throw new Error("documento_nao_encontrado");
  const status = String(data.status) as DocumentoWebEditavel["status"];
  if (!["rascunho", "pronto", "enviado", "assinado", "arquivado"].includes(status)) {
    throw new Error("status_documento_invalido");
  }
  return {
    id: String(data.id),
    titulo: String(data.titulo ?? ""),
    status,
    versao: Number(data.versao_atual ?? 1),
    dados: data.dados && typeof data.dados === "object" && !Array.isArray(data.dados) ? data.dados as Record<string, unknown> : {},
  };
}

/**
 * Salva um rascunho pela RPC transacional. A nova versão e o ponteiro do
 * documento são criados juntos; o banco rejeita estados congelados.
 */
export async function editarDocumentoWeb(input: {
  id: string;
  titulo: string;
  dados: Record<string, unknown>;
}): Promise<{ id: string; versao: number }> {
  const titulo = input.titulo.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!titulo || titulo.length > 240) throw new Error("titulo_documento_invalido");
  const { data, error } = await supabase.rpc("editar_documento_rascunho", {
    p_documento_id: input.id,
    p_titulo: titulo,
    p_dados: input.dados,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.id !== "string") throw new Error("resposta_editor_invalida");
  return { id: row.id, versao: Number(row.versao_atual ?? 1) };
}
