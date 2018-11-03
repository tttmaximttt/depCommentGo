const async = require('async');
const _ = require('lodash');

const SIGNATURES = 'signatures';
const CONFIG = 'config';
const ATTRIBUTES = 'attributes';
const CONTENT = 'content';

const xmlJsonTransducer = require('xmljson-transducer');

const JsonToXmlConverterModel = xmlJsonTransducer.js2xml;

const ENABLED_STRUCTURE = [
  'content',
  'pages',
  'attributes',
  SIGNATURES,
];

class PJsonToPXmlModel {

  /**
   * @param {ImageModel} imageModel
   * @param {LogSystem} logSystem
   * @param {ConstantsEvents} constantsEvents
   * @param {CoreUtils} coreUtils
   * @param {XmlHelper} xmlHelper
   */
  constructor({ imageModel, logSystem, coreUtils, xmlHelper, errorFactory }) {
    this.xmlHelper = xmlHelper;
    this.coreUtils = coreUtils;
    this.imageModel = imageModel;
    this.errorFactory = errorFactory;

    coreUtils.safeMethods(this, (err) => {
      const error = errorFactory.systemError(err, {}, 'PJsonToPxmlModel.safeMethods');

      logSystem.error(error.group, { ...error });
    });
  }

  convert(value, ownerId, uid, cb) {
    const converter = new JsonToXmlConverterModel();
    const { coreUtils, imageModel } = this;

    coreUtils.injectProperties(imageModel, converter,
      ['getCustomImagesInfo', 'getImageUrl', 'verifyImageOwner']);

    converter.convert(value, ownerId, uid, cb);
  }

  do(key, value, options) {
    return new Promise((resolve, reject) => {
      const { ownerId, uid } = options;
      const a = {};

      if (!ENABLED_STRUCTURE.includes(key)) {
        return resolve(value);
      }

      if (key === SIGNATURES) {
        this.convertSignatures(
          ownerId, uid, value, (err, reply) => {
            if (err) { return reject(err); }
            resolve(reply);
          });
      } else {
        if (key === CONFIG) {
          a.content = value.content;
        } else {
          a[key] = value;
        }

        if (key === ATTRIBUTES && !Object.keys(value).length) {
          a[key] = {};
        }

        if (key === CONTENT) {
          value.forEach((item) => {
            item.forEach((val) => {
              const contentX = _.get(val, 'contentX');
              const contentY = _.get(val, 'contentY');

              if (contentX) {
                val.x = contentX;
              }

              if (contentY) {
                val.y = contentY;
              }
            });
          });
        }

        this.convert(a, ownerId, uid, (err, reply) => {
          if (!reply && err && !_.isArray(err)) {
            return reject(err);
          }
          if (!reply && err) {
            return resolve({ reply: reply[key], errors: err });
          }
          resolve(reply);
        });
      }
    });
  }

  convertSignatures(userId, uid, signatures, callback) {
    const { logSystem, xmlHelper, errorFactory } = this;

    async.map(signatures, (sig, done) =>
      this.convert(sig, userId, uid, (err, sigXML) => {
        if (err) {
          const error = errorFactory.conversionError(err, { uid }, 'PJsonToPxmlModel.convertSignatures');

          logSystem.error(error.group, { ...error });

          return done(null, null);
        }

        done(null, xmlHelper.clean(sigXML));
      }), callback);
  }
}

module.exports = PJsonToPXmlModel;
