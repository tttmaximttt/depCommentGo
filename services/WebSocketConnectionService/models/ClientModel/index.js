const ClientsList = require('./client-list');
const uuid = require('uuid/v4');
const _ = require('lodash');

class ClientModel {

  constructor({ config, timeout, logSystem, constantsEvents, coreUtils, messaging, errorFactory,
    memory }) {
    this.clientsList = new ClientsList();
    this.timeout = timeout;
    this.config = config.WebSocketConnectionService;
    this.clients = this.clientsList.list;
    this.logSystem = logSystem;
    this.constantsEvents = constantsEvents;
    this.coreUtils = coreUtils;
    this.messaging = messaging;
    this.errorFactory = errorFactory;
    this.memory = memory;
  }

  get clientsWithoutUID() {
    return this.clientsList.withoutUID;
  }

  get clientsOnline() {
    return this.clientsList.online;
  }

  isUserLastInProject(uid) {
    const { memory } = this;
    const { projectId } = memory.uid.getIds(uid);
    const online = this.clientsList.online;
    const onlineByProjectId = _.filter(online, (client => client.projectId === projectId));

    if (onlineByProjectId.length === 1) {
      return _.get(onlineByProjectId, '[0].uid') === uid;
    }

    return false;
  }

  /**
   * @param  {WebSocket} connection
   */
  add(connection) {
    const client = connection;

    client.id = uuid();
    client.socketId = client.socketId || client._socket._handle.fd;

    this.clientsList.add(client);

    const { disconnect_time } = this.config.connection;

    this.timeout.setAuthTimeout(client, disconnect_time, () => this.close(client));
  }

  /**
   * @param  {WebSocket} connection
   * @param  {function} onTimeout
   */
  disconnect(connection, onTimeout = () => {}) {
    const client = connection;

    this.clientsList.del(client.socketId);
    if (!client.uid) return this.timeout.removeAuthTimeout(client);
    this.timeout.setDisconnectTimeout(client, this.config.connection.disconnect_time, onTimeout);
  }

  /**
   * @param  {String} uid
   */
  remove(uid) {
    const client = this.clientsOnline[uid];

    if (client) {
      this.clientsList.del(client.socketId);
      client.uid = null;
    }
  }

  /**
   * @param  {WebSocket} client
   * @param  {number} code
   */
  close(client, code = this.config.code.clientClose) {
    client.close(code);
  }

  /**
   * @param  {WebSocket} client
   * @param  {Object} msg
   */
  send(client, msg) {
    try {
      client.send(JSON.stringify(msg));
    } catch (err) {
      const error = this.errorFactory.systemError(err, null, 'ClientModel.send');

      this.logSystem.error(error.group, { ...error });
    }
  }

  /**
   * @param  {String} uid
   */
  getClient(uid) {
    return this.clientsOnline[uid];
  }
}

module.exports = ClientModel;
