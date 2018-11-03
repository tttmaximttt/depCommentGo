const Promise = require('bluebird');
const _ = require('lodash');

module.exports = class DestroyResult {
  constructor({ operationsConstants, dbMemory, logSystem, dbConstants }) {
    this.operationsConstants = operationsConstants;
    this.prefix = dbConstants.DESTROY_RESULTS || 'DESTROY_RESULTS';
    this.hash = 'result';
    this.dbMemory = dbMemory;
    this.logSystem = logSystem;
  }

  _getKey() {
    return `${this.prefix}`;
  }

  /**
   *
   * @param data.totalProjectCount // TODO add corect JSDOC object description
   * @param data.totalClientsCount // TODO add corect JSDOC object description
   * @param data.erroredClientsCount // TODO add corect JSDOC object description
   * @param data.deactivatedClientsCount // TODO add corect JSDOC object description
   * @returns {Promise<*>}
   */
  add(data) {
    const key = this._getKey();

    return Promise.each(Object.keys(data), (hash) => {
      if (_.isObject(data[hash])) {
        try {
          data[hash] = JSON.stringify(data[hash]);
        } catch (err) {
          throw err;
        }
      }

      return this.dbMemory.hsetAsync(key, hash, data[hash]);
    });
  }

  /**
   *
   * @param hash
   * @returns {Promise<*>}
   */
  async get(hash) {
    try {
      const key = this._getKey();

      if (!hash) {
        const result = await this.dbMemory.hgetallAsync(key);

        if (!result || _.isEmpty(result)) return result;
        result.projectClientsTotal = JSON.parse(result.projectClientsTotal || '{}');
        result.errored = JSON.parse(result.errored || '{}');
        return result;
      }
      return this.dbMemory.hgetAsync(key, hash);
    } catch (err) {
      throw err;
    }
  }

  /**
   *
   * @param hash
   * @param value
   * @returns {Promise<*>}
   */
  async update(hash, value) {
    const key = this._getKey();
    let val = typeof value === 'number' ? Number(value) : value;

    if (_.isObject(val)) {
      try {
        val = JSON.stringify(val);
      } catch (err) {
        throw err;
      }
    }

    return this.dbMemory.hsetAsync(key, hash, val);
  }

  /**
   * clear hash table by projectId
   * @param projectId
   * @returns {Promise<*>}
   */
  clear() {
    const key = this._getKey();

    return this.dbMemory.delAsync(key);
  }
};
