const config = require('config');
const Messaging = require('../_core/models/Messaging');
const ContainerBuilder = require('../_core/containderBuilder');

const {
  RABBIT_MESSAGE,
} = require(`${config.paths.ROOT}/services/_core/constants/ConstantsEvents`)();

const { Manager } = ContainerBuilder.getContainerNames();
const containerBuilder = new ContainerBuilder(config);
const container = containerBuilder.build(Manager, __dirname);

containerBuilder.setMessaging(container, Messaging[Manager]);
/** @type {MainController} */
const controller = container.resolve('mainController');
const messaging = container.resolve('messaging');

// Log, that process has (re)started
const logSystem = container.resolve('logSystem');
const constantsEvents = container.resolve('constantsEvents');
const errorFactory = container.resolve('errorFactory');

messaging.setLogger(logSystem);

process.on('SIGINT', () => {
  logSystem.info(constantsEvents.SIGINT, { message: 'executing SIGINT' });
  messaging.sigintHandler.call(messaging);
});

process.on('uncaughtException', (err) => {
  const error = errorFactory.customError(
    err,
    null,
    'ManagerService',
    constantsEvents.UNCAUGHT_EXCEPTION
  );

  logSystem.error(error.group, { ...error });
  process.kill(process.pid, 'SIGINT');
});

process.on('unhandledRejection', (reason) => {
  const error = errorFactory.customError(
    reason,
    null,
    'ManagerService',
    constantsEvents.UNHANDLED_REJECTION
  );

  logSystem.error(error.group, { ...error });
  // process.kill(process.pid, 'SIGINT');
});

const {
  SIGNATURES, REST_DOCUMENT_CONTENT_REQUEST, SERVICE_STARTED,
} = container.resolve('constantsEvents');
const { name, BUILD_ID, BUILD_BRANCH } = process.env;

logSystem.start(SERVICE_STARTED, { name, time: Date.now(), BUILD_ID, BUILD_BRANCH });

// -------------------
// CLIENT OPERATIONS - from WebSocket service
// -------------------

messaging.on('auth', controller.auth.bind(controller));

messaging.on('operations', controller.operations.bind(controller));
messaging.on('disconnect', controller.destroy.bind(controller));
// -----------------------
// SYSTEM EVENTS - from Manager service or messaging
// -----------------------

messaging.on('newProject', controller.newProject.bind(controller));
messaging.on('system', controller.system.bind(controller));
messaging.on('projectClose', controller.projectClose.bind(controller));
messaging.on(RABBIT_MESSAGE, controller.onRabbitMessage.bind(controller));

// -------------------
// REST JOBS
// -------------------

messaging.on(SIGNATURES, controller.signatures.bind(controller));
messaging.on(REST_DOCUMENT_CONTENT_REQUEST, controller.getDocumentContent.bind(controller));

// -------------------
// INTERVAL JOBS
// -------------------

messaging.on('connect', isReconnect => controller.startIntervalJobs(isReconnect));

// -------------------
// CONNECTION TO RABBIT
// -------------------
messaging.connect();

// Export awilix container with whole application.
// This may be useful for testing
module.exports = container;
