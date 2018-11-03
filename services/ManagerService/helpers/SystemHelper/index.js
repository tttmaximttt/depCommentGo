const { ManagerService } = require('config');

const { maxSocketServiceMessageTime } = ManagerService;

class SystemHelper {

  /**
   * @param {Number} messageTime
   * @returns {Number} message age
   */
  isOldMessage(messageTime) {
    const age = Date.now() - messageTime;

    return age >= maxSocketServiceMessageTime ? age : 0;
  }
}

module.exports = SystemHelper;
