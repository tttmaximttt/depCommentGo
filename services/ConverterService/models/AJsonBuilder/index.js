const _ = require('lodash');

class AJsonBuilder {

  /**
   * @param {OperationsConstants} operationsConstants
   */
  constructor({ operationsConstants }) {
    this.operationsConstants = operationsConstants;
  }

  getSignatureValue(contentObject) {
    const { SUB_TYPE } = this.operationsConstants;

    switch (contentObject.subType) {
      case SUB_TYPE.TEXT:
        return { value: contentObject.text, subType: contentObject.subType };
      case SUB_TYPE.IMAGE:
        return this.getImageValue(contentObject);
      case SUB_TYPE.CURVE:
        return { value: contentObject.curves, subType: contentObject.subType };
      default:
        return null;
    }
  }

  getImageValue(contentObject) {
    return {
      value: contentObject.url,
      ...(contentObject.subType && { subType: contentObject.subType }),
    };
  }

  getContentValue(contentObject) {
    const { TYPE } = this.operationsConstants;

    switch (contentObject.type) {
      case TYPE.TEXT:
        return { value: contentObject.text };
      case TYPE.CHECKMARK:
        return { value: contentObject.checked };
      case TYPE.SIGNATURE:
        return this.getSignatureValue(contentObject);
      case TYPE.IMAGE:
        return this.getImageValue(contentObject);
      default:
        return null;
    }
  }

  createDictionaryObject(templateObject, linkedObject) {
    const { SUB_TYPE } = this.operationsConstants;

    let subType = templateObject.subType || templateObject.subtype;
    let format;

    if (subType && subType.includes('current+')) {
      format = subType;
      subType = SUB_TYPE.DATE;
    }

    return {
      id: templateObject.id,
      name: templateObject.name,
      type: templateObject.type,
      ...(subType && { subType }),
      format,
      ...(linkedObject && this.getContentValue(linkedObject)),
      ...(templateObject.list && { list: templateObject.list }),
      ...(templateObject.radioGroup && { radioGroup: templateObject.radioGroup }),
      ...(templateObject.required && { required: templateObject.required }),
    };
  }

  setContentValue(namedObject, item) {
    const { TYPE, SUB_TYPE } = this.operationsConstants;

    switch (namedObject.type) {
      case TYPE.TEXT:
        namedObject.text = item.value;
        break;
      case TYPE.CHECKMARK:
        namedObject.checked = item.value;
        break;
      case TYPE.SIGNATURE:
        if (namedObject.subType === SUB_TYPE.INITIALS) {
          namedObject.subType = item.subType;
        }
        break;
      default:
        return null;
    }
  }

  validateElement(element) {
    const { TYPE } = this.operationsConstants;

    switch (element.type) {
      case TYPE.TEXT:
        return !!element.text;
      case TYPE.SIGNATURE:
        return !!element.subType;
      default:
        return true;
    }
  }

  createContentValue(namedObject, item) {
    const content = Object.assign({}, namedObject);

    content.subType = content.subtype;
    content.linkId = namedObject.id;
    this.setContentValue(content, item);
    return content;
  }

  buildDictionary(content, template) {
    const linkedContent = {};
    const dictionary = [];
    const contentList = _.get(content, 'list', []);
    const templateList = _.get(template, 'list', []);

    contentList.forEach((page) => {
      _.isArray(page) && page.filter(contentObject => contentObject.linkId).forEach((linkedObject) => {
        linkedContent[linkedObject.linkId] = linkedObject;
      });
    });

    templateList.forEach((page) => {
      page.forEach((templateObject) => {
        dictionary.push(
          this.createDictionaryObject(templateObject, linkedContent[templateObject.id]));
      });
    });

    return dictionary;
  }

  buildContent(content, template, dictionary, { ownerId }) {
    const linkedContent = {};
    const namedTemplate = {};

    content.list.forEach((page) => {
      page.filter(contentObject => contentObject.linkId).forEach((linkedObject) => {
        linkedContent[linkedObject.linkId] = linkedObject;
      });
    });

    template.list.forEach((page, pageId) => {
      page.filter(templateObject => templateObject.name).forEach((namedObject) => {
        namedObject.pageId = pageId;
        if (!namedTemplate[namedObject.name]) {
          namedTemplate[namedObject.name] = [];
        }
        namedTemplate[namedObject.name].push(namedObject);
      });
    });

    dictionary.forEach((item) => {
      if (namedTemplate[item.name]) {
        const namedObjects = namedTemplate[item.name];

        namedObjects.forEach((namedObject) => {
          if (linkedContent[namedObject.id]) {
            this.setContentValue(linkedContent[namedObject.id], item);
          } else {
            const linkedObject = this.createContentValue(namedObject, item);

            linkedObject.owner = ownerId;
            if (!content.list[namedObject.pageId]) {
              content.list[namedObject.pageId] = [];
            }

            content.list[namedObject.pageId].push(linkedObject);
          }
        });
      }
    });

    content.list.forEach((page, index) => {
      content.list[index] = page.filter(item => this.validateElement(item));
    });

    return content;
  }
}

module.exports = AJsonBuilder;
