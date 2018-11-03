const textProjection = require('./textProjection');

const toType = () => ({ type: 'text', label: 'Date' });

const toElementType = () => ({ type: 'text' });

module.exports = {
  ...textProjection,
  type: toType,
  elementType: toElementType,
};
