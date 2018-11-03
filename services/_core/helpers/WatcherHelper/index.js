const Promise = require('bluebird');
const async = require('async');

class WatcherHelper {
  /**
   *
   * @param {Array} arr
   * @param {function} handler - http://caolan.github.io/async/global.html
   * @param {number} limit
   * @param {function} cb
   * @private
   */
  _handleWithCallback(arr, handler, limit, cb) {
    async.mapLimit(arr, limit, handler, cb);
  }

  /**
   *
   * @param {Array} arr
   * @param {function} handler - Promise
   * @param {number} limit
   * @private
   */
  _handleWithPromise(arr, handler, limit) {
    return Promise.map(arr, handler, { concurrency: limit });
  }

  /**
   *
   * @param {Array} arr
   * @param {function} handler
   * @param {number} limit
   * @param {function} [cb] - optional
   */
  handleWithLimit(arr = [], handler, limit = 20, cb) {
    if (typeof cb === 'function') {
      return this._handleWithCallback(arr, handler, limit, cb);
    }

    return this._handleWithPromise(arr, handler, limit);
  }
}

module.exports = WatcherHelper;

