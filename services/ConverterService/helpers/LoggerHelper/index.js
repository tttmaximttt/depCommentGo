class LoggerHelper {

  /**
   * @param logSystem
   * @param constantsEvents
   * @param {object} activityHistoryConstants
   */
  constructor({ logSystem, activityHistoryConstants, errorFactory }) {
    this.logSystem = logSystem;
    this.channel = activityHistoryConstants.channel;
    this.errorFactory = errorFactory;
  }

  /**
   * @param  {Object} data
   * @param  {String} data.uid
   * @param  {String} data.projectId
   * @param  {Function} callback
   */
  conversionCallback({ uid, projectId }, callback) {
    const { logSystem, errorFactory } = this;

    return (errors, result) => {
      if (result) {
        if (errors) {
          let data = { errors };

          if (uid) {
            data = Object.assign({ uid }, data);
          } else if (projectId) {
            data = Object.assign({ projectId }, data);
          }

          const error = errorFactory.conversionError(
            data,
            null,
            'LoggerHelper.conversionCallback'
          );

          logSystem.error(error.group, { ...error });
        }

        return callback(null, result);
      }

      callback(errors, result);
    };
  }
}

module.exports = LoggerHelper;
