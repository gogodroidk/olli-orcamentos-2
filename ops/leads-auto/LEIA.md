# Caçador semanal de leads — OLLI Serviços

Acha empresa de refrigeração, elétrica ou manutenção predial, confere o telefone celular comercial no HTML do próprio site e grava `PROSPECTS-AUTO.csv` no formato que `leads.mjs` já lê. O envio do Rafa continua lendo a lista de 07/11. A flag `--anexar` acrescenta nesse CSV só a linha nova. Esta coleta não envia WhatsApp, e-mail nem mensagem.

Fontes: página pública de associados da ABRAVA (o robots libera) e a busca HTML do DuckDuckGo (`Allow: /`). Não usa Google Maps, rede social com login, nem a base de CNPJ em `/home/igor/dados-receita`. A supressão entra só pelo CSV de hash `supressao-telefones.csv`.

Ritmo: uma página por vez, 2,5 s de piso, no máximo 220 páginas por rodada, parando em 30 empresas. Robots com crawl-delay acima de 15 s fica de fora. 404 de robots libera; falha de robots barra o host. Guia, lista e portal não entram. Telefone no título é apagado do nome.

## Rodar na mão

```bash
node /home/igor/wt/grok-GZ-LEADS-AUTO/ops/leads-auto/cacador.mjs --seco
node /home/igor/wt/grok-GZ-LEADS-AUTO/ops/leads-auto/cacador.mjs --teto 30 --orcamento 220 --intervalo-ms 2500
```

`--seco` não entra na rede. A saída e a amostra mascarada vão para `/home/igor/Desktop/Entregas Claude/OLLI/2026-11-14-leads-auto/`.

## Ligar o timer (só o Salomão)

O timer não está ativado. Sem `--ligar`, o script só mostra o comando. `Persistent=false`: ligar atrasado não recupera a segunda perdida. Na segunda, 07:10, horário de Brasília, a unidade caça e passa `--anexar`: copia para a lista de 07/11 só quem ainda não está nela. Quem manda mensagem continua sendo o motor que já existe. Esta rodada de hoje não anexou.

```bash
bash /home/igor/wt/grok-GZ-LEADS-AUTO/ops/leads-auto/ligar.sh --ligar
```

Para desligar: `systemctl --user disable --now leads-auto.timer`.
