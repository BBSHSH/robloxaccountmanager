"use strict";

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto");

let window;

function appDataFile() {
  return path.join(app.getPath("userData"), "accounts.json");
}

function chromeUserDataDirectory() {
  return path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "User Data");
}

function loadChromeProfiles() {
  const root = chromeUserDataDirectory();
  const fallback = [{ directory: "Default", name: "Default" }];
  try {
    const localState = JSON.parse(fs.readFileSync(path.join(root, "Local State"), "utf8"));
    const infoCache = localState?.profile?.info_cache || {};
    const profiles = Object.entries(infoCache)
      .filter(([directory]) => fs.existsSync(path.join(root, directory)))
      .map(([directory, info]) => ({ directory, name: String(info?.name || directory) }));
    return profiles.length ? profiles : fallback;
  } catch {
    return fallback;
  }
}

function readData() {
  try {
    const parsed = JSON.parse(fs.readFileSync(appDataFile(), "utf8"));
    return { browserPath: parsed.browserPath || "", accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [] };
  } catch {
    return { browserPath: "", accounts: [] };
  }
}

function writeData(data) {
  fs.mkdirSync(path.dirname(appDataFile()), { recursive: true });
  fs.writeFileSync(appDataFile(), JSON.stringify(data, null, 2), "utf8");
}

function defaultChromePath() {
  const candidates = [
    path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function sanitizeAccount(input) {
  const name = String(input?.name || "").trim();
  const username = String(input?.username || "").trim();
  const note = String(input?.note || "").trim();
  if (!name || name.length > 48) throw new Error("表示名は1〜48文字で入力してください。");
  if (username.length > 64 || note.length > 280) throw new Error("入力が長すぎます。");
  const chromeProfile = String(input?.chromeProfile || "Default").trim();
  if (!chromeProfile || chromeProfile.includes("..") || /[\\/]/.test(chromeProfile)) {
    throw new Error("Chromeプロファイルの指定が不正です。");
  }
  return { name, username, note, chromeProfile };
}

function createWindow() {
  window = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: "#10131b",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
  });
  window.removeMenu();
  window.loadFile("index.html");
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

ipcMain.handle("state:load", () => {
  const state = readData();
  return { ...state, defaultChromePath: defaultChromePath(), chromeProfiles: loadChromeProfiles() };
});

ipcMain.handle("account:add", (_event, input) => {
  const state = readData();
  const account = { id: crypto.randomUUID(), ...sanitizeAccount(input), createdAt: new Date().toISOString() };
  state.accounts.push(account);
  writeData(state);
  return state.accounts;
});

ipcMain.handle("account:remove", (_event, id) => {
  const state = readData();
  state.accounts = state.accounts.filter((account) => account.id !== id);
  writeData(state);
  return state.accounts;
});

ipcMain.handle("settings:browser", (_event, browserPath) => {
  const state = readData();
  const value = String(browserPath || "").trim();
  if (value && !fs.existsSync(value)) throw new Error("指定されたChrome実行ファイルが見つかりません。");
  state.browserPath = value;
  writeData(state);
  return state.browserPath;
});

ipcMain.handle("settings:choose-browser", async () => {
  const result = await dialog.showOpenDialog(window, { properties: ["openFile"], filters: [{ name: "Chrome", extensions: ["exe"] }] });
  return result.canceled ? "" : result.filePaths[0];
});

ipcMain.handle("account:launch", (_event, id) => {
  const state = readData();
  const account = state.accounts.find((item) => item.id === id);
  if (!account) throw new Error("アカウントが見つかりません。");
  const browserPath = state.browserPath || defaultChromePath();
  if (!browserPath || !fs.existsSync(browserPath)) throw new Error("Chromeの場所を設定してください。");
  const chromeProfile = account.chromeProfile || "Default";
  const child = spawn(browserPath, ["--profile-directory=" + chromeProfile, "--new-window", "https://www.roblox.com/home"], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
  return { ok: true, chromeProfile };
});
