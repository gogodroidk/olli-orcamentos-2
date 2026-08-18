// Leitura incremental de request body. Impede que Transfer-Encoding: chunked
// faça o Worker bufferizar um payload inteiro antes de descobrir que excedeu o
// limite. O chamador continua reaproveitando `raw`, pois o stream só pode ser
// consumido uma vez.

export async function lerCorpoLimitado(request, maxBytes) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) return { grande: true, raw: '' };
  if (!request?.body || typeof request.body.getReader !== 'function') {
    return { grande: false, raw: '' };
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const partes = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel('payload_grande').catch(() => {});
        return { grande: true, raw: '' };
      }
      partes.push(decoder.decode(value, { stream: true }));
    }
    partes.push(decoder.decode());
    return { grande: false, raw: partes.join('') };
  } catch {
    await reader.cancel('falha_leitura').catch(() => {});
    return { grande: false, raw: '' };
  } finally {
    reader.releaseLock();
  }
}
