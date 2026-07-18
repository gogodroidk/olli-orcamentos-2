// TOKENS DE FONTE — dado puro, sem NENHUM import.
// Mantenha assim: o painel web (webapp/) acaba compilando este arquivo através
// da cadeia de código compartilhado (gerador de PDF + tipos de domínio). Um
// import de 'react-native' aqui quebra o build do painel, que não tem esses
// tipos. O patch de runtime que precisa do RN mora em `aplicarFontPatch.ts`.
//
// CORPO = RUBIK. Landing (`web/src/styles/global.css:8`) e painel
// (`webapp/src/global.css:16`) já são `@fontsource-variable/rubik`; o app era o
// único ainda em Plus Jakarta, então o eixo "fonte" — que era o ÚNICO já
// convergido entre as três pontas — estava 2×1. Aqui ele fecha em 3×0.
// O dono achou a letra anterior "estranha" e pediu mais arredondada: a Rubik
// arredonda os cantos das hastes sobre um esqueleto de grotesca robusta, ou
// seja, arredonda SEM afinar o traço — que é o que segura número de dinheiro e
// texto pequeno lido a braço estendido, no sol.
//
// As CHAVES abaixo não mudam de nome de propósito. `aplicarFontPatch` mapeia
// fontWeight → chave, então trocar só os VALORES reveste os ~92 arquivos que
// desenham texto sem tocar em nenhum deles.
//
// SERIFADA CONTINUA SPECTRAL — e isso não é dívida. O painel também manteve
// (`webapp/src/theme/tokens/typography.ts:30` e `webapp/src/global.css:21-22`);
// quem largou Spectral foi só a landing, e por um motivo que não vale para o
// app: lá a família estava declarada e não era usada por página nenhuma (~45 kB
// baixados à toa). No app ela é usada de verdade, em valor R$. App = painel.
export const Fonts = {
  regular: 'Rubik_400Regular',
  medium: 'Rubik_500Medium',
  semiBold: 'Rubik_600SemiBold',
  bold: 'Rubik_700Bold',
  extraBold: 'Rubik_800ExtraBold',
  // Serifada (Spectral) — valores R$ e títulos de destaque
  serifSemiBold: 'Spectral_600SemiBold',
  serifBold: 'Spectral_700Bold',
};
