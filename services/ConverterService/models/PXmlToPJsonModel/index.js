const async = require('async');
const _ = require('lodash');
const { set } = require('lodash/fp');
const Promise = require('bluebird');
const uuidv4 = require('uuid/v4');

const SIGNATURES = 'signatures';
const TEMPLATE = 'template';
const xmlJsonTransducer = require('xmljson-transducer');

const XmlToJsonConverterModel = xmlJsonTransducer.xml2js;

const ENABLED_STRUCTURE = [
  'content',
  'pages',
  'attributes',
  TEMPLATE,
  SIGNATURES,
];

class PXmlToPJsonModel {

  /**
   * @param {ImageModel} imageModel
   * @param {LogSystem} logSystem
   * @param {ConstantsEvents} constantsEvents
   * @param {CoreUtils} coreUtils
   * @param {XmlHelper} xmlHelper
   * @param {Object} dbRemote
   * @param {webhookModel} webhookModel
   * @param {javaWorkerModel} javaWorkerModel
   */
  constructor({ imageModel, logSystem, constantsEvents, coreUtils, javaWorkerModel,
      xmlHelper, dbRemote, webhookModel, errorFactory }) {
    this.xmlHelper = xmlHelper;
    this.dbRemote = dbRemote;
    this.imageModel = imageModel;
    this.webhookModel = webhookModel;
    this.javaWorkerModel = javaWorkerModel;
    this.logSystem = logSystem;
    this.constantsEvents = constantsEvents;
    this.coreUtils = coreUtils;
    this.errorFactory = errorFactory;

    coreUtils.safeMethods(this, (err) => {
      const error = errorFactory.systemError(err, {}, 'PXmlToPJsonModel.safeMethods');

      logSystem.error(error.group, { ...error });
    });
  }

  convert(value, ownerId, uid, host, cb) {
    const converter = new XmlToJsonConverterModel();
    const { coreUtils, imageModel } = this;

    coreUtils.injectProperties(imageModel, converter,
      ['getCustomImagesInfo', 'getImageUrl', 'verifyImageOwner']);

    converter.convert(value, ownerId, uid, host, cb);
  }

  async preBehavior(document, options) {
    document.__contentXml = document.content;
    document.__attributesXml = document.attributes;
    const { imageIdList } = document.content ?
      await this.getImagesInXMLContent(document.content) : {};


    document.__images = !_.isEmpty(imageIdList) ?
      await this.getImagesInfo(imageIdList, options.ownerId) : [];

    return document;
  }

  do(key, value, options) {
    return new Promise((resolve, reject) => {
      const { logSystem, constantsEvents } = this;

      logSystem.debug(constantsEvents.CONVERTER_SERVICE_FLOW, {
        type: 'PXmlToAJsonModel.do',
        params: { key, value, options },
      });

      const { ownerId, uid, host } = options;

      if (!ENABLED_STRUCTURE.includes(key)) {
        return resolve(value);
      }

      if (key === SIGNATURES) {
        this.convertSignatures(
          ownerId, uid, value, host, (err, reply) => {
            if (err) { return reject(err); }
            resolve(reply[key]);
          });
      } else if (key === TEMPLATE) {
        resolve(this.convertTemplate(value));
      } else {
        this.convert(
          value, ownerId, uid, host, (err, reply) => {
            if (err && !_.isArray(err)) {
              return reject(err);
            }
            if (err) {
              return resolve({ reply: reply[key], errors: err });
            }
            resolve(reply[key]);
          });
      }
    });
  }

  convertSignatures(userId, uid, signatures, crossEditorHost, callback) {
    const { logSystem, errorFactory } = this;
    const validSignatures = signatures.filter((signature) => {
      const { sig, type, id } = signature;

      if (!sig || sig === '0') return false;

      if (type === 1) {
        const converter = new XmlToJsonConverterModel();
        const err = converter.validateDrawnSignature(sig);

        if (err) {
          const error = errorFactory.systemError(
            err,
            { uid, signatureId: id },
            'PXmlToPJsonModel.convertSignatures'
          );

          logSystem.error(error.group, { ...error });

          return false;
        }
      }

      return true;
    });

    async.map(validSignatures, ({ sig, id }, done) =>
      this.convert(sig, userId, uid, crossEditorHost, (err, sigJSON) => {
        if (err) {
          const error = errorFactory.conversionError(
            err,
            { uid },
            'PXmlToPJsonModel.convertSignatures'
          );

          logSystem.error(error.group, { ...error });

          return done(null, null);
        }

        done(null, id ? set('id', Number(id), sigJSON) : sigJSON);
      }), (err, userSignatures) =>
        callback(err, { signatures: userSignatures.filter(_.isPlainObject) })
    );
  }

  getUnavailableContent(content, unavailableContentTypes) {
    return this.xmlHelper.processContent(content, {
      segmentationTags: unavailableContentTypes,
      findImages: true,
    });
  }

  getImagesInXMLContent(content) {
    return this.xmlHelper.processContent(content, { findImages: true });
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

  async getImagesInfo(imageIdList, userId) {
    try {
      const { imageModel } = this;

      return new Promise((resolve, reject) => {
        imageModel.getCustomImagesInfo(userId, imageIdList, null, null, async (err, reply) => {
          if (err || !reply.length) { return reject(err); }
          const images = {};

          await Promise.map(reply, (async (image) => {
            images[`s${image.id}`] = {
              width: image.width,
              height: image.height,
              url: await imageModel.getUrlByImage(image),
            };
          }));
          resolve(images);
        });
      });
    } catch (e) {
      throw e;
    }
  }

  convertTemplate(value) {
    const templateJSON = typeof value === 'string' ? JSON.parse(value) : value;

    if (templateJSON.data && templateJSON.data.length) {
      templateJSON.data.forEach(page => page.forEach((templateItem) => {
        if (templateItem.type === 'checkmark') {
          templateItem.initial =
            (templateItem.initial === 1 || templateItem.initial === '1' || templateItem.initial === true);
        }
        if (templateItem.allowEditing !== null && !_.isArray(templateItem.allowEditing)) {
          templateItem.allowEditing = null;
        }
      }));
    }

    return typeof value === 'string' ? JSON.stringify(templateJSON) : templateJSON;
  }
}

module.exports = PXmlToPJsonModel;
