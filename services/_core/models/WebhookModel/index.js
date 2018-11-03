class WebhookModel {

  /**
   * @param {object} config
   * @param {object} messaging
   * @param {String} externalHost
   */
  constructor({ config, messaging, externalHost }) {
    this.config = config;
    this.messaging = messaging;
    this.externalHost = externalHost;
    this.hooks = {};
  }

  _isResolver(resolver) {
    if (resolver && typeof resolver.resolve === 'function' && typeof resolver.reject === 'function') {
      return true;
    }

    throw new Error('Resolver not provided.');
  }

  /**
   * @param {string} hookId
   * @param {function} callback
   * @returns {string} hook url
   */
  create(hookId, resolver) {
    const { config } = this;
    const { timeout } = config.webhook;

    if (this._isResolver(resolver)) this.hooks[hookId] = resolver;

    this.setOnTimeout(hookId, timeout);

    return this.getUrl(hookId);
  }

  createWithoutUrl(hookId) {
    return new Promise((resolve, reject) => {
      this.create(hookId, (err, reply) => {
        if (err) { return reject(err); }
        resolve(reply);
      });
    });
  }

  /**
   * @param {string} hookId
   * @param {number} timeout
   */
  setOnTimeout(hookId, timeout) {
    setTimeout(() => {
      const resolver = this.hooks[hookId];

      if (!resolver) return;

      if (this._isResolver(resolver)) {
        resolver.resolve(null);
        this.remove(hookId);
      }
    }, timeout);
  }

  /**
   * @param {string} hookId
   * @param {object} data
   */
  run(hookId, data) {
    const resolver = this.hooks[hookId];

    if (this._isResolver(resolver)) {
      resolver.resolve(data);
      this.remove(hookId);
    }
  }

  /**
   * @param {string} hookId
   */
  remove(hookId) {
    delete this.hooks[hookId];
  }

  /**
   * @param {string} hookId
   * @returns {string} hook url
   */
  getUrl(hookId) {
    return `${this.externalHost}/hook/${this.getQueueId()}/${hookId}`;
  }

  getQueueId() {
    return this.messaging.getPrivateQueueId();
  }

}

module.exports = WebhookModel;
