const uuidv4 = require('uuid/v4');
const _ = require('lodash');

const ORIGIN = 'origin';
const TEMPLATE_FEILDS = 'data';
const TEMPLATE = 'template';
const FIELDS = 'fields';
const METADATA = 'metadata';
const LIST = 'list';
const STATUS_FINISHED = 'FINISHED';
const AJSON_DPI = 72;
const METADATA_STRUCTURE = {
  ver: 1,
  dpi: AJSON_DPI,
};

const DEFAULT_PATCH_STRUCTURE = {
  [METADATA]: METADATA_STRUCTURE,
  [LIST]: [],
};

const DEFAULT_STRUCTURE = {
  pages: DEFAULT_PATCH_STRUCTURE,
  attributes: DEFAULT_PATCH_STRUCTURE,
  content: DEFAULT_PATCH_STRUCTURE,
  fields: DEFAULT_PATCH_STRUCTURE,
  roles: DEFAULT_PATCH_STRUCTURE,
  comments: DEFAULT_PATCH_STRUCTURE,
  images: [],
  attachments: [],
  pdfUrl: '',
  pdfStatus: STATUS_FINISHED,
};

const ENABLED_STRUCTURE = [
  'content',
  'pages',
  'attributes',
  'template',
  'roles',
  'comments',
];

const SCALED_PROPERTIES = [
  'x', 'y', 'width', 'height', 'fontSize', 'controlPoints', 'rect',
  'lineWidth', 'rectX', 'rectY', 'rectWidth', 'rectHeight', 'curves',
];

const SCALED_OBJECTS = ['rect'];
const SCALED_ARRAYS = ['curves'];

const AVAILABLE_CONTENT_TYPES = ['text', 'checkmark', 'signature'];
const DEFAULT_REQUIRED = true;

class PJsonToAJsonModel {

  convertContent(value, scale) {
    return value.map(
      page => page.map((pageObject) => {
        const obj = this.convertContentObject(pageObject, scale);

        if (typeof obj.fillAlpha === 'string' && !obj.fillAlpha.length) {
          obj.fillAlpha = 1;
        }

        if (obj.id) {
          obj.imageId = obj.id;
        }

        obj.id = uuidv4();

        return obj;
      }));
  }

  convertTemplate(value, scale) {
    return value && value.data ? value.data
      .filter(page => !!page)
      .map(
      page => page.map((pageObject) => {
        const obj = this.convertContentObject(pageObject, scale);

        if (obj.subtype) {
          obj.subType = obj.subtype;
          delete obj.subtype;
        }

        if (obj.subType && obj.subType.includes('current+')) {
          obj.format = obj.subType;
          obj.subType = 'date';
        }

        if (!_.has(obj, 'required')) {
          obj.required = DEFAULT_REQUIRED;
        }

        obj.id = uuidv4();

        return obj;
      })) : [];
  }

  convertContentObject(value, scale) {
    Object.keys(value).forEach((key) => {
      if (SCALED_PROPERTIES.includes(key)) {
        if (SCALED_ARRAYS.includes(key)) {
          value[key] = value[key].map(item => this.convertContentObject(item, scale));
        } else if (SCALED_OBJECTS.includes(key)) {
          value[key] = this.convertContentObject(value[key], scale);
        } else if (_.isArray(value[key])) {
          value[key] = value[key].map(item => item * scale);
        } else {
          value[key] *= scale;
        }
      }
    });

    return value;
  }

  convertContainer(value) {
    return value;
  }

  convert(value, scale) {
    return this.convertContainer(value, scale);
  }

  do(key, value, options) {
    const handleCallback = (reply) => {
      if (key === 'pdfUrl') {
        return reply[key];
      }
      return {
        [METADATA]: Object.assign({}, METADATA_STRUCTURE),
        [LIST]: reply[key] || reply,
      };
    };
    const sourceDpi = options.dpi || AJSON_DPI;
    const scale = sourceDpi === AJSON_DPI ? 1 : AJSON_DPI / sourceDpi;

    if (!ENABLED_STRUCTURE.includes(key)) {
      return handleCallback({ [key]: value });
    }

    if (key === 'content') {
      return handleCallback(this.convertContent(value, scale));
    } else if (key === 'template') {
      return handleCallback(this.convertTemplate(value, scale));
    }
    return handleCallback(this.convert(value, scale));
  }

  preBehavior(document) {
    const templateList = _.get(document, 'template.data', false);

    if (templateList) {
      document.__mapTemplate = [];
      templateList.filter(page => !!page).forEach((page, index) => page.forEach((item) => {
        item.pageId = index;
        document.__mapTemplate[item.id] = item;
      }));
    }

    return document;
  }

  postBehavior(document) {
    if (document.content) {
      document.images = {};
      document.content.list.forEach(page => page.filter(item => item.imageId).forEach((item) => {
        document.images[item.id] = {
          id: item.id,
          imageId: item.imageId,
          url: item.url,
        };
      }));
    }

    if (document[TEMPLATE]) {
      document[FIELDS] = document[TEMPLATE];
      if (document[FIELDS][LIST] && document[FIELDS][LIST][TEMPLATE_FEILDS]) {
        document[FIELDS][METADATA][ORIGIN] = document[FIELDS][LIST][ORIGIN];
        document[FIELDS][LIST] = document[FIELDS][LIST][TEMPLATE_FEILDS];
      }
      delete document[TEMPLATE];
    }

    return Object.assign({}, DEFAULT_STRUCTURE, document);
  }

  getImagesInJSONContent(content) {
    if (!content || !content.length) return null;
    const images = {};

    content.forEach(page => _.isArray(page) && page
      .filter(item => _.get(item, 'type', false) === 'image'
        || _.get(item, 'subType', false) === 'image')
      .forEach((item) => { images[`${item.imageId}`] = item; }));

    return images;
  }

  getUnavailableElements(content) {
    const elements = { list: [] };
    const unavailable = [];

    content.list.forEach((page, pageId) => page.forEach((item) => {
      if (AVAILABLE_CONTENT_TYPES.includes(item.linkId)) {
        if (!elements.list[pageId]) { elements.list[pageId] = []; }
        elements.list[pageId].push(item);
      } else {
        if (!unavailable[pageId]) { unavailable[pageId] = []; }
        unavailable[pageId].push(item);
      }
    }));
    return { elements, unavailable };
  }
}

module.exports = PJsonToAJsonModel;
