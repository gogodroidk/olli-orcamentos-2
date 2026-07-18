import { domMax } from "motion/react";

/**
 * Arquivo-ponte que existe SÓ para o bundler.
 *
 * `LazyMotion` só carrega as features sob demanda se elas chegarem por `import()`.
 * Importar `domMax` direto no motion-lazy.tsx (como era até 18/07) coloca o pacote
 * inteiro de features no chunk de ENTRADA — o `LazyMotion` continua funcionando, mas
 * não economiza um byte, que é o motivo dele existir.
 *
 * Com o re-export isolado aqui, o rollup consegue separar: o motion-lazy importa
 * `m` + `LazyMotion` (poucos KB) de forma estática, e as features caem num chunk
 * próprio que só baixa depois da primeira pintura.
 *
 * NÃO importe este arquivo de forma estática em lugar nenhum — isso desfaz a
 * separação em silêncio (o build passa, o bundle volta a engordar).
 */
export default domMax;
