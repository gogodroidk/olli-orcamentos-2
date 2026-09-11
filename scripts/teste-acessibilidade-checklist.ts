import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const row = ler('../src/screens/HojeScreen.tsx');
const pressable = ler('../src/components/OlliPressable.tsx');

assert.match(row, /accessibilityRole="checkbox"/, 'checklist precisa anunciar checkbox');
assert.match(row, /accessibilityState=\{\{ checked: item\.feito \}\}/, 'checklist precisa anunciar estado marcado');
assert.match(pressable, /accessibilityState=\{\{ disabled, \.\.\.accessibilityState \}\}/, 'OlliPressable precisa preservar o estado acessível');

console.log('OK — checklist anuncia papel e estado acessível.');
