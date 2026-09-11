# OLLI Autopilot IA — plano e decisão de implementação

Data: 11/09/2026
Escopo: primeira fatia executável no checkout canônico e no staging.

## 1. O que o Autopilot deve resolver

O prestador pode colar uma conversa, anexar um CSV/JSON, PDF, print do
WhatsApp/Instagram ou foto de um orçamento e pedir que a OLLI prepare uma
prévia de:

- cliente;
- produtos;
- serviços;
- itens e dados de um orçamento;
- documentos complementares (contrato, garantia, conclusão ou PMOC).

O resultado nunca é uma gravação cega. A OLLI mostra origem, confiança,
avisos e campos sugeridos. O usuário pode revisar, levar os itens para um novo
orçamento e, na Central de Dados, confirmar o cadastro de produtos/serviços.

## 2. Limite consciente da primeira fatia

- A prévia aceita arquivos pequenos e fontes escolhidas pelo usuário; não lê
  WhatsApp Web, Instagram, cookies, sessões ou históricos automaticamente.
- PDF e imagem são convertidos para texto/Markdown no Worker apenas quando o
  binding de Workers AI e o provedor textual estão habilitados. Sem esses
  recursos, a resposta é um erro explícito; não há fallback silencioso.
- A primeira confirmação de catálogo cria somente produtos/serviços novos por
  meio da camada `useSalvar`, com revisão e compensação em caso de falha.
  Duplicidades não são atualizadas automaticamente.
- Orçamento e documento são prévias editáveis. A gravação continua no fluxo
  existente do orçamento/documentos, preservando versionamento e as travas de
  estados enviados/assinados.
- PDF/foto grandes, ZIP, XLS com macro, SVG e executáveis ficam bloqueados.
  O job assíncrono com quarentena, fila/DLQ e parser isolado é a próxima fase.

## 3. Decisão técnica

### Caminho escolhido agora

1. Cliente valida extensão/tamanho e envia um payload pequeno para
   `POST /ia/autopilot/preview`.
2. O Worker autentica o JWT, aplica rate-limit/cota e valida MIME, base64 e
   magic bytes antes de qualquer inferência.
3. Texto é normalizado diretamente. PDF/imagem são convertidos com
   `env.AI.toMarkdown` (Cloudflare Workers AI) e o conteúdo é limitado antes de
   chegar ao modelo textual.
4. O normalizador usa Structured Outputs/JSON Schema fechado, evidência por
   campo, confiança e `requiresReview=true`.
5. A UI exibe o diff e nunca executa ação a partir do documento. Cadastro,
   orçamento e documento seguem botões explícitos existentes.

### Por que não colocar Docling/PaddleOCR dentro do Worker

Docling é MIT e excelente para layout, tabelas e OCR, mas carrega modelos e
dependências Python que devem ficar em um job/container isolado. PaddleOCR
3.x/PP-StructureV3 (Apache-2.0) é uma boa segunda opção para scans e tabelas,
mas também não deve entrar no bundle do Worker nem do APK. O OLLI primeiro mede
qualidade em um corpus de documentos concorrentes e só depois escolhe o parser
primário.

## 4. Guardas de segurança

- Dados do arquivo entram no prompt dentro de delimitadores de fonte não
  confiável; nunca viram instrução de sistema, SQL, URL, RPC ou ferramenta.
- O modelo não escolhe provider, endpoint, preço final, status financeiro,
  pagamento, envio, exclusão, senha ou permissão.
- Preços vindos de concorrente são sempre `precoSugerido`, nunca preço oficial.
- O tenant é derivado da sessão/organização no servidor; nenhum `tenantId` do
  corpo é usado para autorizar acesso.
- Logs não carregam arquivo, prompt, conversa, telefone, CPF/CNPJ ou endereço.
- Hash, nome seguro, MIME, tamanho, parser e timestamp são os únicos metadados
  de origem devolvidos na prévia.
- Limites da primeira fatia: um arquivo por vez, 4 MiB de bytes, 20.000
  caracteres convertidos, 50 candidatos, timeout do Worker e cota diária já
  existente.
- Toda futura persistência deve usar bucket de quarentena separado, path
  server-authoritative, TTL curto, signed URL e job idempotente.

## 5. Pesquisa open source e fontes oficiais

- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) —
  modelos open source hospedados, binding `AI` e integração com Vectorize.
- [Markdown Conversion binding](https://developers.cloudflare.com/workers-ai/features/markdown-conversion/usage/binding/) —
  `env.AI.toMarkdown`, retorno estruturado e formatos suportados.
- [Formatos do Markdown Conversion](https://developers.cloudflare.com/workers-ai/features/markdown-conversion/supported-formats/) —
  PDF, imagens, Office, CSV e ODF.
- [Como o conversor processa PDFs e imagens](https://developers.cloudflare.com/workers-ai/features/markdown-conversion/how-it-works/) —
  páginas/StructTree para PDF e detecção + Gemma para imagens.
- [Docling](https://github.com/docling-project/docling) — MIT; layout, tabelas,
  OCR e exportação estruturada para job isolado.
- [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) — Apache-2.0;
  PP-StructureV3 para OCR, layout, tabelas e documentos escaneados.
- [Unstructured](https://github.com/Unstructured-IO/unstructured) — Apache-2.0;
  amplo, mas exige Poppler/Tesseract e é melhor em container Linux.
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — MIT;
  alternativa para um worker/container de voz, enquanto o OLLI mantém Whisper
  no binding Cloudflare para o fluxo push-to-talk atual.
- [Structured Outputs do OpenRouter](https://openrouter.ai/docs/guides/features/structured-outputs)
  e [entradas multimodais](https://openrouter.ai/docs/guides/overview/multimodal/overview)
  — usados somente com modelo/provedor explicitamente compatível.

## 6. Critérios de aceite

- Um texto ou arquivo válido gera uma prévia com `requiresReview=true` e sem
  mutação no banco.
- PDF/imagem com magic byte incompatível, MIME proibido ou tamanho acima do teto
  é rejeitado antes da IA.
- Prompt injection dentro do arquivo não altera o schema nem libera ferramenta.
- Campos sem evidência têm confiança baixa/aviso; preço sugerido nunca é
  apresentado como preço final.
- A confirmação de catálogo exige papel permitido, cria apenas novos registros,
  não duplica por nome+marca+modelo e desfaz inclusões parciais em caso de erro.
- O botão de orçamento leva todos os itens válidos para o editor existente,
  onde o usuário revisa e salva como rascunho.
- Arquivos não são guardados no histórico do chat nem expostos por URL pública.
- Web e mobile exibem estado carregando, erro, cancelamento e sucesso de forma
  acessível; sem animação decorativa atrás de formulário crítico.

## 7. Próximas fases

1. Job de quarentena + Storage separado + Queue/Workflow + parser isolado para
   PDF/foto, com páginas, pixels, decompression ratio, retries e DLQ.
2. Persistência de `import_jobs`, candidatos, evidências e mudanças, com RPC de
   commit idempotente e undo auditável.
3. Memória por tenant baseada em referências aprovadas (3–10 orçamentos),
   redigida e com pgvector/Vectorize filtrado por tenant; sem treinamento global.
4. Voz push-to-talk no web e, depois, voz ao vivo com consentimento explícito,
   interrupção e cota por minuto.
5. Integração oficial WhatsApp Business/Instagram apenas com opt-in, templates,
   janela de atendimento e custos visíveis.
