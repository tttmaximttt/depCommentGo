class IntervalsHub {
  constructor(injector) {
    this.hub = new Map();
    this.memory = injector.memory;
  }

  _getIntervalId(uid) {
    const { projectId, userId } = this.memory.uid.getIds(uid);

    return `${projectId}_${userId}`; // SETUP AUTO SAVE
  }

  /**
   *
   * @param {string} uid
   * @param {function} job
   * @param {number} intervalTime
   * @returns {IntervalsHub}
   */
  start(uid, job, intervalTime) {
    const interval = setInterval(job, intervalTime);
    const intervalId = this._getIntervalId(uid);

    if (this.hub.has(intervalId)) this.stop(uid);

    this.hub.set(intervalId, interval);
    return this;
  }

  /**
   *
   * @param {string} uid
   * @returns {IntervalsHub}
   */
  stop(uid) {
    const intervalId = this._getIntervalId(uid);
    const interval = this.hub.get(intervalId);

    clearInterval(interval);
    this.hub.delete(intervalId);
    return this;
  }
}

module.exports = IntervalsHub;
