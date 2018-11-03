const request = require('request');
const httpError = require('http-errors');
const CoreRequest = require('./coreRequest');

const SERVER_ERROR = 'Internal Server Error';

const documentContentConstants = require('../../constants/DocumentContentConstants')();

module.exports = class ApiAirslate extends CoreRequest {
  constructor(injector) {
    super(injector);
    this.errorFactory = injector.errorFactory;
    this.coreUtils = injector.coreUtils;
  }
  /**
   *
   * @param viewerId
   * @param projectId
   * @param clientType
   * @param launch
   * @param access
   * @param apiHash
   * @param userAgent
   * @param callback
   */
  editorAuth(
    viewerId = false, projectId = false, clientType = false, launch = false, access = false,
    apiHash = false, userAgent = '', queryParams = {}, callback
  ) {
    if (!viewerId) return callback('editorAuth(), invalid viewerId passed.');
    if (!projectId) return callback('editorAuth(), invalid projectId passed.');
    if (!apiHash) return callback('editorAuth(), invalid apiHash passed.');
    if (!launch) return callback('editorAuth(), invalid launch passed.');
    if (!clientType) return callback('editorAuth(), invalid clientType passed.');

    const context = {
      userId: viewerId,
      projectId,
      apiHash,
      userAgent,
      queryParams,
      clientType,
      launch,
      access,
    };
    const wrappedCallback = this.logRequest('editorAuth', context, true, callback);

    const options = {
      url: this.url + this.endpoints.editorAuth,
      method: 'GET',
      json: true,
      headers: {
        userId: viewerId,
        Authorization: `Bearer ${apiHash}`,
        'user-agent': userAgent,
      },
      qs: Object.assign({
        project_id: projectId,
        project_version: '0',
        client_type: clientType,
        launch,
        access,
      }, queryParams, this.commonQueryParams),
    };

    this.sendRequest(options, (err, responseData, res) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'editorAuth');
        return wrappedCallback(err, null);
      }

      wrappedCallback(null, responseData, res);
    });

    return options;
  }

  send(options, callback) { // это не я писал
    options.time = true;
    if (this.crossEditorEnabled) {
      options.url = this.crossEditor.mapHost(options.url, this._host);
    }

    request(Object.assign({}, this.requiredOptions, options), (err, res, body) => {
      if (typeof (callback) !== 'function') return;

      if (err) {
        return callback(err, null);
      }

      if (res.statusCode >= 400) {
        const error = httpError.ServiceUnavailable(
          `Third party service error, respond with status ${res.statusCode}`,
          {
            error: res.body,
            status: res.statusCode,
          });

        error.options = options;
        return callback(error, null);
      }

      if (typeof body === 'string' && res.statusCode >= 200 && res.statusCode < 300) {
        try {
          body = JSON.parse(body);
          body.elapsedTime = res.elapsedTime;
        } catch (error) {
          return callback(error);
        }
      }

      if (body.errors) {
        const apiError = new Error('Api error');

        apiError.message = JSON.stringify(body.errors);
        return callback(apiError, null, res);
      }

      return callback(null, body.data, res);
    });
    if (this._host) {
      this.clearHost();
    }
  }

  sendRequest(options, cb) {
    return this.send(options, cb);
  }
  /**
   *
   * @param userId
   * @param projectId
   * @param data
   * @param queryParams
   * @param callback
   */
  editorDefaults(
    userId = false, projectId = false, data, queryParams = {}, apiHash = false, callback
  ) {
    if (!userId) return callback('editorDefaults(), invalid viewerId passed.');
    if (!projectId) return callback('editorDefaults(), invalid projectId passed.');
    if (!apiHash) return callback('editorDefaults(), invalid apiHash passed.');

    const context = {
      userId,
      projectId,
      data,
    };
    const wrappedCallback = this.logRequest('editorDefaults', context, true, callback);

    const options = {
      url: `${this.url}${this.endpoints.editorDefaults}/${projectId}`,
      method: 'POST',
      json: true,
      headers: {
        userId,
        appKey: this.appKey,
        token: apiHash,
      },
      qs: Object.assign({
        project_id: projectId,
        new_version: true,
      }, queryParams, this.commonQueryParams),
      body: { data },
    };

    this.sendRequest(options, (err, responseData, res) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'editorDefaults');
      }

      return wrappedCallback(err, responseData, res);
    });
  }

  /**
   *
   * @param {Number} viewerId
   * @param {Number} projectId
   * @param {Number} version
   * @param {Array} allowExtraData
   * @param {Function} callback
   */
  getDocumentContent(viewerId = false, projectId = false, version = false, allowExtraData = [], callback = () => { }) { // eslint-disable-line
    if (!viewerId) return callback('getDocumentContent(), invalid viewerId passed.');
    if (!projectId) return callback('getDocumentContent(), invalid projectId passed.');

    const context = {
      userId: viewerId,
      projectId,
      version,
      allowExtraData,
    };
    const wrappedCallback = this.logRequest('getDocumentContent', context, false, (err, body, res) => {
      const result = body.data || {};

      if (err) {
        err = this.errorFactory.apiError(err, null, 'getDocumentContent');

        return callback(err);
      }

      const { statusCode } = res;
      const {
        DOCUMENT_CONTENT_STATUS,
        DOCUMENT_CONTENT_STATUS_CODE,
      } = documentContentConstants;

      if (statusCode === DOCUMENT_CONTENT_STATUS_CODE.PENDING) {
        result.status = DOCUMENT_CONTENT_STATUS.PENDING;
      } else if (statusCode === DOCUMENT_CONTENT_STATUS_CODE.FINISHED) {
        result.status = DOCUMENT_CONTENT_STATUS.FINISHED;
      } else {
        result.status = DOCUMENT_CONTENT_STATUS.ERROR;
      }

      return callback(null, result);
    });

    const options = {
      url: this.url + this.endpoints.getDocumentContent,
      method: 'GET',
      json: true,
      omitStatusCode: true,
      headers: {
        userId: viewerId,
        appKey: this.appKey,
      },
      qs: Object.assign({
        version,
        project_id: projectId,
        allowExtraData,
      }, this.commonQueryParams),
    };

    this.sendRequest(options, (err, responseData, res) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'editorDefaults');
        return wrappedCallback(err, null);
      }

      return wrappedCallback(null, responseData, res);
    });

    return options;
  }

  /**
   *
   * @param viewerId
   * @param projectId
   * @param isNewVersion
   * @param authors
   * @param content
   * @param callback
   */
  setDocumentContent(
    viewerId = false, projectId = false, isNewVersion = false, authors = false, content = false,
    queryParams = {}, callback = false
  ) {
    if (!viewerId) return callback('setDocumentContent(), invalid viewerId passed.');
    if (!projectId) return callback('setDocumentContent(), invalid projectId passed.');
    if (!content) return callback('setDocumentContent(), invalid content passed.');

    const context = {
      userId: viewerId,
      projectId,
      authors,
      data: typeof content === 'string' ? content.length : -1,
    };
    const wrappedCallback = this.logRequest('setDocumentContent', context, true, callback);
    const [
      contentSize,
      attributesSize,
      pagesSize,
      templateSize,
    ] = this.coreUtils.getStringBytesLength([
      content.content,
      content.attributes,
      content.pages,
      content.template,
    ].map((data) => {
      try {
        return JSON.stringify(data);
      } catch (e) {
        return data || '';
      }
    }));

    const options = {
      url: this.url + this.endpoints.setDocumentContent,
      method: 'POST',
      json: true,
      headers: {
        userId: viewerId,
        appKey: this.appKey,
      },
      qs: Object.assign({
        project_id: projectId,
        new_version: isNewVersion ? 1 : 0,
        content_size: contentSize,
        attributes_size: attributesSize,
        pages_size: pagesSize,
        template_size: templateSize,
      }, queryParams, this.commonQueryParams),
      body: {
        authors,
        content,
      },
    };

    this.sendRequest(options, (err, responseData, res) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'setDocumentContent');
      }

      return wrappedCallback(err, responseData, res);
    });

    return options;
  }

  /**
   *
   * @param viewerId
   * @param projectId
   * @param callback
   */
  getDocumentVersions(viewerId = false, projectId = false, callback) {
    if (!viewerId) return callback('getDocumentVersions(), invalid viewerId passed.');
    if (!projectId) return callback('getDocumentVersions(), invalid projectId passed.');

    const context = {
      userId: viewerId,
      projectId,
    };
    const wrappedCallback = this.logRequest('getDocumentVersions', context, false, callback);

    const options = {
      url: this.url + this.endpoints.getDocumentVersions,
      method: 'GET',
      json: true,
      headers: {
        userId: viewerId,
        appKey: this.appKey,
      },
      qs: Object.assign({
        viewer_id: viewerId,
        project_id: projectId,
      }, this.commonQueryParams),
    };

    this.send(options, (err, result) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'getDocumentVersions');

        return wrappedCallback(err);
      }

      if (result.result) {
        return wrappedCallback(null, result.data);
      }
      return wrappedCallback(result);
    });
  }

  /**
   * @param {String} longUrl
   */
  getShortUrl(longUrl, callback) {
    if (!longUrl) return callback('getShortUrl(), invalid url passed.');

    const options = {
      url: this.url + this.endpoints.getShortUrl,
      method: 'GET',
      headers: {
        appKey: this.appKey,
      },
      qs: Object.assign({
        url: longUrl,
      }, this.commonQueryParams),
    };

    this.send(options, (err, result) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'getShortUrl');

        return callback(err);
      }

      if (result.result) {
        return callback(null, result.data.url);
      }
      return callback(result);
    });
  }

  /**
   * Save the PDF document into a temp storage, and get a non term link for it.
   * Tmp file should be cleared after the destruction call
   *
   * @param viewerId
   * @param projectId
   * @param processId
   * @param mode
   * @param callback
   */
  loadTempPdf(data, callback) {
    const { viewerId, projectId, processId, mode, read } = data;

    if (!viewerId) return callback('loadTempPdf(), invalid viewerId passed.');
    if (!projectId) return callback('loadTempPdf(), invalid projectId passed.');
    if (!processId) return callback('loadTempPdf(), invalid processId passed.');

    const context = {
      userId: viewerId,
      projectId,
      processId,
    };
    const wrappedCallback = this.logRequest('loadTempPdf', context, true, (err, body = {}) => {
      if (err) {
        return callback(err);
      }

      return callback(body.url ? null : 'shortUrl missing', body.url);
    });

    const options = {
      url: this.url + this.endpoints.loadTempPdf,
      method: 'POST',
      headers: {
        appKey: this.appKey,
      },
      qs: Object.assign({
        userId: viewerId,
        project_id: projectId,
        process_id: processId,
        mode: typeof mode === 'string' ? mode : null,
        read,
      }, this.commonQueryParams),
    };

    this.send(options, (err, result) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'loadTempPdf');

        return wrappedCallback(err);
      }

      if (result.result) {
        return wrappedCallback(null, result.data.url);
      }
      return wrappedCallback(
        `Api call loadTempPdf failed with error. Incoming data: viewerId: ${viewerId} `
        + `projectId: ${projectId} processId: ${processId}`
      );
    });
  }

  /**
   *
   * @param viewerId
   * @param projectId
   * @param defaults
   * @param params
   * @param callback
   */
  editorDestroy(
    viewerId = false, projectId = false, defaults = false, destroyParams = {}, queryParams = {},
    callback = false
  ) {
    if (!viewerId) return callback('editorDestroy(), invalid viewerId passed.');
    if (!projectId) return callback('editorDestroy(), invalid projectId passed.');

    const context = {
      userId: viewerId,
      projectId,
      defaults,
      destroyParams,
      queryParams,
    };
    const wrappedCallback = this.logRequest('editorDestroy', context, true, callback);

    const options = {
      method: 'POST',
      url: this.url + this.endpoints.editorDestroy,
      json: true,
      headers: {
        userId: viewerId,
        appKey: this.appKey,
      },
      form: {
        defaults: JSON.stringify(defaults),
        params: JSON.stringify(destroyParams),
      },
      qs: Object.assign({
        project_id: projectId,
      }, queryParams, this.commonQueryParams),
    };

    this.sendRequest(options, (err, responseData, res) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'editorDestroy');
      }

      return wrappedCallback(err, responseData, res);
    });

    return options;
  }

  /**
   *
   * @param viewerId
   * @param projectId
   * @param defaults
   * @param documentFinish
   * @param callback
   */
  deleteEditorSettings(
    viewerId = false, projectId = false, defaults = false, documentFinish = false, callback
  ) {
    if (!viewerId) return callback('deleteEditorSettings(), invalid viewerId passed.');
    if (!projectId) return callback('deleteEditorSettings(), invalid projectId passed.');
    if (!documentFinish) return callback('deleteEditorSettings(), invalid documentFinish passed.');

    const options = {
      method: 'DELETE',
      url: this.url + this.endpoints.editorSettings.replace('@USER_ID', viewerId),
      json: true,
      qs: Object.assign({
        project_id: projectId,
        document_finish: documentFinish,
      }, this.commonQueryParams),
      body: { defaults: JSON.stringify(defaults) },
    };

    this.send(options, (err, result) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'deleteEditorSettings');

        return callback(err);
      }
      return callback(null, result);
    });

    return options;
  }

  /**
   *
   * @param userId
   * @param callback
   */

  listImages(uid, callback) {
    const [userId, projectId] = uid.split('_');

    const options = {
      url: this.url + this.endpoints.listImages,
      method: 'GET',
      qs: Object.assign({
        appKey: this.appKey,
        user_id: userId,
        project_id: projectId,
      }, this.commonQueryParams),
    };

    this.send(options, (err, result) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'listImages');

        return callback(err);
      }
      callback(null, result);
    });

    return options;
  }

  /**
   *
   * @param userId
   * @param systemId
   * @param callback
   */

  getOneImage(userId, systemId, callback) {
    const options = {
      url: this.url + this.endpoints.getOneImage.replace('@SYSTEM_ID', systemId),
      method: 'GET',
      qs: Object.assign({
        appKey: this.appKey,
        userId,
      }, this.commonQueryParams),
    };

    this.send(options, (err, result) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'getOneImage');

        return callback(err);
      }
      callback(null, result);
    });
  }

  /**
   *
   * @param userId
   * @param ids
   * @param callback
   */

  getCustomImagesInfo(userId, ids, callback) {
    const options = {
      url: this.url + this.endpoints.customImage,
      method: 'POST',
      qs: Object.assign({
        appKey: this.appKey,
        userId,
      }, this.commonQueryParams),
      form: {
        ids,
      },
    };

    this.send(options, (err, result) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'getCustomImagesInfo');

        return callback(err);
      }
      callback(null, result);
    });

    return options;
  }

  /**
   * @param userId
   * @param imageId
   * @param callback
   * @returns {{url: string, method: string, qs: {appKey: string, userId: *} }}
   */
  verifyImageOwner(userId, imageId, callback) {
    const options = {
      url: `${this.url}${this.endpoints.verifyImage}${imageId}`,
      method: 'POST',
      qs: Object.assign({
        appKey: this.appKey,
        userId,
      }, this.commonQueryParams),
    };

    this.send(options, (err, result) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'verifyImageOwner');

        return callback(err);
      }
      callback(null, result);
    });

    return options;
  }

  /**
   *
   * @param userId
   * @param attributes
   * @param callback
   */
  addImages(uid, attributes, callback) {
    const [userId, projectId] = uid.split('_');
    const options = {
      url: this.url + this.endpoints.addImages,
      method: 'POST',
      json: {
        file_id: attributes.fileId,
        meta: attributes.meta,
      },
      qs: Object.assign({
        appKey: this.appKey,
        user_id: userId,
        project_id: projectId,
        name: attributes.name,
        sub_type: attributes.subType,
      }, this.commonQueryParams),
    };

    this.send(options, (err, result) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'addImages');

        return callback(err);
      }
      callback(null, result);
    });

    return options;
  }

  /**
   *
   * @param userId
   * @param callback
   */

  deleteImages(projectId, userId, systemId, callback) {
    const options = {
      url: this.url + this.endpoints.deleteImages.replace('@SYSTEM_ID', systemId),
      method: 'GET',
      qs: Object.assign({
        appKey: this.appKey,
        projectId,
        userId,
      }, this.commonQueryParams),
    };

    this.send(options, (err, result) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'deleteImages');

        return callback(err);
      }
      callback(null, result);
    });

    return options;
  }

  updateImages(projectId, attributes, callback) {
    const options = {
      url: this.url + this.endpoints.deleteImages,
      method: 'GET',
      qs: Object.assign({
        appKey: this.appKey,
        userId: attributes.userId,
        projectId,
      }, this.commonQueryParams),
    };

    this.send(options, (err, result) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'updateImages');

        return callback(err);
      }
      callback(null, result);
    });
  }

  /**
   *
   * @param userId
   * @param callback
   */

  listSignatures(uid, callback) {
    const [userId, projectId] = uid.split('_');
    const options = {
      url: this.url + this.endpoints.listSignatures,
      method: 'GET',
      qs: Object.assign({
        appKey: this.appKey,
        project_id: projectId,
        user_id: userId,
      }, this.commonQueryParams),
    };

    this.send(options, (err, result) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'listSignatures');

        return callback(err);
      }
      callback(null, result);
    });

    return options;
  }

  /**
   *
   * @param userId
   * @param attributes
   * @param callback
   */

  addSignatures(uid, sig, callback) {
    const [userId, projectId] = uid.split('_');
    const options = {
      url: this.url + this.endpoints.addSignatures,
      method: 'POST',
      json: {
        ...sig,
      },
      qs: Object.assign({
        appKey: this.appKey,
        project_id: projectId,
        user_id: userId,
      }, this.commonQueryParams),
    };

    this.send(options, (err, result) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'addSignatures');

        return callback(err);
      }
      callback(null, result);
    });

    return options;
  }

  /**
   *
   * @param userId
   * @param systemId
   * @param callback
   */

  deleteSignatures(projectId, systemId, callback) {
    const options = {
      url: this.url + this.endpoints.deleteSignatures.replace('@SYSTEM_ID', systemId),
      method: 'GET',
      qs: Object.assign({
        appKey: this.appKey,
        project_id: projectId,
      }, this.commonQueryParams),
    };

    this.send(options, (err, result) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'deleteSignatures');

        return callback(err);
      }
      callback(null, result);
    });

    return options;
  }

  /**
   *
   * @param userId
   * @param projectId
   * @param callback
   */

  editorRefresh({ userId, projectId, clientType, launch, version }, callback) {
    if (!projectId) return callback('editorRefresh(), invalid projectId passed.');
    if (!launch) return callback('editorRefresh(), invalid launch passed.');
    if (!clientType) return callback('editorRefresh(), invalid clientType passed.');

    const context = {
      userId,
      projectId,
      launch,
      version,
    };
    const wrappedCallback = this.logRequest('editorRefresh', context, true, callback);

    const options = {
      url: this.url + this.endpoints.editorRefresh,
      method: 'GET',
      json: true,
      headers: {
        userId,
        appKey: this.appKey,
      },
      qs: Object.assign({
        project_id: projectId,
        project_version: '0',
        client_type: clientType,
        launch,
        version,
        access: false,
      }, this.commonQueryParams),
    };

    this.send(options, (err, result) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'editorRefresh');

        wrappedCallback(err);
      } else if (result.result) {
        wrappedCallback(null, result.data);
      } else {
        wrappedCallback(result);
      }
    });

    return options;
  }

  /**
   * Get api_hash from php
   * @param userId
   * @param callback
   */
  getApiHash(userId, callback) {
    const options = {
      url: this.url + this.endpoints.getApiHash,
      method: 'GET',
      qs: Object.assign({
        user_id: userId,
      }, this.commonQueryParams),
    };

    this.send(options, (err, result) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'getApiHash');

        return callback(err);
      }
      if (!result.errors) return callback(null, result);
      callback(result.errors, result);
    });
  }

  /**
   *
   * @param options
   * @param error
   * @param callback
   */

  getLocation(options, error, callback) {
    if (typeof error === 'string') return callback(SERVER_ERROR);
    let result = Array.isArray(error) ? error[0] : error;
    const ops = {
      url: this.url + this.endpoints.getLocation,
      method: 'GET',
      json: true,
      headers: {
        userId: options && options.headers ? options.headers.userId : null,
        appKey: this.appKey,
      },
      qs: Object.assign({
        project_id: options.qs.project_id,
        endpoint: options.url,
        error: [result],
      }, this.commonQueryParams),
    };

    request(ops, (err, res, body) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'getLocation');

        return callback(err);
      }

      if (body && body.data) {
        if (!result) {
          result = {};
        }
        result.location = body.data.location;
      }

      if (result) {
        callback(result);
      } else {
        // todo !!!!
        callback({ location: '/' });
      }
    });
  }

  /**
   * Get clients' info from php
   * @method getUsersInfo
   * @param {String} userId
   * @param {String} projectId
   * @param {Array} usersIds
   * @param {String} deviceType
   * @param {Function} callback
   * @returns {Object} options
   */
  getUsersInfo(userId, projectId, usersIds, deviceType, callback) {
    if (!userId) return callback('getUsersInfo(), invalid userId passed.');
    if (!projectId) return callback('getUsersInfo(), invalid projectId passed.');
    if (!Array.isArray(usersIds)) callback('getUsersInfo(), no users\' ids passed.');

    const context = { userId, projectId, usersIds, deviceType };
    const wrappedCallback = this.logRequest('getUsersInfo', context, true, callback);

    const options = {
      url: this.url + this.endpoints.usersInfo,
      method: 'GET',
      json: true,
      headers: {
        userId,
        appKey: this.appKey,
      },
      qs: Object.assign({
        projectId,
        userId,
        clientType: 'js',
        device: deviceType,
        users: usersIds.join(','),
      }, this.commonQueryParams),
    };

    this.send(options, (err, result) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'getUsersInfo');

        wrappedCallback(err);
      } else if (result.result) {
        wrappedCallback(null, result.data);
      } else {
        wrappedCallback(result);
      }
    });

    return options;
  }

  /**
   *
   * @param userId
   * @param projectId
   * @param folderId
   * @param callback
   */

  projectClear(userId, projectId, folderId = -20, callback = () => {}) {
    if (!userId) return callback('projectClear(), invalid userId passed.');
    if (!projectId) return callback('projectClear(), invalid projectId passed.');

    const options = {
      url: this.url + this.endpoints.projectClear,
      method: 'POST',
      json: true,
      headers: {
        userId,
        appKey: this.appKey,
        token: 'token',
      },
      form: {
        ids: [{ projectId, serviceId: projectId }],
        folderId,
      },
    };

    this.send(options, (err, result) => {
      if (err) {
        err = this.errorFactory.apiError(err, null, 'projectClear');

        callback(err);
      } else if (result.result) {
        callback(null, result.data);
      } else {
        callback(result);
      }
    });

    return options;
  }

  getDocumentContent(viewerId = false, projectId = false, version = false, allowExtraData = [], callback = () => { }) { // eslint-disable-line
    if (!viewerId) return callback('getDocumentContent(), invalid viewerId passed.');
    if (!projectId) return callback('getDocumentContent(), invalid projectId passed.');
    const options = {
      url: this.url + this.endpoints.getDocumentContent,
      method: 'GET',
      json: true,
      omitStatusCode: true,
      headers: {
        userId: viewerId,
        appKey: this.appKey,
      },
      qs: Object.assign({
        version,
        project_id: projectId,
        allowExtraData,
      }, this.commonQueryParams),
    };
    const context = { viewerId, projectId };
    const wrappedCallback = this.logRequest('getDocumentContent', context, true, callback);

    this.sendRequest(options, (err, body, res) => {
      if (err) return wrappedCallback(err, null);

      const { statusCode } = res;
      const {
        DOCUMENT_CONTENT_STATUS,
        DOCUMENT_CONTENT_STATUS_CODE,
      } = documentContentConstants;

      if (statusCode === DOCUMENT_CONTENT_STATUS_CODE.PENDING) {
        body.status = DOCUMENT_CONTENT_STATUS.PENDING;
      } else if (statusCode === DOCUMENT_CONTENT_STATUS_CODE.FINISHED) {
        body.status = DOCUMENT_CONTENT_STATUS.FINISHED;
      } else {
        body.status = DOCUMENT_CONTENT_STATUS.ERROR;
      }

      return wrappedCallback(null, body);
    });

    return options;
  }
};
