import { app, BrowserWindow, desktopCapturer, ipcMain, session, shell, systemPreferences } from "electron";
import path from "node:path";

/*
 * A. 온라인 회의 버전 – Electron 메인 프로세스
 * 렌더러가 getDisplayMedia({ audio: true })를 부르면 화면 선택 창 없이
 * 시스템 오디오(loopback)를 넘겨준다. Teams/Zoom 데스크톱 앱 소리도 여기에 포함된다.
 */

if (process.platform === "darwin") {
  // macOS 13+ 에서 ScreenCaptureKit 기반 시스템 오디오 캡처를 켠다 (Electron/Chromium 버전에 따라 기본값이 다름)
  app.commandLine.appendSwitch("enable-features", "MacLoopbackAudioForScreenShare,MacSckSystemAudioLoopbackOverride");
}

let win: BrowserWindow | null = null;
const NORMAL = { width: 1280, height: 820 };
const OVERLAY = { width: 460, height: 640 };

function createWindow() {
  win = new BrowserWindow({
    ...NORMAL,
    minWidth: 380,
    minHeight: 480,
    title: "회의 마인드맵 (온라인)",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(path.join(__dirname, "../../dist/index.html"));

  // 외부 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  const ses = session.defaultSession;

  // 마이크·화면(오디오) 권한 요청은 이 앱 화면에서 온 것만 허용
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "media" || permission === "display-capture");
  });

  ses.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ["screen"] });
        if (!sources[0]) return callback({});
        // video는 API 요구사항이라 함께 넘기지만 렌더러에서 바로 끈다
        callback({ video: sources[0], audio: "loopback" });
      } catch {
        callback({});
      }
    },
    { useSystemPicker: false },
  );

  ipcMain.handle("overlay:set", (_e, on: boolean) => {
    if (!win) return false;
    win.setAlwaysOnTop(on, "floating");
    const size = on ? OVERLAY : NORMAL;
    win.setSize(size.width, size.height, true);
    return on;
  });

  ipcMain.handle("permissions:status", () => {
    if (process.platform !== "darwin") return { mic: "granted", screen: "granted" };
    return {
      mic: systemPreferences.getMediaAccessStatus("microphone"),
      screen: systemPreferences.getMediaAccessStatus("screen"),
    };
  });

  ipcMain.handle("permissions:open-settings", () => {
    if (process.platform === "darwin") {
      void shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
    }
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
