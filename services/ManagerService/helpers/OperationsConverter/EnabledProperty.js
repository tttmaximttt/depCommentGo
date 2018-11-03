const _ = require('lodash');

/**
 * Изменяет структуру блока operations. Задает операциям группы tools свойство "enabled"
 */
module.exports = class EnabledProperty {

  /**
   *
   * @param operations
   * @param {object} data - editorAuthData.document (authorization package)
   */
  apply(operations, data = {}) {
    const { access, viewerId } = data;

    if (!access) {
      throw new Error('Invalid `data` parameters.');
    }

    if (_.isEmpty(operations)) {
      throw new Error('Operations list is empty.');
    }

    this._applyBasicContentRules(operations, access, viewerId);
    this._applyTemplateContentRules(operations, access);

    // highest priority
    this._applyRoleRules(operations, access);
  }

  /**
   *
   * @param operations
   * @param access
   * @param viewerId
   */
  mutate(operations, access, viewerId) { // TODO should be removed if not used anywhere
    this._applyBasicContentRules(operations, access, viewerId);
    this._applyTemplateContentRules(operations, access);
    this._applyRoleRules(operations, access);
  }

  /**
   *
   * @param operations
   * @param access
   * @param viewerId
   * @private
   */
  _applyBasicContentRules(operations, access, viewerId) {
    switch (access.basicContent) {
      case 'full':
        operations = operations.forEach((item) => {
          if (
            item.properties.group === 'tools' &&
            !Object.getOwnPropertyDescriptor(item.properties, 'template')
          ) {
            item.properties.enabled = true;
          }
        });
        break;

      case 'my':
        operations = operations.forEach((item) => {
          if (
            item.properties.group === 'tools' &&
            !Object.getOwnPropertyDescriptor(item.properties, 'template')
          ) {
            item.properties.enabled = Boolean(item.owner === viewerId);
          }
        });
        break;

      case 'none':
        operations = operations.forEach((item) => {
          if (
            item.properties.group === 'tools' &&
            !Object.getOwnPropertyDescriptor(item.properties, 'template')
          ) {
            item.properties.enabled = false;
          }
        });
        break;

      default:

    }
  }

  /**
   *
   * @param operations
   * @param access
   * @private
   */
  _applyTemplateContentRules(operations, access) {
    switch (access.templateContent) {

      case 'full':
        operations = operations.forEach((item) => {
          if (
            item.properties.group === 'tools' &&
            !!Object.getOwnPropertyDescriptor(item.properties, 'template')
          ) {
            item.properties.enabled = true;
          }
        });
        break;

      case 'signature':
        // signature - все элементы c секцией template и имеющие тип signature.*
        // или text.date -> enabled = true,
        // иначе всем enabled = false
        operations = operations.forEach((item) => {
          item.properties.enabled =
            item.properties.group === 'tools'
            && !!Object.getOwnPropertyDescriptor(item.properties, 'template')
            && (item.properties.type === 'signature' ||
              (item.properties.type === 'text' && item.properties.subType === 'date')
            );
        });
        break;

      case 'none':
        operations = operations.forEach((item) => {
          if (
            item.properties.group === 'tools' &&
            !!Object.getOwnPropertyDescriptor(item.properties, 'template')
          ) {
            item.properties.enabled = false;
          }
        });
        break;

      default:
    }
  }

  /**
   *
   * @param operations
   * @param access
   * @private
   */
  _applyRoleRules(operations, access) {
    const roleId = Object.getOwnPropertyDescriptor(access, 'roleId')
      ? access.roleId
      : null;

    if (roleId !== null) {
      operations.forEach((item) => {
        // <role_id> - enabled = template.allowEditing.indexOf(<role_id>) != -1
        if (
          item.properties.group === 'tools' &&
          !!Object.getOwnPropertyDescriptor(item.properties, 'template')
        ) {
          const allowEditing = item.properties.template.allowEditing;

          // allowEditing should be an array
          if (allowEditing && allowEditing.indexOf) {
            item.properties.enabled = allowEditing.indexOf(roleId) !== -1;
          }
        }
      });
    }
  }

  /**
   * allowEditing = null : enable = true
   * allowEditing = [] : enable = false
   * allowEditing = [userId] : if userId = viewerId enable = true
   * @param operation
   * @param allowEditing
   */
  applyAllowEditing(operation, allowEditing, userId) {
    let enabled = true;

    if (allowEditing) {
      if (allowEditing.length) {
        const id = Number(userId) ? Number(userId) : userId;

        enabled = allowEditing.indexOf(id) >= 0;
      } else {
        enabled = false;
      }
    }

    return enabled;
  }

};
