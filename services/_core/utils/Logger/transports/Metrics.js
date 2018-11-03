const config = require('config');
const Transport = require('winston-transport');

const logSystemConstants = require(
  `${config.paths.ROOT}/services/_core/utils/LogSystem/constants.js`
);
const constEvents = require(
  `${config.paths.ROOT}/services/_core/constants/ConstantsEvents`
)();
const timing = require(
  `${config.paths.ROOT}/services/_core/utils/Timing`
)();

class MetricsTransport extends Transport {
  /**
   *
   * @param metrics
   * @param constantsEvents
   */
  static setup({ metrics = null, constantsEvents }) {
    MetricsTransport.metrics = metrics;
    MetricsTransport.constantsEvents = constantsEvents;
  }

  constructor(opts) {
    super(opts);

    this.name = 'metrics';
    this.metrics = MetricsTransport.metrics;
    this.constants = logSystemConstants;
    this.metricsKeyMaxTime = config.LogSystem.metricsKeyMaxTime;
    this.rabbitMessageTimePoints = [
      constEvents.AUTH_INPUT,
      constEvents.AUTH_OUTPUT,
      constEvents.OPERATIONS_INPUT,
      constEvents.OPERATIONS_OUTPUT,
      constEvents.DESTROY_INPUT,
      constEvents.DESTROY_OUTPUT,
    ];

    this.constantsEvents = MetricsTransport.constantsEvents || constEvents;
  }

  /**
   *
   * @param point
   * @param data
   * @returns {*}
   * @private
   */
  _rabbitMessageTime(point, data) {
    const { metrics, constantsEvents } = this;
    const { uid } = data;
    const {
      AUTH_INPUT,
      AUTH_OUTPUT,
      OPERATIONS_INPUT,
      OPERATIONS_OUTPUT,
      DESTROY_INPUT,
      DESTROY_OUTPUT,
    } = constantsEvents;

    if (!uid) return;

    const timingTag = `${point.split('_').shift()}_${uid}`;

    if ([AUTH_INPUT, OPERATIONS_INPUT, DESTROY_INPUT].includes(point)) {
      return timing.set(timingTag, this.metricsKeyMaxTime);
    }

    if ([AUTH_OUTPUT, OPERATIONS_OUTPUT, DESTROY_OUTPUT].includes(point)) {
      const timeDiff = timing.get(timingTag);

      if (timeDiff !== null) {
        switch (point) {
          case AUTH_OUTPUT:
            return metrics.authTime(timeDiff);
          case OPERATIONS_OUTPUT:
            return metrics.operationsTime(timeDiff);
          case DESTROY_OUTPUT:
            return metrics.destroyTime(timeDiff);
          default:
            return false;
        }
      }
    }
  }

  /**
   *
   * @param point
   * @param data
   * @returns {*|boolean}
   * @private
   */
  _toMetrics(point, data) {
    if (!data) return;

    const { SERVICE_STARTED } = this.constantsEvents;

    if (this.rabbitMessageTimePoints.includes(point)) {
      return this._rabbitMessageTime(point, data);
    }

    if (point === SERVICE_STARTED) {
      return this.metrics.serviceStartedEvent(data);
    }

    if (point === this.constantsEvents.API_RESPONSE) {
      const { info = '{}', endpoint } = data || {};
      const { elapsedTime = 0 } = JSON.parse(info) || {};

      return this.metrics.apiRequestTime(endpoint, elapsedTime);
    }
  }

  /**
   *
   * @param lvl
   * @param point
   * @param data
   * @param callback
   */
  log(lvl, point, data, callback = () => {}) {
    let result = null;

    setImmediate(() => {
      this.emit('logged', { lvl, point, data });
    });

    if (!this.metrics) {
      console.error('You cant use metrics level without metrics transport setup');
      return callback(null);
    }

    try {
      result = this._toMetrics(point, data);
      if (typeof callback === 'function') callback(null);
      return result;
    } catch (err) {
      console.error(err);
      if (typeof callback === 'function') callback(err);
    }
  }
}

module.exports = MetricsTransport;
