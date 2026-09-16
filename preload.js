"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("launcher", {
  load: () => ipcRenderer.invoke("state:load"),
  addAccount: (account) => ipcRenderer.invoke("account:add", account),
  addAndLogin: () => ipcRenderer.invoke("account:add-and-login"),
  removeAccount: (id) => ipcRenderer.invoke("account:remove", id),
  setCookie: (id, cookie) => ipcRenderer.invoke("account:set-cookie", id, cookie),
  login: (id) => ipcRenderer.invoke("account:login", id),
  setGame: (id, gameId) => ipcRenderer.invoke("account:set-game", id, gameId),
  verify: (id) => ipcRenderer.invoke("account:verify", id),
  verifyAll: () => ipcRenderer.invoke("account:verify-all"),
  open: (id) => ipcRenderer.invoke("account:open", id),
  openGame: (id, gameId) => ipcRenderer.invoke("account:open-game", id, gameId),
  openAll: (gameId) => ipcRenderer.invoke("account:open-all", gameId),
  onAccountCaptured: (callback) => ipcRenderer.on("account:captured", (_event, account) => callback(account)),
  onAccountDiscarded: (callback) => ipcRenderer.on("account:discarded", (_event, id) => callback(id)),
});
