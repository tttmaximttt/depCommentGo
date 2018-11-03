const _ = require('lodash');
const fp = require('lodash/fp');
const Promise = require('bluebird');
const EnabledProperty = require('../../helpers/OperationsConverter/EnabledProperty.js');
const AirSlateController = require('./AirSlateController');
const JsFillerController = require('./JsFillerController');

const API_TAGS = {
  EDITOR_AUTH: 'editorAuth',
  GET_DOCUMENT_CONTENT: 'getDocumentContent',
  SET_DOCUMENT_CONTENT: 'setDocumentContent',
  EDITOR_REFRESH: 'editorRefresh',
  DESTROY: 'editorDestroy',
};

class ContentService {

  constructor({
    memory, operationsConstants, dbRemote, config, timing, metrics, coreUtils,
    operationsConverter, operationsHelper, operationsFactory, operationsModel,
    collaborationService, logSystem, constantsEvents, generalConstants, activityHistoryConstants,
    imageModel, converterApi, documentContentConstants, errorFactory, intervalsHub,
    mappingConstants,
  }) {
    this.memory = memory;
    this.imageModel = Promise.promisifyAll(imageModel);
    this.operationsConstants = operationsConstants;
    this.dbRemote = dbRemote;
    this.config = config;
    this.intervalsHub = intervalsHub;
    this.timing = timing;
    this.metrics = metrics;
    this.coreUtils = coreUtils;
    this.operationsConverter = operationsConverter;
    this.operationsHelper = Promise.promisifyAll(operationsHelper);
    this.operationsFactory = operationsFactory;
    this.operationsModel = Promise.promisifyAll(operationsModel);
    this.collaborationService = Promise.promisifyAll(collaborationService);
    this.logSystem = logSystem;
    this.constantsEvents = constantsEvents;
    this.generalConstants = generalConstants;
    this.enabledProperty = new EnabledProperty();
    this.channel = activityHistoryConstants.channel;
    this.activityHistoryConstants = activityHistoryConstants;
    this.airSlateController = new AirSlateController();
    this.jsFillerController = new JsFillerController();
    this.converterApi = converterApi;
    this.documentContentConstants = documentContentConstants;
    this.errorFactory = errorFactory;
    this.mappingConstants = mappingConstants;
  }

  /**
   * @param  {String} projectId
   * @param  {String} viewerId
   */
  async makeDocumentContent({ projectId, viewerId }) {
    try {
      const { memory, operationsConverter, dbRemote, luaModel } = this;
      const clients = await this.memory.projectData.getByItemId(
        projectId,
        this.memory.projectData.projectClients
      ) || [];
      const exitFunc = (content) => {
        if (_.isString(content)) return { content };
        if (Array.isArray(content)) {
          return { operations: operationsConverter.getElementOperations(content) };
        }
        return { error: 'Project not found' };
      };
      let content = null;

      if (!clients.length) return exitFunc({});
      let lastClientId = await luaModel.getLastProjectEditorAsync(projectId);

      if (!lastClientId) return exitFunc({});
      lastClientId = String(lastClientId);
      const lastClientUid = fp.flow( // TODO point to refactoring
        fp.filter(
          fp.flow(
            fp.split('_'),
            fp.head,
            fp.isEqual(lastClientId)
          )
        ),
        fp.last
      )(clients);

      const ops = await memory.projectOperations.get(projectId);
      const operations = ops || [];

      if (lastClientUid && operations.length) {
        if (viewerId) {
          return _.reverse(operationsConverter.flattenOperations(operations));
        }

        const { document } = operationsConverter.toDocument(operations);
        const { contentJSON } = document;
        /* TODO: we don't need uid and viewerId. make this parameters
        not required for xmljson-transducer */
        const convertedData = await this.converterApi.jsonToXml(
          { content: contentJSON },
          lastClientId,
          lastClientUid,
        );

        content = convertedData.content;
      }
      if (viewerId) {
        const document = await dbRemote.getDocumentContentAsync(
          viewerId, projectId, false, false
        );

        await memory.configXml.set(projectId, document.config);
        const clientData = {
          uid: projectId,
          owner: {
            id: viewerId,
          },
        };

        const convertedContent = await this.getConvertedContent(document, clientData);
        const result = this.jsFillerController.getContentJSON(convertedContent);
        const { contentJSON, attributesJSON, pagesJSON } = result;
        const templateJSON = JSON.parse(document.template);
        const operationsFromContentAndTemplate = operationsConverter
          .fromContentAndTemplate(contentJSON.content, templateJSON, viewerId);
        const { configOperations } = operationsConverter
          .fromConfig({ attributes: attributesJSON.attributes, pages: pagesJSON.pages });

        content = [].concat(operationsFromContentAndTemplate, configOperations);
      }

      return exitFunc(content);
    } catch (err) {
      throw err;
    }
  }

  async _getMappingOperation(authRequest, editorAuthData) {
    try {
      const { dbRemote, operationsFactory, mappingConstants: { MODE } } = this;
      const { type: device, os } = authRequest.device || {};
      const { sessionHash, projectId, viewerId, clientType } = authRequest;
      const mapping = _.get(editorAuthData, 'auth.project.mapping', null);

      if (!mapping || !mapping.type || mapping.mode === MODE.ELEMENTARY) {
        return null;
      }

      const { type: integration, demo, mode } = mapping;
      const document = await dbRemote.getMappingDocumentAsync({
        device, os, sessionHash, projectId, viewerId, clientType, integration, demo, mode,
      });

      const fromRead = (list) => {
        if (list.checkbox) {
          list.checkmark = list.checkbox;
          delete list.checkbox;
        }
        return list;
      };

      return operationsFactory.getMappingOp(fromRead(document));
    } catch (err) {
      throw err;
    }
  }

  async _saveDocumentResolutionOp(projectId, { content }) {
    try {
      const { metadata } = content;
      const resolutionOp = this.operationsFactory.getResolutionOp(metadata);
      const result = await this.memory.projectOperations.push(projectId, resolutionOp);

      if (!result) {
        throw new Error('Can\'t save document resolution operation.');
      }

      return resolutionOp;
    } catch (err) {
      throw err;
    }
  }

  async updatePageOp(projectId, operations) {
    try {
      const { TYPE } = this.operationsConstants;
      const existingPages = await this.memory.projectData.getByItemId(projectId, this.memory.projectData.lastPageOp);

      await Promise.each(operations, async (operation) => {
        if (operation.properties.type === TYPE.PAGES) {
          if (existingPages) operation = existingPages;

          await this.memory.projectData.set(projectId, this.memory.projectData.lastPageOp, operation);
          throw new Error(this.generalConstants.NOOP);
        }
      });

      return null;
    } catch (err) {
      if (err.message === this.generalConstants.NOOP) {
        return null;
      }

      throw err;
    }
  }

  _getGroupIndex(operation) {
    const { type, template } = _.get(operation, 'properties', {});
    const { TYPE } = this.operationsConstants;

    if (TYPE.ERASE === type) return 0;
    if (template) return 1;
    return 2; // free tool
  }

  async buildContentJSON({ operations, uid, initial = false }) {
    try {
      const { CONTENT_UPDATE_SUCCESSFUL } = this.constantsEvents;
      const { TYPE } = this.operationsConstants;
      const { projectId } = this.memory.uid.getIds(uid);
      const timeStart = Date.now();

      await Promise.each(operations, async (operation) => {
        const baseOperation = await this.memory.contentJSON.getByElement(uid, operation);
        const isOperationWithContent = !_.chain(operation).get('properties.content', {})
          .isEmpty()
          .value();
        const isOperationWithTemplate = !_.chain(operation).get('properties.template', {})
          .isEmpty()
          .value();
        const isDefaultOp = _.get(operation, 'properties.type', false) === TYPE.DEFAULTS;


        if (isOperationWithTemplate && !initial) {
          this.memory.projectData.set(projectId, this.memory.projectData.isTemplateChanged, 'true');
        }

        if (isOperationWithContent || isOperationWithTemplate) {
          const elementId = _.get(operation, 'properties.element');
          let operationToValidate;

          if (isDefaultOp) return;

          if (baseOperation && baseOperation.properties) {
            operationToValidate = await this.memory.contentJSON.update(uid, operation, baseOperation);
          } else {
            operationToValidate = await this.memory.contentJSON.add(uid, operation);
          }

          const groupIndex = this._getGroupIndex(operationToValidate);

          elementId && await this.memory.toolsOrder.push(
            uid,
            JSON.stringify({ element: elementId, group: groupIndex }));

          if (operationToValidate) this.operationsHelper.validate(uid, operationToValidate, 3);
        }
      });
      const timeEnd = Date.now();

      this.logSystem.debug(CONTENT_UPDATE_SUCCESSFUL, { uid, time: (timeEnd - timeStart) / 1000 });
      return operations;
    } catch (err) {
      const { VALIDATION_ERROR, CONTENT_UPDATE_FAIL } = this.constantsEvents;
      const error = this.errorFactory.customError(
        { err },
        { uid, channel: this.channel.SERVER },
        'OperationsHelper.validateDocument',
        CONTENT_UPDATE_FAIL,
      );

      this.logSystem.error(error.group, { ...error });

      if (err.name === VALIDATION_ERROR) {
        await this.memory.contentJSON.delete(uid, err.operation);
        delete err.operation;
      }

      throw err;
    }
  }

  _prepareDocumentDataToHash({ contentJSON = [], pages = {}, toolsOrder = [] }) {
    delete pages.actionTime;
    delete pages.channel;

    contentJSON.forEach((item) => {
      delete item.actionTime;
      delete item.confirmed;
      delete item.channel;
    });

    // filter unique toolsOrder by clientId and localId
    toolsOrder = _.uniqBy(toolsOrder, tool => [tool.element.clientId, tool.element.localId].join());

    const contentJSONToHash = _.orderBy(contentJSON, contentOp => _.get(contentOp, 'properties.element.localId'));

    return {
      contentJSON: contentJSONToHash,
      pages,
      toolsOrder,
    };
  }

  _hashDocumentData({ contentJSON, pages, toolsOrder }) {
    const { coreUtils } = this;
    const contentHash = coreUtils.getHash(contentJSON);
    const pagesHash = coreUtils.getHash(pages);
    const toolsOrderHash = coreUtils.getHash(toolsOrder);

    return { contentHash, pagesHash, toolsOrderHash };
  }

  /**
   * @param {Object} options
   * @param {String} options.uid
   * @param {Array} options.contentJSON
   * @param {Object} options.pages
   * @param {Array} options.toolsOrder
   */
  async makeDocumentContentHash(options) {
    try {
      const { uid, update = true } = options;
      const { operationsConstants: { TYPE }, memory, operationsHelper } = this;
      const { userId, projectId } = memory.uid.getIds(uid);

      const [
        contentJSON,
        toolsOrder,
        access,
      ] = await Promise.all([
        memory.contentJSON.get(uid),
        memory.toolsOrder.get(uid),
        memory.access.get(uid),
      ]);
      const operations = await this._getOperationsByAcl(uid, access);

      options.contentJSON = Object.values(contentJSON);
      options.toolsOrder = toolsOrder;
      options.pages = operationsHelper.getOperationsByType(operations, TYPE.PAGES)[0];

      const documentDataToHash = this._prepareDocumentDataToHash(options);
      const documentHashData = this._hashDocumentData(documentDataToHash);

      if (update) {
        await memory.documentHash.set(userId, projectId, documentHashData);
      }

      return documentHashData;
    } catch (err) {
      throw err;
    }
  }

  async getIsDocumentChanged({ uid }) {
    const { memory } = this;
    const { userId, projectId } = memory.uid.getIds(uid);
    const prevDocumentHash = await memory.documentHash.get(userId, projectId);

    const actualDocumentHash =
      await this.makeDocumentContentHash({ update: false, uid });

    return {
      contentJSON: prevDocumentHash.contentHash !== actualDocumentHash.contentHash,
      pages: prevDocumentHash.pagesHash !== actualDocumentHash.pagesHash,
      toolsOrder: prevDocumentHash.toolsOrderHash !== actualDocumentHash.toolsOrderHash,
      isDocumentChanged: !_.isEqual(prevDocumentHash, actualDocumentHash),
    };
  }

 /**
   * @param {Object} data [uid, clientType, launch, reconnect, authRequest, clientId]
   * @returns {Object} { operations, auth }
   */
  async getDocumentOperations(data) {
    try {
      const { memory, operationsConstants, operationsHelper } = this;
      const { EDITOR_MODE, TYPE } = operationsConstants;
      const { uid, clientType, launch, reconnect, authRequest, authResponse } = data;
      const { projectId, userId } = memory.uid.getIds(uid);

      let projectData = await memory.projectData.get(projectId);

      projectData = _.assign({}, data, _.pick(projectData, ['rearrangeProcessId']));
      const { rearrangeProcessId, isFirstClient } = projectData;
      let { editorAuthData } = projectData;
      const pdfObject = _.get(editorAuthData, 'document.source.pdf', {});
      const accessLevel = _.get(editorAuthData, 'document.access.subType');

      if (pdfObject.status === operationsConstants.PDF_STATUS.ERROR) {
        const err = {
          message: 'Document conversion error',
          status: pdfObject.status,
          location: pdfObject.errorLocation,
          errorCode: pdfObject.errorCode || 0,
          code: this.constantsEvents.CONVERSION_ERROR,
        };

        throw err;
      }
      const payload = await this.updatePdfSources({
        uid, editorAuthData, userId, projectId, clientType, launch, rearrangeProcessId,
      });
      const useRedisOperations = !isFirstClient || reconnect;

      // modify source operation that already have in auth package
      // set status of pdf to finished
      const sourceOperation =
        operationsHelper.getOperationsByType(authResponse.operations, TYPE.SOURCE)[0];

      if (_.get(sourceOperation, 'properties.pdf.status')) {
        sourceOperation.properties.pdf.status =
          operationsConstants.PDF_STATUS.FINISHED;
      }

      if (_.get(payload, 'pdfUrl', false)) {
        editorAuthData = _.set(editorAuthData, 'document.source.pdf.url', payload.pdfUrl);
      }
      let operations = [];

      await this.memory.editorMode.set(
        userId,
        projectId,
        { setBy: uid, mode: EDITOR_MODE.MAIN, time: Date.now() }
      );

      if (useRedisOperations) {
        const [redisOps, defaults] = await Promise.all([
          this.getLastRedisOperations(
            uid,
            authRequest,
            editorAuthData,
            reconnect ? authRequest.confirmedOps : 0),
          this.memory.userOperations.getByType(uid, 'defaults'),
        ]);
        const defaultOpIndex = redisOps.findIndex(item => item.properties.type === TYPE.DEFAULTS);

        if (defaults && defaultOpIndex >= 0) {
          redisOps[defaultOpIndex] = defaults;
        }
        operations = redisOps;

        this.logSystem.debug(
          this.constantsEvents.CREATE_OPS_FROM_REDIS,
          { accessLevel, uid, userId, projectId, clientType });
      } else {
        operations = await this.createOperationsFromDbRemote({
          uid,
          authRequest,
          editorAuthData,
          scenariosOps: _.get(data, 'operations.scenariosOps', []),
        });

        this.logSystem.debug(
          this.constantsEvents.CREATE_OPS_FROM_REMOTE,
          { accessLevel, uid, userId, projectId, clientType });
      }

      return { operations };
    } catch (err) {
      throw err;
    }
  }

 /**
   * @param {Object} data
   * @returns {Function} promise
   */
  updatePdfSources(data) {
    return data.rearrangeProcessId ?
      this.getPdfSourcesFromRearrange(data) : this.waitForPdfSources(data);
  }

 /**
   * @param {String} userId
   * @param {String} projectId
   * @param {String} rearrangeProcessId
   * @returns {Object} pdfUrl
   */
  async getPdfSourcesFromRearrange({ userId, projectId, rearrangeProcessId }) {
    try {
      const { dbRemote } = this;
      const pdfUrl = await dbRemote.loadTempPdfAsync(
        { viewerId: userId, projectId, processId: rearrangeProcessId, mode: null, read: true }
      );

      return { pdfUrl };
    } catch (err) {
      throw err;
    }
  }

 /**
   * @param {String} uid
   * @param {Object} authRequest
   * @param {Object} editorAuthData
   * @param {Number} confirmedOps
   * @returns {Array} operations
   */
  async getLastRedisOperations(uid, authRequest, editorAuthData, confirmedOps) {
    try {
      const {
        memory, operationsConverter, operationsHelper,
        operationsFactory, operationsModel,
      } = this;
      const { EDITOR_MODE } = this.operationsConstants;
      const { project } = editorAuthData.auth;
      const access = _.get(editorAuthData, 'document.access.subType', null);
      const { api_hash, urlParams, device, sessionHash } = authRequest;
      const { projectId, userId } = memory.uid.getIds(uid);


      const promises = [
        this.collaborationService.getHoldOperationsAsync(uid), // 1 holdOperations
        memory.editorMode.get(userId, projectId), // 2 editorMode
      ];

      if (confirmedOps) {
        promises.push(operationsModel.getMissingAsync(uid, confirmedOps - 1)); // 3 projectOps
      } else {
        promises.push(memory.projectOperations.get(projectId)); // 3 projectOps
      }
      promises.push(
        memory.editorData.apply(uid, {
          urlParams,
          project,
          access,
          api_hash,
          device,
          sessionHash,
        })
      );
      const data = await Promise.all(promises);
      const [holdOperations, editorMode, projectOps] = data;

      if (projectOps.length) {
        this.enabledProperty.apply(projectOps, editorAuthData.document);
      }

      const projectOperations = projectOps.map((operation, index) => {
        operation.index = index + 1;
        return operation;
      });

      const initialsOperations = !confirmedOps ? _.concat(
        operationsConverter.fromAuthData(editorAuthData, uid),
        operationsFactory.editorMode(_.get(editorMode, 'mode', EDITOR_MODE.MAIN), true)
      ) : [];

      const operations = operationsHelper.filterUniqueOperations(_.concat(
        initialsOperations,
        holdOperations,
        projectOperations
      ));

      await Promise.all([
        await this.buildContentJSON({ uid, operations }),
        await this.updatePageOp(projectId, projectOperations),
      ]);

      return operations;
    } catch (err) {
      throw err;
    }
  }

  /**
   *
   * @param {*} checkFunc
   * @param {*} dbRemoteFunc
   * @param {*} thenFunc
   * @param {*} options
   */
  async _waitForDbRemoteFunction(checkFunc, dbRemoteFunc, thenFunc, options) {
    try {
      const { uid, timeoutTime, checkInterval, API_TAG } = options;
      const { timing, metrics } = this;
      const refreshTimingKey = timing.unique(API_TAG, uid);
      const entryTime = Date.now();
      const functionName = API_TAG;

      await this.coreUtils.promiseWhile(checkFunc,
        () => new Promise((resolve, reject) => {
          if ((Date.now() - entryTime) > timeoutTime) {
            return reject(new Error(`max time of ${timeoutTime} was exceeded for ${functionName}()`));
          }
          setTimeout(() => {
            timing.set(refreshTimingKey);
            return dbRemoteFunc()
              .then((result) => {
                metrics.apiRequestTime(API_TAG, timing.get(refreshTimingKey));
                thenFunc(result);
                resolve(result);
              })
              .catch((err) => {
                reject(err);
              });
          }, checkInterval);
        }));
    } catch (err) {
      throw err;
    }
  }

  _checkDocumentContentToSave(content, changes) {
    const { contentJSON, pages } = changes;

    if (!contentJSON) {
      delete content.content;
    }

    if (!pages) {
      delete content.pages;
    }
  }

  /**
   * @param {*} payload
   * @returns {Object} response
   */
  async _setDocumentContent(payload) {
    const response = {};
    const { dbRemote, config } = this;
    const { uid, host, userId, projectId, documentContent, isNewVersion, authors, documentChanged } = payload;
    const queryParams = { changes: documentChanged.isDocumentChanged };
    const { timeoutTime, checkInterval } = config.ManagerService.setDocumentContent;
    const API_TAG = API_TAGS.SET_DOCUMENT_CONTENT;
    const checkFunc = () =>
      response.result !== 'success';
    const dbRemoteFunc = () =>
      dbRemote.setHost(host)
        .setDocumentContentAsync(userId, projectId, isNewVersion, authors, documentContent, queryParams);
    const thenFunc = ({ result }) => {
      response.result = result;
    };

    // mutates the documentContent;
    this._checkDocumentContentToSave(documentContent, documentChanged);

    await this._waitForDbRemoteFunction(checkFunc, dbRemoteFunc, thenFunc, {
      uid,
      timeoutTime,
      checkInterval,
      API_TAG,
    }).catch((err) => {
      throw err;
    });

    return response;
  }

  /**
   * @param {*} payload
   * @returns {Object} editorAuthData
   */
  async waitForPdfSources(payload) {
    const { uid, editorAuthData, userId, projectId, clientType, launch } = payload;
    const { dbRemote, config, operationsConstants } = this;
    const { timeoutTime, checkInterval } = config.ManagerService.editorRefresh;
    const API_TAG = API_TAGS.EDITOR_REFRESH;
    const checkFunc = () =>
      editorAuthData.document.source.pdf.status !== operationsConstants.PDF_STATUS.FINISHED;
    const dbRemoteFunc = () =>
      dbRemote.editorRefreshAsync({ userId, projectId, clientType, launch });
    const thenFunc = ({ source }) => {
      editorAuthData.document.source = source;
    };

    await this._waitForDbRemoteFunction(checkFunc, dbRemoteFunc, thenFunc, {
      uid,
      timeoutTime,
      checkInterval,
      API_TAG,
    });

    return editorAuthData;
  }

 /**
   * @param {String} uid
   * @param {Object} authRequest
   * @param {Object} editorAuthData
   * @returns {Array} operations
   */
  async createOperationsFromDbRemote({ uid, authRequest, editorAuthData, scenariosOps }) {
    try {
      const { timing, memory, metrics, collaborationService } = this;
      const { projectId, userId } = memory.uid.getIds(uid);
      const { GET_DOCUMENT_CONTENT } = API_TAGS;
      const { api_hash, urlParams, allowExtraData, clientType, device, sessionHash } = authRequest;
      const timingKey = timing.unique(GET_DOCUMENT_CONTENT, uid);
      let documentOwner = userId;

      const documentContent = await this._getDocumentContent({
        uid,
        userId,
        projectId,
        allowExtraData,
      });

      const [resolutionOp, mappingOp] = await Promise.all([
        this._saveDocumentResolutionOp(projectId, documentContent),
        this._getMappingOperation(authRequest, editorAuthData),
      ]);

      metrics.apiRequestTime(GET_DOCUMENT_CONTENT, timing.get(timingKey));

      if (documentContent.config) {
        await memory.configXml.set(projectId, documentContent.config);
      }

      const { owner } = editorAuthData.auth.project;

      documentOwner = _.get(owner, 'id', documentOwner);

      const timingDocToJsonKey = timing.unique('document content to json', uid);

      timing.set(timingDocToJsonKey);
      const convertedContent = await this.getAppContent(uid, owner, documentContent);
      const { contentJSON, attributesJSON, pagesJSON, template, comments } = convertedContent;

      metrics.generalTiming('document_content_to_json', timing.get(timingDocToJsonKey));
      const holdOperations = await collaborationService.getHoldOperationsAsync(uid);
      const access = _.get(editorAuthData, 'document.access.subType', null);

      await memory.editorData.apply(
        uid,
        {
          urlParams,
          access,
          project: editorAuthData.auth.project,
          clientType,
          api_hash,
          device,
          sessionHash,
        }
      );

      /** create Initial operations */
      const timingCreateOperationsKey = timing.unique('creating operations', uid);

      timing.set(timingCreateOperationsKey);

      const templateOrderValueWatcher = this.operationsHelper.maxTemplateOrderWatcher();
      const operations = await this._collectAllOperations({
        editorAuthData,
        uid,
        contentJSON,
        template,
        documentOwner,
        comments,
        holdOperations,
        attributesJSON,
        pagesJSON,
        scenariosOps,
        operationsWatcher: templateOrderValueWatcher,
      });

      const maxTemplateOrder = templateOrderValueWatcher();

      await this.memory.projectData.set(projectId, this.memory.projectData.templateOrder, maxTemplateOrder);

      operations.push(resolutionOp);
      if (mappingOp) {
        if (!mappingOp.properties) {
          throw new Error('Can\'t process mapping  ops, properties undefined');
        }
        await this.memory.projectData.set(projectId, this.memory.projectData.mappingOps, mappingOp.properties);
        operations.push(mappingOp);
      }

      const time = timing.get(timingCreateOperationsKey);

      metrics.generalTiming('create_operations', time);

      return operations;
    } catch (err) {
      throw err;
    }
  }

 /**
   * @param {Object} data { uid, userId, projectId, version, allowExtraData }
   * @returns {Function} promise
   */
  async _getDocumentContent(data) {
    try {
      let response = {};
      const { memory, dbRemote, documentContentConstants, config } = this;
      const { uid, userId, projectId, version = false, allowExtraData = false } = data;
      const { timeoutTime, checkInterval } = config.ManagerService.getDocumentContent;
      const API_TAG = API_TAGS.GET_DOCUMENT_CONTENT;
      const crossEditorHost = await memory.crossEditor.getMiddleware(uid);
      const checkFunc = () =>
        response.status !== documentContentConstants.DOCUMENT_CONTENT_STATUS.FINISHED;
      const dbRemoteFunc = () =>
        dbRemote.setHost(crossEditorHost)
          .getDocumentContentAsync(userId, projectId, version, allowExtraData);
      const thenFunc = (dbRemoteResponse) => {
        response = dbRemoteResponse;
      };

      await this._waitForDbRemoteFunction(checkFunc, dbRemoteFunc, thenFunc, {
        uid,
        timeoutTime,
        checkInterval,
        API_TAG,
      });

      return response;
    } catch (err) {
      throw err;
    }
  }

  _collectAllOperations({ editorAuthData = {}, uid, contentJSON, template, documentOwner,
    comments = [], holdOperations = [], attributesJSON = {}, pagesJSON = [], scenariosOps,
    operationsWatcher,
  }) {
    try {
      const {
        operationsConverter, operationsConstants, operationsFactory, logSystem,
        config, errorFactory,
      } = this;
      const { FILLABLE_MODE, EDITOR_MODE } = operationsConstants;
      const { maxTemplateSize } = config.ManagerService;

      let templateJSON;

      if (template.length >= maxTemplateSize) {
        const err = new Error('Template is too big');
        const error = errorFactory.systemError(
          err,
          { uid, templateSize: template.length },
          'ContentService._collectAllOperations'
        );

        logSystem.error(error.group, { ...error });
        templateJSON = {};
      } else {
        templateJSON = JSON.parse(template);
      }
      const operationsFromContentAndTemplate = operationsConverter.fromContentAndTemplate(
        contentJSON.content,
        templateJSON,
        documentOwner,
        editorAuthData,
        comments, // TODO point to refactoring to many args
        operationsWatcher,
      );
      const { configOperations } = operationsConverter
        .fromConfig({ attributes: attributesJSON.attributes, pages: pagesJSON });
      let fillableMode = FILLABLE_MODE.NO_FIELDS;
      // content and template

      operationsFromContentAndTemplate
        .filter(op => op.properties.enabled && op.properties.template)
        .forEach((op) => {
          if (fillableMode !== FILLABLE_MODE.SIGNATURE_FIELDS) {
            fillableMode = (_.get(op, 'properties.template.type') === 'signature')
              ? FILLABLE_MODE.SIGNATURE_FIELDS : FILLABLE_MODE.FIELDS;
          }
        });

      // auth data
      scenariosOps
        .forEach((op) => {
          operationsConverter.setFillableFieldsMode(op.properties, fillableMode);
        });

      const operations = _.concat(
        scenariosOps,
        holdOperations,
        operationsFactory.editorMode(EDITOR_MODE.MAIN, true),
        operationsFromContentAndTemplate,
        configOperations
      );

      return operations;
    } catch (err) {
      throw err;
    }
  }

  /**
   * @param {String} uid
   * @returns {function} promise
   */
  async _getCrossEditorHost(uid) {
    try {
      const { logSystem, constantsEvents, memory } = this;
      const { XML_TO_JSON_CONVERSION_START } = constantsEvents;

      logSystem.info(XML_TO_JSON_CONVERSION_START, { uid });
      return await memory.crossEditor.getMiddleware(uid);
    } catch (err) {
      err.crossEditorError = true;
      throw err;
    }
  }

  async getConvertedContent({ content, config, attributes, pages, template }, { uid, owner }) {
    try {
      const { logSystem, constantsEvents, converterApi } = this;
      const { XML_TO_JSON_CONVERSION_START, XML_TO_JSON_CONVERSION_FINISH } = constantsEvents;

      logSystem.info(XML_TO_JSON_CONVERSION_START, { uid });
      const convertedData = await converterApi.xmlToJson(
        { content, config, attributes, pages, template }, owner.id, uid
      );

      const { errors } = convertedData;

      logSystem.info(XML_TO_JSON_CONVERSION_FINISH, { uid, errors });

      return convertedData;
    } catch (err) {
      const { logSystem, constantsEvents } = this;
      const { XML_TO_JSON_CONVERSION_FINISH } = constantsEvents;

      logSystem.info(XML_TO_JSON_CONVERSION_FINISH, { uid, err });
      throw err;
    }
  }

  /**
   *
   * @param uid
   * @param acl
   * @private
   */
  _getOperationsByAcl(uid, access) {
    const { operationsModel } = this;

    if (access && access !== 'view') return operationsModel.getAll(uid);
    return [];
  }

  /* eslint-disable */
  /**
   *
   * @param uid
   * @returns {Promise<{editorData: *, projectData: *, operations: *, initialConfigXml: *, host: *}>}
   */
  /* eslint-enable */
  async getGeneralDataForSave(uid) {
    const { memory } = this;
    const { projectId } = memory.uid.getIds(uid);
    const host = await memory.crossEditor.getMiddleware(uid);
    const access = await this.memory.access.get(uid);

    const [
      editorData,
      projectData,
      operations,
      initialConfigXml,
    ] = await Promise.all([
      memory.editorData.get(uid), // editorData
      memory.projectData.get(projectId), // projectData
      this._getOperationsByAcl(uid, access), // operations
      memory.configXml.get(projectId), // initialConfigXml
    ]);

    return {
      editorData,
      projectData,
      operations,
      initialConfigXml,
      host,
    };
  }

  operationsToDocument({ uid, operations, defaults, clearDataFlag = false, editorData }) {
    const {
      operationsConverter, metrics, timing, operationsHelper,
    } = this;

    const timingOpsKey = timing.unique('operations to document', uid);

    timing.set(timingOpsKey);
    const uniqueToolsOperations = operationsHelper.getOperationsCreatedOnly(operations);
    const mappingFillableFields = operationsHelper.getMappingFillableFieldsContent(operations);
    const documentData = operationsConverter.toDocument(operations, clearDataFlag, editorData);
    const opsToDocTime = timing.get(timingOpsKey);

    documentData.defaults = defaults;
    metrics.generalTiming('operations_to_document', opsToDocTime);

    return {
      uniqueToolsOperations,
      documentData,
      mappingFillableFields,
    };
  }

  /**
   * @param {String} uid
   * @param {Object} contentJSON
   * @param {Object} configJSON
   * @param {Object} attributesJSON
   * @param {Object} pagesJSON
   * @param {Object} editorData
   */
  async documentContentToXML(
    { uid, contentJSON, configJSON, attributesJSON, pagesJSON, editorData, crossEditorHost }
  ) {
    try {
      const { operationsConverter, imageModel } = this;
      const ownerId = _.get(editorData, 'project.owner.id');

      // TODO: move to xmljson-transducer
      let content = operationsConverter.modifyContent(contentJSON);

      const infoMapper = async (imagesList) => {
        try {
          const data = await imageModel.getCustomImagesInfoAsync(
            this.memory.uid.getUserId(uid), _.chain(imagesList).keyBy('id').keys().value(), uid, crossEditorHost
          );

          imageModel.setImageInfoCache(uid, data);
          return data;
        } catch (err) {
          throw err;
        }
      };
      const { imagesMap, validContent } = operationsConverter.getValidImagesContent(uid, content);

      content = validContent;
      await Promise.all(_.map(imagesMap, infoMapper));
      const convertedData = await this.converterApi.jsonToXml({
        content,
        config: configJSON,
        attributes: attributesJSON,
        pages: pagesJSON,
      }, ownerId, uid);

      if (!_.get(convertedData, 'content.length') && _.some(content, 'length')) {
        throw new Error('failed saving content');
      }

      if (convertedData.errors) {
        // TODO: add log for copnversion errors. Waiting for changes from Alex Nechaev
      }
      imageModel.removeImageInfoCache(uid);
      return {
        contentXML: convertedData.content,
        configXML: convertedData.config,
        attributesXML: convertedData.attributes,
        pagesXML: convertedData.pages,
      };
    } catch (err) {
      throw Object.assign(err, { uid, editorData });
    }
  }

  async getXMLDocumentContent({ uid, documentData, crossEditorHost, editorData }) {
    const {
      memory, metrics, timing, logSystem, operationsHelper, channel, errorFactory,
    } = this;
    const { document, defaults } = documentData;

    if (!editorData) {
      throw new Error(`Editor data is empty for user ${uid}`);
    }

    // eslint-disable-next-line no-param-reassign
    if (defaults) editorData.defaults = defaults;
    document.configJSON.content.fillableVersion = null;

    const { userId } = memory.uid.getIds(uid);
    const {
      contentJSON, configJSON, attributesJSON, pagesJSON,
    } = document;
    const {
      validContent, validationErrors,
    } = operationsHelper.validateContentForExport(contentJSON);
    const timingContentKey = timing.unique('document content to XML', uid);

    if (validationErrors.length) {
      const error = errorFactory.systemError(
        { validationErrors },
        { uid, channel: channel.SERVER },
        'ContentService.getXMLDocumentContent'
      );

      logSystem.error(error.group, { ...error });
    }

    timing.set(timingContentKey);

    const documentContentXML = await this.documentContentToXML(
      {
        uid,
        userId,
        configJSON,
        attributesJSON,
        pagesJSON,
        editorData,
        crossEditorHost,
        contentJSON: validContent,
      });
    const docToXmlTime = timing.get(timingContentKey);

    metrics.generalTiming('document_content_to_XML', docToXmlTime);

    return documentContentXML;
  }

  async getAppDocument({ uid, documentData, editorData, host, rearrangeProcessId }) {
    try {
      let documentRaw = null;

      switch (this.config.app) {
        case this.generalConstants.AIR_SLATE:
          return this.airSlateController.mapContent(documentData);
        case this.generalConstants.PDF_FILLER:
          documentRaw = await this.getXMLDocumentContent({
            uid, documentData, crossEditorHost: host, editorData,
          });
          return this.jsFillerController.mapContent(documentData, rearrangeProcessId, documentRaw);
        default:
          throw new Error(`Cant recognize app type ${this.config.app}`);
      }
    } catch (err) {
      throw err;
    }
  }

  async saveContent(uid, options = {}) {
    try {
      const { clearDataFlag = false } = options;
      const { projectId, userId } = this.memory.uid.getIds(uid);
      const { ACCESS } = this.operationsConstants;
      const { editorData, projectData, operations, host } = await this.getGeneralDataForSave(uid);
      const documentChanged = await this.getIsDocumentChanged({ uid });
      const { isDocumentChanged } = documentChanged;

      if (!editorData) {
        const err = new Error('Editor data is null or undefined');

        this.intervalsHub.stop(uid);
        this.logSystem.warning(this.constantsEvents.CONTENT_NOT_SAVE, {
          uid,
          error: this.coreUtils.stringifyError(err),
        });
        return {};
      }

      const [
        defaults = {},
        mappingFillableFields,
        shouldSaveTemplate,
      ] = await Promise.all([
        this.memory.userOperations.getByType(uid, this.operationsConstants.TYPE.DEFAULTS),
        this.memory.projectData.getByItemId(projectId, this.memory.projectData.mappingOps),
        this.memory.projectData.getByItemId(projectId, this.memory.projectData.isTemplateChanged),
      ]);
      const {
        documentData,
        uniqueToolsOperations,
      } = this.operationsToDocument({
        uid,
        operations,
        defaults: _.get(defaults, 'properties', undefined),
        clearDataFlag,
        editorData,
      });

      const rearrangeProcessId = _.get(projectData, 'rearrangeProcessId');
      const accessLevel = await this.memory.access.get(uid);
      const newProjectOpsCount = await this.memory.projectOperations.count(projectId);
      const documentContent = await this.getAppDocument({
        uid,
        documentData,
        editorData,
        host,
        rearrangeProcessId,
      });
      const isNotViewer = accessLevel !== ACCESS.VIEW;

      // if clearDataFlag, we don't need to save anything, but still should create new version
      if (clearDataFlag) {
        delete documentContent.content;
        delete documentContent.template;
      }

      if (accessLevel && isNotViewer) {
        /** update project with new content */
        if (!shouldSaveTemplate) {
          delete documentContent.template;
        }
        const response = await this._setDocumentContent({
          uid,
          userId,
          projectId,
          documentContent,
          isNewVersion: true,
          authors: null,
          host,
          documentChanged,
        });

        if (response.result !== 'success') {
          throw new Error(response.description);
        }

        if (this._getCanSaveMapping(mappingFillableFields || {}, editorData)) {
          await this.validateAndSaveMapping(mappingFillableFields, editorData);
        }

        await this.memory.projectData.delete(projectId, this.memory.projectData.rearrangeProcessId);
        await this.memory.projectData.set(
          projectId,
          this.memory.projectData.projectOpsCount,
          newProjectOpsCount);
      }

      this.logSystem.info(
        this.constantsEvents.UNIQUE_TOOLS_OPERATIONS,
        { uid, channel: this.channel.SERVER, uniqueToolsOperations }
      );

      this.logSystem.debug(this.constantsEvents.CONTENT_SAVE_SUCCESSFUL, { uid });

      return { documentData, editorData, rearrangeProcessId, host, isDocumentChanged };
    } catch (err) {
      throw err;
    }
  }

  _getCanSaveMapping(mappingFillableFields, editorData) {
    const { config, generalConstants: { PDF_FILLER }, mappingConstants: { MODE } } = this;
    const isPdffillerApp = config.app === PDF_FILLER;
    const mappingMode = _.get(editorData, 'project.mapping.mode');
    const isElementaryMode = mappingMode && mappingMode === MODE.ELEMENTARY;

    return Object.keys(mappingFillableFields).length && isPdffillerApp && !isElementaryMode;
  }

  async validateAndSaveMapping(mappingJSON, editorData) {
    try {
      const isValid = true; // TODO: implement validation method
      const { clientType, project, sessionHash } = editorData;

      if (!clientType || !project || !sessionHash) { return false; }

      const { id: projectId } = project;
      const { id: viewerId } = project.viewer || {};
      const { type: device, os } = editorData.device || {};
      const { type: integration, demo } = project.mapping || {};

      if (mappingJSON && mappingJSON.checkmark) {
        mappingJSON.checkbox = mappingJSON.checkmark;
        delete mappingJSON.checkmark;
      }

      if (!demo && integration) {
        await this.dbRemote.saveMappingDocumentAsync({
          device, os, sessionHash, projectId, viewerId, clientType, integration, mappingJSON,
        });
      }
      return isValid;
    } catch (err) {
      throw err;
    }
  }

  refreshKeys(uid) {
    try {
      const { memory } = this;
      const { projectId } = memory.uid.getIds(uid);

      return Promise.all([
        memory.operationsList.remove(uid),
        memory.projectOperations.remove(projectId),
      ]);
    } catch (err) {
      throw err;
    }
  }

  async getAppContent(uid, owner, documentContent = {}) {
    let content = null;
    const { comments = [] } = documentContent;

    switch (this.config.app) {
      case this.generalConstants.AIR_SLATE:
        content = this.airSlateController.getContentJSON(documentContent);
        break;
      default:
        content = Object.assign(this.jsFillerController.getContentJSON(
          await this.getConvertedContent(documentContent, { uid, owner })),
          { comments });
        break;
    }

    return content;
  }

  async getContentOperations({
    uid, version = false, callStackOperations = [], setFakeIds, clientId,
  }) {
    try {
      const { memory, dbRemote } = this;
      const { projectId, userId } = memory.uid.getIds(uid);
      const documentOwner = userId;
      let operations = await memory.versionsOperations.get(projectId, version);
      const editorSource = await dbRemote.editorRefreshAsync(
        { userId, projectId, clientType: 'js', launch: 'editor', version }
      );
      const documentSource = {
        properties: { group: 'document', type: 'source', ...editorSource.source },
        actionTime: Date.now(),
      };

      if (!operations) {
        const data = await Promise.all([
          memory.editorData.get(uid),
          this._getDocumentContent({
            uid,
            userId,
            projectId,
            version,
          }),
        ]);
        const [editorData, documentContent] = data;
        const { owner } = editorData.project;
        const convertedContent = await this.getAppContent(uid, owner, documentContent);
        const {
          contentJSON,
          attributesJSON,
          pagesJSON,
          comments = [],
          template,
        } = convertedContent;

        operations = await this._collectAllOperations({
          uid,
          contentJSON,
          template,
          documentOwner: _.get(owner, 'id', documentOwner),
          comments,
          attributesJSON,
          pagesJSON });
        let userOperations = Object.values(await memory.userOperations.get(uid));

        userOperations = userOperations.map((o) => {
          delete o.id;
          return o;
        });
        operations = _.without([].concat(userOperations, operations), undefined);

        memory.versionsOperations.add(projectId, version, operations);
      }

      operations = [].concat(documentSource, operations);
      if (setFakeIds) {
        operations = operations.map(
          (o, i) => Object.assign(o, { id: { localId: ++i, clientId } })
        );
      }
      operations = callStackOperations.concat(operations);
      return { operations };
    } catch (err) {
      throw err;
    }
  }

}

module.exports = ContentService;
