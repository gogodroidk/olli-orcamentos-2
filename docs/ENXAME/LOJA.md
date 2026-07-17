# LOJA — trilha Google Play (preparo até os cliques do dono)

> Meta: chegar na faixa de **teste interno** (reversível) com tudo montado; o dono só clica.
> `[CLAUDE]` = eu automatizo · `[DONO]` = ato do dono (credencial/termos/pagamento/publicar).
> Fonte: Onda 1 agente store (2026-07-17).

## Identidade (confirmado)
- bundleId: `online.olliorcamentos.app` (iOS + Android iguais em app.json). Real, não placeholder.
- versionName `1.1.0`, android.versionCode `9`, ios.buildNumber `1`. Bate com STORE_LISTING.md. Sem bump pendente.
- keystore de upload já existe: `CONFIG CLAUDE/olli-keystore/olli-upload.jks` (eas.json usa `credentialsSource=local`).
- listing (nome, descrição curta 74/80, longa ~1750, release notes, categoria, faixa etária) pronto em `docs/STORE_LISTING.md`.

## Bugs que EU corrijo antes de enviar
- [ ] **URL de privacidade 404** — `docs/LOJAS.md` e `STORE_LISTING.md` apontam `olliorcamentos.online/privacidade` (dá 404). Real: `/legal/privacidade`. Corrigir a URL nos docs **ou** criar redirect `/privacidade → /legal/privacidade` (a Play Console valida que a URL resolve). → redirect é melhor (não quebra links externos).
- [ ] **Ícone da ficha 512×512** — só existe `assets/icon.png` 1024×1024; gerar cópia 512×512 PNG com alpha.

## Assets que faltam (DONO aprova)
- [ ] **Feature graphic 1024×500** — não existe. Eu gero uma proposta; dono aprova.
- [ ] **Screenshots de celular (2-8)** — roteiro pronto em STORE_LISTING.md §7; capturar via app rodando com dados demo (Onda de QC visual gera candidatos). Dono aprova visual.

## Passos [CLAUDE] (quando autorizado / EAS logado)
- [ ] Gerar `credentials.json` local apontando pra keystore (senha do cofre).
- [ ] `eas init` — trocar placeholder `extra.eas.projectId="olli-orcamentos"` pelo UUID real.
- [ ] `eas env:create` production: `EXPO_PUBLIC_DIAGNOSTICO_URL`, `EXPO_PUBLIC_WHATSAPP_SUPORTE` (sem elas a IA sobe desligada no build, sem erro visível).
- [ ] `eas build -p android --profile production` → `.aab` assinado (build na nuvem Expo; não precisa Android Studio). ⚠️ só após o ciclo comercial estar ok (regra do dono).
- [ ] Colar listing (STORE_LISTING.md) e Data Safety (LOJAS.md §2.5) nos campos da Console (via Chrome logado do dono, parando nos cliques).

## Passos [DONO] (bloqueio — ver BLOQUEIOS.md)
Abrir+pagar conta · pessoal vs organização · login EAS · e-mails de 12 testadores (se pessoal) · aprovar screenshots/feature graphic · IARC · aceitar termos · clique final publicar.

## Ordem recomendada
1. [CLAUDE] redirect privacidade + ícone 512 + feature graphic (proposta) + screenshots (candidatos da Onda QC).
2. [DONO] conta Play + decisão pessoal/organização + login EAS.
3. [CLAUDE] credentials + eas init + env + (quando dono mandar) build .aab.
4. [DONO] criar app na Console + termos + IARC.
5. [CLAUDE] preencher ficha + Data Safety no Chrome logado.
6. [DONO] subir .aab em teste interno + clique de publicar.
