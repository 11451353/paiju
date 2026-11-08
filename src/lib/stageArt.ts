import jarwalker from '../assets/char-jarwalker.jpg'
import doubao from '../assets/char-doubao.jpg'

/** artId -> 关卡图标。新增关卡时在这里注册图片；未注册或 artId 为 null 时显示空白图标。 */
export const STAGE_ART: Record<string, string> = {
  jarwalker,
  doubao,
}
