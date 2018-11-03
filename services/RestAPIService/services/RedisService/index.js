class RedisService {

  /**
   * @param {LogSystem} logSystem
   * @param {Object} constantsEvents
   * @param {Memory} memory
   * @param {Object} restAPIConstants
   * @param {CoreUtils} coreUtils
   */
  constructor({ logSystem, constantsEvents, memory, restAPIConstants, coreUtils, config }) {
    this.logSystem = logSystem;
    this.constantsEvents = constantsEvents;
    this.memory = memory;
    this.restAPIConstants = restAPIConstants;
    this.coreUtils = coreUtils;
    this.config = config;
  }

  async redisKeys(req, res) {
    try {
      let keys = await this.memory.redisTools.keys('*');

      if (!keys) return res.end(JSON.stringify(keys));
      keys = keys.map(k => k.replace(/_\d+/g, '')).reduce((m, x) => {
        m[x] = m[x] || 0;
        m[x] += 1;
        return m;
      }, {});

      return res.end(JSON.stringify(keys));
    } catch (err) {
      const { INTERNAL_SERVER_ERROR } = this.restAPIConstants;

      if (err) {
        res.writeHead(INTERNAL_SERVER_ERROR);
        return res.end(this.coreUtils.stringifyError(err));
      }
    }
  }

  async redisExecute(req, res) {
    try {
      const { BAD_REQUEST } = this.restAPIConstants;

      if (!req.body) {
        res.writeHead(BAD_REQUEST);
        return res.end({ msg: 'Incorrect query parameters' });
      }
      let data = await this.memory.redisTools.exec(req.body.query);

      if (data) {
        data = JSON.stringify(data);
      }

      res.end(data);
    } catch (err) {
      const { INTERNAL_SERVER_ERROR } = this.restAPIConstants;

      if (err) {
        res.writeHead(INTERNAL_SERVER_ERROR);
        return res.end(this.coreUtils.stringifyError(err));
      }
    }
  }
}

module.exports = RedisService;
