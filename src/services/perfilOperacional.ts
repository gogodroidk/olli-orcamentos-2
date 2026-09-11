import type { Empresa } from '../types';

export type CampoPerfilMinimo =
  | 'tipoNegocio'
  | 'nome'
  | 'nomePrestador'
  | 'telefone'
  | 'especialidade'
  | 'verticais'
  | 'cidade'
  | 'estado'
  | 'cnpj';

export const ROTULO_CAMPO_PERFIL: Readonly<Record<CampoPerfilMinimo, string>> = {
  tipoNegocio: 'forma de atuação',
  nome: 'nome do negócio',
  nomePrestador: 'nome do responsável',
  telefone: 'telefone',
  especialidade: 'especialidade',
  verticais: 'tipo de serviço',
  cidade: 'cidade',
  estado: 'UF',
  cnpj: 'CNPJ',
};

interface LinhaEmpresa {
  dados?: Empresa | null;
}

/** Aceita tanto a linha `empresa.dados` da web quanto o objeto local do app. */
export function dadosDaEmpresa(linha: unknown): Empresa | null {
  if (!linha || typeof linha !== 'object') return null;
  const possivel = linha as LinhaEmpresa & Partial<Empresa>;
  const dados = possivel.dados;
  if (dados && typeof dados === 'object') return dados;
  return typeof possivel.nome === 'string' ? (possivel as Empresa) : null;
}

export function camposPendentesPerfil(linha: unknown): CampoPerfilMinimo[] {
  const empresa = dadosDaEmpresa(linha);
  if (!empresa) {
    return ['tipoNegocio', 'nome', 'nomePrestador', 'telefone', 'especialidade', 'verticais', 'cidade', 'estado'];
  }

  const pendentes: CampoPerfilMinimo[] = [];
  if (empresa.tipoNegocio !== 'autonomo' && empresa.tipoNegocio !== 'empresa') pendentes.push('tipoNegocio');
  if (!empresa.nome?.trim()) pendentes.push('nome');
  if (!empresa.nomePrestador?.trim()) pendentes.push('nomePrestador');
  const telefone = (empresa.telefone || empresa.whatsapp || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (telefone.length < 10 || telefone.length > 11) pendentes.push('telefone');
  if (!empresa.especialidade?.trim()) pendentes.push('especialidade');
  if (!empresa.verticais?.length) pendentes.push('verticais');
  if (!empresa.cidade?.trim()) pendentes.push('cidade');
  if (!/^[A-Z]{2}$/i.test(empresa.estado?.trim() ?? '')) pendentes.push('estado');
  if (empresa.tipoNegocio === 'empresa' && (empresa.cnpj ?? '').replace(/\D/g, '').length !== 14) pendentes.push('cnpj');
  return pendentes;
}

export function perfilOperacionalCompleto(linha: unknown): boolean {
  return camposPendentesPerfil(linha).length === 0;
}
