const uuidv4 = require('uuid/v4');

class PdfRebuilder {

  /**
   * @param {LogSystem} logSystem
   * @param {Object} constantsEvents
   * @param {WebhookModel} webhookModel
   * @param {javaWorkerModel} javaWorkerModel
   */
  constructor({ logSystem, constantsEvents, javaWorkerModel, webhookModel }) {
    this.webhookModel = webhookModel;
    this.javaWorkerModel = javaWorkerModel;
    this.logSystem = logSystem;
    this.constantsEvents = constantsEvents;
  }

  async getPdfUrlByContent(pdfUrl, content, images, callbackUrl, attributes, pages) {
    const { javaWorkerModel, webhookModel, logSystem, constantsEvents } = this;
    const uid = uuidv4();
    let workerUrl = callbackUrl;
    const formId = javaWorkerModel.createFormId(uid);
    const resolver = { resolve: null, reject: null };
    const job = new Promise((resolve, reject) => {
      resolver.resolve = resolve;
      resolver.reject = reject;
    });

    if (!callbackUrl) workerUrl = webhookModel.create(formId, resolver);

    const reply = await javaWorkerModel.buildPdfByDocument(
      { content, images, pdfUrl, attributes, pages },
      { uid, formId, callbackUrl: workerUrl });

    logSystem.debug(constantsEvents.CONVERTER_SERVICE_FLOW, {
      type: 'PXmlToAJsonModel.getPdfUrlByContent(buildPdfByDocument)',
      callbackUrl,
      reply });

    if (!reply.processId) throw new Error('No processId found');

    if (callbackUrl) {
      return reply.processId;
    }

    const jobData = await job;

    if (!jobData) {
      const result = await javaWorkerModel.getPdfByDocumentStatus(reply.processId, {});

      return result.pdfUrl;
    }

    return jobData.pdfUrl;
  }

  do(key, value) {
    return value;
  }

  async preBehavior(document) {
    try {
      if ((document.__contentXml && document.__contentXml.length) || document.attributes || document.pages) {
        const pdfUrl = await this.getPdfUrlByContent(
          document.pdfUrl, document.__contentXml, document.__images, null, document.__attributesXml, document.pages);

        if (pdfUrl) {
          document.pdfUrl = pdfUrl;
        }
      }

      return document;
    } catch (e) {
      throw e;
    }
  }
}

module.exports = PdfRebuilder;
