module.exports = ({ EDITOR_MODE }) => ({
  [EDITOR_MODE.MAIN]: {
    [EDITOR_MODE.CONSTRUCTOR]: true,
    [EDITOR_MODE.PAGES]: true,
    [EDITOR_MODE.VERSIONS]: true,
    [EDITOR_MODE.TRUEEDIT]: true,
  },
  [EDITOR_MODE.CONSTRUCTOR]: {
    [EDITOR_MODE.MAIN]: true,
  },
  [EDITOR_MODE.PAGES]: {
    [EDITOR_MODE.MAIN]: true,
  },
  [EDITOR_MODE.VERSIONS]: {
    [EDITOR_MODE.MAIN]: true,
  },
  [EDITOR_MODE.TRUEEDIT]: {
    [EDITOR_MODE.MAIN]: true,
  },
});
