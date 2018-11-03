const request = require('request');

class NativeEditApi {

  /**
   * @param {WebhookModel} webhookModel
   * @param {Object} config
   * @param {Routes} routes
   */
  constructor({ webhookModel, config, routes }) {
    this.webhookModel = webhookModel;
    this.config = config;
    this.routes = routes;

    this.origin = config.NativeEditService.options.externalHost;
  }

  /**
   * @param commands
   * @param pdfSource
   * @param projectId
   * @param callback
   */
  generate({ callbackUrl, operations, pdfSource, projectId }, callback) {
    const { NATIVE_EDIT_API } = this.routes;

    const options = {
      method: 'POST',
      url: `${this.origin}/${NATIVE_EDIT_API.GENERATE}`,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operations,
        pdfSource,
        callbackUrl,
        projectId,
      }),
    };

    request(options, callback);
  }
}

module.exports = NativeEditApi;
