/**
 * Onda I0 · Confiança: nada se perde.
 *
 *     node scripts/teste-confianca-offline.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Cobre as regras PURAS (sem RN, sem rede, relógio injetado):
 *   1. retomada da câmera — "a câmera mata o app e a OS volta igual";
 *   2. rascunho por campo — o texto digitado sobrevive à morte do app;
 *   3. fila de fotos — "no aparelho" → "enviada", espera crescente, erro ≠ vazio;
 *   4. textos do SeloSync — "N fotos aguardando sinal", alerta >24h, [Tentar agora];
 *   5. fiação — a OS, o App e o cloudSync chamam as peças nos pontos certos.
 *
 * O teste no aparelho (Android matando a activity de verdade) é manual e está
 * em e2e/sobrevive-morte-camera.md — o `node` não tem câmera.
 */
import { readFileSync } from 'node:fs';
import {
  CAPTURA_VALIDADE_MS,
  lerMarcador,
  retomarCapturaInterrompida,
  serializarMarcador,
  urisDoResultadoPendente,
  type ResultadoPendentePicker,
} from '../src/services/capturaFotoOS.ts';
import {
  chaveRascunho,
  criarGravadorRascunho,
  lerRascunho,
  RASCUNHO_CAMPO_PREFIXO,
  RASCUNHO_VALIDADE_MS,
  serializarRascunho,
} from '../src/services/rascunhoCampo.ts';
import {
  ATRASO_ALERTA_MS,
  criarMotorFila,
  elegiveis,
  esperaParaTentar,
  lerFila,
  MAX_ENVIADAS_GUARDADAS,
  marcarEnviada,
  podar,
  registrar,
  resumir,
  serializarFila,
  type Fila,
  type ResultadoEnvio,
} from '../src/services/filaFotos.ts';
import { haQuantosDias, rotuloSeloFoto, textoSeloSync } from '../src/services/seloSyncTexto.ts';
import { CAPTURA_OS_KEY, APP_DATA_STORAGE_KEYS, FILA_FOTOS_PREFIX, RASCUNHO_CAMPO_PREFIX } from '../src/services/storageKeys.ts';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  if (Object.is(real, esperado)) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${String(esperado)}\n        recebido: ${String(real)}`);
  }
}

const T0 = 1_800_000_000_000; // longe de 0: pega quem compara com falsy
const HORA = 60 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n1) câmera mata o app → a OS volta igual');
{
  checar('marcador recente é lido', lerMarcador(serializarMarcador('os-1', 'camera', T0), T0 + 60_000)?.ordemId, 'os-1');
  checar('marcador velho (>30 min) é ignorado', lerMarcador(serializarMarcador('os-1', 'camera', T0), T0 + CAPTURA_VALIDADE_MS + 1), null);
  checar('marcador do futuro (relógio mexido) é ignorado', lerMarcador(serializarMarcador('os-1', 'camera', T0), T0 - 1), null);
  checar('marcador corrompido = null', lerMarcador('{x', T0), null);
  checar('origem inválida = null', lerMarcador(JSON.stringify({ v: 1, ordemId: 'a', origem: 'tela', iniciadaEm: T0 }), T0), null);

  checar('resultado com foto → URIs', urisDoResultadoPendente({ canceled: false, assets: [{ uri: 'file:///cache/a.jpg' }] }).length, 1);
  checar('cancelou → nenhuma URI', urisDoResultadoPendente({ canceled: true, assets: null }).length, 0);
  checar('erro do picker → nenhuma URI', urisDoResultadoPendente({ code: 'E', message: 'x' }).length, 0);
  checar('null → nenhuma URI', urisDoResultadoPendente(null).length, 0);

  async function cenario(opcoes: {
    marcador: string | null;
    pendente: ResultadoPendentePicker;
    processarFalha?: boolean;
  }) {
    let marcador = opcoes.marcador;
    let pediuPendente = false;
    const anexadas: Array<[string, string]> = [];
    const r = await retomarCapturaInterrompida({
      lerMarcador: async () => marcador,
      apagarMarcador: async () => {
        marcador = null;
      },
      resultadoPendente: async () => {
        pediuPendente = true;
        return opcoes.pendente;
      },
      processar: async (uri) => (opcoes.processarFalha ? null : uri.replace('/cache/', '/docs/')),
      anexar: async (ordemId, uri) => {
        anexadas.push([ordemId, uri]);
      },
      agora: () => T0 + 5 * 60_000,
    });
    return { r, anexadas, pediuPendente, marcadorFinal: marcador };
  }

  const comFoto = await cenario({
    marcador: serializarMarcador('os-42', 'camera', T0),
    pendente: { canceled: false, assets: [{ uri: 'file:///cache/foto.jpg' }] },
  });
  checar('com marcador: reabre a OS certa', comFoto.r.tipo === 'reabrir' ? comFoto.r.ordemId : null, 'os-42');
  checar('…recupera a foto tirada', comFoto.r.tipo === 'reabrir' ? comFoto.r.fotosRecuperadas : -1, 1);
  checar('…anexa a cópia PERMANENTE (não a do cache)', comFoto.anexadas[0]?.[1], 'file:///docs/foto.jpg');
  checar('…e apaga o marcador (sem laço de reabertura)', comFoto.marcadorFinal, null);

  const cancelou = await cenario({ marcador: serializarMarcador('os-42', 'camera', T0), pendente: { canceled: true } });
  checar('cancelou a câmera: ainda reabre a OS', cancelou.r.tipo, 'reabrir');
  checar('…sem anexar nada', cancelou.anexadas.length, 0);

  const falhou = await cenario({
    marcador: serializarMarcador('os-42', 'galeria', T0),
    pendente: { canceled: false, assets: [{ uri: 'file:///cache/a.jpg' }, { uri: 'file:///cache/b.jpg' }] },
    processarFalha: true,
  });
  checar('falha ao salvar: conta as perdidas (a tela avisa, não some calado)', falhou.r.tipo === 'reabrir' ? falhou.r.fotosPerdidas : -1, 2);

  const semMarcador = await cenario({ marcador: null, pendente: { canceled: false, assets: [{ uri: 'file:///cache/x.jpg' }] } });
  checar('sem marcador: não faz nada', semMarcador.r.tipo, 'nada');
  checar('…e NÃO consome a foto pendente de outra tela (orçamento/logo)', semMarcador.pediuPendente, false);

  const velho = await cenario({ marcador: serializarMarcador('os-1', 'camera', T0 - 2 * HORA), pendente: null });
  checar('marcador velho: não reabre', velho.r.tipo, 'nada');
  checar('…e é limpo', velho.marcadorFinal, null);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n2) rascunho por campo');
{
  checar('chave usa o prefixo apagado no logout', chaveRascunho('os.abc', 'novo-item').startsWith(RASCUNHO_CAMPO_PREFIX), true);
  checar('prefixo do módulo = prefixo do storageKeys', RASCUNHO_CAMPO_PREFIXO, RASCUNHO_CAMPO_PREFIX);
  checar('chave sem espaço/barra', /[\s/]/.test(chaveRascunho('os nova/x', 'tí tulo')), false);
  checar('rascunho recente volta', lerRascunho(serializarRascunho('Trocar capacitor', T0), T0 + HORA), 'Trocar capacitor');
  checar('rascunho vencido (>7 dias) não volta', lerRascunho(serializarRascunho('x', T0), T0 + RASCUNHO_VALIDADE_MS + 1), null);
  checar('rascunho corrompido não volta', lerRascunho('{', T0), null);

  // Gravador com agenda manual: prova o respiro e a DESCARGA ao ir para o fundo.
  const gravados: Array<string | null> = [];
  const agendados: Array<() => void> = [];
  const gravador = criarGravadorRascunho({
    gravar: async (v) => {
      gravados.push(v);
    },
    agendar: (fn) => {
      agendados.push(fn);
      return () => {
        const i = agendados.indexOf(fn);
        if (i >= 0) agendados.splice(i, 1);
      };
    },
  });
  gravador.mudar('T');
  gravador.mudar('Tr');
  gravador.mudar('Tro');
  checar('digitando: nada gravado ainda (respiro)', gravados.length, 0);
  checar('…só UM agendamento vivo (debounce)', agendados.length, 1);
  await gravador.descarregar(); // AppState → background (câmera abriu)
  checar('câmera abriu: grava NA HORA o último valor', gravados[0], 'Tro');
  checar('…e não fica nada pendente', gravador.pendente(), false);
  gravador.mudar('');
  agendados.shift()?.(); // o timer dispara (e sai da agenda, como o setTimeout)
  await Promise.resolve();
  checar('campo esvaziado: apaga o rascunho', gravados[1], null);
  gravador.mudar('Novo');
  await gravador.limpar();
  checar('limpar (salvou de verdade): apaga e cancela o pendente', gravados[2], null);
  checar('…nenhuma gravação atrasada sobra', agendados.length, 0);

  const quebrado = criarGravadorRascunho({
    gravar: async () => {
      throw new Error('disco cheio');
    },
    agendar: () => () => {},
  });
  quebrado.mudar('x');
  let lancou = false;
  try {
    await quebrado.descarregar();
  } catch {
    lancou = true;
  }
  checar('falha de disco não derruba a digitação', lancou, false);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n3) fila de fotos: no aparelho → enviada');
{
  checar('fila ausente = vazia de verdade', lerFila(null).ok, true);
  checar('fila corrompida = ERRO (nunca "zero pendências")', lerFila('{oops').ok, false);
  checar('formato desconhecido = ERRO', lerFila(JSON.stringify({ v: 2, fotos: [] })).ok, false);

  let f: Fila = { v: 1, fotos: [] };
  f = registrar(f, 'os-1', 'file:///docs/a.jpg', T0);
  f = registrar(f, 'os-1', 'file:///docs/a.jpg', T0 + 1);
  checar('registrar é idempotente pela URI', f.fotos.length, 1);
  checar('URL remota não entra na fila', registrar(f, 'os-1', 'https://x/y.jpg', T0).fotos.length, 1);
  checar('foto nova nasce "no_aparelho"', f.fotos[0].estado, 'no_aparelho');

  checar('espera cresce: 1ª falha 30 s', esperaParaTentar(1), 30_000);
  checar('…3ª falha 2 min', esperaParaTentar(3), 120_000);
  checar('…teto 30 min', esperaParaTentar(20), 30 * 60_000);

  // Motor com IO em memória.
  let disco: string | null = null;
  let rede: 'off' | 'on' | 'recusa' = 'off';
  const existentes = new Set(['file:///docs/a.jpg', 'file:///docs/b.jpg']);
  let relogio = T0;
  let envios = 0;
  const avisos: string[] = [];
  const motor = criarMotorFila({
    ler: async () => disco,
    gravar: async (t) => {
      disco = t;
    },
    enviar: async (reg): Promise<ResultadoEnvio> => {
      envios += 1;
      if (rede === 'off') return { ok: false, motivo: 'servidor' };
      if (rede === 'recusa') return { ok: false, motivo: 'invalido' };
      return { ok: true, chave: `olli-fotos/t/foto_servico/${reg.uri.slice(-5)}` };
    },
    existe: async (uri) => existentes.has(uri),
    agora: () => relogio,
  });
  motor.ouvir((l) => avisos.push(l.status));

  await motor.registrar('os-1', 'file:///docs/a.jpg');
  await motor.registrar('os-1', 'file:///docs/b.jpg');
  await motor.registrar('os-9', 'file:///outro-celular/c.jpg'); // tirada em outro aparelho
  let resumo = await motor.resumo();
  checar('3 fotos aguardando', resumo.status === 'ok' ? resumo.resumo.aguardando : -1, 3);
  checar('registro avisa o selo', avisos.length >= 3, true);

  const semSinal = await motor.processar();
  checar('sem sinal: para na 1ª falha (não martela a rede)', semSinal.falhas, 1);
  checar('…uma única tentativa de envio', envios, 1);
  const estados1 = await motor.estados(['file:///docs/a.jpg']);
  checar('…a foto continua "no_aparelho"', estados1?.['file:///docs/a.jpg'], 'no_aparelho');

  const logo = await motor.processar();
  checar('logo depois: respeita a espera (não tenta a mesma foto)', envios, 1 + (logo.falhas + logo.enviadas));

  rede = 'on';
  relogio += 31_000;
  const comSinal = await motor.processar();
  checar('sinal voltou: sobem as do aparelho', comSinal.enviadas, 2);
  checar('…a de outro celular vira "ausente" (não pendência)', comSinal.ausentes, 1);
  const estados2 = await motor.estados(['file:///docs/a.jpg', 'file:///docs/b.jpg', 'file:///outro-celular/c.jpg', 'file:///nunca.jpg']);
  checar('selo: a = enviada', estados2?.['file:///docs/a.jpg'], 'enviada');
  checar('selo: c = ausente', estados2?.['file:///outro-celular/c.jpg'], 'ausente');
  checar('selo: foto fora da fila = sem_registro', estados2?.['file:///nunca.jpg'], 'sem_registro');
  resumo = await motor.resumo();
  checar('zero aguardando', resumo.status === 'ok' ? resumo.resumo.aguardando : -1, 0);

  // Recusa e [Tentar agora].
  existentes.add('file:///docs/d.jpg');
  await motor.registrar('os-2', 'file:///docs/d.jpg');
  rede = 'recusa';
  await motor.processar();
  resumo = await motor.resumo();
  checar('recusa da nuvem vira "recusada" (alerta, não laço)', resumo.status === 'ok' ? resumo.resumo.recusadas : -1, 1);
  const enviosAntes = envios;
  await motor.processar();
  checar('automático não reenvia recusada', envios, enviosAntes);
  rede = 'on';
  const forcado = await motor.processar({ forcar: true });
  checar('[Tentar agora] reenvia a recusada', forcado.enviadas, 1);

  // Fila ilegível: nada é apagado nem tentado.
  disco = '{corrompido';
  const ilegivel = await motor.processar();
  checar('fila ilegível: processar devolve erroLeitura', ilegivel.erroLeitura, true);
  checar('…resumo = indisponível (nunca "tudo enviado")', (await motor.resumo()).status, 'indisponivel');
  await motor.registrar('os-3', 'file:///docs/e.jpg');
  checar('…registrar NÃO sobrescreve a fila ilegível', disco, '{corrompido');
  checar('…estados = null (selo some em vez de mentir)', await motor.estados(['file:///docs/a.jpg']), null);

  // Concorrência: registrar no meio de um envio não perde registro.
  disco = null;
  let liberar: () => void = () => {};
  const motor2 = criarMotorFila({
    ler: async () => disco,
    gravar: async (t) => {
      disco = t;
    },
    enviar: () => new Promise<ResultadoEnvio>((ok) => {
      liberar = () => ok({ ok: true, chave: 'k' });
    }),
    existe: async () => true,
    agora: () => T0,
  });
  await motor2.registrar('os-1', 'file:///docs/1.jpg');
  const envio = motor2.processar();
  await new Promise((r) => setTimeout(r, 0));
  await motor2.registrar('os-1', 'file:///docs/2.jpg');
  liberar();
  await envio;
  const final = lerFila(disco);
  checar('registro durante envio sobrevive', final.ok ? final.fila.fotos.length : -1, 2);
  checar('…e o envio marcou a primeira', final.ok ? final.fila.fotos.find((x) => x.uri.endsWith('1.jpg'))?.estado : '', 'enviada');

  // Resumo: alerta de 24h.
  let g: Fila = registrar({ v: 1, fotos: [] }, 'os', 'file:///v.jpg', T0);
  checar('23h parada: sem alerta', resumir(g, T0 + 23 * HORA).atrasada, false);
  checar('24h parada: alerta', resumir(g, T0 + ATRASO_ALERTA_MS).atrasada, true);
  g = marcarEnviada(g, 'file:///v.jpg', 'k', T0 + 25 * HORA);
  checar('enviada não conta como atrasada', resumir(g, T0 + 48 * HORA).atrasada, false);
  checar('elegíveis ignoram enviadas', elegiveis(g, T0 + 48 * HORA, true).length, 0);

  // Poda: guarda todas as pendentes e só as N enviadas mais novas.
  const grande: Fila = { v: 1, fotos: [] };
  for (let i = 0; i < MAX_ENVIADAS_GUARDADAS + 10; i++) {
    grande.fotos.push({ uri: `file:///e${i}.jpg`, ordemId: 'o', registradaEm: i, estado: 'enviada', tentativas: 1, enviadaEm: i });
  }
  grande.fotos.push({ uri: 'file:///pend.jpg', ordemId: 'o', registradaEm: 0, estado: 'no_aparelho', tentativas: 9 });
  const podada = podar(grande);
  checar('poda mantém a pendente', podada.fotos.some((x) => x.uri === 'file:///pend.jpg'), true);
  checar('poda limita as enviadas', podada.fotos.filter((x) => x.estado === 'enviada').length, MAX_ENVIADAS_GUARDADAS);
  checar('serializar já poda', (lerFila(serializarFila(grande)) as { ok: true; fila: Fila }).fila.fotos.length, MAX_ENVIADAS_GUARDADAS + 1);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n4) textos do SeloSync (copy honesta)');
{
  const ok = (aguardando: number, recusadas = 0, desde?: number, atrasada = false) =>
    ({ status: 'ok', resumo: { aguardando, recusadas, maisAntigaDesde: desde, atrasada } }) as const;
  checar('3 pendentes', textoSeloSync(ok(3, 0, T0), T0)?.titulo, '3 fotos aguardando sinal');
  checar('1 pendente (singular)', textoSeloSync(ok(1, 0, T0), T0)?.titulo, '1 foto aguardando sinal');
  checar('pendente comum: sem botão', textoSeloSync(ok(3, 0, T0), T0)?.tentarAgora, false);
  const atrasado = textoSeloSync(ok(2, 0, T0, true), T0 + 3 * 24 * HORA);
  checar('>24h: alerta', atrasado?.tom, 'alerta');
  checar('>24h: diz há quanto tempo', atrasado?.titulo, 'Algumas fotos não subiram há 3 dias');
  checar('>24h: [Tentar agora]', atrasado?.tentarAgora, true);
  checar('"há 1 dia" no singular', haQuantosDias(T0, T0 + 25 * HORA), 'há 1 dia');
  checar('recusada: alerta com botão', textoSeloSync(ok(0, 1, T0), T0)?.tentarAgora, true);
  checar('tudo enviado só com leitura OK', textoSeloSync(ok(0), T0)?.titulo, 'Fotos enviadas');
  const ind = textoSeloSync({ status: 'indisponivel' }, T0);
  checar('leitura falhou: NÃO diz "enviadas"', ind?.tom, 'indisponivel');
  checar('…diz que não conseguiu conferir', ind?.titulo, 'Não consegui conferir o que falta enviar');
  checar('carregando: não afirma nada', textoSeloSync(null, T0), null);
  checar('sem nuvem: diz que está DESLIGADO', textoSeloSync(ok(0), T0, false)?.tom, 'desligado');
  checar('selo da foto: enviada', rotuloSeloFoto('enviada')?.texto, 'Enviada');
  checar('selo da foto: no aparelho', rotuloSeloFoto('no_aparelho')?.texto, 'No aparelho');
  checar('selo da foto: fila ilegível = sem selo', rotuloSeloFoto(null), null);
  const semConta = textoSeloSync({ status: 'sem_conta' }, T0);
  checar('sem conta: NÃO promete "sobe quando a internet voltar"', semConta?.tom, 'desligado');
  checar('sem conta: diz que fica só no celular', semConta?.titulo, 'Fotos só neste celular');
  checar('sem conta: sem [Tentar agora] que não faria nada', semConta?.tentarAgora, false);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n5) fiação nos pontos certos');
{
  const ler = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const os = ler('../src/screens/OrdemServicoScreen.tsx');
  const app = ler('../App.tsx');
  const sync = ler('../src/services/cloudSync.ts');
  const db = ler('../src/database/database.ts');
  const filaNativa = ler('../src/services/filaFotosNativa.ts');
  const provider = ler('../src/services/adapters/SupabaseStorageProvider.ts');
  const selo = ler('../src/components/SeloSync.tsx');
  checar('fila: sem conta não tenta subir (nem soma falha)', /if \(dono === SEM_CONTA\) return null;/.test(filaNativa), true);
  checar('fila: resumo sem conta vira "sem_conta"', /leituraDoDono\(dono, await motorDe\(dono\)\.resumo\(\)\)/.test(filaNativa), true);
  checar('cloudSync: fotos NÃO seguram o syncOnLogin (sem await)',
    /void import\('\.\/filaFotosNativa'\)\s*\.then\(m => m\.enviarFotosPendentes\(\)\)/.test(sync), true);
  checar('storage: upload sem URL remove a cópia (sem órfão no bucket)',
    /if \(!url\.ok\) \{[\s\S]{0,400}await this\.remover\(`\$\{bucket\}\/\$\{caminho\}`\)/.test(provider), true);
  checar('SeloSync: [Tentar agora] alcançável pelo leitor de tela (contêiner não agrupa)',
    /\]\}\s*>\s*<MaterialCommunityIcons name=\{visual\.icone\}/.test(selo), true);
  const tirar = /async function tirarFoto[\s\S]*?\n {2}\}/.exec(os)?.[0] ?? '';
  checar('OS: marcador gravado ANTES de abrir a câmera',
    tirar.indexOf('marcarCapturaOS(') > -1 && tirar.indexOf('marcarCapturaOS(') < tirar.indexOf('adicionarFotoCamera('), true);
  checar('OS: checklist pendente gravado antes da câmera',
    tirar.indexOf('descarregarChecklist()') > -1 && tirar.indexOf('descarregarChecklist()') < tirar.indexOf('adicionarFotoCamera('), true);
  checar('OS: marcador limpo no finally', /finally \{\s*await limparCapturaOS\(\)/.test(tirar), true);
  checar('OS: cada foto entra na fila de envio', /adicionarFotoOS\(ordem\.id, uri\);\s*await registrarFotoParaEnvio\(ordem\.id, uri\)/.test(tirar), true);
  checar('OS: selo por foto na grade', /<SeloFoto estado=/.test(os), true);
  checar('OS: SeloSync no detalhe e na lista', (os.match(/<SeloSync /g) ?? []).length >= 2, true);
  checar('OS: item do checklist com rascunho', /useRascunhoCampo\(chaveRascunho\(`os\.\$\{ordemId\}`, 'novo-item'\)\)/.test(os), true);
  const formOs = ler('../src/components/os/FormularioDadosOS.tsx');
  checar('OS: formulário com rascunho em cada campo digitado',
    (formOs.match(/useRascunhoCampo\(escopo \? chaveRascunho\(escopo, '/g) ?? []).length >= 7, true);
  checar('OS: criação manual ainda usa o rascunho os-nova', /rascunhoEscopo="os-nova"/.test(os), true);
  checar('OS: técnico sem id não vira "Nenhuma OS" (erro ≠ vazio)', /userId === null\) \{\s*setOrdensErro\(true\)/.test(os), true);
  checar('App: retomada da câmera no onReady reabre a OS',
    /retomarCapturaOSInterrompida\(\)\.then[\s\S]{0,200}navigate\('OrdemServico', \{ ordemId: retomada\.ordemId \}\)/.test(app), true);
  checar('App: retomada da câmera NÃO roda com a porta fechada (Entrar/Landing/Onboarding)',
    /if \(precisaDePorta\) return;\s*void retomarCapturaOSInterrompida\(\)/.test(app), true);
  checar('cloudSync: sync sobe as fotos pendentes', /import\('\.\/filaFotosNativa'\)\s*\.then\(m => m\.enviarFotosPendentes\(\)\)/.test(sync), true);
  checar('cloudSync: [Tentar agora] força o envio', /export async function tentarSincronizarAgora[\s\S]{0,300}enviarFotosPendentes\(\{ forcar: true \}\)/.test(sync), true);
  checar('logout apaga o marcador da câmera', APP_DATA_STORAGE_KEYS.includes(CAPTURA_OS_KEY as never), true);
  checar('logout apaga rascunhos por prefixo', /startsWith\(RASCUNHO_CAMPO_PREFIX\)/.test(db), true);
  checar('fila de fotos NÃO some no logout (foto sem sinal não pode virar órfã)',
    APP_DATA_STORAGE_KEYS.some((k) => k.startsWith(FILA_FOTOS_PREFIX)), false);
}

console.log(`\n${passes} ok, ${falhas} falha(s)`);
if (falhas > 0) {
  console.error('FALHOU: confiança offline (I0)');
  process.exit(1);
}
console.log('PASSOU: câmera não perde a OS, rascunho por campo, fila de fotos com selo honesto.');
