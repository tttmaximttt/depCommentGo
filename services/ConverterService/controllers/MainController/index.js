// const WORKER_STATUS_PROCESSING = 'PROCESSING';
const BAD_REQUEST = 'BAD_REQUEST';

class MainController {

  /**
   * @param {routes} routes
   * @param {RestParamsHelper} restParamsHelper
   * @param {ConverterService} converterService
   * @param {ConverterFabric} converterFabric
   * @param {LogSystem} logSystem
   * @param {webhookModel} webhookModel
   * @param {messaging} messaging
   * @param {constantsEvents} constantsEvents
   * @param {ConverterApi} converterApi
   * @param {JavaWorkerConstants} javaWorkerConstants
   * @param {coreUtils} coreUtils
   */
  constructor({ routes, converterFabric, restParamsHelper, constantsEvents, javaWorkerConstants,
      converterService, logSystem, webhookModel, messaging, converterApi, coreUtils,
      errorFactory }) {
    this.routes = routes;
    this.converterFabric = converterFabric;
    this.restParamsHelper = restParamsHelper;
    this.converterService = converterService;
    this.logSystem = logSystem;
    this.webhookModel = webhookModel;
    this.messaging = messaging;
    this.constantsEvents = constantsEvents;
    this.converterApi = converterApi;
    this.javaWorkerConstants = javaWorkerConstants;
    this.coreUtils = coreUtils;
    this.errorFactory = errorFactory;
  }

  /**
   * convert * to *
   * @param req
   * @param res
   */
  async convert(req, res) {
    try {
      const { restParamsHelper, converterService, converterFabric, logSystem,
        constantsEvents } = this;
      const { document, ownerId, host, dpi } = restParamsHelper.getForConvert(req);
      const converterName = `${req.params[0]}to${req.params[1]}`.replace(/-/g, '');
      const converter = converterFabric.createConverter(converterName);

      logSystem.debug(constantsEvents.CONVERTER_SERVICE_FLOW, {
        type: 'MainController.convert',
        converterName,
        converter: !!converter,
        params: { document, ownerId, host },
      });

      res.json(await converterService.convert(converter, { document, ownerId, host, dpi }));
    } catch (e) {
      res.status(500).send(e.stack || e.message);
    }
  }

  async pdf(req, res) {
    try {
      const { restParamsHelper, converterService, converterFabric, logSystem,
        constantsEvents } = this;
      const options = restParamsHelper.getForConvert(req);
      const { document, ownerId, host, callbackUrl } = options;
      const converterName = `${req.params[0]}topdf`.replace(/-/g, '');
      const converter = converterFabric.createConverter(converterName);

      logSystem.debug(constantsEvents.CONVERTER_SERVICE_FLOW, {
        type: 'MainController.pdf',
        converterName,
        converter: !!converter,
        params: { document, ownerId, host, callbackUrl },
      });

      res.json(await converterService.convert(converter, options));
    } catch (e) {
      res.status(500).send(e.stack || e.message);
    }
  }

  async createWebhook(req, res) {
    try {
      const { webhookModel } = this;
      const { hookId } = req.params;
      const resolver = { resolve: null, reject: null };
      const job = new Promise((resolve, reject) => {
        resolver.resolve = resolve;
        resolver.reject = reject;
      });

      if (!hookId || !req.body) {
        return res.status(500).send(BAD_REQUEST);
      }

      webhookModel.create(hookId, resolver);
      await job
        .then(reply => res.json(reply))
        .catch(err => res.status(500).send(err.stack || err.message));
    } catch (err) {
      res.status(500).send(err.stack || err.message);
    }
  }

  runWebhook(req, res) {
    const { messaging, logSystem, constantsEvents } = this;
    const { SYSTEM_TYPES_HOOK } = constantsEvents;
    const { hookId, managerQueue } = req.params;

    logSystem.debug(constantsEvents.CONVERTER_SERVICE_FLOW, {
      type: 'MainController.runWebhook',
      hookId,
      managerQueue });

    if (!hookId || !managerQueue || !req.body) {
      return res.status(500).send(BAD_REQUEST);
    }

    messaging.sendToConverterQueue(managerQueue, SYSTEM_TYPES_HOOK, hookId, req.body);
    res.json({});
  }

  async system({ system, type }) {
    const { logSystem, constantsEvents, javaWorkerConstants,
      converterService, converterFabric, converterApi, messaging, errorFactory } = this;
    const { SYSTEM_TYPES_HOOK, SYSTEM_TYPES_CONVERT } = constantsEvents;

    logSystem.debug(constantsEvents.CONVERTER_SERVICE_FLOW, {
      type: 'MainController.system',
      systemType: type,
    });

    try {
      switch (type) {
        case SYSTEM_TYPES_HOOK: {
          const { webhookModel } = this;
          const { hookId, hookData } = system;

          if (hookId && hookData && hookData.status !== javaWorkerConstants.PROCESSING) {
            webhookModel.run(hookId, hookData);
          }
          break;
        }

        case SYSTEM_TYPES_CONVERT: {
          const { dataKey, hookId, managerQueue } = system;
          const { from, to, document, ownerId, host, dpi, uid } =
            await converterApi.getTransferData(dataKey);
          const converterName = `${from}to${to}`.replace(/-/g, '');
          const converter = converterFabric.createConverter(converterName);

          logSystem.debug(constantsEvents.CONVERTER_SERVICE_FLOW, {
            type: 'MainController.convert(system)',
            converterName,
            converter: !!converter,
            params: { document, ownerId, host },
          });

          const convertedDocument =
            await converterService.convert(converter, { document, ownerId, host, dpi });

          const dataKeyAnswer = await converterApi.putTransferData(uid, convertedDocument);

          messaging.sendToManagerService(managerQueue, hookId, { dataKey: dataKeyAnswer });
          break;
        }

        default: {
          const error = errorFactory.customError(
            new Error('system type is not defined'),
            { systemType: type },
            'MainController.system',
            constantsEvents.LOGIC_ERROR
          );

          logSystem.error(error.group, { ...error });
        }
      }
    } catch (err) {
      const error = errorFactory.systemError(err, null, 'MainController.system');

      logSystem.error(error.group, { ...error });
    }
  }

}

module.exports = MainController;
