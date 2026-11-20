# Chatwoot com Claude — modo sombra (v1) · LEIA

Para o **chefe de tecnologia** (instalar) e o **revisor** (conferir). Código: branch `claude/cq-chatwoot-claude`, pasta `ops/chatwoot-claude/` (cópia viva depois do passo 3: `/home/igor/chatwoot-central/chatwoot-claude/`). Nada foi ativado, nenhum contêiner mexido, nenhuma mensagem foi a cliente.

## O que é
- **`servico.mjs`**: recebe o aviso `message_created` do Chatwoot, monta o contexto (histórico, nota `[ficha]`, tabela de preços do dia, respostas aprovadas, 7 regras do guia), pede a resposta ao **Claude Haiku 5.5** (`claude-haiku-5-5`) e grava como **nota privada** + etiqueta `claude-sugestao`. **Não responde ao cliente.**
- **`cwc.mjs`**: ferramenta de linha de comando para os agentes: `sem-resposta`, `ler`, `responder`, `etiquetar`, `atribuir`, `nota`, `gasto`.
- **`config.json`**: tudo que se liga/desliga. Entregue com `autonomo.ligado: false`.
- Sem dependências (Node 24, só `fetch`). Chamada ao Claude por HTTP puro, porque o repo não tem o SDK e o item proíbe instalar ferramenta.

## Regras embutidas (no serviço, não só no prompt)
- 7 regras do guia no contexto; resposta de até 3 linhas, sem lista (trava de texto barra o resto).
- Nunca nega ser IA ("Sou o assistente virtual da OLLI"); trava barra "não sou robô", "sou pessoa", vida inventada.
- **Parar:** "para de me mandar", "sair", "não quero mais", "me tira da lista", "descadastrar"... → para na hora, **sem chamar a API**, etiquetas `parar-contato` + `claude-humano`, nota, contato gravado em `parar.json` (nada mais é processado dele).
- **Caixa 5 (pessoal) e 2 (GR Tech):** recusadas no webhook, no serviço e em todos os comandos do CLI (nem lê mensagens). Só as caixas 3 e 4 (`caixas_permitidas`).
- **Contato frio:** o serviço só reage a mensagem de cliente que chega; o CLI `responder` recusa conversa em que o cliente ainda não escreveu. Logo o número de atendimento do app nunca inicia contato.
- **Preço só da tabela** (`precos.json`, com vigência por data: R$ 997 do Site vale até 19/11 20h29; R$ 1.397 a partir das 20h30 (janela do Salomão); Pro R$ 39, Empresa R$ 99). Qualquer R$ fora da tabela barra a resposta. Conversa com etiqueta `preco-combinado` não recebe sugestão de preço.
- **Prazo, resultado, nº de clientes, %:** barrados se não vierem da tabela.
- **Teto diário** (`teto_diario_reais`, padrão **R$ 10**): ao bater, **não chama a API**, põe etiqueta `claude-teto` e volta ao sombra. Gasto por conversa em `gasto.jsonl` (`node cwc.mjs gasto`).
- Resposta torta, recusa do modelo ou erro de API: nota "fica com humano" + `claude-humano`.

## Conferir (revisor, 1 minuto, sem rede e sem gasto)
```
cd ops/chatwoot-claude && node --test teste/*.test.mjs        # 15 testes, Chatwoot e Claude falsos
```
Teste vivo (opcional, gasta ~R$ 0,02, usa a chave da reserva e Chatwoot FALSO): `node teste/vivo.mjs`. Resultado já gravado em `teste/resultado-vivo.txt`.

## Instalar (chefe de tecnologia) — nada abaixo reinicia contêiner
1. **Usuário no Chatwoot:** criar o agente "Claude" (papel agente, **só nas caixas 3 e 4**, nunca 5 nem 2) e gerar o token. Guardar no `credenciais-locais.env` como `CHATWOOT_TOKEN_CLAUDE` (por `cofre`, sem eco no terminal).
2. **Segredo do webhook:** gerar texto aleatório e guardar como `CHATWOOT_CLAUDE_SEGREDO` no mesmo arquivo. A chave do Claude já existe: `ANTHROPIC_API_KEY_RESERVA` (crédito pré-pago, recarga automática desligada; o serviço só lê a variável).
3. `sh ops/chatwoot-claude/instalar.sh` — copia para `chatwoot-central/chatwoot-claude/` (backup se já existir) e a unidade para `~/.config/systemd/user/`. Não ativa.
4. **Maestro ativa:** `systemctl --user daemon-reload && systemctl --user enable --now chatwoot-claude.service`. Confira: `curl -s http://172.20.0.1:3025/saude` (deve dizer `"modo":"sombra"`). Porta 3025 (3020 já é de outro serviço). Escuta em 172.20.0.1, o mesmo endereço do acordador, por onde o contêiner alcança o PC.
5. **Cadastrar o webhook** no Chatwoot (Configurações → Integrações → Webhooks → Adicionar; é na tela, não reinicia nada): URL `http://172.20.0.1:3025/webhook?s=<CHATWOOT_CLAUDE_SEGREDO>`, evento **`message_created`**. Ele entra *ao lado* do webhook do acordador; não troque o que já existe.
6. **Observar** alguns dias: filtrar por etiqueta `claude-sugestao`; cada conversa terá uma nota "[claude sugestão — MODO SOMBRA]". Conferir custo: `node cwc.mjs gasto`.
7. **Voltar atrás:** `systemctl --user disable --now chatwoot-claude.service` e apagar o webhook na tela. Nada mais muda.

## Ligar o "responde sozinho" (só depois do parecer do Salomão/Igor)
Editar `config.json` e reiniciar só este serviço (`systemctl --user restart chatwoot-claude`):
```
"autonomo": { "ligado": true, "caixas": [4], "tipos": ["saudacao"] }
```
Só responde se **a caixa E o tipo** estiverem na lista, o modelo e a heurística concordarem no tipo, o texto passar nas travas, o modelo não pedir humano e o teto não estiver batido. Sugestão: começar por `saudacao` e só depois `preco` (a trava de preço já cobre). `como-funciona` e `suporte-app` dependem de fatos do produto que o serviço não verifica: manter em sombra (ver Autoavaliação do resultado).

## Uso do CLI (agentes)
```
export CHATWOOT_TOKEN_CLAUDE=...   # ou deixe no credenciais-locais.env
node cwc.mjs sem-resposta [caixa] [--horas 2]
node cwc.mjs ler 123 [20]
node cwc.mjs responder 123 "Oi! Que serviço você faz?" [--simular]
node cwc.mjs etiquetar 123 quente follow-up
node cwc.mjs atribuir 123 iris@agentes.olli.local      # ou o id numérico
node cwc.mjs nota 123 "cliente volta sexta"
```
Sem botão/atalho: não é página, é webhook e linha de comando; ninguém digita endereço.

## Arquivos
`servico.mjs` (webhook) · `processar.mjs` (fluxo de uma mensagem) · `decidir.mjs` (quem processa) · `nucleo.mjs` (travas, preços, teto, parar) · `contexto.mjs` (prompt) · `claude.mjs` · `chatwoot.mjs` · `cwc.mjs` · `config.json` · `precos.json` · `dados/` (guia e respostas aprovadas, cópias) · `teste/` · `chatwoot-claude.service` · `instalar.sh`. Dados vivos (gasto, parar, vistos): `chatwoot-central/data/chatwoot-claude/`.
