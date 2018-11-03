const _ = require('lodash');
const operationValidator = require('operation_validator');

const VALIDATION_LEVEL = 2;
const IMAGE_RECOGNITION_FORMATS = ['jpeg', 'png'];

class OperationsHelper {

  /**
   * @param {object} operationsConstants
   * @param {LogSystem} logSystem
   * @param {object} constantsEvents
   * @param {object} activityHistoryConstants
   * @param {Memory} memory
   * @param {OperationsConverter} operationsConverter
   */
  constructor({ operationsConstants, logSystem, constantsEvents, activityHistoryConstants,
    memory, operationsConverter, config, snapshotModel, errorFactory,
  }) {
    this.operationsConstants = operationsConstants;
    this.logSystem = logSystem;
    this.constantsEvents = constantsEvents;
    this.memory = memory;
    this.operationsConverter = operationsConverter;
    this.channel = activityHistoryConstants.channel;
    this.config = config;
    this.snapshotModel = snapshotModel;
    this.errorFactory = errorFactory;
  }

  validate(uid, operation, level) {
    try {
      let validationErr = null;
      const { errorFactory, logSystem, channel, constantsEvents: { VALIDATION_ERROR, VALIDATION_WARNING } } = this;
      const { errors } = operationValidator(operation, level);
      const { strictValidation } = this.config.ManagerService;

      if (errors.length) {
        const errObj = {
          operationId: operation.id,
          operation,
          errors,
        };

        validationErr = new Error();
        validationErr.name = VALIDATION_ERROR;
        validationErr.message = JSON.stringify(errObj);
        validationErr.operations = operation;

        if (this.config.ManagerService.strictValidation) throw validationErr;

        const error = errorFactory.customError(
          { validationErr },
          { uid, channel: channel.SERVER },
          'OperationsHelper.validateDocument',
          VALIDATION_ERROR,
        );

        if (!strictValidation) {
          logSystem.warning(VALIDATION_WARNING, { uid, level, errObj });
        } else {
          logSystem.error(error.group, { ...error });
          throw validationErr;
        }
      }

      return validationErr;
    } catch (err) {
      throw err;
    }
  }
  /**
   * @param {Object} document
   * @param {String} uid
   * @returns {object} valid content and template
   */
  validateDocument({ contentJSON, templateJSON }, uid) {
    const { logSystem, channel, errorFactory } = this;
    const {
      validContent,
      validationErrors: contentValidationErrors,
    } = this.validateContentForExport(contentJSON);
    const {
      validTemplate,
      validationErrors: templateValidationErrors,
    } = this.validateTemplate(templateJSON);

    if (contentValidationErrors.length || templateValidationErrors.length) {
      const error = errorFactory.systemError(
        { contentValidationErrors, templateValidationErrors },
        { uid, channel: channel.SERVER },
        'OperationsHelper.validateDocument'
      );

      logSystem.error(error.group, { ...error });
    }

    return {
      validContent,
      validTemplate,
    };
  }

  /**
   * @param {array} content
   * @returns {object} valid content and validation errors
   */
  validateContentForExport(content) {
    const { TYPE, SUB_TYPE } = this.operationsConstants;
    const validationErrors = [];
    const validContent = content.map(operations =>
      operations.filter((element) => {
        if (element.type === TYPE.CHECKMARK) {
          const result = operationValidator(
            { properties: element }, VALIDATION_LEVEL, true
          );

          if (result.errors.length) {
            validationErrors.push(result.errors);

            return false;
          }
          return true;
        }

        if (element.type === TYPE.IMAGE || element.subType === SUB_TYPE.IMAGE) {
          // content must have these for conversion
          return !!element.owner && (!!element.id || !!element.imageId);
        }

        return true;
      })
    );

    return {
      validContent,
      validationErrors,
    };
  }

  /**
   * @param {Array} template
   * @returns {Object} valid template and validation errors
   */
  validateTemplate(template) {
    const { TYPE } = this.operationsConstants;
    const typesToValidate = [TYPE.TEXT, TYPE.CHECKMARK, TYPE.SIGNATURE, TYPE.IMAGE];
    const validationErrors = [];
    const validTemplate = template.map(operations =>
      operations.filter((operation) => {
        if (typesToValidate.includes(operation.type)) {
          const result = operationValidator(
            { properties: { ...operation, group: 'template' } }, VALIDATION_LEVEL
          );

          if (result.errors.length) {
            validationErrors.push(result.errors);

            return false;
          }
        }

        return true;
      })
    );

    return {
      validTemplate,
      validationErrors,
    };
  }

  /**
   * @param  {Object} operation
   * @param  {Object} operation.properties
   * @returns  {Boolean} is operation valid
   */
  validateRecognizeOperation({ properties }) {
    const { image, imageFormat } = properties;

    return typeof image === 'string' && IMAGE_RECOGNITION_FORMATS.includes(imageFormat);
  }

  /**
   * @param  {Object} data
   * @param  {String} data.uid
   * @param  {String} data.projectId
   * @param  {Function} callback
   */
  conversionCallback({ uid, projectId }, callback) {
    const { logSystem, channel, errorFactory } = this;

    return (errors, result) => {
      if (result) {
        if (errors) {
          let data = { message: errors, channel: channel.SERVER };

          if (uid) {
            data = Object.assign({ uid }, data);
          } else if (projectId) {
            data = Object.assign({ projectId }, data);
          }
          const error = errorFactory.conversionError(
            data,
            null,
            'OperationsHelper.conversionCallback'
          );

          logSystem.error(error.group, { ...error });
        }

        return callback(null, result);
      }

      callback(errors, result);
    };
  }

  filterUniqueOperations(operations) {
    const { UNIQUE_OPERATIONS } = this.operationsConstants;

    const filteredOps = [];
    const uniqueOpsMap = {};

    _.forEachRight(operations, (op) => {
      if (!UNIQUE_OPERATIONS.includes(op.properties.type)) {
        filteredOps.unshift(op);
      } else if (!uniqueOpsMap[op.properties.type]) {
        uniqueOpsMap[op.properties.type] = true;
        filteredOps.unshift(op);
      }
    });

    return filteredOps;
  }

  isListOfOperations(operations) {
    return operations && operations.length > 1;
  }

  getOperationsCreatedOnly(operations = []) {
    const { GROUP } = this.operationsConstants;
    const uniqueLocalIdList = _.filter(
      operations,
      o => (
        _.get(o, 'id.clientId') !== this.config.clientId &&
        _.get(o, 'properties.group') === GROUP.TOOLS
      ))
      .reduce((res, o) => {
        const key = _.get(o, 'properties.pages') ?
          'pages' : _.get(o, 'properties.element.localId');

        if (key === 'pages' && _.get(o, 'properties.initial')) return res;

        if (key) res[key] = o;
        return res;
      }, {});

    return Object.values(uniqueLocalIdList)
      .reduce((res, o) => {
        const key = _.get(o, 'properties.type');

        if (key) res[key] = _.get(res, key, 0) + 1;
        return res;
      }, {});
  }

  getOperationsByType(operations = [], type) {
    return operations.filter(
      op => op.properties && op.properties.type === type
    );
  }

  getOperationsByGroup(operations = [], group) {
    return operations.filter(
      op => op.properties && op.properties.group === group
    );
  }

  maxTemplateOrderWatcher() {
    let maxOrder = 0;

    return (operation) => {
      maxOrder = Math.max(maxOrder, _.get(operation, 'properties.template.order', -1));

      return maxOrder;
    };
  }

  async _setTemplateOperationOrder({ operation, templateOrder }) {
    let setInitValue = false;
    const opertationOrder = _.has(operation, 'properties.template.order');
    const operationOrderVal = _.get(operation, 'properties.template.order');

    // initialize project templates order
    if (opertationOrder && operationOrderVal > templateOrder) {
      templateOrder = operationOrderVal;
    }

    if (!templateOrder && templateOrder !== 0) {
      templateOrder = 0;
      setInitValue = true;
    }

    // check template operation order
    if (!opertationOrder) {
      if (!setInitValue) {
        templateOrder++;
      }

      _.set(operation, 'properties.template.order', templateOrder);
    }

    return { operation, templateOrder };
  }

  getCancelOperations(operations) {
    const { TYPE } = this.operationsConstants;

    return this.getOperationsByType(operations, TYPE.CANCEL);
  }

  /**
   * Prepares operations for TE project
   *
   * @param operations TE commands array
   *
   * @return {array} prepared commands
   */
  prepareCommandOperations(operations = []) {
    const { operationsConstants } = this;
    const { COMMAND } = operationsConstants.SUB_TYPE;
    const commands = operations.filter(op => op.properties.subType === COMMAND);
    const optimizedCommands = this.snapshotModel.optimizeCommands(commands);

    return optimizedCommands;
  }

  async getNativeCommandOperations(projectId) {
    try {
      const { memory } = this;
      const ops = await memory.projectOperations.get(projectId);

      return this.prepareCommandOperations(ops);
    } catch (err) {
      throw err;
    }
  }

  /**
   * @param {Array} operations
   * @returns {Array} users' ids
   */
  checkCommentsOperations(operations) {
    const { TYPE } = this.operationsConstants;
    const comments = operations.filter(op => _.get(op, 'properties.type') === TYPE.COMMENT);
    const usersIds = [];

    comments.forEach(({ properties }) => {
      const { content } = properties;

      if (!usersIds.includes(content.author)) {
        usersIds.push(content.author);
      }

      if (!Array.isArray(content.replies)) return;

      content.replies.forEach(
        reply => !usersIds.includes(reply.author) && usersIds.push(reply.author)
      );
    });

    return usersIds;
  }

  /**
   * @param {Array} operations
   * @returns {Object} Object
   */
  getMappingFillableFieldsContent(operations) {
    let result = null;
    const { GROUP, TYPE } = this.operationsConstants;
    const mappingOps = this.getOperationsByGroup(operations, GROUP.MAPPING);
    const [mappingContent] = this.getOperationsByType(mappingOps, TYPE.LIST);
    const updates = this.getOperationsByType(mappingOps, TYPE.UPDATE);

    if (mappingContent) {
      result = _.reduce(updates, (m, update) => {
        const { properties: p } = update;
        const path = `${p.fieldType}.${p.fieldGroup}`;
        const group = _.get(m, path, []).map((item) => {
          if (item.name === p.fieldName) {
            Object.keys(p.fieldData).forEach((key) => { item[key] = _.uniq(p.fieldData[key]); });
          }
          return item;
        });

        _.set(m, path, group);
        return m;
      }, _.omit(mappingContent.properties, ['type', 'group']));
    }
    return result;
  }

}

module.exports = OperationsHelper;
