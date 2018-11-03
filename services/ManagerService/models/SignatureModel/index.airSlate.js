const pdfFillerSignMode = require('./index.pdfFiller');

module.exports = class SignatureModel extends pdfFillerSignMode {
  list(id, crossEditorHost, callback) {
    const key = 'file_id';

    this.dbRemote.setHost(crossEditorHost).listSignatures(id, (err, signatureList) => {
      if (err) return callback(err);
      const list = signatureList;

      callback(null, list.filter(item => Boolean(item[key])));
    });
  }
};
