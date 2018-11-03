const config = require('config');
const Transport = require('winston-transport');

const logSystemConstants = require(
  `${config.paths.ROOT}/services/_core/utils/LogSystem/constants.js`
);

class Activity extends Transport {
  static setup({ messaging = null, coreUtils = null }) {
    Activity.messaging = messaging;
    Activity.coreUtils = coreUtils;
  }

  constructor(opts) {
    super(opts);

    this.name = 'activity';
    this.activityHistoryPoints = config.LogSystem.activityHistoryPoints;
    this.messaging = Activity.messaging;
    this.coreUtils = Activity.coreUtils;
    this.constants = logSystemConstants;
    this.level = opts.level;
  }

  /**
   * @method _normalizeData - return new object with normalized fields
   * @param {Object} data
   * @param {Object} additionalFields
   *
   * @returns {Object} data with normalized fields
   */
  _normalizeData(data = {}, additionalFields = {}) {
    if (data === null) data = {};
    const { TIME_KEY } = this.constants;

    const normalizedData = Object.assign({}, data, additionalFields);

    if (!normalizedData[TIME_KEY]) {
      normalizedData[TIME_KEY] = Date.now();
    }

    if (data.uid) {
      const [userId, projectId, socketId, uidTimestamp] = data.uid.split('_');

      Object.assign(normalizedData, { userId, projectId, socketId, uidTimestamp });
    }

    return normalizedData;
  }

  /**
   *
   * @param point
   * @param normalizedData
   * @returns {{error: *}}
   * @private
   */
  _logToActivityHistory({ point, normalizedData }) {
    const { TYPE_KEY } = this.constants;

    normalizedData.activityName = normalizedData.activityName || point;
    normalizedData.channel = normalizedData.channel || 'client';

    try {
      this.messaging.logActivity(
        Object.assign(
          { [TYPE_KEY]: point },
          normalizedData
        )
      );
    } catch (error) {
      const errString = this.coreUtils.stringifyError(error);

      console.error( // TODO /*this.kibanaLogger[ERROR]*/
        point,
        `${errString} and data ${JSON.stringify(normalizedData)}`
      );

      return { error };
    }
  }

  /**
   *
   * @param lvl
   * @param point
   * @param data
   * @param callback
   */
  log(lvl, point, data, callback) {
    let result = null;

    setImmediate(() => {
      this.emit('logged', { lvl, point, data });
    });
    try {
      if (!this.messaging || !this.coreUtils) {
        console.error('You cant use activity level without activity transport setup');
        if (typeof callback === 'function') callback(null);
        return;
      }

      const normalizedData = this._normalizeData(data);

      if (this.activityHistoryPoints.includes(point) && !point.includes(':')) {
        result = this._logToActivityHistory({ point, normalizedData });
      }
      if (typeof callback === 'function') callback(null);
      return result;
    } catch (err) {
      console.error(err);
      if (typeof callback === 'function') callback(err);
    }
  }
}

module.exports = Activity;
