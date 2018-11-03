const _ = require('lodash');
const ProjectData = require('./ProjectData');
const Uid = require('./Uid');

class UidClient {
  constructor(injector) {
    this.projectData = new ProjectData(injector);
    this.itemName = 'uidClientMap';
    const uid = new Uid(injector);

    this.getIds = uid.getIds;
  }

  async get(uid) {
    try {
      const { projectData } = this;
      const { projectId } = this.getIds(uid);
      const uidClientMap = await projectData.getByItemId(projectId, this.itemName);

      return _.get(uidClientMap, uid, '');
    } catch (err) {
      throw err;
    }
  }

  async set(uid, val) {
    try {
      const { projectData } = this;
      const { projectId } = this.getIds(uid);
      const uidClientMap = await projectData.getByItemId(projectId, this.itemName) || {};

      uidClientMap[uid] = val;
      return projectData.set(projectId, this.itemName, uidClientMap);
    } catch (err) {
      throw err;
    }
  }

  async remove(uid) {
    try {
      const { projectData } = this;
      const { projectId } = this.getIds(uid);
      const uidClientMap = await projectData.getByItemId(projectId, this.itemName) || {};

      delete uidClientMap[uid];
      return projectData.set(projectId, this.itemName, uidClientMap);
    } catch (err) {
      throw err;
    }
  }
}

module.exports = UidClient;
