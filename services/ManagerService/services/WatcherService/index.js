const _ = require('lodash');

module.exports = class WatcherService {

  /**
   * @param {Manager} messaging
   * @param {OperationsModel} operationsModel
   * @param {LogSystem} logSystem
   * @param {Object} config
   * @param {Object} constantsEvents
   * @param {CoreUtils} coreUtils
   * @param {LuaModel} luaModel
   */
  constructor({ messaging, operationsModel, logSystem, config, constantsEvents,
    coreUtils, luaModel, errorFactory,
  }) {
    this.messaging = messaging;
    this.operationsModel = operationsModel;
    this.logSystem = logSystem;
    this.config = config;
    this.constantsEvents = constantsEvents;
    this.coreUtils = coreUtils;
    this.luaModel = luaModel;
    this.errorFactory = errorFactory;
  }

  /**
   * @param {Function} timeoutAction - action executed on idle clients after interval
   */
  watchIdleProjects(timeoutAction) {
    const { disconnectTimeout, checkInterval } = this.config.ManagerService.projectsWatcher;

    return setInterval(this.idleProjectsChecker(disconnectTimeout, timeoutAction), checkInterval);
  }

  /**
   *
   * @param {number} maxSessionTime - unix timestamp
   * @param {function} timeoutAction - function
   * @returns {function()}
   */
  idleProjectsChecker(maxSessionTime, timeoutAction) {
    const { constantsEvents, logSystem, messaging, luaModel, errorFactory } = this;

    return () => {
      const checkTime = Date.now();
      const projects = messaging.getProjects();
      const projectIds = _.map(projects, 'projectId');

      luaModel.getEmptyProjectIds(projectIds, (err, emptyProjectIds = []) => {
        if (err) {
          const error = errorFactory.systemError(err, null, 'WatcherService.idleProjectsChecker');

          logSystem.error(error.group, { ...error });
        }

        !_.isEmpty(emptyProjectIds) && logSystem.debug(constantsEvents.START_IDLE_PROJECT_CLEANUP, {
          projectIds: emptyProjectIds,
        });
        projects.forEach(({ projectId, createTime }) => {
          const sessionTime = checkTime - createTime;
          const projectIsEmpty = emptyProjectIds.includes(projectId);

          if (sessionTime > maxSessionTime && projectIsEmpty) {
            logSystem.info(constantsEvents.FOUND_IDLE_PROJECT, { projectId, sessionTime });
            timeoutAction(projectId);
          }
        });
      });
    };
  }
};
