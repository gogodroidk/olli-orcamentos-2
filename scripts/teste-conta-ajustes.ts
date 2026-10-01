/**
 * Onda 2, item 2.4 — Conta como "Ajustes" + migração dos alertas nativos.
 *
 *     node scripts/teste-conta-ajustes.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que é puro roda de verdade: a busca de ajustes (`src/services/buscaAjustes.ts`).
 * As telas são React Native e não rodam em Node, então o teste lê o FONTE (sem
 * comentários) e trava as regras: nenhum `Alert.alert` na Conta e na Equipe,
 * Sair / Sair apagando / Excluir conta passam por folha DESTRUTIVA, erro que
 * acontece dentro de Modal aparece dentro dele (o toast ficaria por baixo), e as
 * linhas de ajuste seguem a fundação de motion.
 */
import { readFileSync } from 'node:fs';
import {
  SECAO_AJUSTES,
  TERMOS_AJUSTE,
  buscarAjustes,
  casaConsulta,
  normalizarTexto,
  type ItemAjuste,
} from '../src/services/buscaAjustes.ts';

let falhas = 0;
let passes = 0;
function checar(nome: string, obtido: unknown, esperado: unknown) {
  if (Object.is(obtido, esperado)) {
    passes++;
    console.log(`  ok  ${nome}`);
  } else {
    falhas++;
    console.log(`  FALHOU  ${nome}\n          esperado: ${JSON.stringify(esperado)}\n          obtido:   ${JSON.stringify(obtido)}`);
  }
}
const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
/** Tira comentários de bloco e de linha (sem tocar em `://` de URL). */
const semComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// ─── 1. Normalização ─────────────────────────────────────────────────────────
console.log('\n1) Normalização do texto');
checar('sem acento e minúsculo', normalizarTexto('Notificações'), 'notificacoes');
checar('pontuação vira espaço único', normalizarTexto('  E-mail,  já! '), 'e mail ja');
checar('nulo vira vazio (não "null")', normalizarTexto(null), '');

// ─── 2. Busca ────────────────────────────────────────────────────────────────
console.log('\n2) Busca de ajustes');
const comTermos = (i: Omit<ItemAjuste, 'termos'>): ItemAjuste => ({ ...i, termos: TERMOS_AJUSTE[i.id] });
const catalogo: ItemAjuste[] = [
  comTermos({ id: 'aparencia', secao: SECAO_AJUSTES.aparencia, titulo: 'Tema e cor da marca' }),
  comTermos({ id: 'notifBomDia', secao: SECAO_AJUSTES.notificacoes, titulo: 'Bom dia da OLLI', descricao: '~7h, só quando há um sinal real' }),
  comTermos({ id: 'notifDomingo', secao: SECAO_AJUSTES.notificacoes, titulo: 'Notificar aos domingos' }),
  comTermos({ id: 'backupCopias', secao: SECAO_AJUSTES.backup, titulo: 'Ver cópias de segurança' }),
  comTermos({ id: 'lixeira', secao: SECAO_AJUSTES.backup, titulo: 'Lixeira', descricao: 'Recupere itens excluídos nos últimos 30 dias' }),
  comTermos({ id: 'sair', secao: SECAO_AJUSTES.sessao, titulo: 'Sair da conta' }),
  comTermos({ id: 'sairApagar', secao: SECAO_AJUSTES.sessao, titulo: 'Sair e apagar dados deste aparelho' }),
  comTermos({ id: 'excluirConta', secao: SECAO_AJUSTES.sessao, titulo: 'Excluir minha conta' }),
  { id: 'ferramenta:clientes', secao: SECAO_AJUSTES.ferramentas, titulo: 'Clientes', descricao: 'Sua base de clientes' },
];
const ids = (q: string) => [...buscarAjustes(catalogo, q).ids].sort().join(',');

const vazio = buscarAjustes(catalogo, '   ');
checar('busca vazia (só espaço) não está ativa', vazio.ativa, false);
checar('busca vazia mostra tudo', vazio.total, catalogo.length);
checar('"tema" acha Aparência pelo título', ids('tema'), 'aparencia');
checar('"escuro" acha Aparência pelo sinônimo', ids('escuro'), 'aparencia');
checar('"notificacoes" sem acento acha a seção inteira', ids('notificacoes'), 'notifBomDia,notifDomingo');
checar('"NOTIF" em caixa alta acha pelo começo', ids('NOTIF'), 'notifBomDia,notifDomingo');
checar('"logout" acha as duas saídas', ids('logout'), 'sair,sairApagar');
checar('"sair apagar" exige as duas palavras', ids('sair apagar'), 'sairApagar');
checar('"restaurar" acha cópias e lixeira', ids('restaurar'), 'backupCopias,lixeira');
checar('"backup" acha a seção pelo nome', ids('backup'), 'backupCopias,lixeira');
checar('"clientes" acha a ferramenta', ids('clientes'), 'ferramenta:clientes');
checar('palavra no meio (3+ letras) também casa', casaConsulta(catalogo[3], 'pias'), true);
checar('1-2 letras só casam no começo da palavra', casaConsulta(catalogo[0], 'ma'), true);
checar('...e não no meio', casaConsulta(catalogo[0], 'em'), false);
const nada = buscarAjustes(catalogo, 'xyzw');
checar('sem resultado: ativa e total 0 (a tela mostra "nenhum ajuste")', `${nada.ativa}/${nada.total}`, 'true/0');
checar('seções com achado vêm junto', [...buscarAjustes(catalogo, 'domingo').secoes].join(','), SECAO_AJUSTES.notificacoes);
checar('id repetido conta uma vez', buscarAjustes([...catalogo, catalogo[0]], 'tema').total, 1);

// ─── 3. Conta: sem alerta nativo, saídas com folha destrutiva ────────────────
console.log('\n3) ContaScreen');
const conta = semComentarios(ler('../src/screens/ContaScreen.tsx'));
checar('nenhum Alert.alert na Conta', /Alert\.alert\(/.test(conta), false);
checar('nem importa Alert do react-native', /import \{[^}]*\bAlert\b[^}]*\} from 'react-native'/.test(conta), false);
const corpoDe = (nome: string) => {
  const i = conta.indexOf(`async function ${nome}(`);
  return i < 0 ? '' : conta.slice(i, conta.indexOf('\n  }\n', i));
};
for (const nome of ['handleSair', 'handleSairApagando', 'confirmarExclusaoFinal']) {
  const corpo = corpoDe(nome);
  checar(`${nome} existe`, corpo.length > 0, true);
  checar(`${nome} pede folha destrutiva antes de agir`, /await confirmar\(\{[\s\S]*?destrutivo: true/.test(corpo), true);
  checar(`${nome} desiste quando a resposta não é "sim"`, /if \(!sim\) return;/.test(corpo), true);
}
checar('sair mantendo dados promete o que faz', /continuam guardados neste aparelho/.test(corpoDe('handleSair')), true);
checar('sair apagando avisa que a nuvem não é afetada', /nuvem \(se houver backup\) não são afetados/.test(corpoDe('handleSairApagando')), true);
checar('erro ao sair vira toast.erro', /toast\.erro\(mensagemDeErro\(e, SEM_INTERNET, 'Não foi possível sair agora/.test(corpoDe('handleSair')), true);
checar('erro ao excluir aparece DENTRO do modal (setErroExcluir)', /setErroExcluir\(msg\)/.test(corpoDe('confirmarExclusaoFinal')), true);
checar('modal de exclusão recebe o erro', /erro=\{erroExcluir\}/.test(conta), true);
checar('erro ao restaurar aparece DENTRO da lista de cópias', /setErroRestaurar\(mensagemDeErro/.test(conta) && /\{erroRestaurar \? \(/.test(conta), true);
checar('folhas de equipe mostram o erro dentro delas', (conta.match(/<ErroNaFolha /g) ?? []).length >= 2, true);
checar('sucesso de criar empresa/entrar na equipe vira toast', /toast\.sucesso\(\s*podeConvidar/.test(conta) && /titulo: 'Bem-vindo à equipe!'/.test(conta), true);
checar('permissão de foto bloqueada oferece "Abrir ajustes" no toast', /acao: \{ rotulo: 'Abrir ajustes'/.test(conta), true);
checar('cada saída tem o próprio carregando', /carregando=\{saindo === 'manter'\}/.test(conta) && /carregando=\{saindo === 'apagar'\}/.test(conta), true);

// ─── 4. Conta: estrutura de Ajustes e busca ──────────────────────────────────
console.log('\n4) Conta organizada como Ajustes');
checar('tem campo de busca', /<CampoBuscaAjuste valor=\{busca\} aoMudar=\{setBusca\} \/>/.test(conta), true);
checar('a busca usa o módulo puro', /buscarAjustes\(itensAjuste, busca\)/.test(conta), true);
checar('busca sem resultado diz o que procurou e oferece limpar', /Nenhum ajuste encontrado para/.test(conta) && /label="Limpar busca"/.test(conta), true);
for (const secao of Object.keys(SECAO_AJUSTES).filter(s => s !== 'conta')) {
  checar(`seção "${secao}" é um GrupoAjustes`, new RegExp(`<GrupoAjustes[\\s\\S]{0,40}titulo=\\{SECAO_AJUSTES\\.${secao}\\}`).test(conta), true);
}
// Toda linha desenhada consulta a busca — e toda chave consultada existe no catálogo.
const consultados = new Set([...conta.matchAll(/mostra\('([A-Za-z]+)'\)/g)].map(m => m[1]));
const catalogados = new Set([...conta.matchAll(/\{ id: '([A-Za-z]+)'/g)].map(m => m[1]));
const soltos = [...consultados].filter(id => !catalogados.has(id));
checar('toda linha consultada está no catálogo da busca', soltos.join(','), '');
const semUso = [...catalogados].filter(id => !consultados.has(id));
checar('todo item do catálogo vira linha na tela', semUso.join(','), '');
checar('ferramentas entram na busca e no filtro', /id: `ferramenta:\$\{f\.key\}`/.test(conta) && /mostra\(`ferramenta:\$\{f\.key\}`\)/.test(conta), true);
checar('Lixeira continua fora para o técnico', /papel !== 'tecnico' \? \[\{ id: 'lixeira'/.test(conta), true);
checar('Sessão só existe com sessão ativa', /\.\.\.\(sessaoAtiva\s*\?\s*\[\s*\{ id: 'sessaoConta'/.test(conta), true);
checar('não promete "Conectado à nuvem" (a sessão é local)', /Conectado à nuvem/.test(conta), false);
checar('...nem a Conta do desktop (paridade)', /Conectado à nuvem/.test(semComentarios(ler('../src/screens/desktop/ContaDesktopScreen.tsx'))), false);
checar('status do backup só no catálogo quando a tela o desenha', /\.\.\.\(sessaoAtiva \|\| !configured \? \[\{ id: 'backupStatus'/.test(conta), true);
checar('erro de restaurar leva a lista ao topo (o aviso mora lá)', /listaBackupsRef\.current\?\.scrollTo\(\{ y: 0/.test(conta) && /ref=\{listaBackupsRef\}/.test(conta), true);
checar('sem Animated antigo na Conta', /Animated\.timing\(|new Animated\.Value/.test(conta), false);
checar('entradas usam Aparecer (fundação de motion)', /<Aparecer indice=\{ind\(0\)\}>/.test(conta) && !/AnimatedEntrance/.test(conta), true);

// ─── 5. Peças de Ajustes ─────────────────────────────────────────────────────
console.log('\n5) Componentes de ajustes');
const linha = semComentarios(ler('../src/components/ajustes/LinhaAjuste.tsx'));
const grupo = semComentarios(ler('../src/components/ajustes/GrupoAjustes.tsx'));
const campo = semComentarios(ler('../src/components/ajustes/CampoBuscaAjuste.tsx'));
checar('linha tocável usa PressableAnimado', /<PressableAnimado/.test(linha), true);
checar('linha tocável vibra seleção (destrutiva não: a folha já vibra aviso)', /haptic=\{destrutivo \? false : 'selection'\}/.test(linha), true);
checar('linha mostra carregando e bloqueia novo toque', /disabled=\{desabilitado \|\| carregando\}/.test(linha) && /<ActivityIndicator/.test(linha), true);
checar('linha só de leitura não é tocável', /if \(!onPress\) return <View/.test(linha), true);
checar('leitor de tela lê a descrição da linha tocável', /accessibilityHint=\{descricao\}/.test(linha), true);
checar('ícone com o mesmo quadradinho em toda linha', /width: LADO_ICONE_AJUSTE/.test(linha), true);
checar('grupo vazio não desenha nada (nem título)', /if \(filhos\.length === 0\) return null;/.test(grupo), true);
checar('grupo entra com Aparecer', /<Aparecer indice=\{indice\}>/.test(grupo), true);
for (const [nome, src] of [['LinhaAjuste', linha], ['GrupoAjustes', grupo], ['CampoBuscaAjuste', campo]] as const) {
  checar(`${nome} sem TouchableOpacity`, /TouchableOpacity/.test(src), false);
  checar(`${nome} sem número mágico de duração`, /duration:\s*\d/.test(src), false);
}
checar('campo de busca tem rótulo para leitor de tela', /accessibilityLabel="Buscar ajuste"/.test(campo), true);

// ─── 6. Equipe ───────────────────────────────────────────────────────────────
console.log('\n6) EquipeScreen');
const equipe = semComentarios(ler('../src/screens/EquipeScreen.tsx'));
checar('nenhum Alert.alert na Equipe', /Alert\.alert\(/.test(equipe), false);
checar('desativar membro confirma em folha destrutiva', /await confirmar\(\{[\s\S]*?rotuloConfirmar: 'Desativar'/.test(equipe) && /destrutivo: true/.test(equipe), true);
checar('falha ao alterar membro vira toast.erro', /toast\.erro\(e\?\.message \?\? 'Não consegui alterar esse membro/.test(equipe), true);
checar('falha ao criar convite aparece dentro da folha', /setErro\(e\?\.message \?\? 'Não consegui criar o convite/.test(equipe) && /O convite não foi criado/.test(equipe), true);

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
