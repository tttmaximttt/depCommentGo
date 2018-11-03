class AJsonToPXmlModel {

  /**
   * @param {AJsonToPJsonModel} aJsonToPJsonModel
   * @param {PJsonToPXmlModel} pJsonToPXmlModel
   */
  constructor({ aJsonToPJsonModel, pJsonToPXmlModel }) {
    this.aJsonToPJsonModel = aJsonToPJsonModel;
    this.pJsonToPXmlModel = pJsonToPXmlModel;
  }

  do(key, value, options) {
    const { aJsonToPJsonModel, pJsonToPXmlModel } = this;

    const jsonPath = aJsonToPJsonModel.do(key, value, options);

    return pJsonToPXmlModel.do(key, jsonPath, options);
  }

  postBehavior(document) {
    const { aJsonToPJsonModel } = this;

    return aJsonToPJsonModel.postBehavior(document);
  }
}

module.exports = AJsonToPXmlModel;
