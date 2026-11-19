// Public surface of the IPC contract layer (ARCHITECTURE.md §5).
export { call } from "./client";
export { pickFile, pickDirectory, pickSaveFile } from "./dialog";
export { openFile, openExternalUrl } from "./opener";
export { sendRequest, cancelRequest } from "./requests";
export {
  sharingStatus,
  sharingDefaultDir,
  sharingInit,
  sharingClone,
  sharingSetRemote,
  sharingPublish,
  sharingPull,
  sharingResolvePull,
} from "./sharing";
export {
  listWorkspaces,
  activeWorkspace,
  createWorkspace,
  switchWorkspace,
  renameWorkspace,
  deleteWorkspace,
  setActiveEnv,
  workspaceMembers,
} from "./workspace";
export {
  getCollectionsPath,
  loadCollections,
  loadEnvironments,
  loadHistory,
  loadSettings,
  saveCollections,
  saveEnvironments,
  saveHistory,
  appendHistoryEntry,
  deleteHistoryEntry,
  clearHistoryStore,
  saveResponseBody,
  saveResponseToFile,
  saveSettings,
  setCollectionsPath,
} from "./store";
