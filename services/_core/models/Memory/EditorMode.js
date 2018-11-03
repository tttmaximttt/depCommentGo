const _ = require('lodash');
const ProjectData = require('./ProjectData');
const Uid = require('./Uid');

class EditorMode {
  constructor(injector) {
    this.projectData = new ProjectData(injector);
    this.itemName = 'editorMode';
    const uid = new Uid(injector);

    this.getIds = uid.getIds;
  }


  /**
   *
   * @async
   * @param {string} userId
   * @param {string} projectId
   * @returns {Promise<*>}
   */
  async get(userId, projectId) {
    const { projectData } = this;
    const editorModeMap = await projectData.getByItemId(projectId, this.itemName) || {};
    const editorMode = _.get(editorModeMap, userId, {});

    return editorMode;
  }

  async update(uid, updateItemPath, val) {
    try {
      const { projectData } = this;
      const { projectId, userId } = this.getIds(uid);
      const editorModeMap = await projectData.getByItemId(projectId, this.itemName) || {};
      const editorMode = _.get(editorModeMap, userId, {});
      const newData = _.set(editorMode, updateItemPath, val);

      editorModeMap[uid] = newData;
      return projectData.set(projectId, this.itemName, editorModeMap);
    } catch (err) {
      throw err;
    }
  }

  async set(userId, projectId, data) {
    try {
      const { projectData } = this;
      const editorModeMap = await projectData.getByItemId(projectId, this.itemName) || {};

      editorModeMap[userId] = data;
      const result = await projectData.set(projectId, this.itemName, editorModeMap) ? data : null;

      return result;
    } catch (err) {
      throw err;
    }
  }

  /**
   *
   * @async
   * @param {string} userId
   * @param {string} projectId
   * @returns {Promise<boolean>}
   */
  async remove(userId, projectId) {
    try {
      const { projectData } = this;
      const editorModeMap = await projectData.getByItemId(projectId, this.itemName);

      if (!editorModeMap[userId]) return false;

      delete editorModeMap[userId];
      return projectData.set(projectId, this.itemName, editorModeMap);
    } catch (err) {
      throw err;
    }
  }
}

module.exports = EditorMode;
