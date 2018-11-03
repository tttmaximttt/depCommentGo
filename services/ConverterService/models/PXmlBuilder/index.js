class PXmlBuilder {

  /**
   * @param {PXmlToPJsonModel} pXmlToPJsonModel
   * @param {PJsonToPXmlModel} pJsonToPXmlModel
   * @param {PJsonToAJsonModel} pJsonToAJsonModel
   * @param {AJsonBuilder} aJsonBuilder
   */
  constructor({ pXmlToPJsonModel, pJsonToPXmlModel, pJsonToAJsonModel, aJsonBuilder }) {
    this.pXmlToPJsonModel = pXmlToPJsonModel;
    this.pJsonToPXmlModel = pJsonToPXmlModel;
    this.pJsonToAJsonModel = pJsonToAJsonModel;
    this.aJsonBuilder = aJsonBuilder;
  }

  async buildDictionary(content, template, options) {
    try {
      const { pXmlToPJsonModel, pJsonToAJsonModel, aJsonBuilder } = this;

      options.dpi = 72;

      let document = { template: template || [] };
      const contentJson = content && content.length ?
        await pXmlToPJsonModel.do('content', content, options) : [];

      document = pJsonToAJsonModel.preBehavior(document);
      document.content = pJsonToAJsonModel.do('content', contentJson, options);

      document.template = pJsonToAJsonModel.do('template', template, options);

      document.__mapTemplate = { list: document.__mapTemplate };
      document = pJsonToAJsonModel.postBehavior(document);

      return aJsonBuilder.buildDictionary(document.content, document.fields);
    } catch (e) {
      throw e;
    }
  }

  async buildContent(content, template, dictionary, options) {
    try {
      const { pXmlToPJsonModel, pJsonToPXmlModel, aJsonBuilder } = this;
      const document = { template: { list: [] }, content: { list: [] } };

      options.dpi = 72;

      document.content.list = content && content.length ?
          await pXmlToPJsonModel.do('content', content, options) : [];

      document.template.list = template.data || [];

      const buildedContent = aJsonBuilder.buildContent(
        document.content, document.template, dictionary, options);

      return pJsonToPXmlModel.do('content', buildedContent.list, options);
    } catch (e) {
      throw e;
    }
  }
}

module.exports = PXmlBuilder;
