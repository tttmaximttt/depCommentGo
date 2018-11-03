const elemTypes = {
  text: 'text',
  checkmark: 'checkmark',
  signature: 'signature',
  image: 'image',
};

const elemSubTypes = {
  none: 'none',
  [elemTypes.signature]: {
    initials: 'initials',
    curve: 'curve',
    text: 'text',
    image: 'image',
  },
  [elemTypes.text]: {
    number: 'number',
    date: 'date',
    formula: 'formula',
    dropdown: 'dropdown',
  },
  [elemTypes.checkmark]: {
    v: 'v',
    x: 'x',
    o: 'o',
  },
};

const TextProps = [
  'type', 'width', 'arrangement', 'height', 'contentType', 'lockAfterFill', 'fieldAction',
  'subtype', 'subType', 'bold', 'initial', 'fontSize', 'name', 'italic', 'fontColor',
  'maxChars', 'x', 'allowEditing', 'underline', 'maxLines', 'required',
  'label', 'fontFamily', 'y', 'align', 'hint', 'letterCase', 'valign', 'id', 'text', 'order',
];

const NumberProps = [
  'type', 'x', 'y', 'arrangement', 'underline', 'height', 'bold', 'width', 'fieldAction',
  'required', 'maxLines', 'fontFamily', 'fontSize', 'name', 'initial', 'hint',
  'label', 'align', 'fontColor', 'valign', 'italic', 'maxChars', 'subtype', 'subType',
  'id', 'text', 'allowEditing', 'order', 'contentType', 'lockAfterFill', 'numberFormat',
];

const DateProps = [
  'type', 'x', 'arrangement', 'underline', 'height', 'name', 'width', 'required', 'fieldAction',
  'maxLines', 'fontFamily', 'align', 'fontSize', 'bold', 'initial', 'hint', 'fontColor', 'lockAfterFill',
  'subtype', 'subType', 'y', 'italic', 'maxChars', 'valign', 'id', 'allowEditing', 'text', 'order',
  'label',
];

const CheckMarkProps = [
  'type', 'subtype', 'subType', 'x', 'y', 'width', 'height', 'label', 'name', 'required',
  'color', 'initial', 'hint', 'radioGroup', 'id', 'allowEditing', 'order', 'contentType',
  'lockAfterFill', 'fieldAction',
];

const ImageProps = [
  'type', 'x', 'hint', 'height', 'y', 'name', 'width', 'required', 'subtype', 'subType', 'id',
  'order', 'contentType', 'allowEditing', 'lockAfterFill', 'label', 'fieldAction',
];

const SignatureProps = [
  'type', 'x', 'hint', 'height', 'y', 'name', 'width', 'required', 'subtype', 'subType', 'id',
  'order', 'contentType', 'allowEditing', 'lockAfterFill', 'label', 'fieldAction',
];

const InitialsProps = [
  'type', 'x', 'hint', 'height', 'y', 'name', 'width', 'required', 'subtype', 'subType', 'id',
  'order', 'contentType', 'allowEditing', 'lockAfterFill', 'fieldAction', 'label',
];

const DropDownProps = [
  'type', 'x', 'arrangement', 'list', 'underline', 'height', 'bold', 'width', 'fieldAction',
  'required', 'maxLines', 'fontFamily', 'y', 'fontSize', 'name', 'initial',
  'allowCustomText', 'hint', 'align', 'fontColor', 'valign', 'italic', 'maxChars',
  'subtype', 'subType', 'id', 'order', 'contentType', 'label', 'allowEditing', 'lockAfterFill',
];

const FormulaProps = [
  'type', 'x', 'arrangement', 'formula', 'underline', 'height', 'fontSize', 'bold',
  'name', 'width', 'required', 'y', 'fontFamily', 'formulaFormat', 'initial', 'align',
  'maxLines', 'valign', 'italic', 'maxChars', 'subtype', 'subType', 'fontColor', 'id', 'order',
  'contentType', 'allowEditing', 'lockAfterFill', 'fieldAction',
];

module.exports = {
  origin: 'user',
  version: '1.1',
  [elemTypes.text]: {
    none: TextProps,
    [elemSubTypes.text.number]: NumberProps,
    [elemSubTypes.text.date]: DateProps,
    [elemSubTypes.text.formula]: FormulaProps,
    [elemSubTypes.text.dropdown]: DropDownProps,
  },
  [elemTypes.checkmark]: {
    x: CheckMarkProps,
    v: CheckMarkProps,
    o: CheckMarkProps,
  },
  [elemTypes.image]: {
    none: ImageProps,
  },
  [elemTypes.signature]: {
    [elemSubTypes.signature.initials]: InitialsProps,
    [elemSubTypes.none]: SignatureProps,
    [elemSubTypes.signature.curve]: SignatureProps,
    [elemSubTypes.signature.text]: SignatureProps,
    [elemSubTypes.signature.image]: SignatureProps,
  },
};
