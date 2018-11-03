const config = require('config');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const Mail = require('winston-mail').Mail;
const _ = require('lodash');

const Slack = require('./transports/Slack');
const Activity = require('./transports/Activity');
const Metrics = require('./transports/Metrics');
const { utilityMethods, formatter } = require('./utils');

const logSystemConstants = require(
  `${config.paths.ROOT}/services/_core/utils/LogSystem/constants.js`
);

const defaultLevelsConfig = [
  { name: logSystemConstants.CRIT, color: 'red' },
  { name: logSystemConstants.ERROR, color: 'red' },
  { name: logSystemConstants.WARN, color: 'yellow' },
  { name: logSystemConstants.INFO, color: 'blue' },
  { name: logSystemConstants.ACTIVITY, color: 'green' },
  { name: logSystemConstants.METRICS, color: 'green' },
  { name: logSystemConstants.DEBUG, color: 'magenta' },
];

class Logger {
  /**
   *
   * @param exceptionHandlersConfig
   * @returns {Array}
   * @private
   */
  static _prepareExceptionHandler(exceptionHandlersConfig) {
    const exceptionHandlers = [];
    const keys = Object.keys(exceptionHandlersConfig);

    keys.forEach((exceptionHandlerName) => {
      const exceptionHandlerOptions = exceptionHandlersConfig[exceptionHandlerName];

      if (exceptionHandlerOptions.enable) {
        delete exceptionHandlerOptions.enable;
        if (exceptionHandlerOptions.formatter) {
          exceptionHandlerOptions.formatter = formatter;
        } else {
          delete exceptionHandlerOptions.formatter;
        }
        exceptionHandlers.push(
          new winston.transports[exceptionHandlerName](exceptionHandlerOptions)
        );
      }
    });

    return exceptionHandlers;
  }

  /**
   *
   * @param transportsConfig
   * @param levels
   * @returns {Array}
   * @private
   */
  static _prepareTransports(transportsConfig) {
    Object.assign(winston.transports, {
      Mail,
      Slack,
      DailyRotateFile,
      Activity,
      Metrics,
    });
    const transports = [];
    const keys = Object.keys(transportsConfig);

    keys.forEach((key) => {
      const transportOptions = transportsConfig[key];

      if (transportOptions.enable) {
        delete transportOptions.enable;
        if (transportOptions.formatter) {
          transportOptions.formatter = formatter;
        } else {
          delete transportOptions.formatter;
        }
        transports.push(new winston.transports[key](transportOptions));
      }
    });

    return transports;
  }

  /**
   *
   * @param levelsConfig
   * @returns {{}}
   * @private
   */
  static _setupLogLevels(levelsConfig) {
    const levels = {};
    const colors = {};

    levelsConfig.forEach((item, index) => {
      levels[item.name] = index;
      colors[item.name] = item.color;
    });

    winston.addColors(colors);

    return levels;
  }

  constructor(options) {
    this.level = 'debug';
    this.options = options;
  }

  init() {
    const { level, options } = this;
    const levels = Logger._setupLogLevels(options.levels || defaultLevelsConfig);
    const transports = Logger._prepareTransports(options.transports);
    const exceptionHandlers = Logger._prepareExceptionHandler(options.exceptionHandlers);

    const logger = new winston.Logger({
      level,
      levels,
      transports,
      exceptionHandlers,
      exitOnError: options.exitOnError,
    });

    return logger;
  }
}

module.exports = (injector) => {
  const loggerConfig = Object.assign({}, config.logger, { service: process.env.name });
  const logger = new Logger(_.omit(loggerConfig, ['transports.File', 'exceptionHandlers.File']));

  if (injector) {
    winston.transports.Activity.setup(injector); // only for transports that
    winston.transports.Metrics.setup(injector); // needed dependencies from awilix
  }

  return Object.assign(
    logger.init(),
    utilityMethods
  );
};
