const { isEmpty, isNumber } = require('lodash');
const fp = require('lodash/fp');
const logSystemConstants = require('./constants');
const request = require('request');

const parser = { // TODO move somewhere
  parseUid(uid) {
    const [
      viewerId = null, projectId = null, socketId = null, uidTimestamp = null,
    ] = uid.split('_');

    return { viewerId, projectId, socketId, uidTimestamp };
  },

  prepareMeta(meta) {
    const { uid = '' } = meta;

    if (!meta.projectId && !meta.viewerId) {
      return Object.assign(meta, this.parseUid(uid));
    }

    return meta;
  },
};

const validator = { // TODO move somewhere
  _getUid(meta) {
    return meta && meta.uid;
  },

  _excluded(point) {
    return [
      this.constantsEvents.SYSTEM_ERROR,
      this.constantsEvents.UNCAUGHT_EXCEPTION,
      this.constantsEvents.REST_INCOMING_REQUEST,
      this.constantsEvents.UNHANDLED_REJECTION,
      this.constantsEvents.INTERNAL_SCRIPT_ERROR,
      this.constantsEvents.API_RESPONSE_TIME,
      this.constantsEvents.IMAGE_WRONG_OWNER,
      this.constantsEvents.SYSTEM_MESSAGE_HANDLED,
      this.constantsEvents.CONVERTER_SERVICE_FLOW,
      this.constantsEvents.SEND_QUEUE_CLOSE_MSG,
      this.constantsEvents.API_REQUEST,
      this.constantsEvents.API_RESPONSE,
      this.constantsEvents.SIGINT,
      this.constantsEvents.SYSTEM_MESSAGE,
      this.constantsEvents.MESSAGING_NEW_PROJECT,
      this.constantsEvents.MESSAGING_PROJECT_CLOSE,
      this.constantsEvents.MESSAGING_QUEUE_CREATED,
      this.constantsEvents.API_ERROR,
      this.constantsEvents.MESSAGING_QUEUE_REMOVED,
      this.constantsEvents.SERVICE_STARTED,
    ].includes(point);
  },

  _hasUid(data) {
    return this._getUid(data) || data.projectId || data.viewerId;
  },

  _validateLogData(lvl, point, data) {
    return lvl && !isEmpty(data);
  },

  _trimData(data) {
    return fp.has('operations')(data)
      ? fp.flow(
          fp.set('operationsNumber', data.operations.length),
          fp.omit(['operations'])
        )(data)
      : data;
  },

  log(target, name) {
    const { TIME_KEY, POINT_KEY, INVALID_ARGUMENTS } = target.constants;

    return ({ lvl, point, data = {} }) => {
      if (!target.fullLog && lvl !== logSystemConstants.ACTIVITY) {
        data = this._trimData(data);
      }

      if (!this._validateLogData(lvl, point, data)) {
        target.error(
          logSystemConstants.INVALID_PARAMS_MSG,
          { lvl, point, data: { ...data, [TIME_KEY]: Date.now(), [POINT_KEY]: point } }
        );

        return { error: INVALID_ARGUMENTS };
      }

      data = {
        ...data,
        [TIME_KEY]: Date.now(),
      };

      if (lvl === logSystemConstants.DEBUG || lvl === logSystemConstants.METRICS) {
        return target[name]({ lvl, point, data });
      }

      if (this._hasUid(data) || this._excluded.call(target, point)) {
        return target[name]({ lvl, point, data: parser.prepareMeta(data) });
      }

      const msg = (`${logSystemConstants.LOG_ERROR} in ${point}
        Not found uid in ${lvl} log level data,
        probably you should chose debug logging level.`).replace(/\s+/g, ' ');

      return target.error(msg, { lvl, point, data });
    };
  },
};

const handler = { // TODO move somewhere
  get(target, name) {
    if (typeof validator[name] === 'function') {
      return validator[name](target, name);
    }
    return target[name];
  },
};

module.exports = class LogSystem {

  /**
   * @param {Object} config
   * @param {Metrics} metrics
   * @param {Object} constantsEvents
   */
  constructor({ logger, config, constantsEvents, timing, metrics }) {
    this.metricsPoints = config.LogSystem.metricsPoints;
    this.metricsKeyMaxTime = config.LogSystem.metricsKeyMaxTime;
    this.longSessionTime = config.LogSystem.longSessionTime;
    this.shortSessionTime = config.LogSystem.shortSessionTime;
    this.logSessionDuration = config.LogSystem.logSessionDuration;
    this.fullLog = config.LogSystem.fullLog;

    this.kibanaLogger = logger;
    this.constants = logSystemConstants;
    this.constantsEvents = constantsEvents;
    this.timing = timing;
    this.metric = metrics;
    this.config = config;

    this.rabbitMessageTimePoints = [
      constantsEvents.AUTH_INPUT,
      constantsEvents.AUTH_OUTPUT,
      constantsEvents.OPERATIONS_INPUT,
      constantsEvents.OPERATIONS_OUTPUT,
      constantsEvents.DESTROY_INPUT,
      constantsEvents.DESTROY_OUTPUT,
    ];

    this._startFileRotateInterval(this.kibanaLogger, config.LogSystem);

    return new Proxy(this, handler);
  }

  _startFileRotateInterval(loggerInstance, { path, nameTemplate, rotateInterval }) {
    loggerInstance.updateFileLoggers(path, nameTemplate);

    setInterval(() => loggerInstance.updateFileLoggers(path, nameTemplate), rotateInterval);
  }

  /**
   * @param {String} lvl
   * @param {String} point
   * @param {Object} data
   */
  log({ lvl, point, data }) {
    this.kibanaLogger[lvl](point, data);
  }

  onRabbitMessage() {
    this.metric.rabbitMessage();
  }

  logSession(start, end, meta = {}) {
    const result = end - start;
    /**
     *
     * start - start session time
     * end - end session time
     * result - subtraction result
     * this.longSessionTime - long session time constant
     * this.logSessionDuration
     * @type {*|boolean}
     */
    const expression = start &&
      end &&
      isNumber(result) &&
      result >= this.longSessionTime &&
      this.logSessionDuration;

    if (expression) {
      this.warning(this.constants.LONG_SESSION, meta);
    }

    this.metric.sessionEnd(isNumber(result) ? result : null);
  }

  /**
   * @param {Object} data
   */
  logToStatsService(data) {
    const body = {};
    const { name, BUILD_ID, BUILD_BRANCH } = data;
    const { restSecureKey, logger } = this.config;
    const { statsServiceOrigin } = this.config.LogSystem;
    const env = (logger && logger.env) || 'local';

    if (!statsServiceOrigin) return false;

    body[name] = `${BUILD_BRANCH}:${BUILD_ID}`;

    const options = {
      method: 'POST',
      uri: `${statsServiceOrigin}/info/${env}?token=${restSecureKey}`,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    };

    request(options, err => this.error('STATS_LOG', { body, err }));
  }

  /**
   * @param {String} point
   * @param {Object} data
   */
  info(point, data) {
    return this.log({ lvl: this.constants.INFO, point, data });
  }

  /**
   * @param {String} point
   * @param {Object} data
   */
  crit(point, data) {
    this.metric.increment(`${this.constants.CRIT}`);
    return this.log({ lvl: this.constants.CRIT, point, data });
  }

  /**
   * @param {String} point
   * @param {Object} data
   */
  start(point, data) {
    this.metric.serviceStartedEvent(data);
    this.logToStatsService(data);
    return this.info(point, data);
  }

  /**
   * @param {String} point
   * @param {Object} data
   */
  debug(point, data) {
    return this.log({ lvl: this.constants.DEBUG, point, data });
  }

  /**
   * @param {String} point
   * @param {Object} data
   */
  warning(point, data) {
    this.metric.warning();
    return this.log({ lvl: this.constants.WARN, point, data });
  }

  /**
   * @param {String} point
   * @param {Object} data
   */
  error(point, data) {
    this.metric.error();
    return this.log({ lvl: this.constants.ERROR, point, data });
  }
};
