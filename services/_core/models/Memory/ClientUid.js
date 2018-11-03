const _ = require('lodash');
const ProjectData = require('./ProjectData');

class ClientUid {
  constructor(injector) {
    this.projectData = new ProjectData(injector);
    this.itemName = 'clientUidMap';
  }

  async get(clientId, userId, projectId) {
    try {
      const { projectData } = this;
      const clientUidMap = await projectData.getByItemId(projectId, this.itemName);

      return _.get(clientUidMap, `${userId}_${clientId}`, '');
    } catch (err) {
      throw err;
    }
  }

  async set(clientId, userId, projectId, uid) {
    try {
      const { projectData } = this;
      const clientUidMap = await projectData.getByItemId(projectId, this.itemName) || {};

      clientUidMap[`${userId}_${clientId}`] = uid;

      return projectData.set(projectId, this.itemName, clientUidMap);
    } catch (err) {
      throw err;
    }
  }

  async remove(clientId, userId, projectId) {
    try {
      const { projectData } = this;
      const clientUidMap = await projectData.getByItemId(projectId, this.itemName) || {};

      delete clientUidMap[`${userId}_${clientId}`];

      return projectData.set(projectId, this.itemName, clientUidMap);
    } catch (err) {
      throw err;
    }
  }
}

module.exports = ClientUid;
