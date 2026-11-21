// Feature-local state facade for the request workbench (ARCHITECTURE.md §4).
// Decomposed into domain stores under `./stores/` while preserving full backwards
// compatibility for consumers.

export type { Confirm, ReqTab, RequestLocation, ResTab, Tab } from "./stores/types";

export {
  initWorkbench,
  requestSearchFocus,
  toggleSidebar,
  paletteState,
  openCommandPalette,
  closeCommandPalette,
  toggleCommandPalette,
  cookieManagerState,
  openCookieManager,
  closeCookieManager,
  wb,
} from "./stores/workbench.svelte";

export {
  addFolder,
  addImportedCollection,
  addRequestTo,
  authChain,
  authSource,
  commitCollections,
  composePath,
  containerAt,
  containerNode,
  contextFor,
  createCollection,
  deleteContainer,
  deleteRequestAt,
  effectiveAuth,
  effectivePrefix,
  effectiveUrl,
  findRequestById,
  moveFolder,
  moveRequest,
  openContainerSettings,
  replaceInContainer,
  replaceRequestById,
  setFolderDeprecated,
  toggleCurrentRequestDeprecated,
  wouldCycle,
} from "./stores/collections.svelte";

export {
  activeTab,
  addSseHeadersToActive,
  canonParts,
  canonRequest,
  canonRows,
  closeOtherTabs,
  closeTab,
  closeUneditedTabs,
  duplicateTab,
  hasUnsavedTabs,
  isTabDirty,
  newRequest,
  newSseRequest,
  newTab,
  requestCloseOthers,
  requestCloseTab,
  requestDeleteRequest,
  saveCurrentRequest,
  saveTab,
  selectTab,
  tabTitle,
} from "./stores/tabs.svelte";

export {
  activeEnvKeys,
  activeEnvName,
  activeEnvironment,
  activeEnvVarMap,
  allAvailableEnvVarItems,
  getVariableInfo,
  type EnvVarItem,
  type VariableDetails,
  addImportedEnvironment,
  applyEnvUpdates,
  createEnvironment,
  currentUnresolved,
  deleteEnvironment,
  renameEnvironment,
  saveEnvironmentVars,
  selectEnvironment,
} from "./stores/environments.svelte";

export {
  clearHistory,
  HISTORY_LIMIT,
  recordHistory,
  removeHistoryEntry,
} from "./stores/history.svelte";

export {
  activeWorkspaceName,
  createWorkspace,
  deleteWorkspace,
  refreshMembers,
  reloadCollections,
  reloadWorkspaceData,
  renameWorkspace,
  switchWorkspace,
} from "./stores/workspaces.svelte";

export {
  addMultipart,
  addRow,
  cancel,
  clearMultipart,
  clearRows,
  deleteSavedResponse,
  ensureTrailingMultipart,
  ensureTrailingRow,
  importCurl,
  loadRequest,
  methodColor,
  removeMultipart,
  removeRow,
  renameSavedResponse,
  saveResponseAsExample,
  send,
  setActiveExample,
  statusTone,
} from "./stores/actions.svelte";

export {
  runnerState,
  openRunner,
  closeRunner,
  startRunner,
  cancelRunner,
  toggleRunnerItem,
  toggleAllRunnerItems,
  moveRunnerItem,
  getRunnerSummary,
  exportRunnerReport,
} from "./stores/runner.svelte";
