# OLLI 0→100 — prontidão de conexões, plugins e ferramentas

Data da verificação: **2026-08-28 — America/Sao_Paulo**  
Escopo: inventário local e estado declarado pelo Codex; nenhuma credencial foi aberta e nenhuma operação de produção foi executada.

## Conclusão executiva

O ambiente já possui as ferramentas e os plugins suficientes para desenvolver a próxima fatia segura do OLLI. A lacuna principal não é instalar mais integrações: é autenticar, configurar e aceitar no ambiente correto as capacidades que já existem.

`Habilitado` não significa `autenticado`; `autenticado` não significa `testado`; `testado em sandbox` não significa `aceito em produção`.

O hub de ferramentas correto é `C:\Users\ADMIN\Desktop\CONFIG CLAUDE`. Não foi encontrada uma pasta diferente chamada `Cloud Config`. O repositório canônico continua sendo `C:\OLLI_REL`.

## Matriz de prontidão

| Capacidade | Evidência local atual | Estado | Prioridade | Decisão |
|---|---|---|---:|---|
| Supabase, Postgres, RLS e Storage | plugin instalado; MCP habilitado, estado `Not logged in`; migrations locais presentes | `NAO_AUTENTICADO` | P0 | Reutilizar. Autenticação e revisão live são gate humano; produção permanece somente leitura. |
| Cloudflare Worker | plugin instalado; MCP com OAuth; Worker/Wrangler presentes | `DISPONIVEL` | P0 | Reutilizar. OAuth indicado não autoriza deploy; validar ambiente antes de qualquer escrita. |
| Expo/EAS/Android | skills instaladas; MCP Expo `Not logged in`; configuração EAS e Android locais | `NAO_AUTENTICADO` | P0 release | Reutilizar. Login, valores públicos, nova build e aparelho real são gates humanos. |
| GitHub/CI | plugin instalado; MCP com bearer configurado; workflows locais | `DISPONIVEL` | P1 | Reutilizar. Escopo remoto não foi testado; sem push automático. |
| Google Calendar | plugin/MCP habilitados, `Not logged in`; código de agenda existente | `NAO_AUTENTICADO` | P1 | Reutilizar depois da estabilização da agenda; OAuth do Codex não substitui OAuth do app. |
| Google Drive | plugin/MCP habilitados, `Not logged in` | `NAO_AUTENTICADO` | P2 | Opcional para importação/exportação; nunca usar como banco operacional. |
| E-mail transacional | Resend instalado; MCP `Not logged in`; Gmail `Not logged in` | `NAO_AUTENTICADO` | P1 | Reutilizar quando houver domínio/remetente/DKIM aprovados. |
| PDF | plugins `pdf`/`documents`; `expo-print` e geração local existentes | `DISPONIVEL` | P0 | Reutilizar e fortalecer versionamento, snapshot e evidências. |
| DOCX editável | plugin de documentos disponível, sem fluxo de produto aceito | `DISPONIVEL` | P2 | Não priorizar antes do kernel documental versionado. |
| IA | Worker e contrato atual para OpenRouter; roteador local com modelos comprovados | `DISPONIVEL` | P0 arquitetura | Não instalar outro plugin. Primeiro fechar `AiProvider`, egress, fallback, cota e revisão humana. |
| Observabilidade | SDKs Sentry presentes no app/Worker; conexão operacional não verificada | `BLOQUEADO-HUMANO` | P1 | Definir scrubbing de PII, retenção e alertas antes de habilitar coleta real. |
| Stripe/Mercado Pago | plugin Stripe e código de pagamentos presentes; estado MCP não comprova sessão operacional | `BLOQUEADO-HUMANO` | P0 SaaS / P2 cliente-final | Somente sandbox até autorização, webhook validado e reconciliação idempotente. |
| Browser/QA web | Browser, Chrome, Computer Use, browser-use e Playwright disponíveis | `DISPONIVEL` | P0 | Usar Browser/CDP primeiro; Computer Use apenas como fallback visual. |
| QA Android real | ferramentas locais presentes, mas aparelho/login/build não aceitos nesta auditoria | `BLOQUEADO-HUMANO` | P0 release | Exigir teste físico autenticado para aceite. |
| Segurança | Codex Security, Semgrep, Gitleaks e OSV disponíveis | `DISPONIVEL` | P0 | Ferramentas bastam; executar varredura focada antes da release. |
| Assinatura formal/qualificada | aceite leve/rubrica existem; provider/certificado não integrado | `NAO_INSTALADO` | P2/P3 | Não instalar agora. Primeiro consolidar documento imutável e trilha de evidência. |
| Fiscal, mapas, roteirização e push remoto | capacidades não fazem parte da próxima fatia | `NAO_APLICAVEL` | P2/P3 | Avaliar somente após o núcleo HVAC/PMOC estar estável. |

## P0 antes de uma entrega confiável

1. Fechar arquitetura de tenant/autorização e revisar migrations, RLS, grants, `SECURITY DEFINER` e `search_path` antes de qualquer aplicação remota.
2. Implementar e provar Storage privado com isolamento por organização, digest sobre bytes, objeto/versionamento imutável, retenção e vínculo ao snapshot documental.
3. Confirmar os valores públicos de EAS/Worker/OAuth, gerar uma build nova e executar aceite em aparelho físico.
4. Rodar revisão formal de segurança e dependências no recorte que será liberado.
5. Provar ponta a ponta orçamento → documento congelado → aceite/evidência → histórico, com V1 preservado e rollback.

## Capacidades necessárias depois

- Resend, quando convites, orçamentos e recibos por e-mail entrarem na fatia aprovada;
- Sentry e analytics somente após taxonomia, consentimento, retenção e scrubbing de PII;
- Google Calendar no APK real depois do fluxo local de agenda estar estável;
- FCM, mapas, rotas, cobrança do cliente-final, assinatura formal e fiscal nas ondas correspondentes;
- OCR/importação de documentos apenas com revisão humana e política de retenção.

## Não instalar agora

- novos plugins de IA, RAG ou OCR;
- WhatsApp não oficial;
- outro banco/sync/search antes de uma ADR e POC comprovarem necessidade;
- Documenso antes do kernel documental;
- gateway fiscal ou outro processador de pagamento antes do módulo correspondente;
- Vercel como segundo caminho de produção quando Cloudflare já é a arquitetura escolhida;
- Drive, n8n ou planilhas como fonte de verdade operacional.

## Riscos e redundâncias observados

- Stripe possui mais de uma superfície possível; escolher uma por tarefa e manter sandbox até gate humano.
- Browser, Chrome e Computer Use se sobrepõem; preferir consulta programática/CDP e deixar automação visual como fallback.
- n8n está habilitado, mas não deve ser o cérebro do produto nem entrar no caminho crítico sem ADR/licença/governança.
- plugins do Codex para Calendar/Drive não autenticam o aplicativo OLLI.
- Figma, Canva, 21st.dev, Slack, Gmail, n8n e Vercel não bloqueiam a próxima fatia.
- ações do GitHub por tag e permissões do token devem ser endurecidas antes de uma cadeia de release de alta confiança.

## Gates humanos

- OAuth/login dos conectores ainda não autenticados;
- escolha e validação de valores de ambiente e secrets;
- migration, policy, deploy, DNS, e-mail, webhook, cobrança ou publicação;
- serviços pagos, certificado de assinatura e revisão jurídica/regulatória;
- teste em aparelho físico e aceite da release.

## Regra de continuidade

Antes de instalar qualquer nova capacidade, atualizar esta matriz ou criar uma nova versão com evidência ao vivo. Não abrir `.env`, cofre, sessão ou dados de cliente apenas para preencher o inventário.
