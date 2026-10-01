import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const row = ler('../src/screens/HojeScreen.tsx');
const pressable = ler('../src/components/OlliPressable.tsx');
// Desde a Onda 2 (2.3) o OlliPressable é um adaptador do PressableAnimado: o
// estado acessível tem de ATRAVESSAR o adaptador e chegar ao Pressable real.
const animado = ler('../src/components/motion/PressableAnimado.tsx');

assert.match(row, /accessibilityRole="checkbox"/, 'checklist precisa anunciar checkbox');
assert.match(row, /accessibilityState=\{\{ checked: item\.feito \}\}/, 'checklist precisa anunciar estado marcado');
assert.match(pressable, /<PressableAnimado[^>]*\{\.\.\.resto\}/, 'OlliPressable precisa repassar accessibilityState ao PressableAnimado');
assert.match(animado, /accessibilityState=\{\{ disabled, \.\.\.accessibilityState \}\}/, 'PressableAnimado precisa preservar o estado acessível');

console.log('OK — checklist anuncia papel e estado acessível.');
