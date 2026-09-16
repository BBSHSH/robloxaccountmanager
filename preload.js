"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("launcher", {
  load: () => ipcRenderer.invoke("state:load"),
  addAccount: (account) => ipcRenderer.invoke("account:add", account),
  removeAccount: (id) => ipcRenderer.invoke("account:remove", id),
  launch: (id) => ipcRenderer.invoke("account:launch", id),
  setBrowser: (browserPath) => ipcRenderer.invoke("settings:browser", browserPath),
  chooseBrowser: () => ipcRenderer.invoke("settings:choose-browser"),
});
