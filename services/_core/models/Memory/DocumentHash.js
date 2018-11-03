const _ = require('lodash');
const ProjectData = require('./ProjectData');
const Uid = require('./Uid');

class DocumentHash {
  constructor(injector) {
    this.projectData = new ProjectData(injector);
    this.itemName = 'documentHash';
    const uid = new Uid(injector);

    this.getIds = uid.getIds;
  }

  async get(userId, projectId) {
    const { projectData } = this;
    const documentHashMap = await projectData.getByItemId(projectId, this.itemName) || {};
    const documentHash = _.get(documentHashMap, userId, {});

    return documentHash;
  }

  async set(userId, projectId, data) {
    try {
      const { projectData } = this;
      const documentHashMap = await projectData.getByItemId(projectId, this.itemName) || {};

      documentHashMap[userId] = data;

      const result = await projectData.set(projectId, this.itemName, documentHashMap) ? data : null;

      return result;
    } catch (err) {
      throw err;
    }
  }

  async remove(userId, projectId) {
    try {
      const { projectData } = this;
      const documentHashMap = await projectData.getByItemId(projectId, this.itemName);

      if (!documentHashMap[userId]) return false;

      delete documentHashMap[userId];

      return projectData.set(projectId, this.itemName, documentHashMap);
    } catch (err) {
      throw err;
    }
  }
}

module.exports = DocumentHash;
