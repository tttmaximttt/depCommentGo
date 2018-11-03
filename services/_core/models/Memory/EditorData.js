const _ = require('lodash');
const ProjectData = require('./ProjectData');
const Uid = require('./Uid');

class EditorData {
  constructor(injector) {
    this.projectData = new ProjectData(injector);
    this.itemName = 'editorDataMap';
    const uid = new Uid(injector);

    this.getIds = uid.getIds;
  }

  /**
   *
   * @param uid
   * @param {string} updateItemPath - lodash .set style
   * @param val
   * @returns {Promise<*>}
   */

  async update(uid, updateItemPath, val) {
    try {
      const { projectData } = this;
      const { projectId } = this.getIds(uid);
      const editorDataMap = await projectData.getByItemId(projectId, this.itemName) || {};
      const editorData = _.get(editorDataMap, uid, {});
      const newData = _.set(editorData, updateItemPath, val);

      editorDataMap[uid] = newData;
      return projectData.set(projectId, this.itemName, editorDataMap);
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
  async get(uid) {
    try {
      const { projectData } = this;
      const { projectId } = this.getIds(uid);
      const editorDataMap = await projectData.getByItemId(projectId, this.itemName) || {};

      return _.get(editorDataMap, uid, null);
    } catch (err) {
      throw err;
    }
  }

  /**
   *
   * @async
   * @param {string} uid
   * @param {*} val
   * @returns {Promise<object|boolean>}
   */
  async set(uid, val) {
    try {
      const { projectData } = this;
      const { projectId } = this.getIds(uid);
      const editorDataMap = await projectData.getByItemId(projectId, this.itemName) || {};

      editorDataMap[uid] = val;
      const result = await projectData.set(projectId, this.itemName, editorDataMap) ? val : null;

      return result;
    } catch (err) {
      throw err;
    }
  }


  /**
   *
   * @async
   * @param {string} uid
   * @returns {Promise<boolean>}
   */
  async remove(uid) {
    try {
      const { projectData } = this;
      const { projectId } = this.getIds(uid);
      const editorDataMap = await projectData.getByItemId(projectId, this.itemName) || {};

      if (!editorDataMap[uid]) return false;

      delete editorDataMap[uid];
      return projectData.set(projectId, this.itemName, editorDataMap);
    } catch (err) {
      throw err;
    }
  }


  /**
   *
   * !!!for nested use update!!!
   * @async
   * @param {string} uid
   * @param {*} val
   * @returns {Promise<void>}
   */
  async apply(uid, val) {
    try {
      const { projectData } = this;
      const { projectId } = this.getIds(uid);
      const editorDataMap = await projectData.getByItemId(projectId, this.itemName) || {};
      const newData = typeof val === 'string' ? JSON.parse(val) : val;

      if (!editorDataMap[uid]) {
        editorDataMap[uid] = newData;
      }

      editorDataMap[uid] = Object.assign({}, editorDataMap[uid] || {}, newData);

      return projectData.set(projectId, this.itemName, editorDataMap);
    } catch (err) {
      throw err;
    }
  }
}

module.exports = EditorData;
