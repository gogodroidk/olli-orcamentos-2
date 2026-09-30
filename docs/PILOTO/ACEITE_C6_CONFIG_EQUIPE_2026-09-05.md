# Aceite local C6 — configurações, identidade e equipe

Data: **2026-09-05**  
Checkout canônico: `C:\OLLI_REL`  
Branch: `Codex/piloto-p0`

## Resultado

Configurações agora têm entrada clara para Meu negócio, Central de Dados,
Aparência, Segurança/Privacidade, cobrança e **Minha conta**. A conta pessoal
permite atualizar nome, e-mail, foto por URL e senha via Supabase Auth; a UI
explica que troca de e-mail pode pedir confirmação e nunca exibe senha salva.

Meu negócio continua sendo a fonte da identidade visual/documental e sincroniza
nome e telefone operacional aos metadados de sessão. A área Equipe lista membros,
convida por sessão autenticada e permite alterar papel/ativo somente para owner ou
admin, sem o membro alterar o próprio papel de owner.

## Evidências locais

- `npm run test:c6-config-equipe` — passou.
- `npm run typecheck` — passou.
- Convites e mutações de equipe permanecem ligados ao contexto/RLS do tenant.

## Limites da prova

Não houve envio de convite real, troca de e-mail real, upload de foto para Storage
ou alteração em conta de produção. Esses caminhos dependem de autenticação e
consentimento do usuário; o código está pronto para o fluxo, mas o aceite externo
continua separado.

