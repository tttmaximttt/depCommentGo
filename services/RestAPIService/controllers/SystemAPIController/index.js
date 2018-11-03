class SystemAPIController {

    /**
     * @param {RestService} restService
     * @param {RedisService} redisService
     * @param {ActivityService} activityService
     * @param {LogSystem} logSystem
     * @param {Object} constantsEvents
     * @param {SystemService} systemService
     */
  constructor({
      redisService, activityService, systemService,
    }) {
    this.redisService = redisService;
    this.activityService = activityService;
    this.systemService = systemService;
  }

    /**
     * @param  {Object} req
     * @param  {Object} res
     */
  redisKeys(req, res) {
    this.redisService.redisKeys(req, res);
  }

    /**
     * @param  {Object} req
     * @param  {Object} res
     */
  redisExecute(req, res) {
    this.redisService.redisExecute(req, res);
  }

    /**
     * @param  {Object} req
     * @param  {Object} res
     */
  drainActivity(req, res) {
    this.activityService.drainActivity(req, res);
  }

    /**
     * @param  {Object} req
     * @param  {Object} res
     */
  startProjectWatcher(req, res) {
    this.systemService.startProjectWatcher(req, res);
  }
}

module.exports = SystemAPIController;
