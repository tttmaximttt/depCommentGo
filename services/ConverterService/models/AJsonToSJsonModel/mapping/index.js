const attachmentProjection = require('./attachmentProjection');
const checkboxProjection = require('./checkboxProjection');
const dateProjection = require('./dateProjection');
const dropdownProjection = require('./dropdownProjection');
const initialsProjection = require('./initialsProjection');
const radioProjection = require('./radioProjection');
const signatureProjection = require('./signatureProjection');
const textProjection = require('./textProjection');

const TEXT_TYPE = 'text';
const DATE_TYPE = 'date';
const DROPDOWN_TYPE = 'dropdown';
const CHECKMARK_TYPE = 'checkmark';
const ATTACHMENT_TYPE = 'image';
const SIGNATURE_TYPE = 'signature';
const RADIO_TYPE = 'radio';

const INITIALS_SUBTYPE = 'initials';
// const DATE_MASK = 'current+';

const ROLE_NAME = 'Signer 1';
const ROLE = { name: ROLE_NAME };
// const DEFAULT_PAGE_WIDTH = 890;

const getMapper = (type, subType) => {
  switch (type) {
    case TEXT_TYPE:
      if (subType === DATE_TYPE) {
        return dateProjection;
      } else if (subType === DROPDOWN_TYPE) {
        return dropdownProjection;
      }
      return textProjection;
    case CHECKMARK_TYPE:
      return checkboxProjection;
    case RADIO_TYPE:
      return radioProjection;
    case ATTACHMENT_TYPE:
      return attachmentProjection;
    case SIGNATURE_TYPE:
      if (subType === INITIALS_SUBTYPE) {
        return initialsProjection;
      }
      return signatureProjection;
    default:
      return null;
  }
};

const scale = v => v / 1.33;
const initScale = pagesSizes => (v, pageIndex) => scale(v, pageIndex, pagesSizes);
const getRole = () => ROLE;

module.exports = {
  getMapper,
  initScale,
  getRole,
  constants: {
    RADIO_TYPE,
  },
};
