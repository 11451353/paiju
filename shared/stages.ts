/**
 * 单人模式的关卡表。前后端共用：
 * - 客户端用 id / name / artId 渲染关卡选择。
 * - 服务端（或离线引擎）用 aiCharacters 决定电脑的阵容。
 *
 * 后续新增关卡时在这里追加，artId 对应 src/lib/stageArt.ts 里的图标。
 */
export type StageDef = {
  id: string
  name: string
  /** 关卡图标 artId；null 表示空白图标 */
  artId: string | null
  /** 电脑阵容：'blank' 为 3 名空白角色，或角色模板 id 列表 */
  aiCharacters: 'blank' | string[]
  /** 关卡机制说明，对局内右上角问号展示 */
  mechanic?: string
  /** 攻击时需要选择敌方角色作为本次攻击的前台 */
  pickEnemyTarget?: boolean
}

export const STAGES: StageDef[] = [
  {
    id: 'test',
    name: '测试版',
    artId: null,
    aiCharacters: 'blank',
  },
  {
    id: 'jarwalker',
    name: '盗罐行者',
    artId: 'jarwalker',
    aiCharacters: ['char-jarwalker'],
    mechanic:
      '敌方最多存在 5 张角色牌。\n你攻击时可以选择任意一名敌方角色作为目标：该目标在本次攻击中视为前台，其余角色视为后台。\n\n敌方行动循环：\n第 1 回合：普攻·亡死的黑云 ×2\n第 2 回合：战技·将尽的命数\n第 3 回合：大招·沉默的悲叹\n第 4 回合：不行动\n第 5 回合：战技·莫因舍弃而哭泣\n（释放后击杀所有残破容器）\n之后每 5 回合重复。\n\n胜利条件：击败盗罐行者即可获胜，残留的残破容器不需要清空。\n盗罐行者自身攻击造成的扣血最低保留 1 点，不会因此阵亡。',
    pickEnemyTarget: true,
  },
  {
    id: 'tang',
    name: '现代最唐',
    artId: 'doubao',
    aiCharacters: ['char-doubao', 'char-naiva'],
    mechanic:
      '敌方最多存在 2 张角色牌。\n你攻击时可以选择任意一名敌方角色作为目标：该目标在本次攻击中视为前台，其余角色视为后台。\n\n敌方行动循环：\n第 1 回合：豆包普攻 + 战技\n第 2 回合：奶蛙普攻 + 战技\n第 3 回合：合体为奶豆，奶豆连续两次普攻后释放大招·光速道歉\n第 4 回合：奶豆不行动\n第 5 回合：奶豆战技，随后解除合体\n之后每 5 回合重复。\n\n胜利条件：豆包和奶蛙同时死亡，或击杀奶豆。回合开始时阵亡的豆包/奶蛙会复活到 6 点生命。',
    pickEnemyTarget: true,
  },
]

export const STAGE_MAP: Record<string, StageDef> = Object.fromEntries(
  STAGES.map((stage) => [stage.id, stage]),
)
