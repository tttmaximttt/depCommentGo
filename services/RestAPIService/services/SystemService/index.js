
class SystemService {

  /**
   * @param {Rest} messaging
   * @param {Object} constantsEvents
   */
  constructor({ messaging, constantsEvents }) {
    this.messaging = messaging;
    this.constantsEvents = constantsEvents;
  }

  /**
   * @param  {Object} req
   * @param  {Object} res
   */
  startProjectWatcher(req, res) {
    const { constantsEvents, messaging } = this;

    messaging.publish(constantsEvents.MANAGER_SERVICE, '', {
      system: { projectWatcher: true },
    });

    res.send({ result: 'success' });
  }

}

module.exports = SystemService;
