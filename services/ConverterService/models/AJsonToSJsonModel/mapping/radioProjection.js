const projections = require('./projections');

const toPageNumber = from => ({ page_number: from.pageId });

const toType = () => ({ type: 'radiobutton' });

const isNew = from => !(from.original && !from.original.field_id);

const toCreated = (from, mapper) => {
  if (!mapper.isNew(from)) return null;

  return {
    created: Date.now(),
  };
};

const toRadio = (from, parent, mapper) => ({
  ...(from.original && !from.original.field_id ? from.original : {}),
  ...mapper.pageNumber(parent, mapper),
  ...mapper.position(from, mapper),
  ...mapper.size(from, mapper),
  ...toCreated(from, mapper),
  checked: from.checked ? 1 : 0,
  value: from.name,
});

const toRadios = (from, mapper) =>
  ({ radio: from.radio.map(radio => ({ ...toRadio(radio, from, mapper) })) });

const toField = (parent, mapper) => {
  const from = {
    ...parent[0],
    radio: parent,
    parent,
  };

  return {
    ...projections.field(from, mapper),
    ...toRadios(from, mapper),
    name: from.name,
  };
};

const toElement = (parent, mapper) => {
  const from = {
    ...parent,
    radio: parent,
    parent,
  };

  return {
    ...(from.original && !from.original.field_id ? from.original : {}),
    ...mapper.elementType(from, mapper),
    ...mapper.pageNumber(from, mapper),
    ...mapper.position(from, mapper),
    ...mapper.clientTimestamp(from, mapper),
    ...mapper.fieldId(from, mapper),
    ...toRadios(from, mapper),
    ...mapper.pageNumber(from, mapper),
    status: 1,
    size: 12,
    font: 'Arial',
    is_printed: 0,
    line_height: 12,
    field_name: 'radio',
  };
};

module.exports = {
  ...projections,
  pageNumber: toPageNumber,
  type: toType,
  field: toField,
  element: toElement,
  isNew,
};
