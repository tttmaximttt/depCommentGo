const CONVERTER_API = {
  P_XML_TO_P_JSON: '/convert/p-xml/to/p-json',
  P_JSON_TO_P_XML: '/convert/p-json/to/p-xml',
};

const NATIVE_EDIT_API = {
  GENERATE: 'generate',
};

module.exports = () => ({
  CONVERTER_API,
  NATIVE_EDIT_API,
});
