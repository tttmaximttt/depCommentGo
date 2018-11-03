module.exports = class CollaborationOpsHandler {
  constructor({ memory, operationsConstants }) {
    this.memory = memory;
    this.holdModel = memory.holdModel;
    this.operationsConstants = operationsConstants;
  }

  _handleUserOps({ userId, projectId, operation }, callback) { // eslint-disable-line
    throw new Error('Not implemented yet!!!'); // TODO
  }

  async _handleHoldOps({ userId, projectId, operation }, callback = () => {}) {
    const { elements = [] } = operation.properties || {};

    try {
      const holder = await this.holdModel.findHolder(projectId, elements);

      if (!holder) await this.holdModel.add(projectId, userId, elements);

      operation.properties.holder = holder || userId;
      if (typeof callback === 'function') callback(null, operation);
      return operation;
    } catch (err) {
      if (typeof callback === 'function') return callback(err);
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
  async handle(uid, operation, callback = () => {}) {
    const { HOLD, USERS } = this.operationsConstants.TYPE;
    const { userId, projectId } = this.memory.uid.getIds(uid);
    let result = null;

    switch (operation.properties.type) {
      case HOLD:
        result = await this._handleHoldOps({
          userId,
          projectId,
          operation,
        });
        break;
      case USERS:
        this._handleUserOps({
          userId,
          projectId,
          operation,
        }, callback);
        break;
      default:
        throw new Error(`Operation ${operation.properties.type} type can't be handled`); // TODO
    }

    return result;
  }
};
