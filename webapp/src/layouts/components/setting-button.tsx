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
import { Icon } from "@/components/icon";
import { type SettingsType, useSettingActions, useSettings } from "@/store/settingStore";
import { themeVars } from "@/theme/theme.css";
import { Button } from "@/ui/button";
import { ScrollArea } from "@/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/ui/sheet";
import { Slider } from "@/ui/slider";
import { Switch } from "@/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import { Text } from "@/ui/typography";
import { cn } from "@/utils";

type RadioOption<T extends string> = {
	value: T;
	label: string;
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
						aria-label={option.label}
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
							<Icon icon="carbon:checkmark-filled" size={14} className="absolute top-1 right-1 text-primary" />
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
				{/* "no escuro eu NÃO CONSIGO VER A ENGRENAGEM": o ic-setting.svg é
				    `fill="currentColor"`, e o variant ghost do Button não define cor de
				    texto nenhuma — a engrenagem herdava o preto padrão do navegador e
				    ficava em 1,11:1 sobre o navy. `text-text-primary` leva a 18,94:1 no
				    escuro e 15,51:1 no claro. min-h/w 44px = alvo de toque mínimo. */}
				<Button
					variant="ghost"
					size="icon"
					className="rounded-full min-h-[44px] min-w-[44px] text-text-primary motion-safe:hover:animate-slow-spin motion-safe:focus-visible:animate-slow-spin"
					aria-label="Configurações de aparência"
				>
					<Icon icon="local:ic-setting" size={24} />
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
											<Icon
												icon="local:ic-settings-mode-sun"
												size="24"
												color={themeMode === ThemeMode.Light ? themeVars.colors.palette.primary.default : ""}
											/>
										),
									},
									{
										value: ThemeMode.Dark,
										label: "Tema escuro",
										content: (
											<Icon
												icon="local:ic-settings-mode-moon"
												size="24"
												color={themeMode === ThemeMode.Dark ? themeVars.colors.palette.primary.default : ""}
											/>
										),
									},
								]}
							/>
						</div>

						{/* theme layout */}
						<div className="flex flex-col gap-2">
							<Text variant="subTitle1">{t("sys.settings.layout")}</Text>

							<SettingRadioGroup
								ariaLabel={t("sys.settings.layout")}
								value={themeLayout}
								onChange={(next) => updateSettings({ themeLayout: next })}
								containerClassName="grid grid-cols-3 gap-4"
								itemClassName="h-16 p-0"
								options={[
									{
										value: ThemeLayout.Vertical,
										label: "Layout vertical",
										className: "flex flex-row gap-1",
										content: (
											<>
												<div className="flex h-full w-5 flex-col gap-1 p-1">
													<div
														className="h-2 w-2 shrink-0 rounded"
														style={{
															background: layoutBackground(ThemeLayout.Vertical),
														}}
													/>
													<div
														className="h-1 w-full shrink-0 rounded opacity-50"
														style={{
															background: layoutBackground(ThemeLayout.Vertical),
														}}
													/>
													<div
														className="h-1 max-w-[12px] shrink-0 rounded opacity-20"
														style={{
															background: layoutBackground(ThemeLayout.Vertical),
														}}
													/>
												</div>
												<div className="h-full w-full flex-1 grow p-1 flex flex-col gap-1">
													<div
														className="w-full h-1.5 rounded opacity-20"
														style={{ background: layoutBackground(ThemeLayout.Vertical) }}
													/>
													<div
														className={cn(
															"flex-1 w-full rounded opacity-20 mx-auto transition-all duration-300 ease-in-out",
															!themeStretch && "w-10",
														)}
														style={{
															background: layoutBackground(ThemeLayout.Vertical),
														}}
													/>
												</div>
											</>
										),
									},
									{
										value: ThemeLayout.Mini,
										label: "Layout mini",
										className: "flex flex-row gap-0",
										content: (
											<>
												<div className="flex h-full w-3 gap-1 p-1 items-center flex-0 flex-col">
													<div
														className="h-2 w-2 shrink-0 rounded"
														style={{ background: layoutBackground(ThemeLayout.Mini) }}
													/>
													<div
														className="h-1 w-full shrink-0 rounded opacity-50"
														style={{ background: layoutBackground(ThemeLayout.Mini) }}
													/>
													<div
														className="h-1 w-full shrink-0 rounde opacity-20"
														style={{ background: layoutBackground(ThemeLayout.Mini) }}
													/>
												</div>
												<div className="h-full w-full flex-1 grow p-1 flex flex-col gap-1">
													<div
														className="w-full h-1.5 rounded opacity-20"
														style={{ background: layoutBackground(ThemeLayout.Mini) }}
													/>
													<div
														className={cn(
															"flex-1 w-full rounded opacity-20 mx-auto transition-all duration-300 ease-in-out",
															!themeStretch && "w-10",
														)}
														style={{
															background: layoutBackground(ThemeLayout.Mini),
														}}
													/>
												</div>
											</>
										),
									},
									{
										value: ThemeLayout.Horizontal,
										label: "Layout horizontal",
										className: "flex flex-row gap-0",
										content: (
											<>
												<div className="flex h-full w-full gap-1 p-1 items-center flex-0">
													<div
														className="h-2 w-2 shrink-0 rounded"
														style={{
															background: layoutBackground(ThemeLayout.Horizontal),
														}}
													/>
													<div
														className="h-1 w-4 shrink-0 rounded opacity-50"
														style={{
															background: layoutBackground(ThemeLayout.Horizontal),
														}}
													/>
													<div
														className="h-1 w-3 shrink-0 rounded opacity-20"
														style={{
															background: layoutBackground(ThemeLayout.Horizontal),
														}}
													/>
												</div>
												<div
													className="h-1.5 rounded opacity-20 mx-1"
													style={{ background: layoutBackground(ThemeLayout.Horizontal) }}
												/>
												<div className="h-full w-full flex-1 grow p-1 flex flex-col gap-1">
													<div
														className={cn(
															"h-full w-full rounded opacity-20 mx-auto transition-all duration-300 ease-in-out",
															!themeStretch && "w-10",
														)}
														style={{
															background: layoutBackground(ThemeLayout.Horizontal),
														}}
													/>
												</div>
											</>
										),
									},
								]}
							/>
							<div className="flex flex-row items-center justify-between">
								<Tooltip delayDuration={700} defaultOpen={false} disableHoverableContent>
									<TooltipTrigger>
										<Text variant="subTitle2">{t("sys.settings.stretch")}</Text>
										<Icon icon="solar:question-circle-linear" className="ml-1" />
									</TooltipTrigger>
									<TooltipContent>{t("sys.settings.stretchTip")}</TooltipContent>
								</Tooltip>
								<Switch
									checked={themeStretch}
									onCheckedChange={(checked) => updateSettings({ themeStretch: checked })}
								/>
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
									<Icon icon="local:ic-settings-exit-fullscreen" />
									<span className="ml-2">{t("sys.settings.exitFullscreen")}</span>
								</>
							) : (
								<>
									<Icon icon="local:ic-settings-fullscreen" />
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
