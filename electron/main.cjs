// 데스크톱 앱(Windows exe) 진입점. Vite로 빌드한 dist/를 창에 띄우고,
// GitHub Releases에서 새 버전을 확인해 자동으로 업데이트한다.
const { app, BrowserWindow, dialog } = require('electron');
const path = require('node:path');
const { autoUpdater } = require('electron-updater');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    backgroundColor: '#0d0605',
    autoHideMenuBar: true,
    title: 'MELTDOWN',
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

function setupAutoUpdate() {
  // 새 버전을 백그라운드에서 받아 두고, 다 받으면 재시작할지 묻는다.
  // "나중에"를 고르면 게임을 끌 때 설치된다.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['지금 재시작', '나중에'],
      defaultId: 0,
      cancelId: 1,
      title: 'MELTDOWN 업데이트',
      message: `새 버전 ${info.version}이 준비되었습니다.`,
      detail: '재시작하면 바로 적용됩니다. "나중에"를 고르면 게임을 끌 때 적용됩니다.',
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on('error', (err) => console.error('[update]', err));
  autoUpdater.checkForUpdates().catch((err) => console.error('[update]', err));
}

app.whenReady().then(() => {
  createWindow();
  // 개발 실행(npm run app)에서는 업데이트를 확인하지 않는다
  if (app.isPackaged) setupAutoUpdate();
});

app.on('window-all-closed', () => app.quit());
