const async = require('async');
const elastic = require('./elastic-search');

class RedisTransport {

  constructor({ dbRedisCli, dbElasticCli, config, logger }) {
    this.config = config.redis.transport;
    this.logger = logger;

    this.redisClient = dbRedisCli;
    this.elasticClient = elastic({ dbElasticCli, logger });
  }

  get client() { return this.redisClient; }

  get elasticIndexKey() {
    return this.config.transportKey + Date.now();
  }

  /**
   * @param  {Array} msg
   * @param  {Function} cb
   */
  sendMessage(msg, cb = () => {}) {
    async.waterfall([
      (next) => { this.redisClient.rpush(this.config.key, msg, next); },
      (res, next) => { this.redisClient.llen(this.config.key, next); },
    ], (err, res) => {
      if (err) return cb(err);
      if (!this.ttlHandler) this.setIndexTTLHandler();
      if (res >= this.config.maxIndexItems) {
        const callback = this.errorHandler.bind(this);

        this.renameAndMoveData(callback);
      }
      cb(null, { msg, key: this.config.key, len: res });
    });
  }

  /**
   * @param  {Function} cb
   */
  renameIndex(cb = () => {}) {
    clearTimeout(this.ttlHandler);
    this.ttlHandler = null;
    const index = this.elasticIndexKey;

    async.waterfall([
      (next) => { this.redisClient.rename(this.config.key, index, next); },
      (res, next) => { this.redisClient.hset(this.config.transportKeys, index, Date.now(), next); },
    ], (err) => {
      if (err) return cb(err);
      cb(null, index);
    });
  }

  /**
   * @param  {Function} cb
   */
  renameAndMoveData(cb = () => { }) {
    async.waterfall([
      (next) => {
        this.renameIndex(next);
      },
    ], (err, index) => {
      if (err) return cb(err);
      return this.moveIndexToElastic(index, cb);
    });
  }

  /**
   * @param  {String} index
   * @param  {Function} cb
   */
  moveIndexToElastic(index, callback = () => { }) {
    async.waterfall([
      (next) => {
        this.redisClient.lrange(index, 0, -1, (err, data) => {
          if (err) return next(err);

          try {
            data = data.map(JSON.parse);
          } catch (error) {
            err = error;
          }
          next(err, data);
        });
      },
      (data, next) => {
        this.elasticClient.bulkSend(data, (err) => {
          if (err) return next(err);
          this.redisClient.hdel(this.config.transportKeys, index);
          this.redisClient.del(index, next);
        });
      },
    ], callback);
  }

  /**
   * @param  {Number} ttl
   */
  setIndexTTLHandler(ttl = this.config.ttl) {
    const cb = this.errorHandler.bind(this);

    this.ttlHandler = setTimeout(this.renameAndMoveData.bind(this, cb), ttl);
  }

  /**
   * @param  {Object} err
   */
  errorHandler(err) {
    if (err) {
      this.logger.error(
        'ActivityHistory:',
        { msg: 'Error callback for redis method renameAndMoveData ', err }
      );
    }
  }

  /**
   * @param  {Function} cb
   */
  drain(cb = () => {}) {
    async.waterfall([
      (next) => {
        this.redisClient.hkeys(this.config.transportKeys, next);
      },
      (keys, next) => {
        const self = this;

        async.parallel(keys.map(i => (() => self.moveIndexToElastic(i))), next);
      },
    ], (err, data) => {
      if (err) return cb(err);
      cb(null, { msg: 'Redis was drained', data });
    });
  }

}

module.exports = RedisTransport;
