/**
 * TOKENS DE MOVIMENTO DO PAINEL — a ÚNICA fonte de duração, curva, distância e mola.
 *
 * Cópia fiel de `CONFIG CLAUDE/motion-3d-ux/motion-os/tokens/motion.tokens.json`
 * (perfil "SaaS genérico": 85% funcional, 10% personalidade, 5% editorial). Nenhuma
 * animação do painel escreve número solto: ou vem daqui (Motion, em segundos), ou
 * vem das variáveis CSS de `tokens.css` (Tailwind/CSS, em ms). As duas saídas são
 * conferidas uma contra a outra por `scripts/teste-motion-painel.ts` — se alguém
 * mudar um lado só, o teste quebra.
 *
 * Este arquivo é TypeScript puro, sem import: o teste da raiz o carrega direto no
 * node (type stripping), sem Vite.
 */

export const TOKENS_MOTION = {
	duracao: { instant: 0, micro: 100, fast: 160, base: 220, slow: 320, page: 400, celebration: 700 },
	distancia: { xs: 2, sm: 6, md: 12, lg: 20, xl: 32 },
	escala: { press: 0.97, hover: 1.015, enter: 0.985 },
	/** Em SEGUNDOS (é o formato do `staggerChildren`/`delay` do Motion). */
	escalonamento: { tight: 0.025, base: 0.045, relaxed: 0.075 },
	curva: {
		standard: [0.2, 0, 0, 1],
		enter: [0.23, 1, 0.32, 1],
		exit: [0.4, 0, 1, 1],
		emphasized: [0.2, 0.8, 0.2, 1],
	},
	mola: {
		snappy: { type: "spring", stiffness: 500, damping: 34, mass: 0.7 },
		gentle: { type: "spring", stiffness: 260, damping: 28, mass: 0.9 },
		drawer: { type: "spring", stiffness: 360, damping: 34, mass: 0.9 },
	},
	politica: {
		reducedMotion: "user",
		defaultIntensity: "functional",
		/** Lista que entra escalonada nunca escalona mais que isto — o resto chega junto. */
		maxStaggerItems: 12,
		maxContinuousDecorativeAnimations: 1,
	},
} as const;

/**
 * EXTENSÕES DO OLLI — o que o perfil do motion-os não tem e um momento do painel
 * precisa. Mesmas regras (só transform/opacity, zera em "Reduzir movimento"), e o
 * mesmo teste de paridade com tokens.css. Acrescentar aqui é decisão, não atalho.
 */
export const EXTENSAO_OLLI = {
	escala: {
		/** Até onde o anel do "aprovado" se abre antes de sumir (1 vez, no `celebration`). */
		anel: 1.6,
		/** De que tamanho o ícone de confirmação parte para assentar na mola `snappy`. */
		assentarDe: 0.6,
	},
} as const;

export type NomeDuracao = keyof typeof TOKENS_MOTION.duracao;
export type NomeCurva = keyof typeof TOKENS_MOTION.curva;
export type Curva = readonly [number, number, number, number];
export interface Mola {
	readonly type: "spring";
	readonly stiffness: number;
	readonly damping: number;
	readonly mass: number;
}

/** ms → s (o Motion trabalha em segundos, o CSS em ms). */
export const seg = (ms: number): number => ms / 1000;

/** Atraso do item `i` numa lista escalonada, com o teto da política (o 13º chega junto do 12º). */
export function atrasoEscalonado(i: number, passo: keyof typeof TOKENS_MOTION.escalonamento = "tight"): number {
	return Math.min(i, TOKENS_MOTION.politica.maxStaggerItems - 1) * TOKENS_MOTION.escalonamento[passo];
}

/**
 * Transições prontas para o Motion. O nome diz o PAPEL, não o número: quem anima
 * uma entrada pede `entrar`, e se o perfil mudar, muda aqui para o painel inteiro.
 */
export const TRANSICAO = {
	/** Hover, press, troca de ícone. */
	micro: { duration: seg(TOKENS_MOTION.duracao.micro), ease: TOKENS_MOTION.curva.standard },
	/** Conteúdo que chega (skeleton → valor, item de lista). */
	entrar: { duration: seg(TOKENS_MOTION.duracao.base), ease: TOKENS_MOTION.curva.enter },
	/** Conteúdo que sai — mais rápido que a entrada, para não segurar a tela. */
	sair: { duration: seg(TOKENS_MOTION.duracao.fast), ease: TOKENS_MOTION.curva.exit },
	/** Troca de tela: só opacidade, curta. */
	pagina: { duration: seg(TOKENS_MOTION.duracao.fast), ease: TOKENS_MOTION.curva.standard },
	/** O teto de um momento de celebração (aprovado, dinheiro entrou). */
	celebracao: { duration: seg(TOKENS_MOTION.duracao.celebration), ease: TOKENS_MOTION.curva.emphasized },
	/** Mudança de posição na lista (quem sobe quando outro sai). */
	layout: TOKENS_MOTION.mola.gentle,
	/** "Assentar" de um ícone de confirmação. */
	assentar: TOKENS_MOTION.mola.snappy,
} as const;

/**
 * Avalia a curva cúbica de Bézier (0,0)-(x1,y1)-(x2,y2)-(1,1) no progresso `t`
 * (0..1). É a MESMA curva do `cubic-bezier()` do CSS — usada pelo contador de
 * dinheiro, que roda em requestAnimationFrame para não trazer o motor `animate()`
 * do Motion para a primeira tela. Newton-Raphson com recuo para bisseção.
 */
export function avaliarCurva(curva: Curva, t: number): number {
	if (t <= 0) return 0;
	if (t >= 1) return 1;
	const [x1, y1, x2, y2] = curva;
	const bx = (u: number) => 3 * (1 - u) ** 2 * u * x1 + 3 * (1 - u) * u ** 2 * x2 + u ** 3;
	const by = (u: number) => 3 * (1 - u) ** 2 * u * y1 + 3 * (1 - u) * u ** 2 * y2 + u ** 3;
	const dx = (u: number) => 3 * (1 - u) ** 2 * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u ** 2 * (1 - x2);
	let u = t;
	for (let i = 0; i < 8; i++) {
		const erro = bx(u) - t;
		if (Math.abs(erro) < 1e-6) return by(u);
		const d = dx(u);
		if (Math.abs(d) < 1e-6) break;
		u -= erro / d;
	}
	let lo = 0;
	let hi = 1;
	u = t;
	for (let i = 0; i < 30; i++) {
		const x = bx(u);
		if (Math.abs(x - t) < 1e-6) break;
		if (x < t) lo = u;
		else hi = u;
		u = (lo + hi) / 2;
	}
	return by(u);
}

/**
 * Converte uma MOLA dos tokens numa curva CSS `linear(...)` + duração.
 *
 * Por que: drawer e diálogo são Radix + tw-animate-css (animação CSS). Trocar por
 * `m.div` exigiria `forceMount` + AnimatePresence em cada overlay do painel — risco
 * alto por nada. A curva `linear()` reproduz a mola no próprio CSS (é o que o
 * Motion faz por baixo quando gera animação nativa), então o drawer ganha a mola
 * dos tokens sem uma linha de JS a mais no bundle.
 *
 * Simula o oscilador amortecido (x: 0 → 1) em passos de 1 ms, amostra a cada
 * `amostraMs` e para quando assenta (|1 − x| < 0,001 e velocidade desprezível).
 */
export function linearDeMola(mola: Mola, amostraMs = 16): { duracaoMs: number; linear: string } {
	const { stiffness: k, damping: c, mass: m } = mola;
	let x = 0;
	let v = 0;
	const pontos: number[] = [0];
	let t = 0;
	const dt = 0.001;
	while (t < 2000) {
		const a = (-k * (x - 1) - c * v) / m;
		v += a * dt;
		x += v * dt;
		t += 1;
		if (t % amostraMs === 0) pontos.push(x);
		if (Math.abs(1 - x) < 0.001 && Math.abs(v) < 0.01) break;
	}
	// O último ponto é o repouso exato; `linear()` espaça os pontos por igual, então a
	// duração é (pontos − 1) × amostra — cada ponto cai no seu instante real.
	pontos.push(1);
	const duracaoMs = (pontos.length - 1) * amostraMs;
	return { duracaoMs, linear: `linear(${pontos.map((p) => Number(p.toFixed(4))).join(", ")})` };
}
