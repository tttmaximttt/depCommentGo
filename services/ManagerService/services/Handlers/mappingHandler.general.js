const _ = require('lodash');
const availableModes = require('../OperationsService/availableModes');

module.exports = class TokenOpsHandler {
  constructor(modules) {
    this.memory = modules.memory;
    this.operationsConstants = modules.operationsConstants;
    this.constantsEvents = modules.constantsEvents;
    this.logSystem = modules.logSystem;
    this.operationsFactory = modules.operationsFactory;
    this.coreUtils = modules.coreUtils;
    this.collaborationService = modules.collaborationService;
    this.channel = modules.activityHistoryConstants.channel;
    this.availableModes = availableModes(this.operationsConstants);
  }

  /**
   *
   * @param update
   * @param mappingContent
   * @returns {*}
   * @private
   */
  _applyUpdate(update, mappingContent) {
    const { properties } = update;
    const path = `${properties.fieldType}.${properties.fieldGroup}`;
    const group = _.get(mappingContent, path, []).map((item) => {
      if (item.name === properties.fieldName) {
        Object.keys(properties.fieldData).forEach((key) => { item[key] = _.uniq(properties.fieldData[key]); });
      }
      return item;
    });

    _.set(mappingContent, path, group);
    return mappingContent;
  }

  /**
   *
   * @param uid
   * @returns {Promise<array>}
   * @private
   */
  async _getMappingOp(uid) {
    try {
      const { projectId } = this.memory.uid.getIds(uid);
      const mappingOp = await this.memory.projectData.getByItemId(projectId, this.memory.projectData.mappingOps) || {};

      return mappingOp;
    } catch (err) {
      throw err;
    }
  }

  /**
   *
   * @async
   * @param uid
   * @param operation
   * @returns {Promise<*>}
   * @private
   */
  async _getMappingFillableFieldsContent(uid, operation) {
    try {
      let result = null;
      const mappingContent = await this._getMappingOp(uid);

      if (mappingContent) {
        result = this._applyUpdate(operation, _.omit(mappingContent, ['type', 'group']));
      }

      return result;
    } catch (err) {
      throw err;
    }
  }

  /**
   *
   * @async
   * @param uid
   * @param operation
   * @returns {Promise<void>}
   * @private
   */
  async _update(uid, operation) {
    try {
      const { projectId } = this.memory.uid.getIds(uid);
      const mappingFillableContent = await this._getMappingFillableFieldsContent(uid, operation);

      return this.memory.projectData.set(projectId, this.memory.projectData.mappingOps, mappingFillableContent);
    } catch (err) {
      throw err;
    }
  }

  /**
   *
   * @param uid
   * @param operation
   * @returns {Promise<object>} operation
   */
  async handle(uid, operation) {
    try {
      const { UPDATE } = this.operationsConstants.TYPE;
      let result = null;

      switch (operation.properties.type) {
        case UPDATE:
          await this._update(uid, operation);
          result = operation;
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
