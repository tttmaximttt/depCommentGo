const async = require('async');

class ClientService {

  /**
   * @param  {Constants} constantsEvents
   */
  constructor({ constantsEvents, elasticMessageModel, activityModel }) {
    this.constantsEvents = constantsEvents;
    this.elasticMessageModel = elasticMessageModel;
    this.activityModel = activityModel;
  }

  /**
   *
   * @param {Object} data
   * @param {Function} callback
   */
  prepareClientData(data, callback) {
    let result = null;

    try {
      const [userId, projectId, ...socket] = data.uid.split('_');
      const socketId = socket.join('_') || null;
      const timeEntry = data.timeEntry || data.actionTime;
      const sessionHash = data.sessionHash;

      result = Object.assign(data, { userId, projectId, timeEntry, sessionHash, socketId });
    } catch (err) {
      return callback(err);
    }
    if (!result.sessionHash) {
      return this.activityModel.getInfoByUID(
        result,
        (err, info) => callback(err, Object.assign(result, info))
      );
    }
    return callback(null, result);
  }

  /**
   * @param {Object} data
   * @param {Function} callback
   */
  initClient(data, callback) {
    async.waterfall([
      (next) => { this.prepareClientData(data, next); },
      (payload, next) => {
        if (payload.socketId && payload.uid) {
          this.activityModel.setKeyValue(
            'UID:SESSION_HASH:TIME',
            payload.uid,
            `${payload.sessionHash}:${payload.timeEntry}`,
            err => next(err, payload)
          );
        } else {
          next(null, payload);
        }
      },
      (payload, next) => {
        this.activityModel.setnxKeyValue(
          'SESSION_HASH:TIME',
          payload.sessionHash,
          payload.timeEntry,
          (err, o) => next(err, o, payload)
        );
      },
      (redisResponse, payload, next) => {
        const { added: newEntry } = redisResponse;
        const { clientType, appVersion, connection, device } = payload;
        const otherWise = clientType ?
          this.elasticMessageModel.updateClientSession(payload, {
            device,
            clientType,
            appVersion,
            connection,
          }) : [];
        const clientAction = newEntry ? this.elasticMessageModel.initClientSession(payload) : otherWise;
        const historyAction = this.elasticMessageModel.getMessage(payload);

        this.activityModel.sendTransportMessage([].concat(clientAction, historyAction), next);
      },
    ], callback);
  }

  /**
   * @param {Object} data
   * @param {Function} callback
   */
  authClient(data, callback) {
    async.waterfall([
      (next) => { this.prepareClientData(data, next); },
      (payload, next) => {
        this.activityModel.setAuthClientMap(payload, err => next(err, payload));
      },
      (payload, next) => {
        const authClientAction = this.elasticMessageModel.authClientAction(payload);
        const historyAction = this.elasticMessageModel.getMessage(payload);

        this.activityModel.sendTransportMessage([].concat(authClientAction, historyAction), next);
      },
    ], callback);
  }

  /**
   * @param {Object} data
   * @param {Function} callback
   */
  destroyClient(data, callback) {
    async.waterfall([
      (next) => { this.prepareClientData(data, next); },
      (payload, next) => {
        this.activityModel.destroyClientFromKey(payload, err => next(err, payload));
      },
      (payload, next) => {
        const destroyClientAction = this.elasticMessageModel.destroyClientAction(payload);
        const historyAction = this.elasticMessageModel.getMessage(payload);

        this.activityModel.sendTransportMessage(
          [].concat(destroyClientAction, historyAction),
          next
        );
      },
    ], callback);
  }

  /**
   * @param {Object} data
   * @param {Function} callback
   */
  setTimeoutStatus(data, callback) {
    async.waterfall([
      (next) => { this.activityModel.getInfoByUID(data, next); },
      (res, next) => {
        const payload = Object.assign(data, res);
        const clientTimeoutAction = this.elasticMessageModel.setClientTimeoutStatus(payload);
        const historyAction = this.elasticMessageModel.getMessage(payload);

        this.activityModel.sendTransportMessage(
          [].concat(clientTimeoutAction, historyAction),
          next
        );
      },
    ], callback);
  }

}

module.exports = ClientService;
