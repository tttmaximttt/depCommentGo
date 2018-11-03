const _ = require('lodash');

const UNAVAILABLE_CONTENT_TYPES = ['image', 'image_sig'];
const UNAVAILABLE_ERROR = 'document have an unavailable content but dont have a pdfUrl';
const PJSON_DPI = 72;

class PXmlToAJsonModel {

  /**
   * @param {PXmlToPJsonModel} pXmlToPJsonModel
   * @param {PJsonToAJsonModel} pJsonToAJsonModel
   * @param {logSystem} logSystem
   * @param {constantsEvents} constantsEvents
   */
  constructor({ pXmlToPJsonModel, pJsonToAJsonModel, logSystem, constantsEvents, errorFactory }) {
    this.pXmlToPJsonModel = pXmlToPJsonModel;
    this.pJsonToAJsonModel = pJsonToAJsonModel;
    this.logSystem = logSystem;
    this.constantsEvents = constantsEvents;
    this.errorFactory = errorFactory;
  }

  async do(key, value, options) {
    try {
      const { pXmlToPJsonModel, pJsonToAJsonModel } = this;

      options.dpi = PJSON_DPI;

      const jsonPath = await pXmlToPJsonModel.do(key, value, options);

      return pJsonToAJsonModel.do(key, jsonPath, options);
    } catch (e) {
      throw e;
    }
  }

  async preBehavior(document, options) {
    try {
      const { pXmlToPJsonModel, logSystem, constantsEvents, errorFactory } = this;
      const { ownerId } = options;

      if (document.content) {
        const { content, unavailable, imageIdList } = await
          pXmlToPJsonModel.getUnavailableContent(document.content, UNAVAILABLE_CONTENT_TYPES);

        logSystem.debug(constantsEvents.CONVERTER_SERVICE_FLOW, {
          type: 'PXmlToAJsonModel.preBehavior',
          content,
          unavailable,
          imageIdList });

        if (unavailable) {
          if (document.pdfUrl) {
            document.content = content;

            const images = !_.isEmpty(imageIdList) ?
              await pXmlToPJsonModel.getImagesInfo(imageIdList, ownerId) : null;

            document.pdfUrl =
              await pXmlToPJsonModel.getPdfUrlByContent(document.pdfUrl, unavailable, images);

            return document;
          }

          const error = errorFactory.conversionError(
            new Error(UNAVAILABLE_ERROR),
            null,
            'PXmlToAJsonModel.preBehavior'
          );

          logSystem.err(error.group, { ...error });

          throw Error(UNAVAILABLE_ERROR);
        }
      }

      return document;
    } catch (e) {
      throw e;
    }
  }

  postBehavior(document) {
    const { pJsonToAJsonModel } = this;

    return pJsonToAJsonModel.postBehavior(document);
  }

}

module.exports = PXmlToAJsonModel;
