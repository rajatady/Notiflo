const { composePlugins, withNx } = require('@nx/webpack');
const { join } = require('path');

module.exports = composePlugins(withNx(), (config) => {
  // Resolve 'engine-core' to the native addon's JS loader,
  // then externalize it so webpack emits a require() with the absolute path.
  // This lets Node.js load the .node binary at runtime.
  const engineCorePath = join(
    __dirname, '..', '..', 'libs', 'engine', 'engine-core', 'index.js'
  );

  config.externals = [
    ...(Array.isArray(config.externals) ? config.externals : config.externals ? [config.externals] : []),
    function ({ request }, callback) {
      if (request === 'engine-core') {
        return callback(null, `commonjs ${engineCorePath}`);
      }
      callback();
    },
  ];

  return config;
});
