/**
 * 非技能手牌的牌面美术。
 * 目前为空的，等 32 张牌的图片提供后，按 artId 挂进来即可。
 */
import gym from '../assets/card-gym.jpg'
import southgate from '../assets/card-southgate.jpg'
import auditorium from '../assets/card-auditorium.jpg'
import stone from '../assets/card-stone.jpg'
import cafeteria from '../assets/card-cafeteria.jpg'
import playground from '../assets/card-playground.jpg'
import teachingBuilding from '../assets/card-teaching-building.jpg'
import rainbowPavilion from '../assets/card-rainbow-pavilion.jpg'
import sausage from '../assets/card-sausage.jpg'
import freeSoup from '../assets/card-free-soup.jpg'
import fries from '../assets/card-fries.jpg'
import drumstickNoodles from '../assets/card-drumstick-noodles.jpg'
import drumstickRice from '../assets/card-drumstick-rice.jpg'
import coldNoodles from '../assets/card-cold-noodles.jpg'
import iceTea from '../assets/card-ice-tea.jpg'
import strongCool from '../assets/card-strong-cool.jpg'
import fiveThree from '../assets/card-five-three.jpg'
import kazoo from '../assets/card-kazoo.jpg'
import headphones from '../assets/card-headphones.jpg'
import bazhongKill from '../assets/card-bazhong-kill.jpg'
import sticker from '../assets/card-sticker.jpg'
import football from '../assets/card-football.jpg'
import poker from '../assets/card-poker.jpg'
import mealCard from '../assets/card-meal-card.jpg'
import parabola from '../assets/card-parabola.jpg'
import seewoWhiteboard from '../assets/card-seewo-whiteboard.jpg'
import aminos from '../assets/card-aminos.jpg'
import singerContest from '../assets/card-singer-contest.jpg'
import sportsMeet from '../assets/card-sports-meet.jpg'
import openClass from '../assets/card-open-class.jpg'
import awardCeremony from '../assets/card-award-ceremony.jpg'
import newYearParty from '../assets/card-new-year-party.jpg'

export const CARD_ART: Record<string, string> = {
  gym,
  southgate,
  auditorium,
  stone,
  cafeteria,
  playground,
  'teaching-building': teachingBuilding,
  'rainbow-pavilion': rainbowPavilion,
  sausage,
  'free-soup': freeSoup,
  fries,
  'drumstick-noodles': drumstickNoodles,
  'drumstick-rice': drumstickRice,
  'cold-noodles': coldNoodles,
  'ice-tea': iceTea,
  'strong-cool': strongCool,
  'five-three': fiveThree,
  kazoo,
  headphones,
  'bazhong-kill': bazhongKill,
  sticker,
  football,
  poker,
  'meal-card': mealCard,
  parabola,
  'seewo-whiteboard': seewoWhiteboard,
  aminos,
  'singer-contest': singerContest,
  'sports-meet': sportsMeet,
  'open-class': openClass,
  'award-ceremony': awardCeremony,
  'new-year-party': newYearParty,
}

export function cardArtUrl(artId: string | null): string | undefined {
  if (!artId) return undefined
  return CARD_ART[artId]
}
