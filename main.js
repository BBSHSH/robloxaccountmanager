"use strict";

const { app, BrowserWindow, ipcMain, safeStorage, session } = require("electron");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
let window;

function appDataFile() { return path.join(app.getPath("userData"), "accounts.json"); }
function readData() {
  try { const parsed = JSON.parse(fs.readFileSync(appDataFile(), "utf8")); return { accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [] }; }
  catch { return { accounts: [] }; }
}
function writeData(data) { fs.mkdirSync(path.dirname(appDataFile()), { recursive: true }); fs.writeFileSync(appDataFile(), JSON.stringify(data, null, 2), "utf8"); }
function publicAccount(account) { const { cookieEncrypted, ...publicFields } = account; return { ...publicFields, hasCookie: Boolean(cookieEncrypted || account.loginStatus === "verified") }; }
function publicAccounts() { return readData().accounts.map(publicAccount); }
function sanitizeAccount(input) {
  const name = String(input?.name || "").trim(); const username = String(input?.username || "").trim(); const note = String(input?.note || "").trim();
  if (!name || name.length > 48) throw new Error("表示名は1〜48文字で入力してください。");
  if (username.length > 64 || note.length > 280) throw new Error("入力が長すぎます。");
  return { name, username, note };
}
function sanitizeGameId(value) { const gameId = String(value || "").trim(); if (gameId && !/^\d{1,20}$/.test(gameId)) throw new Error("ゲームIDは数字だけで入力してください。"); return gameId; }
function encryptCookie(value) { if (!safeStorage.isEncryptionAvailable()) throw new Error("Windowsの暗号化機能を利用できません。"); return safeStorage.encryptString(value).toString("base64"); }
function decryptCookie(account) { if (!account.cookieEncrypted) throw new Error("このアカウントにはCookieが登録されていません。"); try { return safeStorage.decryptString(Buffer.from(account.cookieEncrypted, "base64")); } catch { throw new Error("保存済みCookieを復号できません。もう一度入力してください。"); } }
async function sessionCookie(account) {
  const cookies = await session.fromPartition(`persist:roblox-account-${account.id}`).cookies.get({ url: "https://www.roblox.com/", name: ".ROBLOSECURITY" });
  return cookies[0]?.value || "";
}
async function usableCookie(account) {
  if (account.cookieEncrypted) return decryptCookie(account);
  const cookie = await sessionCookie(account);
  if (!cookie) throw new Error("公式ログインまたはCookie登録が必要です。");
  return cookie;
}
async function robloxFetch(url, cookie) { const response = await fetch(url, { headers: { Cookie: `.ROBLOSECURITY=${cookie}` } }); if (!response.ok) throw new Error(`Roblox API HTTP ${response.status}`); return response.json(); }
async function refreshAccount(account) {
  const cookie = await usableCookie(account);
  const authenticated = await robloxFetch("https://users.roblox.com/v1/users/authenticated", cookie);
  const thumbnail = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${authenticated.id}&size=150x150&format=Png&isCircular=false`).then((response) => response.ok ? response.json() : null).catch(() => null);
  return { ...account, robloxId: String(authenticated.id), username: String(authenticated.name || account.username || ""), displayName: String(authenticated.displayName || authenticated.name || ""), avatarUrl: thumbnail?.data?.[0]?.imageUrl || "", verifiedAt: new Date().toISOString(), loginStatus: "verified", loginError: "" };
}
function updateAccount(id, mutate) { const data = readData(); const index = data.accounts.findIndex((account) => account.id === id); if (index < 0) throw new Error("アカウントが見つかりません。"); data.accounts[index] = mutate(data.accounts[index]); writeData(data); return data.accounts[index]; }
async function openRobloxWindow(account, url) {
  const partition = `persist:roblox-account-${account.id}`; const accountSession = session.fromPartition(partition);
  if (account.cookieEncrypted) {
    const cookie = decryptCookie(account);
    await accountSession.cookies.set({ url: "https://www.roblox.com", domain: ".roblox.com", path: "/", name: ".ROBLOSECURITY", value: cookie, secure: true, httpOnly: true, sameSite: "lax" });
  } else if (!await sessionCookie(account)) throw new Error("公式ログインまたはCookie登録が必要です。");
  const accountWindow = new BrowserWindow({ width: 1180, height: 800, minWidth: 800, minHeight: 600, title: `${account.name} — Roblox`, webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true } });
  await accountWindow.loadURL(url);
}
function createWindow() { window = new BrowserWindow({ width: 1040, height: 760, minWidth: 800, minHeight: 600, backgroundColor: "#10131b", webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false } }); window.removeMenu(); window.loadFile("index.html"); }

app.whenReady().then(() => { createWindow(); app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
ipcMain.handle("state:load", () => ({ accounts: publicAccounts(), encryptionAvailable: safeStorage.isEncryptionAvailable() }));
ipcMain.handle("account:add", (_event, input) => { const data = readData(); data.accounts.push({ id: crypto.randomUUID(), ...sanitizeAccount(input), gameId: "", createdAt: new Date().toISOString(), loginStatus: "unverified" }); writeData(data); return publicAccounts(); });
ipcMain.handle("account:remove", async (_event, id) => {
  const data = readData();
  if (!data.accounts.some((account) => account.id === id)) throw new Error("アカウントが見つかりません。");
  await session.fromPartition(`persist:roblox-account-${id}`).clearStorageData({ storages: ["cookies"] });
  data.accounts = data.accounts.filter((account) => account.id !== id);
  writeData(data);
  return publicAccounts();
});
ipcMain.handle("account:set-cookie", (_event, id, rawCookie) => { const cookie = String(rawCookie || "").trim(); if (!cookie) throw new Error("Cookieを入力してください。"); return publicAccount(updateAccount(id, (current) => ({ ...current, cookieEncrypted: encryptCookie(cookie), loginStatus: "unverified", loginError: "" }))); });
ipcMain.handle("account:login", async (_event, id) => {
  const account = readData().accounts.find((item) => item.id === id);
  if (!account) throw new Error("アカウントが見つかりません。");
  const partition = `persist:roblox-account-${account.id}`;
  const loginWindow = new BrowserWindow({ width: 1180, height: 800, minWidth: 800, minHeight: 600, title: `${account.name} — Roblox Login`, webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true } });
  await loginWindow.loadURL("https://www.roblox.com/login");
  return true;
});
ipcMain.handle("account:set-game", (_event, id, gameInput) => { const gameId = sanitizeGameId(gameInput); return publicAccount(updateAccount(id, (current) => ({ ...current, gameId }))); });
ipcMain.handle("account:verify", async (_event, id) => {
  try { const refreshed = await refreshAccount(updateAccount(id, (current) => current)); updateAccount(id, () => refreshed); return publicAccount(refreshed); }
  catch { return publicAccount(updateAccount(id, (current) => ({ ...current, loginStatus: "failed", loginError: "ログイン確認に失敗しました。" }))); }
});
ipcMain.handle("account:verify-all", async () => { for (const account of readData().accounts) { if (!account.cookieEncrypted) continue; try { const refreshed = await refreshAccount(account); updateAccount(account.id, () => refreshed); } catch { updateAccount(account.id, (current) => ({ ...current, loginStatus: "failed", loginError: "ログイン確認に失敗しました。" })); } } return publicAccounts(); });
ipcMain.handle("account:open", async (_event, id) => { const account = readData().accounts.find((item) => item.id === id); if (!account) throw new Error("アカウントが見つかりません。"); await openRobloxWindow(account, "https://www.roblox.com/home"); return true; });
ipcMain.handle("account:open-game", async (_event, id, gameInput) => { const gameId = sanitizeGameId(gameInput); if (!gameId) throw new Error("ゲームIDを入力してください。"); const account = updateAccount(id, (current) => ({ ...current, gameId })); await openRobloxWindow(account, `https://www.roblox.com/games/${gameId}`); return true; });
ipcMain.handle("account:open-all", async (_event, gameInput) => {
  const gameId = sanitizeGameId(gameInput);
  const accounts = [];
  for (const account of readData().accounts) {
    if (account.cookieEncrypted || await sessionCookie(account)) accounts.push(account);
  }
  if (!accounts.length) throw new Error("公式ログインまたはCookie登録済みのアカウントがありません。");
  for (const account of accounts) await openRobloxWindow(account, gameId ? `https://www.roblox.com/games/${gameId}` : "https://www.roblox.com/home");
  return true;
});
