module.exports = class DestroyResult {
  constructor({ dbMemory, dbConstants }) {
    this.prefix = dbConstants.IS_DEACTIVATED_ENV || 'IS_DEACTIVATED_ENV';
    this.dbMemory = dbMemory;
  }

  _getKey() {
    return this.prefix;
  }

  /**
   *
   * @returns {Promise<*>}
   */
  deactivate() {
    const key = this._getKey();

    return this.dbMemory.setAsync(key, 1);
  }

  /**
   *
   * @returns {Promise<*>}
   */
  get() {
    const key = this._getKey();

    return this.dbMemory.getAsync(key);
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
