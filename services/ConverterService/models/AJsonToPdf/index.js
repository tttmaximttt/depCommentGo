const _ = require('lodash');

class AJsonToPdf {

  /**
   * @param {PXmlToPJsonModel} pXmlToPJsonModel
   * @param {AJsonToPXmlModel} aJsonToPXmlModel
   */
  constructor({ aJsonToPXmlModel, pXmlToPJsonModel }) {
    this.aJsonToPXmlModel = aJsonToPXmlModel;
    this.pXmlToPJsonModel = pXmlToPJsonModel;
  }

  async do(key, value, options) {
    try {
      const { aJsonToPXmlModel } = this;

      return aJsonToPXmlModel.do(key, value, options);
    } catch (e) {
      throw e;
    }
  }

  async postBehavior(document, options) {
    try {
      const { pXmlToPJsonModel } = this;
      const { callbackUrl, ownerId } = options;

      const { imageIdList } = document.content ?
         await pXmlToPJsonModel.getImagesInXMLContent(document.content) : {};

      const images = !_.isEmpty(imageIdList) ?
        await pXmlToPJsonModel.getImagesInfo(imageIdList, ownerId) : [];

      const key = callbackUrl ? 'processId' : 'pdfUrl';
      const data =
        await pXmlToPJsonModel.getPdfUrlByContent(
          document.pdfUrl, document.content || [], images, callbackUrl);

      return { [key]: data };
    } catch (e) {
      throw e;
    }
  }
}

module.exports = AJsonToPdf;
