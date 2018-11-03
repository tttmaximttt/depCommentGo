const awilix = require('awilix');
const Logger = require('../utils/Logger');
const activityHistoryConstants = require('../../ActivityHistoryService/helpers/ActivityConstants');


class ContainerBuilder {
  constructor(config) {
    this.config = config;
    this.activityHistoryConstants = activityHistoryConstants();
    this.createContainer = awilix.createContainer;
  }

  static getContainerNames() {
    return {
      Manager: 'Manager',
      Rest: 'Rest',
      WebSocket: 'WebSocket',
      Converter: 'Converter',
      AhService: 'ActivityHistory',
    };
  }

  setMessaging(container, messagingRaw) {
    const messaging = messagingRaw(this.config._core.messaging.options);

    container.registerValue('messaging', messaging);
    return this;
  }

  _setGeneral(container) {
    container.registerValue(this.config._core);
    container.registerValue('config', this.config);
    container.registerValue('activityHistoryConstants', this.activityHistoryConstants);

    return this;
  }

  _ahService(container) {
    const logger = Logger();

    container.registerValue('logger', logger);
  }

  setTransport(container, transport) {
    container.registerValue('transport', transport);
    return this;
  }

  _converterService(container) {
    container.registerValue('externalHost', this.config.ConverterService.options.externalHost);
  }

  _managerService(container) {
    container.registerValue('externalHost', this.config.RestAPIService.options.externalHost);
  }

  /**
   *
   * @param serviceName
   * @param modulesPath
   * @param externalMessaging - use only for test
   * @returns {AwilixContainer | *}
   */
  build(serviceName, modulesPath) {
    const container = this.createContainer();
    const {
      Manager,
      AhService,
      Converter,
    } = ContainerBuilder.getContainerNames();

    switch (serviceName) {
      case Manager:
        this._managerService(container);
        break;
      case AhService:
        this._ahService(container);
        break;
      case Converter:
        this._converterService(container);
        break;
      default:
        break;
    }

    this._setGeneral(container);

    container.loadModules(
      this.config.awilix.modules(modulesPath, this.config.app),
      this.config.awilix.options);

    return container;
  }
}

module.exports = ContainerBuilder;
