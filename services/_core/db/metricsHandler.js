const metrics = {
  thisReceive: ['get', 'rpop', 'lpop', 'llen', 'lrange'],
  thisSend: ['set', 'incr', 'keys', 'lpush', 'rpush', 'lrem'],
  excluded: ['end'],
  handle(target, name) {
    return (...args) => {
      const lastIndex = args.length - 1;
      const callback = typeof args[lastIndex] === 'function' ? args[lastIndex] : () => {};
      const [key, val] = args;

      if (this.thisReceive.includes(name) && !this.excluded.includes(name)) {
        args[lastIndex] = (error, value) => { // callback reassigning here
          if (value) {
            try {
              if (typeof value !== 'string' && name === 'set') value = JSON.stringify(value);
            } catch (err) {
              return callback(err, null);
            }

            target.metrics && target.metrics.redisTraffic(
              key,
              (value && value.length) || '0',
              true);
          }

          callback(error, value);
        };
      } else if (this.thisSend.includes(name) && !this.excluded.includes(name)) {
        target.metrics && target.metrics.redisTraffic(
          key,
          (val && val.length) || '0',
          false
        );
      }
      return target[name].call(target, ...args);
    };
  },
};

const handler = {
  get(target, name) {
    if (typeof target[name] === 'function') {
      return metrics.handle(target, name);
    }
    return target[name];
  },
};

module.exports = { handler };
