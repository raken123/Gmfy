/* Gmfy desktop shell — a thin Electron window around the offline web app. */
const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 860,
    minHeight: 560,
    backgroundColor: "#10142a",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "build", "icon.png"), // used on Linux; mac/win get packaged icons
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "www", "index.html"));

  // any external link (none today, but Play Links could point at the hosted site)
  // opens in the user's browser, never inside the app shell
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
