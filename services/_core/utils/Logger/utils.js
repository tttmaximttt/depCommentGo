const config = require('config');
const fs = require('fs');
const winston = require('winston');
const _ = require('lodash');

const loggerConfig = Object.assign({}, config.logger, { service: process.env.name });

function getContainerId() {
  try {
    const data = fs.readFileSync('/proc/self/cgroup', 'utf8');
    const lines = data.split('\n');
    const lineWithId = lines.find(l => l.indexOf('docker/') > -1);

    if (lineWithId) return lineWithId.split('docker/').pop();
  } catch (e) {
    // do nothing
  }

  return false;
}


let metaPropertiesName = 'context';

function formatter(options, toJSON = true) {
  const formattedData = {
    app: config.app,
    level_name: options.level,
    channel: config.channel,
    datetime: new Date().toISOString(),
    message: options.message,
  };

  if (options.meta) {
    if (options.meta.channel) {
      formattedData.channel = options.meta.channel;
      metaPropertiesName = 'meta_context';
      delete options.meta.channel;
    }

    formattedData[metaPropertiesName] = {};

// eslint-disable-next-line no-restricted-syntax, guard-for-in
    for (const metaDataName in options.meta) {
      const metaData = options.meta[metaDataName];

      if (typeof metaData === 'object') {
        formattedData[metaPropertiesName][metaDataName] = JSON.stringify(metaData);
      } else {
        formattedData[metaPropertiesName][metaDataName] = metaData;
      }
    }
  }

  return toJSON ? JSON.stringify(formattedData) : formattedData;
}

const utilityMethods = {
  renderFileName(dirname, template) {
    const rawDate = new Date();
    const [year, month, day, hours] = [
      rawDate.getFullYear(),
      rawDate.getMonth(),
      rawDate.getDate(),
      rawDate.getHours(),
    ];
    const date = `${year}-${month + 1}-${day}-${hours}`;
    const filename = template
      .replace(/\[env\.NAME\]/gi, process.env.NAME || 'local')
      .replace(/\[env\.HOSTNAME\]/gi, process.env.HOSTNAME || 'local')
      .replace(/\[CONTAINER_ID]/gi, getContainerId() || 'local')
      .replace(/\[TIMESTAMP\]/gi, date);

    return `${dirname}/${filename}`;
  },

  replaceTransport(oldTransportName, newTransportName, transportOptions) {
    if (this.transports[oldTransportName]) {
      this.remove(this.transports[oldTransportName]);
    }

    if (transportOptions.formatter) {
      transportOptions.formatter = formatter;
    }

    this.add(winston.transports[newTransportName], transportOptions);
  },

  replaceExceptionHandler(oldTransportName, newTransportName, transportOptions) {
    delete this.exceptionHandlers[oldTransportName];

    if (transportOptions.formatter) {
      transportOptions.formatter = formatter;
    }

    this.exceptionHandlers[oldTransportName] =
      new winston.transports[newTransportName](transportOptions);
  },

  updateFileLoggers(dirname, filename) {
    if (loggerConfig.transports.File) {
      this.replaceTransport(
        'file',
        'File',
        _.set(
          loggerConfig.transports.File,
          'filename',
          this.renderFileName(dirname, filename)
        )
      );
    }
    if (loggerConfig.exceptionHandlers.File) {
      this.replaceExceptionHandler(
        'file',
        'File',
        _.set(
          loggerConfig.exceptionHandlers.File,
          'filename',
          this.renderFileName(dirname, `err-${filename}`)
        )
      );
    }
  },
};

module.exports = {
  utilityMethods,
  formatter,
};
