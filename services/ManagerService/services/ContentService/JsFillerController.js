const defaultTemplateJson = require('../../helpers/OperationsConverter/defaults/templateJSON');

class JsFillerController {
  _shouldSendTemplate(templateJSON, isTemplateChanged) {
    return templateJSON && isTemplateChanged;
  }

  getContentJSON(convertedData) {
    const { content, config, attributes, pages, template } = convertedData;

    return {
      contentJSON: { content },
      configJSON: config,
      attributesJSON: { attributes },
      pagesJSON: pages,
      template,
    };
  }

  mapContent(documentData, rearrangeProcessId, documentRaw) {
    const { document, isTemplateChanged } = documentData;
    const { templateJSON = false, commentsJSON } = document;
    const template = this._shouldSendTemplate(templateJSON, isTemplateChanged) ?
    {
      template: JSON.stringify({
        origin: defaultTemplateJson.origin,
        version: defaultTemplateJson.version,
        data: templateJSON,
      }),
    } : {};

    const { contentXML, attributesXML, pagesXML } = documentRaw;

    return {
      process_id: rearrangeProcessId,
      ...(contentXML ? { content: contentXML } : {}),
      ...template,
      comments: commentsJSON,
      attributes: attributesXML,
      pages: pagesXML,
    };
  }
}

module.exports = JsFillerController;
