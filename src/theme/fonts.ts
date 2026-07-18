// TOKENS DE FONTE — dado puro, sem NENHUM import.
// Mantenha assim: o painel web (webapp/) acaba compilando este arquivo através
// da cadeia de código compartilhado (gerador de PDF + tipos de domínio). Um
// import de 'react-native' aqui quebra o build do painel, que não tem esses
// tipos. O patch de runtime que precisa do RN mora em `aplicarFontPatch.ts`.
export const Fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extraBold: 'PlusJakartaSans_800ExtraBold',
  // Serifada (Spectral) — valores R$ e títulos de destaque
  serifSemiBold: 'Spectral_600SemiBold',
  serifBold: 'Spectral_700Bold',
};
