import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { Progress } from "@/ui/progress";

export function RouteLoadingProgress() {
	const [progress, setProgress] = useState(0);
	const location = useLocation();
	const isFirstRun = useRef(true);

	useEffect(() => {
		// Não mostra a barra no carregamento inicial da página, só nas trocas de rota.
		if (isFirstRun.current) {
			isFirstRun.current = false;
			return;
		}

		setProgress(0);
		let currentProgress = 0;

		const interval = setInterval(() => {
			currentProgress += 20;
			setProgress(Math.min(currentProgress, 90));
		}, 50);

		const finishTimer = setTimeout(() => {
			clearInterval(interval);
			setProgress(100);
		}, 400);

		const resetTimer = setTimeout(() => setProgress(0), 500);

		return () => {
			clearInterval(interval);
			clearTimeout(finishTimer);
			clearTimeout(resetTimer);
		};
	}, [location.pathname, location.search]);

	return progress > 0 ? (
		<div className="fixed top-0 left-0 right-0 z-tooltip w-screen">
			<Progress value={progress} className="h-[3px] shadow-2xl transition-all duration-150 ease-out" />
		</div>
	) : null;
}
