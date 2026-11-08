import { useEffect, useRef } from 'react'
import {
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
  type Settings,
} from '../lib/settings'
import { setMasterVolume } from '../lib/audio'

type Props = {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
}

export default function SettingsSheet({ settings, onChange, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  return (
    <div
      className="sheet"
      role="dialog"
      aria-modal="true"
      aria-label="设置"
      onClick={onClose}
    >
      <div className="sheet__panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grip" aria-hidden="true" />
        <h2 className="sheet__title">设置</h2>

        <div className="field">
          <div className="field__row">
            <label className="field__label" htmlFor="setting-volume">
              音量
            </label>
            <span className="field__value">{settings.volume}</span>
          </div>
          <input
            id="setting-volume"
            type="range"
            min={0}
            max={100}
            step={1}
            value={settings.volume}
            onChange={(e) => {
              const value = Number(e.target.value)
              onChange({ volume: value })
              setMasterVolume(value)
            }}
          />
        </div>

        <div className="field">
          <div className="field__row">
            <label className="field__label" htmlFor="setting-font">
              字体大小
            </label>
            <span className="field__value">{Math.round(settings.fontScale * 100)}%</span>
          </div>
          <input
            id="setting-font"
            type="range"
            min={FONT_SCALE_MIN}
            max={FONT_SCALE_MAX}
            step={FONT_SCALE_STEP}
            value={settings.fontScale}
            onChange={(e) => onChange({ fontScale: Number(e.target.value) })}
          />
        </div>

        <button
          ref={closeRef}
          type="button"
          className="menu-btn menu-btn--primary sheet__close"
          onClick={onClose}
        >
          完成
        </button>
      </div>
    </div>
  )
}
