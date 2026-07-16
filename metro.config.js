// Learn more https://docs.expo.io/guides/customizing-metro
// getSentryExpoConfig substitui o getDefaultConfig: ele e o getDefaultConfig do Expo
// + o serializer que injeta o Debug ID no bundle. Sem isso, o source map do Hermes
// nao casa com o stack trace e o erro chega ilegivel no Sentry.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname);

config.resolver.assetExts.push('wasm');

config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    return middleware(req, res, next);
  };
};

module.exports = config;
