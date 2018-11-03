const config = require('config');
const ContainerBuilder = require('../_core/containderBuilder');
const Messaging = require('../_core/models/Messaging');

const containerBuilder = new ContainerBuilder(config);
const { AhService } = ContainerBuilder.getContainerNames();
const container = containerBuilder.build(AhService, __dirname);

containerBuilder.setMessaging(container, Messaging[AhService]);

/**
 * @type {ActivityHistoryController}
 */
const controller = container.resolve('activityHistoryController');
const logSystem = container.resolve('logSystem');
const messaging = container.resolve('messaging');
const constantsEvents = container.resolve('constantsEvents');
const errorFactory = container.resolve('errorFactory');

messaging.setLogger(logSystem);

process.on('SIGINT', () => {
  logSystem.info(constantsEvents.SIGINT, { message: 'executing SIGINT' });
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  const error = errorFactory.customError(
    err,
    null,
    'ActivityHistory',
    constantsEvents.UNCAUGHT_EXCEPTION
  );

  logSystem.error(error.group, { ...error });
  process.kill(process.pid, 'SIGINT');
});

process.on('unhandledRejection', (reason) => {
  const error = errorFactory.customError(
    reason,
    null,
    'ActivityHistory',
    constantsEvents.UNHANDLED_REJECTION
  );

  logSystem.error(error.group, { ...error });
  process.kill(process.pid, 'SIGINT');
});

const { SERVICE_STARTED } = container.resolve('constantsEvents');
const { name, BUILD_ID, BUILD_BRANCH } = process.env;

logSystem.start(SERVICE_STARTED, { name, time: Date.now(), BUILD_ID, BUILD_BRANCH });

messaging.on('activity', controller.onActivityData);
messaging.on('system', controller.onSystemEvent.bind(controller));

container.resolve('elasticModel').syncTemplates(() => messaging.connect());

module.exports = container;
