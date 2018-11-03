const _ = require('lodash');

const CLIENT_TYPE = 'js';
const LAUNCH_MODE = 'editor';
const SOURCE_URL_PATH = 'source.pdf.url';
const NATIVE_MODE = 'true_edit';

class SourceHelper {

  /**
   * @param {Object} dbRemote
   */
  constructor({ dbRemote }) {
    this.dbRemote = dbRemote;
  }

  getActualPdf(userId, projectId, callback) {
    const { dbRemote } = this;

    dbRemote.editorRefresh(
        { userId, projectId, clientType: CLIENT_TYPE, launch: LAUNCH_MODE },
        (error, res) => callback(error, _.get(res, SOURCE_URL_PATH))
    );
  }

  getPdfByProcessId(userId, projectId, processId, mode, callback) {
    const { dbRemote } = this;
    const tempPdfData = { projectId, processId, viewerId: userId, mode, read: null };

    dbRemote.loadTempPdf(tempPdfData, (err, url) => {
      callback(err, url, processId);
    });
  }

  getPdfByProcessIdForNative(userId, projectId, processId, callback) {
    this.getPdfByProcessId(userId, projectId, processId, NATIVE_MODE, callback);
  }

}

module.exports = SourceHelper;
