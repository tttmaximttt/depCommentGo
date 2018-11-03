const _ = require('lodash');

let client;

class ElasticTransport {
  constructor({ logger, dbElasticCli }) {
    client = dbElasticCli;
    this.logger = logger;
  }

  bulkSend(data, callback) {
    client.bulk({ body: data }, (err, postActionData) => {
      if (err) return callback(err);

      /* CUSTOM CASE WHEN BULK OPERATION WAS FIINISHED BUT DATA WEREN'T FULLY INSERTED TO ELASTIC */
      if (postActionData.errors) {
        const list = postActionData.items.filter(o => _.values(o)[0].error);

        this.logger.error('ActivityHistory', { msg: 'Elastic bulkSend errors', list });
      }

      /* TODO ADD LOGGER */
      callback(null, postActionData);
    });
  }
}

module.exports = config => new ElasticTransport(config);
