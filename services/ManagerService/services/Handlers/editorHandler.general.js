const _ = require('lodash');
const availableModes = require('../OperationsService/availableModes');

module.exports = class TokenOpsHandler {
  constructor(injector) {
    this.memory = injector.memory;
    this.operationsConstants = injector.operationsConstants;
    this.operationsHelper = injector.operationsHelper;
    this.constantsEvents = injector.constantsEvents;
    this.logSystem = injector.logSystem;
    this.operationsFactory = injector.operationsFactory;
    this.coreUtils = injector.coreUtils;
    this.collaborationService = injector.collaborationService;
    this.channel = injector.activityHistoryConstants.channel;
    this.availableModes = availableModes(this.operationsConstants);
    this.errorFactory = injector.errorFactory;
  }

  _canSwitchMode(currentMode, targetMode) {
    return _.get(this.availableModes, [currentMode, targetMode], false);
  }

  _defineActivity(from, to) {
    const { CONSTRUCTOR } = this.operationsConstants.EDITOR_MODE;
    const { CONSTRUCTOR_OPEN, CONSTRUCTOR_CLOSE } = this.constantsEvents;
    let activityName = null;

    if (to === CONSTRUCTOR) {
      activityName = CONSTRUCTOR_OPEN;
    } else if (from === CONSTRUCTOR) {
      activityName = CONSTRUCTOR_CLOSE;
    }

    return activityName;
  }

  async _handleModeOperation(uid, operation) {
    const { operationsConstants, memory, constantsEvents, logSystem, collaborationService,
      operationsFactory, errorFactory } = this;

    try {
      const operations = [];
      const { editorMode, projectOperations } = memory;
      const { projectId, userId } = memory.uid.getIds(uid);
      const { EDITOR_MODE } = operationsConstants;
      const targetMode = _.get(operation, 'properties.subType', 'none');

      const readOnly = await collaborationService.getMutableAccess(uid);

      if (readOnly) {
        return this.operationsFactory.accessCanView();
      }
      let modeData = await editorMode.get(userId, projectId);

      if (!modeData) {
        modeData = {};
        const err = new Error('editorMode data is missing, using default MAIN mode');
        const error = errorFactory.customError(
          err,
          { uid, operation },
          'editorHandler._handleModeOperation',
          constantsEvents.LOGIC_ERROR
        );

        logSystem.error(error.group, { ...error });
      }

      const { mode = EDITOR_MODE.MAIN, operationsCount = -1 } = modeData;

      if (mode !== targetMode && !this._canSwitchMode(mode, targetMode)) {
        const error = {
          message: `cannot switch from ${mode} to ${targetMode}`,
          code: operationsConstants.ERROR_CODE.WRONG_MODE_SWITCH,
        };

        _.assign(operation.properties, { allowed: false, error });
        return operation;
      }

      if (!operationsConstants.EDITOR_MODE[targetMode.toUpperCase()]) {
        const error = {
          message: `wrong mode ${targetMode}`,
          code: operationsConstants.ERROR_CODE.EDITOR_MODE_NOT_EXISTS,
        };

        _.assign(operation.properties, { allowed: false, error });
      } else {
        const activityName = this._defineActivity(mode, targetMode);
        const logData = { uid, mode, targetMode, channel: this.channel.SERVER };
        const editorModeData = {
          operationsCount,
          setBy: uid,
          mode: targetMode,
          time: operation.actionTime || Date.now(),
        };

        _.assign(operation.properties, { allowed: true, subType: targetMode });

        if (activityName === constantsEvents.CONSTRUCTOR_OPEN) {
          editorModeData.operationsCount = await projectOperations.count(projectId);
        }

        if (activityName === constantsEvents.CONSTRUCTOR_CLOSE && operationsCount) {
          const ops = await projectOperations.getFrom(projectId, operationsCount) || [];

          if (ops.length) {
            logData.dataChanged = true;
            logData.newOperations = ops;
          }
        }

        activityName && logSystem.info(activityName, logData);
        const isModeSet = await editorMode.set(
          userId,
          projectId,
          editorModeData);

        if (isModeSet && editorModeData.mode === 'main') {
          operations.push(operationsFactory.accessCanReload());
        }
      }
      operations.push(operation);
      return operations;
    } catch (err) {
      const error = errorFactory.systemError(err, { uid }, 'editorHandler._handleModeOperation');

      logSystem.error(error.group, { ...error });

      throw err;
    }
  }

  async _handleTokenOps({ uid, operation }) {
    try {
      let result = null;
      const { CHANGE } = this.operationsConstants.SUB_TYPE;
      const { subType, token } = operation.properties || {};

      switch (subType) {
        case CHANGE:
          if (!token) {
            throw new Error('Field token required');
          }

          result = await this.memory.editorData.update(uid, 'urlParams.token', token);
          break;
        default :
          throw new Error(
            `'${operation.properties.type}' type can't be handled with sub type ${subType}`
          );
      }

      if (!result) {
        throw new Error('Token not set');
      }

      return operation;
    } catch (err) {
      throw err;
    }
  }

  _restoreDefaults(uid, defaults) {
    const defaultsToSave = defaults;

    return async () => {
      this.logSystem.debug(this.constantsEvents.DEFAULT_RESTORED, { uid, defaultsToSave });
      await this.memory.userOperations.set(uid, defaultsToSave);
      return defaultsToSave;
    };
  }

  async _handleDefaultsOperation(uid, operation) {
    let restore = null;

    try {
      const todoListState = _.get(operation, 'properties.todoListState');

      const { updatedDefault, prevDefaults } = await this.memory.userOperations.updateDefaults(uid, operation);

      restore = this._restoreDefaults(uid, prevDefaults);
      if (updatedDefault) {
        const validationResult = this.operationsHelper.validate(uid, updatedDefault, 3);

        if (validationResult) {
          throw validationResult;
        }
      }

      if (todoListState) {
        this.logSystem.info(
          this.constantsEvents.SESSION_UPDATE,
          { uid, todoListState, channel: this.channel.SERVER }
        );
      }

      this.logSystem.debug(this.constantsEvents.DEFAULT_UPDATE_SUCCESSFUL, { uid });

      return operation;
    } catch (err) {
      const { VALIDATION_ERROR } = this.constantsEvents;
      const error = this.errorFactory.customError(
        { err },
        { uid, channel: this.channel.SERVER },
        'OperationsHelper.validateDocument',
        this.constantsEvents.DEFAULT_UPDATE_FAIL,
      );

      this.logSystem.error(error.group, { ...error });

      if (err.name === VALIDATION_ERROR) {
        if (typeof restore === 'function') return restore();
      }

      throw err;
    }
  }

  /**
   *
   * @param uid
   * @param operation
   * @param callback
   * @returns {Promise<*>}
   */
  async handle(uid, operation) {
    try {
      const { MODE, TOKEN, DEFAULTS } = this.operationsConstants.TYPE;
      let result = null;

      switch (operation.properties.type) {
        case TOKEN:
          result = await this._handleTokenOps({
            uid,
            operation,
          });
          break;
        case MODE:
          result = await this._handleModeOperation(
            uid,
            operation,
          );
          break;
        case DEFAULTS:
          result = await this._handleDefaultsOperation(
            uid,
            operation,
          );
          break;
        default:
          result = operation;
      }

      return result;
    } catch (err) {
      throw err;
    }
  }
};
