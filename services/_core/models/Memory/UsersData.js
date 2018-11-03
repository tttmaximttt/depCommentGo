const Promise = require('bluebird');
const config = require('config');
const _ = require('lodash');

const generalConstants = require('../../constants/GeneralConstants')();
const Uid = require('./Uid');

class UsersData {
  constructor(injector) {
    this.dbMemory = injector.dbMemory;
    this.prefix = 'USERS_DATA';
    this.generalConstants = generalConstants;
    this.uid = new Uid(injector);
  }

  getKey(userId) {
    return `${this.prefix}_${userId}`;
  }

  create(userId, entity) {
    try {
      const keys = Object.keys(entity);
      const tasks = keys.map((key) => {
        const value = entity[key];

        return this.set(userId, key, value);
      });

      return Promise.all(tasks);
    } catch (err) {
      throw err;
    }
  }

  async set(userId, itemKey, data) {
    try {
      const { dbMemory } = this;
      const key = this.getKey(userId);

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

  async get(userId) {
    try {
      const key = this.getKey(userId);
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

  async getByItemId(userId, itemKey) {
    try {
      const hashKey = this.getKey(userId);
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

  async update(userId, newData) {
    const data = await this.get(userId);
    const updated = {
      ...data,
      ...newData,
    };

    return this.create(userId, updated);
  }

  clear(userId) {
    const key = this.getKey(userId);

    return this.dbMemory.delAsync(key);
  }

  delete(userId, itemKey) {
    const hashKey = this.getKey(userId);

    return this.dbMemory.hdelAsync(hashKey, itemKey);
  }
}

module.exports = UsersData;
