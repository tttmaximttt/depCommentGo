const _ = require('lodash');
const config = require('config');
const uuid = require('uuid/v1');

function mergeCustomizer(oldValue, newValue) {
  if (_.isArray(oldValue) && _.isArray(newValue)) {
    return newValue;
  }
}

function createIdKey(id) {
  return id ? `${id.clientId}-${id.localId}` : false;
}

function createEmptyDocument() {
  return {
    contentJSON: [],
    templateJSON: [],
    configJSON: { content: {}, pages: [], attributes: {}, images: [{}] },
    attributesJSON: {},
    pagesJSON: [],
    commentsJSON: [],
  };
}

function _attachId(id, operation) {
  const { template, content } = operation.properties;
  let status = false;

  if (template && !template.id) {
    template.id = id;
    status = true;
  }
  if (template && template.id && content && !content.linkId) {
    content.linkId = template.id;
  }

  return status;
}

function _linkIdAirSlate(operation) {
  const id = uuid();

  _attachId(id, operation);
}

function _linkIdFiller(operation, tmplIdsArr) {
  const maxId = _.max(tmplIdsArr) || 2;
  const id = maxId + 1;

  _attachId(id, operation) && tmplIdsArr.push(id);
}

function createLinkId(operation, tmplIdsArr) {
  switch (config.app) {
    case 'pdfFiller':
      _linkIdFiller(operation, tmplIdsArr);
      break;
    case 'airSlate':
      _linkIdAirSlate(operation);
      break;
    default:
      throw new Error('APP NAME NOT FOUND');
  }
}

function assignDefault(mainDefault, patchDefault, patch) {
  if (!_.isArray(mainDefault.properties[patch])) {
    mainDefault.properties[patch] = patchDefault;
  } else {
    Object.keys(patchDefault).forEach(key => (
        key !== 'owner' &&
        _.merge(
          _.find(mainDefault.properties[patch], ['id', key]),
          patchDefault[key]
        )
      )
    );
  }
  return mainDefault;
}

function assignDefaults(mainDefault, patchDefault) {
  Object.keys(patchDefault.properties).forEach((key) => {
    if (!['group', 'type'].includes(key)) {
      mainDefault = assignDefault(mainDefault, patchDefault.properties[key], key);
    }
  });

  return mainDefault;
}

function prepareElementToConvertation(operation, { FORMULA, NUMBER }) {
  const { template, content } = operation.properties;

  if (template.format) {
    if (template.subType === FORMULA) {
      template.formulaFormat = template.format;
      delete template.format;
    }

    if (template.subType === NUMBER) {
      template.numberFormat = template.format;
      delete template.format;
    }
  }
  if (content) {
    if (_.get(operation.properties, 'template.valign')) {
      const { template: _template } = operation.properties;

      operation.properties.content = {
        ...content,
        x: _template.x,
        y: _template.y,
        valign: _template.valign,
        height: _template.height,
      };
    }
  }
}

/**
 *
 * @param flatOperations
 * @param operation
 * @param tmpIdsArr
 */
function applyElement(flatOperations, operation, tmpIdsArr) {
  const id = createIdKey(operation.properties.element);

  if (!flatOperations[id]) {
    flatOperations[id] = {};
  }

  /**
    Corner case when in fillable field content was deleted
    and added again. In worst case after merge visible become
    false again.
  */

  // ['properties.content.visible', 'properties.template.visible'].forEach((path) => {
  //   if (_.get(flatOperations, `${id}.${path}`) === false) {
  //     _.set(flatOperations, `${id}.${path}`, true);
  //   }
  // });

  flatOperations[id] = _.mergeWith(
    { ...flatOperations[id] },
    _.omit(operation, ['id']),
    mergeCustomizer,
  );

  createLinkId(flatOperations[id], tmpIdsArr);
}

function isOperationElement(operation) {
  const { content, template } = _.get(operation, 'properties', {});

  return !!content || !!template;
}

function isOperationsForProcessing(id, { clientId }, clearDataFlag) {
  return !id ? false : !(clearDataFlag && id.clientId !== clientId);
}

function constructDocumentContent(document, { properties }, pageId) {
  if (!Array.isArray(document.contentJSON[pageId])) {
    document.contentJSON[pageId] = [];
  }
  document.contentJSON[pageId].push(properties);
}

function constructDocumentTemplate(document, { properties }, pageId, getNextOrderValue) {
  if (!Array.isArray(document.templateJSON[pageId])) {
    document.templateJSON[pageId] = [];
  }
  if (!_.has(properties, 'template.order')) {
    properties.template.order = getNextOrderValue();
  }

  document.templateJSON[pageId].push(properties);
}

function constructDocumentPages(document, { properties }) {
  document.pagesJSON = properties;
}

function constructDocumentAttributes(document, { properties }, attributeType) {
  document.attributesJSON[attributeType] = properties;
}

function constructDocumentComment(document, content, pageId) {
  if (content.visible === false) return;
  if (!Array.isArray(document.commentsJSON[pageId])) {
    document.commentsJSON[pageId] = [];
  }

  const comment = _.omit({
    ...content,
    general: {
      resolved: content.resolved,
      width: content.width,
      height: content.height,
      x: content.x,
      y: content.y,
    },
  }, ['resolved', 'width', 'height', 'x', 'y']);

  document.commentsJSON[pageId].push(comment);
}

function templateIsChangedWatcher({ MODE }, { CONSTRUCTOR }, { clientId }) {
  let flag = true;
  let firstItem = true;

  return (operation) => {
    const { template, element } = _.get(operation, 'properties', {});

    if (!template || !element) return flag;

    if (!flag || firstItem) {
      flag = (template && element && element.clientId === clientId)
      || (template && !template.visible);
      firstItem = false;
    }

    return flag;
  };
}

function defaultsWatcher({ DEFAULTS }) {
  let defaults = null;

  return (operation) => {
    if (_.get(operation, 'properties.type') === DEFAULTS) {
      defaults = defaults ? assignDefaults(defaults, operation) : operation;
    }
    return defaults;
  };
}

/**
 * @method nativeAppWatcher
 * Android native apps always send template.visible: false,
 * this destroys them upon destroy. We should override this
 */
function nativeAppWatcher(data) {
  const { clientType } = data || {};

  return ({ properties }) => {
    const { template } = properties;
    const shouldSetTemplateToVisible = clientType === 'android' &&
      _.get(template, 'visible') === false;

    if (shouldSetTemplateToVisible) {
      _.set(template, 'visible', true);
    }
  };
}

function orderValueWatcher() {
  let maxOrderValue = 0;

  return (operation) => {
    maxOrderValue = Math.max(_.get(operation, 'properties.template.order', 0), maxOrderValue);
    return maxOrderValue;
  };
}

function orderCurrentValue(initialValue) {
  let i = initialValue;

  return () => (++i);
}

function pagesWatcher({ PAGES }) {
  let pages = null;

  return (operation) => {
    if (_.get(operation, 'properties.type') === PAGES) {
      pages = operation;
    }
    return pages;
  };
}

module.exports = {
  templateIsChangedWatcher,
  defaultsWatcher,
  assignDefaults,
  pagesWatcher,
  createEmptyDocument,
  isOperationsForProcessing,
  createIdKey,
  nativeAppWatcher,
  orderValueWatcher,
  orderCurrentValue,
  constructDocumentContent,
  prepareElementToConvertation,
  constructDocumentTemplate,
  constructDocumentPages,
  constructDocumentAttributes,
  constructDocumentComment,
  applyElement,
  createLinkId,
  isOperationElement,
};
