class MainService {

  /**
   * @param {CommandsModel} commandsModel
   * @param {SnapshotModel} snapshotModel
   * @param {JavaWorkerModel} javaWorkerModel
   */
  constructor({ commandsModel, snapshotModel, javaWorkerModel, logSystem, constantsEvents }) {
    this.commandsModel = commandsModel;
    this.snapshotModel = snapshotModel;
    this.javaWorkerModel = javaWorkerModel;

    this.logSystem = logSystem;
    this.constantsEvents = constantsEvents;
  }

  /**
   * @param {Array} operations
   * @param {String} url
   * @param {Number} projectId
   * @param {String} callbackUrl
   * @param {Function} callback
   */
  async generatePDFByOperations(operations, url, callbackUrl, projectId) {
    try {
      const { commandsModel, snapshotModel, javaWorkerModel } = this;
      const getSnapshotFromURLAsync = Promise.promisify(snapshotModel.getSnapshotFromURL, { context: snapshotModel });
      const commands = commandsModel.getFromOperations(operations);
      const pages = commandsModel.getPagesInList(commands);
      const snapshot = snapshotModel.getDefaultTemplate();

      snapshot.originalPdf = url;
      await getSnapshotFromURLAsync(url, snapshot, pages);
      const mergedSnapshot = snapshotModel.mergeSnapShotAndCommands(snapshot, commands);


      this.logSystem.info('DEBUG', {
        method: 'generatePDFByOperations',
        url,
      });

      const data = await javaWorkerModel.pdfBuild({
        formId: projectId,
        userId: projectId,
        pdfUrl: url,
        callbackUrl,
        snapshot: mergedSnapshot,
      });

      this.logSystem.info('DEBUG', {
        method: 'generatePDFByOperations:pdfBuild',
        url,
        data,
      });

      return { processId: data.processId };
    } catch (err) {
      throw err;
    }
  }
}

module.exports = MainService;
