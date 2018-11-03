const _ = require('lodash');
const ProjectData = require('./ProjectData');
const Uid = require('./Uid');

class Access {
  constructor(injector) {
    this.projectData = new ProjectData(injector);
    this.itemName = 'uidAccessMap';
    const uid = new Uid(injector);

    this.getIds = uid.getIds;
  }

  /**
   *
   * @async
   * @param {string} uid
   * @param {string} value
   * @returns {Promise<string>}
   */
  async set(uid, value) {
    try {
      const { projectData } = this;
      const { projectId } = this.getIds(uid);
      const accessMap = await projectData.getByItemId(projectId, this.itemName) || {};

      accessMap[uid] = value;
      await projectData.set(projectId, this.itemName, accessMap);
      return value;
    } catch (err) {
      throw err;
    }
  }

  /**
   *
   * @async
   * @param {string} uid
   * @returns {Promise<string>}
   */
  async get(uid) {
    try {
      const { projectData } = this;
      const { projectId } = this.getIds(uid);
      const accessMap = await projectData.getByItemId(projectId, this.itemName);

      return _.get(accessMap, uid, null);
    } catch (err) {
      throw err;
    }
  }

  /**
   *
   * @async
   * @param {string} uid
   * @returns {Promise<object>}
   */
  async getAll(uid) {
    const { projectData } = this;
    const { projectId } = this.getIds(uid);

    return projectData.getByItemId(projectId, this.itemName);
  }

  /**
   *
   * @async
   * @param {string} uid
   * @returns {Promise<void>}
   */
  async remove(uid) {
    try {
      const { projectData } = this;
      const { projectId } = this.getIds(uid);
      const accessMap = await projectData.getByItemId(projectId, this.itemName) || {};

      delete accessMap[uid];

      return projectData.set(projectId, this.itemName, accessMap);
    } catch (err) {
      throw err;
    }
  }

  /**
   *
   * @async
   * @param {string} uid
   * @returns {Promise<void>}
   */
  async clear(uid) {
    const { projectData } = this;
    const { projectId } = this.getIds(uid);

    return projectData.delete(projectId, this.itemName);
  }
}

module.exports = Access;
