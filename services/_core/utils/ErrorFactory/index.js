class ErrorsFabric {
  constructor({ operationsConstants, constantsEvents, coreUtils }) {
    this.operationsConstants = operationsConstants;
    this.constantsEvents = constantsEvents;
    this.coreUtils = coreUtils;
  }

  _build(group, err, params, method, context) {
    const { coreUtils } = this;
    const { message = '' } = err;
    const errorStr = typeof err !== 'string' ? coreUtils.stringifyError(err) : err;

    return {
      group,
      message: message || errorStr,
      ...params,
      method,
      context,
    };
  }

  conversionError(err = {}, params = {}, method = '', context = '') {
    return this._build(this.constantsEvents.CONVERSION_ERROR, err, params, method, context);
  }

  customError(err = {}, params = {}, method = '', group) {
    return this._build(group, err, params, method, '');
  }

  systemError(err = {}, params = {}, method = '', context = '') {
    return this._build(this.constantsEvents.SYSTEM_ERROR, err, params, method, context);
  }

  apiError(err = {}, params = {}, method = '', context = '') {
    return this._build(this.constantsEvents.API_ERROR, err, params, method, context);
  }
}

module.exports = ErrorsFabric;
