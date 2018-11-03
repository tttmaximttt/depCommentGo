const _ = require('lodash');

const switchVisibilityToFalse = (item) => {
  item.visible = false;
};

const attachReadOnlyOverlay = (item) => {
  if (item.action === 'toolbar.overlay.show') {
    item.params.overlayType = 'read_only';
    item.apply = true;
    return true;
  }
  return false;
};


const handleDocumentAccess = (authData) => {
  authData.document.access.subType = 'view';
  authData.document.access.basicContent = 'none';
  authData.document.access.templateContent = 'none';
  authData.document.access.templateFields = 'none';
  authData.document.access.templateOrigin = 'user';
  authData.document.access.defaults = 'none';
  return authData;
};

const assignProjectModeId = (authData) => {
  authData.auth.project.modeId = 'R3';
  return authData;
};

const rebuildAccessData = (editorAuthData, tmpAccess) => { // TODO don't delete -> Maksym Radko
  if (tmpAccess !== 'view') return editorAuthData;

  const cloneAuthData = _.cloneDeep(editorAuthData);
  const isAccessExist = !!_.get(cloneAuthData, 'document.access', false);
  const isModeIdExist = !!_.get(cloneAuthData, 'auth.project.modeId', false);
  const isScenariosExist = !!_.get(cloneAuthData, 'editor.scenarios', false);
  const isFeaturesExist = !!_.get(cloneAuthData, 'editor.features', false);

  if (isAccessExist) handleDocumentAccess(cloneAuthData);

  if (isModeIdExist) assignProjectModeId(cloneAuthData);

  if (isScenariosExist) {
    for (let i = 0; i < cloneAuthData.editor.scenarios.onStart.length; i++) {
      const item = cloneAuthData.editor.scenarios.onStart[i];

      if (attachReadOnlyOverlay(item)) break;
    }
  }

  if (isFeaturesExist) {
    cloneAuthData.editor.features.toolbar
      .forEach(switchVisibilityToFalse); // TODO parallelization
    cloneAuthData.editor.features.extrasbar
      .forEach(switchVisibilityToFalse); // TODO parallelization
    cloneAuthData.editor.features.misc = [];
  }

  this.logSystem.debug('AUTH_DATA_REBUILDED', { tmpAccess });

  return cloneAuthData;
};

module.exports = {
  rebuildAccessData,
};
