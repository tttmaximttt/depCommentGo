class FieldsContentController {

  /**
   * @param {routes} routes
   * @param {RestParamsHelper} restParamsHelper
   * @param {BuildService} buildService
   * @param {ConverterFabric} converterFabric
   * @param {LogSystem} logSystem
   * @param {webhookModel} webhookModel
   * @param {messaging} messaging
   * @param {constantsEvents} constantsEvents
   */
  constructor({ routes, converterFabric, restParamsHelper, constantsEvents,
                buildService, logSystem, webhookModel, messaging, coreUtils, errorFactory }) {
    this.routes = routes;
    this.converterFabric = converterFabric;
    this.restParamsHelper = restParamsHelper;
    this.buildService = buildService;
    this.logSystem = logSystem;
    this.webhookModel = webhookModel;
    this.messaging = messaging;
    this.constantsEvents = constantsEvents;
    this.coreUtils = coreUtils;
    this.errorFactory = errorFactory;
  }

  /**
   * convert * to *
   * @param req
   * @param res
   */
  async dictionary(req, res) {
    const { restParamsHelper, buildService, converterFabric, logSystem,
      constantsEvents, errorFactory } = this;

    try {
      const { content, template, builderName, ownerId } =
        restParamsHelper.getForFieldsContentDictionary(req);
      const builder = converterFabric.createBuilder(builderName);

      logSystem.debug(constantsEvents.CONVERTER_SERVICE_FLOW, {
        type: 'FieldsContentController.dictionary',
        converterName: builderName,
        converter: !!builder,
        params: { content, template },
      });

      res.json(await buildService.build(builder, 'dictionary', { content, template, ownerId }));
    } catch (err) {
      const error = errorFactory.systemError(err, null, 'fieldsContentController.dictionary');

      logSystem.error(error.group, { ...error });
      res.status(err.code || 500).send(err.message);
    }
  }

  async content(req, res) {
    const { restParamsHelper, buildService, converterFabric, logSystem,
      constantsEvents, errorFactory } = this;

    try {
      const { content, template, dictionary, builderName, ownerId } =
        restParamsHelper.getForFieldsContentDictionary(req);
      const builder = converterFabric.createBuilder(builderName);

      logSystem.debug(constantsEvents.CONVERTER_SERVICE_FLOW, {
        type: 'FieldsContentController.content',
        converterName: builderName,
        converter: !!builder,
        params: { content, template },
      });

      res.json(
        await buildService.build(builder, 'content', { content, template, dictionary, ownerId }));
    } catch (err) {
      const error = errorFactory.systemError(err, {}, 'fieldsContentController.content');

      logSystem.error(error.group, { ...error });
      res.status(err.code || 500).send(err.message);
    }
  }
}

module.exports = FieldsContentController;
