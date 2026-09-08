const {
  withAppBuildGradle,
  createRunOncePlugin,
} = require('@expo/config-plugins');

const MARKER = 'OLLI_RELEASE_SIGNING_GUARD_V1';

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  throw new Error('OLLI: bloco Gradle sem fechamento');
}

function findBlock(source, expression, from = 0) {
  const match = expression.exec(source.slice(from));
  if (!match) return null;
  const openIndex = from + match.index + match[0].lastIndexOf('{');
  return {
    start: from + match.index,
    openIndex,
    end: findMatchingBrace(source, openIndex),
  };
}

const SIGNING_READY = `
def olliReleaseSigningReady = [
    'OLLI_UPLOAD_KEYSTORE_PATH',
    'OLLI_UPLOAD_KEYSTORE_ALIAS',
    'OLLI_UPLOAD_KEYSTORE_PASSWORD',
    'OLLI_UPLOAD_KEY_PASSWORD',
].every { System.getenv(it) }
`;

const RELEASE_SIGNING = `
        release {
            if (olliReleaseSigningReady) {
                storeFile file(System.getenv('OLLI_UPLOAD_KEYSTORE_PATH'))
                storePassword System.getenv('OLLI_UPLOAD_KEYSTORE_PASSWORD')
                keyAlias System.getenv('OLLI_UPLOAD_KEYSTORE_ALIAS')
                keyPassword System.getenv('OLLI_UPLOAD_KEY_PASSWORD')
            } else {
                // Debug fallback is only for configuration of device builds;
                // the task-graph guard below rejects every release task.
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }
`;

const RELEASE_GUARD = `
// ${MARKER}: debug/device builds do not need production credentials, while
// release artifacts remain fail-closed until the owner configures a keystore.
gradle.taskGraph.whenReady { taskGraph ->
    def releaseTaskRequested = taskGraph.allTasks.any { task ->
        task.name.toLowerCase().contains('release')
    }
    if (releaseTaskRequested && !olliReleaseSigningReady) {
        throw new GradleException('A assinatura de producao do OLLI nao esta configurada no ambiente.')
    }
}
`;

function withReleaseSigningGuard(config) {
  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new Error('OLLI: o build.gradle do Android precisa estar em Groovy');
    }

    let contents = modConfig.modResults.contents;
    if (contents.includes(MARKER)) return modConfig;

    if (!contents.includes('def olliReleaseSigningReady')) {
      const minifyLine = contents.match(/def enableMinifyInReleaseBuilds[^\n]*\n/);
      if (!minifyLine || minifyLine.index == null) {
        throw new Error('OLLI: não encontrei o ponto de configuração de minify do Expo');
      }
      const end = minifyLine.index + minifyLine[0].length;
      contents = `${contents.slice(0, end)}${SIGNING_READY}${contents.slice(end)}`;
    }

    const signing = findBlock(contents, /signingConfigs\s*\{/g);
    if (!signing) throw new Error('OLLI: não encontrei signingConfigs no build.gradle');
    const signingBody = contents.slice(signing.openIndex + 1, signing.end);
    const releaseConfig = findBlock(signingBody, /\brelease\s*\{/g);
    if (releaseConfig) {
      const absoluteStart = signing.openIndex + 1 + releaseConfig.start;
      const absoluteEnd = signing.openIndex + 1 + releaseConfig.end + 1;
      contents = `${contents.slice(0, absoluteStart)}${contents.slice(absoluteEnd)}`;
    }

    const signingAfterRemoval = findBlock(contents, /signingConfigs\s*\{/g);
    contents = `${contents.slice(0, signingAfterRemoval.end)}${RELEASE_SIGNING}${contents.slice(signingAfterRemoval.end)}`;

    const buildTypes = findBlock(contents, /buildTypes\s*\{/g);
    if (!buildTypes) throw new Error('OLLI: não encontrei buildTypes no build.gradle');
    const buildBody = contents.slice(buildTypes.openIndex + 1, buildTypes.end);
    const releaseType = findBlock(buildBody, /\brelease\s*\{/g);
    if (!releaseType) throw new Error('OLLI: não encontrei buildTypes.release no build.gradle');
    const releaseTypeStart = buildTypes.openIndex + 1 + releaseType.start;
    const releaseTypeEnd = buildTypes.openIndex + 1 + releaseType.end + 1;
    let releaseBody = contents.slice(releaseTypeStart, releaseTypeEnd);
    releaseBody = releaseBody.replace(/\n\s*if\s*\(!olliReleaseSigningReady\)\s*\{[\s\S]*?\}\s*/m, '\n');
    releaseBody = releaseBody.replace(/\n\s*signingConfig\s+signingConfigs\.debug\s*/g, '\n');
    if (!/signingConfig\s+signingConfigs\.release/.test(releaseBody)) {
      releaseBody = releaseBody.replace(/(\brelease\s*\{)/, '$1\n            signingConfig signingConfigs.release');
    }
    contents = `${contents.slice(0, releaseTypeStart)}${releaseBody}${contents.slice(releaseTypeEnd)}`;

    if (contents.includes('gradle.taskGraph.whenReady')) {
      if (!contents.includes(MARKER)) {
        const existingComment = '// Do not make debug/device builds depend on production credentials, but\n';
        if (contents.includes(existingComment)) {
          contents = contents.replace(existingComment, `// ${MARKER}: applied by the Expo config plugin.\n`);
        } else {
          contents = contents.replace(
            'gradle.taskGraph.whenReady',
            `// ${MARKER}: applied by the Expo config plugin.\ngradle.taskGraph.whenReady`,
          );
        }
      }
    } else {
      const android = findBlock(contents, /\bandroid\s*\{/g);
      if (!android) throw new Error('OLLI: não encontrei o bloco android no build.gradle');
      contents = `${contents.slice(0, android.end + 1)}${RELEASE_GUARD}${contents.slice(android.end + 1)}`;
    }

    modConfig.modResults.contents = contents;
    return modConfig;
  });
}

module.exports = createRunOncePlugin(
  withReleaseSigningGuard,
  'with-release-signing-guard',
  '1.0.0',
);
