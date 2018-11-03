const RedisTransport = require('./redis');
const async = require('async');

class ActivityModel {
  constructor({ constantsEvents, config, logger, dbRedisCli, dbElasticCli, coreUtils }) {
    this.redis = new RedisTransport({
      dbRedisCli, dbElasticCli, config: config.ActivityHistoryService, logger,
    });
    this.constantsEvents = constantsEvents;
    this.coreUtils = coreUtils;
  }
/**
 *
 * @param {Array} data - array with json objects
 * @param {Function} callback
 */
  sendTransportMessage(data, callback) {
    this.redis.sendMessage(data.map(o => JSON.stringify(o)), callback);
  }

  /**
   *
   * @param {String} index
   * @param {String} key
   * @param {String} value
   * @param {Function} callback
   */
  setKeyValue(index, key, value, callback) {
    this.redis.client.hset(index, key, value, callback);
  }

  /**
   *
   * @param {String} index
   * @param {String} key
   * @param {String} value
   * @param {Function} callback
   */
  setnxKeyValue(index, key, value, callback) {
    let added = null;

    async.waterfall([
      (next) => { this.redis.client.hsetnx(index, key, value, next); },
      (v, next) => { added = !!v; this.redis.client.hget(index, key, next); },
    ], (err, v) => {
      if (err) return callback(err);
      callback(null, { added, value: v });
    });
  }

  /**
   *
   * @param {Object} data
   * @param {Function} callback
   */
  setAuthClientMap(data, callback) {
    async.waterfall([
      (next) => {
        if (!data.sessionHash || !data.timeEntry) {
          try {
            throw new Error(
              `Fields sessionHash or timeEntry are undefined, data: ${JSON.stringify(data)}`
            );
          } catch (err) { return next(err, null); }
        } else {
          this.setnxKeyValue('SESSION_HASH:TIME', data.sessionHash, data.timeEntry, next);
        }
      },
      (result, next) => {
        const { added: newEntry, value: timeEntry } = result;
        const mixin = { timeEntry };

        try {
          if (timeEntry.length !== 13) {
            throw new Error(`parameter timeEntry is broken ${timeEntry}`);
          }
        } catch (err) {
          return next(err, null);
        }
        if (newEntry) mixin.__createViaAuth = true;
        next(null, Object.assign(data, mixin));
      },
      (payload, next) => {
        this.setKeyValue(
          'UID:SESSION_HASH:TIME',
          payload.uid,
          `${payload.sessionHash}:${payload.timeEntry}`,
          err => next(err, payload)
        );
      },
    ], callback);
  }

  /**
   *
   * @param {Object} data
   * @param {Function} callback
   */
  destroyClientFromKey(data, callback) {
    async.waterfall([
      (next) => { this.getInfoByUID(data, next); },
      (res, next) => {
        const payload = Object.assign(data, res);
        const { sessionHash, timeEntry } = res;

        this.redis.client.hdel('UID:SESSION_HASH:TIME', payload.uid);
        this.redis.client.hdel('SESSION_HASH:TIME', sessionHash);
        return next(null, Object.assign(payload, { sessionHash, timeEntry }));
      },
    ], callback);
  }

  /**
   *
   * @param {Function} callback
   */
  drainRedisToElastic(callback) {
    return async.waterfall([
      (next) => { this.redis.renameAndMoveData(next); },
      (res, next) => { this.redis.drain(next); },
    ], callback);
  }

  /**
   *
   * @param {Object} data - object with uid
   * @param {Function} callback
   */
  getInfoByUID(data, callback) {
    const { uid } = data;

    if (!uid) {
      return callback({
        type: 'custom',
        msg: 'Uid doesn\'t exist',
        method: 'getInfoByUID',
        data: JSON.stringify(data),
      });
    }
    const [userId, projectId, ...socket] = uid.split('_');
    const socketId = socket.join('_') || null;
    const destroyType = [
      this.constantsEvents.DESTROY_INPUT,
      this.constantsEvents.DESTROY_OUTPUT,
      this.constantsEvents.SOCKET_CLOSE,
    ].includes(data.activityName);


    return async.waterfall([
      (next) => {
        if ((!socketId || destroyType) && data.sessionHash) {
          return this.redis.client.hget('SESSION_HASH:TIME', data.sessionHash, (err, timeEntry) => {
            if (!timeEntry) {
              /*
                return next({
                  type: 'custom',
                  msg: `Value for key ${uid} in SESSION_HASH:TIME doesn't exist`,
                  data: JSON.stringify(data),
                });
              */
              timeEntry = data.uidTimestamp;
            }

            return next(err, Object.assign({}, data, { timeEntry }));
          });
        }

        this.redis.client.hget('UID:SESSION_HASH:TIME', uid, (err, res) => {
          const customError = {
            type: 'custom',
            msg: `Value for key ${uid} in UID:SESSION_HASH:TIME doesn't exist`,
            data: JSON.stringify(data),
          };

          if (!res) return next(customError);

          try {
            const [sessionHash, timeEntry] = res.split(':');

            next(err, Object.assign({}, data, { timeEntry, sessionHash }));
          } catch (error) {
            return next(customError);
          }
        });
      },
      (res, next) => {
        const { sessionHash, timeEntry } = res;

        next(null, { sessionHash, timeEntry, userId, projectId, socketId });
      },
    ], (err, res) => {
      if (err && err.type === 'custom') {
        return callback({
          data,
          msg: err.msg,
          method: 'getInfoByUID',
          path: __dirname,
        });
      }

      callback(err, res);
    });
  }


}

module.exports = ActivityModel;
