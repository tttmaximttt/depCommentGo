const Promise = require('bluebird');
const _ = require('lodash');

class CollaborationService {

  /**
   * @param {OperationsFactory} operationsFactory
   * @param {OperationsModel} operationsModel
   * @param {Manager} messaging
   * @param {Memory} memory
   * @param {LogSystem} logSystem
   * @param {Object} operationsConstants
   * @param {Object} operationsConstants
   * @param {Object} activityHistoryConstants
   * @param {CoreUtils} coreUtils
   * @param {Object} phase
   * @param {Object} config
   * @param {Object} constantsEvents
   * @param {LuaModel} luaModel
   */
  constructor({
    operationsFactory, operationsModel, messaging, memory, operationsConstants, logSystem,
    constantsEvents, activityHistoryConstants, coreUtils, phase, config, errorFactory,
    luaModel, clientStatuses,
  }) {
    this.operationsFactory = operationsFactory;
    this.operationsModel = operationsModel;
    this.operationsModel = operationsModel;
    this.messaging = messaging;
    this.memory = memory;
    this.operationsConstants = operationsConstants;
    this.logSystem = logSystem;
    this.constantsEvents = constantsEvents;
    this.channel = activityHistoryConstants.channel;
    this.coreUtils = coreUtils;
    this.phase = phase;
    this.config = config;
    this.luaModel = luaModel;
    this.clientStatuses = clientStatuses;
    this.errorFactory = errorFactory;
  }

  /**
   * @param {String} uid
   * @param {String} clientId
   * @param {Array} operations
   * @param {function} callback
   */
  async setIds(uid, clientId, operations = []) {
    const { memory, operationsConstants } = this;
    const { projectId } = memory.uid.getIds(uid);
    const { GROUP, TYPE } = operationsConstants;
    const localId = await this.memory.projectData.getByItemId(projectId, this.memory.projectData.localId) || {};
    let id = localId[clientId] || 0;

    operations.forEach((operation) => {
      if (operation.id) return;

      id += 1;
      localId[clientId] = id;
      operation.id = { localId: localId[clientId], clientId };
      const { group, type } = operation.properties;

      if (group === GROUP.TOOLS && type !== TYPE.PAGES) {
        operation.properties.element = operation.id;
      }
    });

    let localIdsMap = await this.memory.projectData.getByItemId(projectId, this.memory.projectData.localId);

    if (!localIdsMap) localIdsMap = {};
    localIdsMap[clientId] = localId[clientId];
    await this.memory.projectData.set(projectId, this.memory.projectData.localId, localIdsMap);

    return operations;
  }

  async setAndSaveOperations(uid, operations, setConfirmed = false) {
    try {
      // mutates operations
      await this.setIds(uid, this.config.clientId, operations);
      await this.saveOperations(uid, operations, setConfirmed);
    } catch (err) {
      throw err;
    }
  }

  /**
   *
   * @param uid
   */
  async getMutableAccess(uid) {
    const { EDITOR_MODE } = this.operationsConstants;
    const { projectId } = this.memory.uid.getIds(uid);
    let readOnly = false;
    const uids = await this.memory.projectData.getByItemId(projectId, this.memory.projectData.projectClients) || [];

    await Promise.each(uids, async (uidItem) => {
      const { userId } = this.memory.uid.getIds(uidItem);

      const result = await this.memory.editorMode.get(userId, projectId);
      const { MAIN } = this.operationsConstants.EDITOR_MODE;

      if (!result) return;
      const { mode = EDITOR_MODE.MAIN } = result;

      if (mode !== MAIN && uid !== uidItem) readOnly = true;
    });

    return readOnly;
  }

  /**
   *
   * @param uid
   * @param operation
   * @returns {Promise<Number>}
   */
  async setOperationOrder(uid, operation) {
    const { projectId } = this.memory.uid.getIds(uid);
    const baseOperation = await this.memory.contentJSON.getByElement(uid, operation);
    let currentTemplateOrder = +(await this.memory.projectData.getByItemId(
      projectId,
      this.memory.projectData.templateOrder));

    if (!_.has(operation, 'properties.template.order') && !_.has(baseOperation, 'properties.template.order')) {
      _.set(operation, 'properties.template.order', ++currentTemplateOrder);
      await this.memory.projectData.set(projectId, this.memory.projectData.templateOrder, currentTemplateOrder);
    }

    return operation;
  }

  /**
   *
   * @param uid
   * @param operations
   * @param setConfirmed
   * @returns {Array}
   */
  async saveOperations(uid, operations, setConfirmed = true) {
    const { operationsModel, operationsFactory } = this;

    await Promise.each(operations, async (operation) => {
      const channel = operationsFactory.getOperationChannel(operation);
      const saveOperationAsync = Promise.promisify(operationsModel.saveOperation, { context: operationsModel });
      const isOperationWithTemplate = !_.chain(operation).get('properties.template', {})
        .isEmpty()
        .value();

      if (!this.shouldSaveOperation(operation)) {
        return operation;
      }

      if (isOperationWithTemplate) await this.setOperationOrder(uid, operation);

      const confirmedIndex = await saveOperationAsync(uid, channel, operation);

      if (setConfirmed) {
        operation.confirmed = confirmedIndex;
      }
      operation.channel = channel;
    });

    return operations;
  }

  async clearHoldOperations(uid) {
    try {
      const { projectId, userId } = this.memory.uid.getIds(uid);

      const result = await this.memory.holdModel.delete(projectId, userId);

      if (result.holded) {
        await this.memory.holdModel.clear(projectId);
      }
      this.logSystem.debug(this.constantsEvents.CLEAR_HOLDED, { uid });
      return result;
    } catch (error) {
      this.logSystem.debug(this.constantsEvents.CLEAR_HOLDED_ERROR, { uid, error });
      throw error;
    }
  }

  async getHoldOperations(uid, cb) {
    try {
      const { projectId } = this.memory.uid.getIds(uid);
      const holdedRaw = await this.memory.holdModel.getAll(projectId);
      const holdedUserIds = Object.keys(holdedRaw || {});

      const holdedOps = holdedUserIds.map((userId) => {
        const elements = JSON.parse(holdedRaw[userId]);
        const holdOperation = {
          properties: {
            group: 'collaboration',
            type: 'hold',
            holder: userId,
            elements,
          },
        };

        return holdOperation;
      });

      return typeof cb === 'function' ? cb(null, holdedOps) : holdedOps;
    } catch (error) {
      if (typeof cb === 'function') return cb(error, null);
      throw error;
    }
  }

  /**
   *
   * @param group
   * @param type
   * @param subType
   * @returns {boolean}
   */
  handleModeChanges({ group, type, subType }) {
    const { ACCESS } = this.operationsConstants.TYPE;
    const { DOCUMENT } = this.operationsConstants.GROUP;
    const { CAN_RELOAD, CAN_VIEW } = this.operationsConstants.ACCESS;

    if (group !== DOCUMENT && type !== ACCESS) return false;
    return [CAN_RELOAD, CAN_VIEW].includes(subType);
  }

  /**
   *
   * @param data
   * @param clientStatus
   * @param uid
   * @param accessLevel
   * @returns {Promise<{operations: Array}>}
   * @private
   */
  async _prepareOperationsToBroadcast(data, clientStatus, uid) {
    try {
      const { PROJECT } = this.operationsConstants.CHANNEL;
      const { DOCUMENT, TOOLS } = this.operationsConstants.GROUP;
      const { SOURCE, TEXT, CHECKMARK, SIGNATURE, IMAGE } = this.operationsConstants.TYPE;
      const typesToCheck = [TEXT, CHECKMARK, SIGNATURE, IMAGE];
      const { EDIT } = this.operationsConstants.ACCESS;
      const { OPERATION, AUTHORIZE } = this.clientStatuses;
      const operations = [];
      const access = await this.memory.access.get(uid) || {};

      // TODO clientStatus === AUTHORIZE, костыль потому что в
      // TODO некоторых случаях операции приходят с clientStatus = AUTHORIZE
      // TODO проблема в services/WebSocketConnectionService/services/ClientService/index.js 213
      if (clientStatus === OPERATION || clientStatus === AUTHORIZE) {
        const rawOperations = _.get(data, 'operations', []);

        await Promise.each(_.cloneDeep(rawOperations), async (operation) => {
          let state = false;
          const { group, type, subType } = operation.properties;

          if (group === TOOLS && typesToCheck.includes(type)) state = true; // for fillable fields only
          else if (operation.channel === PROJECT) state = true;
          else if (group === DOCUMENT && type === SOURCE) state = true;
          else state = this.handleModeChanges({ group, type, subType });

          delete operation.confirmed;
          delete operation.channel;

          if (operation.properties && access !== EDIT) { // should disable editing for viewers
            delete operation.properties.template;
            operation.properties.enabled = false;
          }

          state && operations.push(operation);
        });
      }

      return { operations };
    } catch (err) {
      throw err;
    }
  }


  /**
   * @method shouldSaveOperation - omit some unneeded operations
   * @param {Object} operation
   */
  shouldSaveOperation(operation) {
    if (_.has(operation, 'omitOnSave')) {
      delete operation.omitOnSave;

      return false;
    }

    const { GROUP, TYPE } = this.operationsConstants;
    const { group, type } = operation.properties;

    return group !== GROUP.DOCUMENT || type !== TYPE.SOURCE;
  }

  /**
   * @param {String} uid
   * @param {Object} data
   * @param {function} callback
   */
  async sendToProject(uid, data) {
    const { messaging, constantsEvents, memory } = this;
    const { projectId } = memory.uid.getIds(uid);
    const { SEND_TO_PROJECT, WS_PDF } = constantsEvents;

    try {
      if (!data || (data.operations && !data.operations.length)) return null;
      data.uid = uid;
      messaging.publish(messaging.SEND_TO_PROJECT, `${WS_PDF}.${projectId}`, data);
      this.logSystem.debug(SEND_TO_PROJECT, { uid, data });
      return { uid, data };
    } catch (err) {
      this.logSystem.error(SEND_TO_PROJECT, { err: err.toString() });
      throw err;
    }
  }

  /**
   *
   * @param uid
   * @param usersToBroadcast
   * @param operations
   * @param clientStatus
   * @returns {Promise<void>}
   * @private
   */
  async _broadcast({ uid, usersToBroadcast, operations, clientStatus }) {
    let errUid = null;

    try {
      return await Promise.each(usersToBroadcast, async (item) => {
        if (uid === item) return;
        const access = await this.memory.access.get(uid) || {};

        if (access === 'view') return;
        const toBroadcast = await this._prepareOperationsToBroadcast(
          { operations },
          clientStatus,
          item);

        errUid = item;
        await this.sendToProject(item, toBroadcast);

        this.logSystem.debug(
          this.constantsEvents.OPERATIONS_BROADCAST,
          { uid: item }
        );
      });
    } catch (err) {
      this.logSystem.error(
        this.constantsEvents.OPERATIONS_BROADCAST_ERROR,
        { uid: errUid || uid, err: this.coreUtils.stringifyError(err) }
      );
      throw err;
    }
  }

  /**
   *
   * @param uid
   * @returns {Promise<void>}
   * @private
   */
  async _groupUsers(uid) {
    try {
      const { ACCESS } = this.operationsConstants;
      const { projectId } = this.memory.uid.getIds(uid);
      const uids = await this.memory.projectData.getByItemId(projectId, this.memory.projectData.projectClients) || [];

      return Promise.reduce( // group users
        uids,
        async (result, uidItem) => {
          if (uid === uidItem) return result;
          const editorData = await this.memory.editorData.get(uidItem);

          editorData.access === ACCESS.VIEW && result.viewers.push(uidItem);
          editorData.access === ACCESS.EDIT && result.editors.push(uidItem);
          return result;
        }, { viewers: [], editors: [] });
    } catch (err) {
      throw (err);
    }
  }

  /**
   *
   * @param uid
   * @param viewers
   * @param editors
   * @param data
   * @private
   */
  _groupOperations(uid, { viewers, editors }, data) {
    try {
      return Promise.reduce( // group operations
        data.operations || [],
        async (result, item) => {
          const { group, subType, type } = _.get(item, 'properties', {});

          if (this.handleModeChanges({ group, subType, type })) {
            result.toEditor.push(item);
            return result;
          }

          viewers.length && result.toViewer.push(item);
          editors.length && result.toEditor.push(item);
          return result;
        },
        { toViewer: [], toEditor: [] });
    } catch (err) {
      throw err;
    }
  }

  /**
   *
   * @param uid
   * @param data
   * @param clientStatus
   * @returns {Promise<*>}
   */
  async sendToAllClients(uid, data = {}, clientStatus) {
    try {
      const { viewers, editors } = await this._groupUsers(uid);

      if (data.error) {
        return Promise.each(
          [].concat(viewers, editors),
          uidItem => this.sendToProject(uidItem, data));
      }

      const { toViewer, toEditor } = await this._groupOperations(uid, { viewers, editors }, data);

      const [broadcastEditorsRes, broadcastViewersRes] = await Promise.all([
        this._broadcast({ uid, usersToBroadcast: editors, operations: toEditor, clientStatus }),
        this._broadcast({ uid, usersToBroadcast: viewers, operations: toViewer, clientStatus }),
      ]).catch((err) => {
        throw err;
      });

      if (broadcastEditorsRes.length || broadcastViewersRes.length) {
        this.logSystem.debug(
          this.constantsEvents.OPERATIONS_BROADCAST,
          { uid, broadcastViewersRes, broadcastEditorsRes }
        );
      }

      return { broadcastEditorsRes, broadcastViewersRes };
    } catch (err) {
      this.logSystem.error(
        this.constantsEvents.BROADCASTING_ERROR,
        { uid, err: this.coreUtils.stringifyError(err) });
      throw err;
    }
  }

  getAuthRequestProps(operations) {
    const { ACCESS } = this.operationsConstants;
    const authOperation = operations.filter(
      op => op.properties && op.properties.subType === ACCESS.REQUEST
    ).pop();

    if (authOperation) {
      return authOperation.properties.authProps;
    }

    return null;
  }

  async _tryNow(uid, clientStatus, operation) {
    try {
      const authProps = this.getAuthRequestProps([operation]);

      if (authProps) {
        const clientId = await this.memory.uidClient.get(uid);

        await this.handleAuthRequest({ uid, authProps, clientStatus, clientId });
      }
    } catch (err) {
      throw err;
    }
  }

  _versionSave(uid, clientStatus, operation) {
    const { TYPE } = this.operationsConstants;
    const { type } = _.get(operation, 'properties', {});
    const { projectId } = this.memory.uid.getIds(uid);

    if (type === TYPE.PAGES) {
      const versionSaveOp = this.operationsFactory.create('versions', 'save');

      this.messaging.sendToProjectQueue(
        projectId,
        {
          uid,
          operations: [versionSaveOp],
          timestamp: new Date(),
          clientStatus,
        },
      );
    }
  }

  hooks(uid, clientStatus, operations) {
    return Promise.each(operations, operation => Promise.all([
      this._tryNow.call(this, uid, clientStatus, operation),
      this._versionSave.call(this, uid, clientStatus, operation),
    ]));
  }


  /**
   * @param {String} uid
   * @param {Object} data
   */
  logOutput(uid, data = {}, clientStatus) {
    const { constantsEvents, logSystem, errorFactory, channel } = this;
    const { AUTH_OUTPUT, OPERATIONS_OUTPUT, DESTROY_OUTPUT } = constantsEvents;
    const { auth, operations, destroy, error, sessionHash, params, accessLevel } = data;

    if (auth) {
      const phase = this.phase.create({ point: AUTH_OUTPUT });

      logSystem.info(
        AUTH_OUTPUT,
        { sessionHash, uid, auth, phase, channel: this.channel.SERVER }
      );
    }

    if (operations) {
      const phase = this.phase.create({ point: OPERATIONS_OUTPUT, accessLevel });

      logSystem.info(
        OPERATIONS_OUTPUT,
        { sessionHash, uid, phase, channel: this.channel.SERVER }
      );
    }

    if (destroy) {
      const sessionEndTime = Date.now();
      const { uidTimestamp: sessionStartTime } = this.memory.uid.getIds(uid);
      const clientOnline = !_.get(params, 'onTimeout', false);
      const phase = this.phase.create({ point: DESTROY_OUTPUT });

      logSystem.info(
        DESTROY_OUTPUT,
        { sessionHash, uid, destroy, clientOnline, phase, channel: this.channel.SERVER, params }
      );

      logSystem.logSession(sessionStartTime, sessionEndTime, {
        sessionHash,
        uid,
        channel: this.channel.SERVER,
      });
    }

    if (error) {
      const err = errorFactory.systemError(
        error,
        { sessionHash, uid, clientStatus, channel: channel.SERVER },
        'CollaborationService.logOutput'
      );

      const errorToLog = typeof error === 'string' ? { error } : { ...error };

      logSystem.error(err.group, errorToLog);
    }
  }

  /**
   *
   * @param {*} uid
   * @param {*} clientStatus
   * @param {*} clientData
   * @param {*} allClientsData
   */
  async sendDataToAllClients(uid, clientStatus, clientData, allClientsData) {
    if (_.isEmpty(clientData)) return;

    if (_.isEmpty(allClientsData)) {
      allClientsData = Object.assign({}, clientData);
    }

    const sendToRes = await this.sendToProject(uid, clientData);
    const sendToAll = await this.sendToAllClients(uid, allClientsData, clientStatus);

    return {
      sendToRes,
      sendToAll,
    };
  }

  /**
   * @param {String} userId
   * @param {Object} data
   * @param {Function} callback
   */
  async sendToAllUserClients(userUid, data) {
    try {
      const uids = await this.memory.userClients.get(userUid);

      return await Promise.each(uids, uid => this.sendToProject(uid, data));
    } catch (err) {
      throw err;
    }
  }

  /**
   * @param {String} uid
   * @param {String} clientStatus
   * @param {function} callback
   */
  defaultResponseHandler({ uid, clientStatus, accessLevel }, callback = () => {}) {
    const { operationsFactory, config, operationsConstants } = this;
    const { messageTimeout } = config.ManagerService;

    let resTimeout = setTimeout(async () => {
      resTimeout = null;

      const errorPackage = operationsFactory.error(new Error('message timed out'));

      this.logOutput(uid, errorPackage, clientStatus);
      await this.sendToProject(uid, errorPackage);
      callback(null, null);
    }, messageTimeout);

    return async (err, res) => {
      try {
        if (!resTimeout) return;
        clearTimeout(resTimeout);

        if (err) throw err;
        if (!res) return callback(null);

        const payload = _.isArray(res) ? res : [res];
        const result = await Promise.map(payload, async (data) => {
          this.logOutput(uid, data, clientStatus);
          const operationsRaw = _.get(data, 'operations', []);
          const operations = operationsRaw.filter((op) => {
            const {
              group,
              subType,
              type,
            } = op.properties;

            return !this.handleModeChanges({
              group,
              subType,
              type,
            });
          }); // only mode change ops to broadcast

          // TODO bug level critical
          const emptyOperations = _.isEmpty(operationsRaw);
          const selfClientData = emptyOperations ? data : { operations, ...data };

          if (!emptyOperations) {
            return this.sendDataToAllClients(
              uid,
              clientStatus,
              selfClientData,
              { operations: operationsRaw }
            );
          }

          return this.sendToProject(uid, selfClientData);
        });

        callback(null, result);
        return result;
      } catch (error) {
        // TODO : КОСТЫЛЬ !!!!
        // TODO : ПЕРЕПИСАТЬ !!!
        if (!(error instanceof Error)) {
          error.toString = this.coreUtils.stringifyError.bind(null, error);
        }

        const warappedError = {
          error: this.constantsEvents.DEFAULT_HANDLER_ERROR,
          code: operationsConstants.DEFAULT_HANDLER_ERROR,
          cause: error.toString(),
        };

        if (error.code === this.constantsEvents.CONVERSION_ERROR) warappedError.error = error;

        const errToSend = this.operationsFactory.error(warappedError);

        await this.sendToProject(uid, errToSend);

        this.logSystem.error(
          this.constantsEvents.DEFAULT_HANDLER_ERROR,
          {
            uid,
            clientStatus,
            err: this.coreUtils.stringifyError(error),
            code: operationsConstants.DEFAULT_HANDLER_ERROR,
          });
        callback(null, null);
      }
    };
  }

  /**
   * @method authResponseHandler - same as default, but stores data to Redis,
   * and sends a link to RabbitMQ
   * @param {String} uid
   * @param {String} clientStatus
   * @param {String} clientType
   * @param {function} callback
   */
  authResponseHandler({ uid, clientStatus, clientType, reconnect = false }, callback) {
    const splitResponse = clientType === 'ios';
    const responseHandler = this.defaultResponseHandler(
      { uid, clientStatus },
      callback
    );

    return async (error, res) => {
      try {
        if (error || !res) return responseHandler(error, null);

        if (res && !res.auth && res.operations && !res.operations.length) return responseHandler();

        const { operations, auth, accessLevel } = res;
        const saveToRedisData = splitResponse ? { operations } : res;

        if (res.auth) res.auth.isReconnect = reconnect;
        const response = splitResponse && auth ? [{ auth, accessLevel }] : [];
        const dataKey = await this.memory.dataDelivery.put(uid, saveToRedisData);

        if (_.get(res, 'system.authHash', false) && _.get(res, 'system._callFromRest', false)) {
          this.memory.authCache.set(_.get(res, 'system.authHash', false), { dataKey, uid });
        }

        response.push({ dataKey });
        this.logOutput(uid, res, clientStatus);
        responseHandler(null, response);
      } catch (err) {
        throw err;
      }
    };
  }

  /**
   * @method destroyResponseHandler
   * will track project clients and put removeQueue messages to rabbit if needed
   * @param {String} uid
   * @param {String} clientStatus
   * @param {Function} callback
   */
  destroyResponseHandler({ uid, clientStatus, sessionHash }, callback) {
    const { memory, config } = this;
    const responseHandler = this.defaultResponseHandler({ uid, clientStatus }, callback);

    return async (error, result) => {
      try {
        if (error) return responseHandler(error);

        const { projectClients } = result;
        const message = _.omit(Object.assign({}, result, { sessionHash }), ['projectClients']);

        if (!projectClients && config.ManagerService.removeQueue.onDestroy) {
          // if there are no project clients, we can put removeQueue message to Rabbit
          const { projectId } = memory.uid.getIds(uid);

          await this.sendQueueCloseMessage(projectId);
          return responseHandler(null, message);
        }

        responseHandler(null, result);
      } catch (err) {
        responseHandler(err, null);
      }
    };
  }

  /**
   * @method sendQueueCloseMessage
   * send project close message to project queue to RabbitMQ
   */
  async sendQueueCloseMessage(projectId) {
    const queueRemoveMessage = this.messaging.factory.removeQueue(projectId);
    const destroyCounter = await this.memory.queueRemove.incr(projectId);

    this.messaging.sendToProjectQueue(projectId, queueRemoveMessage);
    this.logSystem.info(
      this.constantsEvents.SEND_QUEUE_CLOSE_MSG,
      { message: 'queue close message send' });
    return destroyCounter;
  }

  /** @function getParallelEntries
   * @param {String} uid
   * */
  async getParallelEntries(uid) {
    try {
      const { memory, operationsConstants } = this;
      const uidAccessMap = await memory.access.getAll(uid);
      const parallels = [];

      _.forEach(uidAccessMap, (access, projectClientUid) => {
        if (projectClientUid !== uid && access === operationsConstants.ACCESS.EDIT) {
          parallels.push(projectClientUid);
        }
      });

      return parallels;
    } catch (err) {
      throw err;
    }
  }

  async handleAuthRequest({ uid, authProps, clientStatus, clientId }) {
    const { messaging, operationsFactory, memory } = this;
    const { projectId } = memory.uid.getIds(uid);
    // todo: don't save operations to redis this time.
    const authRequest = operationsFactory.authRequest(authProps);
    const parallelEntries = await this.getParallelEntries(uid);
    const authMessage = Object.assign(authRequest, { uid, clientStatus, parallelEntry: !!parallelEntries.length });

    _.set(authMessage, 'auth.properties.clientId', clientId);
    messaging.sendToProjectQueue(
      projectId,
      authMessage,
    );
    setImmediate(() => {
      parallelEntries.forEach(projectClientUid => this.postDestroyMessage(projectClientUid));
    });

    return {};
  }

  postDestroyMessage(uid, params = {}) {
    this.logSystem.info(this.constantsEvents.DESTROY_IDLE_CLIENT, {
      uid,
      channel: this.channel.SERVER,
      params,
    });
    const { messaging, operationsFactory, memory } = this;
    const message = operationsFactory.destroy({
      uid,
      params: Object.assign(params, { force: true }),
    });
    const { projectId } = memory.uid.getIds(uid);

    messaging.sendToProjectQueue(projectId, message);
  }
}

module.exports = CollaborationService;
