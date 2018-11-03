const Promise = require('bluebird');
const _ = require('lodash');

class ClientsHelper {
  constructor({ config, memory, operationsConstants, logSystem }) {
    this.config = config;
    this.memory = memory;
    this.operationsConstants = operationsConstants;
    this.logSystem = logSystem;
  }

  async _setProjectClient(uid) {
    const { memory } = this;
    const { projectId } = memory.uid.getIds(uid);
    const projectClients = await memory.projectData.getByItemId(projectId, memory.projectData.projectClients);

    if (!projectClients) {
      const data = [uid];

      await memory.projectData.set(projectId, this.memory.projectData.projectClients, [uid]);
      return data;
    }

    projectClients.push(uid);
    await memory.projectData.set(projectId, this.memory.projectData.projectClients, projectClients);
    return projectClients;
  }

  async _isFirstEditor(projectId) {
    const projectClients = await this.memory.projectData.getByItemId(
      projectId,
      this.memory.projectData.projectClients
    ) || [];
    const data = await Promise.map(projectClients, clientUid => this.memory.access.get(clientUid));

    return !data.includes('edit');
  }

  async calcClientId(projectId) {
    const { memory } = this;
    const { clientId: configClientId } = this.config;
    const clientId = await memory.clientId.incr(projectId);

    if (clientId === configClientId) await memory.clientId.incr(projectId);
    return memory.clientId.get(projectId);
  }

  async registerClient(uid, access, clientId) {
    try {
      const { memory } = this;
      const { projectId } = memory.uid.getIds(uid);
      const isFirstEditor = await this._isFirstEditor(projectId);
      const projectClients = await this._setProjectClient(uid);

      await memory.access.set(uid, access);
      await memory.userClients.register(uid);

      const isFirstClient = projectClients.length === 1;

      return { clientId, isFirstClient, isFirstEditor };
    } catch (err) {
      throw err;
    }
  }

  async removeClient(uid) {
    try {
      const { memory } = this;
      const { projectId, userId } = memory.uid.getIds(uid);
      const projectClients = await memory.projectData.getByItemId(
        projectId,
        memory.projectData.projectClients
      ) || [];
      const updatedProjectClients = projectClients.filter(item => item !== uid);
      const promises = [
        memory.operationsList.remove(uid),
        memory.userClients.unregister(uid),
        memory.uid.remove(uid),
        memory.crossEditor.remove(uid),
        memory.toolsOrder.clear(uid),
      ];

      if (_.isEmpty(updatedProjectClients)) {
        promises.push(
          memory.projectData.clear(projectId),
          memory.clientId.remove(projectId),
          memory.configXml.remove(projectId),
          memory.versionsOperations.remove(projectId),
          memory.projectOperations.remove(projectId));
      } else {
        promises.push(
          memory.projectData.set(projectId, memory.projectData.projectClients, updatedProjectClients),
          memory.access.remove(uid),
          memory.editorData.remove(uid),
          memory.editorMode.remove(userId, projectId),
        );
      }

      await Promise.all(promises);

      const userClients = (await memory.userClients.get(userId)) || [];

      if (!userClients.length) {
        await memory.usersData.clear(userId, projectId);
      }

      return { projectClients: updatedProjectClients };
    } catch (err) {
      throw err;
    }
  }

}

module.exports = ClientsHelper;
