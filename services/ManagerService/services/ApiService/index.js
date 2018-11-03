const async = require('async');
const _ = require('lodash');
const EnabledProperty = require('../../helpers/OperationsConverter/EnabledProperty.js');
const Promise = require('bluebird');

const API_TAGS = {
  EDITOR_AUTH: 'editorAuth',
  GET_DOCUMENT_CONTENT: 'getDocumentContent',
  SET_DOCUMENT_CONTENT: 'setDocumentContent',
  EDITOR_REFRESH: 'editorRefresh',
  DESTROY: 'editorDestroy',
};

const ERR_TAGS = {
  DONE: 'done',
  ACCESS: 'access',
  EDITOR_DATA: 'editorData',
  PROJECT_NOT_FOUND: 'Project Not Found: 6667',
};

class ApiService {

  static get ERR() {
    return ERR_TAGS;
  }

  /**
   * @param {Object} config
   * @param {Object} dbRemote
   * @param {OperationsModel} operationsModel
   * @param {ClientsHelper} clientsHelper
   * @param {Object} operationsConstants
   * @param {OperationsConverter} operationsConverter
   * @param {OperationsFactory} operationsFactory
   * @param {Memory} memory
   * @param {Metrics} metrics
   * @param {Object} timing
   * @param {Object} constantsEvents
   * @param {collaborationService} collaborationService
   * @param {Object} clientStatuses
   * @param {LuaModel} luaModel
   * @param {LogSystem} logSystem
   * @param {OperationsHelper} operationsHelper
   * @param {object} activityHistoryConstants
   * @param {ConverterApi} converterApi
   * @param {GeneralConstants} generalConstants
   */
  constructor({
    config, dbRemote, operationsModel, clientsHelper, operationsConstants,
    operationsConverter, operationsFactory, memory, metrics, timing,
    logSystem, constantsEvents, collaborationService, clientStatuses,
    luaModel, activityHistoryConstants, imageModel,
    operationsService, converterApi, coreUtils, generalConstants, errorFactory,
  }) {
    this.dbRemote = Promise.promisifyAll(dbRemote);
    this.operationsModel = operationsModel;
    this.imageModel = imageModel;
    this.clientsHelper = Promise.promisifyAll(clientsHelper);
    this.operationsConstants = operationsConstants;
    this.operationsConverter = operationsConverter;
    this.operationsFactory = operationsFactory;
    this.memory = memory;
    this.coreUtils = coreUtils;
    this.config = config;
    this.metrics = metrics;
    this.logSystem = logSystem;
    this.timing = timing;
    this.constantsEvents = constantsEvents;
    this.restEndpoint = _.get(config, 'RestAPIService.options.externalHost', null);

    this.collaborationService = Promise.promisifyAll(collaborationService);
    this.clientStatuses = clientStatuses;
    this.luaModel = Promise.promisifyAll(luaModel);
    this.operationsService = Promise.promisifyAll(operationsService);
    this.channel = activityHistoryConstants.channel;
    this.enabledProperty = new EnabledProperty();
    this.converterApi = converterApi;
    this.generalConstants = generalConstants;
    this.errorFactory = errorFactory;
  }

  /** @function reconnectClient - reconnect existing client
   * right now the frontend initiates a full page reload on reconnect
   * this means that we don't use this method at all
   * the reconnect logic will be rewritten later
   * @param {String} uid reconnect
   * @param {Object} authRequest
   * @param {function} callback
   * */
  reconnectClient(uid, authRequest, callback) {
    const {
      operationsModel,
      dbRemote,
      memory,
      operationsConstants,
      restEndpoint,
      generalConstants,
    } = this;
    const { TYPE, ACCESS } = operationsConstants;
    const {
      clientType, launch, api_hash, device, urlParams, confirmedOps, sessionHash, location,
    } = authRequest;
    const { projectId, userId } = memory.uid.getIds(uid);
    const userAgent = _.get(device, 'userAgent', '');

    let crossEditorHost = null;

    async.waterfall([
      async () => {
        crossEditorHost = await memory.crossEditor.getMiddleware(uid);
      },
      next => operationsModel.getMissing(uid, confirmedOps - 1, next),
      (operations, next) => {
        dbRemote.setHost(crossEditorHost).editorAuth(
          userId, projectId, clientType, launch, ACCESS.REQUEST, api_hash, userAgent,
          Object.assign({ sessionHash, restEndpoint }, location, urlParams),
          (err, data) => {
            next(err, data.document.source, operations);
          }
        );
      },
      (source, operations, next) => {
        if (!operations.length) {
          // no new operations
          next(generalConstants.NOOP, []);
        } else {
          next(null, source, operations);
        }
      },
      (source, operations, next) => {
        const operationsWithSources = _.filter(
          operations,
          ['properties.type', TYPE.SOURCE]
        );

        // if there are sources, need to call editor refresh
        if (!operationsWithSources.length) {
          return next(null, operations);
        }

        const { pdf, swf } = source;

        operationsWithSources.forEach((op) => {
          Object.assign(op.properties, { pdf, swf });
        });

        next(null, operations);
      },
    ], (err, operations = []) => {
      callback(err === generalConstants.NOOP ? null : err, { operations });
    });
  }

  async _handleTryNow({ accessData, uid, authRequest, accessLevel }) {
    const {
      memory, restEndpoint, operationsFactory, collaborationService,
    } = this;
    const { projectId, userId } = this.memory.uid.getIds(uid);
    const accessOperation = operationsFactory.accessBusy(accessData);
    const { AUTHORIZE } = this.clientStatuses;
    const projectClients = (await memory.projectData.getByItemId(projectId, memory.projectData.projectClients)) || [];

    if (!this.config.collaborationMode && projectClients.some(_uid => new RegExp(userId).test(_uid))) {
      const clientStatus = AUTHORIZE;
      const clientId = await this.memory.uidClient.get(uid);

      await collaborationService.handleAuthRequest({
        uid,
        authProps: Object.assign({}, authRequest, {
          timestamp: Date.now(),
          serverAuthByTryNow: true,
          restEndpoint,
        }),
        clientStatus,
        clientId,
      });
      return { forceTryNow: true };
    }

    return { operations: { accessOperation }, accessLevel };
  }

  _normalizeAuthProjectData(authProject) {
    if (_.isNull(authProject.owner.email)) authProject.owner.email = '';
    if (_.isNull(authProject.owner.avatar)) authProject.owner.avatar = '';
    if (_.isNull(authProject.viewer.email)) authProject.viewer.email = '';
    if (_.isNull(authProject.viewer.avatar)) authProject.viewer.avatar = '';

    return authProject;
  }

  async authClient(uid, authRequest, reconnect, clientId) {
    const {
      dbRemote, memory, operationsConstants,
      clientsHelper, timing, restEndpoint, metrics,
      operationsConverter, operationsFactory, logSystem, errorFactory,
    } = this;

    try {
      const { ACCESS, EDITOR_MODE } = operationsConstants;
      const { projectId, userId } = memory.uid.getIds(uid);
      const {
        clientType, launch, access, device, urlParams = {}, sessionHash, location,
        confirmedOps,
      } = authRequest;
      const apiHash = authRequest.api_hash;
      const userAgent = _.get(device, 'userAgent', '');
      const crossEditorHost = memory.crossEditor.readFromPackage(authRequest);

      await memory.crossEditor.setMiddleware(uid, crossEditorHost);
      urlParams.env = _.get(this, 'config.logger.env', 'local');


      const requestAccess = reconnect ? ACCESS.REQUEST : access;
      const authUrlParams = Object.assign({ sessionHash, restEndpoint }, location, urlParams);
      const editorAuthData = await dbRemote.setHost(crossEditorHost).editorAuthAsync(
        userId,
        projectId,
        clientType,
        launch,
        requestAccess,
        apiHash,
        userAgent,
        authUrlParams); // TODO reduce count of parameters

      const accessData = editorAuthData.document.access;
      const accessLevel = accessData.subType;
      const workerUrl = _.get(editorAuthData, 'system.workerUrl', false);

      if (accessLevel === ACCESS.DENIED) {
        const accessOperation = operationsFactory.accessDenied(accessData);

        return { operations: { accessOperation }, accessLevel };
      }

      if (accessLevel === ACCESS.BUSY) {
        return this._handleTryNow({ accessLevel, accessData, uid, authRequest });
      }

      if (!workerUrl) {
        const err = new Error('No field system.workerUrl in auth response');
        const error = errorFactory.apiError(err, { uid }, 'editorAuth');

        logSystem.error(error.group, { ...error });
      } else {
        await memory.editorData.apply(uid, { workerUrl });
      }

      await memory.editorData.apply(uid, { sessionHash });

      /** set corresponding client keys in redis */
      const tmingRedisRegisterKey = timing.unique('register client in redis', uid);

      timing.set(tmingRedisRegisterKey);

      if (reconnect) {
        const projectClients =
          (await memory.projectData.getByItemId(projectId, memory.projectData.projectClients)) || [];
        const isFirstClient = projectClients.every(client => client === uid);

        return {
          isFirstClient,
          clientId,
          editorAuthData,
          auth: operationsFactory.authResponse({
            clientId,
            launch,
            reconnect,
            confirmedOps: Number(reconnect && confirmedOps),
            host: authRequest._host,
            projectId: editorAuthData.auth.project,
          }),
        };
      }

      const payload = await clientsHelper.registerClient(uid, accessLevel, clientId);
      const { isFirstClient, isFirstEditor } = payload;
      const time = timing.get(tmingRedisRegisterKey);

      metrics.generalTiming('redis_register_client', time);

      await this.checkForEditorMode(uid, accessData);

      const authDataOps = operationsConverter.fromAuthData(editorAuthData, uid);
      const authDataOpsWithoutScenario = [];
      const scenariosOps = [];

      authDataOps.forEach((op) => {
        const isScenarioOp = operationsConverter.isScenariosOperation(op);

        if (isScenarioOp) {
          scenariosOps.push(op);
        } else {
          authDataOpsWithoutScenario.push(op);
        }
      });

      const editorModeOp = operationsFactory.editorMode(EDITOR_MODE.INIT, true);

      await memory.editorMode.set(
        userId,
        projectId,
        { setBy: uid, mode: EDITOR_MODE.INIT, time: Date.now() });

      const authConfirmedOps = reconnect ?
        confirmedOps + [...authDataOpsWithoutScenario, editorModeOp].length
        :
        confirmedOps;

      const auth = operationsFactory.authResponse({
        clientId,
        launch,
        reconnect,
        confirmedOps: reconnect ? confirmedOps + authConfirmedOps.length : confirmedOps,
        host: authRequest._host,
        projectId: editorAuthData.auth.project,
        endpoints: editorAuthData.system || {},
      });

      this._normalizeAuthProjectData(auth.project);

      return {
        isFirstClient,
        isFirstEditor,
        clientId,
        editorAuthData,
        auth,
        operations: {
          scenariosOps,
          authDataOps: authDataOpsWithoutScenario,
          editorModeOp,
        },
      };
    } catch (err) {
      throw err;
    }
  }

  async checkForEditorMode(uid, accessData) {
    const { memory, operationsConstants } = this;
    const { ACCESS, EDITOR_MODE } = operationsConstants;
    const { userId, projectId } = memory.uid.getIds(uid);

    try {
      const clients = await this.memory.projectData.getByItemId(
        projectId,
        this.memory.projectData.projectClients
      ) || [];
      const editorModes = await Promise.map(clients, (client) => {
        const ids = memory.uid.getIds(client);

        return memory.editorMode.get(ids.userId, ids.projectId);
      });
      const lastEditorMode = _.chain(editorModes).sortBy('time').last().value();

      if (_.isEmpty(lastEditorMode)) {
        return true;
      }
      const { mode, setBy } = lastEditorMode;
      const modeChangeUserId = memory.uid.getIds(setBy).userId;
      const editorModeAllowed = userId === modeChangeUserId || mode === EDITOR_MODE.MAIN;

      if (!editorModeAllowed) {
        const err = {
          type: ApiService.ERR.ACCESS,
          accessLevel: ACCESS.DENIED,
          accessData,
        };

        throw err;
      }
      return true;
    } catch (err) {
      throw err;
    }
  }

  destroy({ uid, defaults, crossEditorHost, urlParams, destroyParams }) {
    const { projectId, userId } = this.memory.uid.getIds(uid);
    const { dbRemote } = this;

    return dbRemote
      .setHost(crossEditorHost)
      .editorDestroyAsync(userId, projectId, defaults, destroyParams, urlParams);
  }

  /**
   *
   * @param uid
   * @param defaults
   * @param crossEditorHost
   * @param urlParams
   * @param api_hash
   * @returns {*}
   */
  saveDefaults({ uid, defaults, crossEditorHost, urlParams, api_hash }) {
    const { projectId, userId } = this.memory.uid.getIds(uid);
    const { dbRemote } = this;

    this.logSystem.info(
      this.constantsEvents.OMIT_DESTROY,
      { userId, projectId, defaults, urlParams, api_hash }
    );
    return dbRemote.setHost(crossEditorHost).editorDefaultsAsync(
      userId,
      projectId,
      defaults,
      urlParams,
      api_hash);
  }

  async _checkEveryAccess(projectClients, accessType) {
    return (await Promise.map(projectClients, this.memory.access.get.bind(this.memory.access)))
      .every(element => element === accessType);
  }

  /**
   * @param {String} uid
   * @param {Object} destroyParams
   * @param {function} callback
   */
  async disconnectClient(uid, { destroyParams, contentData }) {
    let crossEditorHost = null;
    let externalData = null;
    let params = destroyParams;

    try {
      const { operationsFactory, timing, metrics, memory } = this;
      const { DESTROY } = API_TAGS;
      const { sessionHash } = destroyParams;
      const { editorData, rearrangeProcessId, host, isDocumentChanged } = contentData;
      const timingDestroyKey = timing.unique('get redis data', uid);

      if (params.rest) { // location reasign
        const { dispatcherUrl, referrerLocation } = await memory.editorData.get(uid) || {};

        params.location = dispatcherUrl || destroyParams.location || referrerLocation;
      }

      const defaults = await this.memory.userOperations.getByType(uid, this.operationsConstants.TYPE.DEFAULTS) || {};

      const { projectClients } = await this.removeClientData(uid); // REMOVE CLIENT DATA
      const result = Object.assign(operationsFactory.destroy(
        { uid, params: {} }),
        { projectClients }
      );

      if (_.isPlainObject(result) && params.force) {
        result.force = params.force;
      }

      if (!editorData) return result;

      timing.set(timingDestroyKey);
      const redisGetDataTime = timing.get(timingDestroyKey);

      metrics.generalTiming('redis_get_data', redisGetDataTime);
      const data = Object.assign({ rearrangeProcessId }, editorData);
      const { urlParams = {}, api_hash } = data;

      urlParams.sessionHash = sessionHash || _.get(editorData, 'sessionHash', null);
      urlParams.changes = isDocumentChanged;

      /** remove client keys from redis */
      const timingRedisRemoveKey = timing.unique('remove client data', uid);

      timing.set(timingRedisRemoveKey);
      const time = timing.get(timingRedisRemoveKey);

      metrics.generalTiming('redis_remove_data', time);
      crossEditorHost = host;
      // If projectHasClients == true, we don't need to mark project as free,
      // just save the defaults
      // when collaboration mode is `true` we always send destroy
      const isShouldSveDefault = !this.config.collaborationMode &&
        !_.isEmpty(projectClients) &&
        !(await this._checkEveryAccess(projectClients, this.operationsConstants.ACCESS.VIEW));

      if (isShouldSveDefault) {
        await this.saveDefaults({ uid, defaults, crossEditorHost, urlParams, api_hash });
      } else {
        /** destroy client and mark project as available */
        const timingKey = timing.unique(DESTROY, uid);

        timing.set(timingKey);

        const destroyResult = await this.destroy({
          uid,
          defaults: defaults.properties,
          crossEditorHost,
          urlParams,
          destroyParams,
        });

        params = Object.assign({}, params, destroyResult);
      }

      Object.assign(result, { location: params.location, params });
      params.changes = isDocumentChanged;
      delete result.params.location;
      await this.collaborationService.clearHoldOperations(uid);
      externalData = { defaults, urlParams, api_hash, projectClients };

      return result;
    } catch (err) {
      const { logSystem, errorFactory } = this;

      err.externalData = externalData;
      if (err === ApiService.ERR.DONE) {
        return externalData;
      } else if (err === ApiService.ERR.EDITOR_DATA) {
        try {
          await this.removeClientData(uid);
          return externalData;
        } catch (error) {
          throw error;
        }
      }

      if (err && err.message) {
        const error = errorFactory.apiError(err, { uid }, 'ApiService.disconnectClient');

        logSystem.error(error.group, { ...error });
      }

      throw err;
    }
  }

  removeClientData(uid) {
    const { clientsHelper } = this;

    return clientsHelper.removeClient(uid);
  }
}

module.exports = ApiService;
