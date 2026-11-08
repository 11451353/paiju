// @ts-nocheck
// 对局引擎：角色选择 → 选前台 → 回合循环（摸牌 / 投掷 / 行动 / 结束）

import type {
  CardEffect,
  CardInfo,
  CardKind,
  CharacterInfo,
  CharacterView,
  GamePhase,
  GameView,
  ItemBuffView,
  LastPlayView,
  PlayerPublic,
  PoolEntry,
  SelfView,
  SkillDef,
  SkillSet,
} from '../shared/types'
import { EFFECT_MAP } from '../shared/effects'
import { STAGE_MAP } from '../shared/stages'

export const DECK_SIZE = 128
export const HAND_LIMIT = 10
export const DRAW_PER_ROUND = 5
export const CHARACTERS_PER_PLAYER = 3

/** 卡牌配比。技能牌共 64 张；非技能牌每种定义各 2 张，剩余名额用空白牌补足到 128 张 */
export const CARD_COUNTS = {
  normal: 32,
  skill: 20,
  burst: 12,
  // 非技能牌：场地 16（8 种）+ 道具 16（8 种）+ 事件 16（8 种）+ 配饰 16（8 种）
  field: 16,
  item: 16,
  event: 16,
  accessory: 16,
  blank: 0,
}

export const BLANK_CARD_COST = 1
export const BLANK_CHARACTER_HP = 13
/** 每人最多同时装备的场地牌数量 */
export const MAX_FIELDS = 2
/** 每人最多同时装备的配饰牌数量 */
export const MAX_ACCESSORIES = 2
/** 主动换人的行动点消耗 */
export const SWITCH_COST = 1

/** 空白角色的技能组 */
const BLANK_SKILLS: SkillSet = {
  normal: { name: '普攻', cost: 2, damage: 2, description: '对对方前台角色造成 2 点伤害' },
  skill: { name: '战技', cost: 3, damage: 3, description: '对对方前台角色造成 3 点伤害' },
  burst: { name: '大招', cost: 4, damage: 5, description: '对对方前台角色造成 5 点伤害' },
}

/** 按摩技师的技能组 */
const MASSAGE_SKILLS: SkillSet = {
  normal: {
    name: '普攻·小故事',
    cost: 1,
    damage: 1,
    description: '对对方前台角色造成 1 点伤害，积累 1 层怒气。',
    selfEffect: { defId: 'rage', stacks: 1 },
  },
  skill: {
    name: '战技·叫醒服务',
    cost: 2,
    damage: 2,
    description: '对对方前台角色造成 2 点伤害，积累 2 层怒气。',
    selfEffect: { defId: 'rage', stacks: 2 },
  },
  burst: {
    name: '大招·大按摩术',
    cost: 5,
    damage: 4,
    description:
      '对对方前台角色造成 4 点伤害，消耗全部怒气，每消耗 1 层伤害 +1；消耗超过 3 层时，每多 1 层使目标获得 1 回合流血，最多 3 层。',
    consume: {
      defId: 'rage',
      damagePerStack: 1,
      overflowThreshold: 3,
      extraEffect: { defId: 'bleed', maxStacks: 3 },
    },
  },
}

/** 抑制剂的技能组 */
const SUPPRESS_SKILLS: SkillSet = {
  normal: {
    name: '普攻·提问',
    cost: 2,
    damage: 2,
    description: '对对方前台角色造成 2 点伤害。',
  },
  skill: {
    name: '战技·音箱尖啸',
    cost: 3,
    damage: 1,
    description:
      '对对方前台角色造成 1 点伤害，并使其获得「行动点压制」：该玩家行动开始时行动点 -2（最低 0），生效一次后移除。不可叠加，全场同时只能存在一个。',
    targetEffect: { defId: 'ap-down', stacks: 1, uniqueOnField: true },
  },
  burst: {
    name: '大招·背诵古文',
    cost: 4,
    damage: 1,
    description:
      '对对方全体角色（含后台）造成 1 点伤害；每个目标身上每有 1 个负面效果，该目标受到的伤害 +2，最多 +4。',
    hitAll: true,
    damagePerDebuff: { amount: 2, max: 4 },
  },
}

/** 奥斯卡小金马的技能组 */
const OSCAR_SKILLS: SkillSet = {
  normal: {
    name: '普攻·十年',
    cost: 2,
    damage: 2,
    description: '对对方前台角色造成 2 点伤害。',
  },
  skill: {
    name: '战技·小丑',
    cost: 3,
    damage: 1,
    description: '对对方前台角色造成 1 点伤害，治疗我方全体 1 点，并获得 1 层小丑。',
    healAll: 1,
    selfEffect: { defId: 'clown', stacks: 1 },
  },
  burst: {
    name: '大招·海王本色',
    cost: 4,
    damage: 0,
    description:
      '自身获得「海王」，持续 2 回合：受到敌方角色攻击时，攻击者受到 1 点伤害；并获得「谢幕」：接下来的 2 次结束阶段各获得 2 层小丑。',
    selfEffects: [
      { defId: 'seaking', stacks: 2 },
      { defId: 'clown-phase', stacks: 2 },
    ],
  },
}

/** 鸡汤王的技能组 */
const CHICKEN_SKILLS: SkillSet = {
  normal: {
    name: '普攻·鸡汤',
    cost: 2,
    damage: 0,
    description: '对目标施加 1 个「毒鸡汤」，持续 2 次。',
    targetStack: { defId: 'poison-soup', stacks: 2 },
  },
  skill: {
    name: '战技·禁令',
    cost: 3,
    damage: 1,
    description:
      '若目标存在正面效果，先随机解除其中 1 个；造成 1 点伤害，并施加 1 个「毒鸡汤」。',
    stripBuff: true,
    targetStack: { defId: 'poison-soup', stacks: 2 },
  },
  burst: {
    name: '大招·闪现没收',
    cost: 4,
    damage: 2,
    description:
      '造成 2 点伤害，从目标所属玩家已装备的场地牌和配饰牌中随机弃置 2 张，并立即触发目标身上所有结束阶段造成伤害的负面效果（不消耗其次数）。',
    discardEquipments: 2,
    triggerEndDots: true,
  },
}

/** OP 的技能组 */
const OP_SKILLS: SkillSet = {
  normal: {
    name: '普攻·米卫兵',
    cost: 3,
    damage: 2,
    description: '对对方前台角色造成 2 点伤害。持有「米卫兵」时强化为「强化普攻·OP之怒」。',
  },
  skill: {
    name: '战技·我爱miHoYo',
    cost: 2,
    damage: 0,
    description:
      '扣除自身 5 点生命（最低保留 1 点），获得 2 层「米卫兵」：接下来 2 次普攻变为「强化普攻·OP之怒」，伤害 +2、费用 -1，并对目标方生命最高的后台角色造成 1 点伤害；每次强化普攻消耗 1 层。',
    selfHpLoss: 5,
    selfEffect: { defId: 'miho', stacks: 2 },
  },
  burst: {
    name: '大招·原神启动',
    cost: 5,
    damage: 2,
    description:
      '对目标前台造成 2 点伤害，对后台角色各造成 1 点伤害，并回复自身 4 点生命。生命不高于 15/10/5 时，费用 -0/-1/-1，回复 +1/+2/+3。',
    hitAllBack: 1,
    healSelf: 4,
  },
}

/** 凑企厄（基础形态）的技能组 */
const COUQIE_SKILLS: SkillSet = {
  normal: {
    name: '普攻·逐火',
    cost: 1,
    damage: 1,
    description: '对对方前台角色造成 1 点伤害。',
  },
  skill: {
    name: '战技·救世',
    cost: 3,
    damage: 2,
    description: '对对方前台角色造成 2 点伤害，并使自身大招花费永久降低 1 点。',
    reduceBurstCost: 1,
  },
  burst: {
    name: '大招·爱上雷神',
    cost: 12,
    damage: 0,
    description:
      '永久变身为神厄形态：生命上限 +6 并回复自身 6 点生命。每个回合结束时大招花费永久降低 1 点；我方队友死亡时大招花费降低 2 点。神厄形态没有大招，打出大招会释放战技。',
    transformGod: true,
  },
}

/** 凑企厄·神厄形态的技能组 */
const GOD_SKILLS: SkillSet = {
  normal: {
    name: '普攻·烈阳',
    cost: 2,
    damage: 2,
    description:
      '获得 2 层「毁伤」，对对方前台角色造成 2 点伤害，并对敌方后台生命最高的角色造成 1 点伤害。',
    selfEffect: { defId: 'ruin', stacks: 2 },
    hitHighestBack: 1,
  },
  skill: {
    name: '战技·黎明',
    cost: 3,
    damage: 1,
    description:
      '对敌方前后台全体造成 1 点伤害，每击中一个目标获得 1 层「毁伤」。持有超过 4 层「毁伤」时强化为「战技·死星」。',
    hitAll: true,
    selfEffectPerHit: { defId: 'ruin', stacks: 1 },
    consumeStacksBurst: { defId: 'ruin', threshold: 4, randomDamage: 1, finalDamage: 1 },
  },
  burst: {
    name: '战技·黎明',
    cost: 3,
    damage: 1,
    description:
      '神厄形态没有大招，打出大招会释放战技。对敌方前后台全体造成 1 点伤害，每击中一个目标获得 1 层「毁伤」。持有超过 4 层「毁伤」时强化为「战技·死星」。',
    hitAll: true,
    selfEffectPerHit: { defId: 'ruin', stacks: 1 },
    consumeStacksBurst: { defId: 'ruin', threshold: 4, randomDamage: 1, finalDamage: 1 },
  },
}

/** 大佐的技能组 */
const DAZUO_SKILLS: SkillSet = {
  normal: {
    name: '普攻·撅了',
    cost: 1,
    damage: 1,
    description: '对对方前台角色造成 1 点真实伤害（无视护盾与减伤）。',
    trueDamage: 1,
  },
  skill: {
    name: '战技·恶臭咆哮',
    cost: 4,
    damage: 2,
    description: '对对方前台角色造成 2 点伤害，自身附属「恶臭」，持续 3 回合。',
    selfEffect: { defId: 'stench', stacks: 3 },
  },
  burst: {
    name: '大招·三尺五寸义父',
    cost: 4,
    damage: 0,
    description: '召唤「干儿子」，并回复自身 3 点生命。',
    summon: { defId: 'godson', taunt: 0, uses: 3 },
    healSelf: 3,
  },
}

/** 佩爹的技能组 */
const PEIDIE_SKILLS: SkillSet = {
  normal: {
    name: '普攻·抽象',
    cost: 2,
    damage: 2,
    description: '对对方前台角色造成 2 点物理伤害。',
  },
  skill: {
    name: '战技·你佩爹',
    cost: 3,
    damage: 0,
    description:
      '指定一名玩家成为「儿子」，持续 3 回合。同时最多附属 2 名玩家。儿子玩家的角色使用技能后，对自身造成 2 点真实伤害。',
    applySon: 3,
  },
  burst: {
    name: '大招·大低能',
    cost: 4,
    damage: 0,
    description:
      '让所有儿子的持续时间延长 1 回合，并对所有儿子玩家的所有角色造成 2 点真实伤害。',
    sonBurst: { extend: 1, damage: 2 },
  },
}

/** U 的技能组 */
const U_SKILLS: SkillSet = {
  normal: {
    name: '普攻·教鞭',
    cost: 3,
    damage: 3,
    description:
      '造成 3 点伤害。受教鞭长度强化：1/2/3 段时伤害 +0/+3/+6、费用 -0/-1/-2；造成普通攻击伤害后长度重置为 1 段。',
  },
  skill: {
    name: '战技·随地大小变',
    cost: 2,
    damage: 0,
    description: '教鞭长度 +1 段（最多 3 段）。',
  },
  burst: {
    name: '大招·魔音·sinU',
    cost: 5,
    damage: 2,
    description: '造成 2 点伤害，并使自身下一次普通攻击伤害翻倍。',
    selfEffect: { defId: 'whip-double', stacks: 1 },
  },
}

/** 高玩的技能组 */
const GAOWAN_SKILLS: SkillSet = {
  normal: {
    name: '普攻·哇噻',
    cost: 1,
    damage: 1,
    description: '对对方前台角色造成 1 点物理伤害。',
  },
  skill: {
    name: '战技·纯屎孩子',
    cost: 3,
    damage: 2,
    description: '对所有玩家的前台角色造成 2 点魔法伤害（包括我方前台）。',
    hitAllFronts: 2,
  },
  burst: {
    name: '大招·假智力？真高玩',
    cost: 6,
    damage: 0,
    description:
      '获得 3 层「低能」。我方角色使用技能攻击敌方玩家时，高玩发动追加攻击·低能暴击：对目标全体角色造成 2 点伤害。',
    selfEffect: { defId: 'lowbrow', stacks: 3 },
  },
}

/** 大母零的技能组 */
const DAMULING_SKILLS: SkillSet = {
  normal: {
    name: '普攻·草泥马',
    cost: 2,
    damage: 2,
    description:
      '对对方前台角色造成 2 点物理伤害。存在鲨bee时，额外获得 2 点累积治疗。',
  },
  skill: {
    name: '战技·重量级抱枕',
    cost: 2,
    damage: 0,
    description:
      '召唤鲨bee。若鲨bee已存在且累积治疗 ≥1，则移除鲨bee并触发放电。',
    sharkBee: { mode: 'toggle', charge: 0 },
  },
  burst: {
    name: '大招·第五人格启动',
    cost: 4,
    damage: 0,
    description:
      '召唤鲨bee并立刻获得 5 点累积治疗；若已经存在鲨bee，则先获得 5 点累积治疗再移除它并触发放电。',
    sharkBee: { mode: 'burst', charge: 5 },
  },
}

/** 悍匪的技能组 */
const HANFEI_SKILLS: SkillSet = {
  normal: {
    name: '普攻·怒吼',
    cost: 2,
    damage: 2,
    description:
      '造成 2 点伤害。持有「悍匪之怒」时伤害 +2，并对目标方所有后台角色各造成 1 点伤害。',
  },
  skill: {
    name: '战技·推倒讲台',
    cost: 3,
    damage: 4,
    description:
      '造成 4 点物理伤害。持有「悍匪之怒」时伤害 +3，并对目标方所有后台角色各造成 1 点伤害。',
  },
  burst: {
    name: '大招·悍匪之威压',
    cost: 5,
    damage: 2,
    description:
      '对目标方全体角色造成 2 点伤害，自身获得持续 2 回合的「悍匪之怒」，重复施放可叠加。',
    hitAll: true,
    hitAllTarget: true,
    selfEffect: { defId: 'hanfei-rage', stacks: 2 },
  },
}

/** 杨云博的技能组 */
const YANG_SKILLS: SkillSet = {
  normal: {
    name: '普攻·魔性笑声',
    cost: 1,
    damage: 1,
    description: '造成 1 点伤害。',
  },
  skill: {
    name: '战技·初一小孩',
    cost: 3,
    damage: 0,
    description:
      '召唤「初一小孩」：拥有 5 点特殊生命。杨云博受击时消耗 1 点特殊生命，使本次受到的伤害 -1。结束阶段移除初一小孩，每剩余 1 点特殊生命治疗杨云博 1 点，并额外治疗 1 点。',
    summon: { defId: 'chuyi-kid', taunt: 0, hp: 5 },
  },
  burst: {
    name: '大招·我是辽宁的',
    cost: 3,
    damage: 0,
    description:
      '自身获得持续 3 回合的「我是辽宁的」：敌方攻击技能只能以杨云博为目标，同时攻击前后台的技能视为杨云博在前台；受到的伤害减半（向上取整）；结束阶段治疗自身 1 点。',
    selfEffect: { defId: 'liaoning', stacks: 3 },
  },
}

/** 巨佬的技能组 */
const JULAO_SKILLS: SkillSet = {
  normal: {
    name: '普攻·人畜无害',
    cost: 2,
    damage: 2,
    description: '造成 2 点伤害。',
  },
  skill: {
    name: '战技·提分秘籍',
    cost: 3,
    damage: 0,
    description:
      '治疗一名我方角色 1 点，并使其附属「巨佬」，持续 3 回合。同时只能存在 1 个巨佬 / PROMAX佬 状态；若已有，旧的会被移除。',
    targetAlly: true,
    healTarget: 1,
    targetEffect: { defId: 'julao', stacks: 3 },
  },
  burst: {
    name: '大招·PROMAX佬之自我修养',
    cost: 4,
    damage: 0,
    description:
      '摸 3 张牌，治疗我方全体 1 点。若存在「巨佬」，将其升级为「PROMAX佬」并延长 1 回合（不超过 3 回合）；再次施放战技会变回巨佬。',
    healAll: 1,
    drawCards: 3,
    upgradeJulao: true,
  },
}

/** 白白的技能组 */
const BAIBAI_SKILLS: SkillSet = {
  normal: {
    name: '普攻·切除',
    cost: 2,
    damage: 1,
    description: '造成 1 点伤害，并为目标附属 2 回合「紊乱」。',
    targetEffect: { defId: 'disorder', stacks: 2 },
  },
  skill: {
    name: '战技·稳态失衡',
    cost: 4,
    damage: 0,
    description: '使目标玩家的全体角色附属 3 回合「紊乱」。',
    disorderAll: 3,
  },
  burst: {
    name: '大招·免疫调节',
    cost: 3,
    damage: 0,
    description:
      '治疗我方全体 2 点，并为我方每名角色随机解除 1 个负面效果；成功解除负面效果的角色本次额外治疗 1 点。',
    cleanseHealAll: { heal: 2, bonus: 1 },
  },
}

/** 苑长的技能组 */
const DEAN_SKILLS: SkillSet = {
  normal: {
    name: '普攻·鞭腿',
    cost: 1,
    damage: 1,
    description: '对对方前台角色造成 1 点伤害。',
  },
  skill: {
    name: '战技·文明标兵',
    cost: 3,
    damage: 0,
    description:
      '在我方召唤「文明标兵」，并使其获得 3 点嘲讽值（上限 5）。再次使用会补充嘲讽值。',
    summon: { defId: 'civil-model', taunt: 3 },
  },
  burst: {
    name: '大招·六组限定小卡片',
    cost: 4,
    damage: 0,
    description:
      '我方获得 5 层「小卡片」。我方角色攻击时消耗 1 层，为攻击目标附加「标记」（不可叠加、不可重复施加）；命中多个目标时优先标记前台。',
    gainSmallCards: 5,
  },
}

/** 天赋说明，按 talentId 取 */
const TALENTS: Record<string, { name: string; cost: number; description: string }> = {
  rage: {
    name: '天赋·按摩体验',
    cost: 0,
    description:
      '使用普攻积累 1 层怒气、使用战技积累 2 层怒气，最多 5 层；释放大招时消耗全部层数。',
  },
  charge: {
    name: '天赋·大嘴巴子抽你',
    cost: 0,
    description:
      '我方对其他方目标施加负面效果时获得 1 层充能，最多 3 层。满 3 层时，我方下一次攻击消耗全部充能，额外造成 2 点真实伤害（无视减伤与护盾）。',
  },
  op: {
    name: '天赋·原神怎么你了',
    cost: 0,
    description:
      '生命不高于 15/10/5 时，造成的伤害 +1/+2/+3。生命小于 8 时，强化普攻命中目标后回复自身 2 点生命。',
  },
  u: {
    name: '天赋·连续惩罚',
    cost: 0,
    description:
      '施放普攻后，下一次施放战技时少花费 1 行动点；如果该战技牌被消耗，则返还这张技能牌。',
  },
  gaowan: {
    name: '天赋·出千',
    cost: 0,
    description: '对局第一回合我方投掷行动点时必定为 6，整场对局限 1 次。',
  },
  fame: {
    name: '天赋·万众瞩目',
    cost: 0,
    description: '开局获得 3 点护盾。',
  },
  oscar: {
    name: '天赋·小丑',
    cost: 0,
    description:
      '每次受到攻击最多获得 1 层小丑；未受到攻击而生命值降低时再获得 1 层。最多 6 层。持有大于等于 4 层时，普攻会强化为「强化普攻·我是小丑」：伤害 +2，命中后治疗我方全体 2 点并额外回复自身 1 点，同时消耗 4 层小丑。',
  },
}

type CharacterTemplate = {
  id: string
  name: string
  hp: number
  artId: string | null
  talentId: string | null
  skillSet: SkillSet
}

type EffectInstance = {
  uid: string
  defId: string
  stacks: number
  /** 施加者玩家 id（紊乱等需要回源的持续效果使用） */
  sourcePlayerId?: string
}

type Character = CharacterInfo & {
  alive: boolean
  /** 护盾值，受到伤害时优先扣除 */
  shield: number
  effects: EffectInstance[]
  /** 烤冷面：在该回合内免疫伤害 */
  immuneRound: number | null
  /** 凑企厄：大招永久减费累计值 */
  burstCostDiscount: number
  /** 凑企厄：是否处于神厄形态 */
  godForm: boolean
  /** 大佐·恶臭：本回合已触发治疗的回合数与次数（每回合至多 2 次） */
  stenchHealRound: number
  stenchHealCount: number
  /** U·连续惩罚：最近一次施放的是普攻，下一次战技返还卡牌并 -1 费 */
  uCombo: boolean
  /** 奶豆：释放大招后，下一次战技结算完解除合体 */
  splitPending?: boolean
  /** 悍匪：本段「悍匪之怒」的击倒延长是否已触发；释放大招后重置 */
  hanfeiRageUsed?: boolean
}

/** 召唤物定义 */
const SUMMONS: Record<string, { name: string; artId: string; description: string }> = {
  'civil-model': {
    name: '文明标兵',
    artId: 'civil-model',
    description:
      '我方角色受到攻击时，有 50% 概率消耗 1 点嘲讽值令其闪避本次伤害，并对攻击者造成 1 点伤害（攻击者不是角色时改打攻击方前台）；闪避不视为受到攻击。嘲讽值上限 5，耗尽时消失。结束阶段会对每个被标记的敌人攻击 2 点、回复 1 点嘲讽值并清除标记。',
  },
  godson: {
    name: '干儿子',
    artId: 'godson',
    description:
      '结束阶段：对随机一名敌方玩家的前台角色造成 1 点伤害，并治疗我方所有后台角色 1 点（对「大佐」的治疗量 +1）。可用 3 次，用完后消失。',
  },
  sharkbee: {
    name: '鲨bee',
    artId: 'sharkbee',
    description:
      '在场时，我方不会受到任何治疗；本应受到的治疗改为转化为「累积治疗」（至多 20 点）。我方普攻额外获得 2 点累积治疗。达到 20 点或被移除时，指定一名敌方前台，造成等于累积治疗的伤害，并回复我方全体等同于累计治疗量 1/3 的生命（向下取整，每个角色至少 1 点），随后消失。',
  },
  'chuyi-kid': {
    name: '初一小孩',
    artId: 'chuyi-kid',
    description:
      '拥有 5 点特殊生命。杨云博受击时，消耗 1 点特殊生命使本次受到的伤害 -1。结束阶段移除初一小孩，每剩余 1 点特殊生命治疗杨云博 1 点，并额外治疗 1 点。',
  },
}

type Summon = {
  id: string
  defId: string
  name: string
  artId: string | null
  description: string
  taunt: number
  /** 可用次数（干儿子） */
  uses?: number
  /** 累积治疗（鲨bee） */
  charges?: number
  /** 鲨bee：累计被转化的治疗量 */
  healStored?: number
  /** 初一小孩：特殊生命 */
  hp?: number
}

let summonSeq = 0

type Player = {
  id: string
  name: string
  avatar: string | null
  seat: number
  hand: CardInfo[]
  ap: number
  characters: Character[]
  activeIndex: number
  eliminated: boolean
  picked: string[]
  activeChosen: boolean
  lastRoll: number | null
  /** 已装备的场地牌，最多 2 张 */
  fields: CardInfo[]
  /** 场地已满时，暂存等待替换的新场地牌 */
  pendingFieldCard: CardInfo | null
  /** 已装备的配饰牌，最多 2 张 */
  accessories: CardInfo[]
  /** 配饰已满时，暂存等待替换的新配饰牌 */
  pendingAccessoryCard: CardInfo | null
  /** 场地牌本回合已使用次数，key 为卡牌 id，每回合重置 */
  fieldUses: Record<string, number>
  /** 配饰牌本回合已触发次数，key 为卡牌 id 加效果类型，每回合重置 */
  accessoryUses: Record<string, number>
  /** 扑克：已经触发真实伤害的回合数 */
  pokerRound: number
  /** 阿米诺斯：受伤 +1 / 造成伤害 +1，持续到我方下一次行动开始 */
  aminoActive: boolean
  /** 运动会：本次行动内剩余的技能牌返还次数 */
  sportsReturns: number
  /** 免费汤：待生效的下一次技能攻击伤害加成 */
  skillDamageBonus: number
  /** 薯条：待生效的下一次技能减费 */
  skillCostDiscount: number
  /** 小卡片层数：攻击时消耗，为命中目标附加标记 */
  smallCards: number
  /** 场上的召唤物 */
  summons: Summon[]
  /** 冰红茶：本回合内的技能加成 */
  soda: { charges: number; damage: number; discount: number; round: number } | null
  /** 大劲凉：受到攻击时的回复与摸牌 */
  coolSips: { charges: number; heal: number; draw: number } | null
  /** 佩爹：剩余「儿子」回合数，0 表示未被附属 */
  sonRounds: number
  /** 高玩·出千：本局是否已经使用过第一回合必定 6 点的天赋 */
  cheatUsed: boolean
}

/** 手牌定义：同一张牌的两份复制品共用 defId */
type CardDef = {
  defId: string
  name: string
  kind: 'field' | 'item' | 'event' | 'accessory'
  cost: number
  artId: string | null
  description: string
  effect: CardEffect
}

/** 非技能手牌库。内容会随着设计逐步补齐，未补齐的部分用空白牌占位 */
const CARD_LIBRARY: CardDef[] = [
  {
    defId: 'gym',
    name: '体育馆',
    kind: 'field',
    cost: 3,
    artId: 'gym',
    description: '我方释放普攻、战技、大招时，消耗的行动点减少 1，每回合最多触发 2 次。',
    effect: { type: 'skillDiscount', amount: 1, usesPerRound: 2 },
  },
  {
    defId: 'southgate',
    name: '南门',
    kind: 'field',
    cost: 2,
    artId: 'southgate',
    description:
      '回合结束时，回复我方前台角色 1 点生命；若我方有生命值小于等于 7 的角色，则再回复我方生命最低的角色 1 点生命。',
    effect: { type: 'endPhaseHeal', healFront: 1, lowHpThreshold: 7, healLow: 1 },
  },
  {
    defId: 'auditorium',
    name: '礼堂',
    kind: 'field',
    cost: 3,
    artId: 'auditorium',
    description:
      '我方技能造成的伤害 +1，每回合最多触发 2 次。若一次技能命中多个目标，对所有目标都生效，但只消耗 1 次次数。负面效果等其他来源的伤害不受影响。',
    effect: { type: 'damageBonus', amount: 1, usesPerRound: 2 },
  },
  {
    defId: 'stone',
    name: '韧字碑',
    kind: 'field',
    cost: 3,
    artId: 'stone',
    description:
      '回合开始时，为我方所有未持有护盾的角色提供 1 点护盾。护盾会优先抵消受到的伤害。',
    effect: { type: 'roundStartShield', amount: 1 },
  },
  {
    defId: 'cafeteria',
    name: '八中食堂',
    kind: 'field',
    cost: 2,
    artId: 'cafeteria',
    description:
      '每回合开始的摸牌阶段多摸 1 张牌；我方行动时打出非技能类手牌，消耗的行动点减少 1，每回合最多触发 1 次。',
    effect: { type: 'drawAndNonSkillDiscount', extraDraw: 1, discount: 1, usesPerRound: 1 },
  },
  {
    defId: 'playground',
    name: '操场',
    kind: 'field',
    cost: 1,
    artId: 'playground',
    description: '我方行动时切换角色后，有 50% 概率恢复 1 点行动点。',
    effect: { type: 'switchApRefund', chance: 0.5, amount: 1 },
  },
  {
    defId: 'teaching-building',
    name: '教学楼',
    kind: 'field',
    cost: 2,
    artId: 'teaching-building',
    description:
      '我方前台角色受到的伤害 -1，每回合 1 次。若该次伤害在减伤前大于等于 6 点，则再额外 -1。真实伤害不受影响。',
    effect: {
      type: 'frontDamageReduction',
      amount: 1,
      heavyThreshold: 6,
      heavyExtra: 1,
      usesPerRound: 1,
    },
  },
  {
    defId: 'rainbow-pavilion',
    name: '七彩亭',
    kind: 'field',
    cost: 4,
    artId: 'rainbow-pavilion',
    description:
      '我方角色阵亡时被标记，同时弃置此牌；该回合结束阶段之后，被标记的角色复活至 5 点生命值。',
    effect: { type: 'deathRevive', hp: 5 },
  },
  {
    defId: 'sausage',
    name: '烤肠',
    kind: 'item',
    cost: 0,
    artId: 'sausage',
    description: '为指定 1 名我方角色回复 1 点生命值。',
    effect: { type: 'healAlly', amount: 1 },
  },
  {
    defId: 'free-soup',
    name: '免费汤',
    kind: 'item',
    cost: 0,
    artId: 'free-soup',
    description: '使我方角色下一次使用技能攻击时，造成的伤害 +1。',
    effect: { type: 'nextSkillDamage', amount: 1 },
  },
  {
    defId: 'fries',
    name: '薯条',
    kind: 'item',
    cost: 1,
    artId: 'fries',
    description: '使我方角色下一次使用花费大于 0 的技能时，消耗的行动点减少 2。',
    effect: { type: 'nextSkillDiscount', amount: 2 },
  },
  {
    defId: 'drumstick-noodles',
    name: '鸡腿面',
    kind: 'item',
    cost: 1,
    artId: 'drumstick-noodles',
    description: '为指定 1 名我方角色回复 2 点生命值。',
    effect: { type: 'healAlly', amount: 2 },
  },
  {
    defId: 'drumstick-rice',
    name: '鸡腿饭',
    kind: 'item',
    cost: 1,
    artId: 'drumstick-rice',
    description:
      '使我方全体角色获得「减伤」：下次受到伤害 -1，触发后移除。每个角色各自生效一次。',
    effect: { type: 'grantAllAllies', defId: 'guard', stacks: 1 },
  },
  {
    defId: 'cold-noodles',
    name: '烤冷面',
    kind: 'item',
    cost: 3,
    artId: 'cold-noodles',
    description:
      '只有我方存在阵亡角色时才能打出：复活 1 名指定我方角色至 1 点生命，且该角色在本回合内不会受到伤害。',
    effect: { type: 'reviveAlly', hp: 1 },
  },
  {
    defId: 'ice-tea',
    name: '冰红茶',
    kind: 'item',
    cost: 2,
    artId: 'ice-tea',
    description:
      '本回合内，我方接下来 2 次使用技能时伤害 +1、消耗的行动点 -1。回合结束未用完的次数失效。',
    effect: { type: 'roundSkillBoost', charges: 2, damage: 1, discount: 1 },
  },
  {
    defId: 'strong-cool',
    name: '大劲凉',
    kind: 'item',
    cost: 2,
    artId: 'strong-cool',
    description:
      '我方角色接下来 2 次受到敌方攻击时，该角色回复 1 点生命，我方摸 1 张牌。',
    effect: { type: 'healOnAttacked', charges: 2, heal: 1, draw: 1 },
  },
  {
    defId: 'five-three',
    name: '五三',
    kind: 'accessory',
    cost: 2,
    artId: 'five-three',
    description: '我方行动开始时，获得 1 点行动点。',
    effect: { type: 'actionStartAp', amount: 1 },
  },
  {
    defId: 'kazoo',
    name: '卡祖笛',
    kind: 'accessory',
    cost: 4,
    artId: 'kazoo',
    description: '我方生命值大于等于 8 的角色受到伤害 -1。',
    effect: { type: 'hpThresholdDamageReduction', minHp: 8, amount: 1 },
  },
  {
    defId: 'headphones',
    name: '耳机',
    kind: 'accessory',
    cost: 3,
    artId: 'headphones',
    description:
      '我方后台角色造成伤害 +1、受到伤害 -1，这两种效果每回合各自可以触发 2 次；这些角色在结束阶段回复 1 点生命。',
    effect: {
      type: 'backlineSupport',
      damage: 1,
      reduction: 1,
      usesPerRound: 2,
      endPhaseHeal: 1,
    },
  },
  {
    defId: 'bazhong-kill',
    name: '八中杀',
    kind: 'accessory',
    cost: 2,
    artId: 'bazhong-kill',
    description:
      '每回合结束时获得 1 充能，我方每有 1 点未使用行动点额外获得 1 充能，充能无上限；我方行动开始时，若充能大于 3，则摸 1 张牌并生成 1 行动点。',
    effect: { type: 'chargeAccumulate', endPhase: 1, threshold: 3 },
  },
  {
    defId: 'sticker',
    name: '贴纸',
    kind: 'accessory',
    cost: 3,
    artId: 'sticker',
    description:
      '我方手牌上限 +2。我方受到攻击时，有 50% 概率摸 1 张牌，每次成功触发后概率降低 10%，第 5 次触发后降为 0，回合开始时重置。此牌被弃置时，超出手牌上限的牌不会消失。',
    effect: {
      type: 'handLimitBonus',
      amount: 2,
      drawChance: 0.5,
      chanceStep: 0.1,
      maxTriggers: 5,
    },
  },
  {
    defId: 'football',
    name: '足球',
    kind: 'accessory',
    cost: 2,
    artId: 'football',
    description:
      '我方每次行动阶段切换角色后，使切换到前台的角色获得「足球」：造成的伤害 +2，可触发 1 次，持续到本回合结束。',
    effect: { type: 'switchFrontBuff', defId: 'football', stacks: 1 },
  },
  {
    defId: 'poker',
    name: '扑克',
    kind: 'accessory',
    cost: 3,
    artId: 'poker',
    description:
      '我方每回合第一次使用造成伤害的技能时，本次技能造成的伤害最终视为真实伤害（无视护盾与减伤）。',
    effect: { type: 'firstDamageTrue' },
  },
  {
    defId: 'meal-card',
    name: '饭卡',
    kind: 'accessory',
    cost: 3,
    artId: 'meal-card',
    description:
      '我方打出道具牌不消耗行动点，每张饭卡装备后可生效一次；此外，我方行动阶段打出道具牌后，回复生命最低的角色 1 点生命，每回合 1 次。',
    effect: { type: 'mealCard', healLowest: 1 },
  },
  {
    defId: 'parabola',
    name: '抛物线！',
    kind: 'event',
    cost: 2,
    artId: 'parabola',
    description:
      '使我方所有角色身上有持续回合数的状态效果增加 1 回合，有可用次数的状态效果剩余可用次数 +1。',
    effect: { type: 'extendEffects', amount: 1 },
  },
  {
    defId: 'seewo-whiteboard',
    name: '希沃白板游戏',
    kind: 'event',
    cost: 1,
    artId: 'seewo-whiteboard',
    description: '指定 1 名我方后台角色，使其获得 2 点护盾。',
    effect: { type: 'shieldAlly', amount: 2, backlineOnly: true },
  },
  {
    defId: 'aminos',
    name: '阿米诺斯',
    kind: 'event',
    cost: 1,
    artId: 'aminos',
    description:
      '从打出该牌开始，直到我方下一次行动阶段开始时，我方角色造成的伤害 +1，受到的伤害 +1。',
    effect: { type: 'aminoAura' },
  },
  {
    defId: 'singer-contest',
    name: '歌手大赛',
    kind: 'event',
    cost: 1,
    artId: 'singer-contest',
    description: '清除我方每个角色身上的随机 1 个负面效果。',
    effect: { type: 'cleanseDebuffs', count: 1 },
  },
  {
    defId: 'sports-meet',
    name: '运动会',
    kind: 'event',
    cost: 1,
    artId: 'sports-meet',
    description: '本次行动内，我方打出技能牌后返还该技能牌，可用 2 次。',
    effect: { type: 'skillReturn', charges: 2 },
  },
  {
    defId: 'open-class',
    name: '公开课',
    kind: 'event',
    cost: 0,
    artId: 'open-class',
    description:
      '下一回合内，所有玩家禁止主动切换角色（不影响角色技能效果造成的切换）。',
    effect: { type: 'banSwitchNextRound' },
  },
  {
    defId: 'award-ceremony',
    name: '颁奖仪式',
    kind: 'event',
    cost: 0,
    artId: 'award-ceremony',
    description: '摸 2 张牌。',
    effect: { type: 'drawCards', count: 2 },
  },
  {
    defId: 'new-year-party',
    name: '元旦晚会',
    kind: 'event',
    cost: 1,
    artId: 'new-year-party',
    description: '下一回合内，所有玩家打出非技能手牌花费 +1。',
    effect: { type: 'nonSkillTaxNextRound', amount: 1 },
  },
]

export type Game = {
  roomId: string
  players: Player[]
  deck: CardInfo[]
  discard: CardInfo[]
  pool: CharacterTemplate[]
  /** 单人关卡 id；普通匹配/测试版为 null 或 'test' */
  stageId: string | null
  phase: GamePhase
  round: number
  firstSeat: number
  actionOrder: number[]
  actionIndex: number
  winnerId: string | null
  awaitingActive: string | null
  /** 场地已满、等该玩家点红叉替换 */
  awaitingFieldReplace: string | null
  /** 配饰已满、等该玩家点红叉替换 */
  awaitingAccessoryReplace: string | null
  /** 等待玩家点选己方目标的玩家 id */
  awaitingAllyTarget: string | null
  /** 已打出、尚未确定己方目标的技能 */
  pendingAllySkill: SkillDef | null
  /** 已打出、尚未确定己方目标的手牌效果 */
  pendingAllyCard: CardEffect | null
  /** 鲨bee放电：等待该玩家点选敌方前台 */
  awaitingSharkTarget: string | null
  /** 待结算的鲨bee放电数据 */
  pendingShark: { playerId: string; charges: number; heal: number } | null
  /** 七彩亭标记：回合结束后复活 */
  pendingRevives: { playerId: string; characterId: string; hp: number }[]
  /** 单人模式下电脑玩家所在座位 */
  aiSeat: number | null
  /** 电脑第几次行动，用于切换技能循环 */
  aiTurnIndex: number
  /** 电脑本次行动剩余要释放的技能 */
  aiQueue: CardKind[]
  /** 电脑行动进行中（含等待玩家选择前台时的挂起） */
  aiActive: boolean
  /** 中央框停留的最近一张牌 */
  lastPlay: LastPlayView | null
  /** 公开课：禁止主动切换角色的回合数 */
  noSwitchRound: number
  /** 元旦晚会：非技能手牌加价的回合数 */
  nonSkillTaxRound: number
  /** 元旦晚会：非技能手牌增加的花费 */
  nonSkillTaxAmount: number
  /** 状态变化后的广播回调，由服务端注入 */
  notify?: (() => void) | null
}

function shuffle<T>(items: T[]): T[] {
  const list = [...items]
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

/**
 * 生成角色库：留出 3 × 人数 的位置，其中最后一个固定是按摩技师，
 * 也就是从空白角色里删掉一个换成他。
 */
function makeCharacterPool(count: number): CharacterTemplate[] {
  // 正式角色各占一个位置，其余用空白角色补满；至少留 1 个空白位
  const blankCount = Math.max(1, count - NAMED_CHARACTERS.length)

  const blanks: CharacterTemplate[] = Array.from({ length: blankCount }, (_, i) => ({
    id: `char-${i + 1}`,
    name: `角色${i + 1}`,
    hp: BLANK_CHARACTER_HP,
    artId: null,
    talentId: null,
    skillSet: BLANK_SKILLS,
  }))

  return [...blanks, ...NAMED_CHARACTERS]
}

/** 已实装的正式角色（不含空白占位） */
const NAMED_CHARACTERS: CharacterTemplate[] = [
  {
    id: 'char-massage',
    name: '按摩技师',
    hp: 12,
    artId: 'massage',
    talentId: 'rage',
    skillSet: MASSAGE_SKILLS,
  },
  {
    id: 'char-suppress',
    name: '抑制剂',
    hp: 10,
    artId: 'suppress',
    talentId: 'charge',
    skillSet: SUPPRESS_SKILLS,
  },
  {
    id: 'char-oscar',
    name: '奥斯卡小金马',
    hp: 16,
    artId: 'oscar',
    talentId: 'oscar',
    skillSet: OSCAR_SKILLS,
  },
  {
    id: 'char-chicken-soup',
    name: '鸡汤王',
    hp: 12,
    artId: 'chicken-soup',
    talentId: null,
    skillSet: CHICKEN_SKILLS,
  },
  {
    id: 'char-op',
    name: 'OP',
    hp: 19,
    artId: 'op',
    talentId: 'op',
    skillSet: OP_SKILLS,
  },
  {
    id: 'char-dean',
    name: '苑长',
    hp: 9,
    artId: 'dean',
    talentId: null,
    skillSet: DEAN_SKILLS,
  },
  {
    id: 'char-couqie',
    name: '凑企厄',
    hp: 14,
    artId: 'couqie',
    talentId: null,
    skillSet: COUQIE_SKILLS,
  },
  {
    id: 'char-dazuo',
    name: '大佐',
    hp: 16,
    artId: 'dazuo',
    talentId: null,
    skillSet: DAZUO_SKILLS,
  },
  {
    id: 'char-peidie',
    name: '佩爹',
    hp: 10,
    artId: 'peidie',
    talentId: null,
    skillSet: PEIDIE_SKILLS,
  },
  {
    id: 'char-u',
    name: 'U',
    hp: 10,
    artId: 'u',
    talentId: 'u',
    skillSet: U_SKILLS,
  },
  {
    id: 'char-gaowan',
    name: '高玩',
    hp: 13,
    artId: 'gaowan',
    talentId: 'gaowan',
    skillSet: GAOWAN_SKILLS,
  },
  {
    id: 'char-damuling',
    name: '大母零',
    hp: 10,
    artId: 'damuling',
    talentId: null,
    skillSet: DAMULING_SKILLS,
  },
  {
    id: 'char-hanfei',
    name: '悍匪',
    hp: 13,
    artId: 'hanfei',
    talentId: null,
    skillSet: HANFEI_SKILLS,
  },
  {
    id: 'char-yangyunbo',
    name: '杨云博',
    hp: 20,
    artId: 'yangyunbo',
    talentId: 'fame',
    skillSet: YANG_SKILLS,
  },
  {
    id: 'char-julao',
    name: '巨佬',
    hp: 13,
    artId: 'julao',
    talentId: null,
    skillSet: JULAO_SKILLS,
  },
  {
    id: 'char-baibai',
    name: '白白',
    hp: 11,
    artId: 'baibai',
    talentId: null,
    skillSet: BAIBAI_SKILLS,
  },
]

/* ---------------- 盗罐行者关卡专用角色（不进入可选角色池） ---------------- */

const CONTAINER_SKILLS: SkillSet = {
  normal: { name: '残破容器', cost: 0, damage: 0, description: '不会攻击。' },
  skill: { name: '残破容器', cost: 0, damage: 0, description: '不会攻击。' },
  burst: { name: '残破容器', cost: 0, damage: 0, description: '不会攻击。' },
}

const JARWALKER_SKILLS: SkillSet = {
  normal: {
    name: '普攻·亡死的黑云',
    cost: 1,
    damage: 2,
    description:
      '造成 2 点伤害，扣除自身 2 点生命，并在自身左侧和右侧各召唤 1 个残破容器。',
  },
  skill: {
    name: '战技·将尽的命数',
    cost: 3,
    damage: 1,
    description:
      '击杀场上所有残破容器，造成 1 + 击杀数量 点伤害；对目标后台造成前台伤害一半（向下取整，最少 1）；回复等同击杀数量的生命。',
  },
  burst: {
    name: '大招·沉默的悲叹',
    cost: 4,
    damage: 0,
    description:
      '扣除自身 4 点生命，获得 20 层「镣锁」，进入「镣铐崩解」，并在自身左右各召唤 2 个残破容器。',
  },
}

const CONTAINER_TEMPLATE: CharacterTemplate = {
  id: 'char-container',
  name: '残破容器',
  hp: 6,
  artId: 'container',
  talentId: null,
  skillSet: CONTAINER_SKILLS,
}

const JARWALKER_TEMPLATE: CharacterTemplate = {
  id: 'char-jarwalker',
  name: '盗罐行者',
  hp: 60,
  artId: 'jarwalker',
  talentId: null,
  skillSet: JARWALKER_SKILLS,
}

/* ---------------- 现代最唐：豆包 / 奶蛙 / 奶豆 ---------------- */

const DOUBAO_ID = 'char-doubao'
const NAIVA_ID = 'char-naiva'
const NAIDOU_ID = 'char-naidou'

const DOUBAO_SKILLS: SkillSet = {
  normal: {
    name: '普攻·装唐',
    cost: 1,
    damage: 5,
    description: '对敌方前台造成 5 点伤害。',
  },
  skill: {
    name: '战技·最直白最直接最不绕弯子',
    cost: 3,
    damage: 1,
    description:
      '对场上双方所有角色进行 12 次随机 1 点伤害的弹射攻击，然后对双方全体造成 1 点伤害。',
  },
  burst: {
    name: '大招·豆奶之恋',
    cost: 4,
    damage: 0,
    description: '与奶蛙合体为奶豆，清除合体角色身上的所有状态效果。',
  },
}

const NAIVA_SKILLS: SkillSet = {
  normal: {
    name: '普攻·刚刚跌落水',
    cost: 1,
    damage: 4,
    description: '对敌方前台造成 4 点伤害，并对敌方每名后台角色造成 2 点伤害。',
  },
  skill: {
    name: '战技·众宾欢也',
    cost: 3,
    damage: 0,
    description: '使场上双方所有角色获得「唐笑」：造成的伤害 +1，持续 2 回合。',
  },
  burst: {
    name: '大招·豆奶之恋',
    cost: 4,
    damage: 0,
    description: '与豆包合体为奶豆，清除合体角色身上的所有状态效果。',
  },
}

const NAIDOU_SKILLS: SkillSet = {
  normal: {
    name: '普攻·我不要钱',
    cost: 1,
    damage: 3,
    description:
      '对敌方前台造成 3 点伤害；如果对方还有别的存活角色，使其随机一名后台上场。',
  },
  skill: {
    name: '战技·吞噬token',
    cost: 3,
    damage: 4,
    description:
      '对敌方全体角色造成 4 点伤害。若自身处于「光速道歉」后的状态，结算后解除合体。',
  },
  burst: {
    name: '大招·光速道歉',
    cost: 4,
    damage: 0,
    description:
      '自身获得「奶蛙诅咒」，对方全体角色获得「豆包诅咒」；下一次释放战技后解除合体，变回豆包和奶蛙，生命各为解除时奶豆生命的一半（向上取整）。',
  },
}

const DOUBAO_TEMPLATE: CharacterTemplate = {
  id: DOUBAO_ID,
  name: '豆包',
  hp: 25,
  artId: 'doubao',
  talentId: null,
  skillSet: DOUBAO_SKILLS,
}

const NAIVA_TEMPLATE: CharacterTemplate = {
  id: NAIVA_ID,
  name: '奶蛙',
  hp: 25,
  artId: 'naiva',
  talentId: null,
  skillSet: NAIVA_SKILLS,
}

const NAIDOU_TEMPLATE: CharacterTemplate = {
  id: NAIDOU_ID,
  name: '奶豆',
  hp: 60,
  artId: 'naidou',
  talentId: null,
  skillSet: NAIDOU_SKILLS,
}

const BOSS_TEMPLATES: Record<string, CharacterTemplate> = {
  'char-jarwalker': JARWALKER_TEMPLATE,
  'char-container': CONTAINER_TEMPLATE,
  'char-doubao': DOUBAO_TEMPLATE,
  'char-naiva': NAIVA_TEMPLATE,
  'char-naidou': NAIDOU_TEMPLATE,
}

/** 角色牌图鉴：返回所有已实装角色 */
export function characterCatalog(): CharacterView[] {
  return NAMED_CHARACTERS.map((template) => toCharacter(template))
}

/** 手牌图鉴：返回所有已实装的手牌定义 */
export function cardCatalog(): CardInfo[] {
  return CARD_LIBRARY.map((def) => ({
    id: def.defId,
    defId: def.defId,
    name: def.name,
    kind: def.kind,
    cost: def.cost,
    artId: def.artId,
    description: def.description,
  }))
}

function makeDeck(): CardInfo[] {
  const cards: CardInfo[] = []
  let serial = 0

  const push = (kind: Exclude<CardKind, 'blank'>, count: number, name: string) => {
    for (let i = 0; i < count; i += 1) {
      serial += 1
      cards.push({
        id: `card-${serial}`,
        kind,
        name,
        cost: 0,
        artId: null,
        description: '',
      })
    }
  }

  push('normal', CARD_COUNTS.normal, '普攻')
  push('skill', CARD_COUNTS.skill, '战技')
  push('burst', CARD_COUNTS.burst, '大招')

  // 非技能牌：每种两张，未定义的部分先用空白牌补满这一类
  const nonSkillTotal =
    CARD_COUNTS.field + CARD_COUNTS.item + CARD_COUNTS.event + CARD_COUNTS.accessory
  let filled = 0

  for (const def of CARD_LIBRARY) {
    for (let copy = 0; copy < 2; copy += 1) {
      serial += 1
      cards.push({
        id: `card-${serial}`,
        defId: def.defId,
        kind: def.kind,
        name: def.name,
        cost: def.cost,
        artId: def.artId,
        description: def.description,
      })
      filled += 1
    }
  }

  for (; filled < nonSkillTotal; filled += 1) {
    serial += 1
    cards.push({
      id: `card-${serial}`,
      defId: 'blank',
      kind: 'blank',
      name: '空白牌',
      cost: BLANK_CARD_COST,
      artId: null,
      description: '占位卡牌，暂无效果',
    })
  }

  // 尚未设计完的卡位继续用空白牌补足，保持牌堆 128 张
  for (; cards.length < DECK_SIZE; ) {
    serial += 1
    cards.push({
      id: `card-${serial}`,
      defId: 'blank',
      kind: 'blank',
      name: '空白牌',
      cost: BLANK_CARD_COST,
      artId: null,
      description: '占位卡牌，暂无效果',
    })
  }

  return shuffle(cards)
}

function toCharacter(template: CharacterTemplate): Character {
  return {
    id: template.id,
    name: template.name,
    hp: template.hp,
    maxHp: template.hp,
    artId: template.artId,
    talentId: template.talentId,
    alive: true,
    // 杨云博·万众瞩目：开局获得 3 点护盾
    shield: template.id === 'char-yangyunbo' ? 3 : 0,
    // U 开局自带 1 段「教鞭长度」
    effects:
      template.id === 'char-u'
        ? [{ uid: 'fx-whip-init', defId: 'whip-length', stacks: 1 }]
        : [],
    immuneRound: null,
    burstCostDiscount: 0,
    godForm: false,
    stenchHealRound: 0,
    stenchHealCount: 0,
    uCombo: false,
    skills: (['normal', 'skill', 'burst'] as const).map((kind) => ({
      name: template.skillSet[kind].name,
      cost: template.skillSet[kind].cost,
      description: template.skillSet[kind].description,
    })),
    talents: template.talentId && TALENTS[template.talentId] ? [TALENTS[template.talentId]] : [],
    skillSet: template.skillSet,
    // 凑企厄：详情页点击「神厄形态」时展示的变身技能
    godSkills:
      template.id === 'char-couqie'
        ? [GOD_SKILLS.normal, GOD_SKILLS.skill].map((s) => ({
            name: s.name,
            cost: s.cost,
            description: s.description,
          }))
        : undefined,
  }
}

/** 电脑玩家：不抽牌、不掷骰，按关卡阵容生成角色（默认 3 名空白角色） */
function makeAIPlayer(seat: number, stageId?: string): Player {
  const stage = stageId ? STAGE_MAP[stageId] : undefined
  const lineup = stage && Array.isArray(stage.aiCharacters) ? stage.aiCharacters : null

  // 盗罐行者等特殊关卡可以只有 1 名角色；普通电脑固定 3 名空白角色
  const count = lineup ? Math.max(1, lineup.length) : CHARACTERS_PER_PLAYER
  const characters: Character[] = Array.from({ length: count }, (_, i) => {
    const template = lineup
      ? (NAMED_CHARACTERS.find((entry) => entry.id === lineup[i]) ??
        BOSS_TEMPLATES[lineup[i]])
      : undefined
    if (template) return toCharacter(template)
    return toCharacter({
      id: `ai-char-${i + 1}`,
      name: `电脑角色${i + 1}`,
      hp: BLANK_CHARACTER_HP,
      artId: null,
      talentId: null,
      skillSet: BLANK_SKILLS,
    })
  })

  return {
    id: 'ai',
    name: '电脑',
    avatar: '🤖',
    seat,
    hand: [],
    ap: 0,
    characters,
    activeIndex: 0,
    eliminated: false,
    picked: characters.map((c) => c.id),
    activeChosen: true,
    lastRoll: null,
    fields: [],
    pendingFieldCard: null,
    accessories: [],
    pendingAccessoryCard: null,
    fieldUses: {},
    accessoryUses: {},
    pokerRound: 0,
    aminoActive: false,
    sportsReturns: 0,
    skillDamageBonus: 0,
    skillCostDiscount: 0,
    smallCards: 0,
    summons: [],
    soda: null,
    coolSips: null,
    sonRounds: 0,
    cheatUsed: false,
  }
}

export function createGame(
  roomId: string,
  members: { id: string; name: string; avatar?: string | null }[],
  options: { ai?: boolean; stageId?: string } = {},
): Game {
  const players: Player[] = members.map((m, seat) => ({
    id: m.id,
    name: m.name,
    avatar: m.avatar ?? null,
    seat,
    hand: [],
    ap: 0,
    characters: [],
    activeIndex: 0,
    eliminated: false,
    picked: [],
    activeChosen: false,
    lastRoll: null,
    fields: [],
    pendingFieldCard: null,
    accessories: [],
    pendingAccessoryCard: null,
    fieldUses: {},
    accessoryUses: {},
    pokerRound: 0,
    aminoActive: false,
    sportsReturns: 0,
    skillDamageBonus: 0,
    skillCostDiscount: 0,
    smallCards: 0,
    summons: [],
    soda: null,
    coolSips: null,
    sonRounds: 0,
    cheatUsed: false,
  }))

  const aiSeat = options.ai ? players.length : null
  if (options.ai) players.push(makeAIPlayer(players.length, options.stageId))

  return {
    roomId,
    stageId: options.stageId ?? null,
    players,
    deck: makeDeck(),
    discard: [],
    // 单人也按 6 张给，保证有得挑；电脑用自带的 3 名角色，不占角色库
    pool: makeCharacterPool(CHARACTERS_PER_PLAYER * (members.length + (options.ai ? 1 : 0))),
    phase: 'picking',
    round: 0,
    firstSeat: Math.floor(Math.random() * players.length),
    actionOrder: [],
    actionIndex: 0,
    winnerId: null,
    awaitingActive: null,
    awaitingFieldReplace: null,
    awaitingAccessoryReplace: null,
    awaitingAllyTarget: null,
    pendingAllySkill: null,
    pendingAllyCard: null,
    awaitingSharkTarget: null,
    pendingShark: null,
    pendingRevives: [],
    lastPlay: null,
    noSwitchRound: 0,
    nonSkillTaxRound: 0,
    nonSkillTaxAmount: 0,
    aiSeat,
    aiTurnIndex: 0,
    aiQueue: [],
    aiActive: false,
    notify: null,
  }
}

function clockwiseSeats(game: Game): number[] {
  const n = game.players.length
  return Array.from({ length: n }, (_, i) => (game.firstSeat + i) % n)
}

/**
 * 抽牌前的洗回：牌堆不够抽时，把弃牌堆全部并入现有牌堆并洗匀。
 * 弃牌堆对玩家不可见，只参与洗牌。
 */
function ensureDeck(game: Game, needed: number): void {
  if (game.deck.length >= needed) return
  if (game.discard.length === 0) return
  game.deck = shuffle([...game.deck, ...game.discard])
  game.discard = []
}

function startRound(game: Game) {
  game.round += 1

  // 现代最唐：回合开始时，死亡的豆包 / 奶蛙复活到 6 点生命
  for (const player of game.players) {
    if (!player.eliminated && isTangPlayer(player)) reviveTangDead(player)
  }

  // 场地牌：回合开始时给我方无护盾的角色补盾
  for (const player of game.players) {
    if (player.eliminated) continue
    for (const field of player.fields) {
      const def = CARD_LIBRARY.find((d) => d.defId === field.defId)
      if (!def || def.effect.type !== 'roundStartShield') continue
      for (const character of player.characters) {
        if (character.alive && character.shield <= 0) {
          character.shield = def.effect.amount
        }
      }
    }
  }

  // 摸牌阶段：每人依次抽 5 张，最多补到手牌上限
  // 电脑不抽牌、不掷骰，行动完全按固定循环
  const isAI = (seat: number) => game.aiSeat !== null && seat === game.aiSeat

  game.phase = 'draw'
  for (const seat of clockwiseSeats(game)) {
    const p = game.players[seat]
    if (p.eliminated || isAI(seat)) continue
    const room = Math.max(0, handLimitFor(p) - p.hand.length)
    // 八中食堂：摸牌阶段多摸牌
    const wanted = Math.min(DRAW_PER_ROUND + extraDrawFor(p), room)
    ensureDeck(game, wanted)
    const count = Math.min(wanted, game.deck.length)
    for (let i = 0; i < count; i += 1) {
      const card = game.deck.shift()
      if (card) p.hand.push(card)
    }
  }

  // 投掷阶段：每人掷一次六面骰，点数即本回合行动点
  game.phase = 'roll'
  for (const seat of clockwiseSeats(game)) {
    const p = game.players[seat]
    if (p.eliminated || isAI(seat)) continue
    // 高玩·出千：第一回合必定 6 点，整局一次
    const hasGaowan = p.characters.some((c) => c.id === 'char-gaowan' && c.alive)
    if (game.round === 1 && hasGaowan && !p.cheatUsed) {
      p.lastRoll = 6
      p.cheatUsed = true
    } else {
      p.lastRoll = 1 + Math.floor(Math.random() * 6)
    }
    p.ap = p.lastRoll
  }

  // 场地牌、配饰牌的每回合使用次数在回合开始时重置
  for (const p of game.players) {
    p.fieldUses = {}
    p.accessoryUses = {}
  }
  // 冰红茶的加成只在打出的回合内有效
  for (const p of game.players) p.soda = null

  // 行动阶段
  game.phase = 'action'
  game.actionOrder = clockwiseSeats(game).filter((s) => !game.players[s].eliminated)
  game.actionIndex = 0
  game.awaitingActive = null

  if (game.actionOrder.length === 0) {
    finishGame(game)
  } else {
    beginAction(game)
    scheduleAI(game)
  }
}

function finishGame(game: Game) {
  const alive = game.players.filter((p) => !p.eliminated)
  game.phase = 'finished'
  game.winnerId = alive.length === 1 ? alive[0].id : null
  game.awaitingActive = null
  game.awaitingFieldReplace = null
  game.awaitingAccessoryReplace = null
  game.awaitingAllyTarget = null
  game.pendingAllySkill = null
  game.pendingAllyCard = null
  game.awaitingSharkTarget = null
  game.pendingShark = null
}

function eliminatePlayer(game: Game, player: Player) {
  if (player.eliminated) return
  player.eliminated = true
  player.hand = []
  player.summons = []
  player.sonRounds = 0
  if (game.awaitingSharkTarget === player.id) {
    game.awaitingSharkTarget = null
    game.pendingShark = null
  }

  const pos = game.actionOrder.indexOf(player.seat)
  if (pos >= 0) {
    game.actionOrder.splice(pos, 1)
    if (pos < game.actionIndex) game.actionIndex -= 1
  }
  if (game.actionIndex >= game.actionOrder.length) {
    game.actionIndex = Math.max(0, game.actionOrder.length - 1)
  }
  if (game.awaitingActive === player.id) game.awaitingActive = null
}

/** 前台角色阵亡后的处理：还有存活角色则等待该玩家重新选择，否则淘汰 */
function resolveDefeat(game: Game, target: Player) {
  // 盗罐行者阵亡即关卡胜利（残破容器不会阻止失败）
  if (target.characters.some((c) => c.id === 'char-jarwalker' && !c.alive)) {
    eliminatePlayer(game, target)
    const remaining = game.players.filter((p) => !p.eliminated)
    if (remaining.length <= 1) finishGame(game)
    return
  }

  const alive = target.characters.filter((c) => c.alive)

  if (alive.length === 0) {
    eliminatePlayer(game, target)
    const remaining = game.players.filter((p) => !p.eliminated)
    if (remaining.length <= 1) finishGame(game)
    return
  }

  // 电脑不需要玩家操作，自动换到下一个存活角色
  if (game.aiSeat !== null && target.seat === game.aiSeat) {
    target.activeIndex = target.characters.findIndex((c) => c.alive)
    return
  }

  game.awaitingActive = target.id
}

/**
 * 教学楼：我方前台受到的伤害减免。
 * 每张场地每回合触发 1 次，按减伤前的伤害判断是否触发额外减免。
 */
function frontDamageReduction(
  player: Player,
  character: Character,
  amount: number,
): number {
  // 只保护前台角色
  if (player.characters[player.activeIndex] !== character) return 0

  let total = 0
  for (const field of player.fields) {
    const def = CARD_LIBRARY.find((d) => d.defId === field.defId)
    if (!def || def.effect.type !== 'frontDamageReduction') continue
    if ((player.fieldUses[field.id] ?? 0) >= def.effect.usesPerRound) continue

    total += def.effect.amount
    if (amount >= def.effect.heavyThreshold) total += def.effect.heavyExtra
    player.fieldUses[field.id] = (player.fieldUses[field.id] ?? 0) + 1
  }
  return total
}

/** 是否为后台角色 */
function isBackline(player: Player, character: Character): boolean {
  return player.characters[player.activeIndex] !== character
}

/** 耳机：后台角色受到伤害减免，每件配饰每回合独立计次 */
function backlineDamageReduction(player: Player, character: Character): number {
  if (!isBackline(player, character)) return 0

  let total = 0
  for (const accessory of player.accessories) {
    const def = CARD_LIBRARY.find((d) => d.defId === accessory.defId)
    if (!def || def.effect.type !== 'backlineSupport') continue
    const key = `reduce:${accessory.id}`
    if ((player.accessoryUses[key] ?? 0) >= def.effect.usesPerRound) continue

    total += def.effect.reduction
    player.accessoryUses[key] = (player.accessoryUses[key] ?? 0) + 1
  }
  return total
}

/** 耳机：后台角色造成伤害加成，每件配饰每回合独立计次 */
function backlineDamageBonus(player: Player, character: Character): number {
  if (!isBackline(player, character)) return 0

  let total = 0
  for (const accessory of player.accessories) {
    const def = CARD_LIBRARY.find((d) => d.defId === accessory.defId)
    if (!def || def.effect.type !== 'backlineSupport') continue
    const key = `damage:${accessory.id}`
    if ((player.accessoryUses[key] ?? 0) >= def.effect.usesPerRound) continue

    total += def.effect.damage
    player.accessoryUses[key] = (player.accessoryUses[key] ?? 0) + 1
  }
  return total
}

/** 卡祖笛：生命值达到阈值的我方角色受到的伤害减少，装备多张可叠加 */
function accessoryDamageReduction(player: Player, character: Character): number {
  let total = 0
  for (const accessory of player.accessories) {
    const def = CARD_LIBRARY.find((d) => d.defId === accessory.defId)
    if (!def || def.effect.type !== 'hpThresholdDamageReduction') continue
    if (character.hp >= def.effect.minHp) total += def.effect.amount
  }
  return total
}

/** 七彩亭：角色阵亡时标记该角色，并弃置一张七彩亭 */
function markDeathRevive(game: Game, player: Player, character: Character): boolean {
  const index = player.fields.findIndex((field) => {
    const def = CARD_LIBRARY.find((d) => d.defId === field.defId)
    return def?.effect.type === 'deathRevive'
  })
  if (index < 0) return false

  const [card] = player.fields.splice(index, 1)
  const def = CARD_LIBRARY.find((d) => d.defId === card.defId)
  game.discard.push(card)
  game.pendingRevives.push({
    playerId: player.id,
    characterId: character.id,
    hp: def && def.effect.type === 'deathRevive' ? def.effect.hp : 1,
  })
  return true
}

/** 结束阶段之后：复活被七彩亭标记的角色 */
function resolvePendingRevives(game: Game): void {
  if (game.pendingRevives.length === 0) return

  for (const entry of game.pendingRevives) {
    const player = game.players.find((p) => p.id === entry.playerId)
    if (!player) continue
    const index = player.characters.findIndex((c) => c.id === entry.characterId)
    if (index < 0) continue

    const character = player.characters[index]
    character.alive = true
    character.hp = Math.min(character.maxHp, Math.max(1, entry.hp))
    if (!player.characters[player.activeIndex]?.alive) player.activeIndex = index
  }

  game.pendingRevives = []
}

/**
 * 大劲凉：受到一次敌方攻击时触发。
 * 一次攻击无论命中几个角色，只消耗 1 次：命中角色各回复，只摸 1 张牌。
 */
function triggerCoolSip(game: Game, player: Player, hit: Character[]): void {
  const sip = player.coolSips
  if (!sip || sip.charges <= 0 || player.eliminated) return

  sip.charges -= 1
  for (const character of hit) {
    if (character.alive) {
      applyHeal(game, player, character, sip.heal)
    }
  }
  if (sip.draw > 0) {
    ensureDeck(game, sip.draw)
    for (let i = 0; i < sip.draw; i += 1) {
      const card = game.deck.shift()
      if (card) player.hand.push(card)
    }
  }
  if (sip.charges <= 0) player.coolSips = null
}

/** 饭卡：打出道具牌后，回复生命最低的我方角色，每回合 1 次 */
function triggerMealCardHeal(game: Game, player: Player): void {
  if (player.accessoryUses['meal-heal']) return

  let heal = 0
  for (const accessory of player.accessories) {
    const def = CARD_LIBRARY.find((d) => d.defId === accessory.defId)
    if (def?.effect.type === 'mealCard') {
      heal = Math.max(heal, def.effect.healLowest)
    }
  }
  if (heal <= 0) return

  let lowest: Character | null = null
  for (const character of player.characters) {
    if (!character.alive) continue
    if (!lowest || character.hp < lowest.hp) lowest = character
  }
  if (!lowest || lowest.hp >= lowest.maxHp) return

  applyHeal(game, player, lowest, heal)
  player.accessoryUses['meal-heal'] = 1
}

/** 贴纸：手牌上限加成 */
function handLimitFor(player: Player): number {
  let limit = HAND_LIMIT
  for (const accessory of player.accessories) {
    const def = CARD_LIBRARY.find((d) => d.defId === accessory.defId)
    if (def?.effect.type === 'handLimitBonus') limit += def.effect.amount
  }
  return limit
}

/**
 * 贴纸：受到攻击时按当前概率摸牌；只有成功触发才降低概率，
 * 每件配饰独立计数，回合开始时由 accessoryUses 清空重置。
 */
function triggerSticker(game: Game, player: Player): void {
  for (const accessory of player.accessories) {
    const def = CARD_LIBRARY.find((d) => d.defId === accessory.defId)
    if (!def || def.effect.type !== 'handLimitBonus') continue

    const key = `sticker:${accessory.id}`
    const triggered = player.accessoryUses[key] ?? 0
    if (triggered >= def.effect.maxTriggers) continue

    const chance = def.effect.drawChance - def.effect.chanceStep * triggered
    if (chance <= 0 || Math.random() >= chance) continue

    player.accessoryUses[key] = triggered + 1
    ensureDeck(game, 1)
    const card = game.deck.shift()
    if (card) player.hand.push(card)
  }
}

/**
 * 对具体角色造成伤害。sourcePlayerId 用于判定「海王」反击与奥斯卡天赋的「被攻击」。
 * allowCounter=false 时不再连锁反击，避免互相弹射。
 */
function hurtCharacter(
  game: Game,
  player: Player,
  character: Character,
  amount: number,
  sourcePlayerId: string | null,
  allowCounter = true,
  trueDamage = 0,
): boolean {
  if (!character.alive || amount <= 0) return false

  // 阿米诺斯：我方角色受到的伤害 +1
  if (player.aminoActive) {
    amount += 1
    if (trueDamage > 0) trueDamage += 1
  }

  // 文明标兵：受到敌方攻击时，有 50% 概率消耗嘲讽值闪避
  if (sourcePlayerId && sourcePlayerId !== player.id) {
    const summon = player.summons.find((s) => s.defId === 'civil-model' && s.taunt > 0)
    if (summon && Math.random() < 0.5) {
      summon.taunt -= 1
      if (summon.taunt <= 0) {
        player.summons = player.summons.filter((s) => s !== summon)
      }

      // 反击 1 点：攻击方不是角色时打攻击方前台
      const attacker = game.players.find((p) => p.id === sourcePlayerId)
      const attackerFront = attacker?.characters[attacker.activeIndex]
      if (attacker && attackerFront && attackerFront.alive) {
        hurtCharacter(game, attacker, attackerFront, 1, null)
      }
      // 闪避不视为受到攻击，后续结算全部跳过
      return false
    }
  }

  // 烤冷面：复活当回合内免疫伤害，减伤与护盾都不消耗
  const immune = character.immuneRound === game.round

  let hpLoss = 0
  if (!immune) {
    // 奶蛙诅咒 / 豆包诅咒：受到的伤害增加。奶蛙诅咒每次受击消耗 1 次可用次数。
    const frogCurse = character.effects.find((e) => e.defId === 'frog-curse')
    if (frogCurse) {
      amount += 2
      frogCurse.stacks -= 1
      if (frogCurse.stacks <= 0) {
        const index = character.effects.indexOf(frogCurse)
        if (index >= 0) character.effects.splice(index, 1)
      }
    }
    if (character.effects.some((e) => e.defId === 'bean-curse')) amount += 4

    // 杨云博·初一小孩：受击时消耗 1 点特殊生命，使本次伤害 -1
    if (character.id === 'char-yangyunbo') {
      const kid = player.summons.find((s) => s.defId === 'chuyi-kid' && (s.hp ?? 0) > 0)
      if (kid) {
        kid.hp = (kid.hp ?? 0) - 1
        amount = Math.max(0, amount - 1)
      }
    }

    // 教学楼：我方前台受到的伤害减少，每回合 1 次；卡祖笛：高生命角色受到伤害减少；
    // 耳机：后台角色受到的伤害减少，每回合计次。纯真实伤害不触发这些减伤。
    const hasNormalDamage = amount - trueDamage > 0
    const reduction = hasNormalDamage
      ? frontDamageReduction(player, character, amount) +
        accessoryDamageReduction(player, character) +
        backlineDamageReduction(player, character)
      : 0

    // 鸡腿饭的「减伤」：每个角色各自抵消一次，触发后移除
    let guardReduction = 0
    if (amount - trueDamage > 0) {
      const guardIndex = character.effects.findIndex((e) => e.defId === 'guard')
      if (guardIndex >= 0) {
        const guard = character.effects[guardIndex]
        guard.stacks -= 1
        if (guard.stacks <= 0) character.effects.splice(guardIndex, 1)
        guardReduction = 1
      }
    }

    // 护盾先抵消非真实伤害部分，真实伤害直接穿透
    const normal = Math.max(0, amount - trueDamage - reduction - guardReduction)
    let normalLeft = normal
    if (character.shield > 0 && normalLeft > 0) {
      const absorbed = Math.min(character.shield, normalLeft)
      character.shield -= absorbed
      normalLeft -= absorbed
    }
    hpLoss = normalLeft + trueDamage

    // 我是辽宁的：敌方造成的伤害在减伤后减半（向上取整）
    if (
      hpLoss > 0 &&
      character.id === 'char-yangyunbo' &&
      sourcePlayerId &&
      sourcePlayerId !== player.id &&
      character.effects.some((e) => e.defId === 'liaoning')
    ) {
      hpLoss = Math.ceil(hpLoss / 2)
    }
  }

  let died = false
  if (hpLoss > 0) {
    character.hp = Math.max(0, character.hp - hpLoss)
    died = character.hp === 0
    if (died) {
      character.alive = false
      // 盗罐行者的残破容器：按镣铐崩解规则刷新/离场
      if (isContainer(character)) {
        handleContainerDeath(game, player, character)
        return true
      }
      triggerCouqieAllyDeath(player, character)
      // 七彩亭：先标记等待复活，本次不进入阵亡结算
      if (markDeathRevive(game, player, character)) {
        if (player.characters[player.activeIndex] === character) {
          const next = player.characters.findIndex((c) => c.alive)
          if (next >= 0) player.activeIndex = next
        }
      } else if (player.characters[player.activeIndex] === character) {
        resolveDefeat(game, player)
      }
    }
  }

  // 大佐·恶臭：我方其他角色受到伤害时，大佐承受其中一半（向下取整）。
  // 大佐自己受到伤害不再二次转移；转移伤害不触发反击等受击效果。
  if (hpLoss > 0 && character.id !== 'char-dazuo' && !player.eliminated) {
    const dazuo = player.characters.find(
      (c) =>
        c.id === 'char-dazuo' &&
        c.alive &&
        c !== character &&
        c.effects.some((e) => e.defId === 'stench'),
    )
    if (dazuo) {
      const share = Math.floor(hpLoss / 2)
      if (share > 0) {
        hurtCharacter(game, player, dazuo, share, null, false)
      }
    }
  }

  // 海王：被敌方角色攻击时反击 1 点，是否被护盾挡下不影响
  if (
    allowCounter &&
    sourcePlayerId &&
    sourcePlayerId !== player.id &&
    character.effects.some((e) => e.defId === 'seaking')
  ) {
    const attacker = game.players.find((p) => p.id === sourcePlayerId)
    const attackerActive = attacker?.characters[attacker.activeIndex]
    if (attacker && attackerActive && attackerActive.alive) {
      // 耳机：由后台角色打出的反击也享受伤害加成；阿米诺斯：我方角色造成伤害 +1
      const counterDamage =
        1 + backlineDamageBonus(player, character) + (player.aminoActive ? 1 : 0)
      hurtCharacter(game, attacker, attackerActive, counterDamage, null, false)
    }
  }

  // 奥斯卡小金马：每次受到攻击最多 +1 层小丑；
  // 未受攻击而生命降低时（如结束阶段伤害）再 +1 层。
  if (character.alive && character.talentId === 'oscar') {
    if (sourcePlayerId && sourcePlayerId !== player.id) {
      applyEffect(character, 'clown', 1)
    } else if (hpLoss > 0) {
      applyEffect(character, 'clown', 1)
    }
  }

  return true
}

/** 我是辽宁的：敌方攻击强制以杨云博为目标 */
function liaoningVictim(
  player: Player,
  sourcePlayerId: string | null,
): Character | null {
  if (!sourcePlayerId || sourcePlayerId === player.id) return null
  return (
    player.characters.find(
      (c) =>
        c.id === 'char-yangyunbo' &&
        c.alive &&
        c.effects.some((e) => e.defId === 'liaoning'),
    ) ?? null
  )
}

function applyDamage(
  game: Game,
  target: Player,
  amount: number,
  sourcePlayerId: string | null = null,
  trueDamage = 0,
  victimOverride?: Character | null,
): boolean {
  const forced = liaoningVictim(target, sourcePlayerId)
  const victim = forced ?? victimOverride ?? target.characters[target.activeIndex]
  if (!victim) return false
  const hit = hurtCharacter(game, target, victim, amount, sourcePlayerId, true, trueDamage)
  // 大劲凉 / 贴纸：受到敌方攻击时触发；被闪避的攻击不算受到攻击
  if (hit && sourcePlayerId && sourcePlayerId !== target.id) {
    triggerCoolSip(game, target, [victim])
    triggerSticker(game, target)
  }
  return hit
}

let effectUidSeq = 0

/** 给角色叠加一个状态效果。已有同种效果时累加层数。 */
export function applyEffect(character: Character, defId: string, stacks = 1): boolean {
  const info = EFFECT_MAP[defId]
  if (!info || stacks <= 0) return false

  const existing = character.effects.find((e) => e.defId === defId)
  if (existing) {
    existing.stacks = Math.min(info.maxStacks, existing.stacks + stacks)
    return true
  }

  effectUidSeq += 1
  character.effects.push({
    uid: `fx-${effectUidSeq}`,
    defId,
    stacks: Math.min(info.maxStacks, stacks),
  })
  return true
}

/** 消耗某个效果的一定层数，返回实际消耗量 */
function spendStacks(character: Character, defId: string, amount: number): number {
  const effect = character.effects.find((e) => e.defId === defId)
  if (!effect) return 0

  const used = Math.min(effect.stacks, amount)
  effect.stacks -= used
  if (effect.stacks <= 0) {
    const index = character.effects.indexOf(effect)
    if (index >= 0) character.effects.splice(index, 1)
  }
  return used
}

/** 巨佬：同一玩家同时只能存在 1 个巨佬 / PROMAX佬 状态 */
function clearJulaoStatuses(player: Player): void {
  for (const character of player.characters) {
    character.effects = character.effects.filter(
      (e) => e.defId !== 'julao' && e.defId !== 'promax',
    )
  }
}

/** U：造成普通攻击伤害后，教鞭长度重置为 1 段 */
function resetWhipLength(character: Character): void {
  const effect = character.effects.find((e) => e.defId === 'whip-length')
  if (effect) effect.stacks = 1
}

/** 持有充能天赋的角色（抑制剂） */
function findChargeCharacter(player: Player): Character | null {
  return player.characters.find((c) => c.talentId === 'charge' && c.alive) ?? null
}

/** 紊乱造成 1 点真实伤害，并治疗施加者一方全体 1 点 */
function triggerDisorderDamage(
  game: Game,
  owner: Player,
  character: Character,
  sourcePlayerId: string | null,
): boolean {
  if (!character.alive) return false
  if (character.immuneRound === game.round) return false

  character.hp = Math.max(0, character.hp - 1)
  killFromEffect(game, owner, character)
  gainClownOnHpLoss(character)

  const source = sourcePlayerId
    ? game.players.find((p) => p.id === sourcePlayerId)
    : null
  if (source && !source.eliminated) {
    for (const c of source.characters) {
      if (c.alive) applyHeal(game, source, c, 1)
    }
  }
  return true
}

/**
 * 施加状态效果并处理联动：
 * - uniqueOnField：先清掉全场同种效果，保证同时只有一个
 * - 充能天赋：我方对他方目标施加负面效果时，己方抑制剂 +1 层
 */
function grantEffect(
  game: Game,
  owner: Player,
  character: Character,
  defId: string,
  stacks: number,
  sourcePlayerId: string | null,
  uniqueOnField = false,
): void {
  const info = EFFECT_MAP[defId]
  if (!info) return

  if (uniqueOnField) {
    for (const player of game.players) {
      for (const c of player.characters) {
        const index = c.effects.findIndex((e) => e.defId === defId)
        if (index >= 0) c.effects.splice(index, 1)
      }
    }
  }

  // 紊乱：超出 4 层的部分立即清除，并触发一次紊乱伤害
  if (defId === 'disorder') {
    const existing = character.effects.find((e) => e.defId === 'disorder')
    const before = existing?.stacks ?? 0
    if (before + stacks > info.maxStacks) {
      if (existing) {
        existing.stacks = info.maxStacks
        existing.sourcePlayerId = sourcePlayerId ?? existing.sourcePlayerId
      } else {
        applyEffect(character, 'disorder', info.maxStacks)
        const created = character.effects.find((e) => e.defId === 'disorder')
        if (created) created.sourcePlayerId = sourcePlayerId ?? undefined
      }
      triggerDisorderDamage(
        game,
        owner,
        character,
        sourcePlayerId ?? existing?.sourcePlayerId ?? null,
      )
      if (info.polarity === 'debuff' && sourcePlayerId && owner.id !== sourcePlayerId) {
        const source = game.players.find((p) => p.id === sourcePlayerId)
        const chargeHolder = source ? findChargeCharacter(source) : null
        if (chargeHolder) applyEffect(chargeHolder, 'charge', 1)
      }
      return
    }
  }

  if (!applyEffect(character, defId, stacks)) return

  if (defId === 'disorder') {
    const effect = character.effects.find((e) => e.defId === 'disorder')
    if (effect) effect.sourcePlayerId = sourcePlayerId ?? effect.sourcePlayerId
  }

  if (info.polarity === 'debuff' && sourcePlayerId && owner.id !== sourcePlayerId) {
    const source = game.players.find((p) => p.id === sourcePlayerId)
    const chargeHolder = source ? findChargeCharacter(source) : null
    if (chargeHolder) applyEffect(chargeHolder, 'charge', 1)
  }
}

/** 施加一个独立实例，不与其他同种效果合并层数 */
function grantEffectInstance(
  game: Game,
  owner: Player,
  character: Character,
  defId: string,
  stacks: number,
  sourcePlayerId: string | null,
): void {
  const info = EFFECT_MAP[defId]
  if (!info) return

  effectUidSeq += 1
  character.effects.push({
    uid: `fx-${effectUidSeq}`,
    defId,
    stacks: Math.min(info.maxStacks, stacks),
  })

  // 抑制剂天赋：我方施加负面效果时积累充能
  if (info.polarity === 'debuff' && sourcePlayerId && owner.id !== sourcePlayerId) {
    const source = game.players.find((p) => p.id === sourcePlayerId)
    const chargeHolder = source ? findChargeCharacter(source) : null
    if (chargeHolder) applyEffect(chargeHolder, 'charge', 1)
  }
}

/** 随机移除一个正面效果，返回是否成功 */
function stripRandomBuff(character: Character): boolean {
  const buffs = character.effects.filter((e) => EFFECT_MAP[e.defId]?.polarity === 'buff')
  if (buffs.length === 0) return false

  const pick = buffs[Math.floor(Math.random() * buffs.length)]
  const index = character.effects.indexOf(pick)
  if (index >= 0) character.effects.splice(index, 1)
  return true
}

/** 对指定角色造成伤害，可用于后台角色 */
function damageCharacter(
  game: Game,
  player: Player,
  character: Character,
  amount: number,
  sourcePlayerId: string | null = null,
  trueDamage = 0,
): boolean {
  return hurtCharacter(game, player, character, amount, sourcePlayerId, true, trueDamage)
}

/** 结束阶段：八中杀积累充能（1 点基础 + 每点未使用行动点） */
function triggerAccessoryEndPhase(game: Game): void {
  for (const player of game.players) {
    if (player.eliminated) continue
    for (const accessory of player.accessories) {
      const def = CARD_LIBRARY.find((d) => d.defId === accessory.defId)
      if (!def || def.effect.type !== 'chargeAccumulate') continue
      accessory.charges = (accessory.charges ?? 0) + def.effect.endPhase + player.ap
    }
  }
}

/** 凑企厄：队友死亡时，大招花费永久降低 2 点 */
function triggerCouqieAllyDeath(player: Player, dead: Character): void {
  if (dead.id === 'char-couqie') return
  for (const character of player.characters) {
    if (character.id === 'char-couqie' && character.alive && !character.godForm) {
      character.burstCostDiscount += 2
    }
  }
}

/** 凑企厄：每回合结束时，大招花费永久降低 1 点 */
function triggerCouqieEndPhase(game: Game): void {
  for (const player of game.players) {
    if (player.eliminated) continue
    for (const character of player.characters) {
      if (character.id === 'char-couqie' && character.alive && !character.godForm) {
        character.burstCostDiscount += 1
      }
    }
  }
}

/** 大佐·恶臭：我方角色使用技能后治疗大佐 1 点，每回合至多 2 次 */
function triggerStenchHeal(game: Game, player: Player): void {
  const dazuo = player.characters.find((c) => c.id === 'char-dazuo' && c.alive)
  if (!dazuo) return
  if (!dazuo.effects.some((e) => e.defId === 'stench')) return

  if (dazuo.stenchHealRound !== game.round) {
    dazuo.stenchHealRound = game.round
    dazuo.stenchHealCount = 0
  }
  if (dazuo.stenchHealCount >= 2) return
  // 满血时不消耗次数
  if (dazuo.hp >= dazuo.maxHp) return

  applyHeal(game, player, dazuo, 1)
  dazuo.stenchHealCount += 1
}

/**
 * 高玩·低能：我方角色使用技能攻击敌方玩家后，高玩立刻发动追加攻击，
 * 对该玩家全体角色造成 2 点伤害并消耗 1 层低能。
 * 追加攻击不限制高玩在前台或后台。
 */
function triggerLowbrowFollowUp(game: Game, player: Player, target: Player): void {
  if (target.id === player.id || target.eliminated) return

  const gaowan = player.characters.find((c) => c.id === 'char-gaowan' && c.alive)
  if (!gaowan) return

  const lowbrow = gaowan.effects.find((e) => e.defId === 'lowbrow')
  if (!lowbrow || lowbrow.stacks <= 0) return

  spendStacks(gaowan, 'lowbrow', 1)
  for (const character of target.characters) {
    if (!character.alive) continue
    damageCharacter(game, target, character, 2, player.id)
    if (game.phase === 'finished') return
  }
}

/* ---------------- 大母零：鲨bee ---------------- */

const SHARK_MAX_CHARGES = 20

function findShark(player: Player): Summon | undefined {
  return player.summons.find((s) => s.defId === 'sharkbee')
}

function summonShark(player: Player, charges: number): void {
  const def = SUMMONS.sharkbee
  summonSeq += 1
  player.summons.push({
    id: `summon-${summonSeq}`,
    defId: 'sharkbee',
    name: def.name,
    artId: def.artId,
    description: def.description,
    taunt: 0,
    charges: Math.min(SHARK_MAX_CHARGES, charges),
    healStored: 0,
  })
}

/** 鲨bee 离场：进入等待玩家点选敌方前台的状态 */
function triggerSharkDischarge(game: Game, player: Player): void {
  const shark = findShark(player)
  if (!shark) return

  const charges = Math.min(SHARK_MAX_CHARGES, shark.charges ?? 0)
  const heal = Math.min(SHARK_MAX_CHARGES, shark.healStored ?? 0)
  player.summons = player.summons.filter((s) => s !== shark)

  if (charges <= 0 || player.eliminated) return
  game.awaitingSharkTarget = player.id
  game.pendingShark = { playerId: player.id, charges, heal }
}

/**
 * 我方受到治疗的统一入口。
 * 鲨bee 在场时不会真正回血，而是把治疗量转为累积治疗（至多 20）；
 * 达到 20 后鲨bee 离场并进入放电选择。
 */
function applyHeal(
  game: Game,
  player: Player,
  character: Character,
  amount: number,
): number {
  if (amount <= 0 || !character.alive) return 0

  const shark = findShark(player)
  if (shark) {
    const current = shark.charges ?? 0
    const converted = Math.min(amount, Math.max(0, SHARK_MAX_CHARGES - current))
    shark.charges = current + converted
    shark.healStored = Math.min(
      SHARK_MAX_CHARGES,
      (shark.healStored ?? 0) + converted,
    )
    if ((shark.charges ?? 0) >= SHARK_MAX_CHARGES) triggerSharkDischarge(game, player)
    return 0
  }

  const before = character.hp
  character.hp = Math.min(character.maxHp, character.hp + amount)
  return character.hp - before
}

/** 鲨bee 主动获得的累积治疗（普攻 / 大招），不计入治疗量 */
function addSharkCharges(game: Game, player: Player, amount: number): void {
  const shark = findShark(player)
  if (!shark) return
  shark.charges = Math.min(SHARK_MAX_CHARGES, (shark.charges ?? 0) + amount)
  if ((shark.charges ?? 0) >= SHARK_MAX_CHARGES) triggerSharkDischarge(game, player)
}

/**
 * 鲨bee 放电结算：对指定敌方前台造成等于累积治疗的伤害，
 * 并按累计治疗量的 1/3（至少 1 点）治疗我方全体。
 */
export function chooseSharkTarget(
  game: Game,
  playerId: string,
  targetPlayerId: string,
): ActionResult {
  if (game.awaitingSharkTarget !== playerId || !game.pendingShark) {
    return { ok: false, message: '当前不需要选择鲨bee目标' }
  }

  const player = game.players.find((p) => p.id === playerId)
  const target = game.players.find(
    (p) => p.id === targetPlayerId && p.id !== playerId && !p.eliminated,
  )
  if (!player) return { ok: false, message: '玩家不存在' }
  const front = target?.characters[target.activeIndex]
  if (!target || !front || !front.alive) {
    return { ok: false, message: '请选择敌方存活的前台角色' }
  }

  const pending = game.pendingShark
  game.awaitingSharkTarget = null
  game.pendingShark = null

  damageCharacter(game, target, front, pending.charges, playerId)

  if (game.phase !== 'finished') {
    const heal = Math.max(1, Math.floor(pending.heal / 3))
    for (const character of player.characters) {
      if (character.alive) {
        character.hp = Math.min(character.maxHp, character.hp + heal)
      }
    }
  }

  // 放电可能发生在电脑行动中：恢复被暂停的电脑回合
  if (game.phase !== 'finished') {
    if (game.aiActive) {
      setTimeout(() => stepAI(game), AI_STEP_DELAY)
    } else {
      scheduleAI(game)
    }
  }

  return { ok: true }
}

/** 行动阶段开始时的结算：行动点压制 */
function beginAction(game: Game): void {
  const seat = game.actionOrder[game.actionIndex]
  if (seat === undefined) return

  const player = game.players[seat]
  if (!player || player.eliminated) return

  // 阿米诺斯：持续到我方下一次行动阶段开始时
  player.aminoActive = false
  // 运动会：返还次数只在本次行动内有效
  player.sportsReturns = 0

  for (const character of player.characters) {
    const index = character.effects.findIndex((e) => e.defId === 'ap-down')
    if (index < 0) continue
    character.effects.splice(index, 1)
    player.ap = Math.max(0, player.ap - 2)
    break
  }

  // 配饰·五三：装备者行动开始时获得行动点，装备多张可叠加
  for (const accessory of player.accessories) {
    const def = CARD_LIBRARY.find((d) => d.defId === accessory.defId)
    if (def?.effect.type === 'actionStartAp') {
      player.ap += def.effect.amount
    }
  }

  // 配饰·八中杀：充能超过阈值时，行动开始摸 1 张牌并生成 1 行动点
  for (const accessory of player.accessories) {
    const def = CARD_LIBRARY.find((d) => d.defId === accessory.defId)
    if (!def || def.effect.type !== 'chargeAccumulate') continue
    if ((accessory.charges ?? 0) <= def.effect.threshold) continue

    ensureDeck(game, 1)
    const card = game.deck.shift()
    if (card) player.hand.push(card)
    player.ap += 1
  }
}

/** 角色被打倒后的处理。结束阶段造成的阵亡直接自动换人，不弹选择框。 */
function onCharacterDefeated(game: Game, player: Player, character: Character) {
  // 盗罐行者阵亡即关卡胜利：结束阶段/持续伤害等路径同样生效，
  // 残留的残破容器不影响胜利。
  if (player.characters.some((c) => c.id === 'char-jarwalker' && !c.alive)) {
    eliminatePlayer(game, player)
    const remaining = game.players.filter((p) => !p.eliminated)
    if (remaining.length <= 1) finishGame(game)
    return
  }

  const alive = player.characters.filter((c) => c.alive)

  if (alive.length === 0) {
    eliminatePlayer(game, player)
    const remaining = game.players.filter((p) => !p.eliminated)
    if (remaining.length <= 1) finishGame(game)
    return
  }

  if (player.characters[player.activeIndex] === character) {
    player.activeIndex = player.characters.findIndex((c) => c.alive)
  }
}

/** 结束阶段造成的掉血若致死，按结束阶段规则处理阵亡 */
function killFromEffect(game: Game, player: Player, character: Character): void {
  if (character.hp > 0) return
  character.alive = false
  if (isContainer(character)) {
    handleContainerDeath(game, player, character)
    return
  }
  triggerCouqieAllyDeath(player, character)
  if (markDeathRevive(game, player, character)) {
    if (player.characters[player.activeIndex] === character) {
      const next = player.characters.findIndex((c) => c.alive)
      if (next >= 0) player.activeIndex = next
    }
  } else {
    onCharacterDefeated(game, player, character)
  }
}

/** 结束阶段会造成伤害的负面效果 */
const END_PHASE_DAMAGE_EFFECTS = new Set(['bleed', 'poison-soup'])

/** 奥斯卡小金马：生命值降低时获得 1 层小丑 */
function gainClownOnHpLoss(character: Character): void {
  if (character.alive && character.talentId === 'oscar') {
    applyEffect(character, 'clown', 1)
  }
}

/** 单条效果的结束阶段结算 */
function runEffectTrigger(
  game: Game,
  player: Player,
  character: Character,
  defId: string,
): void {
  if (defId === 'bleed') {
    character.hp = Math.max(0, character.hp - 1)
    killFromEffect(game, player, character)
    gainClownOnHpLoss(character)
  }

  // 毒鸡汤：无视护盾与减伤，直接扣除生命
  if (defId === 'poison-soup') {
    if (character.immuneRound === game.round) return
    character.hp = Math.max(0, character.hp - 1)
    killFromEffect(game, player, character)
    gainClownOnHpLoss(character)
  }

  // 谢幕：结束阶段获得 2 层小丑
  if (defId === 'clown-phase') {
    applyEffect(character, 'clown', 2)
  }

  // 我是辽宁的：结束阶段治疗自身 1 点
  if (defId === 'liaoning') {
    applyHeal(game, player, character, 1)
  }

  // 紊乱：33.3% 概率造成 1 点真实伤害，并治疗施加者一方全体 1 点
  if (defId === 'disorder') {
    if (Math.random() < 1 / 3) {
      const effect = character.effects.find((e) => e.defId === 'disorder')
      triggerDisorderDamage(game, player, character, effect?.sourcePlayerId ?? null)
    }
  }
}

/** 场地牌「南门」类的结束阶段治疗 */
function runFieldEndPhaseHeal(
  game: Game,
  player: Player,
  effect: { healFront: number; lowHpThreshold: number; healLow: number },
): void {
  // 先回复前台
  const front = player.characters[player.activeIndex]
  if (front && front.alive && effect.healFront > 0) {
    applyHeal(game, player, front, effect.healFront)
  }

  // 再判断是否有低血角色，给生命最低者额外回复
  const alive = player.characters.filter((c) => c.alive)
  if (alive.length === 0) return
  if (!alive.some((c) => c.hp <= effect.lowHpThreshold)) return

  const lowest = alive.reduce((a, b) => (b.hp < a.hp ? b : a))
  applyHeal(game, player, lowest, effect.healLow)
}

/** 结束阶段：文明标兵攻击被标记的敌人；干儿子造成伤害并治疗后台 */
function runSummonEndPhase(game: Game, player: Player): void {
  // 初一小孩：结束阶段离场，按剩余特殊生命治疗杨云博，并额外治疗 1 点
  const kid = player.summons.find((s) => s.defId === 'chuyi-kid')
  if (kid) {
    player.summons = player.summons.filter((s) => s !== kid)
    const yang = player.characters.find((c) => c.id === 'char-yangyunbo' && c.alive)
    if (yang) applyHeal(game, player, yang, Math.max(0, kid.hp ?? 0) + 1)
  }

  const civil = player.summons.find((s) => s.defId === 'civil-model')
  if (civil) {
    for (const enemy of game.players) {
      if (enemy.id === player.id || enemy.eliminated) continue

      for (const character of enemy.characters) {
        if (!character.alive) continue
        const markIndex = character.effects.findIndex((e) => e.defId === 'mark')
        if (markIndex < 0) continue

        // 召唤物攻击：2 点伤害
        hurtCharacter(game, enemy, character, 2, player.id)
        character.effects.splice(markIndex, 1)
        civil.taunt = Math.min(5, civil.taunt + 1)
        if (game.phase === 'finished') return
      }
    }
  }

  const godson = player.summons.find((s) => s.defId === 'godson')
  if (!godson || game.phase === 'finished') return

  // 对随机一名敌方玩家的前台角色造成 1 点伤害
  const opponents = game.players.filter((p) => p.id !== player.id && !p.eliminated)
  if (opponents.length > 0) {
    const target = opponents[Math.floor(Math.random() * opponents.length)]
    const victim = target.characters[target.activeIndex]
    if (victim && victim.alive) {
      hurtCharacter(game, target, victim, 1, player.id)
      if (game.phase === 'finished') return
    }
  }

  // 治疗我方所有后台角色 1 点；对「大佐」的治疗量 +1
  for (let i = 0; i < player.characters.length; i += 1) {
    if (i === player.activeIndex) continue
    const character = player.characters[i]
    if (!character.alive) continue
    const amount = 1 + (character.id === 'char-dazuo' ? 1 : 0)
    applyHeal(game, player, character, amount)
  }

  godson.uses = (godson.uses ?? 0) - 1
  if (godson.uses <= 0) {
    player.summons = player.summons.filter((s) => s !== godson)
  }
}

/** 结束阶段：按本回合的玩家行动顺序依次触发可结算的效果 */
function triggerEndPhaseEffects(game: Game): void {
  const order = game.actionOrder.length > 0 ? game.actionOrder : clockwiseSeats(game)

  for (const seat of order) {
    const player = game.players[seat]
    if (player.eliminated) continue

    // 场地牌的结束阶段效果先结算
    for (const field of player.fields) {
      const def = CARD_LIBRARY.find((d) => d.defId === field.defId)
      if (def && def.effect.type === 'endPhaseHeal') {
        runFieldEndPhaseHeal(game, player, def.effect)
      }
    }

    // 耳机：我方后台角色结束阶段回复生命
    for (let i = 0; i < player.characters.length; i += 1) {
      if (i === player.activeIndex) continue
      const character = player.characters[i]
      if (!character.alive) continue
      for (const accessory of player.accessories) {
        const def = CARD_LIBRARY.find((d) => d.defId === accessory.defId)
        if (!def || def.effect.type !== 'backlineSupport') continue
        applyHeal(game, player, character, def.effect.endPhaseHeal)
      }
    }

    // 召唤物：文明标兵攻击被标记的敌人
    runSummonEndPhase(game, player)
    if (game.phase === 'finished') return

    for (const character of player.characters) {
      if (!character.alive) continue

      for (const effect of [...character.effects]) {
        const info = EFFECT_MAP[effect.defId]
        if (!info) continue

        if (info.triggersOnEndPhase) {
          runEffectTrigger(game, player, character, effect.defId)
          if (game.phase === 'finished') return
          if (!character.alive) break
        }

        if (info.ticksDown) {
          effect.stacks -= 1
          if (effect.stacks <= 0) {
            const index = character.effects.indexOf(effect)
            if (index >= 0) character.effects.splice(index, 1)
          }
        }
      }
    }

    // 只持续到本回合结束的效果（足球）
    for (const character of player.characters) {
      if (character.effects.length === 0) continue
      character.effects = character.effects.filter(
        (effect) => !EFFECT_MAP[effect.defId]?.expiresAtEndPhase,
      )
    }
  }
}

/* ---------------- 盗罐行者关卡 ---------------- */

function isJarwalkerPlayer(player: Player): boolean {
  return player.characters.some((c) => c.id === 'char-jarwalker')
}

function isContainer(character: Character): boolean {
  return character.id.startsWith('char-container')
}

let containerSeq = 0

function newContainer(): Character {
  containerSeq += 1
  return toCharacter({
    ...CONTAINER_TEMPLATE,
    id: `char-container-${containerSeq}`,
  })
}

/**
 * 整理盗罐行者的角色栏：左侧容器、盗罐行者、右侧容器。
 * perSide 为目标每侧数量；addOne 为普攻的「每侧各添加 1 只」（不超过 perSide）。
 */
function jarwalkerRearm(player: Player, perSide: number, addOne = false): void {
  const bossIndex = player.characters.findIndex((c) => c.id === 'char-jarwalker')
  if (bossIndex < 0) return
  const boss = player.characters[bossIndex]
  const left = player.characters.slice(0, bossIndex).filter(isContainer)
  const right = player.characters.slice(bossIndex + 1).filter(isContainer)

  const targetLeft = addOne ? Math.min(perSide, left.length + 1) : perSide
  const targetRight = addOne ? Math.min(perSide, right.length + 1) : perSide
  while (left.length < targetLeft) left.push(newContainer())
  while (right.length < targetRight) right.push(newContainer())

  player.characters = [...left, boss, ...right]
  player.activeIndex = left.length
}

/** 盗罐行者扣除自身生命（无视护盾），最多扣到 1 点，不会因自身攻击阵亡 */
function jarwalkerLoseHp(
  _game: Game,
  _player: Player,
  boss: Character,
  amount: number,
): void {
  boss.hp = Math.max(1, boss.hp - amount)
}

/** 残破容器死亡：崩解状态下原位刷新并触发奖励；否则直接离场 */
function handleContainerDeath(game: Game, player: Player, container: Character): void {
  const boss = player.characters.find((c) => c.id === 'char-jarwalker' && c.alive)
  const inBreak = Boolean(
    boss?.effects.some((e) => e.defId === 'shackle-break'),
  )
  const index = player.characters.indexOf(container)

  if (boss && inBreak && index >= 0) {
    // 原位刷新
    player.characters[index] = newContainer()
    player.activeIndex = player.characters.findIndex((c) => c.id === 'char-jarwalker')

    // 对盗罐行者造成 2 点真实伤害
    damageCharacter(game, player, boss, 2, null, 2)
    if (game.phase === 'finished') return

    // 降低 1 层镣锁；归零时结束镣铐崩解
    const shackle = boss.effects.find((e) => e.defId === 'shackle')
    if (shackle) {
      shackle.stacks -= 1
      if (shackle.stacks <= 0) {
        boss.effects = boss.effects.filter(
          (e) => e.defId !== 'shackle' && e.defId !== 'shackle-break',
        )
      }
    }

    // 我方回复 1 行动点并摸 1 张牌
    const human = game.players.find((p) => p.id !== player.id && !p.eliminated)
    if (human) {
      human.ap += 1
      ensureDeck(game, 1)
      const drawn = game.deck.shift()
      if (drawn) human.hand.push(drawn)
    }
    return
  }

  // 普通状态：容器直接从场上移除
  if (index >= 0) {
    player.characters.splice(index, 1)
    player.activeIndex = player.characters.findIndex((c) => c.id === 'char-jarwalker')
  }
}

function jarwalkerNormal(
  game: Game,
  player: Player,
  boss: Character,
  opponent: Player,
): void {
  applyDamage(game, opponent, 2, player.id)
  jarwalkerLoseHp(game, player, boss, 2)
  if (game.phase === 'finished' || !boss.alive) return
  jarwalkerRearm(player, 2, true)
}

function jarwalkerSkill(
  game: Game,
  player: Player,
  boss: Character,
  opponent: Player,
): void {
  const containers = player.characters.filter(
    (c) => isContainer(c) && c.alive,
  )
  const killed = containers.length
  player.characters = player.characters.filter((c) => !containers.includes(c))
  player.activeIndex = player.characters.findIndex((c) => c.id === 'char-jarwalker')

  const front =
    liaoningVictim(opponent, player.id) ?? opponent.characters[opponent.activeIndex]
  const damage = 1 + killed
  if (front && front.alive) {
    hurtCharacter(game, opponent, front, damage, player.id)
  }
  const backDamage = Math.max(1, Math.floor(damage / 2))
  for (const character of opponent.characters) {
    if (!character.alive || character === front) continue
    hurtCharacter(game, opponent, character, backDamage, player.id)
    if (game.phase === 'finished') return
  }

  if (boss.alive) {
    boss.hp = Math.min(boss.maxHp, boss.hp + killed)
  }
}

function jarwalkerBurst(game: Game, player: Player, boss: Character): void {
  jarwalkerLoseHp(game, player, boss, 4)
  if (game.phase === 'finished' || !boss.alive) return
  applyEffect(boss, 'shackle', 20)
  applyEffect(boss, 'shackle-break', 1)
  jarwalkerRearm(player, 2)
}

function jarwalkerEnhanced(
  game: Game,
  player: Player,
  boss: Character,
  opponent: Player,
): void {
  const front =
    liaoningVictim(opponent, player.id) ?? opponent.characters[opponent.activeIndex]
  if (front && front.alive) {
    hurtCharacter(game, opponent, front, 3, player.id)
  }
  for (const character of opponent.characters) {
    if (!character.alive || character === front) continue
    hurtCharacter(game, opponent, character, 1, player.id)
    if (game.phase === 'finished') return
  }
  if (game.phase === 'finished' || !boss.alive) return

  boss.hp = Math.min(boss.maxHp, boss.hp + 4)

  const shackle = boss.effects.find((e) => e.defId === 'shackle')
  const remaining = shackle?.stacks ?? 0
  boss.effects = boss.effects.filter(
    (e) => e.defId !== 'shackle' && e.defId !== 'shackle-break',
  )

  // 消耗全部镣锁：每层 1 次弹射，每个角色最多 7 次
  const bounceCounts = new Map<Character, number>()
  const bounces = Math.min(20, remaining)
  for (let i = 0; i < bounces; i += 1) {
    const pool = opponent.characters.filter(
      (c) => c.alive && (bounceCounts.get(c) ?? 0) < 7,
    )
    if (pool.length === 0) break
    const pick = pool[Math.floor(Math.random() * pool.length)]
    bounceCounts.set(pick, (bounceCounts.get(pick) ?? 0) + 1)
    hurtCharacter(game, opponent, pick, 1, player.id)
    if (game.phase === 'finished') return
  }

  // 释放后击杀场上所有残破容器（此时崩解已结束，容器直接离场）
  for (const container of player.characters.filter(isContainer)) {
    if (!container.alive) continue
    container.hp = 0
    container.alive = false
    handleContainerDeath(game, player, container)
  }
  player.activeIndex = player.characters.findIndex(
    (c) => c.id === 'char-jarwalker',
  )
}

/** 盗罐行者的固定行动循环（第 1~5 回合循环） */
function runJarwalkerTurn(game: Game): void {
  if (game.aiSeat === null || game.aiActive) return
  game.aiActive = true

  const player = game.players[game.aiSeat]
  const boss = player.characters.find(
    (c) => c.id === 'char-jarwalker' && c.alive,
  )
  if (!boss) {
    game.aiActive = false
    return
  }
  player.activeIndex = player.characters.indexOf(boss)

  const opponent = game.players.find(
    (p) => p.seat !== game.aiSeat && !p.eliminated,
  )
  if (!opponent) {
    game.aiActive = false
    return
  }

  const slot = ((game.round - 1) % 5) + 1
  if (slot === 1) {
    jarwalkerNormal(game, player, boss, opponent)
    jarwalkerNormal(game, player, boss, opponent)
  } else if (slot === 2) {
    jarwalkerSkill(game, player, boss, opponent)
  } else if (slot === 3) {
    jarwalkerBurst(game, player, boss)
  } else if (slot === 5) {
    jarwalkerEnhanced(game, player, boss, opponent)
  }

  game.aiActive = false
  game.notify?.()
  if (game.phase === 'finished') return
  if (game.awaitingActive) {
    // 玩家前台阵亡：等其重新选择；选完后 chooseActiveInGame 结束盗罐行者的回合
    return
  }

  endAction(game, player.id)
  game.notify?.()
  scheduleAI(game)
}

/* ---------------- 现代最唐关卡 ---------------- */

function isTangPlayer(player: Player): boolean {
  return player.characters.some(
    (c) => c.id === DOUBAO_ID || c.id === NAIVA_ID || c.id === NAIDOU_ID,
  )
}

/** 唐笑：造成的伤害 +1 */
function tangxiaoBonus(character: Character | undefined): number {
  return character?.effects.some((e) => e.defId === 'tangxiao') ? 1 : 0
}

function tangCharacter(player: Player, id: string): Character | undefined {
  return player.characters.find((c) => c.id === id && c.alive)
}

/** 回合开始：死亡的豆包 / 奶蛙复活到 6 点生命 */
function reviveTangDead(player: Player): void {
  for (const character of player.characters) {
    if (character.id !== DOUBAO_ID && character.id !== NAIVA_ID) continue
    if (character.alive) continue
    character.alive = true
    character.hp = Math.min(6, character.maxHp)
    character.shield = 0
  }
}

/** 豆包 + 奶蛙 → 奶豆；生命为两者当前生命之和 +10 */
function fuseTang(player: Player): Character | null {
  const doubao = tangCharacter(player, DOUBAO_ID)
  const naiva = tangCharacter(player, NAIVA_ID)
  if (!doubao || !naiva) return null

  const naidou = toCharacter(NAIDOU_TEMPLATE)
  naidou.hp = Math.min(naidou.maxHp, doubao.hp + naiva.hp + 10)
  const index = player.characters.indexOf(doubao)
  player.characters = player.characters.filter((c) => c !== doubao && c !== naiva)
  player.characters.splice(Math.min(index, player.characters.length), 0, naidou)
  player.activeIndex = player.characters.indexOf(naidou)
  return naidou
}

/** 奶豆 → 豆包 + 奶蛙；两者生命各为奶豆当前生命的一半（向上取整） */
function splitTang(player: Player, naidou: Character): void {
  const half = Math.max(1, Math.ceil(naidou.hp / 2))
  const doubao = toCharacter(DOUBAO_TEMPLATE)
  doubao.hp = Math.min(doubao.maxHp, half)
  const naiva = toCharacter(NAIVA_TEMPLATE)
  naiva.hp = Math.min(naiva.maxHp, half)

  const index = player.characters.indexOf(naidou)
  if (index < 0) {
    player.characters.push(doubao, naiva)
    player.activeIndex = player.characters.indexOf(doubao)
    return
  }
  player.characters.splice(index, 1, doubao, naiva)
  player.activeIndex = index
}

function tangDoubaoNormal(game: Game, player: Player, opponent: Player): void {
  const doubao = tangCharacter(player, DOUBAO_ID)
  if (!doubao) return
  player.activeIndex = player.characters.indexOf(doubao)
  const front =
    liaoningVictim(opponent, player.id) ?? opponent.characters[opponent.activeIndex]
  if (front && front.alive) {
    damageCharacter(game, opponent, front, 5 + tangxiaoBonus(doubao), player.id)
  }
}

/** 战技：12 次随机 1 点弹射（双方角色），随后双方全体各 1 点 */
function tangDoubaoSKill(game: Game, player: Player): void {
  const doubao = tangCharacter(player, DOUBAO_ID)
  if (!doubao) return
  player.activeIndex = player.characters.indexOf(doubao)
  const bonus = tangxiaoBonus(doubao)

  for (let i = 0; i < 12; i += 1) {
    const pool = game.players
      .filter((p) => !p.eliminated)
      .flatMap((p) =>
        p.characters.filter((c) => c.alive).map((c) => ({ owner: p, character: c })),
      )
    if (pool.length === 0) break
    const pick = pool[Math.floor(Math.random() * pool.length)]
    damageCharacter(game, pick.owner, pick.character, 1 + bonus, player.id)
    if (game.phase === 'finished') return
  }

  for (const p of game.players) {
    if (p.eliminated) continue
    for (const character of [...p.characters]) {
      if (!character.alive) continue
      damageCharacter(game, p, character, 1 + bonus, player.id)
      if (game.phase === 'finished') return
    }
  }
}

function tangNaivaNormal(game: Game, player: Player, opponent: Player): void {
  const naiva = tangCharacter(player, NAIVA_ID)
  if (!naiva) return
  player.activeIndex = player.characters.indexOf(naiva)
  const bonus = tangxiaoBonus(naiva)
  const front =
    liaoningVictim(opponent, player.id) ?? opponent.characters[opponent.activeIndex]
  if (front && front.alive) {
    damageCharacter(game, opponent, front, 4 + bonus, player.id)
  }
  for (const character of opponent.characters) {
    if (!character.alive || character === front) continue
    damageCharacter(game, opponent, character, 2 + bonus, player.id)
    if (game.phase === 'finished') return
  }
}

/** 战技：场上双方所有角色获得唐笑，持续 2 回合 */
function tangNaivaSkill(game: Game, player: Player): void {
  const naiva = tangCharacter(player, NAIVA_ID)
  if (!naiva) return
  player.activeIndex = player.characters.indexOf(naiva)
  for (const p of game.players) {
    if (p.eliminated) continue
    for (const character of p.characters) {
      if (character.alive) applyEffect(character, 'tangxiao', 2)
    }
  }
}

function tangNaidouNormal(game: Game, player: Player, opponent: Player): void {
  const naidou = tangCharacter(player, NAIDOU_ID)
  if (!naidou) return
  player.activeIndex = player.characters.indexOf(naidou)
  const front =
    liaoningVictim(opponent, player.id) ?? opponent.characters[opponent.activeIndex]
  if (front && front.alive) {
    damageCharacter(game, opponent, front, 3 + tangxiaoBonus(naidou), player.id)
  }
  if (game.phase === 'finished') return

  // 目标不是唯一存活角色：强制对方随机一名后台上场
  const alive = opponent.characters.filter((c) => c.alive)
  if (alive.length > 1) {
    const current = opponent.characters[opponent.activeIndex]
    const backs = alive.filter((c) => c !== current)
    const pick = backs[Math.floor(Math.random() * backs.length)]
    opponent.activeIndex = opponent.characters.indexOf(pick)
    if (game.awaitingActive === opponent.id) game.awaitingActive = null
  }
}

/** 战技：对敌方全体造成 4 点伤害；若待解除合体，结算后变回豆包和奶蛙 */
function tangNaidouSkill(game: Game, player: Player, opponent: Player): void {
  const naidou = tangCharacter(player, NAIDOU_ID)
  if (!naidou) return
  player.activeIndex = player.characters.indexOf(naidou)
  const bonus = tangxiaoBonus(naidou)

  for (const character of [...opponent.characters]) {
    if (!character.alive) continue
    damageCharacter(game, opponent, character, 4 + bonus, player.id)
    if (game.phase === 'finished') return
  }

  if (naidou.splitPending && naidou.alive) {
    naidou.splitPending = false
    splitTang(player, naidou)
  }
}

/** 大招：自身获得奶蛙诅咒，敌方全体获得豆包诅咒，并标记下次战技后解除合体 */
function tangNaidouBurst(game: Game, player: Player, opponent: Player): void {
  const naidou = tangCharacter(player, NAIDOU_ID)
  if (!naidou) return
  player.activeIndex = player.characters.indexOf(naidou)
  applyEffect(naidou, 'frog-curse', 4)
  for (const character of opponent.characters) {
    if (character.alive) applyEffect(character, 'bean-curse', 2)
  }
  naidou.splitPending = true
}

/** 现代最唐的固定行动循环（第 1~5 回合循环） */
function runTangTurn(game: Game): void {
  if (game.aiSeat === null || game.aiActive) return
  game.aiActive = true

  const player = game.players[game.aiSeat]
  const opponent = game.players.find(
    (p) => p.seat !== game.aiSeat && !p.eliminated,
  )
  if (!opponent) {
    game.aiActive = false
    return
  }

  const slot = ((game.round - 1) % 5) + 1
  if (slot === 1) {
    tangDoubaoNormal(game, player, opponent)
    if (game.phase !== 'finished') tangDoubaoSKill(game, player)
  } else if (slot === 2) {
    tangNaivaNormal(game, player, opponent)
    if (game.phase !== 'finished') tangNaivaSkill(game, player)
  } else if (slot === 3) {
    let naidou = tangCharacter(player, NAIDOU_ID)
    if (!naidou) naidou = fuseTang(player) ?? undefined
    if (naidou) {
      tangNaidouNormal(game, player, opponent)
      if (game.phase !== 'finished') tangNaidouNormal(game, player, opponent)
      // 两次普攻后释放大招·光速道歉
      if (game.phase !== 'finished') tangNaidouBurst(game, player, opponent)
    }
  } else if (slot === 5) {
    tangNaidouSkill(game, player, opponent)
    // 第 5 回合的战技固定解除合体，变回豆包和奶蛙
    const remaining = tangCharacter(player, NAIDOU_ID)
    if (remaining) splitTang(player, remaining)
  }

  game.aiActive = false
  game.notify?.()
  if (game.phase === 'finished') return
  if (game.awaitingActive) {
    // 玩家前台阵亡：等其重新选择；选完后 chooseActiveInGame 结束电脑回合
    return
  }

  endAction(game, player.id)
  game.notify?.()
  scheduleAI(game)
}

/* ---------------- 电脑行动 ---------------- */

const AI_STEP_DELAY = 700

function scheduleAI(game: Game) {
  if (game.aiSeat === null) return
  setTimeout(() => maybeRunAI(game), 60)
}

function maybeRunAI(game: Game) {
  if (game.aiSeat === null) return
  if (game.phase !== 'action') return
  if (game.awaitingActive) return
  if (game.awaitingSharkTarget) return
  if (game.actionOrder[game.actionIndex] !== game.aiSeat) return
  if (game.aiActive) return

  // 盗罐行者关卡使用固定行动循环
  const aiPlayer = game.players[game.aiSeat]
  if (aiPlayer && isJarwalkerPlayer(aiPlayer)) {
    runJarwalkerTurn(game)
    return
  }
  if (aiPlayer && isTangPlayer(aiPlayer)) {
    runTangTurn(game)
    return
  }

  game.aiActive = true
  game.aiTurnIndex += 1
  // 第 1、3、5… 次行动：普攻 + 战技；第 2、4、6… 次：普攻 + 大招
  game.aiQueue = game.aiTurnIndex % 2 === 1 ? ['normal', 'skill'] : ['normal', 'burst']
  stepAI(game)
}

function stepAI(game: Game) {
  if (!game.aiActive) return
  if (game.phase !== 'action' || game.awaitingActive) return

  const kind = game.aiQueue.shift()
  if (!kind) {
    finishAITurn(game)
    return
  }

  const opponent = game.players.find((p) => p.seat !== game.aiSeat && !p.eliminated)
  if (!opponent) {
    finishAITurn(game)
    return
  }

  // 伤害取电脑当前前台角色的技能数值
  const aiPlayer = game.players[game.aiSeat]
  const active = aiPlayer.characters[aiPlayer.activeIndex]
  const damage = active?.skillSet?.[kind]?.damage ?? BLANK_SKILLS[kind].damage

  applyDamage(game, opponent, damage, aiPlayer.id)

  // 佩爹：电脑玩家是儿子时，使用技能后也要受到 2 点真实伤害
  if (aiPlayer.sonRounds > 0 && game.phase !== 'finished') {
    const actor = aiPlayer.characters[aiPlayer.activeIndex]
    if (actor && actor.alive) {
      hurtCharacter(game, aiPlayer, actor, 2, null, false, 2)
    }
  }

  game.notify?.()

  if (game.phase === 'finished') {
    game.aiActive = false
    return
  }
  // 玩家前台阵亡，等其重新选择后再继续
  if (game.awaitingActive) return
  // 鲨bee 放电等待玩家选目标：暂停电脑回合，选择后继续
  if (game.awaitingSharkTarget) return

  setTimeout(() => stepAI(game), AI_STEP_DELAY)
}

function finishAITurn(game: Game) {
  game.aiActive = false
  if (game.aiSeat === null) return

  const ai = game.players[game.aiSeat]
  if (!ai) return

  endAction(game, ai.id)
  game.notify?.()
  scheduleAI(game)
}

function endRound(game: Game) {
  game.phase = 'end'

  // 结束阶段：先按行动顺序结算状态效果，再结算配饰充能，最后清零未使用行动点
  triggerEndPhaseEffects(game)
  if (game.phase === 'finished') return
  triggerAccessoryEndPhase(game)
  triggerCouqieEndPhase(game)

  // 七彩亭：结束阶段之后复活被标记的角色
  resolvePendingRevives(game)

  // 佩爹：儿子的持续回合在每个结束阶段 -1
  for (const p of game.players) {
    if (!p.eliminated && p.sonRounds > 0) p.sonRounds -= 1
  }

  for (const p of game.players) p.ap = 0

  const alive = game.players.filter((p) => !p.eliminated)
  if (alive.length <= 1) {
    finishGame(game)
    return
  }

  startRound(game)
}

function maybeAdvanceSetup(game: Game) {
  if (game.phase === 'picking') {
    // 电脑按关卡阵容可能只有 1 名角色（盗罐行者），不要求凑满 3 名
    const done = game.players.every((p) =>
      p.id === 'ai' ? p.picked.length > 0 : p.picked.length === CHARACTERS_PER_PLAYER,
    )
    if (done) {
      materializeCharacters(game)
      game.phase = 'activeSelect'
    }
    return
  }

  if (game.phase === 'activeSelect') {
    const done = game.players.every((p) => p.activeChosen)
    if (done) startRound(game)
  }
}

export type ActionResult = { ok: true } | { ok: false; message: string }

export function pickCharacter(game: Game, playerId: string, characterId: string): ActionResult {
  if (game.phase !== 'picking') return { ok: false, message: '当前不是选择角色阶段' }

  const player = game.players.find((p) => p.id === playerId)
  if (!player) return { ok: false, message: '玩家不存在' }

  const entry = game.pool.find((c) => c.id === characterId)
  if (!entry) return { ok: false, message: '角色不存在' }

  const ownIndex = player.picked.indexOf(characterId)
  if (ownIndex >= 0) {
    player.picked.splice(ownIndex, 1)
    maybeAdvanceSetup(game)
    return { ok: true }
  }

  const takenByOther = game.players.some(
    (p) => p.id !== playerId && p.picked.includes(characterId),
  )
  if (takenByOther) return { ok: false, message: '该角色已被其他玩家选择' }

  if (player.picked.length >= CHARACTERS_PER_PLAYER) {
    return { ok: false, message: `最多选择 ${CHARACTERS_PER_PLAYER} 名角色` }
  }

  player.picked.push(characterId)
  maybeAdvanceSetup(game)
  return { ok: true }
}

export function chooseActive(game: Game, playerId: string, index: number): ActionResult {
  if (game.phase !== 'activeSelect') return { ok: false, message: '当前不是选择前台阶段' }

  const player = game.players.find((p) => p.id === playerId)
  if (!player) return { ok: false, message: '玩家不存在' }
  if (index < 0 || index >= player.characters.length) {
    return { ok: false, message: '角色序号无效' }
  }

  player.activeIndex = index
  player.activeChosen = true
  maybeAdvanceSetup(game)
  return { ok: true }
}

/** 前台阵亡后重新指定前台 */
export function chooseActiveInGame(
  game: Game,
  playerId: string,
  index: number,
): ActionResult {
  if (game.awaitingActive !== playerId) {
    return { ok: false, message: '当前不需要选择前台' }
  }

  const player = game.players.find((p) => p.id === playerId)
  if (!player) return { ok: false, message: '玩家不存在' }

  const character = player.characters[index]
  if (!character || !character.alive) {
    return { ok: false, message: '该角色已阵亡，不能选为前台' }
  }

  player.activeIndex = index
  game.awaitingActive = null

  // 电脑的行动曾被这次选择打断，继续执行
  if (game.aiActive) {
    if (game.aiQueue.length === 0) {
      setTimeout(() => finishAITurn(game), AI_STEP_DELAY)
    } else {
      setTimeout(() => stepAI(game), AI_STEP_DELAY)
    }
  } else if (game.aiSeat !== null) {
    // 盗罐行者的固定循环在前台阵亡时中断，选完新前台后补结束它的回合
    const aiPlayer = game.players[game.aiSeat]
    if (
      aiPlayer &&
      (isJarwalkerPlayer(aiPlayer) || isTangPlayer(aiPlayer)) &&
      game.actionOrder[game.actionIndex] === game.aiSeat
    ) {
      endAction(game, aiPlayer.id)
      game.notify?.()
      scheduleAI(game)
    }
  }

  return { ok: true }
}

function guardAction(game: Game, playerId: string): ActionResult | Player {
  if (game.phase !== 'action') return { ok: false, message: '当前不是行动阶段' }
  if (game.awaitingSharkTarget) {
    return { ok: false, message: '等待鲨bee选择放电目标' }
  }
  if (game.awaitingActive) return { ok: false, message: '等待选择新的前台角色' }
  if (game.awaitingFieldReplace) return { ok: false, message: '先选择要替换掉的场地牌' }
  if (game.awaitingAccessoryReplace) return { ok: false, message: '先选择要替换掉的配饰牌' }
  if (game.awaitingAllyTarget) return { ok: false, message: '先选择我方目标角色' }

  const player = game.players.find((p) => p.id === playerId)
  if (!player) return { ok: false, message: '玩家不存在' }
  if (player.eliminated) return { ok: false, message: '你已退出对局' }

  const currentSeat = game.actionOrder[game.actionIndex]
  if (currentSeat !== player.seat) return { ok: false, message: '还没轮到你行动' }

  return player
}

/**
 * 打出一张牌。技能牌结算完成后，若出牌方是「儿子」，
 * 使用的角色要对自身受到 2 点真实伤害。
 */
export function playCard(
  game: Game,
  playerId: string,
  cardId: string,
  targetPlayerId?: string,
  targetCharacterId?: string,
): ActionResult {
  const player = game.players.find((p) => p.id === playerId)
  const handCard = player?.hand.find((c) => c.id === cardId)
  const isSkillCard =
    handCard?.kind === 'normal' ||
    handCard?.kind === 'skill' ||
    handCard?.kind === 'burst'

  const result = playCardInner(game, playerId, cardId, targetPlayerId, targetCharacterId)

  if (
    result.ok &&
    isSkillCard &&
    player &&
    player.sonRounds > 0 &&
    game.phase !== 'finished'
  ) {
    const actor = player.characters[player.activeIndex]
    if (actor && actor.alive) {
      hurtCharacter(game, player, actor, 2, null, false, 2)
    }
  }

  return result
}

/**
 * 打出一张技能牌。卡牌只决定技能类型，消耗与效果取当前前台角色的技能定义。
 */
function playCardInner(
  game: Game,
  playerId: string,
  cardId: string,
  targetPlayerId?: string,
  targetCharacterId?: string,
): ActionResult {
  const guarded = guardAction(game, playerId)
  if ('ok' in guarded) return guarded
  const player = guarded

  const handIndex = player.hand.findIndex((c) => c.id === cardId)
  if (handIndex < 0) return { ok: false, message: '手牌中没有这张牌' }

  const card = player.hand[handIndex]
  const active = player.characters[player.activeIndex]
  if (!active || !active.alive) return { ok: false, message: '前台角色无法行动' }

  const cardDef = CARD_LIBRARY.find((d) => d.defId === card.defId)

  // 烤冷面：我方没有阵亡角色时不能打出
  if (cardDef?.effect.type === 'reviveAlly') {
    if (!player.characters.some((c) => !c.alive)) {
      return { ok: false, message: '我方没有阵亡角色，无法打出' }
    }
  }

  // 希沃白板游戏：没有后台存活角色时不能打出
  if (cardDef?.effect.type === 'shieldAlly' && cardDef.effect.backlineOnly) {
    const hasBackline = player.characters.some(
      (c, index) => index !== player.activeIndex && c.alive,
    )
    if (!hasBackline) {
      return { ok: false, message: '我方没有后台角色，无法打出' }
    }
  }

  const isSkillCard =
    card.kind === 'normal' || card.kind === 'skill' || card.kind === 'burst'
  let skill = isSkillCard ? active.skillSet[card.kind] : null

  // 奥斯卡小金马：小丑达到 3 层即可强化普攻，打出时消耗 3 层
  let enhancedClownCost = 0
  if (skill && card.kind === 'normal' && active.talentId === 'oscar') {
    const clown = active.effects.find((e) => e.defId === 'clown')?.stacks ?? 0
    if (clown >= 4) {
      skill = {
        ...skill,
        name: '强化普攻·我是小丑',
        damage: skill.damage + 2,
        healAll: 2,
        healSelf: 1,
      }
      enhancedClownCost = 4
    }
  }

  // OP：持有米卫兵时普攻强化，每次消耗 1 层
  let mihoCost = 0
  const miho = active.effects.find((e) => e.defId === 'miho')
  if (skill && card.kind === 'normal' && miho && miho.stacks > 0) {
    skill = {
      ...skill,
      name: '强化普攻·OP之怒',
      cost: Math.max(0, skill.cost - 1),
      damage: skill.damage + 2,
      hitHighestBack: 1,
      healSelfOnHit: active.hp < 8 ? 2 : 0,
    }
    mihoCost = 1
  }

  let baseCost = isSkillCard ? (skill?.cost ?? 0) : card.cost

  // 凑企厄：大招的永久减费
  if (isSkillCard && card.kind === 'burst' && active.id === 'char-couqie' && !active.godForm) {
    baseCost = Math.max(0, baseCost - active.burstCostDiscount)
  }

  // 凑企厄·死星：毁伤超过阈值时本次战技强化，消耗全部层数
  let ruinBurst = false
  if (skill?.consumeStacksBurst) {
    const stacks =
      active.effects.find((e) => e.defId === skill!.consumeStacksBurst!.defId)?.stacks ?? 0
    ruinBurst = stacks > skill.consumeStacksBurst.threshold
  }

  // OP 天赋：低血量时大招费用降低（-0/-1/-1）
  if (isSkillCard && card.kind === 'burst' && active.talentId === 'op' && active.hp <= 10) {
    baseCost = Math.max(0, baseCost - 1)
  }

  // U：教鞭长度强化普攻（伤害与费用），魔音使下一次普攻翻倍
  const whipEffect = active.effects.find((e) => e.defId === 'whip-length')
  const whipSegments = Math.max(1, Math.min(3, whipEffect?.stacks ?? 1))
  const isUNormal = active.id === 'char-u' && card.kind === 'normal'
  const whipBonus = isUNormal ? (whipSegments >= 3 ? 6 : whipSegments === 2 ? 3 : 0) : 0
  const whipCostCut = isUNormal ? (whipSegments >= 3 ? 2 : whipSegments === 2 ? 1 : 0) : 0
  const whipDouble =
    isUNormal && active.effects.some((e) => e.defId === 'whip-double')
  if (isUNormal) baseCost = Math.max(0, baseCost - whipCostCut)

  // U·连续惩罚：普攻后的下一次战技 -1 费，并在消耗后返还该技能牌
  const comboReturn =
    Boolean(skill) && card.kind === 'skill' && active.id === 'char-u' && active.uCombo
  if (comboReturn) baseCost = Math.max(0, baseCost - 1)

  // OP 天赋：低血量时造成的伤害提升
  const opDamage =
    isSkillCard && active.talentId === 'op'
      ? active.hp <= 5
        ? 3
        : active.hp <= 10
          ? 2
          : active.hp <= 15
            ? 1
            : 0
      : 0

  // 场地减费：每回合有次数上限，本次出牌消耗掉对应场地的次数
  let discount = 0
  const discountFieldIds: string[] = []
  if (isSkillCard) {
    // 同类场地可叠加，各自消耗次数
    for (const field of player.fields) {
      const def = CARD_LIBRARY.find((d) => d.defId === field.defId)
      if (!def || def.effect.type !== 'skillDiscount') continue
      if ((player.fieldUses[field.id] ?? 0) >= def.effect.usesPerRound) continue
      discount += def.effect.amount
      discountFieldIds.push(field.id)
    }
  } else {
    // 八中食堂：非技能手牌减费，多张可叠加并各自消耗次数
    for (const field of player.fields) {
      const def = CARD_LIBRARY.find((d) => d.defId === field.defId)
      if (!def || def.effect.type !== 'drawAndNonSkillDiscount') continue
      if ((player.fieldUses[field.id] ?? 0) >= def.effect.usesPerRound) continue
      discount += def.effect.discount
      discountFieldIds.push(field.id)
    }
  }
  // 薯条：只对本身花费大于 0 的技能生效
  const itemDiscount = isSkillCard && baseCost > 0 ? player.skillCostDiscount : 0
  // 冰红茶：本回合内的技能加成，用一次扣一次
  const soda = isSkillCard && player.soda?.round === game.round ? player.soda : null
  const sodaDiscount = soda ? soda.discount : 0
  let cost = Math.max(0, baseCost - discount - itemDiscount - sodaDiscount)

  // 元旦晚会：本回合所有玩家的非技能手牌花费 +N
  if (!isSkillCard && game.nonSkillTaxRound === game.round) {
    cost += game.nonSkillTaxAmount
  }

  // 饭卡：打出道具牌不消耗行动点，每张卡装备后可用一次
  let mealCardForFree: CardInfo | null = null
  if (card.kind === 'item' && cost > 0) {
    const accessory = player.accessories.find((a) => {
      const def = CARD_LIBRARY.find((d) => d.defId === a.defId)
      return def?.effect.type === 'mealCard' && !a.used
    })
    if (accessory) {
      mealCardForFree = accessory
      cost = 0
    }
  }

  if (player.ap < cost) {
    return { ok: false, message: `行动点不足（需要 ${cost}，当前 ${player.ap}）` }
  }

  // 群体技能、己方目标技能与纯自身增益技能不需要指定敌方目标
  const needsTarget = Boolean(
    skill &&
      (!skill.hitAll || skill.hitAllTarget) &&
      !skill.hitAllFronts &&
      !skill.targetAlly &&
      (skill.damage > 0 ||
        skill.hitAllTarget ||
        skill.disorderAll ||
        skill.targetEffect ||
        skill.targetStack ||
        skill.stripBuff ||
        skill.discardEquipments ||
        skill.triggerEndDots ||
        skill.applySon),
  )
  let target: Player | null = null
  if (needsTarget) {
    const opponents = game.players.filter((p) => p.id !== playerId && !p.eliminated)

    if (targetPlayerId) {
      target = game.players.find((p) => p.id === targetPlayerId) ?? null
      if (!target || target.eliminated || target.id === playerId) {
        return { ok: false, message: '目标无效' }
      }
    } else if (opponents.length === 1) {
      target = opponents[0]
    } else {
      return { ok: false, message: '请选择目标角色' }
    }
  }

  // 佩爹：同时最多附属 2 名玩家；对已经是儿子的目标再次使用只刷新持续时间
  if (skill?.applySon && target) {
    const sonCount = game.players.filter(
      (p) => !p.eliminated && p.sonRounds > 0,
    ).length
    if (target.sonRounds <= 0 && sonCount >= 2) {
      return { ok: false, message: '同时最多只能有 2 名儿子' }
    }
  }

  player.ap -= cost
  if (mealCardForFree) mealCardForFree.used = true
  player.hand.splice(handIndex, 1)

  // U：消耗「魔音强化」与「连续惩罚」状态；战技增加教鞭长度
  if (whipDouble) spendStacks(active, 'whip-double', 1)
  if (comboReturn) active.uCombo = false
  if (active.id === 'char-u' && card.kind === 'skill') {
    applyEffect(active, 'whip-length', 1)
  }

  // 中央框保留最近打出的一张牌
  game.lastPlay = {
    playerId: player.id,
    playerName: player.sonRounds > 0 ? `儿子-${player.name}` : player.name,
    card,
    cost,
    damage: skill?.damage ?? 0,
    description: skill?.description ?? cardDef?.description ?? card.description,
  }

  // 大佐·恶臭：我方角色使用技能后治疗大佐（在技能结算前触发，本回合最多 2 次）
  if (isSkillCard) triggerStenchHeal(game, player)

  // 薯条生效后清零
  if (itemDiscount > 0) player.skillCostDiscount = 0

  // 冰红茶消耗一次
  if (soda) {
    soda.charges -= 1
    if (soda.charges <= 0) player.soda = null
  }

  // 记录场地牌的减费消耗次数
  for (const id of discountFieldIds) {
    player.fieldUses[id] = (player.fieldUses[id] ?? 0) + 1
  }

  // 强化普攻的额外消耗，确认能打出之后再扣
  if (enhancedClownCost > 0) {
    spendStacks(active, 'clown', enhancedClownCost)
  }
  if (mihoCost > 0) {
    spendStacks(active, 'miho', mihoCost)
  }
  if (skill?.reduceBurstCost) {
    active.burstCostDiscount += skill.reduceBurstCost
  }

  // 场地牌：装备到场地槽，槽满则进入替换流程
  if (card.kind === 'field') {
    if (player.fields.length < MAX_FIELDS) {
      player.fields.push(card)
    } else {
      player.pendingFieldCard = card
      game.awaitingFieldReplace = player.id
    }
    return { ok: true }
  }

  // 配饰牌：与场地牌相同的装备流程，独立两个槽位
  if (card.kind === 'accessory') {
    const accessoryDef = CARD_LIBRARY.find((d) => d.defId === card.defId)
    // 饭卡每次装备后刷新一次免费道具机会
    if (accessoryDef?.effect.type === 'mealCard') card.used = false
    if (player.accessories.length < MAX_ACCESSORIES) {
      player.accessories.push(card)
    } else {
      player.pendingAccessoryCard = card
      game.awaitingAccessoryReplace = player.id
    }
    return { ok: true }
  }

  // 运动会 / U·连续惩罚：技能牌打出后返还，不进入弃牌堆
  const returnSkill = Boolean(skill) && (player.sportsReturns > 0 || comboReturn)
  if (!returnSkill) game.discard.push(card)

  // 道具 / 事件 / 空白牌：直接结算后进弃牌堆，没有战斗步骤
  if (!skill) {
    const def = cardDef
    // 需要选己方目标的手牌：等玩家点选角色后再结算
    if (
      def?.effect.type === 'healAlly' ||
      def?.effect.type === 'reviveAlly' ||
      def?.effect.type === 'shieldAlly'
    ) {
      game.awaitingAllyTarget = player.id
      game.pendingAllyCard = def.effect
    }
    // 免费汤：给下一次技能攻击挂伤害加成（重复使用只刷新，不叠加）
    if (def?.effect.type === 'nextSkillDamage') {
      player.skillDamageBonus = def.effect.amount
    }
    // 薯条：给下一次花费大于 0 的技能挂减费（重复使用只刷新，不叠加）
    if (def?.effect.type === 'nextSkillDiscount') {
      player.skillCostDiscount = def.effect.amount
    }
    // 鸡腿饭：给我方全体存活角色挂状态
    if (def?.effect.type === 'grantAllAllies') {
      for (const c of player.characters) {
        if (c.alive) applyEffect(c, def.effect.defId, def.effect.stacks)
      }
    }
    // 冰红茶：本回合内的技能加成（重复使用只刷新次数）
    if (def?.effect.type === 'roundSkillBoost') {
      player.soda = {
        charges: def.effect.charges,
        damage: def.effect.damage,
        discount: def.effect.discount,
        round: game.round,
      }
    }
    // 大劲凉：受到攻击时的回复与摸牌（重复使用只刷新次数）
    if (def?.effect.type === 'healOnAttacked') {
      player.coolSips = {
        charges: def.effect.charges,
        heal: def.effect.heal,
        draw: def.effect.draw,
      }
    }
    // 事件·抛物线！：延长我方所有角色身上可延长的状态效果
    if (def?.effect.type === 'extendEffects') {
      for (const character of player.characters) {
        for (const effect of character.effects) {
          const info = EFFECT_MAP[effect.defId]
          if (!info?.extendable) continue
          effect.stacks += def.effect.amount
        }
      }
    }
    // 事件·阿米诺斯：我方伤害 +1 / 受伤 +1，直到下一次行动开始
    if (def?.effect.type === 'aminoAura') {
      player.aminoActive = true
    }
    // 事件·歌手大赛：每个我方角色随机清除 1 个负面效果
    if (def?.effect.type === 'cleanseDebuffs') {
      for (const character of player.characters) {
        for (let i = 0; i < def.effect.count; i += 1) {
          const debuffs = character.effects.filter(
            (effect) =>
              EFFECT_MAP[effect.defId]?.polarity === 'debuff' &&
              effect.defId !== 'bean-curse',
          )
          if (debuffs.length === 0) break
          const pick = debuffs[Math.floor(Math.random() * debuffs.length)]
          const index = character.effects.indexOf(pick)
          if (index >= 0) character.effects.splice(index, 1)
        }
      }
    }
    // 事件·运动会：本次行动内返还技能牌
    if (def?.effect.type === 'skillReturn') {
      player.sportsReturns += def.effect.charges
    }
    // 事件·公开课：下一回合所有玩家禁止主动切换角色
    if (def?.effect.type === 'banSwitchNextRound') {
      game.noSwitchRound = game.round + 1
    }
    // 事件·颁奖仪式：摸牌
    if (def?.effect.type === 'drawCards') {
      ensureDeck(game, def.effect.count)
      for (let i = 0; i < def.effect.count; i += 1) {
        const drawn = game.deck.shift()
        if (drawn) player.hand.push(drawn)
      }
    }
    // 事件·元旦晚会：下一回合所有玩家的非技能手牌花费 +N
    if (def?.effect.type === 'nonSkillTaxNextRound') {
      const nextRound = game.round + 1
      if (game.nonSkillTaxRound === nextRound) {
        game.nonSkillTaxAmount += def.effect.amount
      } else {
        game.nonSkillTaxRound = nextRound
        game.nonSkillTaxAmount = def.effect.amount
      }
    }
    // 饭卡：行动阶段打出道具牌后回复生命最低的角色
    if (card.kind === 'item') triggerMealCardHeal(game, player)
    return { ok: true }
  }

  // 己方目标技能：费用已付，等玩家点选我方角色后再结算
  if (skill.targetAlly) {
    game.awaitingAllyTarget = player.id
    game.pendingAllySkill = skill
    if (returnSkill) {
      if (!comboReturn && player.sportsReturns > 0) player.sportsReturns -= 1
      player.hand.push(card)
    }
    return { ok: true }
  }

  // 凑企厄·爱上雷神：永久变身为神厄形态
  if (skill.transformGod) {
    active.godForm = true
    active.maxHp += 6
    applyHeal(game, player, active, 6)
    active.artId = 'couqie-god'
    active.skillSet = {
      normal: { ...GOD_SKILLS.normal },
      skill: { ...GOD_SKILLS.skill },
      burst: { ...GOD_SKILLS.burst },
    }
    active.skills = [active.skillSet.normal, active.skillSet.skill].map((s) => ({
      name: s.name,
      cost: s.cost,
      description: s.description,
    }))
    if (returnSkill) {
      if (!comboReturn && player.sportsReturns > 0) player.sportsReturns -= 1
      player.hand.push(card)
    }
    return { ok: true }
  }

  // 佩爹·大低能：延长所有儿子的持续时间，并对儿子玩家的所有角色造成真实伤害
  if (skill.sonBurst) {
    const cfg = skill.sonBurst
    for (const targetPlayer of game.players) {
      if (targetPlayer.eliminated || targetPlayer.sonRounds <= 0) continue

      targetPlayer.sonRounds += cfg.extend
      for (const character of targetPlayer.characters) {
        if (!character.alive) continue
        damageCharacter(game, targetPlayer, character, cfg.damage, playerId, cfg.damage)
        if (game.phase === 'finished') return { ok: true }
      }
    }
  }

  // 扑克：我方每回合第一次造成伤害的技能，最终伤害视为真实伤害
  let pokerTrue = false
  if (skill.damage > 0 && player.pokerRound !== game.round) {
    const hasPoker = player.accessories.some((accessory) => {
      const def = CARD_LIBRARY.find((d) => d.defId === accessory.defId)
      return def?.effect.type === 'firstDamageTrue'
    })
    if (hasPoker) {
      pokerTrue = true
      player.pokerRound = game.round
    }
  }

  // 场地增伤：一次技能只消耗 1 次次数，群体伤害对每个命中目标都生效
  let damageBonus = 0
  if (skill.damage > 0 || skill.hitAll) {
    for (const field of player.fields) {
      const def = CARD_LIBRARY.find((d) => d.defId === field.defId)
      if (!def || def.effect.type !== 'damageBonus') continue
      if ((player.fieldUses[field.id] ?? 0) >= def.effect.usesPerRound) continue
      damageBonus = def.effect.amount
      player.fieldUses[field.id] = (player.fieldUses[field.id] ?? 0) + 1
      break
    }
  }

  // 免费汤：下一次造成伤害的技能攻击 +N，命中多个目标时各自生效
  let itemBonus = 0
  if (skill.damage > 0 || skill.hitAll) {
    itemBonus = player.skillDamageBonus
    player.skillDamageBonus = 0
  }

  // 冰红茶：本次技能伤害 +N，对每个命中目标生效
  const sodaDamage = soda && (skill.damage > 0 || skill.hitAll) ? soda.damage : 0

  // 足球：切换到前台后的下一次伤害技能 +2，消耗 1 层
  let footballBonus = 0
  if (skill.damage > 0 || skill.hitAll) {
    const football = active.effects.find((e) => e.defId === 'football')
    if (football && football.stacks > 0) {
      footballBonus = 2
      spendStacks(active, 'football', 1)
    }
  }

  // 阿米诺斯：我方角色造成的伤害 +1
  const aminoBonus = player.aminoActive ? 1 : 0

  if (skill) {
    const opponents = game.players.filter((p) => p.id !== playerId && !p.eliminated)

    // 悍匪之怒：普攻 +2 / 战技 +3；记录攻击前敌方存活角色，用于击倒延长判定
    const hanfeiRage =
      active.id === 'char-hanfei'
        ? active.effects.find((e) => e.defId === 'hanfei-rage')
        : undefined
    const hanfeiBonus = hanfeiRage
      ? card.kind === 'normal'
        ? 2
        : card.kind === 'skill'
          ? 3
          : 0
      : 0
    const hanfeiWatch = hanfeiRage
      ? opponents.flatMap((p) =>
          p.characters.filter((c) => c.alive).map((c) => c),
        )
      : []

    // 充能天赋：满 3 层时本次攻击额外造成 2 点真实伤害
    let trueBonus = 0
    if (skill.damage > 0) {
      const chargeHolder = findChargeCharacter(player)
      const charge = chargeHolder?.effects.find((e) => e.defId === 'charge')
      if (chargeHolder && charge && charge.stacks >= 3) {
        spendStacks(chargeHolder, 'charge', 3)
        trueBonus = 2
      }
    }

    // 消耗类效果：先结算消耗，再算伤害与附加效果
    let rageBonus = 0
    if (skill.consume) {
      const rageIndex = active.effects.findIndex((e) => e.defId === skill.consume.defId)
      const rage = rageIndex >= 0 ? active.effects[rageIndex].stacks : 0
      rageBonus = rage * skill.consume.damagePerStack

      if (skill.consume.extraEffect && target) {
        const overflow = rage - skill.consume.overflowThreshold
        if (overflow > 0) {
          const turns = Math.min(skill.consume.extraEffect.maxStacks, overflow)
          const victim = target.characters[target.activeIndex]
          if (victim && victim.alive) {
            grantEffect(game, target, victim, skill.consume.extraEffect.defId, turns, playerId)
          }
        }
      }

      if (rageIndex >= 0) active.effects.splice(rageIndex, 1)
    }

    // 战技·死星：消耗全部毁伤层数，每层对随机敌人造成 1 点伤害（不吃加成）。
    // 随机伤害与随后的全体伤害合并为「该次攻击」一次结算：每个角色先加总无减伤伤害，
    // 再整体减去一次自身减伤值，避免每段 1 点都被减伤吃掉。
    let ruinRandomCounts: Map<Character, number> | null = null
    if (ruinBurst && skill.consumeStacksBurst) {
      const cfg = skill.consumeStacksBurst
      const stacks = active.effects.find((e) => e.defId === cfg.defId)?.stacks ?? 0
      spendStacks(active, cfg.defId, stacks)
      ruinRandomCounts = new Map()

      for (let i = 0; i < stacks; i += 1) {
        const pool = opponents.flatMap((opponent) =>
          opponent.characters
            .filter((character) => character.alive)
            .map((character) => ({ opponent, character })),
        )
        if (pool.length === 0) break
        const pick = pool[Math.floor(Math.random() * pool.length)]
        ruinRandomCounts.set(
          pick.character,
          (ruinRandomCounts.get(pick.character) ?? 0) + cfg.randomDamage,
        )
      }
    }

    // 高玩·纯屎孩子：对所有玩家的前台角色造成伤害（含我方前台）
    if (skill.hitAllFronts) {
      const frontDamage =
        skill.hitAllFronts +
        tangxiaoBonus(active) +
        damageBonus +
        itemBonus +
        sodaDamage +
        opDamage +
        footballBonus +
        aminoBonus
      const hitOpponents = new Set<Player>()

      for (const targetPlayer of game.players) {
        if (targetPlayer.eliminated) continue
        const front =
          liaoningVictim(targetPlayer, playerId) ??
          targetPlayer.characters[targetPlayer.activeIndex]
        if (!front || !front.alive) continue

        const hit = damageCharacter(
          game,
          targetPlayer,
          front,
          frontDamage,
          playerId,
          pokerTrue ? frontDamage : trueBonus,
        )
        if (hit && targetPlayer.id !== playerId) hitOpponents.add(targetPlayer)
        if (game.phase === 'finished') return { ok: true }
      }

      for (const opponent of hitOpponents) {
        triggerLowbrowFollowUp(game, player, opponent)
        if (game.phase === 'finished') return { ok: true }
      }
    }

    if (skill.hitAll) {
      // 群体伤害：对每个敌方角色的伤害单独计算。
      // hitAllTarget 只命中玩家选定的那一方全体（悍匪大招）。
      const hitTargets = skill.hitAllTarget && target ? [target] : opponents
      const hitMap = new Map<Player, Character[]>()
      for (const opponent of hitTargets) {
        const hits: Character[] = []
        for (const character of opponent.characters) {
          if (!character.alive) continue

          let damage =
            skill.damage +
            tangxiaoBonus(active) +
            trueBonus +
            damageBonus +
            itemBonus +
            sodaDamage +
            opDamage +
            footballBonus +
            aminoBonus
          if (skill.damagePerDebuff) {
            const debuffs = character.effects.filter(
              (e) => EFFECT_MAP[e.defId]?.polarity === 'debuff',
            ).length
            damage += Math.min(
              skill.damagePerDebuff.max,
              debuffs * skill.damagePerDebuff.amount,
            )
          }
          // 死星：该角色在本轮随机命中中累计的伤害，与全体伤害合并结算
          if (ruinRandomCounts) damage += ruinRandomCounts.get(character) ?? 0
          const hit = damageCharacter(
            game,
            opponent,
            character,
            damage,
            playerId,
            pokerTrue
              ? damage
              : Math.min(damage, trueBonus + (skill.trueDamage ?? 0)),
          )
          // 被闪避的攻击不计入「命中」，大劲凉的回复也只算真正命中的角色
          if (hit) {
            hits.push(character)
            // 战技·黎明：每命中一个目标获得毁伤（死星形态不获得）
            if (!ruinBurst && skill.selfEffectPerHit && active.alive) {
              applyEffect(active, skill.selfEffectPerHit.defId, skill.selfEffectPerHit.stacks)
            }
          }
        }
        if (hits.length > 0) hitMap.set(opponent, hits)
      }

      // 大劲凉 / 贴纸：一次群体攻击对每个被命中的玩家只触发 1 次
      for (const [opponent, hits] of hitMap) {
        triggerCoolSip(game, opponent, hits)
        triggerSticker(game, opponent)
      }

      // 高玩·低能：群体技能对每个被命中的敌方玩家各发动一次追加攻击
      if (skill.damage > 0) {
        for (const opponent of hitMap.keys()) {
          triggerLowbrowFollowUp(game, player, opponent)
          if (game.phase === 'finished') return { ok: true }
        }
      }

      // 小卡片：群体攻击优先标记前台
      if (player.smallCards > 0 && skill.damage > 0) {
        for (const opponent of hitTargets) {
          const front = opponent.characters[opponent.activeIndex]
          if (!front || !front.alive) continue
          if (front.effects.some((e) => e.defId === 'mark')) continue
          player.smallCards -= 1
          grantEffect(game, opponent, front, 'mark', 1, playerId)
          break
        }
      }
    } else if (target) {
      // 盗罐行者关卡：玩家可以选择任意敌方角色作为本次攻击的前台
      const chosenVictim = targetCharacterId
        ? target.characters.find(
            (character) => character.id === targetCharacterId && character.alive,
          )
        : null
      let victim = chosenVictim ?? target.characters[target.activeIndex]
      // 我是辽宁的：敌方攻击只能以杨云博为目标
      const forcedYang = liaoningVictim(target, playerId)
      if (forcedYang) victim = forcedYang

      // 白白·稳态失衡：目标玩家全体附属紊乱
      if (skill.disorderAll) {
        for (const character of [...target.characters]) {
          if (!character.alive) continue
          grantEffect(game, target, character, 'disorder', skill.disorderAll, playerId)
          if (game.phase === 'finished') return { ok: true }
        }
      }

      // 佩爹：把目标玩家标记为「儿子」；重复使用刷新持续时间
      if (skill.applySon) {
        target.sonRounds = skill.applySon
      }

      // 战技·禁令：命中前先随机解除目标一个正面效果
      if (skill.stripBuff && victim) stripRandomBuff(victim)

      const mainDamage =
        (skill.damage + whipBonus) * (whipDouble ? 2 : 1) +
        hanfeiBonus +
        tangxiaoBonus(active) +
        rageBonus +
        trueBonus +
        damageBonus +
        itemBonus +
        sodaDamage +
        opDamage +
        footballBonus +
        aminoBonus
      const hit = applyDamage(
        game,
        target,
        mainDamage,
        playerId,
        pokerTrue
          ? mainDamage
          : Math.min(mainDamage, trueBonus + (skill.trueDamage ?? 0)),
        victim,
      )

      // U：普攻造成伤害后教鞭长度重置；同时记录「连续惩罚」的普攻前置
      if (active.id === 'char-u' && card.kind === 'normal') {
        if (hit) resetWhipLength(active)
        active.uCombo = true
      }

      // 大母零：存在鲨bee时，普攻额外获得 2 点累积治疗
      if (active.id === 'char-damuling' && card.kind === 'normal') {
        addSharkCharges(game, player, 2)
      }

      // 悍匪之怒：普攻/战技对目标方所有后台角色各造成 1 点伤害
      if (hanfeiRage && victim && (card.kind === 'normal' || card.kind === 'skill')) {
        for (const character of [...target.characters]) {
          if (character === victim || !character.alive) continue
          damageCharacter(
            game,
            target,
            character,
            1 + tangxiaoBonus(active),
            playerId,
          )
          if (game.phase === 'finished') return { ok: true }
        }
      }

      if (skill.targetEffect && victim && victim.alive) {
        grantEffect(
          game,
          target,
          victim,
          skill.targetEffect.defId,
          skill.targetEffect.stacks,
          playerId,
          Boolean(skill.targetEffect.uniqueOnField),
        )
      }

      // 鸡汤：施加独立实例，不与其他毒鸡汤合并
      if (skill.targetStack && victim && victim.alive) {
        grantEffectInstance(
          game,
          target,
          victim,
          skill.targetStack.defId,
          skill.targetStack.stacks,
          playerId,
        )
      }

      // 大招·闪现没收：从目标所属玩家已装备的场地 / 配饰中随机弃置
      if (
        skill.discardEquipments &&
        (target.fields.length > 0 || target.accessories.length > 0)
      ) {
        const pool = [
          ...target.fields.map((card) => ({ card, kind: 'field' as const })),
          ...target.accessories.map((card) => ({ card, kind: 'accessory' as const })),
        ]
        for (let i = pool.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1))
          const temp = pool[i]
          pool[i] = pool[j]
          pool[j] = temp
        }
        for (const pick of pool.slice(0, skill.discardEquipments)) {
          if (pick.kind === 'field') {
            target.fields = target.fields.filter((c) => c.id !== pick.card.id)
          } else {
            target.accessories = target.accessories.filter((c) => c.id !== pick.card.id)
          }
          game.discard.push(pick.card)
        }
      }

      // 大招·闪现没收：立即触发目标身上结束阶段伤害效果，不消耗次数
      if (skill.triggerEndDots && victim && victim.alive) {
        for (const effect of [...victim.effects]) {
          if (!END_PHASE_DAMAGE_EFFECTS.has(effect.defId)) continue
          runEffectTrigger(game, target, victim, effect.defId)
          if (game.phase === 'finished' || !victim.alive) break
        }
      }

      // OP 强化普攻：额外打击目标方生命最高的后台角色（本次攻击视为后台的角色）
      if (skill.hitHighestBack && victim) {
        const backs = target.characters.filter(
          (c) => c !== victim && c.alive,
        )
        if (backs.length > 0) {
          const highest = backs.reduce((a, b) => (b.hp > a.hp ? b : a))
          const backDamage =
            skill.hitHighestBack + tangxiaoBonus(active) + opDamage + aminoBonus
          damageCharacter(
            game,
            target,
            highest,
            backDamage,
            playerId,
            pokerTrue ? backDamage : 0,
          )
        }
      }

      // OP 大招：对后台角色各造成伤害
      if (skill.hitAllBack) {
        for (const character of target.characters) {
          if (character === victim || !character.alive) continue
          const backDamage =
            skill.hitAllBack + tangxiaoBonus(active) + opDamage + aminoBonus
          damageCharacter(
            game,
            target,
            character,
            backDamage,
            playerId,
            pokerTrue ? backDamage : 0,
          )
        }
      }

      // OP 强化普攻：命中后回复自身
      if (skill.healSelfOnHit && active.alive) {
        applyHeal(game, player, active, skill.healSelfOnHit)
      }

      // 小卡片：攻击命中后标记目标（已有标记的不重复施加、不消耗）
      if (
        player.smallCards > 0 &&
        skill.damage > 0 &&
        victim &&
        victim.alive &&
        !victim.effects.some((e) => e.defId === 'mark')
      ) {
        player.smallCards -= 1
        grantEffect(game, target, victim, 'mark', 1, playerId)
      }

      // 高玩·低能：单体技能攻击敌方玩家后发动追加攻击
      if (skill.damage > 0) {
        triggerLowbrowFollowUp(game, player, target)
      }
    }

    // 治疗我方全体存活角色
    if (skill.healAll) {
      for (const c of player.characters) {
        if (!c.alive) continue
        applyHeal(game, player, c, skill.healAll)
      }
    }

    // 白白大招：治疗我方全体，并为每名角色随机解除 1 个负面效果；
    // 成功解除的角色本次额外治疗
    if (skill.cleanseHealAll) {
      const { heal, bonus } = skill.cleanseHealAll
      for (const c of player.characters) {
        if (!c.alive) continue
        const debuffs = c.effects.filter((effect) => {
          const info = EFFECT_MAP[effect.defId]
          return info?.polarity === 'debuff' && effect.defId !== 'bean-curse'
        })
        let extra = 0
        if (debuffs.length > 0) {
          const pick = debuffs[Math.floor(Math.random() * debuffs.length)]
          const index = c.effects.indexOf(pick)
          if (index >= 0) c.effects.splice(index, 1)
          extra = bonus
        }
        applyHeal(game, player, c, heal + extra)
      }
    }

    // 巨佬大招：摸牌
    if (skill.drawCards && skill.drawCards > 0) {
      ensureDeck(game, skill.drawCards)
      for (let i = 0; i < skill.drawCards; i += 1) {
        const drawn = game.deck.shift()
        if (drawn) player.hand.push(drawn)
      }
    }

    // 巨佬大招：巨佬 → PROMAX佬，并延长 1 回合（上限 3）
    if (skill.upgradeJulao) {
      const holder = player.characters.find(
        (c) =>
          c.alive &&
          c.effects.some((e) => e.defId === 'julao' || e.defId === 'promax'),
      )
      const effect = holder?.effects.find(
        (e) => e.defId === 'julao' || e.defId === 'promax',
      )
      if (effect) {
        effect.defId = 'promax'
        effect.stacks = Math.min(3, effect.stacks + 1)
      }
    }

    // 额外治疗自身（强化普攻 / OP 大招）
    if (skill.healSelf && active.alive) {
      let heal = skill.healSelf
      // OP 天赋：低血量时大招回复量提高（+1/+2/+3）
      if (active.talentId === 'op') {
        if (active.hp <= 5) heal += 3
        else if (active.hp <= 10) heal += 2
        else if (active.hp <= 15) heal += 1
      }
      applyHeal(game, player, active, heal)
    }

    // 扣除自身生命，最低保留 1 点
    if (skill.selfHpLoss && active.alive) {
      active.hp = Math.max(1, active.hp - skill.selfHpLoss)
    }

    // 苑长：召唤文明标兵
    if (skill.summon && active.alive) {
      const def = SUMMONS[skill.summon.defId]
      if (def) {
        const existing = player.summons.find((s) => s.defId === skill.summon!.defId)
        if (existing) {
          if (skill.summon.hp !== undefined) {
            // 初一小孩：重新召唤时刷新特殊生命
            existing.hp = skill.summon.hp
          } else if (skill.summon.uses !== undefined) {
            // 干儿子：重新召唤时刷新可用次数
            existing.uses = skill.summon.uses
          } else {
            existing.taunt = Math.min(5, existing.taunt + skill.summon.taunt)
          }
        } else {
          summonSeq += 1
          player.summons.push({
            id: `summon-${summonSeq}`,
            defId: skill.summon.defId,
            name: def.name,
            artId: def.artId,
            description: def.description,
            taunt: Math.min(5, skill.summon.taunt),
            uses: skill.summon.uses,
            hp: skill.summon.hp,
          })
        }
      }
    }

    // 小卡片：我方获得层数
    if (skill.gainSmallCards) {
      player.smallCards += skill.gainSmallCards
    }

    // 大母零：召唤 / 移除鲨bee
    if (skill.sharkBee) {
      const existing = findShark(player)
      if (skill.sharkBee.mode === 'toggle') {
        if (!existing) {
          summonShark(player, 0)
        } else if ((existing.charges ?? 0) >= 1) {
          triggerSharkDischarge(game, player)
        }
      } else if (existing) {
        existing.charges = Math.min(
          SHARK_MAX_CHARGES,
          (existing.charges ?? 0) + skill.sharkBee.charge,
        )
        triggerSharkDischarge(game, player)
      } else {
        summonShark(player, skill.sharkBee.charge)
      }
    }

    // 使用后给自身叠加效果（怒气 / 小丑 / 海王等）
    if (skill.selfEffect && active.alive) {
      applyEffect(active, skill.selfEffect.defId, skill.selfEffect.stacks)
    }
    if (skill.selfEffects && active.alive) {
      for (const effect of skill.selfEffects) {
        applyEffect(active, effect.defId, effect.stacks)
      }
    }

    // 悍匪之怒：普攻/战技击倒敌人时延长 1 回合，不超过 3 回合；
    // 每次释放大招后只能触发 1 次。
    if (
      active.id === 'char-hanfei' &&
      card.kind !== 'burst' &&
      !active.hanfeiRageUsed &&
      hanfeiWatch.length > 0 &&
      hanfeiWatch.some((c) => !c.alive)
    ) {
      const rage = active.effects.find((e) => e.defId === 'hanfei-rage')
      if (rage) {
        rage.stacks = Math.min(3, rage.stacks + 1)
        active.hanfeiRageUsed = true
      }
    }

    // 悍匪大招刷新「击倒延长」的可触发次数
    if (active.id === 'char-hanfei' && card.kind === 'burst') {
      active.hanfeiRageUsed = false
    }

    // 豆包诅咒：被诅咒的角色使用技能攻击后 -1，2 次后解除
    const beanCurse = active.effects.find((e) => e.defId === 'bean-curse')
    const isAttack =
      skill.damage > 0 ||
      Boolean(skill.hitAll) ||
      Boolean(skill.hitAllFronts) ||
      Boolean(skill.hitAllBack) ||
      Boolean(skill.hitHighestBack) ||
      Boolean(skill.consumeStacksBurst)
    if (beanCurse && isAttack) {
      beanCurse.stacks -= 1
      if (beanCurse.stacks <= 0) {
        const index = active.effects.indexOf(beanCurse)
        if (index >= 0) active.effects.splice(index, 1)
      }
    }
  }

  // 运动会：返还本次打出的技能牌
  if (returnSkill) {
    if (!comboReturn && player.sportsReturns > 0) player.sportsReturns -= 1
    player.hand.push(card)
  }

  return { ok: true }
}

/**
 * 己方目标技能：玩家点选一名我方角色后结算。
 * 目前只支持 targetEffect（给该角色挂状态）与 selfEffect（给施法者挂状态），
 * 其余数值效果等角色设计给出后再补。
 */
export function chooseAllyTarget(
  game: Game,
  playerId: string,
  characterId: string,
): ActionResult {
  if (game.phase !== 'action') return { ok: false, message: '当前不是行动阶段' }
  if (game.awaitingAllyTarget !== playerId) {
    return { ok: false, message: '当前没有待选择的己方目标' }
  }

  const player = game.players.find((p) => p.id === playerId)
  if (!player) return { ok: false, message: '玩家不存在' }

  const skill = game.pendingAllySkill
  const cardEffect = game.pendingAllyCard

  const chosen = player.characters.find((c) => c.id === characterId)
  if (!chosen) return { ok: false, message: '只能选择我方角色' }

  const isRevive = cardEffect?.type === 'reviveAlly'
  if (isRevive && chosen.alive) return { ok: false, message: '只能选择我方阵亡角色' }
  if (!isRevive && !chosen.alive) return { ok: false, message: '该角色已阵亡' }

  const active = player.characters[player.activeIndex]

  if (
    cardEffect?.type === 'shieldAlly' &&
    cardEffect.backlineOnly &&
    chosen === active
  ) {
    return { ok: false, message: '只能选择我方后台角色' }
  }

  if (cardEffect?.type === 'healAlly') {
    applyHeal(game, player, chosen, cardEffect.amount)
  }

  if (cardEffect?.type === 'shieldAlly') {
    chosen.shield += cardEffect.amount
  }

  if (cardEffect?.type === 'reviveAlly') {
    const index = player.characters.indexOf(chosen)
    chosen.alive = true
    chosen.hp = Math.min(chosen.maxHp, Math.max(1, cardEffect.hp))
    chosen.shield = 0
    chosen.immuneRound = game.round
    // 复活后若没有前台，由该角色顶上
    if (!player.characters[player.activeIndex]?.alive) player.activeIndex = index
  }

  if (skill) {
    if (skill.healTarget) applyHeal(game, player, chosen, skill.healTarget)
    if (skill.targetEffect) {
      // 巨佬 / PROMAX佬：同时只能存在 1 个，施加新状态前移除旧的
      if (skill.targetEffect.defId === 'julao') clearJulaoStatuses(player)
      grantEffect(
        game,
        player,
        chosen,
        skill.targetEffect.defId,
        skill.targetEffect.stacks,
        playerId,
        Boolean(skill.targetEffect.uniqueOnField),
      )
    }
    if (skill.selfEffect && active && active.alive) {
      applyEffect(active, skill.selfEffect.defId, skill.selfEffect.stacks)
    }
  }

  game.awaitingAllyTarget = null
  game.pendingAllySkill = null
  game.pendingAllyCard = null
  return { ok: true }
}

/** 主动换人：把一名后台存活角色换到前台，消耗 1 点行动点 */
export function switchActive(game: Game, playerId: string, index: number): ActionResult {
  const guarded = guardAction(game, playerId)
  if ('ok' in guarded) return guarded
  const player = guarded

  // 公开课：下一回合所有玩家不能主动切换角色
  if (game.round === game.noSwitchRound) {
    return { ok: false, message: '本回合禁止主动切换角色' }
  }

  if (index === player.activeIndex) {
    return { ok: false, message: '该角色已经是前台' }
  }

  const target = player.characters[index]
  if (!target) return { ok: false, message: '角色序号无效' }
  if (!target.alive) return { ok: false, message: '该角色已阵亡，不能上场' }
  if (player.ap < SWITCH_COST) {
    return { ok: false, message: `行动点不足（换人需要 ${SWITCH_COST} 点）` }
  }

  player.ap -= SWITCH_COST
  player.activeIndex = index

  // 足球：切换到前台的角色获得伤害加成，每装备一张各叠加一层
  for (const accessory of player.accessories) {
    const def = CARD_LIBRARY.find((d) => d.defId === accessory.defId)
    if (def?.effect.type === 'switchFrontBuff') {
      applyEffect(target, def.effect.defId, def.effect.stacks)
    }
  }

  // 操场：切换角色后按概率恢复行动点，多张场地分别判定
  for (const field of player.fields) {
    const def = CARD_LIBRARY.find((d) => d.defId === field.defId)
    if (!def || def.effect.type !== 'switchApRefund') continue
    if (Math.random() < def.effect.chance) player.ap += def.effect.amount
  }

  return { ok: true }
}

/** 弃牌换行动点：每弃一张 +1 */
export function discardCard(game: Game, playerId: string, cardId: string): ActionResult {
  const guarded = guardAction(game, playerId)
  if ('ok' in guarded) return guarded
  const player = guarded

  const handIndex = player.hand.findIndex((c) => c.id === cardId)
  if (handIndex < 0) return { ok: false, message: '手牌中没有这张牌' }

  const [card] = player.hand.splice(handIndex, 1)
  game.discard.push(card)
  player.ap += 1

  // 巨佬 / PROMAX佬：我方弃牌时治疗附属者
  const holder = player.characters.find(
    (c) =>
      c.alive &&
      c.effects.some((e) => e.defId === 'julao' || e.defId === 'promax'),
  )
  const buff = holder?.effects.find(
    (e) => e.defId === 'julao' || e.defId === 'promax',
  )
  if (holder && buff) {
    applyHeal(game, player, holder, buff.defId === 'promax' ? 2 : 1)
  }

  return { ok: true }
}

/** 场地已满时的替换：弃掉选中的场地牌，装备新场地 */
export function replaceField(
  game: Game,
  playerId: string,
  fieldCardId: string,
): ActionResult {
  if (game.awaitingFieldReplace !== playerId) {
    return { ok: false, message: '当前不需要替换场地牌' }
  }

  const player = game.players.find((p) => p.id === playerId)
  if (!player || !player.pendingFieldCard) {
    return { ok: false, message: '玩家不存在' }
  }

  const index = player.fields.findIndex((c) => c.id === fieldCardId)
  if (index < 0) return { ok: false, message: '该场地牌不存在' }

  const [removed] = player.fields.splice(index, 1)
  game.discard.push(removed)

  player.fields.push(player.pendingFieldCard)
  player.pendingFieldCard = null
  game.awaitingFieldReplace = null
  return { ok: true }
}

/** 配饰已满时的替换：弃掉选中的配饰牌，装备新配饰 */
export function replaceAccessory(
  game: Game,
  playerId: string,
  cardId: string,
): ActionResult {
  if (game.awaitingAccessoryReplace !== playerId) {
    return { ok: false, message: '当前不需要替换配饰牌' }
  }

  const player = game.players.find((p) => p.id === playerId)
  if (!player || !player.pendingAccessoryCard) {
    return { ok: false, message: '玩家不存在' }
  }

  const index = player.accessories.findIndex((c) => c.id === cardId)
  if (index < 0) return { ok: false, message: '该配饰牌不存在' }

  const [removed] = player.accessories.splice(index, 1)
  game.discard.push(removed)

  const pending = player.pendingAccessoryCard
  const def = CARD_LIBRARY.find((d) => d.defId === pending.defId)
  if (def?.effect.type === 'mealCard') pending.used = false
  player.accessories.push(pending)
  player.pendingAccessoryCard = null
  game.awaitingAccessoryReplace = null
  return { ok: true }
}

export function endAction(game: Game, playerId: string): ActionResult {
  if (game.phase !== 'action') return { ok: false, message: '当前不是行动阶段' }
  if (game.awaitingSharkTarget) {
    return { ok: false, message: '等待鲨bee选择放电目标' }
  }
  if (game.awaitingActive) return { ok: false, message: '等待选择新的前台角色' }
  if (game.awaitingFieldReplace) return { ok: false, message: '先选择要替换掉的场地牌' }
  if (game.awaitingAccessoryReplace) return { ok: false, message: '先选择要替换掉的配饰牌' }
  if (game.awaitingAllyTarget) return { ok: false, message: '先选择我方目标角色' }

  const player = game.players.find((p) => p.id === playerId)
  if (!player) return { ok: false, message: '玩家不存在' }

  const currentSeat = game.actionOrder[game.actionIndex]
  if (currentSeat !== player.seat) return { ok: false, message: '还没轮到你行动' }

  // 运动会：本次行动结束，未用完的返还次数失效
  player.sportsReturns = 0

  game.actionIndex += 1
  if (game.actionIndex >= game.actionOrder.length) {
    endRound(game)
  } else {
    beginAction(game)
    scheduleAI(game)
  }
  return { ok: true }
}

export function removePlayer(game: Game, playerId: string) {
  const player = game.players.find((p) => p.id === playerId)
  if (!player) return

  player.hand = []
  for (const c of player.characters) c.alive = false
  // 退出的玩家不再参与后续复活
  game.pendingRevives = game.pendingRevives.filter((r) => r.playerId !== playerId)
  eliminatePlayer(game, player)

  const alive = game.players.filter((p) => !p.eliminated)
  if (alive.length <= 1 && game.phase !== 'finished') finishGame(game)
}

/** 当前可用于技能牌的减费点数 */
/** 道具提供的持续增益，供界面显示为正面效果 */
function itemBuffsFor(player: Player, round: number): ItemBuffView[] {
  const buffs: ItemBuffView[] = []

  if (player.skillDamageBonus > 0) {
    buffs.push({
      id: 'free-soup',
      name: '免费汤',
      description: '下一次技能攻击伤害 +1',
      icon: 'flame',
      polarity: 'buff',
      stacks: player.skillDamageBonus,
    })
  }
  if (player.skillCostDiscount > 0) {
    buffs.push({
      id: 'fries',
      name: '薯条',
      description: '下一次技能花费 -2',
      icon: 'bolt',
      polarity: 'buff',
      stacks: player.skillCostDiscount,
    })
  }
  if (player.soda?.round === round && player.soda.charges > 0) {
    buffs.push({
      id: 'ice-tea',
      name: '冰红茶',
      description: '本回合技能伤害 +1、花费 -1',
      icon: 'up',
      polarity: 'buff',
      stacks: player.soda.charges,
    })
  }
  if (player.coolSips && player.coolSips.charges > 0) {
    buffs.push({
      id: 'strong-cool',
      name: '大劲凉',
      description: '受到攻击时回复 1 点并摸 1 张牌',
      icon: 'drop',
      polarity: 'buff',
      stacks: player.coolSips.charges,
    })
  }
  if (player.smallCards > 0) {
    buffs.push({
      id: 'small-card',
      name: '小卡片',
      description: '攻击时消耗 1 层，为命中目标附加「标记」',
      icon: 'up',
      polarity: 'neutral',
      stacks: player.smallCards,
    })
  }

  return buffs
}

function skillDiscountFor(player: Player, round: number): number {
  let total = 0
  for (const field of player.fields) {
    const def = CARD_LIBRARY.find((d) => d.defId === field.defId)
    if (!def || def.effect.type !== 'skillDiscount') continue
    if ((player.fieldUses[field.id] ?? 0) >= def.effect.usesPerRound) continue
    total += def.effect.amount
  }
  // 薯条的待生效减费也显示在牌面上
  total += player.skillCostDiscount
  // 冰红茶本回合内的减费
  if (player.soda?.round === round) total += player.soda.discount
  return total
}

function nonSkillDiscountFor(player: Player): number {
  let total = 0
  for (const field of player.fields) {
    const def = CARD_LIBRARY.find((d) => d.defId === field.defId)
    if (!def || def.effect.type !== 'drawAndNonSkillDiscount') continue
    if ((player.fieldUses[field.id] ?? 0) >= def.effect.usesPerRound) continue
    total += def.effect.discount
  }
  return total
}

function extraDrawFor(player: Player): number {
  let total = 0
  for (const field of player.fields) {
    const def = CARD_LIBRARY.find((d) => d.defId === field.defId)
    if (!def || def.effect.type !== 'drawAndNonSkillDiscount') continue
    total += def.effect.extraDraw
  }
  return total
}

function viewCharacter(character: Character): CharacterView {
  let skills = character.skills
  // 凑企厄：大招花费随永久减费动态更新
  if (character.id === 'char-couqie' && !character.godForm) {
    const burstCost = Math.max(0, character.skillSet.burst.cost - character.burstCostDiscount)
    skills = skills.map((skill, index) =>
      index === 2 ? { ...skill, cost: burstCost } : skill,
    )
  }

  return {
    ...character,
    skills,
    effects: character.effects
      .map((effect) => {
        const info = EFFECT_MAP[effect.defId]
        return info ? { uid: effect.uid, stacks: effect.stacks, ...info } : null
      })
      .filter((e: unknown) => e !== null) as CharacterView['effects'],
  }
}

function publicView(p: Player): PlayerPublic {
  const isSon = p.sonRounds > 0
  return {
    id: p.id,
    name: isSon ? `儿子-${p.name}` : p.name,
    avatar: isSon ? '👦' : p.avatar,
    seat: p.seat,
    handCount: p.hand.length,
    ap: p.ap,
    characters: p.characters.map(viewCharacter),
    activeIndex: p.activeIndex,
    eliminated: p.eliminated,
    pickedCount: p.picked.length,
    activeChosen: p.activeChosen,
    lastRoll: p.lastRoll,
    fields: p.fields,
    accessories: p.accessories,
    summons: p.summons.map((s) => ({
      id: s.id,
      defId: s.defId,
      name: s.name,
      artId: s.artId,
      description: s.description,
      taunt: s.taunt,
      uses: s.uses,
      charges: s.charges,
      hp: s.hp,
    })),
    sonRounds: p.sonRounds,
  }
}

export function viewFor(game: Game, playerId: string): GameView | null {
  const me = game.players.find((p) => p.id === playerId)
  if (!me) return null

  const pool: PoolEntry[] | null =
    game.phase === 'picking'
      ? game.pool.map((entry) => {
          const owner = game.players.find((p) => p.picked.includes(entry.id))
          return {
            id: entry.id,
            name: entry.name,
            hp: entry.hp,
            artId: entry.artId,
            takenByName: owner && owner.id !== playerId ? owner.name : null,
          }
        })
      : null

  const self: SelfView = {
    ...publicView(me),
    hand: me.hand,
    picked: me.picked,
    skillDiscount: skillDiscountFor(me, game.round),
    nonSkillDiscount: nonSkillDiscountFor(me),
    buffs: itemBuffsFor(me, game.round),
  }

  const currentSeat = game.phase === 'action' ? game.actionOrder[game.actionIndex] ?? null : null

  return {
    roomId: game.roomId,
    phase: game.phase,
    round: game.round,
    currentSeat,
    currentPlayerName: currentSeat === null ? null : game.players[currentSeat].name,
    firstSeat: game.firstSeat,
    drawPerRound: DRAW_PER_ROUND,
    handLimit: handLimitFor(me),
    you: self,
    others: game.players.filter((p) => p.id !== playerId).map(publicView),
    pool,
    deckCount: game.deck.length,
    discardCount: game.discard.length,
    winnerId: game.winnerId,
    winnerName: game.winnerId
      ? game.players.find((p) => p.id === game.winnerId)?.name ?? null
      : null,
    awaitingActive: game.awaitingActive,
    awaitingFieldReplace: game.awaitingFieldReplace,
    awaitingAccessoryReplace: game.awaitingAccessoryReplace,
    awaitingAllyTarget: game.awaitingAllyTarget,
    awaitingAllyTargetKind: game.awaitingAllyTarget
      ? game.pendingAllyCard?.type === 'reviveAlly'
        ? 'dead'
        : game.pendingAllyCard?.type === 'shieldAlly' &&
            game.pendingAllyCard.backlineOnly
          ? 'backline'
          : 'alive'
      : null,
    awaitingSharkTarget: game.awaitingSharkTarget,
    pendingShark: game.pendingShark,
    stageMechanic: game.stageId
      ? (STAGE_MAP[game.stageId]?.mechanic ?? null)
      : null,
    pickEnemyTarget: Boolean(
      game.stageId && STAGE_MAP[game.stageId]?.pickEnemyTarget,
    ),
    lastPlay: game.lastPlay,
    switchBanned: game.round === game.noSwitchRound,
    nonSkillTax: game.nonSkillTaxRound === game.round ? game.nonSkillTaxAmount : 0,
  }
}

/** 选完角色后，把所选角色牌实例化到玩家身上 */
export function materializeCharacters(game: Game) {
  for (const p of game.players) {
    if (p.characters.length > 0) continue
    p.characters = p.picked
      .map((id) => game.pool.find((c) => c.id === id))
      .filter((c: CharacterTemplate | undefined): c is CharacterTemplate => Boolean(c))
      .map(toCharacter)
  }
}
