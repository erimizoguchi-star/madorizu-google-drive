import type { Floor, FloorPlan } from '../types/floorPlan'

/**
 * 階の追加・名前変更・並べ替え・削除。
 * 階ごとに別の図面を解析して、1枚の間取図にまとめるために使う。
 */

/** 「2階」「2F」「２Ｆ」などから階の数字を読む。読めなければ null */
export function floorNumberOf(floor: Pick<Floor, 'label' | 'name'>): number | null {
  for (const text of [floor.label, floor.name]) {
    const half = (text ?? '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    const m = half.match(/(\d+)/)
    if (m) return Number(m[1])
  }
  return null
}

function sameLabel(a: string, b: string): boolean {
  return a.trim() === b.trim()
}

/**
 * 別に解析した間取図の階を、今の間取図の後ろに加える。
 * - 階の id が重なれば付け直す（選択や編集が階の id で区別しているため）
 * - 階名が今の階と重なれば、次の階番号（今ある最大の階 + 1）を付ける。
 *   1階ずつの図面を解析すると、どれも「1階」と読まれやすいため
 */
export function appendFloors(
  base: FloorPlan,
  added: FloorPlan
): { floorPlan: FloorPlan; addedFloorIds: string[] } | { error: string } {
  if ((base.scaleMm ?? 100) !== (added.scaleMm ?? 100)) {
    return { error: '縮尺の単位が違う間取図なので、階として追加できません。' }
  }
  if (added.floors.length === 0) {
    return { error: '追加する間取図に階がありません。' }
  }

  const floors = [...base.floors]
  const usedIds = new Set(floors.map((f) => f.id))
  const addedFloorIds: string[] = []

  for (const source of added.floors) {
    let id = source.id
    for (let n = floors.length; usedIds.has(id); n++) id = `floor-${n}`
    usedIds.add(id)

    let { name, label } = source
    if (floors.some((f) => sameLabel(f.label, label) || sameLabel(f.name, name))) {
      const numbers = floors.map(floorNumberOf).filter((n): n is number => n != null)
      const next = (numbers.length > 0 ? Math.max(...numbers) : floors.length) + 1
      name = `${next}F`
      label = `${next}階`
    }

    floors.push({ ...source, id, name, label })
    addedFloorIds.push(id)
  }

  return { floorPlan: { ...base, floors }, addedFloorIds }
}

/** 階名を変える。表示は label、name も同じにそろえる */
export function renameFloor(plan: FloorPlan, floorId: string, label: string): FloorPlan {
  return {
    ...plan,
    floors: plan.floors.map((f) => (f.id === floorId ? { ...f, label, name: label } : f)),
  }
}

/** 階の並び順を1つ前（-1）または後ろ（+1）へずらす。表示は左から並び順のとおり */
export function moveFloor(plan: FloorPlan, floorId: string, delta: -1 | 1): FloorPlan {
  const index = plan.floors.findIndex((f) => f.id === floorId)
  const target = index + delta
  if (index < 0 || target < 0 || target >= plan.floors.length) return plan
  const floors = [...plan.floors]
  ;[floors[index], floors[target]] = [floors[target], floors[index]]
  return { ...plan, floors }
}

/** 階を削除する。最後の1階は消さない */
export function removeFloor(plan: FloorPlan, floorId: string): FloorPlan {
  if (plan.floors.length <= 1) return plan
  const floors = plan.floors.filter((f) => f.id !== floorId)
  if (floors.length === plan.floors.length) return plan
  return { ...plan, floors }
}
