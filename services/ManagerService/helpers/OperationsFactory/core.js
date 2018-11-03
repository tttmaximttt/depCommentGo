/* eslint-disable no-param-reassign,,no-plusplus */
const operationsDefaults = require('./defaults/operations');
const _ = require('lodash');
const operationValidator = require('operation_validator');
const fp = require('lodash/fp');

class OperationsFactory {
  constructor({ operationsConstants, config, coreUtils }) {
    this.operationsConstants = operationsConstants;
    this.config = config;
    this.coreUtils = coreUtils;
    this.operationValidator = operationValidator;

    this.defaults = {
      operations: operationsDefaults,
    };
  }

  create(group, type, subType, data = {}) {
    subType = subType === false ? null : { subType };
    return {
      properties: Object.assign({ group, type }, subType, data),
      actionTime: Date.now(),
    };
  }
  // Docs
  // https://pdffiller.atlassian.net/wiki/display/PD/Rules+for+fillable+Date
  template(type, template, pageId) {
    const { GROUP, SUB_TYPE } = this.operationsConstants;
    let subType;

    if (template.subtype && template.subtype.indexOf('current+') >= 0) {
      template.format = template.subtype.split('+')[1];
      subType = 'date';

      template.text = '';
      // template.initial = '';
      delete template.type;
    } else {
      subType = template.subtype || 'none';
    }
    delete template.subtype;

    if (template.formulaFormat && subType === SUB_TYPE.FORMULA) {
      template.format = template.formulaFormat;
      delete template.formulaFormat;
    }

    if (template.numberFormat && subType === SUB_TYPE.NUMBER) {
      template.format = template.numberFormat;
      delete template.numberFormat;
    }

    return this.create(GROUP.TOOLS, type, subType, { template, pageId });
  }

  content(type, content, pageId, group = this.operationsConstants.GROUP.TOOLS) {
    let { subType } = content;

    delete content.subType;
    delete content.type;

    if (subType === undefined) subType = 'none';

    const data = { content };

    if (_.isNumber(pageId)) {
      data.pageId = pageId;
    }

    return this.create(group, type, subType, data);
  }

  pages(pages, additionalProperties = {}) {
    const { GROUP, TYPE } = this.operationsConstants;

    return Object.assign(
      this.create(GROUP.TOOLS, TYPE.PAGES, false, { pages, ...additionalProperties })
    );
  }

  /**
   * @param {Number} data.clientId
   * @param {String} data.launch
   * @param {Number} data.projectId
   * @param {String} data.host
   * @param {Boolean} data.reconnect
   * @param {Number} data.confirmedOps
   * @param {Object} data.endpoints
   */
  authResponse({ clientId, launch, projectId, host, reconnect, confirmedOps, endpoints }) {
    const { config } = this;
    let mobileSignatureLinkUrl = config.mobileSignatureLinkUrl;

    // todo need to check cross editor ON
    if (!host) {
      host = config.databaseRemote.options.url;
    } else {
      mobileSignatureLinkUrl = host + mobileSignatureLinkUrl.split('/').slice(3).join('/');
    }

    return {
      settings: {
        ping: {
          sendInterval: config.WebSocketConnectionService.connection.delay_for_ping,
          reconnectTimeout: config.WebSocketConnectionService.connection.delay_for_auto_close,
        },
        endPoints: {
          mobileSignatureLinkUrl: _.get(endpoints, 'signatureUrl', mobileSignatureLinkUrl),
          imageSignatureUrl: _.get(endpoints, 'uploadUrl', `${host}api_v3/upload/tempBinary/`),
          localeUrl: `${config.constantsUrl}/consts.json` +
           '?type=IMAGE_MANAGER_LOCALE,SIGNATURE_MANAGER_LOCALE,EDITOR_REPORT_PROBLEM',
          feedbackConstsUrl: `${config.constantsUrl}/consts.json?type=FEEDBACK_LOCALE`,
          apiUrl: _.get(endpoints, 'apiUrl', `${host}api_v3`),
          helpStructureUrl: `${config.staticUrl}/HelpStructure.js`,
          appKey: config.appKey,
        },
        tempStorageUrl: _.get(endpoints, 'apiHost', host),
        staticUrl: config.staticUrl,
      },
      clientId,
      launch,
      confirmedOps,
      project: projectId,
      initial: !(reconnect && confirmedOps),
    };
  }

  authRequest(authProps, useRedisOperations = true) {
    const { operationsConstants } = this;

    Object.assign(authProps, {
      access: operationsConstants.ACCESS.REQUEST,
      useRedisOperations,
    });

    return { auth: { properties: authProps } };
  }

  destroy(data = {}) {
    const { force, params, uid } = data;

    return {
      uid,
      destroy: true,
      force,
      params,
    };
  }

  error(err) {
    function exit(msg) {
      return { error: msg || true };
    }

    if (err instanceof Error) return exit(this.coreUtils.stringifyError(err));
    // return exit((typeof (err) === 'object') ? JSON.stringify(err) : err);
    return exit(err);
  }


  putDefaultFields(operation) {
    const schema = this.defaults.operations[operation.type];

    if (schema) {
      Object.keys(schema).forEach((key) => {
        if (!(key in operation)) operation[key] = schema[key];
      });
    }
    return operation;
  }

  getOperationChannel(operation) {
    const { CHANNEL, CHANNEL_GROUP, TYPE } = this.operationsConstants;

    if (operation.properties.type === TYPE.SOURCE) {
      return CHANNEL.PROJECT;
    }
    if (operation.properties.type === TYPE.ACCESS) {
      return CHANNEL.CLIENT;
    }
    if (operation.properties.type === TYPE.RESOLUTION) {
      return CHANNEL.PROJECT;
    }
    return CHANNEL_GROUP[operation.properties.group];
  }

  validatePagesOperation({ properties }) {
    const { pages } = properties;
    const sourcesMap = pages.reduce((map, page) =>
      _.set(map, page.source, map[page.source] > 0 ? map[page.source] + 1 : 1)
    );
    const hasDuplicatedSources = Object.keys(sourcesMap).some(key => sourcesMap[key] > 1);

    return hasDuplicatedSources;
  }

  accessBusy(data = {}) {
    const { operationsConstants, config } = this;
    const { GROUP, TYPE, ACCESS } = operationsConstants;
    const { timeout, location, message, busyUser } = Object.assign({
      timeout: config.Busy.timeout,
      location: config.Busy.location,
      message: config.Busy.message,
    }, data);

    const structure = this.create(
      GROUP.DOCUMENT,
      TYPE.ACCESS,
      ACCESS.BUSY,
      { timeout, location, message, busyUser }
    );

    structure.id = { clientId: 1, localId: 1 };

    return structure;
  }

  /**
   *
   * @param data
   * @returns {GROUP.DOCUMENT}
   */
  accessDenied(data = {}) {
    const { GROUP, TYPE, ACCESS } = this.operationsConstants;
    const structure = this.create(
      GROUP.DOCUMENT,
      TYPE.ACCESS,
      ACCESS.DENIED,
      { location: data.location }
    );

    structure.id = { clientId: 1, localId: 1 };

    return structure;
  }

  /**
   *
   * @param data
   */
  accessCanReload(data = {}) {
    const { GROUP, TYPE, ACCESS } = this.operationsConstants;
    const structure = this.create(
      GROUP.DOCUMENT,
      TYPE.ACCESS,
      ACCESS.CAN_RELOAD,
      { location: data.location || '' }
    );

    structure.id = { clientId: 1, localId: 1 };

    return structure;
  }

  /**
   *
   * @param data
   */
  accessCanView(data = {}) {
    const { GROUP, TYPE, ACCESS } = this.operationsConstants;
    const structure = this.create(
      GROUP.DOCUMENT,
      TYPE.ACCESS,
      ACCESS.CAN_VIEW,
      { location: data.location || '' }
    );

    structure.id = { clientId: 1, localId: 1 };

    return structure;
  }

  /**
   * @param {object} source
   * @param {string} url
   * @returns {object} sourceOperation
   */
  createSourceOperation(url) {
    const operation = this.create('document', 'source', false);
    const { operationsConstants } = this;

    return fp.set('properties.pdf', {
      url,
      status: operationsConstants.PDF_STATUS.FINISHED,
    })(operation);
  }

  /**
   * @param {Object} data
   * @param {String} data.font
   * @param {String} data.probability
   * @returns {Object} operation
   */
  createFontRecognitionOperation({ font, probability }) {
    const { GROUP, TYPE } = this.operationsConstants;

    return this.create(
      GROUP.FONT,
      TYPE.RECOGNIZE,
      false,
      { font, probability }
    );
  }

  version(type) {
    const { VERSION, GROUP } = this.operationsConstants;

    switch (type) {
      case VERSION.SAVE:
        return this.create(
          GROUP.VERSIONS,
          VERSION.SAVE
        );
      default:
        break;
    }
  }


  /**
   * @param {String} mode
   * @param {boolean} allowed - can be undefined
   * @param {object} error - can be undefined
   * @returns {object} sourceOperation
   */
  editorMode(mode, allowed, error) {
    const { GROUP, TYPE } = this.operationsConstants;

    return this.create(
      GROUP.EDITOR,
      TYPE.MODE,
      mode,
      { allowed, error }
    );
  }

  /**
   * @param {Object} user - user info
   * @returns {Object} userOperation
   */
  getUsers(users) {
    const { GROUP, TYPE, SUB_TYPE } = this.operationsConstants;

    return this.create(GROUP.COLLABORATION, TYPE.USER, SUB_TYPE.LIST, { users });
  }

  getUserList(list) {
    const { GROUP, TYPE } = this.operationsConstants;

    return this.create(GROUP.USERS, TYPE.LIST, false, { list });
  }

  /**
   *
   * @param content
   * @returns {DOCUMENT}
   */
  getMappingOp(content = {}) {
    const { TYPE: { LIST }, GROUP: { MAPPING } } = this.operationsConstants;

    return this.create(
      MAPPING,
      LIST,
      false,
      { ...content });
  }

  /**
   * @param {Object} comment
   * @param {Number} pageId
   * @returns {Object} commentOperation
   */
  getComment(comment, pageId) {
    const { GROUP, TYPE } = this.operationsConstants;
    const content = _.omit({
      ...comment,
      ...comment.general,
    }, 'general');

    return this.create(GROUP.TOOLS, TYPE.COMMENT, false, { pageId, content });
  }

  nativePreviewOperation(operation, url) {
    const { SUB_TYPE, WORKER_STATUS } = this.operationsConstants;

    operation.properties.previewUrl = url;
    operation.properties.status = WORKER_STATUS.SUCCESS;
    operation.properties.subType = SUB_TYPE.PREVIEW;
    return operation;
  }

  /**
   * @param {Object} versions - versions list
   */
  versionsList(versions) {
    const { GROUP, TYPE } = this.operationsConstants;

    return this.create(GROUP.VERSIONS, TYPE.LIST, false, { list: versions });
  }
}

module.exports = OperationsFactory;
