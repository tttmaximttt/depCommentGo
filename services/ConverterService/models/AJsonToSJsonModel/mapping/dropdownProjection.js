const projections = require('./projections');

const toType = () => ({ type: 'enumeration' });

const toElementType = () => ({ type: 'text' });

const toOptions = from => ({ enumeration_options: from.list.map(item => item.data) });

const toField = (parent, mapper) => {
  const from = {
    ...parent,
    parent,
  };

  return {
    ...projections.field(parent, mapper),
    ...toOptions(from),
    custom_defined_option: from.allowCustomText,
    label: from.initials,
  };
};

const toElement = (parent, mapper) => {
  const from = {
    ...parent,
    parent,
  };

  return {
    ...projections.element(parent, mapper),
    data: from.text,
    size: 12,
    font: 'Arial',
  };
};

module.exports = {
  ...projections,
  type: toType,
  field: toField,
  element: toElement,
  elementType: toElementType,
};
