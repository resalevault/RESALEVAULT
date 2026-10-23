/**
 * RESALEVAULT - Prueba DEFINITIVA de desplazamiento con la rueda.
 *
 * Usa sendInputEvent con la ventana ENFOCADA (condicion necesaria para que
 * Electron entregue la rueda). Para cada pantalla comprueba que un gesto de
 * rueda baja y sube el contenido cuando este desborda.
 *
 * OJO con el signo: sendInputEvent(deltaY = -N) produce DOM wheel deltaY = +N
 * (bajar). Se comprueba empiricamente antes de medir.
 */

import { BrowserWindow, app } from 'electron'
import { mkdtempSync, rmSync, writeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EV } from '@shared/api'
import { registerIpcHandlers } from '@main/ipc/register'
import { registerModuleHandlers } from '@main/ipc/register-modules'
import { registerTrackingHandlers } from '@main/ipc/register-tracking'
import { CarrierBrowser } from '@main/services/browser/carrier-browser'
import { FinanceService } from '@main/services/finance'
import { CsvService } from '@main/services/csv-io'
import { IntelligenceService } from '@main/services/intelligence'
import { LabelService } from '@main/services/labels'
import { LicenseService } from '@main/services/license'
import { LicenceOnlineClient } from '@main/services/licence-online'
import { LinkService } from '@main/services/links'
import { MediaService } from '@main/services/media'
import { AiService } from '@main/services/ai/service'
import { createOsSecretStore } from '@main/services/ai/os-secret-store'
import { BackupService } from '@main/services/backup/service'
import { openDatabase } from '@main/services/bootstrap'
import { Logger } from '@main/services/logger'
import { configureAppIdentity, getAppPaths } from '@main/services/paths'
import { applySecurityPolicy } from '@main/services/security'

const workDir = mkdtempSync(join(tmpdir(), 'resalevault-scrollfinal-'))
configureAppIdentity()
app.setPath('userData', workDir)
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function main(): Promise<void> {
  const paths = getAppPaths()
  const logger = new Logger({ file: paths.logFile, level: 'error', console: false })
  const opened = openDatabase({ paths, logger, defaultLocale: 'es' })
  applySecurityPolicy()
  const window = new BrowserWindow({
    width: 1280, height: 800, show: true, frame: true,
    webPreferences: { preload: join(__dirname, 'preload', 'index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  const broadcast = (entity: unknown): void => { if (!window.isDestroyed()) window.webContents.send(EV.dataChanged, entity) }
  registerIpcHandlers({ repos: opened.repos, paths, logger, version: 'sf', getMainWindow: () => window, broadcastDataChanged: broadcast })
  const settings = opened.repos.settings
  const finance = new FinanceService(opened.db, settings.get().staleThresholds, settings.get().targetMarginPercent)
  registerModuleHandlers({
    repos: opened.repos, paths, logger, getMainWindow: () => window, broadcastDataChanged: broadcast,
    media: new MediaService(opened.db, { mediaDir: paths.media, thumbnailsDir: paths.thumbs }),
    labels: new LabelService(opened.db), finance,
    csv: new CsvService(opened.repos, finance, () => settings.get().locale),
    intelligence: new IntelligenceService(opened.db),
    license: new LicenseService(opened.db, new LicenceOnlineClient(opened.db, { endpoint: 'https://i.invalid/fn', fetchImpl: (async () => { throw new Error('x') }) as unknown as typeof fetch })),
    links: new LinkService(),
    ai: new AiService(opened.db, opened.repos.products, { secrets: createOsSecretStore() }),
    backups: new BackupService(opened.db, { appVersion: '0', dataDir: paths.data, mediaDir: paths.media, backupsDir: paths.backups, databaseFile: paths.database })
  })
  const b = new CarrierBrowser(logger, { onStateChange: () => undefined, onPopupBlocked: () => undefined, onDownloadBlocked: () => undefined })
  b.attachToWindow(window)
  registerTrackingHandlers({ repos: opened.repos, logger, getMainWindow: () => window, broadcastDataChanged: broadcast, browser: b })

  await window.loadFile(join(__dirname, 'renderer', 'index.html'))
  await sleep(1400)
  const evaluate = <T,>(code: string): Promise<T> => window.webContents.executeJavaScript(code, true) as Promise<T>

  // Datos de prueba suficientes para que TODAS las pantallas desborden.
  const productIds: string[] = []
  for (let i = 0; i < 40; i += 1) {
    const r = await evaluate<string>(
      `window.resalevault.products.create({ name: 'P${i}', purchasePriceCents: 1000, expectedSalePriceCents: 2000 }).then((x) => JSON.stringify(x))`
    )
    const parsed = JSON.parse(r) as { ok: boolean; data?: { id: string } }
    if (parsed.data?.id) productIds.push(parsed.data.id)
  }
  await evaluate(
    `(async () => {
       for (let i = 0; i < 30; i += 1) {
         await window.resalevault.categories.create({ name: 'Categoria ' + i }).catch(() => undefined);
         await window.resalevault.locations.create({ name: 'Ubicacion ' + i }).catch(() => undefined);
         await window.resalevault.suppliers.create({ name: 'Proveedor ' + i }).catch(() => undefined);
         await window.resalevault.tracking.create({ carrierId: 'seur', code: 'TEST' + i + '000000' }).catch(() => undefined);
       }
       for (let i = 0; i < 30; i += 1) {
         await window.resalevault.orders.create({ soldAt: new Date().toISOString().slice(0, 10), items: [{ productId: '${productIds[0]}', unitPriceCents: 2000 }], fees: [{ kind: 'commission', amountCents: 100 }] }).catch(() => undefined);
       }
       return 'ok';
     })()`
  )
  await sleep(2000)

  window.show(); window.focus(); window.webContents.focus()
  await sleep(900)

  const labels = ['Panel', 'Inventario', 'Categorias', 'Ubicaciones', 'Compras', 'Pedidos', 'Preparacion', 'Analitica', 'Importar / Exportar', 'Shipping Tracker', 'Intelligence', 'Ajustes']
  const report: string[] = ['\nDESPLAZAMIENTO CON LA RUEDA (definitivo)\n=======================================']
  let fails = 0

  for (const label of labels) {
    const clicked = await evaluate<boolean>(
      `(() => { const t = [...document.querySelectorAll('.navitem')].find((e) => e.textContent.includes(${JSON.stringify(label)})); if (!t) return false; t.click(); return true })()`
    )
    if (!clicked) { report.push(`-- ${label}: no encontrado en la navegacion`); continue }
    await sleep(1100)

    const info = JSON.parse(await evaluate<string>(
      `(() => {
         const page = document.querySelector('.content-body .page');
         page.scrollTop = 0;
         const r = page.getBoundingClientRect();
         return JSON.stringify({ title: (document.querySelector('.page-title')?.textContent ?? '').trim(), scroll: page.scrollHeight + '/' + page.clientHeight, overflows: page.scrollHeight > page.clientHeight, cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + Math.min(r.height / 2, 260)) });
       })()`
    )) as { title: string; scroll: string; overflows: boolean; cx: number; cy: number }

    // Gesto hacia abajo (deltaY negativo en sendInputEvent = bajar en el DOM).
    window.webContents.sendInputEvent({ type: 'mouseWheel', x: info.cx, y: info.cy, deltaY: -500, wheelTicksY: 3, canScroll: true } as never)
    await sleep(450)
    const top1 = await evaluate<number>(`document.querySelector('.content-body .page').scrollTop`)
    // Gesto hacia arriba.
    window.webContents.sendInputEvent({ type: 'mouseWheel', x: info.cx, y: info.cy, deltaY: 500, wheelTicksY: -3, canScroll: true } as never)
    await sleep(450)
    const top2 = await evaluate<number>(`document.querySelector('.content-body .page').scrollTop`)

    const downOk = top1 > 0
    const upOk = top2 < top1
    if (info.overflows && (!downOk || !upOk)) fails += 1
    report.push(
      `-- ${label} (${info.title}): altura=${info.scroll} desborda=${info.overflows} | ` +
        `bajar 0->${top1} ${downOk ? 'OK' : 'FALLO'} | subir ${top1}->${top2} ${upOk ? 'OK' : 'FALLO'}`
    )
  }

  window.destroy()
  opened.db.close()
  await sleep(300)
  try { rmSync(workDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 }) } catch { /* cortesia */ }
  report.push(`\nPantallas con fallo de scroll: ${fails}`)
  writeSync(1, report.join('\n') + '\n')
  app.exit(fails === 0 ? 0 : 1)
}

app.whenReady().then(() => main().catch((e: unknown) => { process.stderr.write(String((e as Error).stack ?? e) + '\n'); app.exit(1) }))
app.on('window-all-closed', () => undefined)
