class PdfLoader {

  /**
   * @param {SnapshotModel} snapshotModel
   */
  constructor({ snapshotModel }) {
    this.snapshotModel = snapshotModel;
  }

  getPagesSize(pdfUrl) {
    return new Promise((resolve, reject) => {
      this.snapshotModel.getPagesSize(pdfUrl, (err, reply) => {
        if (err) { reject(err); }
        resolve(reply);
      });
    });
  }

  do(key, value) {
    return value;
  }

  async preBehavior(document) {
    try {
      if (document.pdfUrl && (document.fields || document.content)) {
        document.__pagesSizes = await this.getPagesSize(document.pdfUrl);
      }

      return document;
    } catch (e) {
      throw e;
    }
  }
}

module.exports = PdfLoader;
