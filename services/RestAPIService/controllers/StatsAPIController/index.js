class StatsAPIController {

  /**
   * @param {ElasticService} elasticService
   */
  constructor({
    elasticService,
  }) {
    this.elasticService = elasticService;
  }


  sessionsList(req, res) {
    return this.elasticService.sessionsList(req, res);
  }

  historyBySessionHash(req, res) {
    return this.elasticService.historyBySessionHash(req, res);
  }

  getStatistic(req, res) {
    return this.elasticService.getStatistic(req, res);
  }

  getOperationsStatistic(req, res) {
    return this.elasticService.getOperationsStatistic(req, res);
  }

  getDetailedOperationStats(req, res) {
    return this.elasticService.getDetailedOperationStats(req, res);
  }

  getDetailedSessionStats(req, res) {
    return this.elasticService.getDetailedSessionStats(req, res);
  }

}

module.exports = StatsAPIController;
