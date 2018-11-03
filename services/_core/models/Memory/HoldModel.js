const _ = require('lodash');

module.exports = class HoldModel {
  constructor({ operationsConstants, dbMemory, logSystem, dbConstants }) {
    this.operationsConstants = operationsConstants;
    this.prefix = dbConstants.HOLD || 'HOLD';
    this.dbMemory = dbMemory;
    this.logSystem = logSystem;
  }

  _getKey(projectId) {
    return `${this.prefix}_${projectId}`;
  }

  /**
   *
   * @param projectId
   * @param userId
   * @param elements
   * @param {boolean} returns - return values
   * @returns {Promise<*>}
   */
  async add(projectId, userId, elements, options = {}) {
    const key = this._getKey(projectId);

    try {
      if (!elements) throw new Error('Elements should be an array.');

      if (Array.isArray(elements)) {
        elements = JSON.stringify(elements);
      }
      const result = await this.dbMemory.hsetAsync(key, userId, elements);

      return (options.returns && result > 0) ? await this.get(projectId, userId) : result;
    } catch (err) {
      throw err;
    }
  }

  /**
   *
   * @param projectId
   * @param userId
   * @returns {Promise<*>}
   */
  async get(projectId, userId) {
    const key = this._getKey(projectId);

    return this.dbMemory.hgetAsync(key, userId);
  }

  /**
   *
   * @param projectId
   * @param userId
   * @param {boolean} returns - return values
   * @returns {Promise<*>}
   */
  async delete(projectId, userId, options = {}) {
    const key = this._getKey(projectId);

    try {
      let elementsToDelete;

      if (options.returns) {
        elementsToDelete = await this.get(projectId, userId);
      }
      const result = await this.dbMemory.hdelAsync(key, userId);

      return (result > 0 && options.returns) ?
        elementsToDelete :
        result;
    } catch (err) {
      throw err;
    }
  }

  /**
   * clear hash table by projectId
   * @param projectId
   * @returns {Promise<*>}
   */
  async clear(projectId, options = {}) {
    let result = null;
    const key = this._getKey(projectId);

    try {
      const holdersCount = await this.dbMemory.hlenAsync(key);

      if (options.force || !holdersCount) {
        result = await this.dbMemory.delAsync(key);
        this.logSystem.debug('CLEAR_HOLD', { projectId });
      }

      return result;
    } catch (err) {
      throw err;
    }
  }

  getAll(projectId) {
    const key = this._getKey(projectId);

    return this.dbMemory.hgetallAsync(key);
  }

  async findHolder(projectId, elements) {
    const holded = await this.getAll(projectId) || {};
    const holders = Object.keys(holded);

    return holders.find((item) => {
      const holdedArr = JSON.parse(holded[item]);

      return _.isEqual(holdedArr, elements);
    }) || null;
  }
};
