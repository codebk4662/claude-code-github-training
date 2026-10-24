import { contextBridge, ipcRenderer } from "electron";

/** 렌더러에 노출하는 최소한의 데스크톱 기능 */
contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  setOverlay: (on: boolean): Promise<boolean> => ipcRenderer.invoke("overlay:set", on),
  permissionStatus: (): Promise<{ mic: string; screen: string }> => ipcRenderer.invoke("permissions:status"),
  openPermissionSettings: (): Promise<void> => ipcRenderer.invoke("permissions:open-settings"),
});
