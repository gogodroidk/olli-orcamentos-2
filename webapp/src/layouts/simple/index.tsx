import type React from "react";
import HeaderSimple from "../components/header-simple";

type Props = {
	children: React.ReactNode;
};
export default function SimpleLayout({ children }: Props) {
	return (
		// `text-text-base` e `bg-bg` NÃO EXISTEM como classes (o tailwind.config
		// gera `text-text-primary/secondary/disabled` e `bg-bg-default/paper/neutral`).
		// Eram no-op: este layout ficava sem cor de texto e herdava o preto padrão
		// do navegador — mesmo bug do painel, ver layouts/dashboard/index.tsx.
		<div className="flex h-screen w-full flex-col bg-background text-foreground">
			<HeaderSimple />
			{children}
		</div>
	);
}
