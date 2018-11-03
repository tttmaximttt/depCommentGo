const config = require('config');
const ContainerBuilder = require('../_core/containderBuilder');
const Messaging = require('../_core/models/Messaging');
const RestTransport = require('transport')(config.ConverterService.options.driverName);

const transport = new RestTransport(config.ConverterService.options);
const containerBuilder = new ContainerBuilder(config);
const { Converter } = ContainerBuilder.getContainerNames();
const container = containerBuilder.build(Converter, __dirname);

containerBuilder.setMessaging(container, Messaging[Converter]);

const mainController = container.resolve('mainController');
const fieldsContentController = container.resolve('fieldsContentController');
const logSystem = container.resolve('logSystem');
const constantsEvents = container.resolve('constantsEvents');
const messaging = container.resolve('messaging');
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
    'ConverterService',
    constantsEvents.UNCAUGHT_EXCEPTION
  );

  logSystem.error(error.group, { ...error });
  process.kill(process.pid, 'SIGINT');
});

process.on('unhandledRejection', (reason) => {
  const error = errorFactory.customError(
    reason,
    null,
    'ConverterService',
    constantsEvents.UNHANDLED_REJECTION
  );

  logSystem.error(error.group, { ...error });
  process.kill(process.pid, 'SIGINT');
});

const { SERVICE_STARTED } = container.resolve('constantsEvents');
const { name, BUILD_ID, BUILD_BRANCH } = process.env;

logSystem.start(SERVICE_STARTED, { name, time: Date.now(), BUILD_ID, config, BUILD_BRANCH });

const router = (app) => {
  app.get('/status', (req, res) => res.end());
  app.post('/convert/*/to/*', mainController.convert.bind(mainController));
  app.post('/pdf/*', mainController.pdf.bind(mainController));
  app.post('/fields_dictionary/get',
    fieldsContentController.dictionary.bind(fieldsContentController));
  app.post('/fields_dictionary/set',
    fieldsContentController.content.bind(fieldsContentController));
  app.get('/hook/:managerQueue/:hookId', mainController.createWebhook.bind(mainController));
  app.post('/hook/:managerQueue/:hookId', mainController.runWebhook.bind(mainController));
};

transport.applyRoutes(router);

messaging.on('system', mainController.system.bind(mainController));

messaging.connect();

module.exports = container;
