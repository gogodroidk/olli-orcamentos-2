# 2.5D, performance por clique e testes

## Decisão sobre 3D

3D real com Spline, Three.js, React Three Fiber ou WebGL está rejeitado para os fluxos operacionais atuais. Não há benefício comprovado em formulário, orçamento, Home, agenda, onboarding ou checkout.

Direção aprovada para pesquisa e futura implementação:

- preservar a landing atual;
- trocar gradualmente mockups ilustrados por capturas reais e sanitizadas;
- usar moldura CSS e profundidade 2.5D leve;
- limitar movimento a desktop com ponteiro fino;
- usar composição estática no celular e em reduced motion;
- não carregar parallax em dispositivo sem mouse;
- manter uma tela principal no hero;
- colocar galeria curta abaixo da dobra, com lazy loading e scroll nativo.

3D real só volta a ser candidato se houver tarefa espacial concreta, como identificar componentes de equipamento, visualizar instalação física ou posicionar um objeto.

## Assinatura visual sugerida

```text
pedido → orçamento → aprovação → ordem de serviço
```

As etapas aparecem como camadas de documento que avançam conforme a rolagem. Isso explica o produto melhor que um objeto 3D genérico e preserva performance.

## Fases 2.5D

1. Captura real do orçamento aprovado/concluído dentro do aparelho CSS existente.
2. Cartão de orçamento/PDF à frente e dashboard discretamente ao fundo, apenas após convergência visual.
3. Sombra e brilho em pseudo-elementos, ligados aos mesmos valores de ponteiro.
4. Faixa de telas com `overflow-x`, `scroll-snap`, teclado e toque; sem marquee infinito.

Somente `transform` e `opacity` por frame. Evitar animar sombra, blur, filtro, largura, altura, margem ou posição.

## Orçamento de resposta

| Momento | Meta | Classificação |
|---|---:|---|
| primeiro pixel de pressed em 60 Hz | ≤16,7 ms | orçamento de um frame |
| confirmação visual de ação aceita | <100 ms | meta interna de percepção |
| skeleton | somente após 180 ms | decisão local existente |
| permanência mínima do skeleton | 320 ms após montar | evita flash |
| interação web completa | INP ≤200 ms no p75 | Core Web Vitals |
| feedback animado | 160–260 ms | tokens OLLI |
| shell/conteúdo local inicial | alvo ≤500 ms | meta interna |
| primeiro toque útil em cold start | <2 s | gate atual do projeto |
| scroll/motion | alvo 60 FPS; mínimo ≥55 sustentado | gate atual do projeto |

Fontes: [web.dev — INP](https://web.dev/articles/inp), [React Native — Performance](https://reactnative.dev/docs/performance), [Chrome DevTools — Performance](https://developer.chrome.com/docs/devtools/performance/overview).

## Metas por superfície

### Landing

- LCP ≤2,5 s no p75;
- INP ≤200 ms no p75;
- CLS ≤0,1;
- nenhuma dependência WebGL no hero;
- nenhuma imagem sem dimensões;
- H1 e CTA disponíveis no primeiro paint;
- JavaScript do hero no celular não aumenta;
- imagens abaixo da dobra com lazy loading;
- repetir o trace atual antes de chamar medições antigas de estado presente.

### Dashboard

- press state no mesmo frame;
- shell da próxima tela em até 100 ms;
- dado local/cache idealmente em até 500 ms;
- depois de 180 ms, skeleton fiel em vez de tela vazia;
- filtros locais não aguardam rede;
- cards não mudam de tamanho quando o dado chega;
- INP medido com cliques, teclado e digitação reais.

### Aplicativo

- press state no mesmo frame;
- primeiro frame da rota com conteúdo, shell ou skeleton;
- leitura local abaixo de 180 ms não mostra skeleton;
- listas longas sem blur/glow pesado por linha;
- medir em build release;
- inspecionar bundle com Expo Atlas sem compartilhar artefato sensível.

## Optimistic UI

Pode ser otimista quando houver rollback claro:

- filtro;
- expandir/recolher;
- preferência local;
- edição de rascunho;
- item temporário de orçamento não enviado;
- reordenação reversível.

Não pode fingir sucesso:

- enviar orçamento;
- aprovar/recusar;
- publicar versão;
- excluir;
- mudar papel/permissão;
- sincronizar empresa;
- cobrar/pagar;
- confirmar e-mail/WhatsApp enviado;
- qualquer ação de produção.

Nesses casos, usar `Enviando…` ou `Aguardando confirmação` e só declarar sucesso após confirmação da autoridade real.

## Matriz mínima de testes

### Android intermediário físico

- 4 GB de RAM;
- 60 Hz;
- build release;
- fonte padrão e ampliada;
- reduced motion ligado/desligado;
- Wi-Fi, 4G limitado e offline.

Roteiro:

1. cold start três vezes;
2. Home → Novo orçamento;
3. orçamento com 20 itens;
4. remoção rápida e toque repetido;
5. lista com 50+ registros;
6. alternar Home/Agenda/Clientes/Orçamentos;
7. salvar com rede lenta;
8. perder rede durante envio;
9. voltar/entrar dez vezes na mesma tela;
10. verificar memória, requests duplicadas, frames e persistência dos dados.

### Web fraca

Perfis:

- regressão: 1,6 Mbps, 150 ms RTT, CPU 4×;
- stress: Slow 3G, CPU 6×.

Viewports e modos:

- 360×800;
- 390×844;
- 1366×768;
- zoom 200%;
- teclado sem mouse;
- touch;
- reduced motion.

Ferramentas: Lighthouse antes/depois, painel Performance com interação real, Network, accessibility tree e recarga fria/repetida.

## Limite de evidência

Esta é uma especificação e auditoria estática. Não houve trace novo de produção nem medição nova em aparelho físico nesta rodada. Números antigos foram reutilizados apenas como evidência histórica, nunca como confirmação atual.
