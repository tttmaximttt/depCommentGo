const Promise = require('bluebird');
const Redis = require('redis');
const fs = require('fs');
const proxyHandler = require('./metricsHandler').handler;
const { compress, uncompress } = require('./compression');
const async = require('async');

Promise.promisifyAll(Redis.RedisClient.prototype);
Promise.promisifyAll(Redis.Multi.prototype);

const { get } = require('lodash');

const REDIS_ERROR = 'Redis select database Error';

class RedisData extends Redis.RedisClient {

  static getRedisClient(config, metrics) {
    if (!RedisData.instance) {
      RedisData.instance = new RedisData(config, metrics);
    }

    return RedisData.instance;
  }

  constructor(config = {}, metrics) {
    super(config);
    this.select(config.database || 0, (err) => {
      if (err) throw new Error(REDIS_ERROR);
    });

    this.client = this; // TODO костыль :(
    this.metrics = metrics;

    return new Proxy(this, proxyHandler);
  }

  set(key, value, ttl, cb) {
    async.waterfall([
      callback => compress(value, callback),
      (compressValue, callback) => {
        const requestCallback = (err, status) => {
          if (typeof ttl === 'function') {
            callback = ttl;
          }

          if (err) return callback(err);
          callback(null, !!status);
        };

        if (ttl && typeof ttl !== 'function') {
          return super.set(key, value, 'ex', ttl, requestCallback);
        }

        super.set(key, value, requestCallback);
      },
    ], cb);
  }

  get(key, callback) {
    async.waterfall([
      cb => super.get(key, cb),
      (result, cb) => uncompress(result, cb),
    ], callback);
  }

  incr(key, cb) {
    super.incr(key, (err, result) => {
      if (err) return cb(err);
      cb(null, result);
    });
  }

  remove(key, cb) {
    super.del(key, (err, result) => {
      if (err) return cb(err);
      cb(null, !!result);
    });
  }

  lpush(key, value, ttl, cb) {
    if (typeof ttl === 'function') {
      cb = ttl;
    }
    super.lpush(key, value, (err, result) => {
      if (err) return cb(err);
      cb(null, result);
    });
  }

  rpush(key, value, ttl, cb) {
    if (typeof ttl === 'function') {
      cb = ttl;
    }
    super.rpush(key, value, (err, result) => {
      if (err) return cb(err);
      cb(null, result);
    });
  }

  lrem(key, value, cb) {
    super.lrem(key, 1, value, (err, result) => {
      if (err) return cb(err);
      cb(null, result);
    });
  }

  lrange(key, from, to, cb) {
    if (typeof from === 'function') {
      cb = from;
      from = 0;
      to = -1;
    }
    super.lrange(key, from, to, (err, result) => {
      if (err) return cb(err);
      cb(null, result);
    });
  }

  drop(cb) {
    super.flushall((err, result) => {
      if (err) return cb(err);
      cb(null, !!result);
    });
  }

  /**
   * @param fileName
   * @param [encoding]
   * @param [callback]
   */

  loadScriptFile(fileName, encoding, callback) {
    if (typeof encoding !== 'string') {
      if (typeof encoding === 'function') {
        callback = encoding;
      }

      encoding = 'utf8';
    }

    fs.readFile(fileName, encoding, (err, content) => {
      if (err) return callback(err);
      super.multi([['script', 'load', content]]).exec((error, res) => {
        if (error) return callback(error);
        callback(null, res[0]);
      });
    });
  }

  end(fllush) {
    RedisData.instance = null;
    return super.end(fllush);
  }

  evalsha(sha1, args, callback) {
    const req = ['evalsha', sha1, args.length].concat(args);

    super.multi([req]).exec((err, res) => {
      if (err) {
        callback(err);
      } else if (get(res, '[0].code') === 'ERR') {
        callback(res);
      } else {
        callback(null, res[0]);
      }
    });
  }
}

module.exports = RedisData.getRedisClient;

