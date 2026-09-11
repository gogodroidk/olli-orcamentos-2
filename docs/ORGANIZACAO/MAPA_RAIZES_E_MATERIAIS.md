# Mapa de raízes, códigos e materiais do OLLI

Data do inventário: **2026-09-03**
Método: leitura local, sem seguir junctions, sem abrir secrets e com diretórios
de dependências/cache excluídos das comparações.

## Mapa executivo

| Caminho | Classe | Papel | Regra |
| --- | --- | --- | --- |
| `C:\OLLI_REL` | **CANÔNICO** | Produto atual e controles do piloto | Único local para editar código atual |
| `Desktop\OLLI - CENTRAL DO PROJETO` | HUB | Índice por junctions | Navegação; não é checkout |
| `Desktop\OLLI ORCAMENTOS` | DRIVE/HISTÓRICO | Materiais sincronizados e repo antigo | Não mover; não usar como código atual |
| `Desktop\Projetos OLLI\olli-orcamentos` | GIT-BASE/HISTÓRICO | Git common-dir e checkout-base | Não editar como produto atual |
| `C:\olli` | CLONE LEGADO | Branch antiga e builds locais | Somente consulta; contém config local não inspecionada |
| `Desktop\_Arquivo OLLI` | ARQUIVO | Versões e APKs antigos | Somente consulta/retenção |
| `Documents\OLLI DASH IA` | PROJETO AUXILIAR | Dashboard/admin desktop separado | Não mesclar ao produto |
| `Documents\olli-command` | PROJETO AUXILIAR | Orquestração histórica | Não confundir com piloto atual |
| `C:\olli-kb` | CONHECIMENTO | Base HVAC | Dados técnicos separados do runtime |
| `Desktop\OLLI_Campanha_5_Pecas` | MARKETING | Peças, SVGs, legendas e prompts | Material de campanha; não é código |
| `Documents\OLLI` | PLACEHOLDER | Pasta vazia | Não usar como nova raiz |
| `Desktop\_Arquivo OLLI\HUB OLLI DUPLICADO ESTATICO 2026-08-30` | ARQUIVO | Cópia estática do hub antigo | Preservada; explicitamente não canônica |

## Repositórios que parecem iguais, mas não são

| Checkout | Branch/estado observado | HEAD observado | Veredito |
| --- | --- | --- | --- |
| `C:\OLLI_REL` | `main` | `df63a25f25a57b9644995bf3adc63c098d0b3cb7` | **Canônico** |
| `C:\olli` | `claude/app-complete-analysis-optimization-9a1912` | `c9ff598ff358b94240343e1587b74191d0b82eb7` | Legado divergente |
| `Desktop\Projetos OLLI\olli-orcamentos` | checkout-base/detached observado | `1f38cd3a279164e67b6e40201ff66a91d69c23f2` | Base/histórico divergente |
| `Desktop\OLLI ORCAMENTOS\olli-orcamentos` | `main` | `91bdd0a...` | Repositório antigo com origem Git distinta |

Os hashes e branches acima são fotografia do inventário, não um convite para
reset, merge ou sincronização. Qualquer reconciliação futura precisa de tarefa
isolada, comparação de conteúdo, backup e aprovação.

## Estrutura interna do repositório canônico

| Pasta | Função | Ação atual |
| --- | --- | --- |
| `src/` | App Expo/React Native | Manter |
| `web/` | Landing web | Manter |
| `webapp/` | Painel administrativo | Manter |
| `worker/` | Backend Cloudflare Workers | Manter |
| `site/` | Configuração/empacotamento do site | Manter |
| `supabase/` | Migrations e contratos de banco | Manter; nenhuma migration automática |
| `assets/`, `public/` | Assets do produto | Manter |
| `scripts/` | Testes e verificações | Manter |
| `docs/` | Planos, decisões e evidências | Indexar; não reescrever histórico |
| `docs/PILOTO/` | Estado e ledgers v4 | Autoritativo e append-only onde indicado |
| `docs/ONDA_1/`, `ONDA_2/`, `ONDA_3/` | Pacotes por onda | Preservar |
| `docs/ENXAME/`, `PESQUISAS/` | Pesquisa e estratégia | Preservar com data/evidência |
| `output/` | Entregáveis gerados | Catalogar; não apagar automaticamente |
| `tmp/` | Artefatos temporários ainda não classificados | Preservar até revisão específica |
| `qa-artifacts/` | Builds e evidências de QA ignorados pelo Git | Preservar; grande volume |
| `dist/`, `android/`, `.expo/`, `.wrangler/`, `node_modules/` | Gerados/dependências | Não tratar como fonte |
| `_arquivo-antigo/` | Material histórico | Somente consulta |

Não foi adotada agora uma migração para `apps/*` ou `packages/*`: os caminhos
`src`, `web`, `webapp`, `worker` e `site` são amplamente referenciados
por scripts, CI, documentação e configurações. Renomeá-los sem uma migração de
compatibilidade aumentaria o risco sem melhorar o produto.

## Materiais de marca e campanha

- Brand kit: `Desktop\Projetos OLLI\OLLI-Brand-Kit`.
- Design/protótipos: `Desktop\Projetos OLLI\OLLI`.
- Handoffs: `Desktop\Projetos OLLI\OLLI Handoff`.
- Campanha de cinco peças: `Desktop\OLLI_Campanha_5_Pecas`.
- Pacote canônico de prompts: `docs/PESQUISAS/PACOTE_IDENTIDADE_VISUAL_OLLI_ORCAMENTOS`.

Todos ficam acessíveis pelo hub sem serem copiados para dentro do Git.

## Itens deliberadamente não inspecionados

- `.env`, `.env.local` e equivalentes;
- `cofre/`, `olli-keystore/`, sessões, caches e arquivos de autenticação;
- conteúdo de dados reais;
- banco/produção, DNS, provedores, cobrança e contas externas.
