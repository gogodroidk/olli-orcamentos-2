/**
 * Teste do CEP nas TELAS — o veredito que vazava entre clientes.
 *
 *     node scripts/teste-cep-telas.ts
 * Exit 0 = passou; 1 = falhou. O exit code é a prova.
 *
 * `scripts/teste-brasil-dados.ts` já prova o LADO DE LÁ (o worker: quem tem
 * autoridade para dizer "não existe", cache, rate limit). Este arquivo prova o
 * LADO DE CÁ — o que o app faz com aquela resposta depois que ela chega. São
 * três defeitos, e os três são silenciosos:
 *
 *  (1) **O veredito sobrevivia à troca de registro.** O hook mora no componente
 *      PAI, que não desmonta entre um cliente e outro (`<Modal visible=...>`).
 *      Fechar e reabrir o formulário resetava campos e erros; `estadoCep`,
 *      `enderecoCep` e `divergencias` ficavam. O prestador cadastrava o cliente
 *      A com divergência de cidade, salvava, abria "Novo Cliente" — e a caixa
 *      amarela do A continuava na tela, com o botão "Usar o do CEP" ATIVO. Um
 *      toque gravava a cidade do A no cliente B. E a versão pior, sem botão
 *      nenhum: uma consulta ainda no ar quando o formulário trocava caía dentro
 *      do registro NOVO, porque o hook sempre preenche o formulário atual.
 *
 *  (2) **O Onboarding SOBRESCREVIA o que o usuário digitou.** `cidade:
 *      r.endereco.cidade || p.cidade` só respeita o valor dele quando o CEP não
 *      traz cidade — ou seja, quase nunca. Aquela cidade vira o FORO do
 *      contrato (`foroPadrao`, src/utils/contratoPdf.ts).
 *
 *  (3) **O Onboarding não tinha guarda de corrida.** Duas consultas no ar e a
 *      mais lenta vencia, sob a frase "Endereço encontrado".
 *
 * ─── COMO ISTO RODA O HOOK DE VERDADE (e por que não é mock) ───────────────
 * Não há renderer de React neste repo (`react-test-renderer` não está
 * instalado, e instalar um só para isto é peso de build). Em vez de reescrever
 * a lógica no teste — que provaria só que a minha cópia concorda comigo —, o
 * `Host` abaixo empresta ao React um DESPACHANTE de hooks mínimo pelo slot `H`
 * de `__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE`, e
 * executa o `useCepLookup` REAL do app, com o `useState`/`useRef`/`useCallback`
 * reais sendo resolvidos pelo despachante. É o mesmo código que roda no APK.
 *
 * Se um dia o React mudar essa internal, este arquivo FALHA ALTO (a checagem é
 * a primeira coisa que ele faz). Nunca pula calado — pular calado é o bug que
 * este repo persegue, e ele vale para o teste também.
 *
 * O que o `Host` modela do React, porque o conserto depende disso:
 *   • `setState` durante o RENDER re-executa o componente na hora (é assim que
 *     o reset por `chave` acontece antes de qualquer pintura).
 *   • `setState` com valor igual (`Object.is`) NÃO re-renderiza.
 *   • `useCallback` guarda por deps, então `onCepChange` continua sendo a
 *     closure do primeiro render — que é justamente onde o bug se escondia.
 *
 * ─── O QUE SÓ O FONTE PROVA ───────────────────────────────────────────────
 * A fiação das telas (JSX, react-native, expo) não roda em Node sem arrastar
 * meia árvore de dependências. O bloco final lê os quatro arquivos, REMOVE OS
 * COMENTÁRIOS e então afirma. Remover comentários não é capricho: o conserto do
 * Onboarding documenta o padrão antigo (`|| p.cidade`) dentro de um comentário,
 * e um teste que varre o texto cru acusaria o próprio comentário que explica a
 * correção.
 */
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import * as React from 'react';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PORTAS FECHADAS: `src/services/cep.ts` importa `../config` (que importa um
// JSON) e `./supabase` (que importa react-native). Nada disso tem a ver com o
// que está sendo testado. Os dois viram stub ANTES do import dinâmico.
//
// `DIAGNOSTICO_URL` vazio é de propósito: manda o `consultarCep` pela SEGUNDA
// porta (ViaCEP direto), que é a que o Onboarding realmente usa — ele roda
// antes de existir sessão, e a rota do worker é autenticada.
// ═══════════════════════════════════════════════════════════════════════════
const STUBS: Record<string, string> = {
  config: 'export const DIAGNOSTICO_URL = "";',
  supabase: 'export const supabase = null;',
};

registerHooks({
  resolve(especificador, contexto, proximo) {
    if (contexto.parentURL?.endsWith('/src/services/cep.ts')) {
      if (especificador === '../config') return { url: 'olli-stub:config', shortCircuit: true };
      if (especificador === './supabase') return { url: 'olli-stub:supabase', shortCircuit: true };
    }
    return proximo(especificador, contexto);
  },
  load(url, contexto, proximo) {
    if (url.startsWith('olli-stub:')) {
      return { format: 'module', source: STUBS[url.slice('olli-stub:'.length)], shortCircuit: true };
    }
    return proximo(url, contexto);
  },
});

const { useCepLookup, mesclarEndereco, aplicarDivergencias, limparCacheCep } = await import(
  '../src/services/cep.ts'
);

// ═══════════════════════════════════════════════════════════════════════════
// DESPACHANTE DE HOOKS — mínimo, mas fiel nos pontos que o conserto usa.
// ═══════════════════════════════════════════════════════════════════════════
const INTERNALS = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

type Slot = { tipo: string; valor: any };

class Host<T> {
  private slots: Slot[] = [];
  private i = 0;
  private sujo = false;
  saida!: T;
  // Campo explícito em vez de `constructor(private corpo)`: o modo strip-only
  // do Node (que é como todo scripts/teste-*.ts roda) não aceita parameter
  // property.
  corpo: () => T;

  constructor(corpo: () => T) {
    this.corpo = corpo;
  }

  /** Renderiza até o estado parar de mudar (é o que o React faz com setState de render). */
  render(): T {
    let voltas = 0;
    do {
      this.sujo = false;
      this.i = 0;
      const anterior = INTERNALS.H;
      INTERNALS.H = this.despachante;
      try {
        this.saida = this.corpo();
      } finally {
        INTERNALS.H = anterior;
      }
      if (++voltas > 50) throw new Error('render em loop — setState de render sem convergir');
    } while (this.sujo);
    this.rendersDoUltimoFlush = voltas;
    return this.saida;
  }

  /** Quantas passadas o último `render()` custou. Prova que o reset não faz loop. */
  rendersDoUltimoFlush = 0;

  private slot(tipo: string, criar: () => any): Slot {
    let s = this.slots[this.i];
    if (!s) {
      s = { tipo, valor: criar() };
      this.slots[this.i] = s;
    }
    if (s.tipo !== tipo) throw new Error(`ordem de hooks mudou: ${s.tipo} -> ${tipo}`);
    this.i++;
    return s;
  }

  private despachante = {
    useState: (inicial: any) => {
      const s = this.slot('state', () => (typeof inicial === 'function' ? inicial() : inicial));
      // O setter fecha sobre o SLOT, não sobre o valor: continua válido quando
      // capturado por um useCallback([]) do primeiro render — que é exatamente
      // como o `onCepChange` real vive.
      const set = (v: any) => {
        const novo = typeof v === 'function' ? v(s.valor) : v;
        if (Object.is(novo, s.valor)) return; // React desiste; o Host também.
        s.valor = novo;
        this.sujo = true;
      };
      return [s.valor, set];
    },
    useRef: (inicial: any) => this.slot('ref', () => ({ current: inicial })).valor,
    useCallback: (fn: any, deps: any[]) => {
      const s = this.slot('cb', () => ({ fn, deps }));
      const iguais =
        Array.isArray(s.valor.deps) &&
        Array.isArray(deps) &&
        s.valor.deps.length === deps.length &&
        s.valor.deps.every((d: any, i: number) => Object.is(d, deps[i]));
      if (!iguais) s.valor = { fn, deps };
      return s.valor.fn;
    },
  };
}

checar(
  'a internal de despacho de hooks do React existe (senão este arquivo não prova NADA)',
  INTERNALS != null && 'H' in INTERNALS,
  true,
);

// ═══════════════════════════════════════════════════════════════════════════
// REDE CONTROLADA — cada consulta fica PENDENTE até o teste mandar responder.
// É o único jeito de encenar "resposta velha chegando depois".
// ═══════════════════════════════════════════════════════════════════════════
type Pendente = { cep: string; entregar: (corpo: unknown) => void };
let fila: Pendente[] = [];

globalThis.fetch = (async (url: unknown) => {
  const u = String(url);
  const cep = /ws\/(\d{8})\//.exec(u)?.[1] ?? '';
  return await new Promise<Response>(resolver => {
    fila.push({
      cep,
      entregar: corpo =>
        resolver(new Response(JSON.stringify(corpo), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    });
  });
}) as any;

/** Corpo real do ViaCEP (mesma procedência de scripts/teste-brasil-dados.ts). */
function viacep(logradouro: string, bairro: string, localidade: string, uf: string) {
  return { cep: '00000-000', logradouro, complemento: '', bairro, localidade, uf };
}
const SE_SAO_PAULO = viacep('Praça da Sé', 'Sé', 'São Paulo', 'SP');
const COPACABANA_RIO = viacep('Avenida Atlântica', 'Copacabana', 'Rio de Janeiro', 'RJ');

/** Responde a consulta pendente daquele CEP. Falha alto se ninguém pediu. */
function responder(cep: string, corpo: unknown): void {
  const i = fila.findIndex(p => p.cep === cep);
  if (i < 0) throw new Error(`nada pendente para o CEP ${cep} (pendentes: ${fila.map(p => p.cep).join(',') || 'nenhum'})`);
  const [p] = fila.splice(i, 1);
  p.entregar(corpo);
}

/** Deixa as promessas do hook assentarem. Macrotask, não microtask: a cadeia tem awaits. */
const assentar = () => new Promise(r => setTimeout(r, 0));

function zerar(): void {
  limparCacheCep();
  fila = [];
}

// ═══════════════════════════════════════════════════════════════════════════
// A TELA DE MENTIRA — o mínimo que as três telas de cliente fazem: um
// formulário, uma chave de registro, e o hook lendo o formulário no instante da
// RESPOSTA (é o que `lerAtual` existe para permitir).
// ═══════════════════════════════════════════════════════════════════════════
type Campos = { endereco?: string; cidade?: string; estado?: string };

function montarTela(chaveInicial: string) {
  const estado = {
    form: {} as Campos,
    cep: '',
    chave: chaveInicial,
    preenchimentos: 0,
  };
  const host = new Host(() =>
    useCepLookup(
      (campos: Campos) => {
        estado.preenchimentos++;
        estado.form = { ...estado.form, ...campos };
      },
      () => estado.form,
      estado.chave,
    ),
  );
  host.render();
  // `async` porque `consultarCep` só chega no `fetch` depois de alguns awaits
  // (ele tenta a porta do worker primeiro). Sem esperar, o teste olharia a fila
  // antes de a consulta existir.
  const digitar = async (masked: string) => {
    host.saida.onCepChange(masked, (m: string) => {
      estado.cep = m;
    });
    host.render();
    await assentar();
    host.render();
  };
  /** Fechar e reabrir o formulário — sem desmontar o componente, que é o cerne do bug. */
  const trocarPara = (chave: string) => {
    estado.chave = chave;
    host.render();
  };
  return { estado, host, digitar, trocarPara };
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n1) O CAMINHO FELIZ — o atalho continua sendo atalho');
{
  zerar();
  const t = montarTela('cliente-A');
  checar('nasce ocioso (≠ de "consultei e não achei")', t.host.saida.estadoCep, 'ocioso');

  await t.digitar('01310-1');
  checar('CEP incompleto não consulta ninguém', fila.length, 0);
  checar('e o campo continua digitável (foi atualizado antes da rede)', t.estado.cep, '01310-1');

  await t.digitar('01310-100');
  checar('8 dígitos disparam UMA consulta', fila.length, 1);
  checar('e a tela diz que está consultando', t.host.saida.estadoCep, 'consultando');

  responder('01310100', SE_SAO_PAULO);
  await assentar();
  t.host.render();
  checar('estado ok', t.host.saida.estadoCep, 'ok');
  checar('formulário vazio foi preenchido', t.estado.form, {
    endereco: 'Praça da Sé',
    cidade: 'São Paulo',
    estado: 'SP',
  });
  checar('sem divergência (não havia nada digitado para conflitar)', t.host.saida.divergencias, []);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n2) NÃO SOBRESCREVE o que o usuário digitou — a regra da casa');
{
  zerar();
  const t = montarTela('cliente-A');
  // Ele digitou a cidade à mão ANTES de chegar no CEP.
  t.estado.form = { cidade: 'Guarulhos', endereco: 'Rua das Flores 120' };

  await t.digitar('01310-100');
  responder('01310100', SE_SAO_PAULO);
  await assentar();
  t.host.render();

  checar('a cidade digitada à mão CONTINUA lá', t.estado.form.cidade, 'Guarulhos');
  // `endereco` carrega o número da casa. Sobrescrever apagaria o número.
  checar('o endereço com número não foi trocado pelo logradouro puro', t.estado.form.endereco, 'Rua das Flores 120');
  checar('a UF, essa sim, entrou (estava vazia)', t.estado.form.estado, 'SP');
  checar('a cidade virou PERGUNTA, não sobrescrita', t.host.saida.divergencias, [
    { campo: 'cidade', rotulo: 'Cidade', seu: 'Guarulhos', doCep: 'São Paulo' },
  ]);

  // E só o toque explícito aplica.
  t.host.saida.usarDoCep();
  t.host.render();
  checar('depois do toque em "Usar o do CEP", aí sim muda', t.estado.form.cidade, 'São Paulo');
  checar('e o aviso some (não dá para tocar duas vezes)', t.host.saida.divergencias, []);
  checar('o número da casa sobreviveu ao toque', t.estado.form.endereco, 'Rua das Flores 120');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n3) O ACHADO B-1 — o veredito NÃO sobrevive à troca de registro');
{
  zerar();
  const t = montarTela('cliente-A');
  t.estado.form = { cidade: 'Guarulhos' };
  await t.digitar('01310-100');
  responder('01310100', SE_SAO_PAULO);
  await assentar();
  t.host.render();
  checar('[A] o cliente A ficou com a caixa de divergência', t.host.saida.divergencias.length, 1);
  checar('[A] e com o endereço achado', t.host.saida.enderecoCep?.cidade, 'São Paulo');

  // Salvou o A e abriu "Novo Cliente". O componente NÃO desmonta; só o
  // formulário é zerado. Era aqui que a caixa amarela do A ficava na tela.
  t.estado.form = {};
  t.trocarPara('fechado');
  checar('[B] fechar o formulário zera o veredito', t.host.saida.estadoCep, 'ocioso');
  checar('[B] a caixa de divergência do A morreu junto', t.host.saida.divergencias, []);
  checar('[B] e o endereço do A também', t.host.saida.enderecoCep, null);

  t.trocarPara('novo');
  checar('[C] o formulário novo abre limpo', t.host.saida.estadoCep, 'ocioso');
  checar('[C] sem divergência herdada', t.host.saida.divergencias, []);

  // O TOQUE QUE CORROMPIA O DADO: com o veredito vivo, isto gravava a cidade
  // do cliente A no cliente B. Agora é inerte.
  const antes = JSON.stringify(t.estado.form);
  t.host.saida.usarDoCep();
  t.host.render();
  checar('[D] "Usar o do CEP" no formulário novo não grava NADA', JSON.stringify(t.estado.form), antes);
  checar('[D] e o formulário do cliente B segue vazio', t.estado.form, {});
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n4) B-1, a metade sem botão — resposta EM VOO não cai no registro novo');
{
  zerar();
  const t = montarTela('cliente-A');
  await t.digitar('01310-100');
  checar('consulta do cliente A está no ar', fila.length, 1);

  // Ele desiste, fecha e abre um cadastro novo ANTES de a resposta chegar.
  t.estado.form = {};
  t.trocarPara('fechado');
  t.trocarPara('novo');

  responder('01310100', SE_SAO_PAULO);
  await assentar();
  t.host.render();

  checar('a resposta atrasada do A NÃO preencheu o formulário do B', t.estado.form, {});
  checar('e nem chamou o preenchedor', t.estado.preenchimentos, 0);
  checar('a tela do B continua ociosa, sem "Endereço encontrado"', t.host.saida.estadoCep, 'ocioso');
  checar('e sem endereço herdado', t.host.saida.enderecoCep, null);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n5) B-3 — a guarda de corrida: a resposta LENTA do CEP anterior perde');
{
  zerar();
  const t = montarTela('onboarding');
  // Digitou um CEP, viu que errou, apagou e digitou outro. Duas no ar.
  await t.digitar('01310-100');
  await t.digitar('01310-10');
  await t.digitar('22021-001');
  checar('duas consultas no ar (a primeira não foi cancelada, só será descartada)', fila.length, 2);

  // A do CEP NOVO responde primeiro…
  responder('22021001', COPACABANA_RIO);
  await assentar();
  t.host.render();
  checar('o CEP atual preencheu', t.estado.form.cidade, 'Rio de Janeiro');

  // …e a do CEP VELHO chega depois. É este atraso que preenchia com o endereço errado.
  responder('01310100', SE_SAO_PAULO);
  await assentar();
  t.host.render();
  checar('a resposta velha NÃO sobrescreve a nova', t.estado.form.cidade, 'Rio de Janeiro');
  checar('nem o logradouro', t.estado.form.endereco, 'Avenida Atlântica');
  checar('nem o que a tela mostra', t.host.saida.enderecoCep?.cidade, 'Rio de Janeiro');
  checar('o preenchedor rodou UMA vez só', t.estado.preenchimentos, 1);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n6) "não sei" nunca vira "não tem" — e nada disso trava a digitação');
{
  zerar();
  const t = montarTela('cliente-A');
  await t.digitar('99999-999');
  responder('99999999', { erro: 'true' }); // marca inequívoca do ViaCEP
  await assentar();
  t.host.render();
  checar('ViaCEP confirmando ausência = nao_encontrado', t.host.saida.estadoCep, 'nao_encontrado');
  checar('e nenhum campo foi inventado', t.estado.form, {});

  zerar();
  const t2 = montarTela('cliente-A');
  await t2.digitar('01310-100');
  responder('01310100', { cep: '01310-100' }); // corpo sem cidade/UF: inutilizável
  await assentar();
  t2.host.render();
  checar('endereço pela metade = indisponivel, NUNCA nao_encontrado', t2.host.saida.estadoCep, 'indisponivel');
  checar('e NUNCA "ok" com campo em branco', t2.estado.form, {});
  // A digitação nunca dependeu da rede: o campo foi atualizado antes da consulta.
  checar('o campo de CEP recebeu o que ele digitou, mesmo assim', t2.estado.cep, '01310-100');

  // Apagar um dígito derruba o veredito — senão a tela acusaria "não achei"
  // enquanto ele ainda digita outro CEP.
  await t2.digitar('01310-10');
  checar('voltar a menos de 8 dígitos volta a ocioso', t2.host.saida.estadoCep, 'ocioso');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n7) O reset por chave é de RENDER, e não custa loop');
{
  zerar();
  const t = montarTela('cliente-A');

  // Trocar de registro SEM veredito pendente não deve custar render nenhum
  // extra — é o caso comum (abrir um cadastro atrás do outro). Só funciona
  // porque a lista vazia é uma referência COMPARTILHADA: com `[]` literal, o
  // `Object.is` falharia e toda troca pagaria uma passada à toa.
  t.trocarPara('cliente-B');
  checar('trocar de registro com o veredito já limpo custa 1 passada', t.host.rendersDoUltimoFlush, 1);

  // Agora COM veredito para derrubar: aí sim há uma segunda passada, a que já
  // enxerga tudo zerado. Mais que 2 seria estado oscilando.
  t.estado.form = { cidade: 'Guarulhos' };
  await t.digitar('01310-100');
  responder('01310100', SE_SAO_PAULO);
  await assentar();
  t.host.render();
  checar('(preparo) há veredito e divergência para derrubar', t.host.saida.divergencias.length, 1);

  t.trocarPara('cliente-C');
  checar('derrubar um veredito de verdade custa 2 passadas', t.host.rendersDoUltimoFlush, 2);
  checar('e converge limpo', [t.host.saida.estadoCep, t.host.saida.divergencias.length], ['ocioso', 0]);

  // Renderizar de novo com a MESMA chave não repete o reset.
  t.host.render();
  checar('render com a mesma chave custa 1 passada', t.host.rendersDoUltimoFlush, 1);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n8) O MESCLADOR, direto — é ele que decide o que pode ser tocado');
{
  const achado = { cep: '01310100', logradouro: 'Av. Paulista', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP' };
  checar('tudo vazio: preenche tudo', mesclarEndereco({}, achado), {
    campos: { endereco: 'Av. Paulista', cidade: 'São Paulo', estado: 'SP' },
    divergencias: [],
  });
  checar('tudo preenchido e igual: não toca em nada, sem alarme', mesclarEndereco({ endereco: 'X', cidade: 'São Paulo', estado: 'SP' }, achado), {
    campos: {},
    divergencias: [],
  });
  // Acento e caixa não podem gerar alarme falso — alarme que dispara sempre
  // ninguém lê, e aí o alarme de verdade passa batido.
  checar('"Sao Paulo" e "São Paulo" são o MESMO valor', mesclarEndereco({ cidade: 'sao  PAULO' }, achado).divergencias, []);
  checar('divergência real vira pergunta, nunca escrita', mesclarEndereco({ cidade: 'Guarulhos' }, achado), {
    campos: { endereco: 'Av. Paulista', estado: 'SP' },
    divergencias: [{ campo: 'cidade', rotulo: 'Cidade', seu: 'Guarulhos', doCep: 'São Paulo' }],
  });
  checar('o "sim" explícito aplica só o que divergiu', aplicarDivergencias([{ campo: 'cidade', rotulo: 'Cidade', seu: 'G', doCep: 'São Paulo' }]), {
    cidade: 'São Paulo',
  });
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n9) O FONTE — a fiação das quatro telas (comentários REMOVIDOS antes de olhar)');

/**
 * Remove `//` e blocos, preservando strings e templates. Sem isto, o comentário
 * que EXPLICA o bug antigo (`|| p.cidade`, citado no Onboarding) seria acusado
 * como se fosse o bug.
 */
function semComentarios(src: string): string {
  let fora = '';
  let i = 0;
  let aspa: string | null = null;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (aspa) {
      if (c === '\\') { fora += c + (d ?? ''); i += 2; continue; }
      if (c === aspa) aspa = null;
      fora += c; i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { aspa = c; fora += c; i++; continue; }
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    fora += c; i++;
  }
  return fora;
}

/** Argumentos de nível superior de uma chamada, por contagem de profundidade. */
function argumentosDe(src: string, chamada: string): string[] | null {
  const inicio = src.indexOf(chamada + '(');
  if (inicio < 0) return null;
  let i = inicio + chamada.length + 1;
  let prof = 0;
  let aspa: string | null = null;
  const args: string[] = [];
  let atual = '';
  while (i < src.length) {
    const c = src[i];
    if (aspa) {
      if (c === '\\') { atual += c + (src[i + 1] ?? ''); i += 2; continue; }
      if (c === aspa) aspa = null;
      atual += c; i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { aspa = c; atual += c; i++; continue; }
    if ('([{'.includes(c)) prof++;
    if (')]}'.includes(c)) {
      if (c === ')' && prof === 0) { args.push(atual); return args.map(a => a.trim()).filter(a => a.length > 0); }
      prof--;
    }
    if (c === ',' && prof === 0) { args.push(atual); atual = ''; i++; continue; }
    atual += c; i++;
  }
  return null;
}

const raiz = new URL('../', import.meta.url);
const ler = (rel: string) => semComentarios(readFileSync(new URL(rel, raiz), 'utf8'));

const fonteCep = ler('src/services/cep.ts');
/**
 * O terceiro item diz se a chave PRECISA VARIAR com o registro.
 *
 * Não é detalhe de teste — é a diferença entre a rede pegar o bug e não pegar.
 * A versão anterior só conferia que a tela passava TRÊS argumentos, e um revisor
 * mostrou que trocar as chaves das quatro telas por uma constante deixava a
 * suíte inteira verde: o defeito voltava e ninguém era avisado. Contar argumento
 * prova que alguém digitou algo ali; não prova que o que foi digitado funciona.
 *
 * O Onboarding é a exceção LEGÍTIMA: é fluxo único, não troca de registro, e uma
 * chave constante ali é o correto. Uma regra cega reprovaria justamente a tela
 * que está certa — por isso a exceção é declarada aqui, com motivo, e não um `if`
 * escondido no meio do teste.
 */
const TELAS: Array<[string, string, { chaveVaria: boolean }]> = [
  ['ClientesScreen', 'src/screens/ClientesScreen.tsx', { chaveVaria: true }],
  ['Step1Cliente', 'src/steps/Step1Cliente.tsx', { chaveVaria: true }],
  ['PainelCliente', 'src/screens/desktop/PainelCliente.tsx', { chaveVaria: true }],
  ['OnboardingScreen', 'src/screens/OnboardingScreen.tsx', { chaveVaria: false }],
];

{
  // (1) O hook exige `chave`. É isto que transforma "lembrar de limpar" em erro
  // de compilação: uma quinta tela não compila sem declarar de quem é o veredito.
  const assinatura = fonteCep.slice(fonteCep.indexOf('export function useCepLookup('), fonteCep.indexOf('): BuscaCep'));
  checar('a assinatura do hook foi localizada', assinatura.length > 20, true);
  checar('o hook recebe `chave`', /\bchave:\s*string\s*\|\s*number\b/.test(assinatura), true);
  // Um valor padrão devolveria o bug: a tela que esquecesse compilaria mesmo assim.
  checar('e `chave` NÃO tem valor padrão (esquecer tem que quebrar o build)', /chave[^,)]*=/.test(assinatura), false);
  checar('`lerAtual` também é obrigatório (sem ele o hook não sabe o que já foi digitado)', /lerAtual[^,)]*=/.test(assinatura), false);

  // (2) O reset compara a chave e derruba as TRÊS peças do veredito + o pedido
  // em voo. Faltar o `pedidoRef` deixa metade do bug de pé (a metade sem botão).
  const corpoReset = fonteCep.slice(fonteCep.indexOf('const chaveRef'), fonteCep.indexOf('const onCepChange'));
  checar('o bloco de reset foi localizado', corpoReset.includes('chaveRef.current !== chave'), true);
  checar('o reset derruba o estado', corpoReset.includes("setEstadoCep('ocioso')"), true);
  checar('o reset derruba o endereço achado', corpoReset.includes('setEnderecoCep(null)'), true);
  checar('o reset derruba as divergências', corpoReset.includes('setDivergencias(SEM_DIVERGENCIA)'), true);
  checar('e derruba a consulta EM VOO (senão ela cai no registro novo)', corpoReset.includes('pedidoRef.current += 1'), true);

  // (3) O reset é de RENDER. Em `useEffect` ele só correria depois da pintura —
  // e um quadro com a caixa amarela do cliente anterior já é o toque errado.
  const iChaveRef = fonteCep.indexOf('const chaveRef');
  const efeitosAntes = fonteCep.slice(0, iChaveRef).includes('useEffect');
  checar('o arquivo não usa useEffect para isso', fonteCep.includes('useEffect'), false);
  checar('(e não há efeito escondido antes do reset)', efeitosAntes, false);
}

for (const [nome, caminho, regra] of TELAS) {
  const src = ler(caminho);
  const args = argumentosDe(src, 'useCepLookup');
  checar(`${nome}: usa o hook compartilhado (não uma quarta forma de fazer isso)`, args !== null, true);
  checar(`${nome}: passa os TRÊS argumentos, incluindo a chave`, args?.length, 3);

  // A CHAVE TEM DE FALAR DO REGISTRO. Literal constante ('novo', "x", `y`) numa
  // tela que troca de registro é o bug de volta: o veredito do cliente anterior
  // sobrevive, e um toque em "Usar o do CEP" grava a cidade dele no próximo.
  const chave = (args?.[2] ?? '').trim();
  const ehLiteralConstante = /^(['"`])[^${}]*\1$/.test(chave);
  if (regra.chaveVaria) {
    checar(`${nome}: a chave VARIA com o registro (não é literal fixo) — chave=${chave || '(vazia)'}`, ehLiteralConstante, false);
  } else {
    // Fluxo único: constante é o certo. Afirmado aqui para que, se a tela um dia
    // passar a trocar de registro, alguém tropece nesta linha em vez de herdar
    // um veredito velho em silêncio.
    checar(`${nome}: fluxo único, chave constante é o esperado — chave=${chave || '(vazia)'}`, ehLiteralConstante, true);
  }
  checar(`${nome}: mostra o <AvisoCep> (os seis estados, com ícone e alert)`, src.includes('<AvisoCep'), true);

  // O PADRÃO PROIBIDO. `X || p.campo` só respeita o valor do usuário quando o
  // CEP não traz nada — é exatamente o bug B-2 do Onboarding, e a razão de
  // `mesclarEndereco` existir. Vale para as quatro telas, para sempre.
  const sobrescreve = /\|\|\s*p(?:2)?\.(cidade|estado|rua|bairro|endereco|logradouro)\b/.exec(src);
  checar(`${nome}: NENHUM "|| p.campo" — nada sobrescreve o que ele digitou`, sobrescreve?.[0] ?? null, null);

  // O mesmo, na forma que o Onboarding usava para o formulário de endereço.
  const sobrescreveEnd = /(rua|bairro|cidade|estado):\s*[A-Za-z_$][\w.$]*\s*\|\|/.exec(src);
  checar(`${nome}: nem na forma "campo: doCep || doUsuario"`, sobrescreveEnd?.[0] ?? null, null);
}

{
  // O Onboarding tinha a máquina de estados própria. Ela morreu inteira — se
  // voltar, volta com a corrida (B-3) e a sobrescrita (B-2) juntas.
  const onb = ler('src/screens/OnboardingScreen.tsx');
  checar('Onboarding: a consulta própria de CEP morreu', onb.includes('consultarCep('), false);
  checar('Onboarding: o texto único que confundia os estados morreu', /setCepInfo\(/.test(onb), false);
  checar('Onboarding: o spinner solto morreu', /cepLoading/.test(onb), false);
  // O bairro não passa pelo mesclador (não existe no cadastro de cliente), e é
  // o único campo preenchido à mão aqui. A guarda de "só se estiver vazio" tem
  // que estar explícita.
  checar('Onboarding: o bairro só entra em campo VAZIO', onb.includes('!p.bairro.trim() && achado.bairro'), true);

  // O POSITIVO, e não só a ausência do padrão proibido: esta tela só pode
  // escrever o que o MESCLADOR liberou (`campos`), campo por campo. Escrever
  // direto de `achado` seria voltar ao B-2 por outro caminho — e é a única
  // parte do conserto que não dá para executar em Node (JSX + react-native).
  const semEspaco = onb.replace(/\s+/g, '');
  for (const [rotulo, forma] of [
    ['rua', '...(campos.endereco !== undefined ? { rua: campos.endereco } : null)'],
    ['cidade', '...(campos.cidade !== undefined ? { cidade: campos.cidade } : null)'],
    ['UF', '...(campos.estado !== undefined ? { estado: campos.estado } : null)'],
  ] as Array<[string, string]>) {
    checar(
      `Onboarding: ${rotulo} só é escrita quando o mesclador liberou aquele campo`,
      semEspaco.includes(forma.replace(/\s+/g, '')),
      true,
    );
  }
  // O CNPJ preenche cidade/UF da sede. Se ele passar a sobrescrever, o foro do
  // contrato volta a errar por outro caminho.
  checar('Onboarding: o cadastro por CNPJ continua só completando vazio (cidade)', onb.includes('cidade: p.cidade.trim() || e.municipio'), true);
  checar('Onboarding: idem UF', onb.includes('estado: p.estado.trim() || e.uf'), true);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
