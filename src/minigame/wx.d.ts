// The few WeChat mini game APIs the game uses (https://developers.weixin.qq.com/minigame/dev/api/).

declare namespace WechatMinigame {
  interface Rect {
    top: number;
    right: number;
    bottom: number;
    left: number;
    width: number;
    height: number;
  }
  interface WindowInfo {
    windowWidth: number;
    windowHeight: number;
    pixelRatio: number;
    safeArea?: Rect;
  }
  interface Touch {
    identifier: number;
    clientX: number;
    clientY: number;
  }
  interface TouchEvent {
    touches: Touch[];
    changedTouches: Touch[];
  }
  interface FileSystemManager {
    readFile(opts: { filePath: string; success: (res: { data: ArrayBuffer }) => void; fail: (err: { errMsg: string }) => void }): void;
  }
  interface Wx {
    getWindowInfo?(): WindowInfo;
    getSystemInfoSync(): WindowInfo;
    getMenuButtonBoundingClientRect?(): Rect;
    createCanvas(): HTMLCanvasElement;
    onTouchStart(cb: (e: TouchEvent) => void): void;
    onTouchMove(cb: (e: TouchEvent) => void): void;
    onTouchEnd(cb: (e: TouchEvent) => void): void;
    onTouchCancel(cb: (e: TouchEvent) => void): void;
    getFileSystemManager(): FileSystemManager;
    getStorageSync(key: string): unknown;
    setStorageSync(key: string, value: string): void;
    removeStorageSync(key: string): void;
    createWebAudioContext?(): AudioContext;
    loadFont(path: string): string | null;
    onShow(cb: () => void): void;
    onHide(cb: () => void): void;
    onError?(cb: (res: { message: string; stack?: string }) => void): void;
    setKeepScreenOn?(opts: { keepScreenOn: boolean }): void;
  }
}

declare const wx: WechatMinigame.Wx;
declare const GameGlobal: Record<string, unknown>;
