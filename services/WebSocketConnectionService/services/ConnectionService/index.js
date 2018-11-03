

class ConnectionService {
  constructor({ config, actions, clientService }) {
    this.config = config;
    this.actions = actions;
    this.clientService = clientService;
  }

  removeConnectionTimeout(connection) {
    clearTimeout(connection.ctx._connectionTimeoutTimer);
  }

  resetConnectionTimeout(connection) {
    this.removeConnectionTimeout(connection);
    this.setConnectionTimeout(connection);
  }

  _addConnectionTimeoutAction(connection, timeoutAction) {
    const { message_timeout } = this.config.WebSocketConnectionService.connection;
    const timerId = setTimeout(timeoutAction, message_timeout);

    connection.ctx._connectionTimeoutTimer = timerId;
  }

  setConnectionTimeout(connection, timeoutAction = null) {
    if (!timeoutAction) timeoutAction = connection.ctx._connectionTimeoutAction;
    if (timeoutAction) {
      connection.ctx._connectionTimeoutAction = timeoutAction;
      this._addConnectionTimeoutAction(connection, timeoutAction);
    }
  }
}

module.exports = ConnectionService;
