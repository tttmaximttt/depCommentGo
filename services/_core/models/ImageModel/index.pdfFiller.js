const crypto = require('crypto');
const { get } = require('lodash');
const _ = require('lodash');

module.exports = class ImageModel {

  /**
   * @param config
   * @param dbRemote
   * * @param {LogSystem} logSystem
   */
  constructor({ config, dbRemote, logSystem, constantsEvents, errorFactory }) {
    this.config = config;
    this.dbRemote = dbRemote;
    this.logSystem = logSystem;
    this.constantsEvents = constantsEvents;
    this.errorFactory = errorFactory;
    this.cache = {};
  }

  list(id, crossEditorHost, callback) {
    this.dbRemote.setHost(crossEditorHost).listImages(id, (err, imageList) => {
      if (err) return callback(err);
      let images = {};

      if (this.config.app === 'airSlate') {
        images = imageList.map(image => ({
          name: image.name,
          url: image.url,
          id: Number(image.id),
          visible: image.meta.visible || true,
          width: Number(image.meta.width),
          height: Number(image.meta.height),
        }));

        return callback(null, images);
      }

      images = get(imageList, 'list', [])
        .filter(image => Boolean(image) && image.signature === '0')
        .map(image => ({
          name: image.name,
          url: this.getImageUrl(image.id, image.userid, crossEditorHost),
          id: Number(image.id),
          visible: image.visible || true,
          width: Number(image.width),
          height: Number(image.height),
        }));

      callback(null, images);
    });
  }

  getUrlByImage(image) {
    return new Promise((resolve, reject) => {
      this.getImageUrl(image.id, image.userid, null, (err, reply) => {
        if (err) { return reject(err); }
        resolve(reply);
      });
    });
  }
  getImageUrl(imageId, ownerId, host, callback) {
    // todo need to check cross editor ON
    // if (!host) {
    host = this.config.databaseRemote.options.host;
    // }
    const base64 = new Buffer([imageId, ';', ownerId].join('')).toString('base64');
    const md5sum = crypto.createHash('md5');

    md5sum.update([imageId, ';', ownerId, 'PDFfillerImage'].join(''));

    const md5 = md5sum.digest('hex');
    const imageUrl = [host, 'flash/data/pics/', base64, '/', md5, '/0.png'].join('');

    if (callback) {
      callback(null, imageUrl);
    }
    return imageUrl;
  }

  add(id, userImages, crossEditorHost, callback) {
    const { dbRemote, config } = this;

    dbRemote.setHost(crossEditorHost).addImages(id, userImages, (err, result) => {
      if (err) {
        return callback(err, result);
      }

      const imageId = result.id;

      if (config.app === 'airSlate') {
        if (!result) return callback(new Error('No result.'));
        return callback(null, result.data);
      }

      return callback(null, imageId);
    });
  }

  delete(id, imageId, crossEditorHost, callback) {
    this.dbRemote.setHost(crossEditorHost).deleteImages(id, imageId, callback);
  }

  setImageInfoCache(uid, imageIdList) {
    const imageIdMap = _.keyBy(imageIdList, 'id');

    this.cache[uid] = _.assign(this.cache[uid] || {}, imageIdMap);
  }

  removeImageInfoCache(userId) {
    delete this.cache[userId];
  }

  isListCached(uid, imageIdList) {
    if (!this.cache[uid]) return false;
    const cachedIdsList = _.chain(this.cache[uid]).keys().map(a => +a).value();

    return !_.difference(imageIdList, cachedIdsList).length;
  }

  // TODO: doesn't need uid, but xmljson-transducer passes it anyway
  getCustomImagesInfo(userId, imageIdList, uid, crossEditorHost, callback) {
    if (this.isListCached(uid, imageIdList)) {
      const cachedValues = _.map(imageIdList, id => this.cache[uid][id]);

      return callback(null, cachedValues);
    }
    this.dbRemote
      .setHost(crossEditorHost)
      .getCustomImagesInfo(userId, imageIdList, (err, imageData) =>
        callback(err, get(imageData, 'list')));
  }

  verifyImageOwner(userId, imageId, crossEditorHost, callback = () => {}) {
    const { dbRemote, logSystem, constantsEvents, errorFactory } = this;

    dbRemote.setHost(crossEditorHost).verifyImageOwner(userId, imageId, (err, reply) => {
      if (err) {
        return callback(err);
      }

      if (!err && reply && reply.result === false) {
        const error = errorFactory.customError(
          new Error(constantsEvents.IMAGE_WRONG_OWNER),
          { userId, imageId },
          'ImageModel.verifyImageOwner',
          constantsEvents.IMAGE_WRONG_OWNER
        );

        logSystem.error(error.grpup, { ...error });
      }
      callback(null, reply);
    });
  }
};
