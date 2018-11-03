const request = require('request');
const _ = require('lodash');

class JavaWorkerModel {
  constructor({ config, logSystem, constantsEvents, javaWorkerConstants }) {
    this.config = config;
    this.logSystem = logSystem;
    this.constantsEvents = constantsEvents;

    this.STATUS = javaWorkerConstants;

    this.FORM_ID_PREFIX = 'jsfiller_form_id';
  }

  createFormId(projectId) {
    // return [this.FORM_ID_PREFIX, projectId, Date.now()].join('_');
    return projectId;
  }

  updatePages({ uid, formId, pdfUrl, callbackUrl, pages, workerUrl }) {
    const { config, logSystem, constantsEvents } = this;
    const { headers } = config.javaWorker;
    const origin = workerUrl || config.javaWorker.origin;
    const options = {
      method: 'POST',
      url: `${origin}/api/v1/assembly/build`,
      headers,
      body: JSON.stringify({
        formId,
        operation: 'assembly',
        options: {
          callbackUrl,
        },
        sources: [
          {
            url: pdfUrl,
            format: 'pdf',
          },
        ],
        pages: this.normalizePagesForWorker(pages),
        sync: false,
      }),
    };

    logSystem.info(constantsEvents.API_REQUEST, {
      endpoint: 'updatePages', uid, formId, pdfUrl, callbackUrl, pages,
    });
    return this._send(options);
  }

  pdfBuild({ formId, userId, pdfUrl, callbackUrl, snapshot, workerUrl }) {
    const { config, logSystem, constantsEvents } = this;
    const { headers } = config.javaWorker;
    const origin = workerUrl || config.javaWorker.origin;
    const buff = new Buffer(JSON.stringify(snapshot));

    logSystem.info(constantsEvents.API_REQUEST, {
      endpoint: 'pdfBuild',
      formId,
      userId,
      pdfUrl,
      callbackUrl,
      url: `${origin}/api/v1/edit/build?disable-proxy=true&experiment=exp2`,
    });

    const options = {
      method: 'POST',
      url: `${origin}/api/v1/edit/build?disable-proxy=true&experiment=exp2`,
      headers,
      body: JSON.stringify({
        formId,
        userId,
        pdfUrl,
        contentEncoded: true,
        content: buff.toString('base64'),
        sync: false,
        options: {
          callbackUrl,
        },
      }),
    };

    return this._send(options);
  }

  async getAssemblyJobStatus({ uid, formId, processId, workerUrl }) {
    try {
      const { config, logSystem, constantsEvents } = this;
      const { headers } = config.javaWorker;
      const origin = workerUrl || config.javaWorker.origin;
      const options = {
        method: 'POST',
        url: `${origin}/api/v1/assembly/process?disable-proxy=true`,
        headers,
        body: JSON.stringify({ formId, processId }),
      };

      logSystem.info(constantsEvents.API_REQUEST, {
        endpoint: 'getAssemblyJobStatus', uid, formId, processId,
      });
      const data = await this._send(options);

      logSystem.info(constantsEvents.API_RESPONSE, {
        endpoint: 'getAssemblyJobStatus', uid, data,
      });

      return data;
    } catch (err) {
      throw err;
    }
  }

  async getAssemblyBuildJobStatus({ uid, formId, processId, workerUrl }) {
    try {
      const { config, logSystem, constantsEvents } = this;
      const { headers } = config.javaWorker;
      const origin = workerUrl || config.javaWorker.origin;
      const options = {
        method: 'POST',
        url: `${origin}/api/v1/edit/process?disable-proxy=true`,
        headers,
        body: JSON.stringify({ formId, processId }),
      };

      logSystem.info(constantsEvents.API_REQUEST, {
        endpoint: 'getAssemblyJobStatus', uid, formId, processId,
      });

      const data = await this._send(options);

      logSystem.info(constantsEvents.API_RESPONSE, {
        endpoint: 'getAssemblyJobStatus', uid, data,
      });
      return data;
    } catch (err) {
      throw err;
    }
  }

  async recognizeFont({ userId, formId, callbackUrl, image, imageFormat, workerUrl }) {
    try {
      const { config, logSystem, constantsEvents } = this;
      const { headers } = config.javaWorker;
      const origin = workerUrl || config.javaWorker.origin;
      const endpoint = 'recognizeFont';
      const options = {
        method: 'POST',
        url: `${origin}/api/v1/font-recognition/build`,
        headers,
        body: JSON.stringify({
          userId,
          formId,
          image,
          imageFormat,
          options: {
            callbackUrl,
          },
          sync: false,
        }),
      };

      logSystem.info(constantsEvents.API_REQUEST, { userId, formId, callbackUrl, endpoint });
      const content = await this._send(options);

      logSystem.info(constantsEvents.API_RESPONSE, { userId, formId, content, endpoint });
      return content;
    } catch (err) {
      throw err;
    }
  }

  async getFontRecognitionJobStatus({ uid, formId, processId, workerUrl }) {
    try {
      const { config, logSystem, constantsEvents } = this;
      const { headers } = config.javaWorker;
      const origin = workerUrl || config.javaWorker.origin;
      const endpoint = 'getFontRecognitionJobStatus';
      const options = {
        method: 'POST',
        url: `${origin}/api/v1/font-recognition/process?disable-proxy=true`,
        headers,
        body: JSON.stringify({ formId, processId }),
      };

      logSystem.info(constantsEvents.API_REQUEST, { uid, formId, processId, endpoint });
      const data = await this._send(options);

      logSystem.info(constantsEvents.API_RESPONSE, { uid, data, endpoint });
      return data;
    } catch (err) {
      throw err;
    }
  }

  normalizePagesForWorker(pages) {
    const oldPages = _.chain(pages)
      .filter({ blankOf: -1, duplicateOf: -1 })
      .sortBy('source')
      .map(
        ({ visible, source }) => (visible
          ? { source: 0, rotation: 0, range: source } // add page as is
          : { source: -1, rotation: 0, range: source, paperSize: 0 }) // add blank page
      )
      .value();
    const newPages = _.chain(pages)
      .filter(({ blankOf, duplicateOf }) => blankOf > -1 || duplicateOf > -1)
      .sortBy('source')
      .map(
        ({ blankOf, duplicateOf }) => (blankOf > -1
          ? { source: -1, rotation: 0, range: blankOf, paperSize: 0 } // add blank page
          : { source: 0, rotation: 0, range: duplicateOf }) // copy page
      )
      .value();

    return [...oldPages, ...newPages];
  }

  toPdfSources(res) {
    return {
      pdfUrl: _.get(res, 'targets[0].url'),
    };
  }

  async buildPdfByDocument(document, settings) {
    try {
      const { config, logSystem, constantsEvents } = this;
      const { headers } = config.javaWorker;
      const { content, images, pdfUrl, attributes, pages } = document;
      const { uid, formId, callbackUrl, workerUrl } = settings;
      const origin = workerUrl || config.javaWorker.origin;

      let contentFormat;
      let contentData;
      let contentEncoded;
      let pageAttributes;
      let pagesConfig;

      if (typeof content === 'string') {
        contentFormat = 'pdffiller';
        contentEncoded = true;
        contentData = content && new Buffer(content).toString('base64');
        pageAttributes = attributes && new Buffer(attributes).toString('base64');
        pagesConfig = pages;
      } else {
        contentFormat = 'ajson';
        contentEncoded = true;
        contentData =
          new Buffer(JSON.stringify(content && content.list ? content : { list: content })).toString('base64');
        pageAttributes = attributes ?
          new Buffer(JSON.stringify(attributes.list ? attributes : { list: attributes })).toString('base64') : null;
      }

      if (pages && pages.length && _.isArray(pages)) {
        pagesConfig = pages.map(item => ({ ...item, pageIndex: item.source, available: item.visible }));
      }

      const options = {
        method: 'POST',
        url: `${origin}/api/v1/pdf/build`,
        headers,
        json: {
          userId: formId,
          formId,
          sync: false,
          contentFormat,
          contentEncoded,
          pdfUrl,
          content: contentData,
          ...(pagesConfig && { pages: pagesConfig }),
          pageAttributes,
          images,
          nocache: true,
          sourceFormat: 'pdf',
          options: {
            callbackUrl,
          },
        },
      };

      logSystem.info(constantsEvents.API_REQUEST, {
        endpoint: 'buildPdfByDocument', uid, formId, pdfUrl, callbackUrl, workerUrl, options,
      });
      const reply = await this._send(options);

      logSystem.info(constantsEvents.API_RESPONSE, {
        endpoint: 'buildPdfByDocument', uid, formId, reply,
      });
      return reply;
    } catch (err) {
      throw err;
    }
  }

  getPdfByDocumentStatus(processId, settings) {
    const { config, logSystem, constantsEvents } = this;
    const { headers } = config.javaWorker;
    const { uid, formId, workerUrl } = settings;
    const origin = workerUrl || config.javaWorker.origin;

    const options = {
      method: 'POST',
      url: `${origin}/api/v1/pdf/process?disable-proxy=true`,
      headers,
      form: {
        formId,
        processId,
      },
    };

    logSystem.info(constantsEvents.API_REQUEST, {
      endpoint: 'getPdfByDocumentStatus', uid, formId, processId, workerUrl,
    });
    const reply = this._send(options);

    logSystem.info(constantsEvents.API_RESPONSE, {
      endpoint: 'getPdfByDocumentStatus', uid, formId, processId, workerUrl, reply,
    });
    return reply;
  }

  _send(options) {
    return new Promise((resolve, reject) => {
      request(options, (err, response, reply) => {
        if (err) return reject(err);
        if (reply.error) return reject(new Error(reply.error));
        if (typeof reply === 'string') reply = JSON.parse(reply);

        resolve(reply);
      });
    });
  }
}

module.exports = JavaWorkerModel;
