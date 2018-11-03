const uuidv4 = require('uuid/v4');
const { getMapper, initScale, getRole } = require('./mapping');
const Promise = require('bluebird');
const _ = require('lodash');

const FIELD = 'field';
const FIELDS = 'fields';
const ELEMENT = 'element';
const ELEMENTS = 'elements';

class AJsonToSJson {

  /**
   * @param {PXmlToPJsonModel} pXmlToPJsonModel
   * @param {PJsonToAJsonModel} pJsonToAJsonModel
   * @param {SnapshotModel} snapshotModel
   * @param {canvasRender} canvasRender
   * @param {OperationsConstants} operationsConstants
   */
  constructor({ pXmlToPJsonModel, pJsonToAJsonModel, snapshotModel, canvasRender, operationsConstants }) {
    this.pXmlToPJsonModel = pXmlToPJsonModel;
    this.pJsonToAJsonModel = pJsonToAJsonModel;
    this.snapshotModel = snapshotModel;
    this.canvasRender = canvasRender;
    this.operationConstants = operationsConstants;
  }

  groupByType(fields) {
    const result = {};

    fields.forEach((item) => {
      if (!result[item.type]) { result[item.type] = []; }
      result[item.type].push(item);
    });

    return result;
  }

  async convert(fields, type, pagesSizes = []) {
    const fieldsPages = [];
    const radioGroups = {};
    const ROLE_ID = uuidv4();

    const scale = initScale(pagesSizes);

    await Promise.map(fields.list, (async (page, index) => {
      if (_.isArray(page)) {
        await Promise.map(page, (async (field) => {
          field.roleId = ROLE_ID;
          field.pageId = index;

          if (field.radioGroup) {
            if (!radioGroups[field.radioGroup]) { radioGroups[field.radioGroup] = []; }
            return radioGroups[field.radioGroup].push(field);
          }

          const baseMapper = getMapper(field.type, field.subType);

          if (baseMapper) {
            const pageScale = v => scale(v, index);
            const mapper = { ...baseMapper, scale: pageScale, getRole, render: this.canvasRender };
            const snField = await baseMapper[type](field, mapper);

            fieldsPages.push(snField);
          }
        }));
      }
    }));

    Object.keys(radioGroups).forEach((groupName) => {
      const baseMapper = getMapper('radio');

      if (baseMapper) {
        const pageId = radioGroups[groupName].length ? radioGroups[groupName][0].pageId : 0;
        const pageScale = v => scale(v, pageId);
        const mapper = { ...baseMapper, scale: pageScale, getRole };
        const snField = baseMapper[type](radioGroups[groupName], mapper);

        fieldsPages.push(snField);
      }
    });

    return fieldsPages;
  }

  async preBehavior(document, options) {
    const { pJsonToAJsonModel, operationConstants } = this;
    const { CHECKMARK } = operationConstants.TYPE;

    const content = _.get(document, 'content.list', false);
    const template = _.get(document, 'fields.list', false);
    const pages = _.get(document, 'pages.list', false);
    const __mapTemplate = _.get(document, '__mapTemplate.list', false);

    if (content && __mapTemplate) {
      content.forEach((page) => {
        page.filter(contentObject => contentObject.linkId).forEach((linkedObject) => {
          const el = __mapTemplate[linkedObject.linkId];
          const originEl = _.find(template[el.pageId], { id: el.id });

          if (originEl && originEl.radioGroup) {
            linkedObject.radioGroup = originEl.radioGroup;
          }
        });
      });
    }

    if (content) {
      document.contentImages =
        pJsonToAJsonModel.getImagesInJSONContent(content);

      content.forEach(page => _.remove(page, item => item.type === CHECKMARK && (!item.checked && !item.radioGroup)));
    }

    if (content && __mapTemplate) {
      content.forEach((page) => {
        page.filter(contentObject => contentObject.linkId).forEach((linkedObject) => {
          const el = __mapTemplate[linkedObject.linkId];
          const originEl = _.find(template[el.pageId], { id: el.id });
          let index = -2;

          if (originEl) {
            index = template[el.pageId].indexOf(originEl);
          }

          if (originEl && originEl.radioGroup) {
            linkedObject.radioGroup = originEl.radioGroup;
          }

          if (options.removeFilledTemplate && el && index >= 0) { template[el.pageId].splice(index, 1); }
        });
      });
    }

    if (template && pages && pages.length) {
      template.forEach((page, index) => _.remove(page, () => {
        const pageConfig = _.find(pages, { source: index });

        return !pageConfig.visible;
      }));
    }

    return document;
  }

  async do(key, value, options) {
    const pagesSizes = _.get(options, 'document.__pagesSizes', []);

    if (key === FIELDS) {
      return this.convert(value, FIELD, pagesSizes);
    } else if (key === ELEMENTS) {
      const container = await this.convert(value, ELEMENT, pagesSizes);

      return this.groupByType(container);
    }

    return value.list || value;
  }

  async postBehavior(document) {
    try {
      const template = _.get(document, 'fields', []);
      const pages = _.get(document, 'pages', []);

      if (template && pages && pages.length) {
        template.forEach((templateItem) => {
          const pageConfig = _.find(pages, { source: templateItem.page_number });
          const pageIndex = pages.indexOf(pageConfig);

          templateItem.page_number = pageIndex;
          if (templateItem.radio) {
            templateItem.radio.forEach((radio) => {
              radio.page_number = pageIndex;
            });
          }
        });
      }

      return document;
    } catch (e) {
      throw e;
    }
  }
}

module.exports = AJsonToSJson;
