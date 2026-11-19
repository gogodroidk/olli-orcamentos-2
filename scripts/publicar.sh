#!/usr/bin/env bash
# PUBLICAR — um comando só para pôr no ar o painel, o worker ou a landing, com as travas do roteiro.
# Dono: TECH — CTO. Segundo publicador: TECH — GitHub & CI (ordem do Salomão RP-1119-1037). Roteiro de 1 página:
# docs/PUBLICAR.md.
#
# Uso (de dentro da SUA worktree, no commit que vai ao ar):
#   bash scripts/publicar.sh painel  [--seco]
#   bash scripts/publicar.sh worker  [--seco] [--mensagem "o que muda"]
#   bash scripts/publicar.sh landing [--seco]
#
# Travas (qualquer uma falhando = não publica nada):
#   1. Árvore limpa e commit já enviado ao GitHub.
#   2. ci-local.sh COMPLETO verde nesta árvore (carimbo gravado pelo ci-local; mesma árvore = mesmo verde).
#   3. Não volta no tempo: o commit contém o último commit publicado daquele alvo (anotado aqui mesmo) e a origin/main.
#   4. Anota a versão no ar ANTES (para voltar) e imprime o comando de volta.
#   5. Smoke depois. Worker com smoke ruim volta sozinho para a versão anterior.
# O painel recebe OLLI_BUILD_ID novo e espera 90 s antes do smoke (D-2171: abrir cedo faz a borda guardar HTML no
# lugar do JS por 1 ano).
#
# Saída: 0 publicado e conferido · 1 trava barrou (nada publicado) · 2 uso errado · 3 publicou mas o smoke falhou.

set -u
ALVO="${1:-}"
shift || true
SECO=""
MENSAGEM=""
while [ $# -gt 0 ]; do
  case "$1" in
    --seco) SECO=1 ;;
    --mensagem) MENSAGEM="${2:-}"; shift ;;
    *) echo "opção desconhecida: $1" >&2; exit 2 ;;
  esac
  shift
done
case "$ALVO" in painel|worker|landing) ;; *) sed -n 6,9p "$0"; exit 2 ;; esac

RAIZ="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "rode de dentro de uma worktree do repositório" >&2; exit 2; }
cd "$RAIZ" || exit 2
ESTADO="${OLLI_PUBLICAR_ESTADO:-$HOME/.local/state/olli-publicar}"
CARIMBOS="${OLLI_CI_CARIMBOS:-$HOME/.local/state/olli-ci/verde}"
mkdir -p "$ESTADO"
LOG="$ESTADO/publicacoes.log"
WR=(env -u CLOUDFLARE_API_TOKEN npx --yes wrangler)

barra() { echo "BARRADO: $1" >&2; echo "Nada foi publicado." >&2; exit 1; }
diz() { echo ">>> $*"; }

# ── 1. árvore limpa e commit no GitHub ──
[ -z "$(git status --porcelain --untracked-files=no)" ] || barra "a árvore tem mudança não commitada."
HASH="$(git rev-parse HEAD)"
CURTO="${HASH:0:8}"
ARVORE="$(git rev-parse 'HEAD^{tree}')"
git fetch -q origin || barra "não consegui falar com o GitHub (git fetch)."
[ -n "$(git branch -r --contains "$HASH" 2>/dev/null)" ] || barra "o commit $CURTO não está no GitHub. Faça git push antes."

# ── 2. CI completo verde nesta árvore ──
[ -f "$CARIMBOS/$ARVORE" ] || barra "não há ci-local COMPLETO verde para esta árvore ($CURTO). Rode: bash scripts/ci-local.sh"
diz "CI verde nesta árvore: $(cat "$CARIMBOS/$ARVORE")"

# ── 3. não volta no tempo ──
git merge-base --is-ancestor origin/main "$HASH" || barra "o commit não contém a origin/main de agora. Traga a main (git merge origin/main), rode o CI e tente de novo."
ULTIMO_ARQ="$ESTADO/ultimo-$ALVO"
if [ -f "$ULTIMO_ARQ" ]; then
  ULTIMO="$(cut -d' ' -f1 "$ULTIMO_ARQ")"
  git cat-file -e "$ULTIMO^{commit}" 2>/dev/null || git fetch -q origin "$ULTIMO" 2>/dev/null || true
  git merge-base --is-ancestor "$ULTIMO" "$HASH" 2>/dev/null \
    || barra "o commit não contém o último publicado do $ALVO (${ULTIMO:0:8}). Publicar daqui apagaria o que está no ar."
else
  diz "AVISO: não há registro do último $ALVO publicado nesta máquina; confira à mão de que commit o $ALVO no ar saiu."
fi

# ── 4. versão no ar antes (para voltar) ──
versao_worker() { # $1 = pasta com wrangler.jsonc
  (cd "$1" && "${WR[@]}" deployments list --json 2>/dev/null) | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const u=j[j.length-1];
    process.stdout.write(String(u.versions[0].version_id))}catch{process.exit(1)}})'
}
versao_painel() {
  "${WR[@]}" pages deployment list --project-name olli-painel-web --environment production --json 2>/dev/null | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(j[0].Id+" (commit "+j[0].Source+")")}catch{process.exit(1)}})'
}
case "$ALVO" in
  worker) ANTES="$(versao_worker worker)" || barra "não consegui ler a versão do worker no ar (wrangler logado?)." ;;
  landing) ANTES="$(versao_worker site)" || barra "não consegui ler a versão da landing no ar (wrangler logado?)." ;;
  painel) ANTES="$(versao_painel)" || barra "não consegui ler a publicação do painel no ar (wrangler logado?)." ;;
esac
diz "No ar agora ($ALVO): $ANTES"
if [ "$ALVO" = painel ]; then
  # O painel no ar diz de que commit saiu (Source). Em 19/11 ele saía da branch claude/painel-publicar-1118, à frente da
  # main: publicar da main apagaria 10 correções. Este commit tem de conter o que está no ar, sem depender de anotação.
  NO_AR="$(echo "$ANTES" | sed -n 's/.*(commit \([0-9a-f]\{7,\}\)).*/\1/p')"
  [ -n "$NO_AR" ] || barra "não consegui ler de que commit o painel no ar saiu."
  git cat-file -e "$NO_AR^{commit}" 2>/dev/null || barra "o commit do painel no ar ($NO_AR) não existe aqui: ele saiu de outra branch. Traga essa branch (git merge) antes."
  git merge-base --is-ancestor "$NO_AR" "$HASH" || barra "este commit não contém o painel que está no ar ($NO_AR). Publicar daqui apagaria correções que já estão no ar."
fi
case "$ALVO" in
  worker|landing) VOLTAR="cd $([ "$ALVO" = worker ] && echo worker || echo site) && env -u CLOUDFLARE_API_TOKEN npx wrangler rollback ${ANTES%% *} -y" ;;
  painel) VOLTAR="rollback do Pages pela API para o deployment ${ANTES%% *} (docs/PUBLICAR.md, seção Voltar)" ;;
esac
diz "Para voltar: $VOLTAR"

if [ -n "$SECO" ]; then
  diz "SECO: todas as travas passaram para $ALVO no commit $CURTO. Nada foi publicado."
  exit 0
fi

# ── publicar ──
QUEM="$(git config user.name 2>/dev/null || echo '?')"
MSG="${MENSAGEM:-publicar.sh}: commit $CURTO (ci verde na árvore); voltar: ${ANTES%% *}"
case "$ALVO" in
  worker)
    (cd worker && "${WR[@]}" deploy --message "$MSG") || barra "o wrangler deploy do worker falhou (o que estava no ar continua)."
    ;;
  landing)
    (cd web && npm run build) || barra "o build da landing falhou."
    (cd site && "${WR[@]}" deploy --message "$MSG") || barra "o wrangler deploy da landing falhou (o que estava no ar continua)."
    ;;
  painel)
    export OLLI_BUILD_ID="$CURTO-$(date -u +%Y%m%dT%H%MZ)"
    (cd webapp && pnpm run build) || barra "o build do painel falhou."
    (cd webapp && "${WR[@]}" pages deploy dist --project-name olli-painel-web --branch main --commit-hash "$HASH" --commit-message "$MSG") \
      || barra "o pages deploy do painel falhou (o que estava no ar continua)."
    diz "Painel enviado (OLLI_BUILD_ID=$OLLI_BUILD_ID). Espero 90 s sem abrir, para a borda não guardar HTML no lugar do JS."
    sleep 90
    ;;
esac
printf '%s %s %s %s antes=%s\n' "$HASH" "$(date -u +%FT%TZ)" "$ALVO" "$QUEM" "${ANTES%% *}" >> "$LOG"
printf '%s %s\n' "$HASH" "$(date -u +%FT%TZ)" > "$ULTIMO_ARQ"

# ── 5. smoke ──
codigo() { curl -s -o /dev/null -m 20 -w '%{http_code}' "$1"; }
FALHAS=0
confere() { # url esperado
  local c; c="$(codigo "$1")"
  if [ "$c" = "$2" ]; then echo "  ok   $c $1"; else echo "  FALHA $c (esperava $2) $1"; FALHAS=$((FALHAS + 1)); fi
}
diz "Smoke:"
case "$ALVO" in
  worker)
    confere "https://diagnostico.olliorcamentos.online/pagar/pro/token-invalido" 404
    confere "https://olliorcamentos.online/" 200
    ;;
  landing)
    confere "https://olliorcamentos.online/" 200
    confere "https://olliorcamentos.online/planos/" 200
    confere "https://olliorcamentos.online/legal/privacidade/" 200
    confere "https://olliorcamentos.online/modelo-de-orcamento-olli.pdf" 200
    ;;
  painel)
    confere "https://app.olliorcamentos.online/" 200
    JS="$(curl -s -m 20 https://app.olliorcamentos.online/ | grep -oE '/assets/[^"]+\.js' | head -1)"
    if [ -n "$JS" ] && curl -s -m 20 -H 'Origin: https://app.olliorcamentos.online' "https://app.olliorcamentos.online$JS" | head -c 200 | grep -qi '<!doctype'; then
      echo "  FALHA o JS de entrada $JS voltou como HTML (armadilha D-2171)"; FALHAS=$((FALHAS + 1))
    else
      echo "  ok   JS de entrada é JS ($JS)"
    fi
    ;;
esac

if [ "$FALHAS" -gt 0 ]; then
  if [ "$ALVO" = worker ]; then
    diz "Smoke falhou: volto o worker para ${ANTES%% *}."
    (cd worker && "${WR[@]}" rollback "${ANTES%% *}" -y -m "smoke falhou depois de $CURTO") && diz "Voltou." || diz "NÃO consegui voltar sozinho. Rode: $VOLTAR"
  else
    diz "Smoke falhou. Volte agora: $VOLTAR"
  fi
  echo "RESULTADO: PUBLICOU, MAS O SMOKE FALHOU ($FALHAS). Avise no grupo, com este texto."
  exit 3
fi
echo "RESULTADO: $ALVO no ar, commit $CURTO, smoke ok. Versão anterior: ${ANTES%% *}. Para voltar: $VOLTAR"
