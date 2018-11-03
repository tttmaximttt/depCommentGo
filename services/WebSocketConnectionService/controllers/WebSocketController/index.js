const Promise = require('bluebird');

class WebSocketController {

  /**
   * @param {ClientService} clientService
   * @param {Object} validation
   * @param {ConstantsEvents} constantsEvents
   * @param {LogSystem} logSystem
   * @param {CoreUtils} coreUtils
   * @param {Object} activityHistoryConstants
   */
  constructor({
    clientService, validation, constantsEvents, logSystem, coreUtils, activityHistoryConstants,
    clientStatuses, messageHelper, connectionService, config,
  }) {
    this.clientService = clientService;
    this.validation = validation;
    this.logSystem = logSystem;
    this.constantsEvents = constantsEvents;
    this.coreUtils = coreUtils;
    this.channel = activityHistoryConstants.channel;
    this.clientStatuses = clientStatuses;
    this.messageHelper = messageHelper;
    this.connectionService = connectionService;
    this.config = config;

    [
      'onSocketError', 'onSocketClose', 'onSocketConnection', 'onSocketMessage', 'sendToProject',
      'onLimited',
    ].forEach((v) => {
      const self = this;

      self[v] = this[v].bind(this);
    });
  }

  /**
   * @param  {WebSocket} connection
   */
  onSocketConnection(connection) {
    this.clientService.connect(connection);

    const timeoutAction = () => this.clientService.destroy(connection, {
      destroy: true,
      params: {
        onTimeout: true,
        force: true,
      },
    });

    this.connectionService.setConnectionTimeout(connection, timeoutAction);
  }

  /**
   * @param  {WebSocket} connection
   * @param  {String} json
   */
  onSocketMessage(connection, json) {
    let message;

    const errorMessageLevel = connection.uid ?
      this.constantsEvents.SCRIPT_EXCEPTION :
      this.constantsEvents.SYSTEM_ERROR;

    const channel = this.channel.CLIENT;

    connection.pong();
    if (json === '{}') return;

    try {
      message = JSON.parse(json);
    } catch (err) {
      this.logSystem.error(
        errorMessageLevel, {
          uid: connection.uid,
          channel,
          error: this.coreUtils.stringifyError(err),
          method: 'WebSocketController.onSocketMessage',
        }
      );
    }

    const err = this.validation.normalize(message); // mutates message

    if (err) {
      return this.logSystem.error(
        errorMessageLevel, {
          uid: connection.uid,
          channel,
          err,
          data: message,
          path: __dirname,
          method: 'WebSocketController.onSocketMessage.validation',
        }
      );
    }

    // If operations OR destroy coonection.uid !== undefined
    if ((message.operations || message.destroy) && !connection.uid) {
      return;
    }

    // Filter messages to exclude wrong or repeatable operations
    message = this.messageHelper.filterByStatus(connection, message);

    this.connectionService.resetConnectionTimeout(connection);

    if (message.auth) this.clientService.auth(connection, message);

    if (message.operations) this.clientService.operations(connection, message);

    if (message.destroy) this.clientService.destroy(connection, message);
  }

  /**
   * @param  {WebSocket} connection
   */
  onSocketClose(connection, code) {
    this.connectionService.removeConnectionTimeout(connection);
    this.clientService.close(connection, code);
  }

  /**
   * @param  {WebSocket} connection
   * @param  {Error} error
   */
  onSocketError(connection, error) {
    this.clientService.error(connection, error);
  }

  /**
   * @param  {WebSocket} connection
   * @param  {Object} message
   */
  onLimited(connection, message) {
    this.clientService.messageLimit(connection, message);
  }

  /**
   * @param  {String} uid
   * @param  {Object} data
   */
  async sendToProject(projectId, data) {
    try {
      const { uid } = data;
      let messages = await this.clientService.messageMiddleware(data);

      if (!Array.isArray(messages)) messages = [messages];

      await Promise.each(messages, (message) => {
        if (!this.clientService.handleSystemMessage(uid, message)) {
          this.clientService.sendToProject(uid, message);
        }
      });
    } catch (err) {
      throw err;
    }
  }

  /**
   * @param  {boolean} isReconnect
   */
  startIntervalJobs(isReconnect) {
    if (isReconnect) return;

    this.clientService.startIntervalJobs();
  }

}

module.exports = WebSocketController;
