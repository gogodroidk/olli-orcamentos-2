const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  createRunOncePlugin,
} = require('@expo/config-plugins');

/**
 * BACKUP AUTOMÁTICO DO ANDROID SEM O BANCO DO APP.
 *
 * O Android copia dados do app para o Google Drive do usuário (Auto Backup) e
 * para o aparelho novo (transferência). O banco SQLite do OLLI (`files/SQLite`,
 * com clientes, orçamentos e recibos) NÃO pode ir junto: a cópia oficial desses
 * dados é a nuvem do OLLI (sincronização e backup próprios), e um banco velho
 * restaurado num aparelho novo brigaria com ela. A Segurança dos dados da Play
 * também fica mais simples de declarar.
 *
 * Como: regras com INCLUDE explícito — quando há `<include>`, só o que está
 * incluído vai para o backup. Entram apenas as preferências (`sharedpref`), menos
 * as do SecureStore (chaves cifradas que não sobrevivem a outro aparelho — mesma
 * exclusão que o `expo-secure-store` fazia). Ficam de fora o SQLite
 * (`files/SQLite`), o AsyncStorage (`databases/`) e todo o resto.
 *
 * O `expo-secure-store` é configurado com `configureAndroidBackup: false` no
 * app.json para não disputar estes atributos do manifesto.
 */
const ARQ_BACKUP = 'olli_backup_rules';
const ARQ_EXTRACAO = 'olli_data_extraction_rules';

const REGRAS = `  <include domain="sharedpref" path="."/>
  <exclude domain="sharedpref" path="SecureStore"/>`;

const XML_BACKUP = `<?xml version="1.0" encoding="utf-8"?>
<!-- Auto Backup (Android 11 e anteriores). Gerado por plugins/withBackupSemBanco.js:
     só as preferências; o banco SQLite do OLLI fica de fora por não estar incluído. -->
<full-backup-content>
${REGRAS}
</full-backup-content>
`;

const XML_EXTRACAO = `<?xml version="1.0" encoding="utf-8"?>
<!-- Backup e transferência (Android 12+). Gerado por plugins/withBackupSemBanco.js:
     só as preferências; o banco SQLite do OLLI fica de fora por não estar incluído. -->
<data-extraction-rules>
  <cloud-backup>
${REGRAS.replace(/^/gm, '  ')}
  </cloud-backup>
  <device-transfer>
${REGRAS.replace(/^/gm, '  ')}
  </device-transfer>
</data-extraction-rules>
`;

function withBackupSemBanco(config) {
  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const pasta = path.join(modConfig.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(pasta, { recursive: true });
      fs.writeFileSync(path.join(pasta, `${ARQ_BACKUP}.xml`), XML_BACKUP);
      fs.writeFileSync(path.join(pasta, `${ARQ_EXTRACAO}.xml`), XML_EXTRACAO);
      return modConfig;
    },
  ]);
  config = withAndroidManifest(config, (modConfig) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(modConfig.modResults);
    app.$['android:allowBackup'] = 'true';
    app.$['android:fullBackupContent'] = `@xml/${ARQ_BACKUP}`;
    app.$['android:dataExtractionRules'] = `@xml/${ARQ_EXTRACAO}`;
    return modConfig;
  });
  return config;
}

module.exports = createRunOncePlugin(withBackupSemBanco, 'with-backup-sem-banco', '1.0.0');
module.exports.XML_BACKUP = XML_BACKUP;
module.exports.XML_EXTRACAO = XML_EXTRACAO;
