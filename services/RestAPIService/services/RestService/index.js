const { get, isUndefined } = require('lodash/fp');
const Promise = require('bluebird');
const geoip = require('geoip-lite');
const _ = require('lodash');

class RestService {

  /**
   * @param {LogSystem} logSystem
   * @param {Object} constantsEvents
   * @param {Object} restAPIConstants
   * @param {Object} activityHistoryConstants
   * @param {Object} messaging
   * @param {CoreUtils} coreUtils
   * @param {Memory} memory
   * @param {Phase} phase
   */
  constructor({
    logSystem, constantsEvents, restAPIConstants, activityHistoryConstants,
    messaging, coreUtils, memory, phase, dbRemote,
  }) {
    this.logSystem = logSystem;
    this.constantsEvents = constantsEvents;
    this.restAPIConstants = restAPIConstants;
    this.channel = activityHistoryConstants.channel;
    this.messaging = messaging;
    this.coreUtils = coreUtils;
    this.dbRemote = dbRemote;
    this.memory = memory;
    this.phase = phase;

    this.requests = {};
  }

  async activateEnv() {
    try {
      return Promise.all([
        this.memory.destroyResult.clear(),
        this.memory.isDeactivatedEnv.clear(),
      ]);
    } catch (err) {
      throw err;
    }
  }

  async flushRedis() {
    const destroyResult = await this.memory.destroyResult.get();

    await this.memory.dbMemory.flushallAsync();
    await this.memory.destroyResult.add(destroyResult);
    await this.memory.isDeactivatedEnv.deactivate();
  }

  /**
   * @param  {Object} req
   * @param  {Object} res
   */
  initSession(req, res) {
    const client = req.body;
    const ip = this.coreUtils.getCallerIP(req);
    const headers = JSON.stringify(req.headers);
    const geo = Object.assign({ ip, headers }, geoip.lookup(ip));
    const { UNAUTHORIZED, INVALID_REQUEST_BODY, CLIENT_NOT_CREATED,
      INTERNAL_SERVER_ERROR, CLIENT_CREATED } = this.restAPIConstants;
    const { SESSION_INIT } = this.constantsEvents;

    if (!client.sessionHash || !client.projectId || !client.viewerId) {
      res.writeHead(UNAUTHORIZED);
      return res.end(INVALID_REQUEST_BODY);
    }

    const sessionInitData = {
      activityName: this.constantsEvents.SESSION_INIT,
      sessionHash: client.sessionHash,
      uid: `${client.viewerId}_${client.projectId}`,
      browser: client.browser,
      os: client.os,
      geo,
      channel: this.channel.CLIENT,
      phase: this.phase.create({ point: SESSION_INIT }),
    };

    const logResult = this.logSystem.info(
      SESSION_INIT,
      sessionInitData,
    );

    if (isUndefined(get('error', logResult))) {
      return res.end(JSON.stringify({ status: CLIENT_CREATED }));
    }

    res.writeHead(INTERNAL_SERVER_ERROR);
    return res.end(JSON.stringify({ status: CLIENT_NOT_CREATED }));
  }

  /**
   * @param  {Object} res
   * @param  {Object} msg
   */
  signatures(msg, res) {
    const { constantsEvents, messaging } = this;

    messaging.pushManagerJob(constantsEvents.SIGNATURES, msg);

    return res.end('OK');
  }

  /**
   * @param  {Object} req
   * @param  {Object} res
   */
  getProjectDocument(req, res) {
    const { constantsEvents, messaging, logSystem } = this;
    const { REST_DOCUMENT_CONTENT_REQUEST,
      REST_DOCUMENT_CONTENT_RESPONSE } = constantsEvents;
    const { projectId } = req.params;
    const { userId } = req.query;

    if (!projectId) {
      return res.end('projectId required');
    }

    const replyTo = messaging.queue;
    const requestId = `${REST_DOCUMENT_CONTENT_REQUEST}_${projectId}`;

    this.requests[requestId] = { req, res };

    const meta = {
      replyTo,
      projectId,
      requestId,
      responseEvent: REST_DOCUMENT_CONTENT_RESPONSE,
    };

    messaging.pushManagerJob(
      REST_DOCUMENT_CONTENT_REQUEST,
      {
        projectId,
        viewerId: userId,
      },
      meta
    );

    logSystem.info(REST_DOCUMENT_CONTENT_REQUEST, { projectId, userId });
  }

  async getDestroyStatus() {
    try {
      const deactivated = !!(await this.memory.isDeactivatedEnv.get());

      const destroyResult = await this.memory.destroyResult.get() || {};
      const pending = deactivated && _.isEmpty(destroyResult.errored || []) ?
        await this._getProjectUserData() :
        {};
      let status = 'Active';

      if (deactivated) status = Object.keys(pending).length ? 'Deactivating' : 'Inactive';

      Object.keys(pending).forEach((key) => {
        const item = pending[key];

        pending[key] = [];
        item.forEach(uid => pending[key].push(this.memory.uid.getIds(uid).userId));
      });

      const result = Object.assign({}, destroyResult, { deactivated, pending, status });

      return result;
    } catch (err) {
      throw err;
    }
  }

  async _getProjectUserData() {
    try {
      const projectKeys = await this.memory.dbMemory.keysAsync('*PROJECT_DATA*') || [];
      const projectIds = projectKeys.map((key) => {
        const projectId = key.replace('PROJECT_DATA_', '');

        return Number(projectId) ? Number(projectId) : projectId;
      });

      const projectUserMap = {};

      await Promise.each(projectIds, async (projectId) => {
        const projectClients = await this.memory.projectData.getByItemId(
          projectId,
          this.memory.projectData.projectClients);

        projectUserMap[projectId] = projectClients;
      });

      return projectUserMap;
    } catch (err) {
      throw err;
    }
  }

  async destroyAllUsersInProject(location, projectId) {
    try {
      const projectClients = await this.memory.projectData.getByItemId(
        projectId,
        this.memory.projectData.projectClients
      ) || [];
      const userIdsList = await this.broadcastProjectBusy(
        projectId,
        projectClients,
        location,
        false);

      return userIdsList;
    } catch (err) {
      throw err;
    }
  }

  async destroyByUserId(location, projectId, userId) {
    try {
      const projectClientsRaw = await this.memory.projectData.getByItemId(
        projectId,
        this.memory.projectData.projectClients
      ) || [];
      const projectClients = projectClientsRaw.filter((uid) => {
        const userIdFromUid = +this.memory.uid.getUserId(uid);

        return userIdFromUid === +userId;
      });
      const userIdsList = await this.broadcastProjectBusy(
        projectId,
        projectClients,
        location,
        false);


      return userIdsList;
    } catch (err) {
      throw err;
    }
  }

  async destroyAll(location, isDeactivate) {
    try {
      if (isDeactivate) await this.memory.isDeactivatedEnv.deactivate();
      const projectKeys = await this.memory.dbMemory.keysAsync('*PROJECT_DATA*') || [];
      const projectIds = projectKeys.map((key) => {
        const projectId = key.replace('PROJECT_DATA_', '');

        return Number(projectId) ? Number(projectId) : projectId;
      });

      const projectUserMap = await this._getProjectUserData();
      const result = {};

      await Promise.each(
        Object.keys(projectUserMap),
        async (projectId) => {
          const userIdsList = await this.broadcastProjectBusy(
            projectId,
            projectUserMap[projectId],
            location,
            isDeactivate);

          result[projectId] = userIdsList;
        });

      await this.memory.destroyResult.add({
        totalProjectCount: projectIds.length,
        projectClientsTotal: JSON.stringify(result),
        status: 'Deactivating',
        errored: '{}',
        time: new Date(),
      });

      return await this.memory.destroyResult.get();
    } catch (err) {
      throw err;
    }
  }

  sendProjectDocument(payload, data) {
    const { requestId, projectId } = data;
    const { res } = this.requests[requestId];

    if (res) {
      const { logSystem, constantsEvents } = this;

      res.end(JSON.stringify(payload));
      logSystem.info(constantsEvents.REST_DOCUMENT_CONTENT_RESPONSE, { projectId });
    }
  }

  async broadcastProjectBusy(projectId, uidList = [], location, isDeactivate) {
    try {
      const { messaging, constantsEvents } = this;
      const { WS_PDF } = constantsEvents;
      const totalClientsCount = +(await this.memory
        .destroyResult
        .get('totalClientsCount')) + uidList.length;

      await this.memory.destroyResult.update('totalClientsCount', totalClientsCount);

      const message = {
        destroy: true,
        location,
        params: {
          rest: isDeactivate,
          force: true,
          location,
          destroyType: 'save',
        },
      };

      setTimeout(async () => {
        const errIds = [];
        const projectClients = await this.memory.projectData.getByItemId(
          projectId,
          this.memory.projectData.projectClients
        ) || [];

        await Promise.map(uidList, async (client) => {
          const { userId } = this.memory.uid.getIds(client);
          const crossEditorHost = await this.memory.crossEditor.getMiddleware(client);

          messaging.publish(
            constantsEvents.SEND_TO_PROJECT,
            `${WS_PDF}.${projectId}`,
            Object.assign({}, message, { location, uid: client, force: true }));

          this.dbRemote
            .setHost(crossEditorHost)
            .editorDestroy(userId, projectId, false, {}, {}, (err, res) => {
              if (err) {
                this.logSystem.error(
                  'DEACTIVATION_BY_TIMEOUT_ERROR',
                  { uid: client, error: err });
              }

              if (res.result === 'success') {
                this.logSystem.info(
                  'DEACTIVATION_BY_TIMEOUT_SUCCESSFUL',
                  { uid: client });
                this.flushRedis();
              } else {
                this.logSystem.error(
                  'DEACTIVATION_BY_TIMEOUT_FAIl',
                  { uid: client, apiResult: res });
              }
            });
          if (projectClients && projectClients.includes(client)) errIds.push(userId);
        });

        const { errored = {} } = await this.memory.destroyResult.get() || {};

        errored[projectId] = errIds;
        await this.memory.destroyResult.update('errored', JSON.stringify(errored));
        await this.memory.destroyResult.update('pending', {});
        this.logSystem.debug('DESTROYED_BY_TIMEOUT', { projectId });
      }, this.restAPIConstants.DISCONNECT_TIMEOUT);


      const userIds = await Promise.map(uidList, async (client) => {
        const newMessage = Object.assign({}, message, { location, uid: client });

        await messaging.sendToProjectQueue(
          projectId,
          newMessage);
        const [userId] = client.split('_');

        return userId;
      });

      return userIds;
    } catch (err) {
      throw err;
    }
  }

  runWebhook(req, res) {
    const { restAPIConstants, messaging, logSystem, constantsEvents } = this;
    const { BAD_REQUEST } = restAPIConstants;
    const { hookId, managerQueue } = req.params;

    if (!hookId || !managerQueue || !req.body) {
      res.writeHead(BAD_REQUEST);
      return res.end();
    }

    res.end('OK');
    messaging.sendToManagerService(managerQueue, hookId, req.body);
    logSystem.info(constantsEvents.RUN_WEBHOOK, { hookId, managerQueue, data: req.body });
  }
}

module.exports = RestService;
