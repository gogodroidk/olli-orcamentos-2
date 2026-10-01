/**
 * Onda 1, item 1.19 — lote de correções pequenas da auditoria de 30/09.
 *
 * O que dá para rodar puro em Node roda de verdade (calculadora de BTU e a
 * normalização da chave Pix). O resto são telas React Native: o teste olha o
 * FONTE, sem comentários, para garantir que cada correção continua ligada.
 *
 *   node scripts/teste-lote-pequeno-onda1.ts
 */
import { readFileSync } from 'node:fs';
import { CALCULOS } from '../src/services/calculosOficio.ts';
import { normalizarChavePix } from '../src/utils/pixBrCode.ts';

let falhas = 0;
let passes = 0;
function checar(nome: string, obtido: unknown, esperado: unknown) {
  if (obtido === esperado) {
    passes++;
    console.log(`  ok  ${nome}`);
  } else {
    falhas++;
    console.log(`  FALHOU  ${nome}\n          esperado: ${JSON.stringify(esperado)}\n          obtido:   ${JSON.stringify(obtido)}`);
  }
}
const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
/** Tira comentários de linha e de bloco: a prosa cita as regras que o teste procura. */
const semComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');

// ─── 1. BTU com área vazia ou zero ──────────────────────────────────────────────
console.log('\n1) Calculadora de BTU não recomenda aparelho para 0 m²');
const btu = CALCULOS.find((c) => c.id === 'btu');
if (!btu) throw new Error('calculadora de BTU sumiu');
for (const area of ['', '0', '0,0', '-5', 'abc']) {
  const r = btu.calcular({ area, sol: 'nao', pessoas: '2', eletronicos: '0' });
  checar(`área "${area}": sem item de orçamento`, r.itemOrcamento, undefined);
  checar(`área "${area}": aparelho recomendado em traço`, r.linhas.find((l) => l.label === 'Aparelho recomendado')?.valor, '—');
  checar(`área "${area}": pede a área`, r.resumo, 'Informe a área do ambiente para calcular.');
}
const r20 = btu.calcular({ area: '20', sol: 'nao', pessoas: '2', eletronicos: '0' });
checar('20 m² sem sol recomenda 12.000 BTU/h', r20.linhas.find((l) => l.label === 'Aparelho recomendado')?.valor, '12.000 BTU/h');
checar('20 m² continua oferecendo o item', r20.itemOrcamento?.nome, 'Ar-condicionado 12.000 BTU/h');

// ─── 2. Recibo com chave Pix normalizada ────────────────────────────────────────
console.log('\n2) Recibo imprime a chave Pix normalizada e omite a inválida');
checar('celular com máscara vira +55', normalizarChavePix('(11) 98888-7777')?.chave, '+5511988887777');
checar('texto que não é chave vira null', normalizarChavePix('meu pix é o celular'), null);
const recibo = semComentarios(ler('../src/utils/reciboPdf.ts'));
checar('recibo importa normalizarChavePix', recibo.includes("import { normalizarChavePix } from './pixBrCode';"), true);
checar('recibo não escapa a chave crua', recibo.includes('escapeHtml(empresa.chavePix)'), false);
checar('bloco Pix depende da chave normalizada', recibo.includes('${chavePixNormalizada ? `<div class="pix-box">'), true);
checar('bloco Pix não depende mais da chave crua', recibo.includes('${empresa.chavePix ?'), false);

// ─── 3. Papel em português ──────────────────────────────────────────────────────
console.log('\n3) Papel nunca aparece cru ("owner")');
const equipe = semComentarios(ler('../src/services/equipe.ts'));
checar('equipe.ts exporta rotuloPapel', equipe.includes('export function rotuloPapel('), true);
checar('rotuloPapel tem fallback em português', equipe.includes("return 'Membro';"), true);
for (const arq of ['../src/screens/OrdemServicoScreen.tsx', '../src/screens/desktop/PainelOS.tsx']) {
  const src = semComentarios(ler(arq));
  checar(`${arq.split('/').pop()} usa rotuloPapel`, src.includes('{rotuloPapel(m.papel)}'), true);
  checar(`${arq.split('/').pop()} não imprime m.papel cru`, src.includes(": m.papel}"), false);
}
const convite = semComentarios(ler('../src/screens/ConviteScreen.tsx'));
checar('Convite usa rotuloPapel', convite.includes('papel: rotuloPapel(org.papel)'), true);

// ─── 4. Meu Negócio: 3 estados e sem perder edição ─────────────────────────────
console.log('\n4) Meu Negócio: erro não vira tela em branco e o foco não apaga o rascunho');
const meu = semComentarios(ler('../src/screens/MeuNegocioScreen.tsx'));
checar('leitura da empresa tem catch', /emp = await getEmpresa\(\);\s*\} catch \{/.test(meu), true);
checar('falha sem dados vira erro', meu.includes('if (!temEmpresaRef.current) setErroCarga(true);'), true);
checar('erro oferece tentar de novo', meu.includes('label="Tentar de novo"'), true);
checar('carregando tem texto próprio', meu.includes('Carregando os dados da empresa…'), true);
checar('não há mais tela vazia sem nada', meu.includes('if (!empresa) return <View style={{ flex: 1, backgroundColor: cores.background }} />;'), false);
checar('foco com edição pendente não relê a empresa', /async function load\(\) \{\s*if \(dirtyRef\.current\) \{/.test(meu), true);
checar('salvar depoimento não reseta o rascunho', meu.includes('void carregarDepoimentos();'), true);

// ─── 5. Técnico: 3 estados enquanto não sabe quem é ────────────────────────────
console.log('\n5) TecnicoHome: sem usuário segue carregando; falha vira erro');
const tec = semComentarios(ler('../src/screens/TecnicoHomeScreen.tsx'));
checar('não resolve lista vazia sem userId', tec.includes('Promise.resolve([] as OrdemServico[])'), false);
checar('load sai cedo sem userId', tec.includes('if (!userId) return;'), true);
checar('sessão não lida vira erro', tec.includes("setIdentidade('erro')"), true);
checar('erro de identidade tem tela própria', tec.includes("if (identidade === 'erro') {"), true);
checar('erro de identidade oferece tentar de novo', tec.includes('void resolverUsuario();'), true);
checar('não engole a falha do getCurrentUser', tec.includes('.catch(() => {});\n    return () => { ativo = false; };'), false);

// ─── 6. "Nota salva" só com nota ───────────────────────────────────────────────
console.log('\n6) Relatório do dia: "Nota salva" só quando existe nota');
const rel = semComentarios(ler('../src/screens/RelatorioDiaScreen.tsx'));
checar('rótulo considera se há nota salva', rel.includes("temNotaSalva ? 'Nota salva' : 'Escreva algo'"), true);
checar('não sobra o rótulo antigo', rel.includes("dirty ? 'Salvar nota' : 'Nota salva'}"), false);

// ─── 7. WhatsApp da OS ─────────────────────────────────────────────────────────
console.log('\n7) OS: WhatsApp com tratamento de erro e "Estou a caminho"');
const os = semComentarios(ler('../src/screens/OrdemServicoScreen.tsx'));
checar('abrirWhatsApp tem .catch', /abrirWhatsApp\(telefoneCliente, mensagem\)\.catch\(/.test(os), true);
checar('nenhum onPress chama abrirWhatsApp sem tratamento', /onPress=\{\(\) => abrirWhatsApp\(/.test(os), false);
checar('botão "Estou a caminho" existe', os.includes('label="Estou a caminho"'), true);
checar('usa a mensagem central (sem inventar horário)', os.includes('mensagemEstouACaminho(ordem.clienteNome, null)'), true);
checar('só antes de chegar', os.includes("const STATUS_ANTES_DE_CHEGAR: StatusOS[] = ['aberta', 'agendada', 'pausada'];"), true);

console.log(`\n${passes} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
