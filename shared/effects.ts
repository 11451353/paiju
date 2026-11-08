// 状态效果表。前后端共用：服务端做结算，客户端做展示。

export type EffectPolarity = 'buff' | 'debuff' | 'neutral'

export type EffectIconKind =
  | 'up'
  | 'down'
  | 'dot'
  | 'flame'
  | 'drop'
  | 'bolt'
  | 'mask'
  | 'trident'

export type EffectInfo = {
  id: string
  name: string
  description: string
  /** 正面 / 负面 / 中性 */
  polarity: EffectPolarity
  /** 图标形状，客户端据此渲染 */
  icon: EffectIconKind
  /** 是否在结束阶段触发结算 */
  triggersOnEndPhase: boolean
  /** 叠加上限，1 表示不可叠加 */
  maxStacks: number
  /** 结束阶段结算后层数 -1，归零则移除 */
  ticksDown: boolean
  /** 结束阶段时移除全部层数（效果只持续到本回合结束） */
  expiresAtEndPhase?: boolean
  /** 抛物线！可以延长的类型：duration 增加 1 回合，uses 增加 1 次可用次数 */
  extendable?: 'duration' | 'uses'
}

export const EFFECTS: EffectInfo[] = [
  {
    id: 'rage',
    name: '怒气',
    description:
      '中性效果，最多 5 层，没有持续回合限制。按摩技师使用普攻或战技时积累，释放大招时全部消耗。',
    polarity: 'neutral',
    icon: 'flame',
    triggersOnEndPhase: false,
    maxStacks: 5,
    ticksDown: false,
    extendable: 'uses',
  },
  {
    id: 'bleed',
    name: '流血',
    description: '结束阶段触发：受到 1 点伤害，随后层数 -1。最多叠加到 3 层。',
    polarity: 'debuff',
    icon: 'drop',
    triggersOnEndPhase: true,
    maxStacks: 3,
    ticksDown: true,
    extendable: 'duration',
  },
  {
    id: 'ap-down',
    name: '行动点压制',
    description:
      '负面效果。持有该角色的玩家行动开始时，行动点 -2（最低到 0），生效一次后移除。不可叠加，全场同时只能存在一个。',
    polarity: 'debuff',
    icon: 'down',
    triggersOnEndPhase: false,
    maxStacks: 1,
    ticksDown: false,
  },
  {
    id: 'clown',
    name: '小丑',
    description:
      '奥斯卡小金马的天赋层数，最多 6 层。每次受到攻击最多获得 1 层；未受到攻击而生命降低时再获得 1 层。持有大于等于 4 层时，普攻会强化为「我是小丑」：伤害 +2，命中后治疗我方全体 2 点并额外回复自身 1 点，并消耗 4 层小丑。',
    polarity: 'neutral',
    icon: 'mask',
    triggersOnEndPhase: false,
    maxStacks: 6,
    ticksDown: false,
    extendable: 'uses',
  },
  {
    id: 'clown-phase',
    name: '谢幕',
    description: '结束阶段获得 2 层小丑。持续 2 次结束阶段。',
    polarity: 'neutral',
    icon: 'mask',
    triggersOnEndPhase: true,
    maxStacks: 2,
    ticksDown: true,
    extendable: 'duration',
  },
  {
    id: 'seaking',
    name: '海王',
    description: '受到敌方角色攻击时，攻击者受到 1 点伤害。持续 2 回合。',
    polarity: 'neutral',
    icon: 'trident',
    triggersOnEndPhase: false,
    maxStacks: 2,
    ticksDown: true,
    extendable: 'duration',
  },
  {
    id: 'poison-soup',
    name: '毒鸡汤',
    description:
      '负面效果。结束阶段扣除 1 点生命，无视护盾和减伤。每个实例持续 2 次，不可叠加，同一目标可同时存在多个。',
    polarity: 'debuff',
    icon: 'dot',
    triggersOnEndPhase: true,
    maxStacks: 2,
    ticksDown: true,
    extendable: 'duration',
  },
  {
    id: 'miho',
    name: '米卫兵',
    description:
      '中性效果，最多 2 层。OP 的普攻变为「强化普攻·OP之怒」：伤害 +2、费用 -1，并额外对目标方生命最高的后台角色造成 1 点伤害；每次强化普攻消耗 1 层。',
    polarity: 'neutral',
    icon: 'bolt',
    triggersOnEndPhase: false,
    maxStacks: 2,
    ticksDown: false,
    extendable: 'uses',
  },
  {
    id: 'small-card',
    name: '小卡片',
    description:
      '中性效果。我方角色攻击时消耗 1 层，为攻击目标附加「标记」；命中多个目标时优先标记前台。',
    polarity: 'neutral',
    icon: 'up',
    triggersOnEndPhase: false,
    maxStacks: 99,
    ticksDown: false,
    extendable: 'uses',
  },
  {
    id: 'mark',
    name: '标记',
    description:
      '负面效果。结束阶段被文明标兵攻击一次，造成 2 点伤害后移除。不可叠加，也不能对已持有者重复施加。',
    polarity: 'debuff',
    icon: 'down',
    triggersOnEndPhase: false,
    maxStacks: 1,
    ticksDown: false,
  },
  {
    id: 'guard',
    name: '减伤',
    description: '正面效果。下次受到伤害时，该次伤害 -1，随后移除此效果。',
    polarity: 'buff',
    icon: 'up',
    triggersOnEndPhase: false,
    maxStacks: 1,
    ticksDown: false,
    extendable: 'uses',
  },
  {
    id: 'ruin',
    name: '毁伤',
    description:
      '中性效果，最多 8 层。凑企厄神厄形态的普攻获得 2 层、战技每命中一个目标获得 1 层；超过 4 层时战技强化为「战技·死星」，消耗全部层数。',
    polarity: 'neutral',
    icon: 'flame',
    triggersOnEndPhase: false,
    maxStacks: 8,
    ticksDown: false,
    extendable: 'uses',
  },
  {
    id: 'whip-length',
    name: '教鞭长度',
    description:
      '中性效果，初始 1 段，最多 3 段。处于 1/2/3 段时，U 的普通攻击伤害 +0/+3/+6、费用 -0/-1/-2；造成普通攻击伤害后重置为 1 段。',
    polarity: 'neutral',
    icon: 'bolt',
    triggersOnEndPhase: false,
    maxStacks: 3,
    ticksDown: false,
  },
  {
    id: 'whip-double',
    name: '魔音强化',
    description: '正面效果。U 的下一次普通攻击伤害翻倍，使用普通攻击后移除。',
    polarity: 'buff',
    icon: 'up',
    triggersOnEndPhase: false,
    maxStacks: 1,
    ticksDown: false,
  },
  {
    id: 'shackle',
    name: '镣锁',
    description:
      '盗罐行者的资源，最多 20 层。镣铐崩解期间，残破容器被击杀时减少 1 层并触发额外效果；战技·莫因舍弃而哭泣会消耗全部剩余层数，每层造成 1 次弹射伤害。',
    polarity: 'neutral',
    icon: 'bolt',
    triggersOnEndPhase: false,
    maxStacks: 20,
    ticksDown: false,
  },
  {
    id: 'shackle-break',
    name: '镣铐崩解',
    description:
      '盗罐行者的状态。战技强化为「战技·莫因舍弃而哭泣」；残破容器死亡后立即在原位刷新，保持左右各 2 只。',
    polarity: 'neutral',
    icon: 'down',
    triggersOnEndPhase: false,
    maxStacks: 1,
    ticksDown: false,
  },
  {
    id: 'lowbrow',
    name: '低能',
    description:
      '中性效果，最多 3 层。我方角色使用技能攻击敌方玩家时，高玩立即对目标发动追加攻击·低能暴击：对该玩家全体角色造成 2 点伤害，消耗 1 层。高玩在前台或后台都可以发动。',
    polarity: 'neutral',
    icon: 'mask',
    triggersOnEndPhase: false,
    maxStacks: 3,
    ticksDown: false,
    extendable: 'uses',
  },
  {
    id: 'stench',
    name: '恶臭',
    description:
      '正面效果。我方角色受到伤害时，大佐承受其中一半（向下取整）。此状态下，我方角色使用技能后治疗大佐 1 点，每回合至多触发 2 次。',
    polarity: 'buff',
    icon: 'dot',
    triggersOnEndPhase: true,
    maxStacks: 3,
    ticksDown: true,
    extendable: 'duration',
  },
  {
    id: 'football',
    name: '足球',
    description:
      '正面效果。造成的伤害 +2，触发 1 次后移除；回合结束时自动消失。装备多张足球时，每次切换角色获得的层数叠加。',
    polarity: 'buff',
    icon: 'up',
    triggersOnEndPhase: false,
    maxStacks: 99,
    ticksDown: false,
    expiresAtEndPhase: true,
    extendable: 'uses',
  },
  {
    id: 'charge',
    name: '充能',
    description:
      '抑制剂的天赋资源。我方对他方目标施加负面效果时 +1，最多 3 层。满 3 层时我方下一次攻击消耗 3 层，额外造成 2 点真实伤害。',
    polarity: 'neutral',
    icon: 'bolt',
    triggersOnEndPhase: false,
    maxStacks: 3,
    ticksDown: false,
    extendable: 'uses',
  },
  {
    id: 'tangxiao',
    name: '唐笑',
    description: '正面效果。造成的伤害 +1，持续 2 回合。',
    polarity: 'buff',
    icon: 'up',
    triggersOnEndPhase: true,
    maxStacks: 2,
    ticksDown: true,
    extendable: 'duration',
  },
  {
    id: 'hanfei-rage',
    name: '悍匪之怒',
    description:
      '中性效果，最多 3 层（持续回合）。普攻伤害 +2，战技伤害 +3；普攻和战技还会对目标方所有后台角色各造成 1 点伤害。持有期间击倒敌人时延长 1 回合（不超过 3 回合），每次释放大招后只能触发 1 次。',
    polarity: 'neutral',
    icon: 'flame',
    triggersOnEndPhase: true,
    maxStacks: 3,
    ticksDown: true,
    extendable: 'duration',
  },
  {
    id: 'disorder',
    name: '紊乱',
    description:
      '负面效果。结束阶段有 33.3% 概率造成 1 点真实伤害；每次紊乱造成伤害时，施加者一方全体回复 1 点。最多叠加 4 回合；施加时超出上限的部分会被清除，并立即受到一次紊乱伤害。',
    polarity: 'debuff',
    icon: 'down',
    triggersOnEndPhase: true,
    maxStacks: 4,
    ticksDown: true,
    extendable: 'duration',
  },
  {
    id: 'julao',
    name: '巨佬',
    description: '正面效果。我方弃牌时，附属者回复 1 点生命。持续 3 回合，同时只能存在 1 个巨佬 / PROMAX佬 状态。',
    polarity: 'buff',
    icon: 'up',
    triggersOnEndPhase: false,
    maxStacks: 3,
    ticksDown: true,
    extendable: 'duration',
  },
  {
    id: 'promax',
    name: 'PROMAX佬',
    description: '正面效果。我方弃牌时，附属者回复 2 点生命。持续 3 回合，再次施放巨佬的战技会变回巨佬。',
    polarity: 'buff',
    icon: 'up',
    triggersOnEndPhase: false,
    maxStacks: 3,
    ticksDown: true,
    extendable: 'duration',
  },
  {
    id: 'liaoning',
    name: '我是辽宁的',
    description:
      '中性效果，持续 3 回合。敌方攻击技能只能以杨云博为目标；同时攻击前后台的技能视为杨云博在前台。杨云博受到经过减伤后的伤害减半（向上取整）。结束阶段治疗自身 1 点。',
    polarity: 'neutral',
    icon: 'up',
    triggersOnEndPhase: true,
    maxStacks: 3,
    ticksDown: true,
    extendable: 'duration',
  },
  {
    id: 'frog-curse',
    name: '奶蛙诅咒',
    description: '负面效果。受到的伤害 +2，可用 4 次。',
    polarity: 'debuff',
    icon: 'down',
    triggersOnEndPhase: false,
    maxStacks: 4,
    ticksDown: false,
    extendable: 'uses',
  },
  {
    id: 'bean-curse',
    name: '豆包诅咒',
    description:
      '负面效果。受到的伤害 +4；不可被角色技能或手牌效果解除，使用技能攻击 2 次后解除。',
    polarity: 'debuff',
    icon: 'mask',
    triggersOnEndPhase: false,
    maxStacks: 2,
    ticksDown: false,
  },
]

export const EFFECT_MAP: Record<string, EffectInfo> = Object.fromEntries(
  EFFECTS.map((e) => [e.id, e]),
)
