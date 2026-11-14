import { textoEspera } from './fila.mjs';

export function montarResumo(itens, agoraSeg) {
  const lista = Array.isArray(itens) ? itens : [];
  if (!lista.length) return 'Interessados da OLLI Serviços: ninguém esperando.';
  const linhas = lista.slice(0, 15).map((i) => {
    const espera = textoEspera(Number(agoraSeg) - Number(i.desde || agoraSeg));
    return `• ${i.empresa} — ${i.quer} — ${espera}`;
  });
  const resto = lista.length > 15 ? `\n+${lista.length - 15} na visão Interessados do Chatwoot` : '';
  return `Interessados da OLLI Serviços (${lista.length}):\n${linhas.join('\n')}${resto}`;
}
