const _ = require('lodash');
const Promise = require('bluebird');

module.exports = class SignatureHandler {
  constructor({ memory, converterApi, constantsEvents, operationsConstants,
      logSystem, imageModel, activityHistoryConstants, dbRemote, signatureModel,
      errorFactory }) {
    this.memory = memory;
    this.converterApi = converterApi;
    this.constantsEvents = constantsEvents;
    this.operationsConstants = operationsConstants;
    this.logSystem = logSystem;
    this.imageModel = imageModel;
    this.channel = activityHistoryConstants.channel;
    this.dbRemote = dbRemote;
    this.signatureModel = Promise.promisifyAll(signatureModel);
    this.errorFactory = errorFactory;
  }

  _mapSignature(rawSig, subType) {
    const { properties } = rawSig;
    const { SUB_TYPE: { TEXT, CURVE, IMAGE } } = this.operationsConstants;
    const meta = {};
    const result = {
      sub_type: subType,
    };

    switch (subType) {
      case TEXT:
        _.chain(result)
          .set('content.text', properties.text)
          .set(
            'meta',
          {
            ...meta,
            fontFamily: properties.fontFamily,
            fontSize: properties.fontSize,
          })
          .value();
        break;
      case CURVE:
        _.chain(result)
          .set('content.curves', properties.curves)
          .set('meta', { ...meta, width: properties.width, height: properties.height })
          .value();
        break;
      case IMAGE:
        _.chain(result)
          .set('file_id', properties.sid)
          .set('meta', { ...meta, scale: 1, width: properties.width, height: properties.height })
          .value();
        break;
      default:
        break;
    }

    return result;
  }

  async _saveSignature({ uid, sig, operation }, crossEditorHost) {
    const { signatureModel, channel, logSystem, errorFactory, constantsEvents } = this;
    const { SAVE_SIGNATURE_ERROR } = constantsEvents;

    try {
      const { id, url } = await signatureModel.addAsync(uid, sig, crossEditorHost);

      return _.chain(operation)
        .omit(['properties.sid', 'properties.signature', 'properties.visible'])
        .set('id', id)
        .set('url', url)
        .value();
    } catch (err) {
      const error = errorFactory.customError(
        err,
        { uid, channel: channel.SERVER },
        'airSlate.signatureHandler._saveSignature',
        SAVE_SIGNATURE_ERROR
      );

      logSystem.error(error.group, { ...error });

      throw error;
    }
  }

  async addSignature(userId, uid, operation, crossEditorHost) {
    try {
      operation.properties.signature = operation.properties.signature || 1;
      const signatureData = { userId };
      const { SUB_TYPE: { TEXT, CURVE, IMAGE } } = this.operationsConstants;
      const { subType } = operation.properties;
      let result = null;
      let sig = null;

      switch (subType) {
        case TEXT:
          signatureData.subType = TEXT;
          sig = this._mapSignature(operation, subType);
          result = await this._saveSignature({ uid, sig }, crossEditorHost);
          break;
        case CURVE:
          signatureData.subType = CURVE;
          sig = this._mapSignature(operation, subType);
          result = await this._saveSignature({ uid, sig }, crossEditorHost);
          break;
        case IMAGE:
          signatureData.subType = IMAGE;
          sig = this._mapSignature(operation, subType);
          result = await this._saveSignature({
            uid,
            sig,
          }, crossEditorHost);
          break;
        default:
          throw new Error('Error - Invalid signature subType');
      }

      Object.assign(operation.properties, result);
      return operation;
    } catch (err) {
      throw err;
    }
  }

  async listSignatures(uid, operation, crossEditorHost) {
    const { channel } = this;

    try {
      const rawSignaturesData = await this.signatureModel.listAsync(uid, crossEditorHost);
      const { SUB_TYPE: { TEXT, CURVE, IMAGE } } = this.operationsConstants;
      const sigs = rawSignaturesData.map((item) => {
        let result = null;
        const toOmit = ['sub_type', 'file_id', 'meta', 'user_id'];

        Object.assign(item, item.meta);
        switch (item.sub_type) {
          case TEXT:
            result = _.chain(item)
              .set('subType', item.sub_type)
              .set('text', item.content.text)
              .set('sid', item.file_id)
              .omit(toOmit.concat(['url']))
              .value();
            break;
          case CURVE:
            result = _.chain(item)
              .set('subType', item.sub_type)
              .set('curves', item.content.curves)
              .set('sid', item.file_id)
              .omit(toOmit.concat(['url']))
              .value();
            break;
          case IMAGE:
            result = _.chain(item)
              .set('subType', item.sub_type)
              .set('imageId', item.file_id)
              .omit(toOmit)
              .value();
            break;
          default:
            break;
        }
        return result;
      });

      _.set(operation, 'properties.signatures', sigs);
      return operation;
    } catch (err) {
      this.logSystem.error('LIST_SIGNATURE_ERROR', {
        uid,
        error: 'LIST_SIGNATURE_ERROR',
        message: err.message,
        channel: channel.SERVER,
      });

      throw err;
    }
  }

  deleteSignature(uid, operation, crossEditorHost) {
    const { id } = operation.properties;
    const { projectId } = this.memory.uid.getIds(uid);

    return this.signatureModel.deleteAsync(projectId, id, crossEditorHost);
  }

  async handle(uid, operation) {
    try {
      const { TYPE: { LIST, ADD, DELETE } } = this.operationsConstants;
      const { memory } = this;
      const { userId } = memory.uid.getIds(uid);
      const crossEditorHost = await memory.crossEditor.getMiddleware(uid);
      let result = null;

      switch (operation.properties.type) {
        case LIST:
          result = await this.listSignatures(uid, operation, crossEditorHost);
          break;
        case ADD:
          result = await this.addSignature(userId, uid, operation, crossEditorHost);
          break;
        case DELETE:
          result = await this.deleteSignature(uid, operation, crossEditorHost);
          break;
        default:
          throw new Error('Error - Invalid signature operation type');
      }

      return result;
    } catch (err) {
      throw err;
    }
  }
};
