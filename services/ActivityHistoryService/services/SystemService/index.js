class OperationService {

  /**
   * @param  {Constants} constantsEvents
   */
  constructor({ constantsEvents, activityModel }) {
    this.constantsEvents = constantsEvents;
    this.activityModel = activityModel;
  }

  /**
   * @param {Function} callback
   */
  drainRedisToElastic(callback) {
    return this.activityModel.drainRedisToElastic(callback);
  }

}

module.exports = OperationService;
