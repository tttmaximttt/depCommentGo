const _ = require('lodash');

class ElasticApiModel {
  /**
   * @param {DbElasticCli} dbElasticCli
   *
   */

  constructor({
    dbElasticCli, elasticQueryHelper,
  }) {
    this.dbElasticCli = dbElasticCli;
    this.elasticQueryHelper = elasticQueryHelper;
  }
  /**
   *
   * @param {Object} data
   */
  historyBySessionHash(data, optional = {}) {
    const term = { sessionHash: data.sessionHash };
    const query = _.mergeWith({
      bool: {
        must: [
          { range: this.elasticQueryHelper.getRangeQuery('actionTime', data.from, data.to) },
          { term },
        ],
      },
    }, optional.query, this.elasticQueryHelper.mergeArrayCustomizer);

    const body = _.mergeWith({
      index: data.historyIndexes,
      body: {
        from: 0,
        size: 10000,
        query,
        sort: { actionTime: 'asc' },
      },
    }, optional.body, this.elasticQueryHelper.mergeArrayCustomizer);

    return this.dbElasticCli.search(body);
  }

  /**
   *
   * @param {*} data
   * @param {*} optional
   */
  sessionsList(data, optional = {}) {
    const query = _.mergeWith({
      bool: {
        must: [
          { range: this.elasticQueryHelper.getRangeQuery('actionTime', data.from, data.to) },
        ],
      },
    }, optional.query, this.elasticQueryHelper.mergeArrayCustomizer);

    const body = _.mergeWith({
      index: data.clientsIndexes,
      body: {
        from: 0,
        size: 10000,
        query,
        sort: { actionTime: 'asc' },
      },
    }, optional.body, this.elasticQueryHelper.mergeArrayCustomizer);

    return this.dbElasticCli.search(body);
  }

  /**
   *
   * @param {*} data
   * @param {*} optional
   */
  operationsList(data, optional = {}) {
    const query = _.mergeWith({
      bool: {
        must: [
          { range: this.elasticQueryHelper.getRangeQuery('actionTime', data.from, data.to) },
        ],
      },
    }, optional.query, this.elasticQueryHelper.mergeArrayCustomizer);

    const body = _.mergeWith({
      index: data.clientsIndexes,
      size: 10000,
      scroll: '30s',
      body: {
        query,
      },
    }, optional.body, this.elasticQueryHelper.mergeArrayCustomizer);

    return this.dbElasticCli.search(body);
  }

  /**
   *
   * @param {*} data
   * @param {*} optional
   */
  historyList(data, optional = {}) {
    const query = _.mergeWith({
      bool: {
        must: [
          { range: this.elasticQueryHelper.getRangeQuery('actionTime', data.from, data.to) },
        ],
      },
    }, optional.query, this.elasticQueryHelper.mergeArrayCustomizer);

    const body = _.mergeWith({
      index: data.historyIndexes,
      body: {
        from: 0,
        size: 10000,
        query,
      },
    }, optional.body, this.elasticQueryHelper.mergeArrayCustomizer);

    return this.dbElasticCli.search(body);
  }

}

module.exports = ElasticApiModel;
