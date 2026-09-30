# Validação — Onda 1, Janela 1.2

Data da validação: 2026-08-27  
Resultado: **APROVADO como checkpoint de pesquisa documental parcial**  
Não representa: validação de mercado, parecer jurídico/técnico, homologação de produto ou aceite de produção.

## 1. Recibo do relatório portátil

Comando reproduzível, executado a partir desta pasta:

```powershell
node .\build-report.mjs
```

Resultado final do empacotador e verificador:

| Verificação | Resultado |
|---|---|
| validação do artefato | passou |
| empacotamento autocontido | passou |
| verificação no navegador | passou |
| viewport desktop | 1440 px |
| viewport móvel | 390 px |
| blocos renderizados | 16 |
| gráficos renderizados | 1 |
| tabelas renderizadas | 5 |
| diálogo de fontes | passou |
| interação com fonte | teclado/menu semântico/clique |
| requisições externas durante a verificação | nenhuma |

O primeiro empacotamento revelou excesso horizontal no Chromium para Windows: o cabeçalho do leitor usava `100vw`, que inclui a largura da barra de rolagem clássica. `build-report.mjs` injeta uma regra de compatibilidade limitada aos dois cabeçalhos. O verificador oficial passou depois da correção, em desktop e celular.

As capturas das tentativas reprovadas foram preservadas em `_qa_diagnostics/` como evidência do defeito corrigido; elas não são a entrega final.

## 2. Integridade dos dados

| Checagem | Resultado |
|---|---|
| `artifact.json` parseável | passou |
| fontes relativas do manifesto existentes | 12 de 12 |
| catálogo estruturado | 20 documentos |
| catálogo editorial | itens 1 a 20, sem lacuna |
| ledger de evidências | 56 IDs únicos |
| composição do ledger | 25 regulatórias/institucionais; 10 referências; 10 concorrentes; 8 sinais públicos; 3 internas |
| assinaturas comuns de segredo | nenhuma localizada |

As seis consultas SQL foram executadas em SQLite em memória e comparadas, campo a campo e linha a linha, com os datasets do relatório:

| Consulta | Linhas | Igualdade exata |
|---|---:|---|
| `journey.sql` | 11 | passou |
| `competitors.sql` | 10 | passou |
| `documents.sql` | 20 | passou |
| `document_priority_counts.sql` | 3 | passou |
| `regulatory.sql` | 7 | passou |
| `research_status.sql` | 7 | passou |

O gráfico contém 11 documentos P0, 7 P1 e 2 P2. Essa contagem expressa prioridade de produto e não prevalência de mercado.

## 3. Fronteiras preservadas

- nenhuma entrevista ou contato externo foi realizado;
- nenhum PDF, texto normativo protegido ou template de terceiro foi incorporado;
- nenhum segredo, sessão ou credencial foi lido ou retido;
- nenhuma migration, banco de produção, deploy, DNS, cobrança ou publicação foi alterado;
- as 53 entradas preexistentes do worktree permaneceram fora do escopo; esta janela adicionou somente `docs/ONDA_1/JANELA_1_2/`.

## 4. Gates ainda abertos

1. Executar as sessões de campo e medir o baseline real.
2. Licenciar a edição aplicável da ABNT NBR 17037 e revisar a aplicação com RT.
3. Revisar contratos, assinatura, LGPD, CDC e retenção com os responsáveis competentes.
4. Testar os concorrentes em avaliações controladas; páginas públicas não provam profundidade funcional.
5. Bloquear ou reescrever, antes de publicação, o conteúdo existente do site que reproduz parâmetros atribuídos à NBR 17037.
6. Executar a Janela 1.3 somente com spikes descartáveis, fixtures e os gates registrados no `README.md`.
