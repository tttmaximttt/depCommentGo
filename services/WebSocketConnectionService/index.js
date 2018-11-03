const config = require('config');
const Messaging = require('../_core/models/Messaging');
const ContainerBuilder = require('../_core/containderBuilder');
const Transport = require('transport');

const WebSocketTransport = Transport(
  config.WebSocketConnectionService.transport.driverName
);
const transport = new WebSocketTransport(
  config.WebSocketConnectionService.transport.options
);

const containerBuilder = new ContainerBuilder(config);
const { WebSocket } = ContainerBuilder.getContainerNames();
const container = containerBuilder.build(WebSocket, __dirname);

containerBuilder.setMessaging(container, Messaging[WebSocket])
  .setTransport(container, transport);

/** @type {WebSocketController} */
const controller = container.resolve('webSocketController');
const messaging = container.resolve('messaging');

// Log, that process has (re)started
const logSystem = container.resolve('logSystem');
const constantsEvents = container.resolve('constantsEvents');
const errorFactory = container.resolve('errorFactory');

container.resolve('messaging').setLogger(logSystem);

process.on('SIGINT', () => {
  logSystem.info(constantsEvents.SIGINT, { message: 'executing SIGINT' });
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  const error = errorFactory.customError(
    err,
    null,
    'WebSocketConnection',
    constantsEvents.UNCAUGHT_EXCEPTION
  );

  logSystem.error(error.group, { ...error });
  process.kill(process.pid, 'SIGINT');
});

process.on('unhandledRejection', (reason) => {
  const error = errorFactory.customError(
    reason,
    null,
    'WebSocketConnection',
    constantsEvents.UNHANDLED_REJECTION
  );

  logSystem.error(error.group, { ...error });
  process.kill(process.pid, 'SIGINT');
});

const { SERVICE_STARTED } = container.resolve('constantsEvents');
const { name, BUILD_ID, BUILD_BRANCH } = process.env;

logSystem.start(SERVICE_STARTED, { name, time: Date.now(), BUILD_ID, BUILD_BRANCH });

transport.on('connection', controller.onSocketConnection);
transport.on('message', controller.onSocketMessage);
transport.on('close', controller.onSocketClose);
transport.on('error', controller.onSocketError);
transport.on('limited', controller.onLimited);

messaging.on('message', controller.sendToProject);

messaging.on('connect', isReconnect => controller.startIntervalJobs(isReconnect));

messaging.connect();

module.exports = container;
