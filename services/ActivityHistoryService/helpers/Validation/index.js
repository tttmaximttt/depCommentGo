const _ = require('lodash');


class Validation {

  constructor({ activityConstants, constantsEvents }) {
    const { channel } = activityConstants;

    this.channelConstants = channel;
    this.constantsEvents = constantsEvents;
  }

  /**
   * @param {Object} data - json object
   */
  verify(data) {
    const keys = ['activityName', 'uid', 'channel'];
    const sessionEventsList = [
      this.constantsEvents.AUTH_INPUT,
      this.constantsEvents.AUTH_OUTPUT,
      this.constantsEvents.DESTROY_INPUT,
      this.constantsEvents.DESTROY_OUTPUT,
      this.constantsEvents.SESSION_UPDATE,
    ];

    function exit() {
      const actionTime = data.actionTime || Date.now();

      return Object.assign(data, { actionTime });
    }
    try {
      if (!_.isObject(data)) throw new Error(`Activity event data not an Object ${data}`);

      if (!keys.every(key => key in data)) {
        throw new Error(
          `Missing required fields. Activity event data is not full, data: ${JSON.stringify(data)}`
        );
      }
      if (_.values(this.channelConstants).indexOf(data.channel) < 0) {
        throw new Error(
          `Activity event data has wrong channel type, data: ${JSON.stringify(data)}`
        );
      }
      if (!data.sessionHash && sessionEventsList.indexOf(data.activityName) > -1) {
        JSON.stringify(data).replace(/^.*?sessionHash":"(\w+).*?$/, (str, value) => {
          if (value) data.sessionHash = value;
        });
      }
      exit();
    } catch (err) {
      return err;
    }
  }
}

module.exports = Validation;
