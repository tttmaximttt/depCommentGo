const converters = {};

class ConverterFabric {

  /**
   * @param {PXmlToPJsonModel} pXmlToPJsonModel
   * @param {PJsonToPXmlModel} pJsonToPXmlModel
   * @param {PJsonToAJsonModel} pJsonToAJsonModel
   * @param {PXmlToAJsonModel} pXmlToAJsonModel
   * @param {AJsonToPJsonModel} aJsonToPJsonModel
   * @param {AJsonToPXmlModel} aJsonToPXmlModel
   * @param {AJsonToSJsonModel} aJsonToSJsonModel
   * @param {PXmlToSJsonModel} pXmlToSJsonModel
   * @param {AJsonToPdf} aJsonToPdf
   * @param {AJsonBuilder} aJsonBuilder
   * @param {PXmlBuilder} pXmlBuilder
   * @param {PdfLoader} pdfLoader
   * @param {PdfRebuilder} pdfRebuilder
   */
  constructor({ pXmlToPJsonModel, pJsonToPXmlModel, pJsonToAJsonModel, pXmlToAJsonModel,
      aJsonToPJsonModel, aJsonToPXmlModel, aJsonToSJsonModel, aJsonToPdf, aJsonBuilder,
      pXmlBuilder, pdfLoader, pdfRebuilder }) {
    converters.pxmltopjson = pXmlToPJsonModel;
    converters.pjsontopxml = pJsonToPXmlModel;
    converters.pjsontoajson = pJsonToAJsonModel;
    converters.pxmltoajson = pXmlToAJsonModel;
    converters.ajsontopjson = aJsonToPJsonModel;
    converters.ajsontopxml = aJsonToPXmlModel;
    converters.ajsontosjson = aJsonToSJsonModel;
    converters.pxmltosjson = [pXmlToPJsonModel, pdfRebuilder, pJsonToAJsonModel, aJsonToSJsonModel];
    converters.ajsontopdf = aJsonToPdf;
    converters.ajsonbuilder = aJsonBuilder;
    converters.pxmlbuilder = pXmlBuilder;
    converters.pdfloader = pdfLoader;
    converters.pdfrebuilder = pdfRebuilder;
  }

  createConverter(converterName) {
    if (converters[converterName]) {
      return converters[converterName];
    }
    throw new Error(`not available converter ${converterName}`);
  }

  createBuilder(format) {
    if (converters[`${format}builder`]) {
      return converters[`${format}builder`];
    }
    throw new Error('not available builder');
  }
}

module.exports = ConverterFabric;
