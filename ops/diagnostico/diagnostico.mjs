// Junta a leitura pública, a lacuna e uma oferta do catálogo. Não envia mensagem.
import { ofertaDaLacuna, carregarOfertas } from './catalogo.mjs';
import { classificar } from './sinais.mjs';
import { nomeLimpo } from './frase.mjs';

export function concluir(lead, leitura, ofertas) {
  const classe = classificar(leitura);
  const oferta = classe.evidencia ? ofertaDaLacuna(classe.principal, ofertas) : { ofertaId: '', servico: 0, ofertaNome: '' };
  return {
    id: String(lead?.id || ''),
    nome: nomeLimpo(lead?.nome),
    cidade: String(lead?.cidade || '').replace(/\s+/g, ' ').trim(),
    nicho: String(lead?.nicho || '').trim(),
    site: String(leitura?.site || '').slice(0, 180),
    diagnostico: {
      principal: classe.principal,
      evidencia: classe.evidencia,
      lacunas: classe.lacunas,
      ofertaId: oferta.ofertaId,
      servico: oferta.servico,
      ofertaNome: oferta.ofertaNome,
      sinais: classe.sinais,
    },
  };
}

export async function diagnosticar(lead, busca, ofertas) {
  const leitura = await busca.pagina(lead?.site || '');
  return concluir(lead, leitura, ofertas);
}

export async function diagnosticarLista(leads, busca, catalogo = carregarOfertas()) {
  const sai = [];
  for (const lead of leads || []) sai.push(await diagnosticar(lead, busca, catalogo.ofertas));
  return { origem: catalogo.origem, itens: sai };
}
