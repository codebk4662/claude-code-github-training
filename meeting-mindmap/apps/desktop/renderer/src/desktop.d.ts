export {};

declare global {
  interface Window {
    /** preload.ts 에서 노출. 브라우저로 열면 undefined */
    desktop?: {
      platform: string;
      setOverlay(on: boolean): Promise<boolean>;
      permissionStatus(): Promise<{ mic: string; screen: string }>;
      openPermissionSettings(): Promise<void>;
    };
  }
}
