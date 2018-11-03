class ToolsOrder {
  constructor(injector) {
    this.prefix = injector.dbConstants.TOOLS_ORDER;
    this.dbMemory = injector.dbMemory;
  }

  _getKey(uid) {
    return `${this.prefix}_${uid}`;
  }

  push(uid, elementId) {
    const { dbMemory } = this;
    const key = this._getKey(uid);

    dbMemory.rpushAsync(key, elementId);
  }

  async get(uid) {
    const { dbMemory } = this;
    const key = this._getKey(uid);
    const result = (await dbMemory.lrangeAsync(key)) || [];

    return result.map(JSON.parse);
  }

  getFrom(uid, from) {
    return this.getRange(uid, from, -1);
  }

  getRange(uid, from, to) {
    const { dbMemory } = this;
    const key = this._getKey(uid);

    return dbMemory.lrangeAsync(key, from, to);
  }

  count(uid) {
    const { dbMemory } = this;
    const key = this._getKey(uid);

    return dbMemory.llenAsync(key);
  }

  removeOps(uid, from, to = -1) {
    const key = this._getKey(uid);

    if (from < 0) {
      from = to;
      to = -1;
    }

    return this.dbMemory.ltrimAsync(key, from, to);
  }

  clear(uid) {
    const key = this._getKey(uid);

    return this.dbMemory.delAsync(key);
  }
}

module.exports = ToolsOrder;
