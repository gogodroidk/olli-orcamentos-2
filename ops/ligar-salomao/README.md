# Ligar pro Salomão (CQ-LIGAR-SALOMAO)

Página (PWA) para o Igor conversar **por voz, ao vivo**, com o Salomão (Maestro), inclusive dirigindo.

```
celular ──(áudio direto)──▶ Google Gemini Live (gemini-3.8-live, voz Enceladus)
   │                              │ chama ferramenta
   └──(Access do Igor)──▶ PC 127.0.0.1:8796/ligar ──▶ estado_empresa()  (só leitura)
                                                  └─▶ mandar_ao_salomao(texto) ──▶ hibernar.mjs ask "SALOMÃO — Maestro"
                                                                                  resposta = fala dele no grupo com o código [LIGAÇÃO Lnnnn]
```

## Segurança (o que segura o quê)
- **Chave do Gemini nunca sai do PC.** O celular recebe um token efêmero: 1 uso, 60 s para abrir, 30 min de vida.
- **Configuração travada no token** (`fieldMask`): persona, voz e as 2 ferramentas vêm do servidor; o navegador não troca prompt nem adiciona ferramenta (testado: setup forjado é ignorado).
- **Acesso remoto**: só pelo hostname `comando.ollizap.online/ligar/` (atrás do Cloudflare Access "Central de Comando", Google do Igor) **e** o servidor revalida o JWT do Access (assinatura, aud, iss, exp, e-mail). Sem config = remoto recusado. Host estranho = 421.
- **POST**: exige JSON + cabeçalho `X-Ligar: 1` + mesma origem (anti-CSRF). Limites por janela.
- **Ferramentas**: só 2. Sem shell (execFile sem shell, filho sem variáveis de segredo). Ordem só sai depois que a voz repete e o Igor confirma. O recado leva a transcrição do que o Igor falou, para o Salomão conferir.
- **Injeção**: estado da empresa vai marcado como DADO e mascarado (chaves, telefone, e-mail, CPF/CNPJ); a persona manda ignorar ordens dentro dos dados.
- **Botão de pânico**: `touch ~/.olli-ligar/desligado` desliga token e ferramentas na hora.
- Logs (sem conteúdo de áudio): `~/.olli-ligar/acessos.jsonl`, `~/.olli-ligar/ligacoes.jsonl` (duração, tokens, custo).

## Rodar / conferir
```bash
node --test ops/ligar-salomao/teste.mjs                         # 13 testes, sem rede
systemctl --user daemon-reload && systemctl --user enable --now olli-ligar-salomao.service
olli-ligar-salomao                                               # botão "Ligar pro Salomão" (abre/reaproveita a aba)
```

## Custo
Preço oficial Gemini 3.8 Live (camada paga): áudio entra US$ 0,005/min, sai US$ 0,018/min; contexto em texto US$ 0,75/1M tokens.
Medido em 18/11: ligação real de 45 s pelo navegador = **US$ 0,010** (~US$ 0,013/min); simulação de 50–56 s com 6 falas e
consulta ao estado = **US$ 0,034–0,037** (~US$ 0,04/min). Contexto limitado a 16 mil tokens (corta para 8 mil) para o custo
por minuto não crescer sem teto em ligação longa. Cada ligação grava o custo real em `~/.olli-ligar/ligacoes.jsonl`.
