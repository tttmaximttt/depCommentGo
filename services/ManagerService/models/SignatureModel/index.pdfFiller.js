const { get } = require('lodash');

module.exports = class SignatureModel {
  constructor({ dbRemote, config, generalConstants }) {
    this.dbRemote = dbRemote;
    this.config = config;
    this.generalConstants = generalConstants;
  }

  list(id, crossEditorHost, callback) {
    const key = 'sig';

    this.dbRemote.setHost(crossEditorHost).listSignatures(id, (err, signatureList) => {
      if (err) return callback(err);
      const list = get(signatureList, 'list');

      callback(null, list.filter(item => Boolean(item[key])));
    });
  }

  add(id, signatureData, crossEditorHost, callback) {
    this.dbRemote.setHost(crossEditorHost).addSignatures(id, signatureData, (err, result) => {
      if (err) return callback(err);
      const imageId = get(result, 'id');
      const url = get(result, 'url');

      callback(null, { id: imageId, url });
    });
  }

  delete(id, imageId, crossEditorHost, callback) {
    this.dbRemote.setHost(crossEditorHost).deleteSignatures(id, imageId, callback);
  }
};
