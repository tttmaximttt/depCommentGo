const Promise = require('bluebird');
const { isArray } = require('lodash');

class ConverterService {

  constructor({ logSystem, constantsEvents }) {
    this.logSystem = logSystem;
    this.constantsEvents = constantsEvents;
  }

  async do(converter, model) {
    const { logSystem, constantsEvents } = this;

    try {
      let document = model.document ? model.document : model;

      const options = {
        ownerId: model.ownerId,
        host: model.host,
        callbackUrl: model.callbackUrl,
        dpi: model.dpi,
        removeFilledTemplate: true,
        document,
      };

      if (converter.preBehavior) {
        document = await converter.preBehavior(document, options);
      }

      logSystem.debug(constantsEvents.CONVERTER_SERVICE_FLOW, {
        type: 'ConverterService.do(preBehavior)',
        converter: !!converter,
        params: { document, options },
      });

      await Promise.map(Object.keys(document).filter(i => document[i]), (async (key) => {
        document[key] = await converter.do(key, document[key], options);
      }));

      logSystem.debug(constantsEvents.CONVERTER_SERVICE_FLOW, {
        type: 'ConverterService.do(converter.do)',
        converter: !!converter,
        params: { document, options },
      });

      let errors = [];

      Object.keys(document).forEach((key) => {
        if (document[key] && document[key].errors && document[key].reply) {
          errors = errors.concat(document[key].errors);
          document[key] = document[key].reply;
        }
      });

      if (converter.postBehavior) {
        document = converter.postBehavior(document, options);
      }

      logSystem.debug(constantsEvents.CONVERTER_SERVICE_FLOW, {
        type: 'ConverterService.do(postBehavior)',
        converter: !!converter,
        params: { document, options },
      });

      if (errors && errors.length) {
        document.errors = errors;
      }

      return document;
    } catch (e) {
      throw e;
    }
  }

  async convert(converter, model) {
    const { logSystem, constantsEvents } = this;
    let document;

    logSystem.debug(constantsEvents.CONVERTER_SERVICE_FLOW, {
      type: 'ConverterService.convert ->',
      params: { model: JSON.stringify(model) },
    });

    if (isArray(converter)) {
      document = await Promise.reduce(converter,
        async (data, converterName) => this.do(converterName, data), model);
    } else {
      document = await this.do(converter, model);
    }

    delete document.__mapTemplate;
    delete document.__pagesSizes;
    delete document.__contentXml;
    delete document.__images;
    // delete document.content;

    logSystem.debug(constantsEvents.CONVERTER_SERVICE_FLOW, {
      type: 'ConverterService.convert <-',
      params: { model: JSON.stringify(document) },
    });

    return document;
  }

}

module.exports = ConverterService;
