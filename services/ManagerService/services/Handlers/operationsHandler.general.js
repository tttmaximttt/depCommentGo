const _ = require('lodash');
const availableModes = require('../OperationsService/availableModes');

module.exports = class TokenOpsHandler {
  constructor(injector) {
    this.memory = injector.memory;
    this.operationsModel = injector.operationsModel;
    this.operationsHelper = injector.operationsHelper;
    this.operationsConstants = injector.operationsConstants;
    this.constantsEvents = injector.constantsEvents;
    this.logSystem = injector.logSystem;
    this.operationsFactory = injector.operationsFactory;
    this.coreUtils = injector.coreUtils;
    this.dbRemote = injector.dbRemote;
    this.collaborationService = injector.collaborationService;
    this.channel = injector.activityHistoryConstants.channel;
    this.availableModes = availableModes(this.operationsConstants);
  }

  /**
   *
   * @param removedPages
   * @param {object} operations
   * @param {string} uid
   * @returns {Promise<string|null>} pdfUrl
   * @private
   */
  async _handlePageCancelOp(removedPages, operations, uid) {
    try {
      const { userId, projectId } = this.memory.uid.getIds(uid);
      const pagesToProcess = removedPages.find(item => _.has(item, 'properties.processId'));

      if (pagesToProcess) {
        const processId = _.chain(operations)
          .findLast(item => _.has(item, 'properties.processId'))
          .get('properties.processId');

        if (processId) {
          await this.memory.projectData.set(projectId, this.memory.projectData.rearrangeProcessId, processId);
          return this.dbRemote.loadTempPdfAsync({
            projectId,
            processId,
            viewerId: userId,
            mode: null,
            read: null,
          });
        } else { //eslint-disable-line
          await this.memory.projectData.clear(projectId);
          return this._editorRefresh(uid);
        }
      }
    } catch (err) {
      throw err;
    }
  }

  /**
   *
   * @async
   * @param {string} uid
   * @returns {Promise<string|null>}
   * @private
   */
  async _editorRefresh(uid) {
    try {
      const { userId, projectId } = this.memory.uid.getIds(uid);
      const res = await this.dbRemote.editorRefreshAsync({ userId, projectId, clientType: 'js', launch: 'editor' });

      return _.get(res, 'source.pdf.url', null);
    } catch (err) {
      throw err;
    }
  }

  /**
   *
   * @async
   * @param {string} uid
   * @param {object} operation
   * @returns {Promise<object>} operation
   * @private
   */
  async _handleCancelOp(uid, operation) {
    try {
      const { OPERATIONS_CANCEL, TYPE } = this.operationsConstants;
      const { subType, forcePull, byMode, byId, sourceRequired } = operation.properties;
      const id = subType === OPERATIONS_CANCEL.CANCEL_BY_MODE ? byMode : byId;
      const canceledData = await this.operationsModel.cancelOperations(uid, id, subType);
      const { removedOperations } = canceledData;
      let operations = canceledData.operations || [];
      let pdfUrl = null;

      if (removedOperations.length) {
        const getPagesOperations = op => op.properties.type === TYPE.PAGES;
        const removedPages = removedOperations.filter(getPagesOperations);

        this.logSystem.info(
          this.constantsEvents.CONSTRUCTOR_CANCEL,
          { uid, channel: this.channel.SERVER, removedOperations, removedPages }
        );

        if (removedPages.length) {
          await this._handlePageCancelOp(removedPages, operations, uid);
        }
      }

      if (!pdfUrl && sourceRequired) {
        pdfUrl = this._editorRefresh(uid);
      }

      if (pdfUrl) {
        const sourceOperation = this.operationsFactory.createSourceOperation(pdfUrl);

        operations = [...operations, sourceOperation];
      }

      if (forcePull && operations.length) {
        const opsToSend = (await this.operationsModel.getOrderedOps(uid, false))
          .map(op => ({
            ...op,
            omitOnSave: true,
          })).concat([operation]);

        return opsToSend;
      }
      return operation;
    } catch (err) {
      throw err;
    }
  }

  /**
   *
   * @async
   * @param {string} uid
   * @param {object} operation
   * @returns {Promise<object>} operation
   */
  async handle(uid, operation) {
    try {
      const { CANCEL } = this.operationsConstants.TYPE;
      let result = null;

      switch (operation.properties.type) {
        case CANCEL:
          result = await this._handleCancelOp(
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
