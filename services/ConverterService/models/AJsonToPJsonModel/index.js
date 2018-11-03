const TEMPLATE = 'template';
const FIELDS = 'fields';
const METADATA = 'metadata';
const LIST = 'list';
const ORIGIN = 'origin';
const TEMPLATE_FEILDS = 'data';
const VERSION = 'version';
const DEFAULT_VERSION = '1.0';

const ENABLED_STRUCTURE = [
  'content',
  'pages',
  'attributes',
  'fields',
  'roles',
  'comments',
  'images',
  'attachments',
];

class AJsonToPJsonModel {

  convertContent(value) {
    if (value[METADATA]) {
      delete value[METADATA];
    }

    if (value[LIST]) {
      value = value[LIST];
    } else {
      value = [];
    }

    return value.map((page, next) => page.map(this.convertObject, next));
  }

  convertFields(fields) {
    return {
      [ORIGIN]: fields[METADATA][ORIGIN],
      [VERSION]: DEFAULT_VERSION,
      [TEMPLATE_FEILDS]: fields[LIST],
    };
  }

  convertObject(value) {
    return (value[LIST] && value[METADATA]) ? value[LIST] : value;
  }

  convert(value) {
    if (value.content) {
      return this.convertContent(value.content);
    } else if (value.fields) {
      return this.convertFields(value.fields);
    } else if (value.attributes) {
      return this.convertObject(value.attributes);
    } else if (value.pages) {
      return this.convertObject(value.pages);
    } else if (value.roles) {
      return this.convertObject(value.roles);
    } else if (value.comments) {
      return this.convertObject(value.comments);
    }
    return this.convertObject(value);
  }

  do(key, value) {
    const handleCallback = (reply) => {
      if (key === 'pdfUrl') {
        return reply[key];
      }
      return reply[key] || reply;
    };

    if (!ENABLED_STRUCTURE.includes(key)) {
      return handleCallback({ [key]: value });
    }
    return handleCallback(this.convert({ [key]: value }));
  }

  preBehavior(document) {
    if (document.content) {
      const imagesContent = {};

      document.content.list.forEach(page => page.filter(item => item.imageId).forEach((item) => {
        imagesContent[item.id] = item;
      }));

      Object.keys(document.images).forEach((id) => {
        imagesContent[id].imageId = document.images[id].imageId;
        imagesContent[id].url = document.images[id].url;
      });
    }

    delete document.images;
    delete document.attachments;

    return document;
  }

  postBehavior(document) {
    if (document[FIELDS]) {
      document[TEMPLATE] = document[FIELDS];
      delete document[FIELDS];
    }

    return document;
  }

}

module.exports = AJsonToPJsonModel;
