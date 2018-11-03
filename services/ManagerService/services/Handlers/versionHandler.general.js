const _ = require('lodash');

module.exports = class VersionOpsHandler {
  constructor({ memory, errorFactory, operationsConstants, dbRemote, logSystem,
    operationsFactory, coreUtils, constantsEvents, contentService }) {
    this.memory = memory;
    this.operationsConstants = operationsConstants;
    this.dbRemote = dbRemote;
    this.logSystem = logSystem;
    this.operationsFactory = operationsFactory;
    this.coreUtils = coreUtils;
    this.constantsEvents = constantsEvents;
    this.contentService = contentService;
    this.errorFactory = errorFactory;
  }

  /**
   *
   * @param uid
   * @param operation
   * @returns {{extended: {contentConversionRequired: boolean, uid: *, version, skipIds: *}}}
   * @private
   */
  _handleVersionsPreviewOperation(uid, operation = {}) {
    const { logSystem, errorFactory } = this;

    try {
      const { version } = operation.properties || {};

      if (!version) throw Error('Field version not found');
      return { extended: { contentConversionRequired: true, uid, version, skipIds: true } };
    } catch (err) {
      const error = errorFactory.systemError(
        err,
        { uid },
        'versionHandler._handleVersionsPreviewOperation'
      );

      logSystem.error(error.group, { ...error });

      throw err;
    }
  }

  /**
   *
   * @param uid
   * @returns {Promise<Array>}
   * @private
   */
  async _handleVersionsListOperation(uid) {
    const { dbRemote, memory, logSystem, operationsFactory, errorFactory } = this;

    try {
      const operations = [];
      const { projectId, userId } = memory.uid.getIds(uid);

      const versions = await dbRemote.getDocumentVersionsAsync(userId, projectId);

      if (versions) {
        operations.push(operationsFactory.versionsList(_.get(versions, 'document.versions.list')));
      }

      return operations;
    } catch (err) {
      const error = errorFactory.systemError(
        err,
        { uid },
        'versionHandler._handleVersionsListOperation'
      );

      logSystem.error(error.group, { ...error });

      throw err;
    }
  }

  /**
   *
   * @param uid
   * @param operation
   * @returns {{extended: {contentConversionRequired: boolean, uid: *, version, refreshKeys: * }}}
   * @private
   */
  async _handleVersionsRestoreOperation(uid, operation = {}) {
    const { logSystem, errorFactory } = this;

    try {
      const { version } = operation.properties || {};

      if (!version) throw Error('Field version not found');
      await this.contentService.saveContent(uid);

      return { extended: { contentConversionRequired: true, uid, version, refreshKeys: true } };
    } catch (err) {
      const error = errorFactory.systemError(
        err,
        { uid },
        'versionHandler._handleVersionsRestoreOperation'
      );

      logSystem.error(error.group, { ...error });

      throw err;
    }
  }

  /**
   *
   * @param uid
   * @param operation
   * @private
   */
  async _handleSaveOp(uid, operation) { // eslint-disable-line
    try {
      const { VERSION } = this.operationsConstants;

      await this.contentService.saveContent(uid, { clearDataFlag: false });
      this.logSystem.debug(this.constantsEvents.VERSION_SAVE, { uid });
      return [this.operationsFactory.version(VERSION.SAVE)];
    } catch (err) {
      throw err;
    }
  }

  /**
   *
   * @param uid
   * @param operation
   */
  handle(uid, operation) {
    let result = null;
    const { operationsConstants } = this;
    const { TYPE } = operationsConstants;
    const { type } = operation.properties;

    switch (type) {
      case TYPE.LIST:
        result = this._handleVersionsListOperation(uid);
        break;
      case TYPE.PREVIEW:
        result = this._handleVersionsPreviewOperation(uid, operation);
        break;
      case TYPE.SAVE:
        result = this._handleSaveOp(uid, operation);
        break;
      case TYPE.RESTORE:
        result = this._handleVersionsRestoreOperation(uid, operation);
        break;
      default:
        throw new Error('Unhandled version operation');
    }

    return result;
  }
};
