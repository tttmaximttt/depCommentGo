const _ = require('lodash');

module.exports = ({ config, generalConstants }) => {
  // consul-template renders configs as strings
  const crossEditorEnabled = String(config.crossEditor.enable) === 'true';
  const getHost = url => _.get(url.match(/https?:\/\/[^/]+\//), '[0]');
  const defaultMapper = {
    mapHost: url => url,
  };

  if (!crossEditorEnabled) {
    return defaultMapper;
  }

  if (config.app === generalConstants.PDF_FILLER) {
    return {
      ...defaultMapper,
      mapHost(url, host) {
        if (!host) return url;

        return url.replace(getHost(url), getHost(host));
      },
    };
  }

  if (config.app === generalConstants.AIR_SLATE) {
    return {
      ...defaultMapper,
      mapHost(url, host) {
        if (!host) return url;

        const hosts = config.crossEditor.airSlateHosts;
        const matchedHost = _(hosts).keys().find(key => host.match(key));
        const internalHost = matchedHost ? host.replace(matchedHost, hosts[matchedHost]) : host;

        return url.replace(getHost(url), getHost(internalHost));
      },
    };
  }

  return defaultMapper;
};
