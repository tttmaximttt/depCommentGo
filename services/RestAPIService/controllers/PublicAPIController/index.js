const httpError = require('http-errors');
const uuid = require('uuid/v4');

const sendInternalServerError = (res, err) => {
  if (!err.statusCode) {
    return res.status(500)
      .send({
        status: 'FAIL',
        result: err,
      });
  }

  res.status(err.statusCode)
    .send({
      status: 'FAIL',
      result: err,
    });
};

class PublicAPIController {

  /**
   * @param {RestService} restService
   * @param {ActivityService} activityService
   * @param {LogSystem} logSystem
   * @param {Object} constantsEvents
   */
  constructor({
    restService, activityService, logSystem, constantsEvents,
                messaging, clientStatuses, memory, operationsConstants,
  }) {
    this.restService = restService;
    this.activityService = activityService;
    this.logSystem = logSystem;
    this.constantsEvents = constantsEvents;

    this.messaging = messaging;
    this.clientStatuses = clientStatuses;
    this.memory = memory;
    this.operationsConstants = operationsConstants;
  }

  /**
   * @param  {Object} req
   * @param  {Object} res
   */
  initSession(req, res) {
    this.restService.initSession(req, res);
  }

  /**
   * @param  {Object} req
   * @param  {Object} res
   */
  trackPoint(req, res) {
    this.activityService.trackPoint(req, res);
  }

  /**
   * @param  {Object} req
   * @param  {Object} res
   */
  externalTrackPoint(req, res) {
    this.activityService.externalTrackPoint(req, res);
  }


  /**
   * @param  {Object} req
   * @param  {Object} res
   */
  signatureOpen(req, res) {
    const { userId } = req.body;

    this.logSystem.info(this.constantsEvents.SIGNATURE_REST_OPEN, req.body);
    this.restService.signatures({ userId, signatureOpen: true }, res);
  }

  /**
   * @param  {Object} req
   * @param  {Object} res
   */
  signatureDone(req, res) {
    const { userId, sig } = req.body;

    this.logSystem.info(this.constantsEvents.SIGNATURE_REST_DONE, req.body);
    this.restService.signatures({ userId, signatureDone: { sig } }, res);
  }

  /**
   * @param  {Object} req
   * @param  {Object} res
   */
  getProjectDocument(req, res) {
    this.restService.getProjectDocument(req, res);
  }

  /**
   * @param  {Object} payload
   * @param  {Object} meta
   */
  sendProjectDocument(payload, meta) {
    this.restService.sendProjectDocument(payload, meta);
  }

  async deactivate(req, res) {
    try {
      const { location } = req.body;

      const isDeactivate = /deactivate/g.test(req.path);
      const result = await this.restService.destroyAll(location, isDeactivate);

      res.send({ status: 'OK', result });
    } catch (err) {
      sendInternalServerError(res, err);
    }
  }

  async destroyByUserId(req, res) {
    try {
      const { location, projectId, userId } = req.body;

      if (!projectId || !userId) {
        throw new httpError.BadRequest('Missing required `projectId` or `userId` property in body');
      }

      const result = await this.restService.destroyByUserId(location, projectId, userId);

      res.send({ status: 'OK', result });
    } catch (err) {
      sendInternalServerError(res, err);
    }
  }

  /**
   *
   * @param req
   * @param res
   */
  async destroy(req, res) {
    try {
      const { location, projectId } = req.body;

      if (!projectId) {
        throw new httpError.BadRequest('Missing required `projectId` property in body');
      }

      const result = await this.restService.destroyAllUsersInProject(location, projectId);

      res.send({ status: 'OK', result });
    } catch (err) {
      sendInternalServerError(res, err);
    }
  }

  async activate(req, res) {
    try {
      const [clearDestroyResult, activateEnv] = await this.restService.activateEnv();

      res.send({ status: 'OK', result: { clearDestroyResult, activateEnv } });
    } catch (err) {
      sendInternalServerError(res, err);
    }
  }

  async status(req, res) {
    try {
      const result = await await this.restService.getDestroyStatus();

      res.send({
        status: 'OK',
        result,
      });
    } catch (err) {
      sendInternalServerError(res, err);
    }
  }

  /**
   * @param  {Object} req
   * @param  {Object} res
   */
  async broadcastProjectBusy(req, res) {
    const { projectId, location } = req.body;

    if (!projectId) {
      throw new httpError.BadRequest('Missing required `projectId` property in body');
    }

    const result = await this.restService.destroyAllUsersInProject(location, projectId);

    res.send({ status: 'OK', result });
  }

  /**
   * @param  {Object} req
   * @param  {Object} res
   */
  runWebhook(req, res) {
    this.restService.runWebhook(req, res);
  }

  auth(req, res) {
    const { messaging, clientStatuses, memory } = this;
    const { userId, projectId, authHash, token, urlParams } = req.body;

    const uid = memory.uid.getUniqueUid(memory.uid.create(userId, projectId, authHash));
    const auth = {
      properties: {
        _callFromRest: true,
        api_hash: token,
        projectId,
        viewerId: userId,
        checkAuth: false,
        clientType: 'js',
        launch: 'editor',
        mode: 'edit',
        sessionHash: uuid(),
        urlParams: {
          authHash,
          ...urlParams,
        },
        // access: operationsConstants.ACCESS.REQUEST,
      },
    };

    messaging.assertProject(projectId, (error) => {
      messaging.sendToProjectQueue(projectId,
        { uid, auth, reconnect: false, clientStatus: clientStatuses.AUTHORIZE });

      res.send({ status: 'OK', error });
    });
  }
}

module.exports = PublicAPIController;
