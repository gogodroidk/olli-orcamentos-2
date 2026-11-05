# Licença da ilustração 3D — prévia Z-01

Não há modelo, textura nem biblioteca 3D de terceiro.

A cena é CSS (`transform-style: preserve-3d`) com geometria original: um bloco, duas condensadoras no telhado, uma linha e evaporadoras nas salas. O pôster de fallback é um SVG nosso, no HTML.

`cena-vrf.js` só muda `transform` no arraste, no botão ou na seta. Não há `requestAnimationFrame`. O script não está no HTML inicial: entra depois do carregamento da página, com a seção perto da tela, e não entra com `prefers-reduced-motion`, `saveData` ou `deviceMemory` até 2.

A ilustração não é foto e o texto da página diz isso.
