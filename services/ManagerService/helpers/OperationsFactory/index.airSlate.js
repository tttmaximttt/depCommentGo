const coreFactory = require('./core');

class OperationsFactory extends coreFactory {
  /**
   *
   * @param {object} metadata
   * @returns {DOCUMENT} document resolution op
   */
  getResolutionOp(metadata = {}) {
    const { TYPE: { RESOLUTION }, GROUP: { DOCUMENT } } = this.operationsConstants;

    return this.create(
      DOCUMENT,
      RESOLUTION,
      '',
      { pdfDPI: 72, contentDPI: metadata.dpi || 72 });
  }

}

module.exports = OperationsFactory;
