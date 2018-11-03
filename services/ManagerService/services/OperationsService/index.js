const async = require('async');
const Promise = require('bluebird');
const _ = require('lodash');
const fp = require('lodash/fp');
const availableModes = require('./availableModes');

const { flow, omit, set, curry } = fp;

class OperationsService {
  /**
   *
   * @param memory
   * @param operationsConstants
   * @param operationsFactory
   * @param logSystem
   * @param imageModel
   * @param signatureModel
   * @param operationsModel
   * @param coreUtils
   * @param constantsEvents
   * @param phase
   * @param dbRemote
   * @param javaWorkerModel
   * @param webhookModel
   * @param pagesHelper
   * @param activityHistoryConstants
   * @param luaModel
   * @param operationsHelper
   * @param operationsConverter
   * @param nativeEditApi
   * @param messaging
   * @param sourceHelper
   * @param collaborationService
   * @param handlers
   * @param generalConstants
   */
  constructor({
    memory, operationsConstants, operationsFactory, logSystem, imageModel, signatureModel,
    operationsModel, coreUtils, constantsEvents, phase, dbRemote,
    javaWorkerModel, webhookModel, pagesHelper, activityHistoryConstants, luaModel,
    operationsHelper, operationsConverter, nativeEditApi, messaging, sourceHelper,
    collaborationService, converterApi, generalConstants, collaborationHandler,
    versionHandler, imageHandler, signatureHandler, editorHandler, operationsHandler,
    mappingHandler, errorFactory, toolsHandler,
  }) {
    this.memory = memory;
    this.messaging = messaging;
    this.operationsConstants = operationsConstants;
    this.operationsFactory = operationsFactory;
    this.operationsConverter = operationsConverter;
    this.logSystem = logSystem;
    this.imageModel = imageModel;
    this.signatureModel = signatureModel;
    this.operationsModel = operationsModel;
    this.coreUtils = coreUtils;
    this.constantsEvents = constantsEvents;
    this.phase = phase;
    this.dbRemote = dbRemote;
    this.javaWorkerModel = javaWorkerModel;
    this.webhookModel = webhookModel;
    this.pagesHelper = pagesHelper;
    this.operationsHelper = operationsHelper;
    this.collaborationService = Promise.promisifyAll(collaborationService);
    this.channel = activityHistoryConstants.channel;
    this.luaModel = luaModel;
    this.nativeEditApi = nativeEditApi;
    this.sourceHelper = sourceHelper;
    this.converterApi = converterApi;
    this.generalConstants = generalConstants;
    this.errorFactory = errorFactory;

    this.availableModes = availableModes(this.operationsConstants);

    this.collaborationOpsHandler = collaborationHandler;
    this.versionOpsHandler = versionHandler;
    this.signatureHandler = signatureHandler;
    this.imageHandler = imageHandler;
    this.mappingHandler = mappingHandler;
    this.editorHandler = editorHandler;
    this.toolsHandler = toolsHandler;
    this.operationsHandler = operationsHandler;
  }

  async processOperations(uid, operations, callback) {
    const result = { operations: [] };
    const context = this;
    /* TODO TEMPORARY */
    const handleRecognizeOperation = Promise.promisify(
      this.handleRecognizeOperation,
      { context });
    /* TODO ------ */

    try {
      const { operationsConstants } = this;
      const { GROUP, TYPE } = operationsConstants;
      const finishProcessing = (error, reply) => {
        if (error) throw error;
        if (Array.isArray(reply)) {
          result.operations = result.operations.concat(reply);
        } else {
          result.operations.push(reply);
        }
      };

      await Promise.each(operations, async (operation) => {
        const { group, type } = operation.properties;

        // handle images operation
        if (group === GROUP.IMAGES) {
          const data = await this.imageHandler.handle(uid, operation);

          return finishProcessing(null, data);
        }

        // handle signatures operation
        if (group === GROUP.SIGNATURES) {
          const data = await this.signatureHandler.handle(uid, operation);

          return finishProcessing(null, data);
        }

        // handle collaboration operations
        if (group === GROUP.COLLABORATION) {
          const data = await this.collaborationOpsHandler.handle(uid, operation);

          return finishProcessing(null, data);
        }

        // handle EDITOR operations
        if (group === GROUP.EDITOR) {
          const data = await this.editorHandler.handle(uid, operation);

          return finishProcessing(null, data);
        }

        if (group === GROUP.TOOLS) {
          const data = await this.toolsHandler.handle(uid, operation);

          return finishProcessing(null, data);
        }

        // handle operations cancel operation
        if (group === GROUP.OPERATIONS) {
          const data = await this.operationsHandler.handle(uid, operation);

          return finishProcessing(null, data);
        }

        if (group === GROUP.FONT && type === TYPE.RECOGNIZE) {
          const data = await handleRecognizeOperation(uid, operation);

          return finishProcessing(null, data);
        }

        if (group === GROUP.USERS) {
          const data = await this.handleUsersOperation(uid, operation);

          return finishProcessing(null, data);
        }

        if (group === GROUP.MAPPING) {
          const data = await this.mappingHandler.handle(uid, operation);

          return finishProcessing(null, data);
        }

        if (group === GROUP.VERSIONS) {
          const data = await this.versionOpsHandler.handle(uid, operation);

          if (data.extended) {
            result.extended = data.extended;
          } else {
            return finishProcessing(null, data);
          }
        }

        result.operations.push(operation);
      });

      return typeof callback === 'function' ? callback(null, result) : result;
    } catch (err) {
      if (typeof callback === 'function') {
        callback(err, result);
      } else {
        throw err;
      }
    }
  }

  logOperations(uid, operations, channel) {
    const { TYPE, CHANNEL } = this.operationsConstants;
    const ops = _.filter(operations, (o) => {
      if (o.type === TYPE.TRACK) {
        const phase = this.phase.create({ operation: { properties: o } });

        this.logSystem.info(
          o.point,
          Object.assign({ uid, channel, phase }, o)
        );
        return false;
      }

      if (o.properties.type === TYPE.TRACK) {
        const phase = this.phase.create({ operation: o });
        const point = _.get(o, 'properties.point', null);

        if (point === this.constantsEvents.SCRIPT_EXCEPTION) {
          const pointInfo = _.get(o, 'properties.pointInfo', {});
          const message = _.get(pointInfo, 'message', 'No message found!');
          const error = this.errorFactory.customError(
            { message },
            { uid, channel: channel || CHANNEL.CLIENT, pointInfo },
            'Client.validateDocument',
            this.constantsEvents.SCRIPT_EXCEPTION,
          );

          this.logSystem.error(error.group, { ...error });
          return false;
        }

        this.logSystem.info(
          o.properties.point,
          Object.assign({ uid, channel, phase }, o.properties)
        );
        return false;
      }

      return true;
    });

    if (ops.length) {
      this.logSystem.info(
        this.constantsEvents.OPERATIONS_INPUT,
        { uid, operations: ops, channel }
      );
    }

    return ops;
  }

  listImages(userId, operation, crossEditorHost, callback) {
    this.imageModel.list(userId, crossEditorHost, (err, images) =>
      (err ? callback(err) : flow(
        set('properties.images', images),
        op => callback(err, op)
      )(operation))
    );
  }

  addImages(userId, operation, crossEditorHost, callback) {
    const { imageModel } = this;

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
        set('properties.url',
          imageModel.getImageUrl(imageId, userId, crossEditorHost)),
        op => callback(null, op)
      )(operation))
    );
  }

  deleteImages(userId, operation, crossEditorHost, callback) {
    const imageId = operation.properties.id;

    operation.properties.visible = false;

    this.imageModel.delete(userId, imageId, crossEditorHost, err => callback(err, operation));
  }

  listSignatures(userId, uid, operation, crossEditorHost, callback) {
    async.waterfall([
      next => this.signatureModel.list(userId, crossEditorHost, next),
      async (signatures) => {
        try {
          const convertedData = await this.converterApi.xmlToJson(
            { signatures }, userId, uid
          );

          if (convertedData.errors) {
            // TODO: add log for copnversion errors. Waiting for changes from Alex Nechaev
          }
          return convertedData;
        } catch (err) {
          throw err;
        }
      },
    ],
    (err, sigJSONList) => (err ? callback(err) : flow(
      set('properties.signatures', sigJSONList.signatures),
      curry(callback)(err)
    )(operation)));
  }

  handlePagesOperation(uid, operation, callback) {
    const {
      memory, operationsFactory, dbRemote, javaWorkerModel,
      webhookModel, pagesHelper, generalConstants, errorFactory,
    } = this;
    const { userId, projectId } = memory.uid.getIds(uid);
    const formId = javaWorkerModel.createFormId(projectId);
    const pages = _.get(operation, 'properties.pages');
    const { id, properties } = operation;
    const shouldLog = !properties.initial;

    let workerUrl;
    let requestProcessId;

    async.waterfall([
      // проверка идентичности, изменялся ли конфиг
      (next) => {
        const err = pagesHelper.validatePagesOperation(operation) ?
          { message: 'invalid pages', operation: JSON.stringify(operation) } :
          null;

        next(err);
      },
      // проверка на duplicate и blank
      async () => {
        const shouldCallWorker = pagesHelper.getNewPagesCount(pages) > 0;

        shouldLog && this.logSystem.info(
            this.constantsEvents.REARRANGE_STARTED,
            { uid, channel: this.channel.SERVER, pages, workerStarted: shouldCallWorker }
          );

        if (!shouldCallWorker) {
          await this.memory.projectData.set(projectId, this.memory.projectData.lastPageOp, operation);
          throw generalConstants.NOOP;
        }

        return operation;
      },
      async () => {
        const [editorData, projectData] = await Promise.all([
          memory.editorData.get(uid),
          memory.projectData.get(projectId),
        ]);

        return { editorData, projectData };
      },
      async (data) => {
        const { editorData, projectData } = data;

        workerUrl = _.get(editorData, 'workerUrl', null);

        if (!projectData.rearrangeProcessId) {
          const res = await dbRemote.editorRefreshAsync({ userId, projectId, clientType: 'js', launch: 'editor' });

          return { pdfUrl: _.get(res, 'source.pdf.url') };
        }
        const res = await javaWorkerModel.getAssemblyJobStatus({
          uid,
          workerUrl,
          processId: projectData.rearrangeProcessId,
        });

        return javaWorkerModel.toPdfSources(res);
      },
      // запустить воркер (pdfUrl)
      async ({ pdfUrl }) => {
        const resolver = { resolve: null, reject: null };
        const job = new Promise((resolve, reject) => {
          resolver.resolve = resolve;
          resolver.reject = reject;
        });
        const res = await javaWorkerModel.updatePages({
          uid,
          formId,
          pdfUrl,
          workerUrl,
          callbackUrl: webhookModel.create(javaWorkerModel.createFormId(projectId), resolver),
          pages,
        });

        requestProcessId = res && res.processId;
        const jobData = await job;

        return jobData;
      },
      // дождаться вызова callbackUrl или сделать запрос на воркеры
      async (dataFromCallback) => {
        if (!dataFromCallback) {
          return javaWorkerModel.getAssemblyJobStatus({ uid, workerUrl, processId: requestProcessId });
        }
        return dataFromCallback;
      },
      // приветси данные к общему виду
      (jobData, next) => {
        const { pdfUrl } = javaWorkerModel.toPdfSources(jobData);
        const processId = _.get(jobData, 'processId');
        const status = _.get(jobData, 'status');
        const err = status !== javaWorkerModel.STATUS.COMPLETED ?
          { message: 'pdf job failed', processId } :
          null;

        next(err, { pdfUrl, processId });
      },
      // loadTempPDF(processId)
      ({ pdfUrl, processId }, next) => dbRemote.loadTempPdf(
        { viewerId: userId, projectId, processId, mode: null, read: null },
        (err, wrappedPdfUrl) => {
          next(err, { pdfUrl: wrappedPdfUrl, processId });
        }
      ),
      // генерация операций PAGES && SOURCE
      async ({ pdfUrl, processId }) => {
        const sortedPages = pagesHelper.reset(pages);
        const sourceOperation = operationsFactory.createSourceOperation(pdfUrl);
        const pagesOperation = operationsFactory.pages(sortedPages, { processId });

        pagesOperation.id = id;

        // сoхранить pages как текущий и new processId
        await memory.projectData.set(
          projectId,
          memory.projectData.rearrangeProcessId,
          processId
        );
        await this.memory.projectData.set(projectId, this.memory.projectData.lastPageOp, pagesOperation);

        return [sourceOperation, pagesOperation];
      },
    ], (err, result) => {
      const { logSystem, constantsEvents, channel } = this;

      if (err && err.message === generalConstants.NOOP) {
        err = null;
        result = operation;
      }

      if (err) {
        const error = errorFactory.customError(
          err,
          { uid, channel: channel.SERVER },
          'OperationService.handlePagesOperation',
          constantsEvents.REARRANGE_FAILED
        );

        shouldLog && logSystem.error(error.group, { ...error });
      } else {
        shouldLog && logSystem.info(
          constantsEvents.REARRANGE_COMPLETED,
          { uid, channel: channel.SERVER, result }
        );
      }
      callback(err, result);
    });
  }

  handleNativePreviewOperation(uid, operation, callback) {
    const { operationsFactory, operationsToGeneratePDF } = this;

    operationsToGeneratePDF.bind(this)(uid, (err, res) => {
      callback(err, operationsFactory.nativePreviewOperation(operation, _.get(res, 'wrappedUrl')));
    });
  }

  prepareNativeCommandOperations(uid, callback) {
    const { memory, generalConstants } = this;

    const projectId = memory.uid.getProjectId(uid);

    async.waterfall([
      next => this.operationsToGeneratePDF(uid, next),
      async ({ processId }) => {
        await memory.projectData.set(projectId, memory.projectData.rearrangeProcessId, processId);
      },
    ], err => callback(err === generalConstants.NOOP ? null : err));
  }

  operationsToGeneratePDF(uid, callback) {
    const { memory, nativeEditApi, operationsHelper, logSystem, constantsEvents,
      webhookModel, sourceHelper, javaWorkerModel, generalConstants } = this;
    const { userId, projectId } = memory.uid.getIds(uid);
    let requestProcessId;

    async.waterfall([
      async () => operationsHelper.getNativeCommandOperations(projectId),
      (operations, next) => {
        if (operations && !operations.length) {
          return next(generalConstants.NOOP, {});
        }
        sourceHelper.getActualPdf(userId, projectId,
            (err, pdfSource) => next(err, { operations, pdfSource, projectId }));
      },
      async (requestParams) => {
        const resolver = { resolve: null, reject: null };
        const job = new Promise((resolve, reject) => {
          resolver.resolve = resolve;
          resolver.reject = reject;
        });

        logSystem.info(constantsEvents.API_REQUEST, {
          endpoint: 'generate',
          uid,
          pdfSource: requestParams.pdfSource,
          operationsCount: requestParams.operations.length,
        });
        requestParams = _.set(
          requestParams,
          'callbackUrl',
          webhookModel.create(javaWorkerModel.createFormId(projectId), resolver)
        );

        await job;

        nativeEditApi.generate(
          requestParams,
          (err, response) => {
            logSystem.info(constantsEvents.API_RESPONSE, {
              endpoint: 'generate',
              uid,
              pdfSource: requestParams.pdfSource,
              operationsCount: requestParams.operations.length,
              response,
            });
            if (err) throw err;
            try {
              requestProcessId = JSON.parse(response.body).processId;
            } catch (e) {
              throw e;
            }
          }
        );
      },
      async (data) => {
        if (!requestProcessId) {
          const err = new Error('undefined requestProcessId');

          err.uid = uid;
          err.data = data;
          throw err;
        }
        if (data) return data;

        return javaWorkerModel.getAssemblyBuildJobStatus({ uid, formId: projectId, processId: requestProcessId });
      },
      (workerResponse, next) => {
        const { processId, pdfUrl } = workerResponse;

        if (!processId || !pdfUrl) {
          return next({
            message: 'pdf job failed',
            workerResponse,
            uid,
          });
        }

        sourceHelper.getPdfByProcessIdForNative(userId, projectId, processId, (err, wrappedUrl) => {
          next(err, _.set(workerResponse, 'wrappedUrl', wrappedUrl));
        });
      },
    ], callback);
  }

  handleRecognizeOperation(uid, operation, callback) {
    const { operationsHelper, memory, webhookModel, javaWorkerModel, operationsFactory,
      logSystem, constantsEvents } = this;
    const { PENDING_RECOGNIZE_FONT } = constantsEvents;

    if (!operationsHelper.validateRecognizeOperation(operation)) {
      return callback({
        message: 'Invalid recognize operation',
        operation: JSON.stringify(operation),
      });
    }

    const { userId, projectId } = memory.uid.getIds(uid);
    const formId = javaWorkerModel.createFormId(projectId);
    let workerUrl;
    let processId;

    async.waterfall([
      async () => memory.editorData.get(uid),
      async (editorData) => {
        const resolver = { resolve: null, reject: null };
        const job = new Promise((resolve, reject) => {
          resolver.resolve = resolve;
          resolver.reject = reject;
        });

        workerUrl = _.get(editorData, 'workerUrl', null);

        const { image, imageFormat } = operation.properties;
        const res = await javaWorkerModel.recognizeFont({
          userId,
          workerUrl,
          image,
          imageFormat,
          formId,
          callbackUrl: webhookModel.create(formId, resolver),
        });

        processId = _.get(res, 'processId');
        const jobData = await job;

        return jobData;
      },
      async (workerResponse) => {
        if (!workerResponse) {
          return javaWorkerModel.getFontRecognitionJobStatus({ uid, workerUrl, formId, processId });
        }

        return workerResponse;
      },
      (workerResponse, next) => {
        const status = _.get(workerResponse, 'status');

        if (status === javaWorkerModel.STATUS.PENDING) {
          logSystem.warning(PENDING_RECOGNIZE_FONT, {
            uid,
            operation: JSON.stringify(operation),
          });
        }

        if (status !== javaWorkerModel.STATUS.COMPLETED) {
          return next({ message: 'Font recognition job failed', processId });
        }

        const fontOperation = operationsFactory.createFontRecognitionOperation(workerResponse);

        next(null, fontOperation);
      },
    ], callback);
  }

  handleListOfOperations(uid, clientStatus, operations) {
    const { operationsHelper, messaging, memory } = this;

    if (operationsHelper.isListOfOperations(operations)) {
      const cancelOperation = operationsHelper.getCancelOperations(operations);

      if (cancelOperation && cancelOperation.length) {
        operations = _.remove(operations, cancelOperation.pop());
        messaging.sendToProjectQueue(
            memory.uid.getProjectId(uid),
            { uid, clientStatus, operations: cancelOperation }
        );
      }
    }

    return operations;
  }

  /**
   * @param uid
   * @param operation
   * @param callback
   */
  async handleToolTemplateOperation(uid, operation) {
    const { operationsConverter, memory } = this;
    const { enabledPropertyService } = operationsConverter;
    const allowEditing = _.get(operation, 'properties.template.allowEditing', null);
    const { userId } = memory.uid.getIds(uid);

    if (allowEditing != null) {
      const enabled = enabledPropertyService.applyAllowEditing(operation, allowEditing, userId);

      _.set(operation, 'properties.enabled', enabled);
    }

    return operation;
  }

  async handleUsersOperation(uid, operation) {
    try {
      const listUsers = Promise.promisify(this.listUsers, { context: this });
      const { memory } = this;
      const { userId } = memory.uid.getIds(uid);
      const crossEditorHost = await memory.crossEditor.getMiddleware(uid);
      let result = null;

      switch (operation.properties.type) {
        case 'list':
          result = await listUsers(userId, uid, operation, crossEditorHost);
          break;
        default:
          throw new Error('Error - Invalid users operation type');
      }

      return result;
    } catch (err) {
      throw err;
    }
  }

  listUsers(userId, uid, operation, crossEditorHost, callback) {
    const { dbRemote, memory, operationsFactory } = this;
    const projectId = memory.uid.getProjectId(uid);
    const users = operation.properties.users;

    dbRemote.setHost(crossEditorHost)
      .getUsersInfo(userId, projectId, users, '', (err, res) => {
        callback(err, operationsFactory.getUserList(res.list));
      });
  }
}

module.exports = OperationsService;
