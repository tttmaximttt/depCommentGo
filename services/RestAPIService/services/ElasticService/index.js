const _ = require('lodash');

class ElasticService {
  /**
   * @param {DbElasticCli} dbElasticCli
   *
   */

  constructor({
    restAPIConstants, coreUtils, elasticQueryHelper, elasticApiModel,
    constantsEvents, sessionStatsHelper,
  }) {
    this.restAPIConstants = restAPIConstants;
    this.coreUtils = coreUtils;
    this.elasticQueryHelper = elasticQueryHelper;
    this.elasticApiModel = elasticApiModel;
    this.constantsEvents = constantsEvents;
    this.sessionStatsHelper = sessionStatsHelper;
  }

  errorHandler(res) {
    return (err) => {
      const { BAD_REQUEST } = this.restAPIConstants;

      res.writeHead(BAD_REQUEST);
      res.end(this.coreUtils.stringifyError(err));
    };
  }

  historyBySessionHash(req, res) {
    const data = this.elasticQueryHelper.dataFromRequest(req);

    this.elasticApiModel.historyBySessionHash(data, data.q).then(
      payload => res.end(this.elasticQueryHelper.elasticListResponse(payload)),
      this.errorHandler(res)
    );
  }

  sessionsList(req, res) {
    const data = this.elasticQueryHelper.dataFromRequest(req);

    this.elasticApiModel.sessionsList(data, data.q).then(
      payload => res.end(this.elasticQueryHelper.elasticListResponse(payload)),
      this.errorHandler(res)
    );
  }

  getStatistic(req, res) {
    const { elasticQueryHelper } = this;
    const {
      ALL_SESSIONS, NOT_SUCCESS_ENTER, NOT_SUCCESS_EXIT, ONLY_INIT,
      SUCCESS_WITHOUT_ERRORS, SESSIONS_WITH_ERRORS, WORKING_SESSIONS,
    } = elasticQueryHelper.elasticQueries;
    const data = elasticQueryHelper.dataFromRequest(req);
    const names = [
      'TOTAL',
      'SESSIONS_SUCCESS_WITHOUT_ERRORS',
      'WORKING_SESSIONS',
      'SESSIONS_WITH_ERRORS',
      'SESSIONS (ENTER: NOT SUCCESS)',
      'SESSIONS (EXIT: INIT OR TIMEOUT)',
      'SESSIONS (SESSION_INIT ONLY)',
    ];

    Promise.all([
      this.sessionsWithAdditionalQuery(ALL_SESSIONS, data),
      this.sessionsWithAdditionalQuery(SUCCESS_WITHOUT_ERRORS, data),
      this.sessionsWithAdditionalQuery(WORKING_SESSIONS, data),
      this.sessionsWithAdditionalQuery(SESSIONS_WITH_ERRORS, data),
      this.sessionsWithAdditionalQuery(NOT_SUCCESS_ENTER, data),
      this.sessionsWithAdditionalQuery(NOT_SUCCESS_EXIT, data),
      this.sessionsWithAdditionalQuery(ONLY_INIT, data),
    ])
    .then((payload) => {
      const info = {};
      const result = {};
      let failedCount = 0;
      let percentage = null;

      payload = payload.map((item, i) => { // TODO no multiple reassigning
        // TODO { max_score: undefined } ????????????????????????????????? WHY
        item = Object.assign({ name: names[i] }, item.hits, { max_score: undefined });
        item.hits = item.hits.length ? item.hits.map(hit => hit._source) : [];

        if (i < 1) {
          percentage = this.getPercent(item.total);
        } else if (i > 3) {
          failedCount += item.total;
        }

        info[names[i]] = `${item.total} - ${percentage(item.total)}`;
        return item;
      });


      const additionData = {};
      const errors = elasticQueryHelper.errorSessionsHandler(payload[3]);
      const failed = elasticQueryHelper.failedSessionsHandler([].concat(
        payload[4].hits,
        payload[5].hits,
      ));

      result['1. TOTAL'] = info[names[0]];
      result['2. SUCCESS'] = info[names[1]];
      result['3. WORKING'] = info[names[2]];
      result['4. KNOWN ERRORS'] = info[names[3]];


      errors.forEach((err, i) => {
        result[`4.${(i + 1)} phase.${err.phase}`] = `${err.count} - ${percentage(err.count)}`;
        additionData[`4.${(i + 1)} phase.${err.phase}`] = err.errors;
      });
      result['5. FAILED SESSIONS'] = `${failedCount} - ${percentage(failedCount)}`;
      let i = 1;

      _.forEach(failed, (value, key) => {
        result[`5.${i} ${key}`] = `${value.length} - ${percentage(value.length)}`;
        additionData[`5.${i} ${key}`] = value.map(o => o.sessionHash);
        i += 1;
      });
      result[`5.${i} init/null/null`] = info[names[6]];
      additionData[`5.${i} init/null/null`] = _.get(payload, '6.hits', []).map(o => o.sessionHash);

      res.end(JSON.stringify( // TODO no mixing BL with controller and routed responsibility area
        { info: result, data: additionData }
      ));
    })
    .catch(this.errorHandler(res));
  }

  sessionsWithAdditionalQuery(elasticQuery, data) {
    const { elasticApiModel } = this;

    elasticQuery = _.cloneDeep(elasticQuery);
    const dataQuery = _.cloneDeep(data.q);
    const query = _.mergeWith(elasticQuery, dataQuery,
      this.elasticQueryHelper.mergeArrayCustomizer);

    return elasticApiModel.sessionsList.call(elasticApiModel, _.cloneDeep(data), query);
  }

  getDetailedSessionStats(req, res) {
    const { elasticQueryHelper, sessionStatsHelper } = this;
    const { time } = req.body;
    const {
      ALL_SESSIONS,
      FINISHED_SESSIONS,
      TIEOUT_SESSIONS,
      TIMEOUT_BEFORE_ACTED,
      TIMEOUT_AFTER_ACTED,
      SESSIONS_WITH_ERRORS,
      SESSIONS_WITH_WARNINGS,
    } = elasticQueryHelper.elasticQueries;

    const { dateFrom, dateTo } = elasticQueryHelper.convertAbsoluteDateToTimestamp(req.body);
    const days = elasticQueryHelper.getDatesDiffInDays(dateFrom, dateTo);

    req.body.time = time || days;

    const data = elasticQueryHelper.dataFromRequest(req);

    data.from = dateFrom;
    data.to = dateTo;

    const elasticFilterQuery = elasticQueryHelper.getElasticFilterQuery(data);
    const sessionGroupNames = [
      'total',
      'finished',
      'timeout',
      'beforeActed',
      'afterActed',
      'failed',
      'warning',
    ];

    data.q = elasticFilterQuery;

    Promise.all([
      this.sessionsWithAdditionalQuery(ALL_SESSIONS, data),
      this.sessionsWithAdditionalQuery(FINISHED_SESSIONS, data),
      this.sessionsWithAdditionalQuery(TIEOUT_SESSIONS, data),
      this.sessionsWithAdditionalQuery(TIMEOUT_BEFORE_ACTED, data),
      this.sessionsWithAdditionalQuery(TIMEOUT_AFTER_ACTED, data),
      this.sessionsWithAdditionalQuery(SESSIONS_WITH_ERRORS, data),
      this.sessionsWithAdditionalQuery(SESSIONS_WITH_WARNINGS, data),
    ]).then((sessions) => {
      const sessionStats = {};
      const totalSessionsCount = _.get(sessions, '[0].hits.total', 0);
      const getRate = this.getPercent(totalSessionsCount);

      sessions.map((session, i) => {
        const groupName = sessionGroupNames[i];
        const { hits } = session;
        const sessionStatObject = sessionStatsHelper.getSessionStatObject(hits.total, getRate);

        sessionStatObject.hits = hits;
        sessionStats[groupName] = sessionStatObject;

        return sessionStatObject;
      });

      const stabilityRate = getRate(sessionStats.total.count - sessionStats.failed.count);

      sessionStats.stabilityRate = stabilityRate;

      sessionStatsHelper.fillSessionTimeoutStat(sessionStats); // mutates sessionStats
      sessionStatsHelper.fillSessionFailedStat(sessionStats, getRate); // mutates sessionStats
      sessionStatsHelper.fillSessionWarningStat(sessionStats, getRate); // mutates sessionStats

      Object.keys(sessionStats).forEach(session =>
        sessionStatsHelper.cleanSessionStatObject(sessionStats[session]));

      return res.end(JSON.stringify(sessionStats));
    })
    .catch(this.errorHandler(res));
  }

  getDetailedOperationStats(req, res) {
    return this.getOperationsStatistic(req, res, true);
  }

  getOperationsStatistic(req, res, detailed = false) {
    const { elasticQueryHelper, elasticApiModel } = this;
    let data;

    if (detailed) {
      const { dateFrom, dateTo } = elasticQueryHelper.convertAbsoluteDateToTimestamp(req.body);
      const days = elasticQueryHelper.getDatesDiffInDays(dateFrom, dateTo);

      req.body.time = days;

      data = elasticQueryHelper.dataFromRequest(req);

      data.from = dateFrom;
      data.to = dateTo;
    } else {
      data = elasticQueryHelper.dataFromRequest(req);
    }
    const { TOOLS_OPERATIONS } = elasticQueryHelper.elasticQueries;

    elasticApiModel.operationsList.call(elasticApiModel, _.cloneDeep(data), TOOLS_OPERATIONS)
      .then(operations => elasticQueryHelper.scrollOpsToEnd(operations, detailed))
      .then(payload => res.end(JSON.stringify(payload)))
      .catch(this.errorHandler(res));
  }

  getPercent(total = 0) {
    return (count) => {
      const result = !total ? 0 : Math.round((count * 100 * 100) / total) / 100;

      return `${result} %`;
    };
  }

}

module.exports = ElasticService;
