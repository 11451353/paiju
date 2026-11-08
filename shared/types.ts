// 前后端共享的数据结构。

import type { EffectIconKind, EffectInfo, EffectPolarity } from './effects'

/** 挂在角色身上的一个状态效果实例 */
export type EffectView = EffectInfo & {
  uid: string
  /** 层数；对流血这类效果表示剩余回合数 */
  stacks: number
}

export type SkillKind = 'normal' | 'skill' | 'burst'

/** 单个技能的完整定义。消耗与效果跟随角色，而不是卡牌 */
export type SkillDef = {
  name: string
  cost: number
  damage: number
  description: string
  /** 命中对方全体角色（含后台） */
  hitAll?: boolean
  /** 只命中指定目标玩家的全体角色（仍需要选择目标玩家） */
  hitAllTarget?: boolean
  /** 对所有玩家的前台角色造成伤害（含我方前台，高玩的战技） */
  hitAllFronts?: number
  /** 目标是我方角色：打出后由玩家点选一名己方角色 */
  targetAlly?: boolean
  /** 使用后治疗我方全体存活角色 */
  healAll?: number
  /** 使用后额外治疗自身 */
  healSelf?: number
  /** 己方目标技能：治疗被选中的我方角色 */
  healTarget?: number
  /** 使用后摸牌 */
  drawCards?: number
  /** 巨佬大招：把「巨佬」升级为「PROMAX佬」并延长 1 回合 */
  upgradeJulao?: boolean
  /** 白白战技：给选定目标玩家的全体角色施加紊乱 */
  disorderAll?: number
  /** 白白大招：治疗全体，并为每名角色随机解除 1 个负面效果；解除了的角色额外治疗 */
  cleanseHealAll?: { heal: number; bonus: number }
  /** 使用后扣除自身生命，最低保留 1 点 */
  selfHpLoss?: number
  /** 命中后再对目标方生命最高的后台角色造成伤害 */
  hitHighestBack?: number
  /** 命中后再对目标方全体后台角色造成伤害 */
  hitAllBack?: number
  /** 命中后治疗自身 */
  healSelfOnHit?: number
  /** 基础伤害中视为真实伤害的部分（真实伤害无视护盾与减伤） */
  trueDamage?: number
  /** 召唤召唤物；hp 为特殊生命（初一小孩） */
  summon?: { defId: string; taunt: number; uses?: number; hp?: number }
  /** 佩爹：指定目标玩家成为「儿子」的持续回合数 */
  applySon?: number
  /** 佩爹大招：延长所有儿子的持续时间，并对儿子玩家的所有角色造成真实伤害 */
  sonBurst?: { extend: number; damage: number }
  /** 大母零：召唤/切换鲨bee。toggle 为战技，burst 为召唤并累积治疗后移除 */
  sharkBee?: { mode: 'toggle' | 'burst'; charge: number }
  /** 我方获得的小卡片层数 */
  gainSmallCards?: number
  /** 目标身上每个负面效果追加的伤害，带上限 */
  damagePerDebuff?: { amount: number; max: number }
  /** 命中后给目标施加的状态效果 */
  targetEffect?: { defId: string; stacks: number; uniqueOnField?: boolean }
  /** 以独立实例施加的状态效果，不合并层数、可与其他同类实例共存 */
  targetStack?: { defId: string; stacks: number }
  /** 命中前随机移除目标身上的一个正面效果 */
  stripBuff?: boolean
  /** 从目标所属玩家已装备的场地 / 配饰牌中随机弃置指定张数 */
  discardEquipments?: number
  /** 立即触发目标身上所有结束阶段造成伤害的效果，不消耗其次数 */
  triggerEndDots?: boolean
  /** 使用后给自身叠加的状态效果 */
  selfEffect?: { defId: string; stacks: number }
  /** 使用后给自身叠加的多个状态效果 */
  selfEffects?: { defId: string; stacks: number }[]
  /** 消耗自身某个状态效果的层数 */
  consume?: {
    defId: string
    /** 每消耗 1 层增加的伤害 */
    damagePerStack: number
    /** 消耗层数超过该值时，每多 1 层给目标施加 extraEffect */
    overflowThreshold: number
    extraEffect?: { defId: string; maxStacks: number }
  }
  /** 使用后永久降低自身大招花费 */
  reduceBurstCost?: number
  /** 使用后永久变身为神厄形态 */
  transformGod?: boolean
  /** 群体技能每命中一个目标，给自身叠加状态 */
  selfEffectPerHit?: { defId: string; stacks: number }
  /** 战技强化：消耗层数，每层随机打一次，随后群体打一次 */
  consumeStacksBurst?: {
    defId: string
    /** 层数超过该值时强化 */
    threshold: number
    /** 每层随机伤害 */
    randomDamage: number
    /** 最终群体伤害 */
    finalDamage: number
  }
}

export type SkillSet = Record<SkillKind, SkillDef>

/** 技能列表项，用于详情面板展示 */
export type SkillInfo = {
  name: string
  cost: number
  description: string
}

/** 角色牌 */
export type CharacterInfo = {
  id: string
  name: string
  hp: number
  maxHp: number
  /** 牌面美术标识，客户端据此取图 */
  artId: string | null
  /** 天赋标识，目前只有 'charge'（抑制剂充能） */
  talentId: string | null
  skills: SkillInfo[]
  talents: SkillInfo[]
  skillSet: SkillSet
  /** 凑企厄：大招的永久减费累计值 */
  burstCostDiscount?: number
  /** 凑企厄：是否处于神厄形态 */
  godForm?: boolean
  /** 凑企厄：变身神厄形态后的技能，详情页点击「神厄形态」查看 */
  godSkills?: SkillInfo[]
  /** U：最近一次施放的是普攻，下一次战技返还卡牌并 -1 费 */
  uCombo?: boolean
}

/**
 * 卡牌种类：
 * - normal / skill / burst：技能牌，消耗与效果由使用它的前台角色决定
 * - field / item / event / accessory：普通手牌，消耗写在牌上
 * - field 与 accessory 打出后装备，不进入弃牌堆
 * - blank：占位
 */
export type CardKind =
  | 'normal'
  | 'skill'
  | 'burst'
  | 'field'
  | 'item'
  | 'event'
  | 'accessory'
  | 'blank'

/** 手牌效果描述，由服务端解释 */
export type CardEffect =
  | { type: 'skillDiscount'; amount: number; usesPerRound: number }
  | { type: 'damageBonus'; amount: number; usesPerRound: number }
  | { type: 'roundStartShield'; amount: number }
  | {
      type: 'endPhaseHeal'
      /** 回复前台角色的点数 */
      healFront: number
      /** 触发额外治疗的生命阈值 */
      lowHpThreshold: number
      /** 额外治疗生命最低角色的点数 */
      healLow: number
    }
  | {
      type: 'drawAndNonSkillDiscount'
      /** 摸牌阶段额外摸牌数 */
      extraDraw: number
      /** 非技能手牌减免的行动点 */
      discount: number
      usesPerRound: number
    }
  | {
      type: 'switchApRefund'
      /** 触发概率，0-1 */
      chance: number
      /** 恢复的行动点 */
      amount: number
    }
  | {
      type: 'frontDamageReduction'
      /** 基础减伤 */
      amount: number
      /** 减伤前伤害达到该值时额外减免 */
      heavyThreshold: number
      /** 额外减免 */
      heavyExtra: number
      usesPerRound: number
    }
  | {
      type: 'deathRevive'
      /** 复活后的生命值 */
      hp: number
    }
  | {
      type: 'healAlly'
      /** 回复的生命值 */
      amount: number
    }
  | {
      type: 'nextSkillDamage'
      /** 下一次技能攻击的额外伤害 */
      amount: number
    }
  | {
      type: 'nextSkillDiscount'
      /** 下一次技能减免的行动点 */
      amount: number
    }
  | {
      type: 'grantAllAllies'
      /** 施加的状态效果 */
      defId: string
      stacks: number
    }
  | {
      type: 'reviveAlly'
      /** 复活后的生命值 */
      hp: number
    }
  | {
      type: 'roundSkillBoost'
      /** 本回合内可用的次数 */
      charges: number
      /** 每次技能的额外伤害 */
      damage: number
      /** 每次技能减免的行动点 */
      discount: number
    }
  | {
      type: 'healOnAttacked'
      /** 可触发的次数 */
      charges: number
      /** 每次回复的生命值 */
      heal: number
      /** 每次摸牌数 */
      draw: number
    }
  | {
      type: 'actionStartAp'
      /** 自己行动开始时获得的行动点 */
      amount: number
    }
  | {
      type: 'hpThresholdDamageReduction'
      /** 生命值达到该值时生效 */
      minHp: number
      /** 减免的伤害 */
      amount: number
    }
  | {
      type: 'backlineSupport'
      /** 后台角色造成伤害的加成 */
      damage: number
      /** 后台角色受到伤害的减免 */
      reduction: number
      /** 伤害加成 / 减免各自每回合可触发的次数 */
      usesPerRound: number
      /** 后台角色结束阶段回复的生命值 */
      endPhaseHeal: number
    }
  | {
      type: 'chargeAccumulate'
      /** 每回合结束获得的充能 */
      endPhase: number
      /** 充能超过该值时，我方行动开始触发 */
      threshold: number
    }
  | {
      type: 'handLimitBonus'
      /** 手牌上限增加 */
      amount: number
      /** 受到攻击时摸牌的基础概率 */
      drawChance: number
      /** 每次成功触发后降低的概率 */
      chanceStep: number
      /** 最多触发次数，达到后概率为 0 */
      maxTriggers: number
    }
  | {
      type: 'switchFrontBuff'
      /** 切换角色后给新前台施加的状态效果 */
      defId: string
      stacks: number
    }
  | {
      type: 'firstDamageTrue'
    }
  | {
      type: 'mealCard'
      /** 打出道具牌后回复生命最低角色的点数 */
      healLowest: number
    }
  | {
      type: 'extendEffects'
      /** 每个可延长的状态效果增加的层数 */
      amount: number
    }
  | {
      type: 'shieldAlly'
      /** 获得的护盾值 */
      amount: number
      /** 是否只能选择后台角色 */
      backlineOnly?: boolean
    }
  | {
      type: 'aminoAura'
    }
  | {
      type: 'cleanseDebuffs'
      /** 每个角色清除的负面效果数量 */
      count: number
    }
  | {
      type: 'skillReturn'
      /** 本次行动内可返还技能牌的次数 */
      charges: number
    }
  | {
      type: 'banSwitchNextRound'
    }
  | {
      type: 'drawCards'
      /** 摸牌数量 */
      count: number
    }
  | {
      type: 'nonSkillTaxNextRound'
      /** 非技能手牌增加的花费 */
      amount: number
    }

export type CardInfo = {
  id: string
  name: string
  kind: CardKind
  /** 卡牌定义标识，同一张牌的复制品共用 */
  defId: string
  /** 普通手牌自身的消耗；技能牌忽略此值 */
  cost: number
  /** 牌面美术标识 */
  artId: string | null
  /** 详情页展示的效果说明 */
  description: string
  /** 装备牌的充能层数，仅八中杀等带充能的牌使用 */
  charges?: number
  /** 装备牌的单次能力是否已经用完（饭卡） */
  used?: boolean
}

export type CharacterView = CharacterInfo & {
  alive: boolean
  /** 护盾值，受到伤害时优先扣除 */
  shield: number
  effects: EffectView[]
}

/** 召唤物 */
export type SummonView = {
  id: string
  defId: string
  name: string
  artId: string | null
  description: string
  /** 嘲讽值 */
  taunt: number
  /** 可用次数（干儿子）；存在时优先显示次数而不是嘲讽值 */
  uses?: number
  /** 累积治疗（鲨bee） */
  charges?: number
  /** 特殊生命（初一小孩） */
  hp?: number
}

/** 其他玩家可见的部分 */
export type PlayerPublic = {
  id: string
  name: string
  seat: number
  handCount: number
  ap: number
  characters: CharacterView[]
  activeIndex: number
  eliminated: boolean
  pickedCount: number
  activeChosen: boolean
  lastRoll: number | null
  /** 已装备的场地牌，最多 2 张 */
  fields: CardInfo[]
  /** 已装备的配饰牌，最多 2 张 */
  accessories: CardInfo[]
  /** 场上的召唤物 */
  summons: SummonView[]
  /** 头像（一个表情字符） */
  avatar: string | null
  /** 佩爹：剩余「儿子」回合数，0 表示未被附属 */
  sonRounds: number
}

/** 道具提供的持续增益，用于界面展示 */
export type ItemBuffView = {
  id: string
  name: string
  description: string
  icon: EffectIconKind
  /** 正面 / 负面 / 中性 */
  polarity: EffectPolarity
  /** 剩余次数 / 层数 */
  stacks: number
}

/** 自己的完整状态 */
export type SelfView = PlayerPublic & {
  hand: CardInfo[]
  picked: string[]
  /** 当前可享受的技能费用减免点数 */
  skillDiscount: number
  /** 当前可享受的非技能手牌费用减免点数 */
  nonSkillDiscount: number
  /** 道具提供的待生效增益 */
  buffs: ItemBuffView[]
}

export type PoolEntry = {
  id: string
  name: string
  hp: number
  artId: string | null
  takenByName: string | null
}

/** 中央框里停留的最近一张牌（用于观战别人的出牌） */
export type LastPlayView = {
  playerId: string
  playerName: string
  card: CardInfo
  cost: number
  damage: number
  description: string
}

export type GamePhase =
  | 'picking'
  | 'activeSelect'
  | 'draw'
  | 'roll'
  | 'action'
  | 'end'
  | 'finished'

export type GameView = {
  roomId: string
  phase: GamePhase
  round: number
  currentSeat: number | null
  currentPlayerName: string | null
  firstSeat: number
  drawPerRound: number
  handLimit: number
  you: SelfView
  others: PlayerPublic[]
  pool: PoolEntry[] | null
  deckCount: number
  discardCount: number
  winnerId: string | null
  winnerName: string | null
  /** 前台角色阵亡、等待该玩家选择新前台的玩家 id */
  awaitingActive: string | null
  /** 场地已满、等待该玩家点红叉替换的玩家 id */
  awaitingFieldReplace: string | null
  /** 配饰已满、等待该玩家点红叉替换的玩家 id */
  awaitingAccessoryReplace: string | null
  /** 打出对己方生效的牌、等待该玩家点选己方角色的玩家 id */
  awaitingAllyTarget: string | null
  /** 待选目标的要求：正常为存活角色，复活类为阵亡角色，护盾类为后台存活角色 */
  awaitingAllyTargetKind: 'alive' | 'dead' | 'backline' | null
  /** 鲨bee 放电，等待该玩家点选敌方前台 */
  awaitingSharkTarget: string | null
  /** 待结算的鲨bee放电数据 */
  pendingShark: { playerId: string; charges: number; heal: number } | null
  /** 关卡机制说明（盗罐行者等关卡），null 表示无 */
  stageMechanic: string | null
  /** 攻击时需要选择敌方角色（盗罐行者关卡） */
  pickEnemyTarget: boolean
  /** 中央框停留的最近一张牌 */
  lastPlay: LastPlayView | null
  /** 本回合是否禁止主动切换角色（公开课） */
  switchBanned: boolean
  /** 本回合非技能手牌增加的花费（元旦晚会），0 表示没有 */
  nonSkillTax: number
}

export type ServerMessage =
  | { t: 'hello'; id: string }
  | { t: 'queueing'; size: number; max: number }
  | { t: 'left' }
  | { t: 'state'; view: GameView }
  | { t: 'toast'; message: string }
  | { t: 'error'; message: string }

export type ClientMessage =
  | { t: 'queue'; name?: string; avatar?: string }
  | { t: 'cancel' }
  | { t: 'solo'; name?: string; avatar?: string; stageId?: string }
  | { t: 'leave' }
  | { t: 'pick'; characterId: string }
  | { t: 'pickActive'; index: number }
  | { t: 'chooseActiveInGame'; index: number }
  | { t: 'playCard'; cardId: string; targetPlayerId?: string; targetCharacterId?: string }
  | { t: 'discard'; cardId: string }
  | { t: 'switchActive'; index: number }
  | { t: 'replaceField'; fieldCardId: string }
  | { t: 'replaceAccessory'; cardId: string }
  | { t: 'chooseAllyTarget'; characterId: string }
  | { t: 'chooseSharkTarget'; targetPlayerId: string }
  | { t: 'endAction' }
