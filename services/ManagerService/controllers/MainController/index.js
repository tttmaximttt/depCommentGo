const async = require('async');
const _ = require('lodash');
const Promise = require('bluebird');
const SystemHelper = require('../../helpers/SystemHelper');

class MainController {

  /**
   *
   * @param apiService
   * @param operationsService
   * @param collaborationService
   * @param systemService
   * @param config
   * @param logSystem
   * @param constantsEvents
   * @param activityHistoryConstants
   * @param messaging
   * @param metrics
   * @param coreUtils
   * @param watcherService
   * @param operationsFactory
   * @param memory
   * @param operationsConstants
   * @param phase
   * @param webhookModel
   * @param contentService
   */
  constructor({
    apiService, operationsService, collaborationService, systemService, config, logSystem,
    constantsEvents, activityHistoryConstants, messaging, metrics, coreUtils,
    watcherService, operationsFactory, memory, operationsConstants, phase, webhookModel,
    contentService, clientsHelper, converterApi, errorFactory, intervalsHub, operationsHelper,
  }) {
    this.apiService = Promise.promisifyAll(apiService);
    this.operationsService = operationsService;
    this.collaborationService = collaborationService;
    this.config = config;
    this.messaging = messaging;
    this.clientsHelper = Promise.promisifyAll(clientsHelper);
    this.logSystem = logSystem;
    this.constantsEvents = constantsEvents;
    this.channel = activityHistoryConstants.channel;
    this.metrics = metrics;
    this.coreUtils = coreUtils;
    this.watcherService = watcherService;
    this.operationsFactory = operationsFactory;
    this.memory = memory;
    this.operationsConstants = operationsConstants;
    this.operationsHelper = operationsHelper;
    this.systemService = systemService;
    this.phase = phase;
    this.webhookModel = webhookModel;
    this.systemHelper = new SystemHelper();
    this.contentService = contentService;
    this.converterApi = converterApi;
    this.errorFactory = errorFactory;
    this.intervalsHub = intervalsHub;
  }

// ------------------------
// CLIENT MESSAGES HANDLERS
// ------------------------

  /**
   *
   * @param message.uid
   * @param message.auth
   * @param message.reconnect
   * @param message.clientStatus
   * @param message.timestamp
   * @param message.connection
   * @param callback
   * @returns {*}
   */
  async auth(message, callback) {
    const { uid, auth, connection, reconnect, clientStatus, timestamp, parallelEntry, clientId } = message;
    let responseHandler = null;
    const { systemHelper, logSystem, constantsEvents, channel, errorFactory } = this;
    const { projectId } = this.memory.uid.getIds(uid);
    const { TYPE, GROUP } = this.operationsConstants;

    try {
      const messageAge = systemHelper.isOldMessage(timestamp);

      if (messageAge) {
        const err = new Error('Old auth message from WebSocketConnectionService');
        const error = errorFactory.systemError(
          err,
          { uid, auth, reconnect, clientStatus, timestamp, channel: channel.SERVER },
          'MainController.auth',
          'messageAge'
        );

        logSystem.error(error.group, { ...error });

        return callback(null, null);
      }

      const { apiService, collaborationService, contentService } = this;
      const { sessionHash, clientType, device } = auth.properties;
      const point = constantsEvents.AUTH_INPUT;
      const isDeactivatedEnv = await this.memory.isDeactivatedEnv.get();
      const origin = _.get(auth, 'properties.location.origin', null);
      const referrer = _.get(auth, 'properties.referrer', null);
      const compoundLocation = `${origin}/en/project/${projectId}.html`;
      const referrerLocation = referrer || compoundLocation;
      const phase = this.phase.create({ point });

      responseHandler = collaborationService.authResponseHandler(
        { uid, clientStatus, clientType, reconnect },
        callback
      );

      if (+isDeactivatedEnv) {
        const err = {
          message: 'Env is deactivated.',
          location: referrerLocation,
        };

        this.logSystem.warning('ENV_IS_NOT_ACTIVE', { uid, auth, sessionHash, referrerLocation });

        return await responseHandler(err);
      }

      logSystem.info(
        point,
        { uid, device, auth, connection, channel: channel.CLIENT, phase }
      );

      const authResponse = {
        operations: [],
        sessionHash,
        reconnect,
      };
      const authRequest = auth.properties;

      if (!authRequest.urlParams) authRequest.urlParams = {};

      if (authRequest.urlParams.authHash) {
        authResponse.system = {
          authHash: authRequest.urlParams.authHash,
          _callFromRest: authRequest._callFromRest || false,
        };
        const { dataKey } = await this.memory.authCache.get(authRequest.urlParams.authHash);

        if (dataKey && !authRequest._callFromRest) {
          await this.memory.authCache.remove(authRequest.urlParams.authHash);
          // todo: не надо так делать. Старый responseHandler остался, через минуту улетит ошибка
          const defaultResponseHandler = collaborationService.defaultResponseHandler(
            { uid, clientStatus },
            callback
          );

          return defaultResponseHandler(null, [{ dataKey }]);
        }
      }

      const apiAuthResponse = await apiService.authClient(uid, authRequest, reconnect, clientId);
      const dispatcherUrl = _.get(apiAuthResponse, 'auth.project.dispatcherUrl');

      await this.memory.editorData.apply(uid, { referrerLocation, dispatcherUrl });

      const { forceTryNow, accessLevel } = apiAuthResponse;
      const {
        accessOperation,
        authDataOps,
        // editorModeOp, // todo: needed for init operation
       } = _.get(apiAuthResponse, 'operations', {});
      const { launch } = auth.properties;
      const autoAuth = reconnect || parallelEntry || forceTryNow;
      const authClientId = _.get(auth, 'properties.clientId', null);

      if (forceTryNow) {
        return await responseHandler(null, null);
      }

      authResponse.auth = apiAuthResponse.auth;
      if (authClientId) _.set(authResponse, 'auth.clientId', authClientId);

      if (!_.isEmpty(authDataOps)) {
        authResponse.operations = [...authResponse.operations, ...authDataOps];
      }

      if (!forceTryNow && Object.keys(apiAuthResponse).length) {
        if (accessOperation && accessLevel) {
          return await responseHandler(null, { operations: [accessOperation], accessLevel });
        }
        const payload = await contentService.getDocumentOperations({
          ...apiAuthResponse,
          uid,
          clientType,
          launch,
          reconnect,
          authRequest,
          authResponse,
        });

        authResponse.operations = [...authResponse.operations, ...payload.operations];
      }

      const item = _.find(
        authResponse.operations,
        op => op.properties.group === GROUP.DOCUMENT && op.properties.type === TYPE.ACCESS
      );

      if (!_.isEmpty(item) && !authResponse.accessLevel) {
        authResponse.accessLevel = item.properties.subType;
      }

      await collaborationService.setIds(uid,
          this.config.clientId,
          authResponse.operations,
        );
      await collaborationService.saveOperations(
        uid,
        authResponse.operations,
        false,
      );

      const projectOpsCount = await this.memory.projectOperations.count(projectId);

      if (!reconnect) {
        const projectOperations = await this.memory.projectOperations.get(projectId);

        await Promise.all([
          this.contentService.buildContentJSON({ uid, operations: projectOperations, initial: true }),
          this.contentService.updatePageOp(projectId, projectOperations),
        ]);

        await contentService.makeDocumentContentHash({ uid });
      }

      if (!autoAuth) {
        await this.memory.projectData.set(
          projectId,
          this.memory.projectData.projectOpsCount,
          projectOpsCount);
      }

      this.intervalsHub.start(uid, () => {
        this.contentService.saveContent(uid, { clearDataFlag: false })
          .catch(error => this.logSystem.error(this.constantsEvents.AUTO_SAVE_FAIL, { uid, error }));
      }, this.config.ManagerService.autoSave);

      return await responseHandler(null, authResponse);
    } catch (err) {
      this.intervalsHub.stop(uid);

      if (err.group) {
        logSystem.error(err.group, { ...err });
      } else {
        const error = errorFactory.systemError(err, null, 'MainController.auth');

        logSystem.error(error.group, { ...error });
      }
      return responseHandler(err);
    }
  }

  async operations({ operations, uid, clientStatus, accessLevel, timestamp }, callback) {
    const setImmediatePromise = Promise.promisify(setImmediate);
    const { systemHelper, logSystem, channel, errorFactory, operationsService, collaborationService, config,
      contentService, operationsConstants } = this;
    const messageAge = systemHelper.isOldMessage(timestamp);
    const { EDITOR_MODE } = operationsConstants;
    const responseHandler = (err, data) => {
      const proxy = collaborationService.defaultResponseHandler(
        { uid, clientStatus, accessLevel },
        callback
      );

      if (err) {
        if (err.message === EDITOR_MODE.VERSIONS) {
          data = err.data;
          err = null;
        }
      }
      proxy(err, data);
    };

    if (messageAge) {
      const err = new Error('Old operations message from WebSocketConnectionService');
      const error = errorFactory.systemError(
        err,
        { uid, operations, clientStatus, timestamp, channel: channel.SERVER },
        'MainController.operations',
        'messageAge'
      );

      logSystem.error(error.group, { ...error });

      return responseHandler(error);
    }

    operationsService.logOperations(uid, operations, channel.CLIENT);

    if (!operations.length) return responseHandler();

    operations = operationsService.handleListOfOperations(uid, clientStatus, operations);

    try {
      // processedOperations contains array of operations and may contains auth/destroy objects
      let processedOperations = await operationsService.processOperations(uid, operations);
      const opsToPostProcess = _.get(processedOperations, 'operations', []);

      setImmediatePromise()
        .then(() => collaborationService.hooks(uid, clientStatus, opsToPostProcess))
        .catch((err) => {
          logSystem.error(this.constantsEvents.POST_PROCESS_OPERATION_ERROR, { error: err, uid });
        });

      const { extended = {} } = processedOperations;
      const { contentConversionRequired, skipIds, refreshKeys } = extended;
      const { clientId } = config;

      if (contentConversionRequired) {
        processedOperations = await contentService.getContentOperations({
          ...extended,
          callStackOperations: processedOperations.operations,
          setFakeIds: true,
          clientId,
        });
      }
      if (skipIds) {
        const err = new Error(EDITOR_MODE.VERSIONS);

        err.data = processedOperations;
        throw err;
      }

      if (refreshKeys) await contentService.refreshKeys(uid);

      await collaborationService.setAndSaveOperations(uid, processedOperations.operations, true);

      processedOperations.operations =
        await contentService.buildContentJSON({ operations: processedOperations.operations, uid });

      return responseHandler(null, {
        auth: processedOperations.auth,
        operations: processedOperations.operations,
      });
    } catch (err) {
      return responseHandler(err);
    }
  }

  async destroy(message, callback = () => {}) {
    const { uid, params = {}, connection, sessionHash, clientStatus, timestamp } = message;

    this.intervalsHub.stop(uid); // CLEAR INTERVAL JOB

    const {
      apiService, collaborationService, operationsService, operationsFactory, contentService,
      memory, systemHelper, logSystem, constantsEvents, channel, operationsConstants,
      clientsHelper, errorFactory,
    } = this;
    const { userId, projectId } = memory.uid.getIds(uid);
    const responseHandler = collaborationService.destroyResponseHandler(
      { uid, clientStatus, sessionHash },
      callback
    );

    try {
      const messageAge = systemHelper.isOldMessage(timestamp);
      const editorMode = await memory.editorMode.get(userId, projectId);

      if (messageAge) {
        const err = new Error('Old destroy message from WebSocketConnectionService');
        const error = errorFactory.systemError(
          err,
          { uid, params, sessionHash, clientStatus, timestamp },
          'MainController.destroy',
          'messageAge'
        );

        logSystem.error(error.group, { ...error });

        return responseHandler(error);
      }

      const prepareNativeCommandOperations = Promise.promisify(
        this.operationsService.prepareNativeCommandOperations,
        { context: this.operationsService });
      const processOperations = Promise.promisify(
        operationsService.processOperations,
        { context: operationsService });

      const { EDITOR_MODE } = operationsConstants;
      const { DESTROY_INPUT } = constantsEvents;
      const phase = this.phase.create({ point: DESTROY_INPUT });
      const mainOps = operationsFactory.editorMode(EDITOR_MODE.MAIN, true);

      logSystem.info(
        DESTROY_INPUT,
        { uid, params, phase, sessionHash, channel: channel.CLIENT, connection },
      );

      // SWITCH TO MAIN
      if (editorMode) {
        const mainModeSwitchResult = await processOperations(uid, [mainOps]);

        if (!mainModeSwitchResult.operations.length) {
          const error = errorFactory.customError(
            new Error(constantsEvents.SWITCH_TO_MAIN_FAIL),
            { uid, sessionHash },
            'MainController.destroy',
            constantsEvents.SWITCH_TO_MAIN_FAIL
          );

          logSystem.error(error.group, { ...error });

          return responseHandler({
            code: constantsEvents.SWITCH_TO_MAIN_FAIL,
            uid,
            sessionHash,
          }, null);
        }

        logSystem.debug(constantsEvents.SWITCH_TO_MAIN, { uid, sessionHash });
      }

      await prepareNativeCommandOperations(uid);

      const destroyParams = Object.assign({ sessionHash }, params);
      const contentData = await contentService.saveContent(uid, destroyParams);
      const destroyResult = await apiService.disconnectClient(uid, { destroyParams, contentData });
      const parallelEntries = await this.collaborationService.getParallelEntries(uid);

      if (!parallelEntries.length) {
        await this.memory.contentJSON.clear(uid);
      }

      return responseHandler(null, destroyResult);
    } catch (err) {
      const error = errorFactory.customError(
        err, { uid, sessionHash }, 'MainController.destroy', constantsEvents.DESTROY_FAIL
      );

      logSystem.error(error.group, { ...error });

      clientsHelper.removeClient(uid)
        .catch((innerError) => {
          const _error = errorFactory.customError(
            innerError, { uid, sessionHash }, 'MainController.destroy', constantsEvents.REMOVE_CLIENT_FAIL
          );

          logSystem.error(_error.group, { ..._error });
        });

      return responseHandler(err);
    }
  }

// -----------------------
// SYSTEM EVENTS
// -----------------------

  newProject({ projectId }) {
    const { logSystem, constantsEvents } = this;

    logSystem.info(constantsEvents.MESSAGING_NEW_PROJECT, { projectId });
  }

  projectClose({ projectId }) {
    const { logSystem, constantsEvents } = this;

    logSystem.info(constantsEvents.MESSAGING_PROJECT_CLOSE, { projectId });
  }

  system({ system }, callback) {
    const {
      config, logSystem, constantsEvents, watcherService, systemService, collaborationService,
    } = this;
    const { removeQueue, projectWatcher, hookId, hookData } = system;

    logSystem.info(constantsEvents.SYSTEM_MESSAGE, system);

    if (removeQueue) return systemService.removeQueue(removeQueue, callback);
    if (projectWatcher) {
      const { disconnectTimeout } = config.ManagerService.projectsWatcher;

      watcherService.idleProjectsChecker(disconnectTimeout, (projectId =>
        collaborationService.sendQueueCloseMessage(projectId)))();
      return callback();
    }
    if (hookId) {
      systemService.runWebhook(hookId, hookData);
      return callback();
    }
    /*
    * call callback for all unhandled cases
    */
    callback();
  }

  onRabbitMessage() {
    this.logSystem.onRabbitMessage();
  }

// -----------------------
// INTERVAL JOBS
// -----------------------

  startIntervalJobs(isReconnect) {
    const { metrics, messaging, watcherService, collaborationService } = this;

    if (isReconnect) return;
    watcherService.watchIdleProjects(projectId =>
      collaborationService.sendQueueCloseMessage(projectId));

    this.metrics.startInterval(() =>
      messaging.getProjects().length, metrics.keys.MANAGER_PROJECTS);
  }

// ----------------------
// REST REQUESTS HANDLERS
// ----------------------

  // SIGNATURES
  signatures({ signatureDone, signatureOpen, userId }, callback) {
    const { operationsFactory, collaborationService, errorFactory, logSystem } = this;

    if (signatureOpen) {
      const operation = operationsFactory.content(
        'pending',
        {},
        null,
        this.operationsConstants.GROUP.SIGNATURES
      );

      collaborationService.sendToAllUserClients(
        userId,
        { operations: [operation] },
        callback
      );
    }

    if (signatureDone) {
      async.waterfall([
        async () => this.converterApi.xmlToJson(
          { signatures: [signatureDone] }, userId, userId
        ),
        (sigJSONList, next) => {
          const operation = operationsFactory.create(
            'signatures',
            'add',
            'curve',
            sigJSONList[0]
          );

          collaborationService.sendToAllUserClients(
            userId,
            { operations: [operation] },
            next
          );
        },
      ], (err, res) => {
        if (err) {
          const error = errorFactory.systemError(err, null, 'MainController.signatures');

          logSystem.error(error.group, { ...error });
        }

        callback(err, res);
      });
    }
  }

  // REST_DOCUMENT_CONTENT_REQUEST => REST_DOCUMENT_CONTENT_RESPONSE
  async getDocumentContent(payload, callback) {
    try {
      const response = await this.apiService.makeDocumentContent(payload);

      callback(null, response);
    } catch (err) {
      callback(err);
    }
  }
}

module.exports = MainController;
