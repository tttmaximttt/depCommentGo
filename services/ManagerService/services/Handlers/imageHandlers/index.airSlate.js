const fp = require('lodash/fp');
const Promise = require('bluebird');

const { flow, omit, set } = fp;

module.exports = class ImageHandler {
  constructor(injector) {
    this.memory = injector.memory;
    this.converterApi = injector.converterApi;
    this.constantsEvents = injector.constantsEvents;
    this.logSystem = injector.logSystem;
    this.imageModel = injector.imageModel;
    this.signatureModel = injector.signatureModel;
    this.channel = injector.activityHistoryConstants.channel;
  }

  addImages(uid, operation, crossEditorHost, callback) {
    const { imageModel } = this;

    operation.properties.visible = operation.properties.visible || true;

    const meta = {
      width: operation.properties.width,
      height: operation.properties.height,
      scale: 1,
      available: Number(operation.properties.visible),
    };
    const userImage = {
      name: 'added by ws',
      subType: 'image',
      fileId: operation.properties.sid,
      meta,
    };

    imageModel.add(uid, userImage, crossEditorHost, (err, data) => {
      if (err) return callback(err);
      flow(
        omit('properties.fileId'),
        set('properties.id', data.id),
        set('properties.url', data.url),
        op => callback(null, op)
      )(operation);
      return operation;
    });
  }

  deleteImages(uid, operation, crossEditorHost, callback) {
    const { projectId, userId } = this.memory.uid.getIds(uid);
    const imageId = operation.properties.id;

    operation.properties.visible = false;

    this.imageModel.delete(projectId, userId, imageId, crossEditorHost, err => callback(err, operation));
  }

  listImages(uid, operation, crossEditorHost, callback) {
    this.imageModel.list(uid, crossEditorHost, (err, images) => {
      if (err) return callback(err);
      flow(
        set('properties.images', images),
        op => callback(err, op)
      )(operation);
      return operation;
    });
  }

  /**
   *
   * @param uid
   * @param operation
   * @returns {Promise<*>}
   */
  async handle(uid, operation) {
    const listImages = Promise.promisify(this.listImages, { context: this });
    const addImages = Promise.promisify(this.addImages, { context: this });
    const deleteImages = Promise.promisify(this.deleteImages, { context: this });

    const { memory } = this;
    const crossEditorHost = await memory.crossEditor.getMiddleware(uid);
    let result = null;

    switch (operation.properties.type) {
      case 'list':
        result = await listImages(uid, operation, crossEditorHost);
        break;
      case 'add':
        result = await addImages(uid, operation, crossEditorHost);
        break;
      case 'delete':
        result = await deleteImages(uid, operation, crossEditorHost);
        break;
      case 'update':
        await deleteImages(uid, operation, crossEditorHost);
        result = await addImages(uid, operation, crossEditorHost);
        break;
      default:
        throw new Error('Error - Invalid signature operation type');
    }

    return result;
  }
};
