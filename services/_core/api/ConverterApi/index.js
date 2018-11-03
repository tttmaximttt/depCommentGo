const request = require('request-promise');
const uuidv4 = require('uuid/v4');

// todo waiting for lambda
// const FORMAT_XML = 'pxml';
// const FORMAT_JSON = 'pjson';

class ConverterApi {

  /**
   * @param {Object} config
   * @param {Routes} routes
   * @param {WebhookModel} webhookModel
   * @param {messaging} messaging
   * @param {memory} memory
   * @param {constantsEvents} constantsEvents
   */
  constructor({ config, routes, webhookModel, messaging, memory, constantsEvents }) {
    this.config = config;
    this.routes = routes;
    this.webhookModel = webhookModel;
    this.origin = config.ConverterService.options.externalHost;
    this.messaging = messaging;
    this.memory = memory;
    this.constantsEvents = constantsEvents;
  }

  async requestHandler(options) {
    try {
      const content = await request(options);

      if (!content) throw new Error('not found response.body');
      return JSON.parse(content);
    } catch (err) {
      throw err;
    }
  }

  async getTransferData(dataKey) {
    try {
      const dataToSend = this.memory.dataDelivery.get(dataKey);

      await this.memory.dataDelivery.remove(dataKey);
      return dataToSend[0] || {};
    } catch (err) {
      throw err;
    }
  }

  async putTransferData(uid, saveToRedisData) {
    try {
      const dataKey = await this.memory.dataDelivery.put(uid, saveToRedisData);

      return dataKey;
    } catch (err) {
      throw err;
    }
  }

  async sendToConverterQueue(from, to, document, ownerId, uid, host = null) {
    try {
      const { webhookModel, messaging, constantsEvents } = this;

      const hookId = uuidv4();
      const managerQueue = webhookModel.getQueueId();
      const body = { document, ownerId, host, uid, from, to };

      const dataKey = await this.putTransferData(uid, body);

      messaging.pushConverterJob(constantsEvents.SYSTEM_TYPES_CONVERT, {
        hookId, dataKey, managerQueue,
      });

      const answer = await webhookModel.createWithoutUrl(hookId);

      return this.getTransferData(answer.dataKey);
    } catch (err) {
      throw err;
    }
  }

  async sendToConverterApi(endpoint, document, ownerId, uid, host = null) {
    try {
      const options = {
        method: 'POST',
        url: `${this.origin}${endpoint}`,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          document,
          ownerId,
          uid,
          host,
        }),
      };

      return this.requestHandler(options);
    } catch (err) {
      throw err;
    }
  }

  xmlToJson(document, ownerId, uid, host) {
    const { CONVERTER_API: { P_XML_TO_P_JSON } } = this.routes;

    // todo waiting for lambda
    // return this.sendToConverterQueue(FORMAT_XML, FORMAT_JSON, document, ownerId, uid, host);
    return this.sendToConverterApi(P_XML_TO_P_JSON, document, ownerId, uid, host);
  }

  jsonToXml(document, ownerId, uid) {
    const { CONVERTER_API: { P_JSON_TO_P_XML } } = this.routes;

    // todo waiting for lambda
    // return this.sendToConverterQueue(FORMAT_JSON, FORMAT_XML, document, ownerId, uid);
    return this.sendToConverterApi(P_JSON_TO_P_XML, document, ownerId, uid);
  }
}

module.exports = ConverterApi;
