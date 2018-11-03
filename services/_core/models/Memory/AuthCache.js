class AuthCache {
  constructor(injector) {
    this.dbMemory = injector.dbMemory;
    this.prefix = injector.dbConstants.AUTH_CACHE;
  }

  create(hash) {
    return `${this.prefix}_${hash}`;
  }

  async get(hash) {
    try {
      const { dbMemory } = this;
      const key = this.create(hash);
      const data = await dbMemory.getAsync(key);

      if (typeof data === 'string') return JSON.parse(data);

      return data;
    } catch (err) {
      throw err;
    }
  }

  set(hash, val) {
    try {
      const { dbMemory } = this;
      const key = this.create(hash);
      const dataToSave = JSON.stringify(val);

      return dbMemory.setAsync(key, dataToSave);
    } catch (err) {
      throw err;
    }
  }

  remove(hash) {
    try {
      const { dbMemory } = this;
      const key = this.create(hash);

      return dbMemory.delAsync(key);
    } catch (err) {
      throw err;
    }
  }
}

module.exports = AuthCache;
