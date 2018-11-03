const config = require('config');

class CrossEditor {
  constructor(injector) {
    this.dbMemory = injector.dbMemory;
    this.prefix = injector.dbConstants.CROSS_EDITOR;
    this.enable = String(config.crossEditor.enable) === 'true';
  }

  create(uid) {
    return `${this.prefix}_${uid}`;
  }

  get(uid) {
    const { dbMemory } = this;

    return dbMemory.getAsync(this.create(uid));
  }

  set(uid, val) {
    const { dbMemory } = this;

    return dbMemory.setAsync(this.create(uid), val);
  }

  remove(uid) {
    const { dbMemory } = this;

    dbMemory.delAsync(this.create(uid));
  }

  isEnabled() {
    return +this.enable;
  }

  readFromPackage(authPackage) {
    return authPackage._host || null;
  }

  setMiddleware(uid, host) {
    if (!this.isEnabled() || !host) return null;
    return this.set(uid, host);
  }

  getMiddleware(uid) {
    if (!this.isEnabled()) return null;
    return this.get(uid);
  }
}

module.exports = CrossEditor;
