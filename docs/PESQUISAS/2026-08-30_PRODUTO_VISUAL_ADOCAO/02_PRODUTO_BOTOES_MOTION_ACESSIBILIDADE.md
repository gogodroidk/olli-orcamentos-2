# Produto, botões, motion e acessibilidade

## Veredito

O OLLI já tem uma base boa, mas a especificação e os componentes atuais ainda divergem. A prioridade não é adicionar animação chamativa; é fazer cada controle ser grande, claro, previsível e imediato.

## Hierarquia de ações

| Nível | Aparência | Uso | Exemplos |
|---|---|---|---|
| Primário | preenchido, alto contraste | única ação que avança ou conclui a etapa | `Criar orçamento`, `Salvar e revisar`, `Enviar ao cliente` |
| Secundário | tonal ou contornado | alternativa importante | `Salvar rascunho`, `Visualizar como cliente`, `Duplicar` |
| Terciário | texto/ghost | voltar, fechar, cancelar | `Voltar`, `Agora não` |
| Destrutivo | vermelho e separado | ação difícil de recuperar | `Excluir orçamento` |
| Link | texto reconhecível como link | navegação | `Esqueci minha senha`, `Ver versões` |
| Ação central | preenchida e persistente | principal criação global | `Novo orçamento` |

Regras de rótulo:

- usar verbo + objeto;
- evitar `OK`, `Pronto` e `Confirmar` sem contexto;
- ações de negócio importantes sempre têm texto visível;
- ícone isolado só para padrões conhecidos e sempre com nome acessível;
- ação destrutiva não fica com o mesmo peso nem junto da ação principal;
- uma tela deve ter um primário inequívoco.

## Tamanho e área tocável

Meta de produto, mais inclusiva que o mínimo normativo:

- aplicativo: alvo operacional de pelo menos `48 × 48 dp`;
- dashboard: `44 × 44 CSS px` para ação recorrente e `48 px` para ação crítica;
- botão primário mobile: altura preferencial de `50–56 dp`;
- ícone pode ter `20–24 px`, desde que a área acionável seja maior;
- controles adjacentes como `Cancelar` e `Enviar` precisam de separação clara.

Fontes: [Apple HIG — Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons), [Android Accessibility](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views), [WCAG 2.2 — Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

## Máquina visual de uma ação

```text
idle
  ↓ toque
pressed — resposta no primeiro frame
  ↓ ação começou
pending — rótulo preservado + progresso
  ↓
success ou error
```

- O estado pressionado não espera rede ou banco.
- O botão em loading mantém largura e rótulo: `Salvando orçamento…`.
- Duplo envio fica bloqueado.
- Erro aparece perto da ação e oferece `Tentar novamente`.
- Dados digitados não são apagados.
- Sucesso rotineiro não usa confete nem vibração forte.
- Motion reduzido preserva a informação e remove deslocamentos/loops.

## Fluxos visuais críticos

### Criar orçamento

```text
Cliente → serviço/local → itens e valores → condições → revisão → envio
```

Cada etapa deve ter título, frase curta, progresso simples, resumo crescente, rascunho preservado e uma ação principal textual.

### Revisar e enviar

Mostrar exatamente o que o cliente receberá, com cliente, escopo, total, validade, identidade da empresa, número/versão e canal. Ações: `Enviar ao cliente` e `Voltar e editar`.

### Editar orçamento já enviado

```text
Editar
  → avisar que será criada nova versão
  → destacar alterações
  → salvar versão
  → marcar “aguardando reenvio”
  → enviar versão atualizada
  → colher novo aceite quando a alteração for material
```

Texto recomendado: `O cliente ainda recebeu a versão anterior`.  
CTA recomendado: `Enviar versão atualizada`.

Benchmark: o Jobber preserva a versão anterior e trata alteração de proposta aprovada como evento explícito. Fonte: [Jobber — Quote Approvals](https://help.getjobber.com/en/articles/quote-approvals/).

### Home

Priorizar o que exige ação:

1. criar orçamento;
2. aguardando resposta;
3. editados e ainda não reenviados;
4. aprovados para agendar;
5. agenda de hoje;
6. resultados do período.

KPIs abstratos podem existir abaixo, sem competir com a próxima ação.

### Agenda

No app: faixa horizontal de dias, `Hoje` evidente e lista cronológica. Cartões mostram horário, cliente, local, tipo de serviço e ações textuais. Não exigir arrastar blocos pequenos.

No web: semana visual + alternativa em lista, teclado, zoom, foco controlado e ações que não aparecem apenas no hover.

### Login e ajuda

- mostrar senha;
- permitir gerenciador/autofill;
- manter `Esqueci minha senha` no mesmo lugar;
- permitir colar código;
- ajuda persistente em posição consistente, sem cobrir CTA ou foco;
- WhatsApp para recuperação somente após número verificado e decisão de segurança.

## Motion e hápticos

- press: escala curta `1 → 0,97/0,98 → 1` no app;
- web: mudança de tom e press state discreto;
- sem bounce longo;
- `transform` e `opacity`;
- loading com rótulo estável;
- skeleton apenas depois de `180 ms`, com permanência mínima já definida no acervo;
- loops e shimmer param em reduced motion.

Mapa de hápticos:

| Evento | Háptico |
|---|---|
| abrir card/navegar | nenhum |
| selecionar valor | `selection` |
| ação principal | `light` |
| botão central Novo orçamento | `medium`, uma vez |
| sucesso rotineiro | geralmente nenhum |
| marco raro | `success`, uma vez |
| erro simples de validação | visual/inline |

## Gaps confirmados entre spec e código

1. `src/components/OlliButton.tsx` ainda possui variante pequena de 40 dp.
2. O loading do botão substitui o conteúdo por spinner, contrariando a regra de preservar rótulo/largura.
3. `OlliPressable` usa háptico de seleção como padrão e cartões vibram ao abrir.
4. Parte dos tokens de motion ainda não está na fonte única.
5. A chamada experimental de LayoutAnimation continua presente.
6. `webapp/src/ui/button.tsx` usa alturas de 32–40 px, abaixo da meta inclusiva.
7. O botão web tem foco, mas ainda não padroniza press/loading no componente-base.
8. A spec antiga menciona Expo 56; o projeto atual está em Expo 57.

## Metas propostas de aceitação

| Métrica | Meta |
|---|---:|
| ação principal identificada em até 5 s | ≥90% dos participantes |
| conclusão essencial sem intervenção | ≥90% após iteração |
| toque em botão adjacente errado | <2% |
| ação destrutiva acidental | 0 |
| recuperação de erro sem reiniciar | ≥90% |
| perda de dados por voltar/rede/erro | 0 |
| teclado nos fluxos críticos web | 100% |
| nome, função e estado nos controles críticos | 100% |
| zoom web | 200% sem perda de conteúdo/ação |

Estas metas são propostas. Precisam ser medidas em sessões reais antes de serem apresentadas como resultado.
