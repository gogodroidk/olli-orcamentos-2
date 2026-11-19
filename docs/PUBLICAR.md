# Publicar (roteiro de 1 página)

Dono: TECH — CTO. Segundo publicador: TECH — GitHub & CI (Salomão, RP-1119-1037).
Comando único: `bash scripts/publicar.sh <painel|worker|landing>`.

## Antes de começar (só publica com tudo isto)
1. Use a sua worktree (`/home/igor/wt/<nome>`). Nunca publique de `/home/igor/OLLI_REL`.
2. O PR tem o parecer do LIVRE — Revisor, sem P1.
3. O merge foi feito com ordem de quem decide (líder do andar ou Salomão).
4. Você está no commit que vai ao ar, com a árvore limpa e o `git push` feito.
5. O `bash scripts/ci-local.sh` COMPLETO rodou verde nesta árvore. Rodada parcial (só alguns jobs) não vale.
6. Horário: a máquina não pode estar com outro build pesado. O WhatsApp dos clientes roda nela.

## Passo a passo
1. Ensaio, sem publicar: `bash scripts/publicar.sh painel --seco`. Ele mostra a versão no ar e o comando de volta.
2. Se apareceu `BARRADO`, pare. A frase diz o que falta. Não contorne.
3. Publicar: o mesmo comando sem `--seco`. No worker, diga o que muda: `--mensagem "#420 pagar no teste"`.
4. Painel: o comando espera 90 s sozinho antes de conferir. Não abra o painel nesse tempo (D-2171).
5. Leia o `RESULTADO:` final e poste no grupo, como "Seu nome → Rafael": o que foi ao ar, o commit, a versão anterior e o resultado do smoke.

## O que as travas fazem
- Árvore suja, commit fora do GitHub ou sem CI completo verde: barra.
- Commit sem a `origin/main` de agora: barra, porque voltaria no tempo.
- **Painel:** lê na Cloudflare de que commit o painel no ar saiu. Se este commit não contém o do ar, barra. Em 19/11 o painel saía da branch `claude/painel-publicar-1118`, à frente da main; publicar da main teria apagado 10 correções.
- Worker e landing: o commit tem de conter o último publicado por esta máquina (`~/.local/state/olli-publicar/ultimo-*`).
- Antes de publicar, anota a versão no ar e imprime o comando de volta.
- Smoke depois de publicar:
  - worker: link de pagamento e site;
  - landing: home, /planos, política e PDF;
  - painel: página abre e o JS de entrada é JS, não HTML.

## Voltar
- **Worker** com smoke ruim: volta sozinho. À mão: `cd worker && env -u CLOUDFLARE_API_TOKEN npx wrangler rollback <versão anterior> -y`.
- **Landing:** `cd site && env -u CLOUDFLARE_API_TOKEN npx wrangler rollback <versão anterior> -y`.
- **Painel:** rollback do Pages para o deployment anterior que o comando imprimiu:
  ```bash
  TOKEN="$(sed -n 's/^oauth_token = "\(.*\)"/\1/p' ~/.config/.wrangler/config/default.toml)"
  curl -s -X POST -H "Authorization: Bearer $TOKEN" \
    "https://api.cloudflare.com/client/v4/accounts/2105e563047965db94fc8a82e2521838/pages/projects/olli-painel-web/deployments/<deployment anterior>/rollback"
  ```
  Nunca mostre o token na tela nem no chat. Depois de voltar, espere 90 s antes de abrir o painel.

## Nunca
- Publicar sem CI verde, sem o LIVRE ou fora da sua worktree.
- Usar `--force` ou `force-push`.
- Publicar a landing de commit sem o PDF e o site novo.
- Mexer em DNS ou domínio. Derrubar olliorcamentos.online é a linha vermelha.
- Falar com o Igor. Problema vai ao Rafael; se ele não responder, ao Salomão.

## Se der errado
Volte primeiro (seção Voltar) e investigue depois. Poste no grupo: "Seu nome → Rafael: publiquei X, o smoke falhou em Y, voltei para Z às HH:MM".
