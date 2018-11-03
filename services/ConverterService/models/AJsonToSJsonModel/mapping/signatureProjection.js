const projections = require('./projections');

const toType = () => ({ type: 'signature' });

const toField = (parent, mapper) => ({ ...projections.field(parent, mapper) });

const renderText = (parent, mapper) => mapper.render.fabricCreateText(parent, (size) => {
  mapper.size = (from, mapper1) => ({
    line_height: 1,
    width: from.width ? Math.round(mapper1.scale(from.width)) : Math.round(size.width),
    height: from.height ? Math.round(mapper1.scale(from.height)) : Math.round(size.height),
  });
}).toDataURL();

const renderCurve = (parent, mapper) => mapper.render.fabricCreateCurves(parent).toDataURL();

async function renderImage(parent, mapper) {
  const image = await mapper.render.fabricCreateImage(parent);

  return image.toDataURL();
}

function toData(parent, mapper) {
  switch (parent.subType) {
    case 'text':
      return renderText(parent, mapper);

    case 'curve':
      return renderCurve(parent, mapper);

    case 'image':
      return renderImage(parent, mapper);

    default:
      return null;
  }
}

async function toElement(parent, mapper) {
  const data = await toData(parent, mapper);

  return {
    ...projections.element(parent, mapper),
    data: data && data.replace('data:image/png;base64,', ''),
    subType: parent.subType,
  };
}

module.exports = {
  ...projections,
  type: toType,
  field: toField,
  element: toElement,
};
