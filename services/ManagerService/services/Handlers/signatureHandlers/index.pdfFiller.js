const fp = require('lodash/fp');
const _ = require('lodash');
const Promise = require('bluebird');

const { assign, flow, omit, set, curry } = fp;
const async = require('async');

module.exports = class SignatureHandler {
  constructor({ memory, converterApi, constantsEvents, logSystem, imageModel,
      signatureModel, activityHistoryConstants, errorFactory }) {
    this.memory = memory;
    this.converterApi = converterApi;
    this.constantsEvents = constantsEvents;
    this.logSystem = logSystem;
    this.imageModel = imageModel;
    this.signatureModel = signatureModel;
    this.channel = activityHistoryConstants.channel;
    this.errorFactory = errorFactory;
  }

  addImages(userId, operation, crossEditorHost, callback) {
    const { imageModel } = this;

    operation.properties.visible = operation.properties.visible || true;

    const userImage = {
      name: 'added by ws',
      scale: 1,
      available: Number(operation.properties.visible),
      width: operation.properties.width,
      height: operation.properties.height,
      signature: Number(operation.properties.signature || 0),
      sid: operation.properties.sid,
    };

    imageModel.add(userId, userImage, crossEditorHost, (err, imageId) =>
      (err ? callback(err) : flow(
        omit('properties.sid'),
        set('properties.id', imageId),
        set('properties.url', imageModel.getImageUrl(imageId, userId, crossEditorHost)),
        op => callback(null, op)
      )(operation))
    );
  }

  convertToB64(xml) {
    return new Buffer(xml).toString('base64');
  }

  convertAndAddSignature({ uid, signatureData, operation }, crossEditorHost, callback) {
    const { signatureModel, logSystem, channel, errorFactory } = this;
    const { userId } = signatureData;
    const signatures = [operation.properties];

    async.waterfall([
      async () => {
        try {
          const convertedData = await this.converterApi.jsonToXml({ signatures }, userId, uid);
          const { errors } = convertedData;

          if (errors) {
            const error = errorFactory.conversionError(
              errors,
              { uid, channel: channel.SERVER },
              'signatureHandlers.convertAndAddSignature',
              'pdfFiller'
            );

            logSystem.error(error.group, { ...error });

            throw error;
          }
          return convertedData;
        } catch (err) {
          throw err;
        }
      },
      // process xml and add the signature
      (signaturesXML, next) => flow(
        this.convertToB64,
        xmlString => assign(signatureData, { postData: xmlString }),
        signDataWithXML => signatureModel.add(userId, signDataWithXML, crossEditorHost, next),
      )(signaturesXML.signatures ? signaturesXML.signatures[0] : ''),
    ], (err, res = {}) =>
      (err ? callback(err) : flow(
        omit(['properties.sid', 'properties.signature', 'properties.visible']),
        set('properties.id', res.id),
        op => callback(null, op)
      )(operation)));
  }

  addSignature(userId, uid, operation, crossEditorHost, callback) {
    operation.properties.signature = operation.properties.signature || 1;

    const signatureData = { userId };

    switch (operation.properties.subType) {
      case 'text':
        signatureData.type = 0;
        this.convertAndAddSignature({ uid, signatureData, operation }, crossEditorHost, callback);
        break;
      case 'curve':
        signatureData.type = 1;
        this.convertAndAddSignature({ uid, signatureData, operation }, crossEditorHost, callback);
        break;
      case 'image':
        signatureData.type = 2;
        async.waterfall([
          next => this.addImages(userId, operation, crossEditorHost, next),
          (op, next) => this.convertAndAddSignature({
            uid,
            signatureData,
            operation: _.merge(op, { properties: { imageId: op.properties.id } }),
          }, crossEditorHost, next),
        ], callback);
        break;
      default:
        callback('Error - Invalid signature subType');
    }
  }

  listSignatures(userId, uid, operation, crossEditorHost, callback) {
    async.waterfall([
      next => this.signatureModel.list(userId, crossEditorHost, next),
      async (signatures) => {
        try {
          const convertedData = await this.converterApi.xmlToJson(
              { signatures }, userId, uid
            );

          if (convertedData.errors) {
              // TODO: add log for copnversion errors. Waiting for changes from Alex Nechaev
          }
          return convertedData;
        } catch (err) {
          throw err;
        }
      },
    ],
      (err, sigJSONList) => (err ? callback(err) : flow(
        set('properties.signatures', sigJSONList.signatures),
        curry(callback)(err)
      )(operation)));
  }

  deleteSignature(userId, uid, operation, crossEditorHost, callback) {
    const { id } = operation.properties;

    this.signatureModel.delete(userId, id, crossEditorHost, err => callback(err, operation));
  }

  async handle(uid, operation) {
    const listSignatures = Promise.promisify(this.listSignatures, { context: this });
    const addSignature = Promise.promisify(this.addSignature, { context: this });
    const deleteSignature = Promise.promisify(this.deleteSignature, { context: this });

    const { memory } = this;
    const { userId } = memory.uid.getIds(uid);
    const crossEditorHost = memory.crossEditor.getMiddleware(uid);
    let result = null;

    switch (operation.properties.type) {
      case 'list':
        result = await listSignatures(userId, uid, operation, crossEditorHost);
        break;
      case 'add':
        result = await addSignature(userId, uid, operation, crossEditorHost);
        break;
      case 'delete':
        result = await deleteSignature(userId, uid, operation, crossEditorHost);
        break;
      case 'update':
        await deleteSignature(userId, uid, operation, crossEditorHost);
        result = await addSignature(userId, uid, operation, crossEditorHost);
        break;
      default:
        throw new Error('Error - Invalid signature operation type');
    }

    return result;
  }
};
