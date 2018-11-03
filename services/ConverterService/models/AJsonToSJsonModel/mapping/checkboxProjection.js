const projections = require('./projections');

const toType = () => ({ type: 'checkbox' });

const toField = (parent, mapper) => ({ ...projections.field(parent, mapper) });

const toElement = (parent, mapper) => ({ ...projections.element(parent, mapper) });

module.exports = {
  ...projections,
  type: toType,
  field: toField,
  element: toElement,
};
