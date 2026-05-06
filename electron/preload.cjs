const { contextBridge, ipcRenderer } = require("electron");

const allowedCommands = new Set([
  "get_projects",
  "save_project",
  "delete_project",
  "save_session_output",
  "load_session_output",
  "read_image_data_url",
  "get_available_shells",
  "get_terminal_host_info",
  "probe_cli_tools",
  "set_project_watch",
  "list_directory",
  "read_text_file",
  "get_git_branch",
  "get_git_branches",
  "get_git_status",
  "get_git_file_base",
  "get_git_file_state",
  "switch_git_branch",
  "cleanup_runtime",
  "minimize_window",
  "toggle_maximize_window",
  "is_window_maximized",
  "close_window",
  "reveal_in_finder",
  "show_open_dialog",
]);

const eventSubscriptions = new Map();
const terminalDataSubscriptions = new Map();
const terminalExitSubscriptions = new Map();

ipcRenderer.on("shob:event", (_event, message) => {
  const listeners = eventSubscriptions.get(message.channel);
  if (!listeners) return;
  for (const listener of listeners) listener({ payload: message.payload });
});

ipcRenderer.on("shob:terminal-data", (_event, message) => {
  const listeners = terminalDataSubscriptions.get(message.id);
  if (!listeners) return;
  for (const listener of listeners) listener(message.data);
});

ipcRenderer.on("shob:terminal-exit", (_event, message) => {
  const listeners = terminalExitSubscriptions.get(message.id);
  if (!listeners) return;
  for (const listener of listeners) listener();
});

function subscribe(map, key, callback) {
  const listeners = map.get(key) || new Set();
  listeners.add(callback);
  map.set(key, listeners);
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0) map.delete(key);
  };
}

contextBridge.exposeInMainWorld("shob", {
  platform: process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : process.platform,
  invoke(command, payload) {
    if (!allowedCommands.has(command)) {
      return Promise.reject(new Error(`IPC command is not allowed: ${command}`));
    }
    return ipcRenderer.invoke("shob:invoke", command, payload);
  },
  listen(channel, callback) {
    return Promise.resolve(subscribe(eventSubscriptions, channel, callback));
  },
  window: {
    minimize: () => ipcRenderer.invoke("shob:invoke", "minimize_window", {}),
    toggleMaximize: () => ipcRenderer.invoke("shob:invoke", "toggle_maximize_window", {}),
    isMaximized: () => ipcRenderer.invoke("shob:invoke", "is_window_maximized", {}),
    close: () => ipcRenderer.invoke("shob:invoke", "close_window", {}),
    onResized: (callback) => {
      const listener = () => callback();
      ipcRenderer.on("shob:window-state", listener);
      return Promise.resolve(() => ipcRenderer.removeListener("shob:window-state", listener));
    },
  },
  terminal: {
    spawn: (options) => ipcRenderer.invoke("shob:terminal-spawn", options),
    write: (id, data) => ipcRenderer.invoke("shob:terminal-write", id, data),
    resize: (id, cols, rows) => ipcRenderer.invoke("shob:terminal-resize", id, cols, rows),
    kill: (id) => ipcRenderer.invoke("shob:terminal-kill", id),
    onData: (id, callback) => subscribe(terminalDataSubscriptions, id, callback),
    onExit: (id, callback) => subscribe(terminalExitSubscriptions, id, callback),
  },
});
