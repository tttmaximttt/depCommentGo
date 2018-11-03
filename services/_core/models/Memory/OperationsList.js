const config = require('config');

class OperationsList {
  constructor(injector) {
    this.prefix = injector.dbConstants.OPERATIONS_LIST;
    this.dbMemory = injector.dbMemory;
  }

  create(uid) {
    return `${this.prefix}_${uid}`;
  }

  async push(uid, operationRef) {
    try {
      const { dbMemory } = this;
      const key = this.create(uid);
      const data = await dbMemory.rpushAsync(key, operationRef);

      dbMemory.expire(key, config.redisKeysTTL);
      return data;
    } catch (err) {
      throw err;
    }
  }

  remove(uid) {
    const { dbMemory } = this;

    return dbMemory.delAsync(this.create(uid));
  }
}

module.exports = OperationsList;
