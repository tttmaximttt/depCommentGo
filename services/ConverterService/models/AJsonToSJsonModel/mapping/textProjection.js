const projections = require('./projections');

const NUMBER_VALIDATOR_ID = '1109cfbbb06311a06a4c7f8d04f1f0d5c44103cb';
const NUMBER_SUBTYPE = 'number';
const toType = () => ({ type: 'text' });

const toValidator = (from) => {
  const validatorId = from.subType === NUMBER_SUBTYPE ? NUMBER_VALIDATOR_ID : from.validatorId;

  return { validator_id: validatorId };
};

const toField = (from, mapper) => ({
  label: from.initials,
  ...projections.field(from, mapper),
  ...projections.font(from, mapper),
  ...toValidator(from, mapper),
});

const toElement = (parent, mapper) => {
  const from = {
    ...parent,
    parent,
  };

  return {
    ...projections.element(parent, mapper),
    ...projections.font(from, mapper),
    data: from.text,
  };
};

module.exports = {
  ...projections,
  type: toType,
  field: toField,
  element: toElement,
};
