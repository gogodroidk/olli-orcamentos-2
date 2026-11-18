# Ligar pro Salomão (CQ-LIGAR-SALOMAO)

Página (PWA) para o Igor conversar **por voz, ao vivo**, com o Salomão (Maestro), inclusive dirigindo.

```
celular ──(áudio direto)──▶ Google Gemini Live (gemini-3.8-live, voz Enceladus)
   │                              │ chama ferramenta
   └──(Access do Igor)──▶ PC 127.0.0.1:8796/ligar ──▶ estado_empresa()  (só leitura)
                                                  └─▶ mandar_ao_salomao(texto) ──▶ só PREPARA (texto guardado + token de uso único)
   Igor: "sim" após ouvir o pedido, ou botão "Confirmar envio" ──▶ /api/confirmar (token conferido no servidor)
                                                                 ──▶ hibernar.mjs ask "SALOMÃO — Maestro"
                       resposta = linha "R-Lnnnnnnnn:" no retorno do ask, ou ~/.olli-ligar/respostas/Lnnnnnnnn.txt (nada no grupo)
```

## Segurança (o que segura o quê)
- **Chave do Gemini nunca sai do PC.** O celular recebe um token efêmero: 1 uso, 60 s para abrir, 30 min de vida.
- **Configuração travada no token** (`fieldMask`): persona, voz e as 2 ferramentas vêm do servidor; o navegador não troca prompt nem adiciona ferramenta (testado: setup forjado é ignorado).
- **Acesso remoto**: só pelo hostname `comando.ollizap.online/ligar/` (atrás do Cloudflare Access "Central de Comando", Google do Igor) **e** o servidor revalida o JWT do Access (assinatura, aud, iss, exp, e-mail). Sem config = remoto recusado. Host estranho = 421.
- **POST**: exige JSON + cabeçalho `X-Ligar: 1` + mesma origem (anti-CSRF). Limites por janela.
- **Ferramentas**: só 2. Sem shell (execFile sem shell, filho sem variáveis de segredo).
- **Confirmação no SERVIDOR** (P1 do LIVRE, CQ-LIGAR-SALOMAO-P1, `lib/confirmacao.mjs`):
  - cada ligação tem id gerado no servidor, preso à identidade do Access (e-mail + sub); toda rota exige ligação + mesma identidade;
  - a ferramenta do modelo só **prepara**: o servidor guarda o texto exato e gera um token aleatório de **uso único** (3 min, 3 erros cancelam), que fica só no código da página e **nunca** vai ao modelo;
  - só `/api/confirmar` envia, com token + ligação + identidade, a partir de um ato do Igor: botão "Confirmar envio", ou "sim" falado depois de a voz **ler o pedido guardado** e perguntar "confirma?" (sem leitura do estado no meio). O texto enviado é o guardado no servidor;
  - não existe mais rota de envio direto (`/api/mandar` foi removida).
- **Injeção**: o que vem do grupo/DECISOES entra **cercado** como `<dado_nao_confiavel id=aleatório>` (o texto de dentro não consegue fechar a cerca). O servidor guarda o que foi lido em cada ligação e **recusa preparar** pedido que copie esse conteúdo, que diga "o Igor mandou…" (3ª pessoa) ou que traga marcas do sistema. Teste: `teste.mjs` ("INJEÇÃO…", "HTTP…") e `teste-navegador.mjs`.
- **LGPD**: estado mascarado (chaves, telefone, e-mail, CPF/CNPJ); falas de vendas/atendimento/celular (texto de lead) ficam fora.
- **Nada no grupo do Telegram** (D-2348): o recado pede resposta no próprio terminal (linha `R-<código>:`), lida do retorno do `hibernar ask`; resposta demorada vai para arquivo local da ligação.
- **Botão de pânico**: `touch ~/.olli-ligar/desligado` desliga token e ferramentas na hora.
- Logs (sem conteúdo de áudio): `~/.olli-ligar/acessos.jsonl`, `~/.olli-ligar/ligacoes.jsonl` (duração, tokens, custo).

## Rodar / conferir
```bash
node --test ops/ligar-salomao/teste.mjs                         # 20 testes, sem rede (inclui injeção e HTTP)
node ops/ligar-salomao/teste-navegador.mjs                       # Chromium headless, Gemini simulado, hibernar falso
bash ops/ligar-salomao/instalar.sh                               # copia para ~/.local/share/olli-ligar-salomao (o serviço roda dali)
systemctl --user daemon-reload && systemctl --user enable --now olli-ligar-salomao.service
olli-ligar-salomao                                               # botão "Ligar pro Salomão" (abre/reaproveita a aba)
```

## Custo
Preço oficial Gemini 3.8 Live (camada paga): áudio entra US$ 0,005/min, sai US$ 0,018/min; contexto em texto US$ 0,75/1M tokens.
Medido em 18/11: ligação real de 45 s pelo navegador = **US$ 0,010** (~US$ 0,013/min); simulação de 50–56 s com 6 falas e
consulta ao estado = **US$ 0,034–0,037** (~US$ 0,04/min). Contexto limitado a 16 mil tokens (corta para 8 mil) para o custo
por minuto não crescer sem teto em ligação longa. Cada ligação grava o custo real em `~/.olli-ligar/ligacoes.jsonl`.
