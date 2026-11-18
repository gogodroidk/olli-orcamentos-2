// Escolhe o token do robô da caixa (Lívia, Caio, Rafa) para a resposta aparecer
// com o nome certo. Sem mapa, ou sem a caixa, usa o token único de sempre.
// Não registra o token.

import fs from 'node:fs';

export function lerMapa(caminho) {
  try {
    const dados = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    return dados && typeof dados === 'object' ? dados : null;
  } catch {
    return null;
  }
}

export function tokenDoMapa(mapa, nome, fallback) {
  const valor = nome && mapa ? mapa[nome] : '';
  return typeof valor === 'string' && valor ? valor : fallback;
}
