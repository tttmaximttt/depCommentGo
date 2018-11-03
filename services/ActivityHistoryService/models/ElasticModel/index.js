
const template = require('./template');
const async = require('async');
const _ = require('lodash');

class ElasticModel {
  /**
   *
   * @param {DbElasticCli} dbElasticCli
   * @param {Logger} dbElasticCli
   * @param {dbElasticCli} logger
   * @param {coreUtils} coreUtils
   * @param {constantsEvents} constantsEvents
   */
  constructor({ dbElasticCli, logger, coreUtils, constantsEvents }) {
    this.client = dbElasticCli;
    this.logger = logger;
    this.coreUtils = coreUtils;
    this.constantsEvents = constantsEvents;
  }

  syncTemplates(callback) {
    async.waterfall([
      (next) => {
        this.client.ping({
          requestTimeout: 30000,
        }, (err) => {
          if (err) err = { retry: true };
          next(err);
        });
      },
      (next) => {
        this.client.indices.getTemplate({ name: 'ahs_template' }, (err, data) => {
          if (err && err.statusCode === 404) return next(null, null);
          next(err, data || null);
        });
      },
      (res, next) => {
        const oldVersion = Number(_.get(res, 'ahs_template.version'));
        const newVersion = Number(template.version);

        if (!res || !oldVersion || newVersion > oldVersion) {
          this.client.indices.putTemplate({
            name: 'ahs_template',
            body: JSON.stringify(template),
          }, (err) => {
            next(err);
          });
        } else {
          next(null);
        }
      },
    ], (err) => {
      if (err && err.retry) {
        return setTimeout(this.syncTemplates.bind(this, callback), 5000);
      }
      if (err) {
        this.logger.error(
          this.constantsEvents.INTERNAL_SCRIPT_ERROR,
          { err: this.coreUtils.stringifyError(err) }
        );
      }

      callback();
    });
  }
}

module.exports = ElasticModel;
