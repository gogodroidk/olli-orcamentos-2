# Aceite local C10 — HVAC/PMOC

Data: **2026-09-05**

`DONE_LOCAL` — inventário HVAC, planos PMOC, visitas recorrentes e documentos avançados possuem contrato local verificável.

## Evidências

- Equipamentos: cliente/local, fabricante/modelo, série, capacidade, situação, criticidade, fotos e QR opaco.
- Planos: periodicidades, atividades, escopo e referências versionadas.
- Versões append-only com responsável técnico e documento de responsabilidade quando informado.
- Geração idempotente de ordens por plano, ativo, período e periodicidade.
- Checklist e fotos de campo preservados ao editar a ordem no painel.
- Comunicação pública não declara conformidade nem substitui responsável técnico, laboratório ou emissão fiscal.

## Limites

- Nenhuma migration ou escrita em produção foi executada.
- Aceite em dispositivo, coorte e revisão de profissional habilitado continuam pendentes.

## Validação

`npm run test:c10-hvac-pmoc`
