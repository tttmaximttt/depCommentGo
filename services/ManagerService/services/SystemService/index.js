const async = require('async');

class SystemService {
  /**
   * @param {Manager} messaging
   * @param {Memory} memory
   * @param {LogSystem} logSystem
   * @param {Object} constantsEvents
   * @param {WebhookModel} webhookModel
   */
  constructor({ messaging, memory, logSystem, constantsEvents, webhookModel, errorFactory }) {
    this.messaging = messaging;
    this.memory = memory;
    this.logSystem = logSystem;
    this.constantsEvents = constantsEvents;
    this.webhookModel = webhookModel;
    this.errorFactory = errorFactory;
  }

  removeQueue({ projectId }, callback) {
    const { memory, messaging, logSystem, constantsEvents, errorFactory } = this;

    async.waterfall([
      next => async.parallel({
        projectClients: async () => memory.projectData.getByItemId(projectId, memory.projectData.projectClients),
        removeMessages: done => memory.queueRemove.decr(projectId, done),
      }, next),
      async ({ projectClients, removeMessages }) => {
        /*
        * If there are no clients, projectClients.length should be 0 and removeMessages <= 0
        */
        if ((!projectClients || !projectClients.length) && removeMessages <= 0) {
          messaging.unbindProject(projectId, true);
          logSystem.info(constantsEvents.MESSAGING_QUEUE_REMOVED, {
            projectId, message: 'queue data removed upon last client',
          });
          return memory.queueRemove.remove(projectId);
        }
        return false;
      },
    ], (err, removed) => {
      if (err) {
        const error = errorFactory.systemError(err, { projectId }, 'SystemService.removeQueue');

        logSystem.error(error.group, { ...error });
      } else {
        logSystem.info(
          constantsEvents.SYSTEM_MESSAGE_HANDLED,
          {
            projectId,
            removed,
            message: 'removeQueue system event handled successful',
          });
      }
      // call callback in any case
      callback();
    });
  }

  runWebhook(hookId, hookData) {
    const { webhookModel } = this;

    webhookModel.run(hookId, hookData);
  }

}

module.exports = SystemService;
