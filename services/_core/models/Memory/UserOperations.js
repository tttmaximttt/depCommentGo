const uuidv5 = require('uuid/v5');
const _ = require('lodash');
const UsersData = require('./UsersData');
const Uid = require('./Uid');
const generalConstants = require('../../constants/GeneralConstants')();
const operationsConstants = require('../../constants/OperationsConstants')();

const VALIDATE_DEFAULTS_CONTENT_LENGTH = 18;
const VALIDATE_DEFAULTS_TEMPALTE_LENGTH = 11;

class UserOperations {
  constructor(injector) {
    this.prefix = injector.dbConstants.USER_OPERATIONS;
    this.itemName = 'userOperations';
    this.dbMemory = injector.dbMemory;
    this.uid = injector.uid;
    this.generalConstants = generalConstants;
    this.operationConstants = operationsConstants;
    this.logSystem = injector.logSystem;
    this.usersData = new UsersData(injector);
    this.uid = new Uid(injector);
  }

  /**
   *
   *
   * @param {string} uid
   * @returns {string}
   */
  getKey(uid) {
    const { userId, projectId } = this.uid.getIds(uid);

    return `${this.prefix}_${userId}_${projectId}`;
  }

  /**
   *
   * @param {object} operation
   * @returns {string|null}
   */
  getOperationUUID(operation) {
    const type = _.get(operation, 'properties.type', null);

    if (!type) return null;
    const { UUID_NAMESPACE } = this.generalConstants;

    return uuidv5(type, UUID_NAMESPACE);
  }

  /**
   *
   * @async
   * @param {string} uid
   * @returns {Promise<object>}
   */
  async get(uid) {
    try {
      const { userId, projectId } = this.uid.getIds(uid);
      const { usersData } = this;
      const usersOperationsMap = await usersData.getByItemId(userId, this.itemName) || {};

      return usersOperationsMap[projectId] || {};
    } catch (err) {
      throw err;
    }
  }

  _assignDefault(mainDefault, patchDefault, patch) {
    if (!_.isArray(mainDefault.properties[patch])) {
      mainDefault.properties[patch] = patchDefault;
    } else {
      Object.keys(patchDefault).forEach(key => (
          key !== 'owner' &&
          _.merge(
            _.find(mainDefault.properties[patch], ['id', key]),
            patchDefault[key]
          )
        )
      );
    }
    return mainDefault;
  }

  _assignDefaults(mainDefault, patchDefault) {
    Object.keys(patchDefault.properties).forEach((key) => {
      if (!['group', 'type'].includes(key)) {
        mainDefault = this._assignDefault(mainDefault, patchDefault.properties[key], key);
      }
    });

    return mainDefault;
  }

  _validateDefaults(defaults) {
    return _.get(defaults, 'properties.content', []).length === VALIDATE_DEFAULTS_CONTENT_LENGTH
      && _.get(defaults, 'properties.template', []).length === VALIDATE_DEFAULTS_TEMPALTE_LENGTH;
  }

  async add(uid, operation) {
    const { userId, projectId } = this.uid.getIds(uid);
    const { usersData } = this;
    const operationUUID = this.getOperationUUID(operation);
    const usersOperationsMap = await usersData.getByItemId(userId, this.itemName) || {};

    if (operation.properties.type === this.operationConstants.TYPE.DEFAULTS) {
      return this.updateDefaults(uid, operation);
    }

    _.set(usersOperationsMap, `${projectId}.${operationUUID}`, operation);

    return usersData.set(userId, this.itemName, usersOperationsMap);
  }

  async remove(uid) {
    const { userId, projectId } = this.uid.getIds(uid);
    const { usersData } = this;
    const usersOperationsMap = await usersData.getByItemId(userId, this.itemName) || {};

    if (usersOperationsMap[projectId]) return false;
    delete usersOperationsMap[projectId];

    return !!usersData.set(userId, this.itemName, usersOperationsMap);
  }

  /**
   *
   * @async
   * @param uid
   * @param defaults
   * @returns {Promise<*>}
   */
  set(uid, defaults) {
    const { userId } = this.uid.getIds(uid);
    const { usersData } = this;

    return usersData.set(userId, this.itemName, defaults);
  }

  async updateDefaults(uid, operation) {
    const { userId, projectId } = this.uid.getIds(uid);
    const { usersData } = this;
    let usersOperationsMap = await usersData.getByItemId(userId, this.itemName) || {};
    const operationUUID = this.getOperationUUID({ properties: { type: this.operationConstants.TYPE.DEFAULTS } });
    const key = `${projectId}.${operationUUID}`;
    const mainDefault = _.get(usersOperationsMap, key, null);
    let updatedDefault = null;

    if (!mainDefault) {
      usersOperationsMap = _.set(usersOperationsMap, key, operation);
    } else {
      updatedDefault = this._assignDefaults(mainDefault, operation);

      if (this._validateDefaults(updatedDefault)) {
        usersOperationsMap = _.set(usersOperationsMap, key, updatedDefault);
      }
    }

    await usersData.set(userId, this.itemName, usersOperationsMap);
    return { updatedDefault, prevDefaults: mainDefault };
  }

  async getByType(uid, type) {
    const { userId, projectId } = this.uid.getIds(uid);
    const { usersData } = this;
    const usersOperationsMap = await usersData.getByItemId(userId, this.itemName) || {};
    const operationUUID = this.getOperationUUID({ properties: { type } }); // TODO :(
    const key = `${projectId}.${operationUUID}`;
    const result = _.get(usersOperationsMap, key, null);

    return result;
  }

  async exists(uid) {
    const { userId, projectId } = this.uid.getIds(uid);
    const { usersData } = this;
    const usersOperationsMap = await usersData.getByItemId(userId, this.itemName) || {};

    return Object.hasOwnProperty.call(usersOperationsMap, projectId);
  }
}

module.exports = UserOperations;
