# WhatsApp — lista "não contatar" (opt-out)

Fonte única de quem **não** pode receber mensagem pelo WhatsApp do OLLI, (11) 94172-7487.
Migration: `supabase/migrations/20261006090000_whatsapp_nao_contatar.sql`. A Política de
Privacidade (seção 3, item "Telefone (WhatsApp)", e seção 11) promete exatamente isto.

## Regra para o SALES (e qualquer agente que envie)
1. **Antes de CADA mensagem**, consulte (service role / MCP do Supabase):
   ```sql
   select public.pode_contatar_whatsapp('<user_id ou null>', '<telefone ou null>');
   -- {"pode": true,  "motivo": "liberado"}            → pode enviar
   -- {"pode": false, "motivo": "pediu_sair" | ...}    → NÃO envie
   -- motivo "conta_interna": equipe/demo/teste (docs/CONTAS_INTERNAS.md) — nunca se aborda
   ```
   Sem identificador, conta inexistente ou qualquer erro = **não envie**. Passe o `user_id` quando
   tiver: a função também confere o telefone do cadastro da conta.
2. Respondeu **SAIR** (ou "parar", "não quero", reclamou), ou pediu por e-mail? Registre na hora:
   ```sql
   select public.registrar_nao_contatar_whatsapp('<user_id ou null>', '<telefone>', 'pediu_sair', 'whatsapp');
   -- motivos: pediu_sair | reclamou | numero_invalido | decisao_interna
   -- origens: whatsapp | email | app | painel | admin
   ```
   É idempotente: registrar duas vezes não duplica.
3. Primeiro contato com lead é sempre de uma pessoa; a IA nunca fecha venda sozinha.

## A própria pessoa (app/painel, para um interruptor futuro)
`select public.definir_contato_whatsapp(false, 'app')` sai; `true` volta. Só a pessoa logada, e
voltar remove apenas o próprio pedido de saída (`pediu_sair`), nunca uma reclamação ou decisão interna.

## Números
Normalizados como `55 + DDD + número` (10 ou 11 dígitos), a mesma regra de
`src/utils/telefoneWhatsapp.ts`: `(11) 99999-8888`, `011 99999-8888` e `+55 11 99999-8888` são o mesmo número.
