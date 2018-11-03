const projections = require('./projections');

const toType = () => ({ type: 'attachment' });

const toField = (parent, mapper) => ({ ...projections.field(parent, mapper) });

const toElement = (parent, mapper) => {
  const from = {
    ...parent,
  };

  return {
    ...projections.element(parent, mapper),
    attachment_unique_id: from.fileId,
  };
};

module.exports = {
  ...projections,
  type: toType,
  field: toField,
  element: toElement,
};
