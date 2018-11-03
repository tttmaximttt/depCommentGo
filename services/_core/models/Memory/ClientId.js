const ProjectData = require('./ProjectData');

class ClientIdCounter {
  constructor(injector) {
    this.projectData = new ProjectData(injector);
    this.itemName = 'clientIdCount';
    this.dbMemory = injector.dbMemory;
  }

  /**
   *
   * @async
   * @param {string} projectId
   * @returns {Promise<number>}
   */
  get(projectId) {
    const { projectData } = this;

    return projectData.getByItemId(projectId, this.itemName);
  }

  /**
   *
   * @async
   * @param {string} projectId
   * @param {number} val
   * @returns {Promise<boolean|number>}
   */
  async set(projectId, val) {
    const { projectData } = this;
    const res = await projectData.set(projectId, this.itemName, val) ? val : false;

    return res;
  }

  /**
   *
   * @async
   * @param {string} projectId
   * @returns {Promise<number>}
   */
  async incr(projectId) {
    const { projectData, dbMemory } = this;
    const hashSetKey = projectData.getKey(projectId);

    await dbMemory.hincrbyAsync(hashSetKey, this.itemName, 1);
    const currentValue = await this.get(projectId);

    return currentValue;
  }

  remove(projectId) {
    const { projectData } = this;

    return projectData.delete(projectId, this.itemName);
  }
}

module.exports = ClientIdCounter;
