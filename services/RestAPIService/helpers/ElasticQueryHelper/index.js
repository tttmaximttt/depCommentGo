const _ = require('lodash');
const queries = require('./queries');
const filters = require('./filters');

module.exports = ({
  coreUtils,
  config,
  dbElasticCli,
  operationStatsHelper,
  modeLabelConstants,
}) => ({

  elasticQueries: queries,

  /**
   * Two object during merge
   *
   * @param {Object} objValue
   * @param {Object} srcValue
   */
  mergeArrayCustomizer(objValue, srcValue) {
    if (_.isArray(objValue)) {
      return objValue.concat(srcValue);
    }
  },

  getElasticFilterQuery(data) {
    const filter = [];
    const dataKeys = Object.keys(data);
    const filterKeys = Object.keys(filters);

    if (!dataKeys.length) return {};

    filterKeys.forEach((filterKey) => {
      if (data[filterKey]) {
        filter.push({
          query_string: {
            query: `${filterKey}:${data[filterKey]}`,
          },
        });
      }
    });

    if (!filter.length) return {};

    return { query: { bool: { must: filter } } };
  },

  /**
   * Common response handler from ElasticSearch
   *
   * @param {Object} data
   */
  elasticListResponse(data) {
    data = Object.assign({}, data.hits, { max_score: undefined });
    data.hits = _.get(data, 'hits', []).map((hit) => {
      hit = hit._source;
      if (hit.info) hit.info = JSON.parse(hit.info);
      return hit;
    });
    return JSON.stringify(data);
  },

  /**
   *
   * @param {Object} data
   */
  failedSessionsHandler(data) {
    return _.groupBy(data.map(session => ({
      phase: `${session.phase.enter}/${session.phase.working}/${session.phase.exit}`,
      sessionHash: session.sessionHash,
    })), 'phase');
  },

  /**
   *
   * @param {Object} data
   */
  errorSessionsHandler(data) {
    let tmp = [];

    function normalizeToSessionHashList(payload) {
      Object.keys(payload).forEach((key) => {
        const res = payload[key].map(o => o.sessionHash);

        payload[key] = _.uniq(res);
      });
      return payload;
    }

    data.hits.forEach((hit) => {
      Object.values(hit.errorMessages).map((errMsg) => {
        const { sessionHash } = hit;

        errMsg = JSON.parse(errMsg);
        return tmp.push({
          sessionHash,
          message:
            `${_.get(errMsg, 'error.message') ||
            _.get(errMsg, 'error') ||
            _.get(errMsg, 'pointInfo.message') ||
            _.get(errMsg, 'point') ||
            'Other'}`,
          phase: Object.keys(_.get(errMsg, 'phase', { nonePhaseError: null }))[0],
        });
      });
    });
    tmp = _.groupBy(tmp, 'phase');
    return Object.keys(tmp).map(key => ({
      phase: key,
      count: _.uniq(tmp[key].map(o => o.sessionHash)).length,
      errors: normalizeToSessionHashList(_.groupBy(tmp[key], 'message')),
    }));
  },

  /**
   *
   * @param {String} propertyName
   * @param {Date} from - time in milliseconds
   * @param {Date} to - time in milliseconds
   */
  getRangeQuery(propertyName, from, to) {
    return _.set({}, propertyName, { gte: from, lte: to });
  },

  /**
   * Default - from startOfTheDay till now
   * 1510696800000 - from date till now
   * 1510696800000:1510696800000 - from date to date
   * 1d - last N days
   * 1h - last N hours
   * 1m - last N minute
   *
   * @param {Date} dateValue
   */
  getRangeTimeConditions(dateValue) {
    const now = Date.now();
    const startOfTheDay = (new Date()).setHours(0, 0, 0, 0); // Get time start of the day
    const oneMinute = 60 * 1000;
    const oneHour = 60 * oneMinute;
    const oneDay = 24 * oneHour;

    let range;

    if (!dateValue) {
      range = { from: startOfTheDay, to: now };
    } else if (/\d+(d|h|m)/.test(dateValue)) {
      const dayMetric = dateValue.includes('d') ? oneDay : 0;
      const hourMetric = dateValue.includes('h') ? oneHour : 0;
      const minuteMetric = oneMinute;

      const multiplier = Number(dateValue.slice(0, -1));
      const diff = multiplier * (dayMetric || hourMetric || minuteMetric);

      range = { from: (dayMetric ? startOfTheDay : now) - diff, to: now };
    } else {
      const queryRange = dateValue.split(',');

      range = { from: `${queryRange[0]}`, to: `${queryRange[1] || now}` };
    }

    return Object.assign({}, range);
  },

  convertAbsoluteDateToTimestamp({ dateFrom, dateTo }) {
    const now = new Date();
    const startOfTheDay = new Date();
    const converted = {
      dateFrom: startOfTheDay,
      dateTo: now,
    };

    startOfTheDay.setHours(0);
    startOfTheDay.setMinutes(0);
    startOfTheDay.setSeconds(0);

    try {
      if (dateFrom) {
        converted.dateFrom = new Date(dateFrom).getTime();
      }

      if (dateTo) {
        converted.dateTo = new Date(dateTo).getTime();
      }

      return converted;
    } catch (err) {
      throw new Error('invalid date parameters');
    }
  },

  /**
   *
   * @param {Object} data - object which consist range data from,to
   */
  getIndexesByTimeRange(data) {
    const datesArray = [];
    const from = data.from;
    const indexPrefix =
      data.indexPrefix || _.get(config.ActivityHistoryService, 'redis.transport.indexPrefix');

    const getIndexesList = (name) => {
      const prefixes = indexPrefix.split(',');

      return prefixes.map(prefix => _.uniq(datesArray).map(time =>
        `${prefix}${name}_${time}`).join(',')).join(',');
    };

    let to = data.to;

    try {
      while (to >= from) {
        datesArray.push(coreUtils.formatElasticIndexTime(to));
        to -= 24 * 60 * 60 * 1000;
      }
    } catch (err) {
      throw err;
    }
    return {
      clientsIndexes: getIndexesList('client'),
      historyIndexes: getIndexesList('history'),
    };
  },

  /**
   *
   * @param {Object} requestData - object from http request
   */
  dataFromRequest(requestData) {
    const { params, body } = requestData;
    const data = Object.assign({}, params, body);

    Object.assign(data, this.getRangeTimeConditions(data.time));
    Object.assign(data, this.getIndexesByTimeRange(data));

    return data;
  },

  getDatesDiffInDays(firstDate, secondDate) {
    const timeDiff = Math.abs((firstDate - secondDate));

    return `${Math.ceil(timeDiff / (1000 * 3600 * 24)) - 1}d`;
  },

  /**
   *
   * @param {*} data
   * @param {*} chunkData
   */
  scrollOpsToEnd(data, extended = false, prevElasticScroll = {}) {
    const {
      userIds = {},
      projectIds = {},
      ctorSaveMap = {},
      userTypesGroup = {},
      sourceTypesGroup = {},
      modeLabelsGroup = {},
    } = prevElasticScroll;

    let totalSessions = 0;

    return Promise.resolve().then(() => {
      const hitsChunk = _.get(data, 'hits.hits', []).map(o => o._source);

      totalSessions += hitsChunk.length;

      hitsChunk.forEach((hit) => {
        const { projectId, userId, uniqueToolsOperations = {}, actions = {} } = hit;

        userIds[userId] = userId;

        const uniqueTools =
          _.uniq(_.get(projectIds, projectId, []).concat(Object.keys(uniqueToolsOperations)));

        projectIds[projectId] = uniqueTools;

        if (actions.constructor_save) ctorSaveMap[projectId] = actions.constructor_save;

        if (extended) {
          const viewer = _.get(hit, 'viewer', {});
          const { userType, sourceType, modeLabel } = operationStatsHelper.getViewerInfo(viewer);
          const fillStatsParam = {
            projectId,
            userId,
            uniqueTools,
            actions,
          };

          if (modeLabel === modeLabelConstants.MODE_LABELS.STANDARD) {
            // fillStatsObject - mutates the object
            operationStatsHelper.fillStatsObject(
              userTypesGroup, { ...fillStatsParam, index: userType }
            );
            operationStatsHelper.fillStatsObject(
              sourceTypesGroup, { ...fillStatsParam, index: sourceType }
            );
          }
          operationStatsHelper.fillStatsObject(
            modeLabelsGroup, { ...fillStatsParam, index: modeLabel }
          );
        }
      });

      if (data.hits.total > totalSessions) {
        return dbElasticCli.scroll({ scrollId: data._scroll_id, scroll: '15s' })
          .then(res => this.scrollOpsToEnd(res, extended, {
            projectIds,
            userIds,
            totalSessions,
            ctorSaveMap,
            userTypesGroup,
            sourceTypesGroup,
            modeLabelsGroup,
          }));
      }

      const toolsOperations = _.flatten(_.values(projectIds));
      const uniqueToolsOperations = operationStatsHelper.getUniqueOperations({ toolsOperations });
      const constructor = Object.keys(ctorSaveMap).length;
      let result = {
        totalSessions,
        totalUsers: Object.keys(userIds).length,
        totalProjects: Object.keys(projectIds).length,
        projectUniqueOperations: Object.assign({ constructor }, uniqueToolsOperations),
      };

      if (extended) {
        const extendedOperationsGroups = {
          userTypesGroup,
          sourceTypesGroup,
          modeLabelsGroup,
        };

        Object.keys(userTypesGroup).forEach(group =>
          operationStatsHelper.countStatsObject(userTypesGroup[group]));
        Object.keys(sourceTypesGroup).forEach(group =>
          operationStatsHelper.countStatsObject(sourceTypesGroup[group]));
        Object.keys(modeLabelsGroup).forEach(group =>
          operationStatsHelper.countStatsObject(modeLabelsGroup[group]));

        result = { total: { ...result }, ...extendedOperationsGroups };
      }

      return result;
    });
  },
});
