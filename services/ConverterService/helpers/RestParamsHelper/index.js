class RestParamsHelper {

  getForConvert(req) {
    return {
      document: req.body.document,
      ownerId: req.body.ownerId,
      uid: req.body.uid,
      host: req.body.host,
      callbackUrl: req.body.callbackUrl,
      dpi: req.body.dpi,
    };
  }

  getForFieldsContentDictionary(req) {
    const document = req.body.document;

    return {
      ...document,
      builderName: req.body.format.toLowerCase().replace(/-/g, ''),
      ownerId: req.body.ownerId,
    };
  }
}

module.exports = RestParamsHelper;
