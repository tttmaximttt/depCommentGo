const { get } = require('lodash');
const uuidv4 = require('uuid/v4');

const X_POSITION_OFFSET = 0.0045;
const Y_POSITION_OFFSET = 0.0065;

const toElementType = (from, mapper) => mapper.type(from, mapper);

const toPageNumber = from => ({ page_number: from.parent.pageId });

const toUuid = from => ({ uuid: from.id || uuidv4() });

const toIsEditable = () => ({ is_editable: true });

const isNew = from => !from.original;

const toIsNew = (from, mapper) => ({ is_new: mapper.isNew(from) });

const toPosition = (from, mapper) => ({
  x: Math.round(mapper.scale(from.x - (from.x * X_POSITION_OFFSET))),
  y: Math.round(mapper.scale(from.y - (from.y * Y_POSITION_OFFSET))),
});

const toSize = (from, mapper) => ({
  line_height: 1,
  width: Math.round(mapper.scale(from.width)),
  height: Math.round(mapper.scale(from.height)),
});

const toFont = (from, mapper) => ({
  size: Math.round(mapper.scale(get(from.parent, 'content.fontSize', 14))),
  font: get(from.parent, 'fontFamily.fontFamily', 'Arial'),
});

const toRole = (from, mapper) => ({
  role_id: from.roleId,
  role: mapper.getRole(from.roleId).name,
});

const toRequired = from => ({ required: get(from, 'required', true) });

const toClientTimestamp = (from, mapper) => {
  if (!mapper.isNew(from)) return null;

  return {
    client_timestamp: Date.now(),
  };
};

const toFieldId = from => ({ field_id: from.linkId });
const toPrefilledText = from => ({ prefilled_text: from.prefilledText });

const toField = (parent, mapper) => {
  const from = {
    ...parent,
    parent,
  };

  return {
    json_attributes: {
      stretchToGrid: false,
    },
    ...from.original,
    ...mapper.type(from, mapper),
    ...mapper.pageNumber(from, mapper),
    ...mapper.uuid(from, mapper),
    ...mapper.isEditable(from, mapper),
    ...mapper.new(from, mapper),
    ...mapper.role(from, mapper),
    ...mapper.position(from, mapper),
    ...mapper.size(from, mapper),
    ...mapper.required(from, mapper),
    ...mapper.prefilledText(from, mapper),
  };
};

const toElement = (parent, mapper) => {
  const from = {
    ...parent,
    parent,
  };

  return {
    ...(from.original && !from.original.field_id ? from.original : {}),
    ...mapper.elementType(from, mapper),
    ...mapper.pageNumber(from, mapper),
    ...mapper.uuid(from, mapper),
    ...mapper.position(from, mapper),
    ...mapper.size(from, mapper),
    ...mapper.clientTimestamp(from, mapper),
    ...mapper.fieldId(from, mapper),
  };
};

module.exports = {
  field: toField,
  element: toElement,
  elementType: toElementType,
  pageNumber: toPageNumber,
  fieldId: toFieldId,
  uuid: toUuid,
  position: toPosition,
  size: toSize,
  font: toFont,
  required: toRequired,
  isEditable: toIsEditable,
  new: toIsNew,
  role: toRole,
  prefilledText: toPrefilledText,
  clientTimestamp: toClientTimestamp,
  isNew,
};
