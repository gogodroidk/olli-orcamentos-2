import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { LocalEnum } from "#/enum";
import pt_BR from "./lang/pt_BR";

/**
 * O painel é pt-BR e só pt-BR.
 *
 * Antes existia um seletor de idioma (pt/en) herdado do template slash-admin.
 * Ele NÃO funcionava: as 39 telas de produto do OLLI (~12.000 linhas) têm o
 * texto em português escrito direto no JSX — ZERO chamadas de t(). As únicas
 * ~120 chaves traduzidas são do "chrome" do template (login, erros de API,
 * busca, migalha de pão). Trocar pra inglês entregava um Frankenstein: botão
 * de login em inglês e o produto inteiro em português. Até o menu lateral
 * ficava em português, porque os títulos são literais ("Início", "Orçamentos")
 * passados por t() — sem chave correspondente, o i18next devolve o próprio
 * literal.
 *
 * Um controle que não funciona é pior que controle nenhum: quebra a confiança
 * no resto do produto. E o público do OLLI é prestador de serviço BRASILEIRO —
 * traduzir CPF/CNPJ, Pix e nota fiscal pro inglês não tem cliente do outro lado.
 * Por isso o seletor saiu e o idioma é fixo.
 *
 * O i18next continua vivo (não é enfeite): as ~120 chaves de `chrome` acima
 * ainda passam por t() em login, apiClient, busca e migalha de pão. Só que
 * agora com um idioma só.
 */
const LNG = LocalEnum.pt_BR as string;

// Marca o idioma no HTML. Sem isto o Chrome oferece "traduzir esta página"
// quando o idioma do sistema é outro.
document.documentElement.lang = LNG;

i18n.use(initReactI18next).init({
	debug: false,
	lng: LNG,
	fallbackLng: LNG,
	// Sem LanguageDetector de propósito. Ele lia `i18nextLng` do localStorage —
	// então quem tivesse trocado pro inglês algum dia ficaria PRESO no inglês
	// mesmo depois de o seletor sumir, porque o valor gravado continua lá.
	// Fixar o idioma aqui conserta esse estado sozinho, sem pedir nada ao usuário.
	interpolation: {
		escapeValue: false, // not needed for react as it escapes by default
	},
	resources: {
		pt_BR: { translation: pt_BR },
	},
});

export const { t } = i18n;
export default i18n;
