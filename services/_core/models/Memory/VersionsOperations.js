module.exports = class VersionsOperations {
  constructor({ dbMemory, dbConstants }) {
    this.prefix = dbConstants.VERSIONS_OPERATIONS || 'VERSIONS_OPERATIONS';
    this.dbMemory = dbMemory;
  }

  _getKey(projectId) {
    return `${this.prefix}_${projectId}`;
  }

  /**
   *
   * @param {String} projectId
   * @param {String} version
   * @param {Array} operations
   * @returns {Promise<*>}
   */
  add(projectId, version, operations) {
    try {
      const key = this._getKey(projectId);

      if (!operations) throw new Error('Operations should be an array.');
      if (Array.isArray(operations)) {
        operations = JSON.stringify(operations);
      }
      return this.dbMemory.hsetAsync(key, version, operations);
    } catch (err) {
      throw err;
    }
  }

  /**
   *
   * @param projectId
   * @param version
   * @returns {Promise<*>}
   */
  async get(projectId, version) {
    try {
      const key = this._getKey(projectId);
      const operations = await this.dbMemory.hgetAsync(key, version);

      return operations ? JSON.parse(operations) : null;
    } catch (err) {
      throw err;
    }
  }

  async remove(projectId) {
    try {
      const key = this._getKey(projectId);

      return await this.dbMemory.delAsync(key);
    } catch (err) {
      throw err;
    }
  }

};
