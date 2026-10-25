import assert from 'node:assert/strict';
import {
  formatCurrency as formatAppCurrency,
  formatDate as formatAppDate,
  formatNumber as formatAppNumber,
  formatTime as formatAppTime,
} from '../src/utils/intl.ts';
import {
  formatCurrency as formatWebCurrency,
  formatDate as formatWebDate,
  formatNumber as formatWebNumber,
  formatTime as formatWebTime,
} from '../webapp/src/utils/intl.ts';
import { formatCurrency as formatAppCompatCurrency, formatNumber as formatAppCompatNumber } from '../src/utils/currency.ts';
import { formatDate as formatAppCompatDate } from '../src/utils/date.ts';

const implementacoes = [
  ['app', formatAppCurrency, formatAppDate, formatAppNumber, formatAppTime],
  ['painel', formatWebCurrency, formatWebDate, formatWebNumber, formatWebTime],
] as const;

let verificacoes = 0;
for (const [nome, moeda, data, numero, hora] of implementacoes) {
  const confere = (atual: string, esperado: string, caso: string) => {
    assert.equal(atual, esperado, `${nome}: ${caso}`);
    verificacoes++;
  };

  confere(moeda(1234.56), 'R$\u00a01.234,56', 'moeda usa pt-BR e BRL por padrão');
  confere(
    moeda(1234.56, { locale: 'en-US', currency: 'USD' }),
    '$1,234.56',
    'moeda aceita locale e código ISO alternativos',
  );
  confere(
    moeda(39, { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    'R$\u00a039',
    'moeda aceita opções de casas decimais',
  );
  confere(numero(1234.56), '1.234,56', 'número usa pt-BR por padrão');
  confere(numero(1234.56, { locale: 'en-US' }), '1,234.56', 'número aceita locale alternativo');
  confere(data('2026-10-24'), '24/10/2026', 'data ISO sem horário mantém o dia local');
  confere(data('2026-10-24', { locale: 'en-US' }), '10/24/2026', 'data aceita locale alternativo');
  confere(
    data('2026-10-24', { day: '2-digit', month: 'short', includeYear: false }),
    '24 de out.',
    'data permite omitir o ano',
  );
  confere(data('2026-02-30'), '', 'data civil inválida é rejeitada');
  confere(data(new Date(Number.NaN)), '', 'data inválida é tratada como vazia');
  confere(
    hora('2026-10-24T15:04:00Z', { locale: 'en-US', timeZone: 'UTC', hour12: false }),
    '15:04',
    'horário aceita locale e fuso explícitos',
  );
}

assert.equal(formatAppCompatCurrency(1234.56), 'R$\u00a01.234,56', 'compat: moeda existente preserva a saída pt-BR');
assert.equal(formatAppCompatNumber(1234.56), '1.234,56', 'compat: número existente preserva a saída pt-BR');
assert.equal(formatAppCompatDate('2026-10-24'), '24/10/2026', 'compat: data existente usa o utilitário central');
verificacoes += 3;

console.log(`PASSOU: ${verificacoes} verificações nos formatadores do app e do painel.`);
