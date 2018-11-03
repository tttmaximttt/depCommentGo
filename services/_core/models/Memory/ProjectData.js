const Promise = require('bluebird');
const _ = require('lodash');
const config = require('config');
const Uid = require('./Uid');

class ProjectData {
  constructor(injector) {
    this.prefix = injector.dbConstants.PROJECT_DATA;
    this.dbMemory = injector.dbMemory;
    this.uid = new Uid(injector);
    this.projectOpsCount = 'projectOpsCount';
    this.projectClients = 'projectClients';
    this.rearrangeProcessId = 'rearrangeProcessId';
    this.localId = 'localId';
    this.mappingOps = 'mappingOps';
    this.lastPageOp = 'lastPageOp';
    this.isTemplateChanged = 'isTemplateChanged';
    this.templateOrder = 'templateOrder';
    this.uid = new Uid(injector);
  }

  getKey(projectId) {
    return `${this.prefix}_${projectId}`;
  }

  create(projectId, entity) {
    try {
      const keys = Object.keys(entity);
      const tasks = keys.map((key) => {
        const value = entity[key];

        return this.set(projectId, key, value);
      });

      return Promise.all(tasks);
    } catch (err) {
      throw err;
    }
  }

  async set(projectId, itemKey, data) {
    try {
      const { dbMemory } = this;
      const key = this.getKey(projectId);

      if (data && (Array.isArray(data) || _.isObject(data))) {
        data = JSON.stringify(data);
      }
      const result = dbMemory.hsetAsync(key, itemKey, data);

      await this.dbMemory.expireAsync(key, config.redisKeysTTL);
      return result;
    } catch (err) {
      throw err;
    }
  }

  async get(projectId) {
    try {
      const key = this.getKey(projectId);
      const result = await this.dbMemory.hgetallAsync(key) || {};

      Object.keys(result).forEach((itemKey) => {
        const item = result[itemKey];

        if (typeof item === 'string') {
          try {
            result[itemKey] = JSON.parse(item);
          } catch (err) {
            return null;
          }
        }
      });
      return result;
    } catch (err) {
      throw err;
    }
  }

  async getByItemId(projectId, itemKey) {
    try {
      const hashKey = this.getKey(projectId);
      const resultJSON = await this.dbMemory.hgetAsync(hashKey, itemKey);

      if (!resultJSON) return null;

      try {
        return JSON.parse(resultJSON);
      } catch (err) {
        return resultJSON;
      }
    } catch (err) {
      throw err;
    }
  }

  async update(projectId, newData) {
    const data = await this.get(projectId);
    const updated = {
      ...data,
      ...newData,
    };

    return this.create(projectId, updated);
  }

  clear(projectId) {
    const key = this.getKey(projectId);

    return this.dbMemory.delAsync(key);
  }

  delete(projectId, itemKey) {
    const hashKey = this.getKey(projectId);

    return this.dbMemory.hdelAsync(hashKey, itemKey);
  }
}

module.exports = ProjectData;
