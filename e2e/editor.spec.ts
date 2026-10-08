import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

/**
 * 間取図の編集で、よく使う操作が壊れていないかを画面で確かめる。
 * これまでに起きた不具合（扉の幅を ▲▼ で変えられない、窓をクリックしても選べない、
 * 出力に扉の目印が写る、など）を、もう一度起きないよう見張る。
 *
 * サンプル表示（AI を使わない）の間取図で確かめる。
 */

const BLANK_PNG = new URL('./fixtures/blank.png', import.meta.url).pathname

/** サンプルの間取図を開いて、編集タブにする */
async function openSample(page: Page) {
  await page.goto('/')
  await page.getByLabel('サンプル表示（解析なし）').check()
  await page.locator('.upload-panel input[type=file]').setInputFiles(BLANK_PNG)
  await page.getByRole('button', { name: 'サンプル間取図を表示' }).click()
  await expect(page.locator('svg.floor-canvas')).toHaveCount(2)
  await expect(page.getByRole('tab', { name: /② 編集/ })).toHaveAttribute('aria-selected', 'true')
}

/** 「要素を選択」で選ぶ（小さい扉・窓も確実に選べる） */
async function selectElement(page: Page, key: string) {
  await page.locator('#element-select').selectOption(key)
}

/** 図面上の要素を、人と同じように見えている位置でクリックする（図面は拡大縮小の枠の中にあるため） */
async function clickOnPlan(page: Page, selector: string) {
  await page.locator('svg.floor-canvas').first().scrollIntoViewIfNeeded()
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`${selector} が見つかりません`)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

/** 図面上の要素の画面上の大きさ */
async function boxOf(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`${selector} が見つかりません`)
  return box
}

test.describe('間取図の編集', () => {
  test('サンプルを開くと、1階・2階が並び、編集時間が出る', async ({ page }) => {
    await openSample(page)
    await expect(page.locator('svg.floor-canvas[data-floor-label="1階"]')).toBeVisible()
    await expect(page.locator('svg.floor-canvas[data-floor-label="2階"]')).toBeVisible()
    await expect(page.locator('.edit-time-status')).toContainText('編集')
  })

  test('部屋の幅を数字で変えると図面が変わり、「一手戻る」で戻る', async ({ page }) => {
    await openSample(page)
    await selectElement(page, 'room:1f:japanese')
    const width = page.getByLabel('幅（mm）')
    await expect(width).toHaveValue('2100')
    const before = await boxOf(page, '[data-room-id="japanese"]')

    await width.fill('2400')
    await width.press('Enter')
    await expect(width).toHaveValue('2400')
    const after = await boxOf(page, '[data-room-id="japanese"]')
    expect(after.width).toBeGreaterThan(before.width + 1)

    await page.getByRole('button', { name: '一手戻る' }).click()
    await selectElement(page, 'room:1f:japanese')
    await expect(page.getByLabel('幅（mm）')).toHaveValue('2100')
  })

  test('扉の幅は ▲▼（矢印キー）でその場で変わる', async ({ page }) => {
    await openSample(page)
    const firstDoor = await page
      .locator('#element-select option')
      .evaluateAll((options) => (options as HTMLOptionElement[]).map((o) => o.value).find((v) => v.startsWith('door:1f:')))
    expect(firstDoor).toBeTruthy()
    await selectElement(page, firstDoor!)
    const width = page.locator('#door-width')
    const start = Number(await width.inputValue())
    // 図面の扉の大きさ（図面の単位。拡大率に左右されない）
    const doorId = firstDoor!.split(':')[2]
    const doorSize = () =>
      page.locator(`svg.floor-canvas [data-door-id="${doorId}"]`).first().evaluate((el) => {
        const b = (el as SVGGraphicsElement).getBBox()
        return Math.max(b.width, b.height)
      })
    const before = await doorSize()
    await width.focus()
    await width.press('ArrowUp')
    await expect(width).toHaveValue(String(start + 50))
    // 欄を離れなくても、図面の扉がその場で大きくなる（以前は離れるまで反映されなかった）
    await expect.poll(doorSize).toBeGreaterThan(before + 1)
  })

  test('窓は図面上でクリックして選べる', async ({ page }) => {
    await openSample(page)
    await clickOnPlan(page, 'svg.floor-canvas[data-floor-id="1f"] .window-hit-line')
    await expect(page.locator('.edit-selection')).toContainText('窓')
    await expect(page.locator('#window-width')).toBeVisible()
  })

  test('階段を L字・2方向に段にし、辺の取っ手をドラッグして長くできる', async ({ page }) => {
    await openSample(page)
    await selectElement(page, 'stair:1f:st1')
    await page.locator('#stair-layout').selectOption('l-right')
    await page.locator('svg.floor-canvas').first().scrollIntoViewIfNeeded()
    await expect(page.locator('.selection-toolbar')).toContainText('段（後）')
    await expect(page.locator('#stair-turn-length')).toBeVisible()

    const length = page.locator('#stair-length')
    const before = Number(await length.inputValue())
    // 取っ手のうち、いちばん下にある横の辺をドラッグして下へ伸ばす
    const handles = page.locator('.stair-resize-handle')
    // 長方形の4辺に加えて内側の辺にも出る（拡大率によっては短い辺の取っ手は出ない）
    await expect.poll(async () => handles.count()).toBeGreaterThanOrEqual(5)
    const boxes = await handles.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, cursor: (el as SVGElement).style.cursor }
      })
    )
    const bottom = boxes.filter((b) => b.cursor === 'ns-resize').sort((a, b) => b.y - a.y)[0]
    await page.mouse.move(bottom.x, bottom.y)
    await page.mouse.down()
    await page.mouse.move(bottom.x, bottom.y + 30, { steps: 5 })
    await page.mouse.up()
    // 上り方向（上向き）の階段を下へ伸ばすと、長さが増える
    await expect.poll(async () => Number(await length.inputValue())).toBeGreaterThan(before)
  })

  test('数 cm ずれた壁は「まとめてそろえる」で1本に戻る', async ({ page }) => {
    await openSample(page)
    await selectElement(page, 'room:1f:japanese')
    const width = page.getByLabel('幅（mm）')
    await width.fill('2070')
    await width.press('Enter')
    const align = page.getByRole('button', { name: /ずれた壁をまとめてそろえる/ })
    await expect(align).toBeVisible()
    await align.click()
    await expect(align).toHaveCount(0)
    await expect(page.getByLabel('幅（mm）')).toHaveValue('2100')
  })

  test('SVG に出力すると、編集用の目印（扉の丸・取っ手）が写らない', async ({ page }) => {
    await openSample(page)
    await selectElement(page, 'stair:1f:st1')
    await page.getByRole('tab', { name: /③ 出力/ }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'SVG' }).click()])
    const path = await download.path()
    const svg = readFileSync(path, 'utf-8')
    expect(svg).toContain('<svg')
    for (const editOnly of ['door-hit', 'window-hit-line', 'resize-handles-layer', 'grid-lines-layer']) {
      expect(svg).not.toContain(editOnly)
    }
  })

  test('再読み込みしても「続きから編集」で戻せる', async ({ page }) => {
    await openSample(page)
    await selectElement(page, 'room:1f:japanese')
    const width = page.getByLabel('幅（mm）')
    await width.fill('2400')
    await width.press('Enter')
    await expect(page.locator('.autosave-status')).toContainText('自動保存')

    await page.reload()
    await page.getByRole('button', { name: '続きから編集' }).click()
    await expect(page.locator('svg.floor-canvas')).toHaveCount(2)
    await selectElement(page, 'room:1f:japanese')
    await expect(page.getByLabel('幅（mm）')).toHaveValue('2400')
  })
})
