const Promise = require('bluebird');
const uuidv5 = require('uuid/v5');
const config = require('config');
const _ = require('lodash');

const generalConstants = require('../../constants/GeneralConstants')();
const Uid = require('./Uid');

class ContentJSON {
  constructor(injector) {
    this.dbMemory = injector.dbMemory;
    this.keyPrefix = 'CONTENT_JSON';
    this.generalConstants = generalConstants;
    this.uid = new Uid(injector);
  }

  _getKey(uid) {
    const { projectId } = this.uid.getIds(uid);

    return `${this.keyPrefix}_${projectId}`;
  }

  getElementUUID(operation) {
    const element = _.get(operation, 'properties.element', null);

    if (!element) return null;

    const { UUID_NAMESPACE } = this.generalConstants;
    const elementIdsCompound = `${element.localId}_${element.clientId}`;

    return uuidv5(elementIdsCompound, UUID_NAMESPACE);
  }

  async create(uid, projectOperations = []) {
    try {
      let opsCount = 0;

      await Promise.each(projectOperations, async (operation) => {
        const element = _.get(operation, 'properties.element', null);

        if (!element) return;

        if (await this.exist(uid, operation)) {
          const originOp = await this.getByElement(uid, operation);

          await this.update(uid, operation, originOp);
        } else {
          await this.add(uid, operation);
        }

        ++opsCount;
      });
      return opsCount;
    } catch (err) {
      throw err;
    }
  }

  async get(uid) {
    try {
      const key = this._getKey(uid);
      const resultRaw = await this.dbMemory.hgetallAsync(key) || {};
      const result = {};

      Object.keys(resultRaw).forEach((keyItem) => {
        const operation = typeof resultRaw[keyItem] === 'string' ?
          JSON.parse(resultRaw[keyItem]) :
          resultRaw[keyItem];

        result[keyItem] = operation;
      });
      return result;
    } catch (err) {
      throw err;
    }
  }

  async add(uid, operation) {
    try {
      const key = this._getKey(uid);
      const element = _.get(operation, 'properties.element', null);

      if (!element) return 0;

      const elementUUID = this.getElementUUID(operation);

      await this.dbMemory.hsetAsync(key, elementUUID, JSON.stringify(operation));
      this.dbMemory.expireAsync(key, config.redisKeysTTL);
      return operation;
    } catch (err) {
      throw err;
    }
  }

  delete(uid, operation) {
    const key = this._getKey(uid);
    const elementUUID = this.getElementUUID(operation);

    return this.dbMemory.hdelAsync(key, elementUUID);
  }

  clear(uid) {
    const key = this._getKey(uid);

    return this.dbMemory.delAsync(key);
  }

  isMustBeDeleted(operation) {
    const { content, template } = _.get(operation, 'properties', {});

    return (!content || content.visible === false) && (!template || template.visible === false);
  }

  async update(uid, operation, operationToUpdate = null) {
    try {
      if (_.isEmpty(operationToUpdate)) return null;

      operationToUpdate.properties.subType = operation.properties.subType;
      if (Number.isInteger(operation.properties.pageId)) {
        operationToUpdate.properties.pageId = operation.properties.pageId;
      }

      const { content, template } = operation.properties;

      if (content) {
        if (content.visible === false) {
          delete operationToUpdate.properties.content;
        } else {
          const oldContent = _.get(operationToUpdate, 'properties.content', {});

          operationToUpdate = _.set(operationToUpdate, 'properties.content', { ...oldContent, ...content });
        }
      }

      if (template) {
        if (template.visible === false) {
          delete operationToUpdate.properties.template;
        } else {
          const oldTemplate = _.get(operationToUpdate, 'properties.template', {});

          operationToUpdate = _.set(operationToUpdate, 'properties.template', { ...oldTemplate, ...template });
        }
      }


      if (!operationToUpdate.properties.template && !operationToUpdate.properties.content) {
        this.delete(uid, operation);
        return null;
      }

      await this.add(uid, operationToUpdate);
      return operationToUpdate;
    } catch (err) {
      throw err;
    }
  }

  exist(uid, operation) {
    const key = this._getKey(uid);
    const element = _.get(operation, 'properties.element', null);

    if (!element) return false;

    const elementUUID = this.getElementUUID(operation);

    return this.dbMemory.hexistsAsync(key, elementUUID);
  }

  async getByElement(uid, operation) {
    try {
      const key = this._getKey(uid);
      const elementUUID = this.getElementUUID(operation);

      if (!elementUUID) return {};

      const result = await this.dbMemory.hgetAsync(key, elementUUID);

      return JSON.parse(result);
    } catch (err) {
      throw err;
    }
  }
}

module.exports = ContentJSON;
