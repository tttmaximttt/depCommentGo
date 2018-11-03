const coreFactory = require('./core');

module.exports = class OperationsFactory extends coreFactory {
  /**
   *
   * @returns {DOCUMENT}
   */
  getResolutionOp() {
    const { TYPE: { RESOLUTION }, GROUP: { DOCUMENT } } = this.operationsConstants;

    return this.create(
      DOCUMENT,
      RESOLUTION,
      '',
      { pdfDPI: 72, contentDPI: 96 });
  }

};
