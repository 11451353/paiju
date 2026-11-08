export type Settings = {
  /** 主音量，0-100 */
  volume: number
  /** 界面字号缩放，作用于根字号，所有 rem 尺寸随之变化 */
  fontScale: number
}

export const DEFAULT_SETTINGS: Settings = {
  volume: 70,
  fontScale: 1,
}

export const FONT_SCALE_MIN = 0.85
export const FONT_SCALE_MAX = 1.4
export const FONT_SCALE_STEP = 0.05

const STORAGE_KEY = 'sgs.settings.v1'

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, n))
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      volume: clamp(Number(parsed.volume ?? DEFAULT_SETTINGS.volume), 0, 100),
      fontScale: clamp(
        Number(parsed.fontScale ?? DEFAULT_SETTINGS.fontScale),
        FONT_SCALE_MIN,
        FONT_SCALE_MAX,
      ),
    }
  } catch {
    // 隐私模式或存储被禁用时回退到默认值
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // 写入失败不影响当前会话
  }
}

export function applyFontScale(scale: number): void {
  document.documentElement.style.setProperty('--font-scale', String(scale))
}
