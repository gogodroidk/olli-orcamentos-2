# OLLI V2 — Onda 1, Janela 1.3

Estado: **concluído e validado em laboratório fixture-only**  
Escopo: documentos, assinatura/evidência, outbox, IA assistiva e preço explicado  
Runtime do produto: **não alterado**

Resultado: **24/24 testes da janela + 383/383 regressões existentes = 407/407 verificações aprovadas**  
Próxima decisão: **GO para a arquitetura da Janela 1.4; NO-GO para integração no runtime antes dos gates documentados**

## Objetivo

Provar, com código executável e dados sintéticos, os contratos mínimos que sustentam a cadeia:

```text
preço explicado
  → sugestão revisável
  → documento versionado
  → aprovação/assinatura vinculada ao hash
  → comando offline durável
  → aplicação idempotente e autorizada
```

Esta janela não escolhe fornecedor, não cria migration, não conecta Supabase, não chama IA real e não publica uma nova interface. Os protótipos existem para eliminar ambiguidades antes da decisão da Janela 1.4.

## Cinco spikes

1. **Schema documental:** definição própria, versão, payload validado, hash canônico, aprovação e retificação por nova instância.
2. **Assinatura e evidência:** eventos append-only ligados ao hash da versão; rubrica desenhada permanece `drawn_mark`, nunca ICP-Brasil.
3. **Outbox:** SQLite efêmero/persistente de teste, gravação local + comando na mesma transação, idempotência, reautorização no drain, conflito explícito e projeção V1.
4. **Envelope de IA:** fonte, premissas, confiança, incerteza e aprovação humana obrigatórias; provider determinístico de fixture.
5. **Preço explicado:** cálculo determinístico baseado apenas em custos da própria empresa, separando visão privada da explicação pública.

## Critérios de aceite

- fechar e reabrir o banco não perde comando pendente;
- repetir a mesma chave e payload não duplica efeito;
- reutilizar a chave com payload diferente falha sem mutação;
- membro revogado não aplica comando enfileirado anteriormente;
- papel sem permissão é negado e papel desconhecido falha fechado;
- membership não regride nem muda autorização na mesma versão;
- conflito de versão nunca vira last-write-wins silencioso;
- leituras e escritas do servidor sintético exigem sessão autorizada e respeitam a organização;
- payload local e payload da fila precisam ser exatamente iguais;
- cada par de agregado/operação aceita somente seu schema público declarado;
- conteúdo aprovado/assinado é identificado por hash estável;
- correção cria nova versão e preserva a anterior;
- schema documental exige ao menos um papel de assinatura e uma recusa nunca conclui a assinatura;
- assinatura qualificada sem certificado externo é rejeitada;
- preço ausente continua `null`, nunca vira zero;
- custo, margem, hash privado e dados pessoais não entram no payload público/IA;
- o provider de fixture recebe somente chaves explicitamente permitidas;
- toda sugestão exige aceitar, editar ou rejeitar explicitamente;
- nenhum teste acessa rede, segredo, Supabase, Worker ou dado real.

## Não objetivos

- gerar contrato juridicamente aprovado;
- reproduzir ABNT NBR 17037, PDFs, tabelas ou cláusulas de terceiros;
- emitir ou validar ART;
- declarar conformidade técnica, sanitária ou jurídica;
- integrar ICP-Brasil, PowerSync, OpenRouter ou assinatura paga;
- alterar `cloudSync`, banco, telas, Worker, webapp ou produção;
- provar pesquisa de campo, UX ou viabilidade comercial.

## Estrutura

```text
fixtures/                 dados sintéticos e sem PII
spikes/shared/            JSON canônico, hash e validações comuns
spikes/documents/         documento, evidência e assinatura
spikes/outbox/            SQLite local/server sintético
spikes/pricing/           preço privado e explicação pública
spikes/ai/                envelope de sugestão e decisão humana
tests/                    provas positivas, negativas e ponta a ponta
```

## Executar

Requisito local validado: Node.js 24, sem instalação adicional.

```powershell
cd C:\OLLI_REL\docs\ONDA_1\JANELA_1_3
npm test
```

## Evidências de encerramento

- [Resultados e comandos verificados](./RESULTS.md)
- [Revisão de segurança](./SECURITY_REVIEW.md)
- [Decisão e escopo da Janela 1.4](./DECISION_JANELA_1_4.md)

O snapshot executável — `package.json`, fixtures, spikes e testes — está identificado em `RESULTS.md` por um SHA-256 agregado. Arquivos de documentação ficam fora desse digest para que o relatório possa registrar o próprio valor sem circularidade.

## Fronteiras de confiança

- `organization_id` delimita dados, mas o servidor sintético sempre reautoriza o usuário da sessão.
- `device_id`, `actor_user_id` e dados do payload não concedem permissão.
- anexos permanecem fora da outbox; comandos carregam somente referências privadas.
- a IA de fixture nunca recebe custo, margem, assinatura, credencial ou dado pessoal.
- documento assinado não é editado; retificação gera `supersedes_id` e outro hash.
- referências PMOC/RT/ART são dados externos versionados, não alegações de conformidade.

## Gates que permanecem para integração real

- calcular e verificar no servidor o hash dos bytes de cada evidência armazenada;
- derivar a permissão de renderização interna da sessão autenticada, nunca de um parâmetro livre;
- classificar/redigir texto livre antes de enviá-lo a um provider de IA externo;
- desenhar autenticação, autorização por recurso, RLS, storage privado, criptografia, backup e auditoria no ambiente real;
- usar provedor e certificado externos quando a modalidade exigir assinatura qualificada.

## Condição de parada

A condição de parada foi atingida no laboratório. Qualquer integração no produto pertence à Onda 2 e exige antes o fechamento arquitetural da Janela 1.4.
