const _ = require('lodash');

const ERR_GROUP_SEPARATOR = '---';
const UNKNOWN_ACTIVITY = '';
const NO_METHOD = 'NO_METHOD';

module.exports = ({ phaseConstants }) => ({
  getSessionStatObject(total, getRate) {
    const rate = getRate(total);

    return {
      rate,
      count: total,
    };
  },

  cleanSessionStatObject(sessionStat) {
    delete sessionStat.hits;

    return sessionStat;
  },

  cleanSessionTimeoutStat(session) {
    delete session.beforeActed;
    delete session.afterActed;

    return session;
  },

  fillSessionTimeoutStat(sessions) {
    const { timeout, beforeActed, afterActed } = sessions;
    const beforeActedSessionHashList =
      _.get(beforeActed, 'hits.hits', []).map(s => _.get(s, '_source.sessionHash'));
    const afterActedSessionHashList =
      _.get(afterActed, 'hits.hits', []).map(s => _.get(s, '_source.sessionHash'));

    beforeActed.hashList = beforeActedSessionHashList;
    afterActed.hashList = afterActedSessionHashList;

    timeout.beforeActed = this.cleanSessionStatObject(beforeActed);
    timeout.afterActed = this.cleanSessionStatObject(afterActed);

    return this.cleanSessionTimeoutStat(sessions);
  },

  getSessionErrorGroupName(session) {
    const { WORKING } = phaseConstants;
    const workingStatus = _.get(session, `_source.phase.${WORKING}`);

    return workingStatus !== 'init' ?
      'beforeActed'
      :
      'afterActed';
  },

  getSessionErrorGroups(errors = []) {
    const groups = {};

    errors.forEach((error) => {
      const { entryActivityName = UNKNOWN_ACTIVITY, group = '', method = '' } = error;
      const key = `${group || entryActivityName}${ERR_GROUP_SEPARATOR}${method}`;

      if (!groups[key]) {
        groups[key] = [];
      }

      groups[key].push(error);
    });

    return groups;
  },

  mapSessionErrorStatGroup(statGroups, getRate) {
    return Object.keys(statGroups).map((groupName) => {
      const methods = {};
      const sessions = [];

      statGroups[groupName].forEach((group) => {
        const { method = NO_METHOD, sessionHash } = group;

        if (!methods[method]) {
          methods[method] = { count: 0 };
        }

        methods[method].count++;
        sessions.push(sessionHash);
      });

      Object.keys(methods).forEach((method) => {
        methods[method] = this.getSessionStatObject(methods[method].count, getRate);
      });

      return Object.assign({},
        this.getSessionStatObject(statGroups[groupName].length, getRate), {
          description: groupName,
          hashList: sessions,
          methods,
        },
      );
    });
  },

  fillSessionWarningStat(sessions, getRate) {
    const warningSessionStat = {};
    const warningSessions = _.get(sessions, 'warning.hits.hits', []);

    warningSessions.forEach((session) => {
      const { warningMessages, sessionHash } = _.get(session, '_source', {});
      const parsedWarningMessages = warningMessages.map(JSON.parse);
      const warningGroups = this.getSessionErrorGroups(parsedWarningMessages);

      Object.keys(warningGroups).forEach((_group) => {
        const [group = ''] = _group.split(ERR_GROUP_SEPARATOR);

        if (!warningSessionStat[group]) {
          warningSessionStat[group] = [];
        }

        warningSessionStat[group].push({ sessionHash });
      });
    });

    sessions.warning.list = this.mapSessionErrorStatGroup(warningSessionStat, getRate);

    return sessions;
  },

  fillSessionFailedStat(sessions, getRate) {
    const failedSessions = _.get(sessions, 'failed.hits.hits', []);
    const failedSessionsStat = {};

    failedSessionsStat.beforeActed = { list: {}, count: 0 };
    failedSessionsStat.afterActed = { list: {}, count: 0 };

    failedSessions.forEach((session) => {
      const { errorMessages, sessionHash } = _.get(session, '_source', {});
      const parsedErrorMessages = errorMessages.map(JSON.parse);
      const groupName = this.getSessionErrorGroupName(session);
      const errorGroups = this.getSessionErrorGroups(parsedErrorMessages);

      Object.keys(errorGroups).forEach((_group) => {
        const [group = '', method = ''] = _group.split(ERR_GROUP_SEPARATOR);

        if (!failedSessionsStat[groupName].list[group]) {
          failedSessionsStat[groupName].list[group] = [];
        }

        failedSessionsStat[groupName].count++;
        failedSessionsStat[groupName].list[group].push({ method, sessionHash });
      });
    });

    failedSessionsStat.beforeActed.list =
      this.mapSessionErrorStatGroup(failedSessionsStat.beforeActed.list, getRate);

    failedSessionsStat.afterActed.list =
      this.mapSessionErrorStatGroup(failedSessionsStat.afterActed.list, getRate);

    failedSessionsStat.beforeActed.rate = getRate(failedSessionsStat.beforeActed.count);
    failedSessionsStat.afterActed.rate = getRate(failedSessionsStat.afterActed.count);

    Object.assign(sessions.failed, failedSessionsStat);

    return sessions;
  },
});
