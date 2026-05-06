const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const { spawn: spawnProcess, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const pty = require("@lydell/node-pty");
const chokidar = require("chokidar");

const execFileAsync = promisify(execFile);
const isDev = !app.isPackaged;
const MAX_EDITOR_PREVIEW_BYTES = 512 * 1024;

let mainWindow = null;
let projectWatcher = null;
let lastWatcherOperationAt = 0;
const ptyProcesses = new Map();
const ptyOutputQueues = new Map();

function userDataPath(...parts) {
  return path.join(app.getPath("userData"), ...parts);
}

async function ensureDataDirs() {
  await fs.mkdir(userDataPath("sessions"), { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2));
  await fs.rename(tempPath, filePath);
}

function projectsPath() {
  return userDataPath("projects.json");
}

async function loadProjects() {
  return readJson(projectsPath(), []);
}

async function saveProjects(projects) {
  await writeJsonAtomic(projectsPath(), projects);
}

function sessionOutputPath(sessionId) {
  const safeId = String(sessionId).replace(/[^a-zA-Z0-9._-]/g, "_");
  return userDataPath("sessions", `${safeId}.log`);
}

function normalizeOs() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "macos";
  if (process.platform === "linux") return "linux";
  return process.platform;
}

function getImageMimeType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".svg": return "image/svg+xml";
    case ".ico": return "image/x-icon";
    case ".gif": return "image/gif";
    case ".bmp": return "image/bmp";
    default: return "application/octet-stream";
  }
}

function splitPathEntries() {
  return (process.env.PATH || "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveCommand(command) {
  const direct = path.resolve(command);
  if (path.isAbsolute(command) && fsSync.existsSync(command)) return command;
  if (fsSync.existsSync(direct) && path.isAbsolute(command)) return direct;

  const pathExts = process.platform === "win32"
    ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""];
  const hasExt = Boolean(path.extname(command));

  for (const dir of splitPathEntries()) {
    const candidates = process.platform === "win32" && !hasExt
      ? pathExts.map((ext) => path.join(dir, `${command}${ext.toLowerCase()}`))
          .concat(pathExts.map((ext) => path.join(dir, `${command}${ext.toUpperCase()}`)))
      : [path.join(dir, command)];

    for (const candidate of candidates) {
      if (fsSync.existsSync(candidate) && fsSync.statSync(candidate).isFile()) {
        return candidate;
      }
    }
  }

  return null;
}

function detectShells() {
  const shells = [];
  if (process.platform === "win32") {
    for (const command of ["pwsh.exe", "powershell.exe", "cmd.exe"]) {
      shells.push(resolveCommand(command) || command);
    }
    for (const gitShell of [
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files\\Git\\bin\\sh.exe",
    ]) {
      if (fsSync.existsSync(gitShell)) shells.push(gitShell);
    }
  } else {
    for (const command of ["bash", "zsh", "fish", "sh"]) {
      const resolved = resolveCommand(command);
      if (resolved) shells.push(resolved);
    }
  }

  return [...new Set(shells)];
}

async function detectWindowsBuildNumber() {
  if (process.platform !== "win32") return null;
  try {
    const { stdout } = await execFileAsync("cmd", ["/C", "ver"]);
    const token = stdout.split(/\s+/).find((part) => /\d+\.\d+\.\d+/.test(part));
    return token ? Number(token.replace(/[\[\]]/g, "").split(".")[2]) || null : null;
  } catch {
    return null;
  }
}

async function gitOutput(args, cwd) {
  const { stdout } = await execFileAsync("git", args, { cwd, windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
  return stdout;
}

function parseRepoNameFromRemoteUrl(remoteUrl) {
  const trimmed = remoteUrl.trim().replace(/\/$/, "");
  if (!trimmed) return null;
  const tail = trimmed.split(/[/:]/).pop().replace(/\.git$/, "").trim();
  return tail || null;
}

async function listDirectory(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  return entries
    .map((entry) => ({
      name: entry.name,
      path: path.join(directoryPath, entry.name),
      isDirectory: entry.isDirectory(),
    }))
    .sort((left, right) => {
      if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1;
      return left.name.toLowerCase().localeCompare(right.name.toLowerCase());
    });
}

function shouldForwardProjectWatchPath(changedPath) {
  const normalized = changedPath.replace(/\\/g, "/").toLowerCase();
  if (/\/(node_modules|dist|target|\.next|\.turbo|\.cache|coverage)\//.test(normalized)) return false;
  if (normalized.includes("/.git/")) {
    return normalized.endsWith("/.git/head")
      || normalized.endsWith("/.git/index")
      || normalized.endsWith("/.git/refs")
      || normalized.includes("/.git/refs/");
  }
  return true;
}

function emitProjectFsEvent(projectPath, paths) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("shob:event", {
    channel: "project-fs-event",
    payload: { projectPath, paths },
  });
}

async function setProjectWatch(watchPath) {
  if (projectWatcher) {
    await projectWatcher.close();
    projectWatcher = null;
  }

  if (!watchPath) {
    lastWatcherOperationAt = Date.now();
    return;
  }

  const stats = await fs.stat(watchPath);
  if (!stats.isDirectory()) throw new Error("Project watch path is invalid");

  if (process.platform === "win32") {
    const elapsed = Date.now() - lastWatcherOperationAt;
    if (elapsed < 200) await new Promise((resolve) => setTimeout(resolve, 200 - elapsed));
  }

  const pendingPaths = new Set();
  let flushTimer = null;
  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const paths = [...pendingPaths];
      pendingPaths.clear();
      if (paths.length) emitProjectFsEvent(watchPath, paths);
    }, 120);
  };

  projectWatcher = chokidar.watch(watchPath, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 25 },
    ignored: /(^|[\\/])(node_modules|dist|target|\.next|\.turbo|\.cache|coverage)([\\/]|$)/,
  });

  projectWatcher.on("all", (_event, changedPath) => {
    if (!shouldForwardProjectWatchPath(changedPath)) return;
    pendingPaths.add(changedPath);
    scheduleFlush();
  });

  lastWatcherOperationAt = Date.now();
}

function queuePtyOutput(id, data) {
  const item = ptyOutputQueues.get(id);
  if (!item) return;
  item.chunks.push(data);
  if (item.scheduled) return;
  item.scheduled = true;
  setImmediate(() => {
    item.scheduled = false;
    if (!mainWindow || mainWindow.isDestroyed() || item.chunks.length === 0) return;
    const payload = item.chunks.join("");
    item.chunks.length = 0;
    mainWindow.webContents.send("shob:terminal-data", { id, data: payload });
  });
}

function killPty(id) {
  const proc = ptyProcesses.get(id);
  if (!proc) return;
  ptyProcesses.delete(id);
  ptyOutputQueues.delete(id);
  try {
    proc.kill();
  } catch {
    // best effort cleanup
  }
}

function killAllPtys() {
  for (const id of [...ptyProcesses.keys()]) killPty(id);
}

async function revealInFinder(targetPath) {
  if (!fsSync.existsSync(targetPath)) throw new Error("Path does not exist");
  shell.showItemInFolder(targetPath);
}

async function getGitStatus(cwd) {
  const repoRoot = (await gitOutput(["rev-parse", "--show-toplevel"], cwd)).trim();
  const statusOutput = await gitOutput(["status", "--porcelain"], cwd);
  let numstatOutput = "";
  try {
    numstatOutput = await gitOutput(["diff", "--numstat", "HEAD"], cwd);
  } catch {
    numstatOutput = "";
  }

  const counts = new Map();
  for (const line of numstatOutput.split(/\r?\n/)) {
    const [additions, deletions, filePath] = line.split("\t");
    if (filePath) counts.set(filePath, [Number(additions) || 0, Number(deletions) || 0]);
  }

  const changedFiles = [];
  for (const line of statusOutput.split(/\r?\n/)) {
    if (line.length < 4) continue;
    const status = line.slice(0, 2).trim();
    const relativePath = line.slice(3).trim().replace(/\\/g, "/");
    const absolutePath = path.join(repoRoot, relativePath.split("/").join(path.sep));
    const [additions, deletions] = status === "??"
      ? [countFileLines(absolutePath), 0]
      : (counts.get(relativePath) || [0, 0]);
    changedFiles.push({ path: relativePath, absolutePath, status, additions, deletions });
  }

  return { repoRoot, changedFiles };
}

function countFileLines(filePath) {
  try {
    return fsSync.readFileSync(filePath, "utf8").split(/\r?\n/).length;
  } catch {
    return 0;
  }
}

async function readTextFileWithLimit(filePath, maxBytes) {
  let size = 0;
  try {
    size = (await fs.stat(filePath)).size;
  } catch {
    return { content: "", size: 0, isLarge: false };
  }
  if (size > maxBytes) return { content: "", size, isLarge: true };
  try {
    return { content: await fs.readFile(filePath, "utf8"), size, isLarge: false };
  } catch {
    return { content: "", size, isLarge: false };
  }
}

async function getGitFileState(filePath) {
  const current = await readTextFileWithLimit(filePath, MAX_EDITOR_PREVIEW_BYTES);
  const cwd = path.dirname(filePath);
  let repoRoot = null;
  try {
    repoRoot = (await gitOutput(["rev-parse", "--show-toplevel"], cwd)).trim();
  } catch {
    return {
      repoRoot: null,
      baseContent: "",
      currentContent: current.content,
      hasChanges: false,
      isLargeFile: current.isLarge,
      fileSizeBytes: current.size,
      status: "",
      additions: 0,
      deletions: 0,
    };
  }

  const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, "/");
  const statusLine = (await gitOutput(["status", "--porcelain", "--", relativePath], repoRoot).catch(() => ""))
    .split(/\r?\n/)[0]
    ?.trim() || "";
  const status = statusLine.length >= 2 ? statusLine.slice(0, 2).trim() : "";
  const numstatLine = (await gitOutput(["diff", "--numstat", "HEAD", "--", relativePath], repoRoot).catch(() => ""))
    .split(/\r?\n/)[0] || "";
  const parts = numstatLine.split("\t");
  let additions = Number(parts[0]) || 0;
  let deletions = Number(parts[1]) || 0;
  if (status === "??") {
    additions = current.content.split(/\r?\n/).length;
    deletions = 0;
  }

  let baseContent = "";
  let baseIsLarge = false;
  try {
    const { stdout } = await execFileAsync("git", ["show", `HEAD:${relativePath}`], {
      cwd: repoRoot,
      windowsHide: true,
      maxBuffer: MAX_EDITOR_PREVIEW_BYTES + 1,
      encoding: "buffer",
    });
    if (stdout.length > MAX_EDITOR_PREVIEW_BYTES) {
      baseIsLarge = true;
    } else {
      baseContent = stdout.toString("utf8");
    }
  } catch {
    baseContent = "";
  }

  return {
    repoRoot,
    baseContent,
    currentContent: current.content,
    hasChanges: Boolean(status),
    isLargeFile: current.isLarge || baseIsLarge,
    fileSizeBytes: current.size,
    status,
    additions,
    deletions,
  };
}

const handlers = {
  get_projects: async () => loadProjects(),
  save_project: async ({ project }) => {
    const projects = await loadProjects();
    const index = projects.findIndex((item) => item.id === project.id);
    if (index >= 0) projects[index] = project;
    else projects.push(project);
    await saveProjects(projects);
    return project;
  },
  delete_project: async ({ projectId }) => {
    const projects = await loadProjects();
    await saveProjects(projects.filter((project) => project.id !== projectId));
  },
  save_session_output: async ({ sessionId, output }) => {
    await fs.writeFile(sessionOutputPath(sessionId), output || "");
  },
  load_session_output: async ({ sessionId }) => {
    try {
      return await fs.readFile(sessionOutputPath(sessionId), "utf8");
    } catch {
      return "";
    }
  },
  read_image_data_url: async ({ path: imagePath }) => {
    const bytes = await fs.readFile(imagePath);
    return `data:${getImageMimeType(imagePath)};base64,${bytes.toString("base64")}`;
  },
  get_available_shells: async () => detectShells(),
  get_terminal_host_info: async () => ({
    os: normalizeOs(),
    windowsBuildNumber: await detectWindowsBuildNumber(),
  }),
  probe_cli_tools: async ({ items }) => items.map((item) => {
    let resolvedPath = null;
    let matchedCommand = null;
    for (const command of item.commands || []) {
      resolvedPath = resolveCommand(command);
      if (resolvedPath) {
        matchedCommand = command;
        break;
      }
    }
    return { id: item.id, installed: Boolean(resolvedPath), resolvedPath, matchedCommand };
  }),
  set_project_watch: async ({ path: watchPath }) => setProjectWatch(watchPath),
  list_directory: async ({ path: directoryPath }) => listDirectory(directoryPath),
  read_text_file: async ({ path: filePath }) => fs.readFile(filePath, "utf8"),
  get_git_status: async ({ path: cwd }) => getGitStatus(cwd),
  get_git_branch: async ({ path: cwd }) => {
    const head = (await gitOutput(["branch", "--show-current"], cwd)).trim();
    const upstream = (await gitOutput(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], cwd).catch(() => ""))
      .trim() || null;
    const remoteName = (await gitOutput(["config", "--get", `branch.${head}.remote`], cwd).catch(() => ""))
      .trim() || upstream?.split("/")[0] || (await gitOutput(["remote"], cwd).catch(() => "")).split(/\r?\n/).find(Boolean) || null;
    const remoteUrl = remoteName ? await gitOutput(["remote", "get-url", remoteName], cwd).catch(() => "") : "";
    return { repoName: parseRepoNameFromRemoteUrl(remoteUrl), head, upstream };
  },
  get_git_branches: async ({ path: cwd }) => {
    const output = await gitOutput(["for-each-ref", "--format=%(refname:short)", "refs/heads"], cwd);
    return { branches: output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).sort() };
  },
  switch_git_branch: async ({ path: cwd, branch }) => {
    try {
      await gitOutput(["switch", branch], cwd);
    } catch {
      await gitOutput(["checkout", branch], cwd);
    }
  },
  get_git_file_base: async ({ path: filePath }) => {
    const repoRoot = (await gitOutput(["rev-parse", "--show-toplevel"], path.dirname(filePath))).trim();
    const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, "/");
    return gitOutput(["show", `HEAD:${relativePath}`], repoRoot).catch(() => "");
  },
  get_git_file_state: async ({ path: filePath }) => getGitFileState(filePath),
  cleanup_runtime: async () => {
    await setProjectWatch(null);
    killAllPtys();
  },
  minimize_window: async () => mainWindow?.minimize(),
  toggle_maximize_window: async () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    }
    mainWindow.maximize();
    return true;
  },
  is_window_maximized: async () => Boolean(mainWindow?.isMaximized()),
  close_window: async () => mainWindow?.close(),
  reveal_in_finder: async ({ path: targetPath }) => revealInFinder(targetPath),
  show_open_dialog: async (options) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: options?.title,
      properties: [
        options?.directory ? "openDirectory" : "openFile",
        options?.multiple ? "multiSelections" : null,
      ].filter(Boolean),
      filters: options?.filters,
    });
    if (result.canceled) return options?.multiple ? [] : null;
    return options?.multiple ? result.filePaths : result.filePaths[0] || null;
  },
};

function registerIpc() {
  ipcMain.handle("shob:invoke", async (_event, command, payload = {}) => {
    const handler = handlers[command];
    if (!handler) throw new Error(`Unknown IPC command: ${command}`);
    return handler(payload);
  });

  ipcMain.handle("shob:terminal-spawn", async (_event, options) => {
    const id = options.id || crypto.randomUUID();
    killPty(id);
    const proc = pty.spawn(options.shell, options.args || [], {
      name: "xterm-256color",
      cwd: options.cwd || os.homedir(),
      cols: Math.max(2, Number(options.cols) || 80),
      rows: Math.max(2, Number(options.rows) || 24),
      env: { ...process.env, ...(options.env || {}) },
    });

    ptyProcesses.set(id, proc);
    ptyOutputQueues.set(id, { chunks: [], scheduled: false });
    proc.onData((data) => queuePtyOutput(id, data));
    proc.onExit(() => {
      ptyProcesses.delete(id);
      ptyOutputQueues.delete(id);
      mainWindow?.webContents.send("shob:terminal-exit", { id });
    });

    return { id };
  });

  ipcMain.handle("shob:terminal-write", (_event, id, data) => {
    const proc = ptyProcesses.get(id);
    if (proc) proc.write(data);
  });

  ipcMain.handle("shob:terminal-resize", (_event, id, cols, rows) => {
    const proc = ptyProcesses.get(id);
    if (proc) proc.resize(Math.max(2, Number(cols) || 80), Math.max(2, Number(rows) || 24));
  });

  ipcMain.handle("shob:terminal-kill", (_event, id) => {
    killPty(id);
  });
}

async function createWindow() {
  await ensureDataDirs();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 920,
    minHeight: 600,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#09090b",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on("maximize", () => mainWindow.webContents.send("shob:window-state", { maximized: true }));
  mainWindow.on("unmaximize", () => mainWindow.webContents.send("shob:window-state", { maximized: false }));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else if (isDev) {
    await mainWindow.loadURL("http://localhost:5173");
  } else {
    await mainWindow.loadFile(path.join(__dirname, "..", "dist-renderer", "index.html"));
  }
}

app.setName("shob");
app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", async () => {
  await handlers.cleanup_runtime();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
