// 玩家昵称与头像（本地保存，开始匹配 / 单人时带给服务端）

export type Profile = {
  /** 昵称，最多 10 个字符 */
  name: string
  /** 头像：一个表情字符 */
  avatar: string
}

/** 可选头像：聊天常用小表情 */
export const AVATARS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣',
  '🙂', '😊', '😇', '🙃', '😉', '😌', '😍', '🥰',
  '😘', '😋', '😛', '😜', '🤪', '🤨', '🧐', '🤓',
  '😎', '🥳', '😏', '😒', '😞', '😔', '😕', '🙁',
  '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤',
  '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱',
  '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫',
  '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😮',
  '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴',
  '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠',
  '😈', '👿', '👻', '💀', '🤖', '💩', '👽', '🐶',
  '🐱', '🐼', '🐸', '🐵', '🦊', '🐷', '🐔', '🐧',
]

const KEY = 'paju-profile'

export const DEFAULT_PROFILE: Profile = { name: '', avatar: '😀' }

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_PROFILE
    const data = JSON.parse(raw) as Partial<Profile>
    return {
      name: typeof data.name === 'string' ? data.name.slice(0, 10) : '',
      avatar: typeof data.avatar === 'string' && data.avatar ? data.avatar : DEFAULT_PROFILE.avatar,
    }
  } catch {
    return DEFAULT_PROFILE
  }
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ name: profile.name.slice(0, 10), avatar: profile.avatar }),
    )
  } catch {
    /* 忽略存储失败 */
  }
}
