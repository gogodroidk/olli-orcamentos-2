const {
  withAppBuildGradle,
  withGradleProperties,
  createRunOncePlugin,
} = require('@expo/config-plugins');

/**
 * AJUSTES DO GRADLE PARA O BUILD DE RELEASE (Windows, `C:\OLLI_REL`).
 *
 * Antes deste plugin, depois de cada `expo prebuild --clean` alguém precisava
 * lembrar de dois patches à mão (memória "Build APK OLLI no Windows"); esquecer =
 * build de ~1 h que morre no fim:
 *  1. `org.gradle.jvmargs` — o padrão (512m) estoura Metaspace no R8/lint;
 *  2. `lint { checkReleaseBuilds false }` — o lint de release também estoura
 *     memória e não é o gate de qualidade deste projeto (o gate é tsc + testes).
 * Agora o prebuild já sai certo. Idempotente: rodar o prebuild de novo não
 * duplica nada (marcador `OLLI_GRADLE_RELEASE_TWEAKS_V1`).
 */
const MARCADOR = 'OLLI_GRADLE_RELEASE_TWEAKS_V1';
const JVMARGS = '-Xmx4096m -XX:MaxMetaspaceSize=1536m';

/** Troca (ou cria) `org.gradle.jvmargs` na lista de propriedades do Expo. */
function aplicarJvmArgs(propriedades) {
  const resto = propriedades.filter((p) => !(p.type === 'property' && p.key === 'org.gradle.jvmargs'));
  return [...resto, { type: 'property', key: 'org.gradle.jvmargs', value: JVMARGS }];
}

/** Põe o bloco `lint` logo na abertura de `android {` do app/build.gradle. */
function aplicarLint(gradle) {
  if (gradle.includes(MARCADOR)) return gradle;
  const abertura = /^android\s*\{[ \t]*$/m.exec(gradle);
  if (!abertura) throw new Error('OLLI: não encontrei o bloco android { no app/build.gradle');
  const fim = abertura.index + abertura[0].length;
  const bloco =
    `\n    // ${MARCADOR}: aplicado pelo plugins/withGradleReleaseTweaks.js.\n` +
    '    lint {\n' +
    '        checkReleaseBuilds false\n' +
    '        abortOnError false\n' +
    '    }';
  return `${gradle.slice(0, fim)}${bloco}${gradle.slice(fim)}`;
}

function withGradleReleaseTweaks(config) {
  config = withGradleProperties(config, (modConfig) => {
    modConfig.modResults = aplicarJvmArgs(modConfig.modResults);
    return modConfig;
  });
  config = withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new Error('OLLI: withGradleReleaseTweaks só sabe editar app/build.gradle em Groovy');
    }
    modConfig.modResults.contents = aplicarLint(modConfig.modResults.contents);
    return modConfig;
  });
  return config;
}

module.exports = createRunOncePlugin(withGradleReleaseTweaks, 'with-gradle-release-tweaks', '1.0.0');
module.exports.aplicarLint = aplicarLint;
module.exports.aplicarJvmArgs = aplicarJvmArgs;
module.exports.MARCADOR = MARCADOR;
module.exports.JVMARGS = JVMARGS;
