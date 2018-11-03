const config = require('config');
const Messaging = require('../_core/models/Messaging');
const ContainerBuilder = require('../_core/containderBuilder');
const RestTransport = require('transport')(config.NativeEditService.options.driverName);

const containerBuilder = new ContainerBuilder(config);
const { Manager } = ContainerBuilder.getContainerNames();
const container = containerBuilder.build(Manager, __dirname);

containerBuilder.setMessaging(container, Messaging[Manager]);
const transport = new RestTransport(config.NativeEditService.options);
const mainController = container.resolve('mainController');
const routes = container.resolve('routes');
const messaging = container.resolve('messaging');
const logSystem = container.resolve('logSystem');

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
    'NativeEdit',
    constantsEvents.UNCAUGHT_EXCEPTION
  );

  logSystem.error(error.group, { ...error });
  process.kill(process.pid, 'SIGINT');
});

process.on('unhandledRejection', (reason) => {
  const error = errorFactory.customError(
    reason,
    null,
    'NativeEdit',
    constantsEvents.UNHANDLED_REJECTION
  );

  logSystem.error(error.group, { ...error });
  process.kill(process.pid, 'SIGINT');
});

const { SERVICE_STARTED } = container.resolve('constantsEvents');
const { name, BUILD_ID, BUILD_BRANCH } = process.env;

logSystem.start(SERVICE_STARTED, { name, time: Date.now(), BUILD_ID, BUILD_BRANCH });

const router = (app) => {
  app.get('/status', (req, res) => res.end());
  app.post(`/${routes.NATIVE_EDIT_API.GENERATE}`, mainController.generate.bind(mainController));
};

transport.applyRoutes(router);

module.exports = container;
