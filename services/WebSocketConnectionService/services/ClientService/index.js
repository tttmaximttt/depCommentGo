/* eslint-disable camelcase */
const fp = require('lodash/fp');
const async = require('async');
const _ = require('lodash');

class ClientService {

  /**
   * @param  {ClientModel} clientModel
   * @param  {object} actions
   * @param  {WebSocket} messaging
   * @param  {Object} config
   * @param  {Object} timeout
   * @param  {Object} clientStatuses
   * @param  {Object} constantsEvents
   * @param  {Object} logSystem
   * @param  {Object} activityHistoryConstants
   * @param  {Metrics} metrics
   * @param  {Phase} phase
   * @param {ClientsHelper} clientsHelper
   */
  constructor({
    clientModel, actions, memory, messaging, config, timeout, clientStatuses,
    constantsEvents, logSystem, activityHistoryConstants, metrics, phase, socketCloseConstants,
    messageHelper, timing, clientsHelper, errorFactory, operationsConstants,
  }) {
    this.clientModel = clientModel;
    this.actions = actions;
    this.memory = memory;
    this.messaging = messaging;
    this.metrics = metrics;
    this.managerServiceConfig = config.ManagerService;
    this.config = config.WebSocketConnectionService;
    this.busy = config.Busy;
    this.is_production = config.is_production;
    this.databaseRemote = config.databaseRemote;
    this.timing = timing;
    this.timeout = timeout;
    this.clientStatuses = clientStatuses;
    this.constantsEvents = constantsEvents;
    this.logSystem = logSystem;
    this.channel = activityHistoryConstants.channel;
    this.phase = phase;
    this.socketCloseConstants = socketCloseConstants;
    this.messageHelper = messageHelper;
    this.clientsHelper = clientsHelper;
    this.errorFactory = errorFactory;
    this.operationsConstants = operationsConstants;
  }

  /**
   * @param  {WebSocket} client
   */
  connect(client) {
    client.ctx = {};
    this.clientModel.add(client);
  }

  startIntervalJobs() {
    const { metrics, clientModel } = this;

    metrics.startInterval(() => fp.values(
      clientModel.clientsOnline).length,
      metrics.keys.WS_CONNECTIONS
    );
  }

  /**
   * @param  {WebSocket} client
   * @param  {Object} auth
   */
  async auth(client, { auth }) {
    // todo prepare projectId & viewerId for GUID Strings
    auth.properties.projectId = String(auth.properties.projectId);
    auth.properties.viewerId = String(auth.properties.viewerId);
    const {
      checkAuth, clientId, projectId = '-1', viewerId = '-1', urlParams = {}, confirmedOps,
    } = auth.properties || {};
    const { actions, memory, clientStatuses, databaseRemote, clientsHelper } = this;

    if (projectId === '-1') {
      const location = this.is_production ? this.busy.notFound : databaseRemote.options.host;

      return this.clientModel.send(client, { destroy: true, location });
    }

    if (viewerId === '-1') {
      const ref = urlParams.pathname || this.busy.pathname;

      return this.clientModel.send(client, {
        destroy: true,
        location: `${this.busy.noUser}/${projectId}.htm&ref=${ref}`,
      });
    }

    if (!client.status) {
      client.status = clientStatuses.AUTHORIZE;
    }

    const { uid } = await this.memory.authCache.get(urlParams.authHash) || {};

    client.authPending = true;
    if (checkAuth && client.uid) {
      // This case describe behaviour - When client already busy, and send authenification one more

      this.logSystem.info('RABBIT_MESSAGE', { uid: client.uid, type: 'AUTH' });
      actions.authClient(auth, client.uid, false, client.status);
    } else {
      const { socketId, status } = client;

      async.parallel([
        async () => {
          let saveUid = false;

          if (clientId) {
            saveUid = await memory.clientUid.get(clientId, viewerId, projectId);
          }

          return saveUid;
        },
        async () => memory.redisTools.isConnected(),
      ], async (err, [savedUid]) => {
        const newUid = memory.uid.getUniqueUid(memory.uid.create(viewerId, projectId, socketId));

        if (err) {
          const ref = urlParams.pathname || this.busy.pathname;
          const location = `${this.busy.login}&ref=${ref}?projectId=${projectId}`;
          const error = err;

          return this.clientModel.send(
            client,
            this.messageHelper.accessIssueMessage({ location, error }),
          );
        }

        const reconnect = Boolean((uid || savedUid) && confirmedOps);
        const currentUid = uid || (reconnect && savedUid ? savedUid : newUid);
        const currentClientId = clientId || await clientsHelper.calcClientId(projectId);

        client.clientId = currentClientId;
        await memory.clientUid.set(currentClientId, viewerId, projectId, currentUid);
        await memory.uidClient.set(currentUid, currentClientId);

        if (reconnect) {
          actions.broadcastClientReconnect(currentUid, client.id);
          const previousClient = this.clientModel.clientsOnline[currentUid];

          if (previousClient) {
            const currentProjectId = memory.uid.getIds(currentUid).projectId;

            this.removeClient(currentProjectId);
          }
        }

        this.addClientToQueue({
          socketId,
          auth,
          status,
          uid: currentUid,
          reconnect,
          clientId: currentClientId,
        });
      });
    }
  }

  /**
   * @param  {Object} client
   * @param  {Number} client.socketId
   * @param  {String} client.uid
   * @param  {Object} client.auth
   * @param  {Boolean} client.reconnect
   * @param  {String} client.status
   */
  addClientToQueue({ socketId, uid, auth, reconnect, status, clientId }) {
    const { messaging, actions, memory, logSystem, timing, constantsEvents, metrics } = this;
    const { projectId } = memory.uid.getIds(uid);

    this.startClientPing({ socketId, uid, sessionHash: fp.get('properties.sessionHash'), clientId });

    messaging.bindClient(projectId);
    const timerKey = timing.unique(constantsEvents.MESSAGING_QUEUE_CREATED, uid);

    timing.set(timerKey);

    messaging.assertProject(projectId, (err) => {
      const timeDiff = timing.get(timerKey);

      metrics.generalTiming('assert_project', timeDiff);
      logSystem.info(constantsEvents.MESSAGING_QUEUE_CREATED, {
        uid,
        time: timeDiff,
        err,
      });
      if (!err) {
        this.logSystem.info('RABBIT_MESSAGE', { uid, type: 'AUTH' });
        actions.authClient(auth, uid, reconnect, status, { hasReconnects: reconnect }, clientId);
      } else {
        throw new Error(`error while registering client ${err}`);
      }
    });
  }

  /**
   * @param  {Number} socketId
   * @param  {String} uid
   * @param  {String} sessionHash
   */
  startClientPing({ socketId, uid, sessionHash, clientId }) {
    const { clientModel, config, memory } = this;
    const client = clientModel.clients[socketId];
    const { projectId, userId } = memory.uid.getIds(uid);

    if (!client) return; // was closed by authorize timeout

    const { delay_for_ping, delay_for_auto_close, heartbeat_package } = config.connection;

    client.ctx.clientId = clientId;
    client.uid = uid;
    client.projectId = projectId;
    client.userId = userId;
    client.sessionHash = sessionHash;
    client.startPing(delay_for_ping, delay_for_auto_close, heartbeat_package);
  }

  _opIterMethod(operation, client) {
    _.set(operation, 'actionTime', Date.now());
    operation = this._unZeroOp(operation, client);
    return operation;
  }

  _zeroOp(operation, client) {
    const opClientId = _.get(operation, 'id.clientId', null);
    const elClientId = _.get(operation, 'properties.element.clientId', null);

    if (opClientId === client.ctx.clientId) {
      _.set(operation, 'id.clientId', 0);
    }

    if (elClientId === client.ctx.clientId) {
      _.set(operation, 'properties.element.clientId', 0);
    }

    return operation;
  }

  _unZeroOp(operation, client) {
    const opClientId = _.get(operation, 'id.clientId', null);
    const elClientId = _.get(operation, 'properties.element.clientId', null);

    if (opClientId === 0) {
      _.set(operation, 'id.clientId', client.ctx.clientId);
    }

    if (elClientId === 0) {
      _.set(operation, 'properties.element.clientId', client.ctx.clientId);
    }

    return operation;
  }

  /**
   * @param  {WebSocket} client
   * @param  {Array} {operations}
   */
  operations(client, { operations }) {
    const { timeout, clientStatuses, logSystem,
      managerServiceConfig, actions, constantsEvents } = this;

    client.authPending = this.isTryNow(operations);

    if (client.authorized || client.authPending) {
      if (this.isUserActed(operations)) {
        client.status = clientStatuses.OPERATION;
      }

      if (this.isToolOperation(operations)) {
        const ManagerServiceMessageTimout = managerServiceConfig.messageTimeout;
        const toolsOperations = this.getToolsOperations(operations);

        timeout.setToolOperationsTimeout(
          client,
          toolsOperations,
          ManagerServiceMessageTimout * 2,
          this.toolTimeoutHandler
        );
      }

      logSystem.info('RABBIT_MESSAGE', { uid: client.uid, type: 'OPERATIONS' });

      if (Array.isArray(operations)) {
        operations = operations.map(op => this._opIterMethod(op, client));
      }

      actions.operationClientReceive(
        operations,
        client.uid,
        client.status,
        client.accessLevel,
      );
    } else {
      const logData = {
        operations: fp.map(fp.pick(['group', 'type', 'subType']), operations),
      };

      if (client.uid) logData.uid = client.uid;

      logSystem.info(constantsEvents.OPERATIONS_RECEIVED_BEFORE_AUTH_COMPLETE, logData);
    }
  }

  getToolsOperations(operations = []) {
    return operations.filter(op => op.properties.group === this.operationsConstants.GROUP.TOOLS);
  }

  isToolOperation(operations) {
    return fp.some({
      properties: {
        group: this.operationsConstants.GROUP.TOOLS,
      },
    }, operations);
  }

  isUserActed(operations) {
    return fp.some({
      properties: {
        type: this.operationsConstants.TYPE.TRACK,
        subType: this.operationsConstants.SUB_TYPE.POINT,
        point: this.constantsEvents.USER_ACTED,
      },
    }, operations);
  }

  isTryNow(operations) {
    return fp.some({
      properties: {
        group: this.operationsConstants.GROUP.DOCUMENT,
        subType: this.operationsConstants.ACCESS.REQUEST,
        type: this.operationsConstants.TYPE.ACCESS,
      },
    }, operations);
  }

  isBusy(operations) {
    return fp.some({
      properties: {
        group: this.operationsConstants.GROUP.DOCUMENT,
        subType: this.operationsConstants.ACCESS.BUSY,
        type: this.operationsConstants.TYPE.ACCESS,
      },
    }, operations);
  }

  /**
   * @param  {WebSocket} client
   * @param  {Boolean} {destroy}
   */
  destroy(client, message) {
    const { sessionHash } = client;

    client.status = this.clientStatuses.DESTROY;
    client.destroySent = true;
    this.logSystem.info('RABBIT_MESSAGE', { uid: client.uid, type: 'DESTROY' });
    this.actions.disconnectClient(
      client.uid,
      Object.assign({ sessionHash }, message),
      client.status,
    );
  }

  /**
   * @param  {WebSocket} client
   * @param  {Number} code
   */
  close(client, code) {
    const {
      memory, actions, channel, clientModel, logSystem, config, constantsEvents,
      clientStatuses,
    } = this;
    const { uid, status, sessionHash } = client;
    const { DESTROY } = clientStatuses;

    if (memory.uid.isValid(uid)) {
      this.logSocketClose(client, code);

      if (status !== DESTROY) {
        logSystem.info(
          constantsEvents.SET_DISCONNECT_TIMEOUT,
          {
            uid,
            channel: channel.CLIENT,
            disconnectTimeout: config.connection.disconnect_time,
            phase: this.phase.create({ point: constantsEvents.SET_DISCONNECT_TIMEOUT }),
          }
        );

        actions.checkClientDisconnect(uid);

        clientModel.disconnect(client, () => {
          client.status = DESTROY;
          client.destroySent = true;

          this.logSystem.info('RABBIT_MESSAGE', { uid, type: 'DESTROY' });
          actions.disconnectClient(uid, {
            destroy: true,
            sessionHash,
            params: { onTimeout: true },
          }, status, { destroyOnTimeout: true });
        });
      }
    } else {
      this.logSocketClose(client, code);
    }
  }

  /**
   * @param  {WebSocket} connection
   * @param  {Error} error
   */
  error(connection, err) {
    const { logSystem, constantsEvents, errorFactory } = this;
    const error = errorFactory.customError(
      err,
      { connection },
      'ClientsService.error',
      constantsEvents.WEBSOCKET_ERROR
    );

    logSystem.error(error.group, { ...error });
  }

  logSocketClose(client, code) {
    const { memory, logSystem, constantsEvents, channel } = this;
    const { status, uid, sessionHash, authorized, authPending } = client;

    const reason = this.getDisconnectReason(client, code);
    const level = uid ? 'info' : 'debug';

    logSystem[level](constantsEvents.SOCKET_CLOSE, Object.assign(
      uid ? memory.uid.getIds(uid) : {},
      {
        actionTime: Date.now(),
        reason,
        uid,
        channel: channel.CLIENT,
        status,
        sessionHash,
        code,
        authorized,
        authPending,
        connection: {
          closeReason: reason,
        },
      }
    ));
  }

  getDisconnectReason(client/* , code */) {
    const { socketCloseConstants } = this;
    const { destroyReceived, destroySent } = client;
    const expected = destroyReceived || destroySent;

    if (!client.uid) {
      return socketCloseConstants.NO_AUTH;
    } else if (!expected) {
      return socketCloseConstants.UNEXPECTED;
    } else if (destroyReceived && !destroySent) {
      return socketCloseConstants.SERVER_DESTROY;
    } else if (destroySent && !destroyReceived) {
      return socketCloseConstants.TAB_CLOSED;
    } else if (destroySent && destroyReceived) {
      return socketCloseConstants.DONE;
    }
    return socketCloseConstants.UNKNOWN;
  }

  /**
   * @method messageMiddleware - if there's a dataKey, then the actual message is in redis.
   * We should get the message list and run message handler for each one
   * @param {Object} message
   */
  async messageMiddleware(message) {
    try {
      if (!message.dataKey) return message;
      const dataToSend = await this.memory.dataDelivery.get(message.dataKey);

      await this.memory.dataDelivery.remove(message.dataKey);
      return dataToSend;
    } catch (err) {
      throw err;
    }
  }

  toolTimeoutHandler(client, uid, operations) {
    const { logSystem, constantsEvents } = this;

    logSystem.info(constantsEvents.TOOL_OPERATION_TIMEOUT, { uid, operations });

    client.close();
  }

  handleReconnect(uid, { correlationId }) {
    const { memory, logSystem, clientModel } = this;
    const result = this.timeout.removeAuthTimeout({ uid })
      || this.timeout.removeDisconnectTimeout({ uid });

    if (result) {
      logSystem.info(
        this.constantsEvents.DISCONNECT_TIMEOUT_REMOVED,
        { uid, message: 'disconnect timeout removed' }
      );
    }

    const client = clientModel.clientsOnline[uid];

    // check for if this isn't the same client
    if (client && client.id !== correlationId) {
      const data = _.pick(client, ['authorized', 'authPending', 'status']);
      const { projectId } = memory.uid.getIds(uid);

      this.removeClient(projectId);
      this.actions.updateConnectionData(uid, data);
    }
  }

  checkClientDisconnect(uid, correlationId) {
    const client = this.clientModel.clientsOnline[uid];

    if (client && client.id !== correlationId) {
      this.actions.broadcastClientReconnect(uid, client.id);

      this.logSystem.info(
        this.constantsEvents.DISCONNECTED_CLIENT_EXISTS,
        { uid, message: 'disconnected client exists' }
      );
    }
  }

  handleSystemMessage(uid, message) {
    if (message.clientReconnect) {
      this.handleReconnect(uid, message);
      return true;
    }
    if (message.connectionData) {
      const client = this.clientModel.clientsOnline[uid];

      if (client) {
        _.assign(client, message.data);
        this.logSystem.debug(
          'CLIENT_DATA_UPDATED',
          { uid, message: 'client data updated from reconnected one' }
        );
      }

      return true;
    }
    if (message.clientDisconnect) {
      this.checkClientDisconnect(uid, message.correlationId);
      return true;
    }
  }

  removeClient(uid) {
    const { messaging, timeout, clientModel, logSystem, constantsEvents, memory } = this;
    const { projectId, userId } = memory.uid.getIds(uid);
    const client = clientModel.clientsOnline[uid];
    const clientId = _.get(client, 'clientId');

    logSystem.info(constantsEvents.CONNECTION_REMOVED, {
      uid, message: 'removed physical connection',
    });

    if (clientModel.isUserLastInProject(uid)) {
      messaging.removeClient(projectId);
    }

    memory.clientUid.remove(clientId, userId, projectId);
    memory.uidClient.remove(uid);

    timeout.removeDisconnectTimeout({ uid });
    clientModel.remove(uid);
  }

  /**
   * @param {String} uid
   * @param {Object} message
   */
  sendToProject(uid, message = {}) {
    const { clientModel } = this;
    const client = clientModel.clientsOnline[uid];
    const { DESTROY } = this.clientStatuses;

    if (message.destroy) {
      this.removeClient(uid);
    }

    if (!client) return;

    client.accessLevel = message.accessLevel;
    if (client.readyState === client.OPEN) {
      if (message.destroy) {
        client.status = DESTROY;
        client.destroyReceived = true;

        clientModel.send(client, message);

        setTimeout(() => {
          clientModel.close(client);
        }, 100);
      } else {
        if (message.operations) {
          this.isBusy(message.operations) && (client.authPending = false);

          message.operations.map(op => this._zeroOp(op, client));

          if (this.isToolOperation(message.operations)) {
            const toolsOperations = this.getToolsOperations(message.operations);

            this.timeout.removeToolOperationsTimeout(client, toolsOperations);
          }
        }

        if (message.auth) {
          this.timeout.removeAuthTimeout(client);

          if (!message.auth.initial || message.auth.isReconnect) {
            client.status = this.clientStatuses.OPERATION;
          }

          if (!client.authorized) {
            client.authPending = false;
            client.authorized = true;
          }
        }

        clientModel.send(client, message);
      }
    }
  }

  /**
   * @param  {WebSocket} connection
   * @param  {Object} message
   */
  messageLimit({ uid }, message) {
    uid = uid || 'none';
    this.logSystem.info(this.constantsEvents.MESSAGE_LIMIT, { uid, message });
  }
}

module.exports = ClientService;
