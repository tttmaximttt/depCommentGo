const _ = require('lodash');

module.exports = ({
  userConstants,
}) => ({
  statsTemplate: {
    totalSessions: 0,
    totalProjects: 0,
    totalUsers: 0,
    projectIds: {},
    userIds: {},
    ctorSaveMap: {},
    projectUniqueOperations: {},
  },

  getStatsTemplate() {
    return Object.assign({}, this.statsTemplate);
  },

  _getUserType({ email, paid }) {
    if (paid) {
      return userConstants.USER_TYPES.PAID;
    } else if (email) {
      return userConstants.USER_TYPES.REGISTERED;
    }

    return userConstants.USER_TYPES.NEW;
  },

  getViewerInfo({ email, paid, sourceType, modeLabel }) {
    const userType = this._getUserType({ email, paid });

    return {
      userType,
      sourceType,
      modeLabel,
    };
  },

  getUniqueOperations({ toolsOperations }) {
    const uniqueOperations = {};

    toolsOperations.forEach((operation) => {
      uniqueOperations[operation] = _.get(toolsOperations, operation, 0) + 1;
    });

    return uniqueOperations;
  },

  cleanStatsObject(statsObject) {
    delete statsObject.projectIds;
    delete statsObject.userIds;
    delete statsObject.ctorSaveMap;
  },

  fillStatsObject(statsObject, { userId, projectId, uniqueTools, actions, index }) {
    if (!statsObject[index]) statsObject[index] = this.getStatsTemplate();

    statsObject[index].userIds[userId] = userId;
    statsObject[index].projectIds[projectId] = uniqueTools;
    statsObject[index].totalSessions++;

    if (actions.constructor_save) statsObject[index].ctorSaveMap[projectId] = uniqueTools;
  },

  countStatsObject(statsObject) {
    const { projectIds, userIds } = statsObject;
    const ctorSaveMap = Object.keys(statsObject.ctorSaveMap).length;
    const toolsOperations = _.flatten(_.values(projectIds));
    const userTypeUniqueOperations = this.getUniqueOperations({ toolsOperations });

    statsObject.totalUsers = Object.keys(userIds).length;
    statsObject.totalProjects = Object.keys(projectIds).length;
    statsObject.projectUniqueOperations = Object.assign({
      constructor: ctorSaveMap,
    }, userTypeUniqueOperations);

    this.cleanStatsObject(statsObject); // cleanStatsObject - mutates the object
  },
});
