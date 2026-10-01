import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { criarGravadorRascunho, lerRascunho, serializarRascunho, type GravadorRascunho } from '../services/rascunhoCampo';

/**
 * Estado de um campo de texto que SOBREVIVE ao app ser morto (câmera, pouca
 * memória). Uso igual ao `useState`, com uma chave de `chaveRascunho(escopo,
 * campo)`:
 *
 *     const [titulo, setTitulo, rascunho] = useRascunhoCampo(chaveRascunho('os-nova', 'titulo'));
 *     // ...depois de salvar de verdade:
 *     rascunho.limpar();
 *
 * Grava no aparelho com um respiro curto e DESCARREGA na hora em que o app sai
 * do primeiro plano (abrir a câmera faz isso). Na montagem, se houver rascunho e
 * o campo ainda estiver vazio, restaura — nunca por cima do que a pessoa já
 * digitou. `chave` null = campo comum, sem rascunho.
 */
export function useRascunhoCampo(
  chave: string | null,
): [string, (valor: string) => void, { limpar: () => void; restaurado: boolean }] {
  const [valor, setValorEstado] = useState('');
  const [restaurado, setRestaurado] = useState(false);
  const gravadorRef = useRef<GravadorRascunho | null>(null);
  const digitouRef = useRef(false);

  useEffect(() => {
    if (!chave) {
      gravadorRef.current = null;
      return;
    }
    const gravador = criarGravadorRascunho({
      gravar: (v) => (v === null
        ? AsyncStorage.removeItem(chave)
        : AsyncStorage.setItem(chave, serializarRascunho(v, Date.now()))),
      agendar: (fn, ms) => {
        const t = setTimeout(fn, ms);
        return () => clearTimeout(t);
      },
    });
    gravadorRef.current = gravador;
    digitouRef.current = false;

    let ativo = true;
    AsyncStorage.getItem(chave)
      .then((bruto) => {
        const texto = lerRascunho(bruto, Date.now());
        if (!ativo || texto === null || digitouRef.current) return;
        setValorEstado(texto);
        setRestaurado(true);
      })
      .catch(() => {});

    // Câmera aberta / app no bolso: grava já, sem esperar o respiro.
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado !== 'active') void gravador.descarregar();
    });
    return () => {
      ativo = false;
      sub.remove();
      void gravador.descarregar();
    };
  }, [chave]);

  const setValor = useCallback((novo: string) => {
    digitouRef.current = true;
    setValorEstado(novo);
    gravadorRef.current?.mudar(novo);
  }, []);

  const limpar = useCallback(() => {
    digitouRef.current = true;
    setValorEstado('');
    setRestaurado(false);
    void gravadorRef.current?.limpar();
  }, []);

  return [valor, setValor, { limpar, restaurado }];
}
