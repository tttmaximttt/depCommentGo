const _ = require('lodash');

class ActivityHistoryController {

  /**
   *
   * @param { Events } events - list of activity names
   */
  constructor({
    constantsEvents, validation, eventService, clientService, systemService, elasticMessageModel, logger,
    coreUtils, config,
  }) {
    this.constantsEvents = constantsEvents;
    this.validation = validation;
    this.eventService = eventService;
    this.clientService = clientService;
    this.systemService = systemService;
    this.elasticMessageModel = elasticMessageModel;
    this.logger = logger;
    this.stringifyError = coreUtils.stringifyError;
    this.config = config;

    this.onActivityData = this.onActivityData.bind(this);
  }

  /**
   *
   * @param { String } activityName - name of Activity
   */
  switchControllerByType(activityName) {
    let controller = this.unknownActivity;
    const {
      SESSION_INIT, AUTH_INPUT, AUTH_OUTPUT, DESTROY_OUTPUT, SET_DISCONNECT_TIMEOUT,
      OPERATIONS_INPUT, OPERATIONS_OUTPUT, SYSTEM_ERROR, API_ERROR, SCRIPT_EXCEPTION,
      DOCUMENT_STARTED, DOCUMENT_LOADED, EXIT, EDITOR_STARTED, GO_TO_FLASH, TOKEN_CHANGED,
      TRACK_POINT, DESTROY_INPUT, USER_ACTED, WS_CONNECTION_TIMEOUT, WS_CONNECTION_FAILED,
      WS_CONNECTION_ERROR, LOCAL_OPERATION, SEND_PAGE_DATA, SOCKET_CLOSE,
      REARRANGE_STARTED, REARRANGE_COMPLETED, REARRANGE_FAILED,
      CONSTRUCTOR_OPEN, CONSTRUCTOR_CLOSE, CONSTRUCTOR_CANCEL, UNIQUE_TOOLS_OPERATIONS,
      CONVERSION_ERROR, DEFAULT_HANDLER_ERROR, OPERATIONS_BROADCAST_ERROR, BROADCASTING_ERROR,
      SESSION_UPDATE, VALIDATION_ERROR, DEFAULT_UPDATE_FAIL, PENDING_RECOGNIZE_FONT, CONTENT_NOT_SAVE,
      ENV_IS_NOT_ACTIVE, VALIDATION_WARNING,
    } = this.constantsEvents;

    switch (activityName) {

      case SESSION_INIT:
        controller = this.initClient;
        break;
      case AUTH_INPUT:
        controller = this.authInitClient;
        break;
      case SESSION_UPDATE:
        controller = this.updateSessionData;
        break;
      case AUTH_OUTPUT:
        controller = this.authClient;
        break;

      case DESTROY_OUTPUT:
        controller = this.destroyClient;
        break;

      case SET_DISCONNECT_TIMEOUT:
        controller = this.setClientTimeout;
        break;

      case OPERATIONS_INPUT:
      case OPERATIONS_OUTPUT:
        controller = this.saveOperation; // TODO
        break;

      case SYSTEM_ERROR:
      case API_ERROR:
      case SCRIPT_EXCEPTION:
      case REARRANGE_FAILED:
      case CONVERSION_ERROR:
      case OPERATIONS_BROADCAST_ERROR:
      case VALIDATION_ERROR:
      case BROADCASTING_ERROR:
        controller = this.saveError;
        break;

      case PENDING_RECOGNIZE_FONT:
      case CONTENT_NOT_SAVE:
      case ENV_IS_NOT_ACTIVE:
      case VALIDATION_WARNING:
        controller = this.saveWarning;
        break;

      case UNIQUE_TOOLS_OPERATIONS:
        controller = this.saveToClientIndex;
        break;

      case DOCUMENT_STARTED:
      case DOCUMENT_LOADED:
      case EXIT:
      case EDITOR_STARTED:
      case GO_TO_FLASH:
      case TOKEN_CHANGED:
      case TRACK_POINT:
      case DESTROY_INPUT:
      case USER_ACTED:
      case WS_CONNECTION_TIMEOUT:
      case WS_CONNECTION_FAILED:
      case WS_CONNECTION_ERROR:
      case LOCAL_OPERATION:
      case SEND_PAGE_DATA:
      case REARRANGE_STARTED:
      case REARRANGE_COMPLETED:
      case CONSTRUCTOR_OPEN:
      case CONSTRUCTOR_CLOSE:
      case CONSTRUCTOR_CANCEL:
      case DEFAULT_HANDLER_ERROR:
      case DEFAULT_UPDATE_FAIL:
        controller = this.saveHistoryAction;
        break;
      case SOCKET_CLOSE:
        controller = this.socketClose;
        break;

      default:
    }
    return controller;
  }

  /**
   * @param {Object} data - data to log
   * @param {Function} callback - call to remove message from rabbit. Invoked with err = null
   *
   * to send smth to ActivityHistoryService, call messaging.logActivity(dataToLog)
   */
  onActivityData(data, callback) {
    const error = this.validation.verify(data);
    const customCallBack = this.customCallback.bind(this, callback);

    if (error) return customCallBack(error);

    const payload = Object.assign(
      data,
      {
        activityName: data.activityName.replace(/^ACTIVITY_HISTORY_/, ''),
        entryActivityName: data.activityName,
      }
    );

    this.switchControllerByType(payload.activityName).call(this, payload, customCallBack);
  }

  /**
   * @param {Object} data
   * @param {Function} callback
   */
  onSystemEvent(data, callback) {
    const { DRAIN_REDIS_TO_ELASTIC } = this.constantsEvents;
    const { systemEvent } = data;
    const customCallback = this.customCallback.bind(this, callback);

    switch (systemEvent) {
      case DRAIN_REDIS_TO_ELASTIC:
        return this.drainRedisToElastic(customCallback);

      default: customCallback(null);
    }
  }

  /**
   * @param {Function} callback
   * @param {Object} err
   * @param {Object} info
   */
  customCallback(callback, err) {
    if (err) {
      if (err instanceof Error) err = this.stringifyError(err);
      this.logger.error('ActivityHistory:', { err, path: __dirname });
    }

    return callback(null);
  }

  /**
   * @param {Object} data
   * @param {Function} callback
   */
  authInitClient(data, callback) {
    const { sessionHash, clientType, appVersion } = _.get(data, 'auth.properties', {});

    data = Object.assign(
      {},
      data,
      { clientType, appVersion, sessionHash: (sessionHash || data.sessionHash) },
    );

    this.clientService.initClient(data, callback);
  }

  /**
   * @param {Object} data
   * @param {Function} callback
   */
  initClient(data, callback) {
    this.clientService.initClient(data, callback);
  }

  /**
   * @param {Object} data
   * @param {Function} callback
   */
  updateSessionData(data, callback) {
    this.eventService.updateSessionData(data, callback);
  }

  /**
   * @param {Object} data
   * @param {Function} callback
   */
  authClient(data, callback) {
    data = Object.assign(
      {},
      data,
      { sessionHash: _.get(data, 'auth.properties.sessionHash', data.sessionHash) }
    );

    this.clientService.authClient(data, callback);
  }

  /**
   * @param {Object} data
   * @param {Function} callback
   */
  destroyClient(data, callback) {
    this.clientService.destroyClient(data, callback);
  }

  /**
   * @param {Object} data
   * @param {Function} callback
   */
  setClientTimeout(data, callback) {
    this.clientService.setTimeoutStatus(data, callback);
  }

  /**
   * @param {Function} callback
   */
  drainRedisToElastic(callback) {
    this.systemService.drainRedisToElastic(callback);
  }

  /**
   *
   * @param {*} args
   */
  saveError(data, callback) {
    this.eventService.saveError(data, callback);
  }

  saveWarning(data, callback) {
    this.eventService.saveWarning(data, callback);
  }

  /**
   * @param {Object} data
   * @param {Function} callback
   */
  saveOperation(data, callback) {
    const payload = Object.assign({}, data);

    if (!this.config.debug) {
      payload.operations = this.elasticMessageModel.operations(_.get(data, 'operations', []));
    }
    this.eventService.addToHistory(payload, callback);
  }

  /**
   * @param {Object} data
   * @param {Function} callback
   */
  saveHistoryAction(data, callback) {
    this.eventService.addToHistory(data, callback);
  }

  /**
   * @param {Object} data
   * @param {Function} callback
   */
  socketClose(data, callback) {
    const payload = Object.assign({}, data);

    this.eventService.socketClose(payload, callback);
  }

  /**
   * @param {Object} data
   * @param {Function} callback
   */
  saveToClientIndex(data, callback) {
    this.eventService.saveToClientIndex(data, callback);
  }


  unknownActivity(...args) {
    this.logger.info('ActivityHistory INFO:', { msg: 'UKNOWN ACTIVITY', args });
    args.pop()();
  }

}

module.exports = ActivityHistoryController;
