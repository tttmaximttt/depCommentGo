const projections = require('./projections');

const toType = () => ({ type: 'initials' });

const toField = (parent, mapper) => ({ ...projections.field(parent, mapper) });

const toElement = (parent, mapper) => {
  const from = {
    ...parent,
    parent,
  };

  return {
    ...projections.element(parent, mapper),
    data: from.url,
  };
};

module.exports = {
  ...projections,
  type: toType,
  field: toField,
  element: toElement,
};
