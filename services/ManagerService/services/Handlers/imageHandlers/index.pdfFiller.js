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
    const { userId } = this.memory.uid.getIds(uid);

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

  deleteImages(uid, operation, crossEditorHost, callback) {
    const { userId } = this.memory.uid.getIds(uid);
    const imageId = operation.properties.id;

    operation.properties.visible = false;

    this.imageModel.delete(userId, imageId, crossEditorHost, err => callback(err, operation));
  }

  listImages(uid, operation, crossEditorHost, callback) {
    const { userId } = this.memory.uid.getIds(uid);

    this.imageModel.list(userId, crossEditorHost, (err, images) =>
      (err ? callback(err) : flow(
        set('properties.images', images),
        op => callback(err, op)
      )(operation))
    );
  }

  /**
   *
   * @param uid
   * @param operation
   * @returns {Promise<*>}
   */
  async handle(uid, operation) {
    try {
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
    } catch (err) {
      throw err;
    }
  }
};
