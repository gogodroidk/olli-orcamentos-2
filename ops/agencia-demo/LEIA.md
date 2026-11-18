# Gerador de prévia

Monta uma página estática com o nome da empresa, a cor e o logo públicos do site, e o que a pessoa falou.

- Pedido de atendimento ou central vira a tela da conversa no WhatsApp.
- Pedido de site, anúncio, marca ou o resto vira uma página com botão de WhatsApp.
- Não cita preço. Não promete resultado. Não publica e não envia.

```bash
node ops/agencia-demo/gerar.mjs --lead ops/agencia-demo/leads/aurora.json --site-html ops/agencia-demo/fixtures/aurora.html --saida /caminho/demos
```

Os dois leads desta pasta são fictícios. O HTML do site também: serve para o teste achar cor e logo sem ir à rede.
