const fp = require('lodash/fp');
const Promise = require('bluebird');
const isEmpty = require('lodash/isEmpty');

class LuaModel {
  constructor({ memory, operationsConstants }) {
    this.memory = memory;
    this.operationsConstants = operationsConstants;
  }

  async getUidToActionTimeMap(uids = []) {
    const { memory } = this;
    const userOps = await Promise.map(uids, uid => this.memory.editorOps.getKey(uid, 'user_operations'));
    const opList = await Promise.map(uids, memory.operationsList.create);

    return new Promise((resolve, reject) => {
      const keyCollection = [
        uids,
        opList,
        userOps,
        uids.map(fp.flow(memory.uid.getIds, fp.get('projectId'), memory.projectOperations.create)),
      ].map(JSON.stringify);

      memory.luaStore.run(
        'uid_action_time',
        keyCollection,
        memory.luaStore.jsonCallback((err, data) => {
          if (err) return reject(err);
          resolve(data);
        })
      );
    });
  }

  /**
   * @method getRedisKeysMap
   * @param {String} prefix - redis Key prefix
   * @param {Array} keys - array of string ids that come after prefix
   * @param {Boolean} isJson - if value is a json object
   * @param {function} callback
   *
   * @returns {Object} key-value pairs of [prefix]_[id] and their values
   */
  getRedisKeysMap(keys, prefix, isJson, callback) {
    const { memory } = this;

    memory.luaStore.run(
      'redis_keys_map',
      [JSON.stringify(keys), prefix, isJson],
      memory.luaStore.jsonCallback(callback)
    );
  }

  /**
   *
   * @param {Array.<string>} projectIds - array of project ids
   * @param {function} callback
   */
  getEmptyProjectIds(projectIds = [], callback) {
    const { memory } = this;

    if (!projectIds.every(item => typeof item === 'string')) {
      return callback(new Error('Invalid parameter projectIds. Item should be a string.'), null);
    }

    if (isEmpty(projectIds)) {
      return callback(null, []);
    }

    memory.luaStore.run(
      'empty_project_ids',
      [JSON.stringify(projectIds)],
      memory.luaStore.jsonCallback(callback)
    );
  }

  getUidsFromProjectIds(projectIds, callback) {
    const { memory } = this;

    memory.luaStore.run(
      'project_ids_to_uid_list',
      [JSON.stringify(projectIds)],
      memory.luaStore.jsonCallback(callback)
    );
  }

  /**
   * @param {String} projectId
   * @param {Function} callback
   * @returns {Number} owner id - last user, that edited the project
   */
  getLastProjectEditor(projectId, callback) {
    const { memory } = this;

    memory.luaStore.run(
      'last_project_editor',
      [memory.projectOperations.create(projectId)],
      callback
    );
  }
}

module.exports = LuaModel;
