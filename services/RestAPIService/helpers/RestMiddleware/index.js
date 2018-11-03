class RestMiddleware {
  constructor({ config, restAPIConstants }) {
    this.config = config;
    this.restAPIConstants = restAPIConstants;
  }

  contentType(app) {
    app.use((req, res, next) => {
      res.set({
        'content-type': 'application/json',
      });
      next();
    });
  }

  secureEndpoints(app) {
    const { restAPIConstants, config } = this;
    const { RestAPIService, restSecureKey } = config;
    const { secureEndpoints } = RestAPIService;
    const { BAD_REQUEST } = restAPIConstants;

    app.use((req, res, next) => {
      if (secureEndpoints[req.path]) {
        const key = req.body.key || req.query.key;

        if (key !== restSecureKey) {
          return res.status(BAD_REQUEST).send({ msg: 'wrong secure key' }).end();
        }
      }
      next();
    });
  }

}

module.exports = RestMiddleware;
