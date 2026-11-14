// Praças da coleta. Grande SP primeiro. Capitais só quando a praça anterior render pouco.

export const GRANDE_SP = [
  'São Paulo', 'Arujá', 'Barueri', 'Biritiba Mirim', 'Caieiras', 'Cajamar', 'Carapicuíba',
  'Cotia', 'Diadema', 'Embu das Artes', 'Embu-Guaçu', 'Embu', 'Ferraz de Vasconcelos',
  'Francisco Morato', 'Franco da Rocha', 'Guararema', 'Guarulhos', 'Itapecerica da Serra',
  'Itapevi', 'Itaquaquecetuba', 'Jandira', 'Juquitiba', 'Mairiporã', 'Mauá', 'Mogi das Cruzes',
  'Osasco', 'Pirapora do Bom Jesus', 'Poá', 'Ribeirão Pires', 'Rio Grande da Serra',
  'Salesópolis', 'Santa Isabel', 'Santana de Parnaíba', 'Santo André', 'São Bernardo do Campo',
  'São Caetano do Sul', 'São Lourenço da Serra', 'Suzano', 'Taboão da Serra',
  'Vargem Grande Paulista',
];

export const CAPITAIS = [
  { id: 'rio', cidade: 'Rio de Janeiro', uf: 'RJ', ddds: ['21'] },
  { id: 'bh', cidade: 'Belo Horizonte', uf: 'MG', ddds: ['31'] },
  { id: 'curitiba', cidade: 'Curitiba', uf: 'PR', ddds: ['41'] },
  { id: 'porto-alegre', cidade: 'Porto Alegre', uf: 'RS', ddds: ['51'] },
  { id: 'brasilia', cidade: 'Brasília', uf: 'DF', ddds: ['61'] },
  { id: 'salvador', cidade: 'Salvador', uf: 'BA', ddds: ['71'] },
  { id: 'recife', cidade: 'Recife', uf: 'PE', ddds: ['81'] },
  { id: 'fortaleza', cidade: 'Fortaleza', uf: 'CE', ddds: ['85'] },
  { id: 'manaus', cidade: 'Manaus', uf: 'AM', ddds: ['92'] },
  { id: 'belem', cidade: 'Belém', uf: 'PA', ddds: ['91'] },
  { id: 'goiania', cidade: 'Goiânia', uf: 'GO', ddds: ['62'] },
  { id: 'florianopolis', cidade: 'Florianópolis', uf: 'SC', ddds: ['48'] },
  { id: 'vitoria', cidade: 'Vitória', uf: 'ES', ddds: ['27'] },
  { id: 'sao-luis', cidade: 'São Luís', uf: 'MA', ddds: ['98'] },
  { id: 'natal', cidade: 'Natal', uf: 'RN', ddds: ['84'] },
  { id: 'joao-pessoa', cidade: 'João Pessoa', uf: 'PB', ddds: ['83'] },
  { id: 'maceio', cidade: 'Maceió', uf: 'AL', ddds: ['82'] },
  { id: 'teresina', cidade: 'Teresina', uf: 'PI', ddds: ['86'] },
  { id: 'campo-grande', cidade: 'Campo Grande', uf: 'MS', ddds: ['67'] },
  { id: 'cuiaba', cidade: 'Cuiabá', uf: 'MT', ddds: ['65'] },
  { id: 'aracaju', cidade: 'Aracaju', uf: 'SE', ddds: ['79'] },
  { id: 'palmas', cidade: 'Palmas', uf: 'TO', ddds: ['63'] },
  { id: 'macapa', cidade: 'Macapá', uf: 'AP', ddds: ['96'] },
  { id: 'boa-vista', cidade: 'Boa Vista', uf: 'RR', ddds: ['95'] },
  { id: 'porto-velho', cidade: 'Porto Velho', uf: 'RO', ddds: ['69'] },
  { id: 'rio-branco', cidade: 'Rio Branco', uf: 'AC', ddds: ['68'] },
];

export const PRACAS = ['grande-sp', ...CAPITAIS.map((c) => c.id)];

export function semAcento(valor) {
  return String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function pracaDe(id) {
  if (!id || id === 'grande-sp') {
    return {
      id: 'grande-sp',
      uf: 'SP',
      ddds: ['11'],
      cidades: GRANDE_SP,
      rotulo: 'Grande São Paulo',
    };
  }
  const cap = CAPITAIS.find((c) => c.id === id);
  if (!cap) return null;
  return { id: cap.id, uf: cap.uf, ddds: cap.ddds, cidades: [cap.cidade], rotulo: cap.cidade };
}

export function proximaPraca(id) {
  const i = PRACAS.indexOf(id);
  if (i < 0 || i + 1 >= PRACAS.length) return PRACAS[0];
  return PRACAS[i + 1];
}

export function parseCidadeUf(bruto) {
  const texto = String(bruto ?? '').replace(/\s+/g, ' ').trim();
  const m = texto.match(/^(.+?)\s*(?:\(([A-Za-z]{2})\)|[-/]\s*([A-Za-z]{2}))\s*$/);
  if (!m) return { cidade: texto, uf: '' };
  return { cidade: m[1].trim(), uf: (m[2] || m[3] || '').toUpperCase() };
}

export function cidadeCanonica(nome, lista) {
  const alvo = semAcento(nome);
  return lista.find((c) => semAcento(c) === alvo) || '';
}

export function formatarCidade(cidade, uf) {
  return uf ? `${cidade} - ${uf}` : cidade;
}

export function cidadeNoTexto(html, praca) {
  const t = semAcento(html);
  const hits = praca.cidades.filter((c) => t.includes(semAcento(c)));
  return hits;
}
