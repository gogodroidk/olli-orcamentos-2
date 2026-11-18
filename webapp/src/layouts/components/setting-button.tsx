import { Check, Maximize2, Minimize2, Moon, Settings, Sun } from "lucide-react";
import {
	type CSSProperties,
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import screenfull from "screenfull";
import { ThemeLayout, ThemeMode } from "#/enum";
import CyanBlur from "@/assets/images/background/cyan-blur.png";
import RedBlur from "@/assets/images/background/red-blur.png";
import { type SettingsType, useSettingActions, useSettings } from "@/store/settingStore";
import { themeVars } from "@/theme/theme.css";
import { Button } from "@/ui/button";
import { ScrollArea } from "@/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/ui/sheet";
import { Slider } from "@/ui/slider";
import { Switch } from "@/ui/switch";
import { Text } from "@/ui/typography";
import { cn } from "@/utils";

type RadioOption<T extends string> = {
	value: T;
	label: string;
	/** Frase lida pelo leitor de tela junto com o nome. O texto visível fica no content. */
	description?: string;
	content: ReactNode;
	className?: string;
};

/**
 * Grupo de opções acessível (tema/layout/fonte do painel de Configurações).
 * Antes eram <Card onClick> — só funcionavam com mouse. Agora é um role="radiogroup"
 * real: setas movem e selecionam, Tab entra só uma vez (roving tabindex), e a seleção
 * é indicada por borda + selo de check (não só cor) para não depender de percepção de cor.
 */
function SettingRadioGroup<T extends string>({
	ariaLabel,
	value,
	options,
	onChange,
	containerClassName,
	itemClassName,
}: {
	ariaLabel: string;
	value: T;
	options: RadioOption<T>[];
	onChange: (value: T) => void;
	containerClassName?: string;
	itemClassName?: string;
}) {
	const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

	const focusAt = (index: number) => {
		const len = options.length;
		itemRefs.current[((index % len) + len) % len]?.focus();
	};

	const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
		if (event.key === "ArrowRight" || event.key === "ArrowDown") {
			event.preventDefault();
			const next = index + 1 >= options.length ? 0 : index + 1;
			onChange(options[next].value);
			focusAt(next);
		} else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
			event.preventDefault();
			const prev = index - 1 < 0 ? options.length - 1 : index - 1;
			onChange(options[prev].value);
			focusAt(prev);
		} else if (event.key === "Home") {
			event.preventDefault();
			onChange(options[0].value);
			focusAt(0);
		} else if (event.key === "End") {
			event.preventDefault();
			onChange(options[options.length - 1].value);
			focusAt(options.length - 1);
		}
	};

	return (
		<div role="radiogroup" aria-label={ariaLabel} className={containerClassName}>
			{options.map((option, index) => {
				const checked = option.value === value;
				return (
					// biome-ignore lint/a11y/useSemanticElements: <input type="radio"> nativo não comporta o conteúdo visual rico do cartão (ícone/miniatura + texto); button+role="radio" é o padrão ARIA APG (Radio Group).
					<button
						key={option.value}
						ref={(el) => {
							itemRefs.current[index] = el;
						}}
						type="button"
						role="radio"
						aria-checked={checked}
						aria-label={option.description ? `${option.label}. ${option.description}` : option.label}
						tabIndex={checked ? 0 : -1}
						onClick={() => onChange(option.value)}
						onKeyDown={(event) => handleKeyDown(event, index)}
						className={cn(
							"relative rounded-xl border bg-card text-card-foreground shadow-sm cursor-pointer transition-colors",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
							checked ? "border-primary" : "border-border",
							itemClassName,
							option.className,
						)}
					>
						{option.content}
						{checked && (
							<Check className="absolute top-1 right-1 size-3.5 text-primary" strokeWidth={2} aria-hidden="true" />
						)}
					</button>
				);
			})}
		</div>
	);
}

export default function SettingButton() {
	const { t } = useTranslation();
	const settings = useSettings();
	const { themeMode, themeLayout, themeStretch, breadCrumb, fontSize } = settings;
	const { setSettings } = useSettingActions();

	const updateSettings = (partialSettings: Partial<SettingsType>) => {
		setSettings({
			...settings,
			...partialSettings,
		});
	};

	const sheetContentBgStyle: CSSProperties = {
		backdropFilter: "blur(20px)",
		backgroundImage: `url("${CyanBlur}"), url("${RedBlur}")`,
		backgroundRepeat: "no-repeat, no-repeat",
		backgroundPosition: "right top, left bottom",
		backgroundSize: "50%, 50%",
	};

	const [isFullscreen, setIsFullscreen] = useState(screenfull.isFullscreen);
	const toggleFullScreen = () => {
		if (screenfull.isEnabled) {
			screenfull.toggle();
		}
	};
	const handleKeyDown = useCallback((event: KeyboardEvent) => {
		if (event.key === "Escape" && screenfull.isEnabled && screenfull.isFullscreen) {
			setIsFullscreen(false);
		}
	}, []);

	useEffect(() => {
		const onFullscreenChange = () => {
			if (screenfull.isEnabled) {
				setIsFullscreen(screenfull.isFullscreen);
			}
		};

		if (screenfull.isEnabled) {
			screenfull.on("change", onFullscreenChange);
		}

		window.addEventListener("keydown", handleKeyDown);

		return () => {
			if (screenfull.isEnabled) {
				screenfull.off("change", onFullscreenChange);
			}
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [handleKeyDown]);
	const layoutBackground = (layout: ThemeLayout) =>
		themeLayout === layout ? themeVars.colors.palette.primary.light : themeVars.colors.palette.gray[500];

	return (
		<Sheet modal={false}>
			<SheetTrigger asChild>
				{/* Girava infinito antes (animate-slow-spin sempre ligado) — motion decorativo
				    sem respeitar prefers-reduced-motion. Agora só gira no hover/foco, e só
				    quando o SO não pediu movimento reduzido (variant motion-safe). */}
				{/* "no escuro eu NÃO CONSIGO VER A ENGRENAGEM": o variant ghost do Button
				    não define cor de texto — o ícone herdava o preto do navegador e
				    ficava em 1,11:1 sobre o navy. `text-text-primary` leva a 18,94:1 no
				    escuro e 15,51:1 no claro. min-h/w 44px = alvo de toque mínimo. */}
				<Button
					variant="ghost"
					size="icon"
					className="rounded-full min-h-[44px] min-w-[44px] text-text-primary motion-safe:hover:animate-slow-spin motion-safe:focus-visible:animate-slow-spin"
					aria-label="Configurações de aparência"
				>
					<Settings className="size-5" strokeWidth={2} aria-hidden="true" />
				</Button>
			</SheetTrigger>
			<SheetContent style={sheetContentBgStyle} className="gap-0" onOpenAutoFocus={(e) => e.preventDefault()}>
				<SheetHeader className="flex flex-row items-center justify-between px-6 py-4 shrink-0">
					<SheetTitle>{t("sys.settings.title")}</SheetTitle>
					<SheetDescription />
				</SheetHeader>
				<ScrollArea>
					<div className="flex flex-col gap-6 px-6 py-2">
						{/* theme mode */}
						<div className="flex flex-col gap-2">
							<Text variant="subTitle1">{t("sys.settings.mode")}</Text>
							<SettingRadioGroup
								ariaLabel={t("sys.settings.mode")}
								value={themeMode}
								onChange={(next) => updateSettings({ themeMode: next })}
								containerClassName="flex flex-row gap-4"
								itemClassName="flex flex-1 h-20 items-center justify-center"
								options={[
									{
										value: ThemeMode.Light,
										label: "Tema claro",
										content: (
											<Sun
												className="size-6"
												strokeWidth={2}
												aria-hidden="true"
												color={
													themeMode === ThemeMode.Light ? themeVars.colors.palette.primary.default : "currentColor"
												}
											/>
										),
									},
									{
										value: ThemeMode.Dark,
										label: "Tema escuro",
										content: (
											<Moon
												className="size-6"
												strokeWidth={2}
												aria-hidden="true"
												color={themeMode === ThemeMode.Dark ? themeVars.colors.palette.primary.default : "currentColor"}
											/>
										),
									},
								]}
							/>
						</div>

						{/* theme layout */}
						<div className="flex flex-col gap-2">
							<Text variant="subTitle1">{t("sys.settings.layout")}</Text>
							<Text variant="caption" color="secondary">
								{t("sys.settings.layoutHelp")}
							</Text>

							<SettingRadioGroup
								ariaLabel={t("sys.settings.layout")}
								value={themeLayout}
								onChange={(next) => updateSettings({ themeLayout: next })}
								containerClassName="flex flex-col gap-3"
								itemClassName="h-auto w-full p-2"
								options={[
									{
										value: ThemeLayout.Vertical,
										label: t("sys.settings.layoutVertical"),
										description: t("sys.settings.layoutVerticalDesc"),
										className: "flex flex-row items-center gap-3",
										content: (
											<>
												<div className="flex h-14 w-24 shrink-0 flex-row gap-1 rounded-md border border-border p-1">
													<div className="flex h-full w-5 flex-col gap-1 p-0.5">
														<div
															className="h-2 w-2 shrink-0 rounded"
															style={{ background: layoutBackground(ThemeLayout.Vertical) }}
														/>
														<div
															className="h-1 w-full shrink-0 rounded opacity-50"
															style={{ background: layoutBackground(ThemeLayout.Vertical) }}
														/>
														<div
															className="h-1 max-w-[12px] shrink-0 rounded opacity-20"
															style={{ background: layoutBackground(ThemeLayout.Vertical) }}
														/>
													</div>
													<div className="flex h-full w-full flex-1 flex-col gap-1 p-0.5">
														<div
															className="h-1.5 w-full rounded opacity-20"
															style={{ background: layoutBackground(ThemeLayout.Vertical) }}
														/>
														<div
															className={cn("mx-auto w-full flex-1 rounded opacity-20", !themeStretch && "w-10")}
															style={{ background: layoutBackground(ThemeLayout.Vertical) }}
														/>
													</div>
												</div>
												<span className="flex min-w-0 flex-col gap-0.5 text-left">
													<Text variant="subTitle2" align="left">
														{t("sys.settings.layoutVertical")}
													</Text>
													<Text variant="caption" color="secondary" align="left">
														{t("sys.settings.layoutVerticalDesc")}
													</Text>
												</span>
											</>
										),
									},
									{
										value: ThemeLayout.Mini,
										label: t("sys.settings.layoutMini"),
										description: t("sys.settings.layoutMiniDesc"),
										className: "flex flex-row items-center gap-3",
										content: (
											<>
												<div className="flex h-14 w-24 shrink-0 flex-row gap-1 rounded-md border border-border p-1">
													<div className="flex h-full w-3 flex-col items-center gap-1 p-0.5">
														<div
															className="h-2 w-2 shrink-0 rounded"
															style={{ background: layoutBackground(ThemeLayout.Mini) }}
														/>
														<div
															className="h-1 w-full shrink-0 rounded opacity-50"
															style={{ background: layoutBackground(ThemeLayout.Mini) }}
														/>
														<div
															className="h-1 w-full shrink-0 rounded opacity-20"
															style={{ background: layoutBackground(ThemeLayout.Mini) }}
														/>
													</div>
													<div className="flex h-full w-full flex-1 flex-col gap-1 p-0.5">
														<div
															className="h-1.5 w-full rounded opacity-20"
															style={{ background: layoutBackground(ThemeLayout.Mini) }}
														/>
														<div
															className={cn("mx-auto w-full flex-1 rounded opacity-20", !themeStretch && "w-10")}
															style={{ background: layoutBackground(ThemeLayout.Mini) }}
														/>
													</div>
												</div>
												<span className="flex min-w-0 flex-col gap-0.5 text-left">
													<Text variant="subTitle2" align="left">
														{t("sys.settings.layoutMini")}
													</Text>
													<Text variant="caption" color="secondary" align="left">
														{t("sys.settings.layoutMiniDesc")}
													</Text>
												</span>
											</>
										),
									},
									{
										value: ThemeLayout.Horizontal,
										label: t("sys.settings.layoutHorizontal"),
										description: t("sys.settings.layoutHorizontalDesc"),
										className: "flex flex-row items-center gap-3",
										content: (
											<>
												<div className="flex h-14 w-24 shrink-0 flex-col gap-1 rounded-md border border-border p-1">
													<div className="flex h-3 w-full items-center gap-1">
														<div
															className="h-2 w-2 shrink-0 rounded"
															style={{ background: layoutBackground(ThemeLayout.Horizontal) }}
														/>
														<div
															className="h-1 w-4 shrink-0 rounded opacity-50"
															style={{ background: layoutBackground(ThemeLayout.Horizontal) }}
														/>
														<div
															className="h-1 w-3 shrink-0 rounded opacity-20"
															style={{ background: layoutBackground(ThemeLayout.Horizontal) }}
														/>
													</div>
													<div
														className={cn("mx-auto h-full w-full flex-1 rounded opacity-20", !themeStretch && "w-10")}
														style={{ background: layoutBackground(ThemeLayout.Horizontal) }}
													/>
												</div>
												<span className="flex min-w-0 flex-col gap-0.5 text-left">
													<Text variant="subTitle2" align="left">
														{t("sys.settings.layoutHorizontal")}
													</Text>
													<Text variant="caption" color="secondary" align="left">
														{t("sys.settings.layoutHorizontalDesc")}
													</Text>
												</span>
											</>
										),
									},
								]}
							/>
							<div className="flex flex-col gap-1">
								<div className="flex flex-row items-center justify-between gap-3">
									<Text variant="subTitle2">{t("sys.settings.stretch")}</Text>
									<Switch
										checked={themeStretch}
										onCheckedChange={(checked) => updateSettings({ themeStretch: checked })}
										aria-label={`${t("sys.settings.stretch")}. ${t("sys.settings.stretchDesc")}`}
									/>
								</div>
								<Text variant="caption" color="secondary">
									{t("sys.settings.stretchDesc")}
								</Text>
							</div>
						</div>

						{/* Sem seletor de cor: a cor primária é WHITE-LABEL — vem da marca
						    da empresa logada (ver useApplyBranding / olli/branding.ts). */}

						{/* font */}
						<div className="flex flex-col gap-2">
							<Text variant="subTitle1">{t("sys.settings.font")}</Text>

							{/* Sem seletor de família: a fonte é ÚNICA (Rubik) — mesma identidade
							    do painel e da landing. Antes havia troca Open Sans↔Inter; hoje as
							    duas chaves resolvem pra Rubik, então dois botões idênticos só
							    confundiam (ver tokens/typography.ts). Só o tamanho é ajustável. */}

							<Text variant="subTitle2">{t("sys.settings.size")}</Text>
							<Slider
								min={12}
								max={20}
								step={1}
								defaultValue={[fontSize]}
								onValueChange={(value) => updateSettings({ fontSize: value[0] })}
							/>
						</div>

						{/* Page config */}
						<div className="flex flex-col gap-2">
							<Text variant="subTitle1">{t("sys.settings.page")}</Text>
							<div className="flex items-center justify-between">
								<Text variant="subTitle2">{t("sys.settings.breadcrumb")}</Text>
								<Switch checked={breadCrumb} onCheckedChange={(checked) => updateSettings({ breadCrumb: checked })} />
								{/* <div className="flex items-center justify-between text-sm text-text-disabled">
									<div>{t("sys.settings.multiTab")}</div>
									<Switch checked={multiTab} onCheckedChange={(checked) => updateSettings({ multiTab: checked })} />
								</div> */}
								{/* <div className="flex items-center justify-between text-sm text-text-disabled">
									<div>{t("sys.settings.darkSidebar")}</div>
									<Switch checked={darkSidebar} onCheckedChange={(checked) => updateSettings({ darkSidebar: checked })} />
								</div> */}
								{/* <div className="flex items-center justify-between text-sm text-text-disabled">
									<div>{t("sys.settings.accordion")}</div>
									<Switch checked={accordion} onCheckedChange={(checked) => updateSettings({ accordion: checked })} />
								</div> */}
							</div>
						</div>
					</div>
				</ScrollArea>
				<SheetFooter className="px-6 py-4 border border-t shrink-0">
					<Button
						variant="outline"
						className="w-full border-dashed text-text-primary hover:border-primary hover:text-primary"
						onClick={toggleFullScreen}
					>
						<div
							className="flex items-center justify-center"
							aria-label={isFullscreen ? t("sys.settings.exitFullscreen") : t("sys.settings.fullscreen")}
						>
							{isFullscreen ? (
								<>
									<Minimize2 className="size-5" strokeWidth={2} aria-hidden="true" />
									<span className="ml-2">{t("sys.settings.exitFullscreen")}</span>
								</>
							) : (
								<>
									<Maximize2 className="size-5" strokeWidth={2} aria-hidden="true" />
									<span className="ml-2">{t("sys.settings.fullscreen")}</span>
								</>
							)}
						</div>
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
