# FICHA DA LOJA — Google Play (pt-BR)

> **Regra desta ficha: nada aqui foi escrito de memória.** Cada afirmação abaixo foi conferida
> contra o código deste repositório (arquivo e linha citados em `PROVAS` no fim do documento).
> O app tem **zero usuários** hoje — não há um único número de adoção, avaliação ou "usado por
> milhares" nesta ficha, e não pode haver: além de ser mentira, a política de metadados da Play
> proíbe alegação de desempenho/ranking na ficha.
>
> Limites conferidos na fonte oficial (Play Console Help, jul/2026):
> título **30**, descrição breve **80**, descrição completa **4.000**.
> Contagens abaixo medidas com `[...string].length` (acento conta como 1 caractere).

---

## 1. Título do app — campo "Nome do app"

```
OLLI: Orçamento, OS e Recibo
```
**28/30 caracteres.**

Por que não só `OLLI Orçamentos` (o `expo.name` do `app.json`): o título é o campo de maior peso
na busca da Play, e "OLLI" é uma marca que **ninguém procura** — o app tem zero usuários, então não
existe busca por marca para capturar. Os três termos que sobraram são as três coisas que o app
realmente emite (orçamento, ordem de serviço, recibo), não palavras soltas — a política proíbe
"repetitive or unrelated keywords", e estas são relacionadas e não repetidas.

**Alternativa conservadora**, se o dono preferir só a marca: `OLLI Orçamentos` (15/30). Perde busca,
não ganha nada em conformidade — as duas passam.

> Não use emoji, ALL CAPS ou "nº 1 / grátis / promoção" no título, no ícone ou no nome do
> desenvolvedor: a política de metadados barra os três explicitamente.

## 2. Descrição breve — campo "Descrição breve"

```
Orçamento, ordem de serviço e recibo em PDF para quem atende em campo
```
**69/80 caracteres.**

"Quem atende em campo" e não "eletricistas e técnicos" (texto antigo do `docs/STORE_LISTING.md`):
o app deixou de ser só HVAC/elétrica. `src/services/verticais.ts` traz sete ofícios — refrigeração,
elétrica, hidráulica, pintura, dedetização, jardinagem e serviços em geral. Restringir a descrição a
dois deles é errar o público de propósito.

## 3. Descrição completa — campo "Descrição completa"

```
O OLLI é o app do prestador de serviço que atende na rua: você monta o orçamento na frente do
cliente, colhe a assinatura ali mesmo e emite o recibo — sem voltar pra casa para "passar a limpo".

ORÇAMENTO PRONTO AINDA NA VISITA
Monte o orçamento de serviço com catálogo de serviços e produtos e cálculo automático. O PDF sai com
a marca do seu negócio (sua logo e sua cor) e vai para o cliente pelo WhatsApp. Ele abre o link no
próprio celular e aprova, sem precisar instalar nada.

O CLIENTE ASSINA NO SEU APARELHO
Passe o celular, o cliente assina com o dedo e a assinatura entra no documento. Aprovação registrada
na hora, sem papel e sem depender de sinal.

RECIBO E ORDEM DE SERVIÇO
Aprovou, o recibo sai em um toque. A ordem de serviço acompanha o trabalho do começo ao fim, com o
histórico de cada cliente e de cada equipamento.

DITE EM VEZ DE DIGITAR
Fale o que foi feito e a assistente Olli monta o orçamento estruturado, pronto para você revisar e
enviar. Também dá para perguntar sobre um código de erro ou tirar uma dúvida técnica por texto.
Os recursos com inteligência artificial têm 3 usos por mês no plano Grátis; os planos pagos liberam
sem cota. Respostas geradas por IA podem conter erro — confira antes de enviar ao cliente, e use o
botão de sinalizar quando algo sair errado.

DIAGNÓSTICO QUE FUNCIONA SEM INTERNET
Quase 700 códigos de erro de ar-condicionado e refrigeração, de 23 marcas, com causa provável e o
que checar. A consulta é offline, direto no bolso, no meio da visita.

AS FERRAMENTAS DO SEU OFÍCIO
O app se ajusta ao seu ramo em vez de mostrar tudo para todo mundo:
- Refrigeração e climatização: PMOC (plano de manutenção, operação e controle), etiqueta QR por
  equipamento, cálculo de BTU e de carga de gás
- Hidráulica: dimensionamento de caixa d'água
- Pintura: cálculo de tinta, massa e diluição
- Dedetização: certificado no padrão RDC da ANVISA
- Eletricista, jardinagem e serviços em geral: o núcleo completo de orçamento, ordem de serviço e
  recibo, com o catálogo do seu jeito

CLIENTES, AGENDA E O DINHEIRO PARADO
Cadastro de clientes, agenda de visitas com lembrete antes do horário, e um painel que mostra o que
já foi aprovado e ainda não foi pago — com o valor e há quantos dias está parado.

FUNCIONA OFFLINE E SINCRONIZA DEPOIS
Os dados ficam no seu aparelho, em banco local, e sobem para a nuvem quando você entra na conta.
Sinal ruim no meio da obra não faz você perder trabalho.

EQUIPE (plano Empresa)
Convide técnicos com papéis diferentes — administrador, gestor e técnico — e cada um vê só o que
precisa ver.

PLANOS
O plano Grátis não expira e não limita quantidade: orçamento, recibo, ordem de serviço, clientes,
agenda e diagnóstico offline são livres. Os planos Pro e Empresa acrescentam IA sem cota,
relatórios, metas, radar de clientes, modelos extras de PDF e a remoção da marca OLLI do documento.
Os planos e os valores ficam na aba Conta, dentro do app.

Você pode apagar sua conta e seus dados pelo próprio app, na aba Conta.

Feito para o autônomo e a pequena equipe que trabalham na rua, não atrás de uma mesa.
```

**3.085/4.000 caracteres** — sobra 915. Medido por `node assets/loja/medir.js`, que relê este
próprio arquivo; **não confie neste número depois de editar o texto sem rodar o script de novo.**
(Este número já mudou uma vez nesta entrega, quando os termos de busca foram costurados no texto —
é exatamente por isso que a medição virou script em vez de ficar escrita à mão.)

### O que foi deliberadamente DEIXADO DE FORA (e por quê)

Estas features existem no repositório mas **não podem** entrar na ficha, porque prometer o que o
app não entrega é reprovação na revisão e nota 1 na loja:

| Não prometido | Motivo (fonte) |
| --- | --- |
| Checklist NR-10, laudo elétrico + ART, laudo de estanqueidade, contrato recorrente | `src/services/verticais.ts` → `FERRAMENTAS`: `disponivel: false`. São fila de construção, não produto. |
| Google Agenda / sincronizar com o calendário | Código existe (`src/services/googleAgenda.ts`) mas está **desligado em produção**: falta o client OAuth Android (passo humano). `googleAgendaDisponivel()` é sempre `false` hoje — a UI nem aparece. |
| "Equipe ao vivo" no mapa / localização do técnico | `LOCALIZACAO_DISPONIVEL = false` em `src/services/localizacaoEquipe.ts` e `expo-location` **não está** no `package.json` (medido). No APK isso é inerte. |
| ETA / tempo de chegada com trânsito | Mesma trava: depende de `expo-location`, que não está instalado. Funciona só na web hoje. |
| Pagamento por Pix dentro do app | Gateway (Mercado Pago) ainda depende de passo humano — ver memória `olli-gateway-pix-decisao`. |
| Qualquer número de usuários, avaliação, "o melhor", "nº 1", preço ou promoção | Zero usuários reais; e a política de metadados da Play proíbe alegação de ranking/preço nesses campos. |

### Detalhes de redação que são de conformidade, não de estilo

- **A menção à IA é obrigatória em espírito e barata em custo.** O app tem três superfícies
  generativas (chat, diagnóstico e voz em modo conversa). Dizer na ficha que a resposta pode errar e
  que existe um botão de sinalizar alinha a ficha ao que o app realmente faz
  (`src/components/SinalizarIA.tsx` → `enviarDenunciaIA` em `src/services/feedback.ts`) e é
  exatamente o que a política de AI-Generated Content espera ver.
- **A cota de 3 usos/mês está escrita porque é verdade** (`worker/src/creditos.js`:
  `IA_GRATIS_MES = 3`). Ficha que diz "IA ilimitada" e entrega 3 usos vira avaliação de 1 estrela na
  primeira semana.
- **A exclusão de conta está citada de propósito.** O botão existe
  (`src/services/conta.ts` + `worker/src/conta.js` → `POST /conta/excluir`) e o formulário de
  Segurança dos Dados vai declarar que ela existe — as duas pontas precisam bater.

## 4. Novidades desta versão — campo "Novidades"

> Limite do campo: **500 caracteres**. Reescreva a cada envio a partir de `docs/EXECUTION_LOG.md`;
> não repita esta lista numa versão que não a contém.

```
- O cliente agora assina o orçamento no seu aparelho, com o dedo
- Painel do dinheiro parado: veja o que foi aprovado e ainda não foi pago, e cobre pelo WhatsApp
- Etiqueta QR por equipamento, para consultar o histórico na próxima visita
- Tema claro e escuro, com leitura melhor no sol
- Correções de estabilidade
```
**314/500 caracteres** (medido por `medir.js`).

## 5. Categoria, contato e URLs

| Campo | Valor | Observação |
| --- | --- | --- |
| Categoria do app | **Empresarial** (Business) | Concorrentes diretos de "orçamento/OS" estão em Empresarial ou Ferramentas. Empresarial descreve melhor o produto; a categoria pesa pouco na busca perto do título e da descrição. |
| Tags | Orçamento · Gestão de negócios · Produtividade | Máx. 5 tags; escolher na Console, não é campo livre. |
| E-mail de contato | **[DONO]** — precisa ser um e-mail que ele leia | Fica público na ficha. |
| Site | `https://olliorcamentos.online` | No ar. |
| Política de privacidade | `https://olliorcamentos.online/legal/privacidade/` | Página existe (`web/src/pages/legal/privacidade.astro`) e o atalho `/privacidade` **já tem redirect 301** configurado em `web/astro.config.mjs`. ⚠️ **Abra as duas URLs no navegador antes de colar na Console** — não deu para confirmar daqui (as duas devolvem 403 a acesso automatizado, provável proteção antibot do Cloudflare), e a Play valida que a URL resolve. |

---

## PROVAS — onde cada afirmação da descrição foi conferida

| Afirmação na ficha | Fonte no repositório |
| --- | --- |
| Orçamento com catálogo, cálculo e PDF com a marca | `src/screens/NovoOrcamentoScreen.tsx`, `src/screens/VisualizarOrcamentoScreen.tsx`, `src/screens/ModelosDocumentoScreen.tsx` |
| Link de aprovação que o cliente abre sem instalar nada | `src/services/clienteLink.ts`; worker rota `/o/<token>` (`worker/src/index.js`) |
| Cliente assina no aparelho | `src/components/assinatura/AssinaturaClienteModal.tsx`, `rasterizarAssinatura.ts`, `src/services/ports/SignatureProvider.ts` |
| Recibo em um toque | `src/screens/EmitirReciboScreen.tsx` |
| Ordem de serviço com histórico | `src/screens/OrdemServicoScreen.tsx`, `src/services/ordemServico.ts` |
| Ditar orçamento por voz / chat / diagnóstico | `src/screens/OlliVozScreen.tsx`, `OlliChatScreen.tsx`, `DiagnosticoIAScreen.tsx`; worker `/voz`, `/chat`, `/transcrever` |
| IA: 3 usos/mês no Grátis | `worker/src/creditos.js` → `export const IA_GRATIS_MES = 3` |
| Botão de sinalizar resposta de IA | `src/components/SinalizarIA.tsx` → `enviarDenunciaIA` (`src/services/feedback.ts`) |
| **698** códigos de erro, **23** marcas, offline | `assets/codigos_erro.json` — medido: `require(...).length === 698`, `new Set(marca).size === 23`. Consumido por `src/screens/CodigosErroScreen.tsx`. **Se o JSON mudar, recontar antes de reenviar a ficha.** |
| PMOC e etiqueta QR | `src/screens/PmocPlanoScreen.tsx`, `PmocPlanosScreen.tsx`, `EquipamentoScreen.tsx`, `EscanearQrScreen.tsx`; `verticais.ts` → `pmoc`/`qr_equipamento` `disponivel: true` |
| Calculadoras: BTU, carga de gás, caixa d'água, massa, diluição | `src/services/calculosOficio.ts` (ids `btu`, `carga_gas`, `caixa_agua`, `massa`, `diluicao`) |
| Cálculo de tinta | `src/screens/CalculadoraTintaScreen.tsx`, alcançável por `ContaScreen.tsx:160` (vertical `pintura`) |
| Certificado ANVISA RDC | `src/screens/CertificadoAnvisaScreen.tsx`; `verticais.ts` → `certificado_anvisa` `disponivel: true` |
| Sete ofícios | `src/services/verticais.ts` → `VERTICAIS` + `VERTICAL_GERAL` |
| Agenda com lembrete | `src/screens/AgendaScreen.tsx`, `src/services/agenda.ts`, `pmocLembretes.ts` |
| Painel do que foi aprovado e não pago | `src/components/PainelDinheiroParado.tsx`, `src/services/radarCobranca.ts`, `radarFollowUp.ts`; renderizado em `src/screens/HomeScreen.tsx:505` **sem gate de plano** (por isso pode ser citado como recurso do Grátis) |
| Offline-first + sync ao entrar na conta | `src/database/database.ts` (SQLite), `src/services/cloudSync.ts` |
| Equipe com papéis (Empresa) | `src/screens/EquipeScreen.tsx`, `src/services/equipe.ts`, `entitlementEquipe.ts` |
| O que cada plano libera | `src/services/entitlements.ts` → `RECURSOS_POR_PLANO` (a lista da ficha é literalmente esse mapa) |
| Excluir a conta pelo app | `src/services/conta.ts` + `worker/src/conta.js` (`POST /conta/excluir`); botão na `ContaScreen` |

> ⚠️ **Achado de inconsistência (não corrigido por mim — arquivo de outro agente):**
> `src/services/verticais.ts` marca `calculadora_tinta` como `disponivel: false`, mas a tela
> `CalculadoraTintaScreen.tsx` está registrada no navegador e é alcançável pela `ContaScreen.tsx:160`.
> A ferramenta **está no ar**; o metadado é que ficou para trás. A ficha trata como disponível
> (que é o que o usuário vê). Vale acertar o `disponivel` para o mapa não mentir para outra tela.
