import massage from '../assets/char-massage.jpg'
import suppress from '../assets/char-suppress.jpg'
import oscar from '../assets/char-oscar.jpg'
import chickenSoup from '../assets/char-chicken-soup.jpg'
import op from '../assets/char-op.jpg'
import dean from '../assets/char-dean.jpg'
import couqie from '../assets/char-couqie.jpg'
import couqieGod from '../assets/char-couqie-god.jpg'
import dazuo from '../assets/char-dazuo.jpg'
import peidie from '../assets/char-peidie.jpg'
import u from '../assets/char-u.jpg'
import gaowan from '../assets/char-gaowan.jpg'
import damuling from '../assets/char-damuling.jpg'
import jarwalker from '../assets/char-jarwalker.jpg'
import container from '../assets/char-container.jpg'
import doubao from '../assets/char-doubao.jpg'
import naiva from '../assets/char-naiva.jpg'
import naidou from '../assets/char-naidou.jpg'
import hanfei from '../assets/char-hanfei.jpg'
import yangyunbo from '../assets/char-yangyunbo.jpg'
import julao from '../assets/char-julao.jpg'
import baibai from '../assets/char-baibai.jpg'
import civilModel from '../assets/summon-civil-model.jpg'
import sharkbee from '../assets/summon-sharkbee.jpg'
import godson from '../assets/summon-godson.svg'
import chuyiKid from '../assets/summon-chuyi-kid.svg'

/** artId -> 角色牌面图 */
export const CHARACTER_ART: Record<string, string> = {
  massage,
  suppress,
  oscar,
  'chicken-soup': chickenSoup,
  op,
  dean,
  couqie,
  'couqie-god': couqieGod,
  dazuo,
  peidie,
  u,
  gaowan,
  damuling,
  jarwalker,
  container,
  doubao,
  naiva,
  naidou,
  hanfei,
  yangyunbo,
  julao,
  baibai,
}

/** artId -> 召唤物图标 */
export const SUMMON_ART: Record<string, string> = {
  'civil-model': civilModel,
  godson,
  sharkbee,
  'chuyi-kid': chuyiKid,
}
