const config = require('config');

class ProjectOperations {
  constructor(injector) {
    this.prefix = injector.dbConstants.PROJECT_OPERATIONS;
    this.dbMemory = injector.dbMemory;
    this.create = this.create.bind(this);
  }

  create(projectId) {
    return `${this.prefix}_${projectId}`;
  }

  async push(projectId, operation) {
    try {
      const { dbMemory } = this;
      const data = typeof operation === 'object' ? JSON.stringify(operation) : operation;
      const key = this.create(projectId);
      const result = await dbMemory.rpushAsync(key, data);

      this.dbMemory.expire(key, config.redisKeysTTL);
      return result;
    } catch (err) {
      throw err;
    }
  }

  _parseJson(jsonArray) {
    if (jsonArray) return jsonArray.map(JSON.parse.bind(JSON));
    return jsonArray;
  }

  async get(projectId) {
    try {
      const { dbMemory } = this;
      const jsonArray = await dbMemory.lrangeAsync(this.create(projectId));

      return this._parseJson(jsonArray);
    } catch (err) {
      throw err;
    }
  }

  getFrom(projectId, from) {
    return this.getRange(projectId, from, -1);
  }

  async getRange(projectId, from, to) {
    try {
      const { dbMemory } = this;
      const key = this.create(projectId);
      const jsonArray = await dbMemory.lrangeAsync(key, from, to);

      return this._parseJson(jsonArray);
    } catch (err) {
      throw err;
    }
  }

  count(projectId) {
    const { dbMemory } = this;
    const key = this.create(projectId);

    return dbMemory.llenAsync(key);
  }

  removeOps(projectId, from, to = -1) {
    const key = this.create(projectId);

    if (from < 0) {
      from = to;
      to = -1;
    }

    return this.dbMemory.ltrimAsync(key, from, to);
  }

  remove(projectId) {
    const { dbMemory } = this;

    return dbMemory.delAsync(this.create(projectId));
  }
}

module.exports = ProjectOperations;
