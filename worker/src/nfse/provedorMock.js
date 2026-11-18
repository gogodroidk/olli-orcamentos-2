/**
 * Provedor SIMULADO de NFS-e. É o padrão (NFSE_PROVEDOR ausente ou "mock") e o único usado nos testes.
 * Nunca fala com a rede, nunca emite nota de verdade. Os números e links são fictícios e marcados "SIMULADA".
 *
 * Comportamento previsível para testar a tela e o servidor:
 *   - descrição contendo "[erro]"        → status 'erro' (mensagem em português)
 *   - descrição contendo "[processando]" → fica 'processando'; a PRÓXIMA consulta devolve 'autorizada'
 *   - qualquer outra                     → 'autorizada' na hora
 */
export function criarProvedorMock() {
  /** @type {Map<string, object>} */
  const notas = new Map();
  let seq = 0;

  const autorizada = (ref) => {
    const n = notas.get(ref);
    return {
      status: 'autorizada',
      numero: n.numero,
      chave: `SIMULADA-${n.numero}`,
      pdfUrl: `https://nfse-simulada.invalid/${ref}.pdf`,
      xmlUrl: `https://nfse-simulada.invalid/${ref}.xml`,
      ambiente: 'simulado',
    };
  };

  return {
    nome: 'mock',
    ambiente: 'simulado',
    async emitir({ ref, servico }) {
      // Idempotente, como o parceiro real; mas nota que deu ERRO pode ser reenviada com a mesma ref (corrigindo os dados).
      if (notas.has(ref) && !notas.get(ref).erro) return this.consultar(ref);
      if (/\[erro\]/i.test(servico.descricao)) {
        notas.set(ref, { erro: true });
        return { status: 'erro', mensagem: 'Simulação: o município recusou a nota.', ambiente: 'simulado' };
      }
      seq += 1;
      const pendente = /\[processando\]/i.test(servico.descricao);
      notas.set(ref, { numero: String(seq), pendente });
      if (pendente) return { status: 'processando', ambiente: 'simulado' };
      return autorizada(ref);
    },
    async consultar(ref) {
      const n = notas.get(ref);
      if (!n) return { status: 'erro', mensagem: 'Nota não encontrada.', ambiente: 'simulado' };
      if (n.erro) return { status: 'erro', mensagem: 'Simulação: o município recusou a nota.', ambiente: 'simulado' };
      n.pendente = false;
      return autorizada(ref);
    },
  };
}
