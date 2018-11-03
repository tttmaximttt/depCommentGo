const ProjectData = require('./ProjectData');

class СonfigXml {
  constructor(injector) {
    this.projectData = new ProjectData(injector);
    this.itemName = 'configXml';
  }

  get(projectId) {
    const { projectData } = this;

    return projectData.getByItemId(projectId, this.itemName);
  }

  /**
   *
   * @async
   * @param {string} projectId
   * @param {string} configXml
   * @returns {Promise<string>}
   */
  async set(projectId, configXml) {
    const { projectData } = this;

    await projectData.set(projectId, this.itemName, configXml);
    return configXml;
  }

  remove(projectId) {
    const { projectData } = this;

    return projectData.delete(projectId, this.itemName);
  }
}

module.exports = СonfigXml;
