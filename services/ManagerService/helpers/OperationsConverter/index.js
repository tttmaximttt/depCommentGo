/* eslint-disable no-plusplus */

const EnabledProperty = require('./EnabledProperty');
const Elements = require('./Elements');
const defaultTemplateJson = require('./defaults/templateJSON');
const _ = require('lodash');
const fp = require('lodash/fp');
const migrationData = require('./defaults/migration');

const DEFAULT_TOOL_TEXT_ID = 'tools.text.*';
const DEFAULT_TOOL_TEXT_DROPDOWN_ID = 'tools.text.dropdown';
const DEFAULT_TEMPLATE_INITIAL = {
  EXTERNAL: '0',
  INTERNAL: false,
};

const dateInitialIsDate = ({ date }) => Array.from(date).some(el => !!Number(el));

class OperationsConverter {
  constructor({ operationsConstants, operationsFactory, errorFactory, memory,
      logSystem, constantsEvents, coreUtils, config, activityHistoryConstants }) {
    this.operationsConstants = operationsConstants;
    this.operationsFactory = operationsFactory;
    this.logSystem = logSystem;
    this.memory = memory;
    this.elements = Elements;
    this.constantsEvents = constantsEvents;
    this.config = config;

    this.enabledPropertyService = new EnabledProperty();
    this.coreUtils = coreUtils;
    this.channel = activityHistoryConstants.channel;
    this.errorFactory = errorFactory;
  }

  fromAuthData(data, uid) {
    const result = [];
    const { operationsFactory, operationsConstants } = this;
    const { GROUP, TYPE } = operationsConstants;

    // eslint-disable-next-line no-param-reassign
    if (typeof data === 'object') delete data.handleAuth;

    Object.keys(data).forEach((group) => {
      Object.keys(data[group]).forEach((type) => {
        if (GROUP[group.toUpperCase()] && TYPE[type.toUpperCase()]) {
          const operation = operationsFactory.create(group, type, false, data[group][type]);

          if (type === TYPE.DEFAULTS) {
            this.handleDefaultOperation(operation, uid); // mutates the operation
          }

          result.push(operation);
        }
      });
    });

    const ops = result.reduce((m, op) => {
      if (op.properties.group === 'document' && op.properties.type === 'source') {
        m.ds = op;
        return m;
      }
      if (op.properties.group === 'editor' && op.properties.type === 'locale') {
        m.el = op;
        return m;
      }
      m.items.push(op);
      return m;
    }, { items: [] });
    // const operations = [].concat(ops.el, ops.items, ops.ds);
    // TODO: remove when Oleh Illin wil add migration on backend side
    const operations = this.defaultsMigration(
      ['el', 'items', 'ds'].reduce((m, prop) => m.concat(_.get(ops, prop, [])), [])
    );

    return operations;
  }

  defaultsMigration(operations) {
    const { operationsConstants, logSystem, errorFactory } = this;
    const { GROUP, TYPE } = operationsConstants;

    try {
      return operations.map((op) => {
        const { group, type } = op.properties;

        if (group === GROUP.EDITOR && type === TYPE.DEFAULTS) {
          let { template = [], content } = op.properties;

          template = template.map((tpl) => {
            if (_.get(tpl, 'id') === 'tools.text.*' && !_.get(tpl, 'fontColor', false)) {
              _.set(tpl, 'fontColor', '000000');
            }
            return tpl;
          });
          template = _.unionBy(template, migrationData.template, 'id');
          content = _.unionBy(content, migrationData.content, 'id');
          op.properties = Object.assign(op.properties, { template, content });
        }
        return op;
      });
    } catch (err) {
      const error = errorFactory.systemError(err, null, 'OperationsConverter.defaultsMigration');

      logSystem.error(error.group, { ...error });

      return operations;
    }
  }

  handleDefaultOperation(operation, uid) {
    const { constantsEvents, logSystem } = this;

    if (!operation.properties.content) {
      logSystem.info(constantsEvents.EMPTY_DEFAULTS, {
        uid,
        properties: operation.properties,
      });
      operation.properties.content = [];
    }
    operation.properties.content.forEach((item) => {
      if (item.id === DEFAULT_TOOL_TEXT_ID) {
        // front-end expects fontColor in defaults
        if (item.color && !item.fontColor) item.fontColor = item.color;

        if (item.fontColor) item.color = item.fontColor;
      }
    });

    if (!operation.properties.template) {
      logSystem.info(constantsEvents.EMPTY_DEFAULTS, {
        uid,
        properties: operation.properties,
      });
      operation.properties.template = [];
    }
    operation.properties.template.forEach((item) => {
      // front-end expects initial as boolean
      if (_.has(item, 'initial') && item.initial === DEFAULT_TEMPLATE_INITIAL.EXTERNAL) {
        item.initial = DEFAULT_TEMPLATE_INITIAL.INTERNAL;
      }

      // front-end expects to has array property list
      if (item.id === DEFAULT_TOOL_TEXT_DROPDOWN_ID) {
        item.list = [];
      }
    });
  }

  _substituteSubType(operation) {
    const { SUB_TYPE } = this.operationsConstants;
    const { subType } = _.get(operation, 'properties', null);
    const templateSubType = _.get(operation, 'properties.template.subType', null);
    const contentSubType = _.get(operation, 'properties.content.subType', null);

    if (subType === SUB_TYPE.NONE && contentSubType) {
      operation.properties.subType = contentSubType;
    } else if (subType === SUB_TYPE.NONE && templateSubType) {
      operation.properties.subType = templateSubType;
    }

    return operation;
  }

  fromContentAndTemplate(content, templateJSON, owner, authData, comments, operationHook = () => {}) {
    const { operationsFactory, operationsConstants, enabledPropertyService } = this;
    const { TYPE } = operationsConstants;
    const { data: template, origin } = templateJSON;
    const templateChecker = {};
    const result = {};

    if (template) {
      template.forEach((page, pageId) => {
        result[pageId] = [];
        templateChecker[pageId] = {};

        if (Array.isArray(page)) {
          page.forEach((element) => {
            const { id, type } = element;
            const data = operationsFactory.putDefaultFields(element);

            data.required = !!data.required;

            if (data.type === TYPE.CHECKMARK || data.type === TYPE.TEXT) {
              data.master = origin === 'auto' ? Boolean(data.master) : true;
            }

            if (
              data.type === TYPE.SIGNATURE &&
              !Object.prototype.hasOwnProperty.call(data, 'restrictSubTypes') &&
              data.subtype === 'initials'
            ) {
              data.restrictSubTypes = ['initials'];
            }

            templateChecker[pageId][id] = result[pageId].length; // save position on page
            // todo: ask about this, not all do have type & subtype (subType?)
            const operationTemplate = operationsFactory.template(type, data, pageId);

            result[pageId].push(operationTemplate);
          });
        }
      });
    }

    if (content) {
      content.forEach((page, pageId) => {
        if (!result[pageId]) result[pageId] = [];
        if (!templateChecker[pageId]) templateChecker[pageId] = {};
        if (Array.isArray(page)) {
          page.forEach((element) => {
            const { type, linkId } = element;
            const positionOnPage = templateChecker[pageId][linkId];

            if (linkId && positionOnPage >= 0) {
              result[pageId][positionOnPage].properties.content = element;
            } else {
              const operationContent = operationsFactory.content(type, element, pageId);

              result[pageId].push(operationContent);
            }
          });
        }
      });
    }

    if (Array.isArray(comments)) {
      comments.forEach((page, pageId) => {
        if (!result[pageId]) result[pageId] = [];
        if (Array.isArray(page)) {
          page.forEach((element) => {
            const operation = operationsFactory.getComment(element, pageId);

            result[pageId].push(operation);
          });
        }
      });
    }

    const resultFlattened = fp.flow(fp.values, fp.flatten)(result);
    const noContentFromUser = !fp.some('properties.content', resultFlattened);

    resultFlattened.forEach((operation) => {
      operation = this._substituteSubType(operation);
      this.handleOperationData(operation, Number(owner) ? Number(owner) : owner, noContentFromUser);
      operationHook(operation);
    });
    if (!_.isEmpty(resultFlattened)) {
      const auth = {
        access: _.get(authData, 'document.access'),
        viewerId: _.get(authData, 'auth.project.viewer.id'),
      };

      if (!_.isUndefined(auth.access) && !_.isUndefined(auth.viewerId)) {
        enabledPropertyService.apply(resultFlattened, auth);
      }
    }

    return resultFlattened;
  }

  _getTextContent(template, subType) {
    const { SUB_TYPE } = this.operationsConstants;

    if (subType === SUB_TYPE.DATE) {
      return '';
    }
    return template.initial;
  }

  handleOperationData(operation, owner, fillInitial) {
    const { operationsConstants, logSystem, errorFactory } = this;
    const { TYPE } = operationsConstants;
    const { template, content, type, subType } = operation.properties;

    try {
      if (template) {
        if (content) {
          if (!content.linkId && template.id !== undefined) {
            content.linkId = template.id;
          }

          if (template.valign) {
            content.x = template.x;
            content.y = template.y;
            content.valign = template.valign;
            content.height = template.height;
          }

          if (!content.owner) Object.assign(content, { owner });
        }

        if (template.initial && fillInitial) {
          // this assignment caused checkmarks to break:
          // Object.assign(content, template, { owner });
          if (type === TYPE.TEXT) {
            operation.properties.content = Object.assign({}, template, { owner });
            operation.properties.content.text = this._getTextContent(template, subType);
          }

          if (type === TYPE.CHECKMARK && Number(template.initial)) {
            template.initial = !!Number(template.initial);
            operation.properties.content = Object.assign({}, template, { owner });
            operation.properties.content.checked = template.initial;
          }
        }
      }
    } catch (err) {
      const error = errorFactory.systemError(err, null, 'OperationsConverter.handleOperationData');

      logSystem.error(error.group, { ...error });
    }
  }

  fromConfig(config) {
    const { operationsFactory, operationsConstants } = this;
    const { GROUP, TYPE } = operationsConstants;
    const configOperations = [];
    let pagesOperation;

    if (config.pages) {
      pagesOperation = operationsFactory.pages(config.pages);
      if (_.get(pagesOperation, 'properties.pages', []).length) {
        configOperations.push(pagesOperation);
      }
    }

    if (config.attributes) {
      Object.keys(config.attributes).forEach((subType) => {
        const data = config.attributes[subType];

        if (data.content) {
          configOperations.push(
            operationsFactory.create(GROUP.TOOLS, TYPE.ATTRIBUTES, subType, data)
          );
        }
      });
    }

    return { configOperations, pagesOperation };
  }

  // todo deprecated
  idToKey(id) {
    if (id) {
      return `${id.clientId}-${id.localId}`;
    }
    return false;
  }

  _getSignatureSubType(element) {
    const propertyLevelSubtype = _.get(element, 'subType', 'none');
    const contentLevelSubtype = _.get(element, 'content.subType', 'none');

    return propertyLevelSubtype === 'none' ? contentLevelSubtype : propertyLevelSubtype;
  }

  toContent(pages) {
    const { TYPE, GROUP } = this.operationsConstants;

    const rules = (element) => {
      if ((element.type === TYPE.TEXT && _.get(element, 'content.text', '') === '')) {
        return false;
      } else if ((element.type === TYPE.SIGNATURE &&
          this._getSignatureSubType(element) === 'none')) {
        return false;
      } else if (element.subType === 'initials' && _.get(element, 'content.subType', '') === '') {
        return false;
      } else if (element.group === GROUP.TOOLS && !element.content) {
        return false;
      }
      return true;
    };

    return fp.map(
      fp.flow(
        fp.filter(
          element => _.get(element, 'content.visible', true) && rules(element)
        ),
        fp.map(
          fp.flow(
            (element) => {
              delete element.id;
              return element;
            },
            element => ({ ...element, ...element.content }),
            fp.omit(['template', 'content'])
          )
        )
      )
    )(pages);
  }

  toTemplate(pages) {
    // no any changes in elements templates
    if (pages.length === 0) return [];

    return fp.map(
      fp.flow(
        fp.filter(element =>
          !!element &&
          _.get(element, 'template.visible', true) &&
          element.group === 'tools' && !!element.type && element.template
        ),
        fp.map(element =>
          _.pick({
            ...element,
            ...element.template,
            ...this.setExtraPropsTemplate(element),
          }, defaultTemplateJson[element.type][element.subType])
        )
      )
    )(pages);
  }

  toConfig(elements) {
    const result = {
      content: {
        useEmbedFonts: true,
        useSigDateStamp: false,
        fillableVersion: 0.0,
      },
      pages: [],
      attributes: {},
    };

    for (let i = 0, len = elements.length; i < len; i++) {
      if (elements[i].pages) {
        result.pages = elements[i].pages;
      } else {
        switch (elements[i].subType) {
          case 'watermark':
            result.attributes.watermark = elements[i];
            break;
          case 'date':
            result.attributes.date = elements[i];
            break;
          case 'numbering':
            result.attributes.numbering = elements[i];
            break;
          default:
            break;
        }
      }
    }

    return result;
  }

  toDefaults(operation) {
    return operation && operation.properties;
  }

  toPages(operation) {
    return _.get(operation, 'properties.pages', []);
  }

  mergeOperationsById(operations, isProcessingHandle, processHandle) {
    return fp.values(operations.reduce((flatOperations, operation) => {
      if (!isProcessingHandle || isProcessingHandle(operation)) {
        processHandle && processHandle(operation);
        if (Elements.isOperationElement(operation)) {
          Elements.applyElement(flatOperations, operation);
        }
      }
      return flatOperations;
    }, {}));
  }

  /**
   *
   * @param operations
   * @private
   */
  _getTemplateIdsMap(operations) {
    const data = operations.reduce((result, operation) => {
      const templateId = _.get(operation, 'properties.template.id', null);

      if (templateId) result.push(templateId);
      return result;
    }, []);

    return _.compact(data);
  }

  toDocument(operations, clearDataFlag = false, editorData = {}) {
    const templateIdsArr = this._getTemplateIdsMap(operations);
    const { operationsConstants, config } = this;
    let isTemplateChanged = false;
    const { TYPE, SUB_TYPE, EDITOR_MODE } = operationsConstants;
    const templateIsChangedWatcher = Elements.templateIsChangedWatcher(TYPE, EDITOR_MODE, config);
    const pagesWatcher = Elements.pagesWatcher(TYPE);
    const nativeAppWatcher = Elements.nativeAppWatcher(editorData);
    const orderValueWatcher = Elements.orderValueWatcher();
    const document = Elements.createEmptyDocument();
    const reducedOps = operations.reduce((flatOperations, operation) => {
      if (Elements.isOperationsForProcessing(operation.id, config, clearDataFlag)) {
        pagesWatcher(operation);
        isTemplateChanged = templateIsChangedWatcher(operation);
        nativeAppWatcher(operation);
        orderValueWatcher(operation);

        if (Elements.isOperationElement(operation)) {
          Elements.applyElement(flatOperations, operation, templateIdsArr);
        }
      }

      return flatOperations;
    }, {});

    const getNextOrderValue = Elements.orderCurrentValue(orderValueWatcher());

    Object.values(reducedOps).forEach((operation) => {
      if (!operation.properties) return;

      const { type, subType, pageId, content, template } = operation.properties;

      if (type === TYPE.PAGES) {
        return Elements.constructDocumentPages(document, operation);
      }

      if (type === TYPE.ATTRIBUTES) {
        return Elements.constructDocumentAttributes(document, operation, subType);
      }

      if (type === TYPE.COMMENT) {
        return Elements.constructDocumentComment(document, content, pageId);
      }

      if (content) {
        Elements.constructDocumentContent(document, operation, pageId);
      }

      // todo: template mutates, now we need to update it every time
      if (template && type !== TYPE.DEFAULTS) {
        Elements.prepareElementToConvertation(operation, SUB_TYPE);
        Elements.constructDocumentTemplate(document, operation, pageId, getNextOrderValue);
      }
    });

    document.templateJSON = this.toTemplate(document.templateJSON);
    document.contentJSON = this.toContent(document.contentJSON);
    document.pagesJSON = this.toPages(pagesWatcher());

    return { document, isTemplateChanged };
  }

  setFillableFieldsMode(scenarios, fillableFieldsMode) {
    if (scenarios.action === 'welcome.show' && scenarios.apply && scenarios.params) {
      scenarios.params.fillableFieldsMode = fillableFieldsMode;
    }
    Object.keys(scenarios)
      .filter(key => Array.isArray(scenarios[key]))
      .forEach((key) => {
        scenarios[key].forEach(item => this.setFillableFieldsMode(item, fillableFieldsMode));
      });
  }

  isOperation(operation) {
    return _.get(operation, 'properties.group') && _.get(operation, 'properties.type');
  }

  isScenariosOperation(operation) {
    const { GROUP, TYPE } = this.operationsConstants;

    return _.get(operation, 'properties.type') === TYPE.SCENARIOS &&
      _.get(operation, 'properties.group') === GROUP.EDITOR;
  }

  modifyContent(contentJSON) {
    const { TYPE } = this.operationsConstants;
    const { ERASE, BLACKOUT } = TYPE;

    return contentJSON.map((page = []) =>
      page.map((element) => {
        if (element.type === BLACKOUT || element.type === ERASE) {
          element = this.modifyElement(element);
        }
        if (element.hyperlink) return this.modifyHyperlink(element);

        return element;
      })
    );
  }

  modifyElement(element) {
    return _.assign(element, {
      rect: this.fixRect(element),
      clearUnderlying: true,
    });
  }

  modifyHyperlink(element) {
    return _.assign(element, {
      rect: this.fixRect(element),
      addHyperlink: element.hyperlink,
    });
  }

  fixRect(element) {
    return _.get(element, 'rect', {
      rectX: element.x,
      rectY: element.y,
      rectWidth: element.width,
      rectHeight: element.height,
    });
  }

  flattenOperations(operations) {
    if (operations.length) {
      return operations.reduceRight((accum, operation) => {
        if (
          _.get(operation, 'properties.group') === 'tools' &&
          _.has(operation, 'properties.element')
        ) {
          const visible = _.get(operation, 'properties.content.visible', true);

          const element = accum.find(checkedElement => (
            _.isEqual(
              _.get(operation, 'properties.element.clientId'),
              _.get(checkedElement, 'properties.element.clientId')
            ) &&
            _.isEqual(
              _.get(operation, 'properties.element.localId'),
              _.get(checkedElement, 'properties.element.localId')
            )
          ));

          if (element) {
            accum.splice(accum.indexOf(element), 1);

            if (visible) return [...accum, _.merge(element, operation)];
          }

          if (visible) return [...accum, operation];
        }

        return accum;
      }, []);
    }

    return [];
  }

  getElementOperations(operations) {
    if (operations.length) {
      if (operations.length > 1) {
        return operations.reduceRight((accum, operation) => {
          if (_.get(operation, 'properties.type') === 'pages') return accum;

          return [...accum, operation];
        }, []);
      }

      return _.get(operations, '0.properties.type') === 'pages' ? [] : operations;
    }

    return [];
  }

  setExtraPropsTemplate(element) {
    const { TYPE } = this.operationsConstants;

    if (element.type === TYPE.TEXT && element.subType === 'date') {
      // Look at the doc:
      // https://pdffiller.atlassian.net/wiki/spaces/PD/pages/58984966/Constructor
      return {
        initial: this.getInitialDate({ ...element }),
        subtype: `current+${element.template.format || 'MM/dd/yyyy'}`,
      };
    }

    return {
      subtype: element.subType === 'none' ? null : element.subType,
    };
  }

  getInitialDate({ template }) {
    // No date
    if (
      template.initial && template.format &&
      template.initial.toUpperCase() === template.format.toUpperCase()
    ) return template.format.toUpperCase();
    // Custom Date
    if (template.initial && dateInitialIsDate({ date: template.initial })) {
      return template.initial;
    }
    // User's system date
    return '';
  }

  getValidImagesContent(uid, content) {
    const { SUB_TYPE, TYPE } = this.operationsConstants;
    const { logSystem, channel, errorFactory } = this;

    const keysValidator = keysList => element => _.every(keysList, _.partial(_.has, element));
    const imageFilter = ({ type, subType }) => (type === TYPE.IMAGE || subType === SUB_TYPE.IMAGE);
    const filledImageFilter = keysValidator(['id', 'owner']);
    const validImageFilter = keysValidator(['x', 'y', 'height', 'width']);
    const invalidImageFilter = _.negate(validImageFilter);

    const images = _.filter(_.flatten(content), imageFilter);
    const invalidImages = _.filter(images, invalidImageFilter);
    const validImages = _.filter(images, validImageFilter);

    if (invalidImages.length) {
      const err = new Error('invalid images found, xmljson-transducer will fail');
      const error = errorFactory.conversionError(
        err,
        { uid, invalidImages, channel: channel.SERVER },
        'OperationsHelper.getValidImagesContent'
      );

      logSystem.error(err.group, { ...error });

      content.forEach((operations, pageNum) => {
        content[pageNum] = _.differenceWith(operations, invalidImages, _.isEqual);
      });
    }
    const filledImages = _.filter(validImages, filledImageFilter);
    const filterForSignature = (item) => {
      if (Object.prototype.hasOwnProperty.call(item, 'id') && !item.id && item.imageId) {
        item.id = item.imageId;
      }
      return item;
    };

    const imagesMap = _.groupBy(filledImages.map(filterForSignature), 'owner');

    return { imagesMap, validContent: content };
  }

}

module.exports = OperationsConverter;
