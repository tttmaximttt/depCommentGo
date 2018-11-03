const Promise = require('bluebird');
const config = require('config');
const _ = require('lodash');
const metrohash128 = require('metrohash').metrohash128;

const _indexPrefix = _.get(config.ActivityHistoryService, 'redis.transport.indexPrefix');

module.exports = function CoreUtils() {
  this.stringifyError = (error, filter, space) => {
    if (!error || typeof error === 'string') return error;
    const plainObject = {};

    Object.getOwnPropertyNames(error).forEach((key) => { plainObject[key] = error[key]; });
    return JSON.stringify(plainObject, filter, space);
  };

  this.getStringBytesLength = stringsToBytes => stringsToBytes.map((string = '') => Buffer.from(string).length);

  this.getHash = (itemToHash) => {
    if (_.isObject(itemToHash) || _.isArray(itemToHash)) {
      return metrohash128(JSON.stringify(itemToHash));
    } else if (_.isString(itemToHash)) {
      return metrohash128(itemToHash);
    }

    throw new Error('Item to hash must be an object, array or string!');
  };

  /**
   *
   * @param {String} activityName
   * @param {Date} timeEntry
   * @param {Date} options
   * @return {String}
   */
  this.getIndexName = (activityName, timeEntry, options = {}) => {
    const { externalIndexPrefix } = options;
    const indexPrefix = externalIndexPrefix ? `ahs_${externalIndexPrefix}_` : _indexPrefix;

    return `${indexPrefix}${activityName}_${this.formatElasticIndexTime(
      timeEntry || Date.now()
    )}`;
  };

  /**
   * @param {Object} obj - instance of a class or an object with functions
   * @param {Function} errorHandler - receives a caught error
   * wrap all methods in try-catch to avoid possible silent exceptions
   */
  this.safeMethods = (obj, errorHandler) => {
    Object.keys(obj).forEach((key) => {
      const prop = obj[key];

      if (typeof prop === 'function') {
        obj[key] = (...args) => {
          try {
            return prop.apply(obj, args);
          } catch (err) {
            errorHandler(err);
          }
        };
      }
    });
  };

  /**
   * @param {Object} from - source object
   * @param {Object} to - target object
   * @param {Array} keys - keys to copy
   * copy properties and methods bound to the source object
   */
  this.injectProperties = (from, to, keys) => {
    keys.forEach((key) => {
      to[key] = typeof from[key] === 'function'
        ? from[key].bind(from)
        : from[key];
    });
  };

  /**
   *
   * @param {Timestamp} timeEntry
   * @return {String} - string similar to format yyyy_mm_dd
   */
  this.formatElasticIndexTime = (date) => {
    const pad = n => `00${n}`.slice(-2);

    try {
      if (`${date}`.length !== 13) throw new Error(`Wrong date structure, date: ${date}`);
      const newDate = (new Date(parseInt(date, 10)));
      const rotateInterval = _.get(config, 'ActivityHistoryService.rotateInterval', 1);

      const day = Math.floor(newDate.getUTCDate() / rotateInterval) * rotateInterval || 1;

      return `${newDate.getUTCFullYear()}.` +
        `${pad(newDate.getUTCMonth() + 1)}.` +
        `${pad(day)}:` +
        `${rotateInterval}`;
    } catch (err) {
      return err;
    }
  };

  this.getCallerIP = (request) => {
    let ip = request.headers['x-forwarded-for'] ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      request.connection.socket.remoteAddress;

    ip = ip.split(',')[0];
    ip = ip.split(':').pop();
    return ip;
  };

  this.promiseWhile = Promise.method((condition, action) => {
    if (!condition()) return;
    return action().then(
      this.promiseWhile.bind(null, condition, action)
    );
  });
};
