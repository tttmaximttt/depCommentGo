class AirslateController {
  getContentJSON(documentContent) {
    const {
      pages,
      attributes,
      content,
      fields,
      roles,
      comments,
      // images, // TODO ?
      // attachments, // TODO ?
      // pdfUrl, // TODO ?
      // pdfStatus, // TODO ?
    } = documentContent;

    const template = JSON.stringify({
      data: fields.list,
      origin: fields.metadata.origin,
      version: fields.metadata.ver,
    });

    return {
      contentJSON: { content: content.list },
      attributesJSON: JSON.stringify(attributes.list),
      pagesJSON: pages.list,
      template,
      comments: JSON.stringify(comments.list),
      roles: JSON.stringify(roles.list),
    };
  }

  mapContent(documentData) {
    const { document } = documentData;
    const metadata = { ver: 1, dpi: 72 };

    return {
      pages: {
        metadata,
        list: document.pagesJSON,
      },
      fields: {
        metadata,
        list: document.templateJSON,
      },
      content: {
        metadata: {
          ver: 1,
          dpi: 72,
        },
        list: document.contentJSON,
      },
      roles: {
        metadata: {
          ver: 1,
          dpi: 72,
        },
        list: document.roles || [],
      },
      attributes: {
        metadata: {
          ver: 1,
          dpi: 72,
        },
        list: document.attributesJSON,
      },
      comments: {
        metadata: {
          ver: 1,
          dpi: 72,
        },
        list: document.commentsJSON,
      },
    };
  }
}

module.exports = AirslateController;
