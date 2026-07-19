# Revisão adversarial — CONTRATO e CEP

Revisor read-only. Nada foi editado além deste arquivo. Cada achado tem
`arquivo:linha` e o caminho concreto da falha. O que foi checado e está **certo**
também está registrado, para a próxima leva não gastar tempo reconferindo.

Estado verificado: código atual da branch, `scripts/teste-contrato-prestacao.ts`
**passando** (216 ok, 0 falhas) — nenhum dos achados abaixo é pego por ele.

---

## A) CONTRATO DE PRESTAÇÃO DE SERVIÇO

### A-1 · ALTO — o contrato sai sem qualificar as partes, e ninguém é avisado

`src/utils/contratoPdf.ts:314-326` (bloco "Das partes") +
`src/utils/documentoBase.ts:124-128` (`linhaInfo` omite valor vazio).

`linhaInfo` devolve `''` quando o valor é vazio. Isso é correto para "Contato",
mas o mesmo caminho apaga **CNPJ/CPF da CONTRATADA, CPF/CNPJ e Endereço do
CONTRATANTE** — os campos que qualificam quem assina. A linha simplesmente
desaparece: não há placeholder, não há aviso, nada na tela do app nem do painel
denuncia. Logo abaixo, `contratoPdf.ts:328` afirma *"As partes acima
qualificadas têm entre si justo e contratado…"* — o documento declara uma
qualificação que ele mesmo não imprimiu.

**Caminho concreto.** Prestador autônomo que não preencheu CNPJ/CPF em Meu
Negócio (campos opcionais — ver `EMPRESA_EXEMPLO` em
`src/screens/ModelosDocumentoScreen.tsx:87-92`, que nasce com `cpf: ''`) gera
contrato para um cliente cadastrado só com nome e telefone (CPF e endereço são
opcionais em todos os formulários de cliente — `PainelCliente.tsx:68-70` só
valida **formato**, nunca presença). Saída real, gerada executando
`gerarHtmlContrato`:

```html
<h2>Das partes</h2>
<div class="bloco">
  <div class="info-row">CONTRATADA … Ar Frio Serviços</div>
                                    ← sem linha de CNPJ/CPF
  <div class="info-row">Endereço … São Paulo/SP</div>
  …
</div>
<div class="bloco" style="margin-top:8px;">
  <div class="info-row">CONTRATANTE … Maria Souza</div>
                                    ← sem CPF/CNPJ
                                    ← sem Endereço
  <div class="info-row">Telefone … (11) 98888-7777</div>
</div>
```

No caso extremo (orçamento sem `clienteNome` — situação que o próprio painel
prevê: `webapp/src/pages/olli/orcamentos/index.tsx` imprime `"sem cliente"` como
rótulo de fallback, e `gerarContrato` em `:433-448` só checa blob e empresa, não
o nome), o segundo `.bloco` sai **completamente vazio** — um retângulo com borda
e nada dentro — e `blocoAssinaturas` (`documentoBase.ts:254`) imprime um nome em
branco sobre a linha do CONTRATANTE.

**Qual dos três é o certo** (a pergunta do briefing): nem recusar, nem
placeholder feio. Recusar quebra o offline-first — o prestador está na casa do
cliente e precisa do papel. Placeholder ("_____") no PDF entrega ao cliente um
documento que parece rascunho. O certo é o **quarto**: avisar ANTES de gerar,
nomeando os campos que faltam, e deixar imprimir mesmo assim — exatamente o
padrão que o `<AvisoCep>` já usa na mesma base de código. O aviso pertence a
`GerarDocumentoModal.tsx` (perto do rodapé, junto do botão) e a
`DialogoContrato.tsx` (no bloco de honestidade, `:152-157`), com a mesma frase
nos dois.

---

### A-2 · MÉDIO-ALTO — mesmo prestador, dois contratos diferentes: o selo OLLI

`webapp/src/olli/pdf/imprimirContrato.ts:36-40` e `:213-216` (não passa
`removerMarca`) vs. `src/components/documentos/GerarDocumentoModal.tsx:128-133`
(passa `temAcesso(RECURSO_REMOVE_MARCA)`).

`rodapeDocumento` (`documentoBase.ts:267-274`) só omite o selo quando
`removerMarca === true`. O app calcula o entitlement; o painel nunca o passa.

**Caminho concreto.** Prestador no plano **Pro** ou **Empresa**
(`src/services/entitlements.ts:56-73` — `remove_olli_brand` está nos dois) gera
o contrato do orçamento 0042 no celular: sai **sem** o selo OLLI. Gera o contrato
do MESMO orçamento no painel: sai **com** o selo. Ele pagou justamente para isso
não acontecer, e vai descobrir quando o cliente comparar as duas vias — ou nunca,
o que é pior.

**A justificativa no código está desatualizada.** O comentário em `:38` diz que
"o painel não tem gate de plano (nenhum `usePlano`/`temAcesso` existe aqui)".
Isso era verdade quando foi escrito; hoje o painel lê a assinatura real em
`webapp/src/pages/olli/planos/index.tsx:48-73` (query `assinaturas` →
`derivar()` de `planos/tipos.ts:69`), com os três estados já tratados. O dado
existe; falta apenas ligá-lo — e o mesmo vale para o PDF do orçamento
(`webapp/src/olli/pdf/imprimirOrcamento.ts:38`), que tem o mesmo buraco.

Cuidado ao consertar: `planos/index.tsx:118-121` já resolveu a regra difícil —
**leitura que falha não pode virar "plano Grátis"**. Quem for ligar isso tem que
reusar aquele `resumo && !isError && !membroNaoDono`, não inventar um segundo
caminho. Na dúvida (erro de leitura), o selo **fica** — é o lado seguro.

---

### A-3 · MÉDIO — a honestidade jurídica está no papel, mas impressa como letra miúda

`src/utils/documentoBase.ts:338-340`:

```css
.aviso-tit { font-size: 9.5px; color: #6B7484; }
.aviso-txt { font-size: 9.5px; color: #8A93A2; line-height: 1.55; }
```

O texto do `AVISO_JURIDICO` — as quatro frases que dizem que nada ali passou por
advogado e que a garantia legal do CDC vale de qualquer jeito — é renderizado
com **a menor fonte e o menor contraste do documento inteiro**: 9,5px (o corpo é
12,5px, `:284`) e `#8A93A2` sobre branco = **3,10:1**, abaixo do mínimo de 4,5:1
para texto normal. Em papel impresso, cinza claro em corpo 9,5 fica ainda pior.
Para comparação, o `.clausula-txt` é 12,5px `#2C3542` (≈ 12:1).

O próprio comentário do arquivo (`:29-34`) exige que o aviso apareça "de forma
clara e assumida, não como rascunho pedindo desculpa". O CSS entrega o contrário:
a disposição visual de disclaimer que ninguém deve ler.

**Caminho concreto.** Cliente recebe o contrato em PDF, lê as cláusulas em corpo
12,5 e não registra o parágrafo que informa que a garantia legal do CDC existe
independentemente do papel — a informação que o aviso presta às DUAS partes
(`:36-38`). O prestador idem: continua achando que o modelo o blinda.

Correção mínima: `.aviso-txt` para ~10,5px e `#5B6472` (≈ 6,3:1). Não muda uma
palavra do texto — muda só a chance de ele ser lido. `.aviso-tit` já está em
4,7:1 e pode ficar.

---

### A-4 · BAIXO — contrato e termos do mesmo serviço saem em cores de marca diferentes

`src/utils/contratoPdf.ts:296` → `corDoDocumento(opts?.corMarca ?? o.corMarca, empresa)`
`src/utils/termosPdf.ts:180` e `:325` → `corDoDocumento(opts?.corMarca, empresa)` (sem `o.corMarca`)

O contrato honra a cor definida **naquele orçamento**; o termo de garantia e o
termo de conclusão caem sempre na cor da empresa, porque nenhum chamador passa
`corMarca` (`GerarDocumentoModal.tsx:129-145`, `ModelosDocumentoScreen.tsx:228-231`).

**Caminho concreto.** Prestador troca a cor de marca do orçamento 0042 para
verde (o wizard permite — `Step4Personalizacao`). Contrato desse orçamento sai
verde; o termo de garantia do MESMO serviço sai azul. Os dois vão para o mesmo
cliente, no mesmo dia.

---

### Contrato — o que foi conferido e está CERTO

- **XSS (item 3 do briefing): fechado.** Percorri toda interpolação de
  `gerarHtmlContrato`. Nome do cliente, itens, descrição de item, cláusulas
  editadas, laudo técnico, observações e o título da página passam por
  `escapeHtml` (`html.ts:9-16`): `tabelaItens` (`contratoPdf.ts:238-241`),
  `textoOuLista` (`:255,257`), `criarNumerador` (`:266`), `linhaInfo`
  (`documentoBase.ts:127`), `cabecalhoDocumento` (`:165-179`),
  `blocoAssinaturas` (`:248-255`), `paginaDocumento` (`:352`). Uma cláusula com
  `<` ou `&` sai como texto literal, não quebra o documento. A única string
  interpolada crua é a cor, validada por `safeHexColor` antes
  (`documentoBase.ts:69`). Data URIs de logo/assinatura passam por `imgSrc`
  (`:116-119`), que exige prefixo `data:` e escapa. Nada a fazer.
- **App × painel montam o MESMO documento.** O painel importa
  `gerarHtmlContrato`/`termosPadraoContrato` direto de `src/utils/contratoPdf.ts`
  (`imprimirContrato.ts:43-48`). Não há segundo layout, segundo texto de cláusula
  nem segundo aviso. As duas únicas divergências reais são A-2 (selo) e a
  assimetria de edição abaixo.
- **Copy não promete validade.** `AVISO_APP` (`documentoBase.ts:52`) — "Não é
  parecer de advogado nem garante validade jurídica" — aparece no app
  (`ModelosDocumentoScreen.tsx:384`, `GerarDocumentoModal.tsx:200`) e no painel
  (`DialogoContrato.tsx:155`), importado da fonte nos dois. Varri landing
  (`web/src`), painel e `src/services/planos.ts`: nenhuma peça de marketing
  promete validade jurídica do contrato. Limpo.
- **Se preenche sozinho (item 4).** `termosPadraoContrato`
  (`contratoPdf.ts:210-229`) colhe objeto dos itens, pagamento (incluindo sinal,
  condições e formas), prazo do agendamento, garantia do orçamento e foro da
  cidade da empresa. O prestador não redigita.
- **Números não viram zero.** `numeroOuPadrao` (`:105-110`) tira `null`/`''`
  antes de converter, então campo ausente não imprime "multa de 0%". O painel
  devolve os números crus a essa mesma função (`imprimirContrato.ts:147-152`) em
  vez de recopiar os limites — e `tetosDoContrato` (`:181-197`) sonda o limite
  real em vez de escrever "2" na interface. Bom desenho, mantenha.

### Contrato — assimetria registrada (não é defeito)

O painel deixa ajustar objeto/local/prazo/pagamento/garantia **daquele documento**
(`DialogoContrato.tsx:166-282`); o app não tem esse ajuste — `GerarDocumentoModal`
gera direto de `termosPadraoContrato` (`:134-141`) e só o editor de padrões
permanentes existe no celular (`EditorClausulasContrato.tsx`). Ninguém emite
documento errado por causa disso, e os dois lados dizem o que fazem. Fica anotado
como lacuna de paridade, não como bug.

Nota menor: `EditorClausulasContrato.tsx:35-37` recopia os tetos (`MULTA_MAX = 2`
etc.) que moram dentro de `numeroOuPadrao` (`contratoPdf.ts:221-223`). Hoje batem.
O painel resolveu isso sondando o gerador; o app é a cópia que vai envelhecer.

---

## B) CEP

Resposta direta às perguntas do briefing, antes dos achados:

- **(1) Padrão.** Três telas — `ClientesScreen`, `Step1Cliente`,
  `desktop/PainelCliente` — são **idênticas**: mesmo `useCepLookup`, mesmo
  `<AvisoCep>`, mesmo `ref` para leitura no instante da resposta, CEP posicionado
  antes do endereço. O `OnboardingScreen` é a **terceira forma** (B-2/B-3).
- **(2) Seis estados.** Distintos nas três que usam `<AvisoCep>`
  (`AvisoCep.tsx:38-73`): `ocioso` e `invalido` não renderizam nada (correto —
  não brigar com o dedo de quem digita), `consultando` gira, `nao_encontrado` e
  `indisponivel` têm frases e ícones diferentes. No Onboarding os textos também
  são distintos, mas ver B-2.
- **(3) Sem rede o campo continua digitável nas QUATRO.** O hook chama
  `atualizarCampo(masked)` como primeira instrução, antes de qualquer rede
  (`cep.ts:390-393`); o Onboarding faz o mesmo (`OnboardingScreen.tsx:139`).
  `consultarCep` nunca lança (`cep.ts:232-246`) e nenhum campo é desabilitado
  durante a consulta. A consulta é atalho, não barreira. ✔
- **(5) O `formRef` do `PainelCliente` está CORRETO.**
  `PainelCliente.tsx:46-51`: `formRef.current = form` é atribuído no corpo do
  render, e `lerAtual` só é invocado dentro do `.then` da resposta
  (`cep.ts:417`) — lê o formulário no instante da **resposta**, não no do toque.
  Mesmo padrão de `ClientesScreen.tsx:203-208` (`editingRef`) e
  `Step1Cliente.tsx:59-64` (`ncRef`). Nada a corrigir. ✔

### B-1 · ALTO — o veredito do CEP sobrevive à troca de cliente (e o botão grava o dado errado)

`src/services/cep.ts:372-439` (o hook não expõe reset e não se limpa sozinho) +
`src/screens/ClientesScreen.tsx:205-208` e `:611` +
`src/steps/Step1Cliente.tsx:61-64` e `:142-143` +
`src/screens/desktop/PainelCliente.tsx:48-51` e `:56-61`.

Nas três telas o hook vive no **componente pai**, que nunca desmonta entre
clientes (o modal é `visible={...}`, não montagem condicional do dono do estado).
Fechar e reabrir reseta só o formulário e os erros:

- `ClientesScreen.tsx:611` → `setEditing(null); setErrors({})`
- `Step1Cliente.tsx:142-143` → `setShowNew(false); setNc({})`
- `PainelCliente.tsx:56-61` → `setForm(...); setErros({})`

`estadoCep`, `enderecoCep` e `divergencias` **permanecem**. Não há como limpá-los:
o hook devolve apenas `{ estadoCep, enderecoCep, divergencias, onCepChange,
usarDoCep }` (`cep.ts:354-362`) — nenhuma função de reset existe.

**Caminho concreto (o pior).** No wizard, `Step1Cliente`:

1. Prestador cadastra o cliente A. Digita o CEP de A. A cidade que ele já tinha
   digitado (`Guarulhos`) não bate com a do CEP (`São Paulo`) → `mesclarEndereco`
   devolve divergência (`cep.ts:328-330`) e o `<AvisoCep>` mostra a caixa amarela
   *"Cidade: você escreveu 'Guarulhos', o CEP diz 'São Paulo'. Não mudei nada —
   você decide"* com o botão **"Usar o do CEP"** (`AvisoCep.tsx:93-104`).
2. Ele ignora, salva A. `setNc({})` limpa o formulário; o banner **não** some.
3. Toca em "Novo Cliente" de novo. Formulário em branco, e a caixa amarela do
   cliente A ainda na tela, com o botão ativo.
4. Ele toca em "Usar o do CEP" — o botão está bem ali, e ele acha que é sobre o
   cliente que está na tela. `usarDoCep` (`cep.ts:433-437`) grava
   `cidade: 'São Paulo'` no cliente **B**, a partir do CEP de **A**.

Resultado: dado do cliente B corrompido por um toque, sem nada na tela indicando
o erro. É exatamente a "sobrescrita silenciosa" que toda a feature foi construída
para impedir — só que pela porta dos fundos.

**Versão mais branda, mas mais frequente:** basta o passo 3. Abrir um cliente novo
e ler *"Esse CEP não existe nos Correios"* (`AvisoCep.tsx:53-61`) sobre um campo
de CEP vazio. O prestador vai conferir o número com o cliente errado.

**Onde consertar:** no hook, não nas telas — três telas resetando à mão é como
essa família de bug nasce. Expor um `limpar()` em `BuscaCep` e chamá-lo no
`useEffect` de abertura de cada modal; ou aceitar um `chave` (id do cliente) e
zerar quando ela mudar. O `OnboardingScreen` não é afetado (fluxo único, sem
troca de registro).

### B-2 · ALTO — o Onboarding sobrescreve o que o usuário digitou, e o comentário diz o contrário

`src/screens/OnboardingScreen.tsx:155-166`:

```ts
if (r.estado === 'ok') {
  // preenche e mantém editável; só completa o que está vazio   ← linha 156
  setEnd(p => ({ ...p, rua: r.endereco.logradouro || p.rua,
                       bairro: r.endereco.bairro || p.bairro }));
  setEmp(p => ({ ...p, cidade: r.endereco.cidade || p.cidade,
                       estado: r.endereco.uf   || p.estado }));
```

`r.endereco.cidade || p.cidade` só cai em `p.cidade` quando o CEP **não** traz
cidade. Quando traz — que é o caso `ok` — o valor do usuário é **substituído**.
O comentário da linha 156 afirma o oposto do que as quatro linhas abaixo fazem.

É literalmente o bug que `ClientesScreen.tsx:194-199` documenta como **já
corrigido**: *"A versão anterior fazia `cidade: r.cidade || p.cidade`, que apagava
a cidade digitada à mão sem ele ver."* A correção foi aplicada nas telas de
cliente e não chegou ao Onboarding.

**Caminho concreto (o mais provável, porque a tela induz a ordem).** No
Onboarding o prestador usa primeiro o **cadastro mágico por CNPJ**
(`:208-224`), que preenche cidade/estado corretamente e **só em campo vazio**
(`cidade: p.cidade.trim() || e.municipio`). Depois desce para a seção 3
(Endereço) e digita o CEP da **oficina** — que não é o endereço da sede
registrada na Receita. `cidade` e `estado` da empresa, vindos do CNPJ, são
sobrescritos em silêncio pelos do CEP. O cadastro da empresa nasce com a cidade
errada — e essa cidade é a que vai para o **foro do contrato**
(`contratoPdf.ts:194-199`, `foroPadrao`) e para o cabeçalho de todo documento.

Segundo caminho: ele corrige `rua` à mão (base de CEP costuma abreviar), volta,
ajusta um dígito do CEP e completa os 8 de novo → a correção dele é desfeita.

**Conserto certo:** trocar as quatro linhas por `mesclarEndereco` + `<AvisoCep>`,
como nas outras três. `mesclarEndereco` (`cep.ts:311-334`) já é puro e não depende
de sessão; `<AvisoCep>` não importa nada de autenticado. O Onboarding roda antes
da sessão, mas isso afeta só a porta de consulta (o `consultarCep` já trata,
`cep.ts:26-42`) — não a mesclagem nem a UI.

### B-3 · MÉDIO — o Onboarding não tem guarda de corrida: a resposta lenta do CEP anterior vence

`src/screens/OnboardingScreen.tsx:138-143` e `:145-181`.

`lookupCep` é disparado a cada vez que o campo fecha 8 dígitos e não tem nada
equivalente ao `pedidoRef` do hook (`cep.ts:379-384,405,410`), que descarta
resposta velha.

**Caminho concreto.** Rede 3G. O prestador digita `01310100`, percebe o erro,
apaga um dígito e digita `01310200`. Duas consultas no ar. A do CEP **antigo**
volta depois (ou o segundo CEP cai em `indisponivel` por timeout de 6s enquanto o
primeiro respondeu do cache do worker). O formulário fica com o endereço do CEP
errado e a mensagem *"Endereço encontrado — confira e complete o número"* — a
forma mais perigosa de errar: silenciosa e plausível. Combinado com B-2, o valor
antigo ainda por cima **sobrescreve** o que ele digitou depois.

Some-se: o `cepInfo` (`:515`) é um `<Text>` único com `color: accentLight`
(`:761`) para sucesso, "não achei" e "não consegui" — sem ícone e sem
`accessibilityRole="alert"`, que o `<AvisoCep>` tem (`AvisoCep.tsx:55,66`). O
texto distingue os estados; a forma, não. Migrar para `<AvisoCep>` (B-2) resolve
B-2, B-3 e isso de uma vez.

### CEP — o que foi conferido e está CERTO

- `apenasDigitosCep` + `length !== 8` → `invalido` antes de qualquer rede
  (`cep.ts:233-234`).
- Cache só de sucesso; `nao_encontrado` e `indisponivel` **não** são cacheados no
  aparelho (`cep.ts:91-99`) — um CEP novo não fica morto.
- `normalizarEndereco` (`:123-143`) exige cidade + UF: endereço pela metade vira
  `indisponivel`, não `ok` com campo em branco.
- Worker respondeu `ok` com endereço inutilizável → `indisponivel`, nunca
  `nao_encontrado` (`:173-178`). 401 cai para a segunda porta (`:168`).
- ViaCEP: aceita `erro` como string **e** booleano (`:213`) — comparar com
  `=== true` deixaria inexistente passar como endereço vazio.
- `mesmoTexto` (`:284-297`) ignora caixa/acento/espaço duplo, com o range de
  diacríticos escrito por escape em string (`:282`) — "São Paulo" e "Sao Paulo"
  não geram divergência falsa.
- `usarDoCep` aplica só `cidade`/`estado`, nunca `endereco` (`:341-345`): o
  número da casa que o usuário digitou não é apagado.

---

## Ordem sugerida para a próxima leva

1. **B-1** — corrompe dado de cliente com um toque, nas três telas principais.
2. **B-2** — apaga cidade/estado da empresa no cadastro inicial; contamina o foro
   do contrato.
3. **A-1** — contrato sai sem qualificação das partes, sem aviso.
4. **A-2** — selo OLLI no painel para quem paga para não tê-lo.
5. **A-3** — aviso jurídico legível.
6. **B-3**, **A-4** — corrida no Onboarding e cor divergente entre documentos.
