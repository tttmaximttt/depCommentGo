class ClientOperations {
  constructor(injector) {
    this.prefix = injector.dbConstants.CLIENT_OPERATIONS;
    this.dbMemory = injector.dbMemory;
  }

  create(uid) {
    return `${this.prefix}_${uid}`;
  }

  async get(uid) {
    try {
      const data = await this.dbMemory.lrangeAsync(this.create(uid));

      try {
        return data.map(JSON.parse);
      } catch (err) {
        throw err;
      }
    } catch (err) {
      throw err;
    }
  }

  push(uid, operation, callback = () => {}) {
    const { dbMemory } = this;
    const data = typeof operation === 'object' ? JSON.stringify(operation) : operation;

    dbMemory.rpush(this.create(uid), data, callback);
  }

  remove(uid, cb = () => {}) {
    const { dbMemory } = this;

    dbMemory.remove(this.create(uid), cb);
  }
}

module.exports = ClientOperations;
