const config = require('config');
const Messaging = require('../_core/models/Messaging');
const ContainerBuilder = require('../_core/containderBuilder');
const RestTransport = require('transport')(config.RestAPIService.options.driverName);

const containerBuilder = new ContainerBuilder(config);
const { Rest } = ContainerBuilder.getContainerNames();
const container = containerBuilder.build(Rest, __dirname);

containerBuilder.setMessaging(container, Messaging[Rest]);

const transport = new RestTransport(config.RestAPIService.options);

const logSystem = container.resolve('logSystem');
const publicAPIController = container.resolve('publicAPIController');
const systemAPIController = container.resolve('systemAPIController');
const statsAPIController = container.resolve('statsAPIController');
const messaging = container.resolve('messaging');
/** @type {RestMiddleware} */
const restMiddleware = container.resolve('restMiddleware');

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
    'RestAPI',
    constantsEvents.UNCAUGHT_EXCEPTION
  );

  logSystem.error(error.group, { ...error });
  process.kill(process.pid, 'SIGINT');
});

process.on('unhandledRejection', (reason) => {
  const error = errorFactory.customError(
    reason,
    null,
    'RestAPI',
    constantsEvents.UNHANDLED_REJECTION
  );

  logSystem.error(error.group, { ...error });
  process.kill(process.pid, 'SIGINT');
});

const { SERVICE_STARTED, REST_DOCUMENT_CONTENT_RESPONSE } = container.resolve('constantsEvents');
const { name, BUILD_ID, BUILD_BRANCH } = process.env;

logSystem.start(SERVICE_STARTED, { name, time: Date.now(), BUILD_ID, BUILD_BRANCH });

messaging.on(
  REST_DOCUMENT_CONTENT_RESPONSE,
  publicAPIController.sendProjectDocument.bind(publicAPIController)
);

messaging.connect();

const router = (app) => {
// -----------------
// MIDDLEWARE
// content-type, secure endpoints
// -----------------

  restMiddleware.contentType(app);
  restMiddleware.secureEndpoints(app);

  app.use((req, res, next) => {
    const { url, method, query, body, params } = req;

    logSystem.info(
      constantsEvents.REST_INCOMING_REQUEST,
      { requestData: JSON.stringify({ url, method, query, body, params, time: new Date() }) });
    next();
  });
// -----------------
// PING ROUTE
// -----------------
  app.get('/', (req, res) => res.end());

// -----------------
// JS FILLER ENDPOINTS
// used by jsfiller client
// -----------------

  app.post('/session/init', publicAPIController.initSession.bind(publicAPIController));
  app.post('/trackpoint', publicAPIController.trackPoint.bind(publicAPIController));
  app.post('/external/trackpoint',
    publicAPIController.externalTrackPoint.bind(publicAPIController));

// -----------------
// WS-PDF-SERVICES ENDPOINTS
// used by manager service && other instances
// -----------------

  app.post('/project/busy', publicAPIController.broadcastProjectBusy.bind(publicAPIController));
  app.post('/destroy', publicAPIController.destroy.bind(publicAPIController));
  app.post('/destroy/byUserId', publicAPIController.destroyByUserId.bind(publicAPIController));
  app.post('/deactivate', publicAPIController.deactivate.bind(publicAPIController));
  app.post('/activate', publicAPIController.activate.bind(publicAPIController));
  app.get('/status', publicAPIController.status.bind(publicAPIController));
  app.post(
    '/hook/:managerQueue/:hookId',
    publicAPIController.runWebhook.bind(publicAPIController)
  );

// -----------------
// PHP ENDPOINTS
// used by PHP API
// -----------------

  app.post('/sign/open', publicAPIController.signatureOpen.bind(publicAPIController));
  app.post('/sign/done', publicAPIController.signatureDone.bind(publicAPIController));
  app.get(
    '/project/document/:projectId',
    publicAPIController.getProjectDocument.bind(publicAPIController)
  );

// -----------------
// REDIS ENDPOINTS
// used for debugging
// -----------------

  if (config.restSecureKey) {
    app.get('/redis/keys', systemAPIController.redisKeys.bind(systemAPIController));
    app.post('/redis/execute', systemAPIController.redisExecute.bind(systemAPIController));
    app.get('/activity/drain', systemAPIController.drainActivity.bind(systemAPIController));
    app.get('/watcher/project', systemAPIController.startProjectWatcher.bind(systemAPIController));
  }

// -----------------
// ELASTICSEARCH ENDPOINTS
// used for debugging
// -----------------
  if (config.restSecureKey) {
    app.post('/elastic/sessions',
      statsAPIController.sessionsList.bind(statsAPIController));
    app.post('/elastic/history/:sessionHash',
      statsAPIController.historyBySessionHash.bind(statsAPIController));
    app.post('/stats/sessions',
      statsAPIController.getStatistic.bind(statsAPIController));
    app.post('/stats/operations',
      statsAPIController.getOperationsStatistic.bind(statsAPIController));
    app.post('/stats/operations/detailed',
      statsAPIController.getDetailedOperationStats.bind(statsAPIController));
    app.post('/stats/sessions/detailed',
      statsAPIController.getDetailedSessionStats.bind(statsAPIController));
  }

  app.post('/auth', publicAPIController.auth.bind(publicAPIController));
};

transport.applyRoutes(router);

module.exports = container;
