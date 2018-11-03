const _ = require('lodash');
const async = require('async');
const Promise = require('bluebird');

module.exports = class VersionOpsHandler {
  constructor({
    memory, errorFactory, operationsConstants, dbRemote, logSystem,
    operationsFactory, coreUtils, constantsEvents, contentService,
    nativeEditApi, operationsHelper, webhookModel, sourceHelper,
    javaWorkerModel, generalConstants, operationsConverter, pagesHelper,
    activityHistoryConstants,
  }) {
    this.memory = memory;
    this.operationsConstants = operationsConstants;
    this.dbRemote = dbRemote;
    this.logSystem = logSystem;
    this.operationsFactory = operationsFactory;
    this.coreUtils = coreUtils;
    this.operationsConverter = operationsConverter;
    this.constantsEvents = constantsEvents;
    this.channel = activityHistoryConstants.channel;
    this.contentService = contentService;
    this.errorFactory = errorFactory;
    this.nativeEditApi = nativeEditApi;
    this.operationsHelper = operationsHelper;
    this.webhookModel = webhookModel;
    this.sourceHelper = sourceHelper;
    this.pagesHelper = pagesHelper;
    this.javaWorkerModel = javaWorkerModel;
    this.generalConstants = generalConstants;
  }

  _handleToolTemplate(uid, operation) {
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

  /**
   *
   * @param {string} uid
   * @param {object} operation
   * @param {function} callback
   * @private
   */
  _handlePages(uid, operation, callback) {
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

          return {
            pdfUrl: _.get(res, 'source.pdf.url'),
          };
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
      async (data, next) => {
        if (!requestProcessId) {
          const err = new Error('undefined requestProcessId');

          err.uid = uid;
          err.data = data;
          throw err;
        }
        if (data) return next(null, data);

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

  /**
   *
   * @param {string} uid
   * @param {object} operation
   * @returns {Promise<object>}
   * @private
   */
  _handleNativePreview(uid, operation, callback) {
    const { operationsFactory, operationsToGeneratePDF } = this;

    operationsToGeneratePDF.bind(this)(uid, (err, res) => {
      callback(err, operationsFactory.nativePreviewOperation(operation, _.get(res, 'wrappedUrl')));
    });
  }

  /**
   *
   * @param uid
   * @param operation
   */
  handle(uid, operation) {
    let result = null;
    const { operationsConstants } = this;
    const { TYPE, SUB_TYPE } = operationsConstants;
    const { type, subType } = operation.properties;
    const _handlePages = Promise.promisify(this._handlePages, { context: this });
    const _handleNativePreview = Promise.promisify(this._handleNativePreview, { context: this });

    if (_.get(operation, 'properties.template', null)) return this._handleToolTemplate(uid, operation);

    switch (type) {
      case TYPE.PAGES:
        result = _handlePages(uid, operation);
        break;
      case TYPE.NATIVE:

        switch (subType) {
          case SUB_TYPE.PREVIEW:
            result = _handleNativePreview(uid, operation);
            break;
          default:
            result = operation;
        }

        break;
      default:
        result = operation;
    }

    return result;
  }
};
