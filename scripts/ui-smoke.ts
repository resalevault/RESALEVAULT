/**
 * RESALEVAULT - Prueba de humo de la interfaz dentro de Electron.
 *
 * Carga el HTML COMPILADO (out/renderer/index.html) con el preload real,
 * registra los mismos manejadores IPC que la aplicacion y despues:
 *   - comprueba que el puente seguro esta disponible,
 *   - crea datos a traves del puente (no por debajo),
 *   - pulsa de verdad el elemento de navegacion "Inventario" y verifica que la
 *     tabla pinta el articulo creado,
 *   - cambia el idioma y comprueba que los textos cambian.
 *
 * Trabaja sobre una carpeta de datos temporal: NO toca el inventario real.
 *
 * Uso:  npm run smoke:ui
 */

import { BrowserWindow, app } from 'electron'
import { mkdtempSync, readdirSync, rmSync, writeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EV } from '@shared/api'
import { EV_TRACKING } from '@shared/api-modules'
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

const workDir = mkdtempSync(join(tmpdir(), 'resalevault-ui-'))

/**
 * Chromium mantiene bloqueados algunos de sus archivos de perfil hasta que sus
 * procesos auxiliares terminan, asi que la carpeta temporal de la ejecucion
 * ANTERIOR puede no haberse podido borrar. Aqui se limpian esas sobras al
 * empezar, antes de que el nuevo Chromium las bloquee.
 */
function cleanStaleTempDirs(): void {
  const base = tmpdir()
  try {
    for (const entry of readdirSync(base)) {
      if (!entry.startsWith('resalevault-ui-') && !entry.startsWith('resalevault-smoke-')) continue
      const candidate = join(base, entry)
      if (candidate === workDir) continue
      try {
        rmSync(candidate, { recursive: true, force: true })
      } catch {
        // Sigue bloqueada: se intentara en la proxima ejecucion.
      }
    }
  } catch {
    // Si no se puede leer el directorio temporal, no es critico.
  }
}

// IMPORTANTE: la carpeta de datos se redirige ANTES de que la aplicacion
// consulte ninguna ruta. Asi la prueba nunca toca el inventario del usuario.
configureAppIdentity()
app.setPath('userData', workDir)

let passed = 0
const failures: string[] = []

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1
    process.stdout.write(`  ok   ${label}\n`)
  } else {
    failures.push(`${label}${detail ? ` -> ${detail}` : ''}`)
    process.stdout.write(`  FAIL ${label}${detail ? ` -> ${detail}` : ''}\n`)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main(): Promise<void> {
  cleanStaleTempDirs()

  process.stdout.write('\nRESALEVAULT - prueba de humo de la interfaz\n')
  process.stdout.write('=========================================\n\n')

  const paths = getAppPaths()
  const logger = new Logger({ file: paths.logFile, level: 'error', console: false })

  const opened = openDatabase({ paths, logger, defaultLocale: 'es' })
  applySecurityPolicy()

  const window = new BrowserWindow({
    width: 1480,
    height: 940,
    show: false,
    frame: false,
    webPreferences: {
      preload: join(__dirname, 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  registerIpcHandlers({
    repos: opened.repos,
    paths,
    logger,
    version: '0.0.0-smoke',
    getMainWindow: () => window,
    // Se replica EXACTAMENTE el cableado de `src/main/index.ts`, para que la
    // prueba verifique el bucle completo: IPC -> proceso principal -> evento ->
    // recarga de la interfaz.
    broadcastDataChanged: (entity) => {
      if (!window.isDestroyed()) {
        window.webContents.send(EV.dataChanged, entity)
      }
    }
  })

  const settings = opened.repos.settings
  const finance = new FinanceService(
    opened.db,
    settings.get().staleThresholds,
    settings.get().targetMarginPercent
  )
  registerModuleHandlers({
    repos: opened.repos,
    paths,
    logger,
    getMainWindow: () => window,
    broadcastDataChanged: (entity) => {
      if (!window.isDestroyed()) {
        window.webContents.send(EV.dataChanged, entity)
      }
    },
    media: new MediaService(opened.db, { mediaDir: paths.media, thumbnailsDir: paths.thumbs }),
    labels: new LabelService(opened.db),
    finance,
    csv: new CsvService(opened.repos, finance, () => settings.get().locale),
    intelligence: new IntelligenceService(opened.db),
    license: new LicenseService(
      opened.db,
      // Cliente online con `fetch` SIMULADA: la prueba de humo nunca sale a
      // internet. Devuelve "sin red" para ejercitar el camino offline real.
      new LicenceOnlineClient(opened.db, {
        endpoint: 'https://smoke.invalid/fn',
        fetchImpl: (async () => {
          throw new Error('smoke: sin red')
        }) as unknown as typeof fetch
      })
    ),
    links: new LinkService(),
    ai: new AiService(opened.db, opened.repos.products, { secrets: createOsSecretStore() }),
    backups: new BackupService(opened.db, {
      appVersion: '0.0.0-smoke',
      dataDir: paths.data,
      mediaDir: paths.media,
      backupsDir: paths.backups,
      databaseFile: paths.database
    })
  })

  const smokeBrowser = new CarrierBrowser(logger, {
    onStateChange: (state) => {
      if (!window.isDestroyed()) window.webContents.send(EV_TRACKING.browserStateChanged, state)
    },
    onPopupBlocked: (url) => {
      if (!window.isDestroyed()) {
        window.webContents.send(EV_TRACKING.browserPopupBlocked, {
          url,
          carrierName: smokeBrowser.getState().carrierName
        })
      }
    },
    onDownloadBlocked: (filename) => {
      if (!window.isDestroyed()) window.webContents.send(EV_TRACKING.browserDownloadBlocked, filename)
    }
  })
  smokeBrowser.attachToWindow(window)
  registerTrackingHandlers({
    repos: opened.repos,
    logger,
    getMainWindow: () => window,
    broadcastDataChanged: (entity) => {
      if (!window.isDestroyed()) window.webContents.send(EV.dataChanged, entity)
    },
    browser: smokeBrowser
  })

  const rendererErrors: string[] = []
  window.webContents.on('console-message', (...args: unknown[]) => {
    const first = args[0] as { level?: number | string; message?: string } | undefined
    const message = first && typeof first === 'object' && 'message' in first ? String(first.message) : String(args[1] ?? '')
    const level = first && typeof first === 'object' ? first.level : args[0]
    if (level === 'error' || level === 3 || String(level) === 'error') rendererErrors.push(message)
  })

  await window.loadFile(join(__dirname, 'renderer', 'index.html'))
  // Se espera a que React monte y a que terminen las consultas iniciales.
  await sleep(1200)

  const evaluate = <T,>(code: string): Promise<T> =>
    window.webContents.executeJavaScript(code, true) as Promise<T>

  // -------------------------------------------------------------------------
  process.stdout.write('Arranque de la interfaz\n------------------------\n')
  // -------------------------------------------------------------------------
  check('el puente seguro esta disponible', await evaluate<boolean>("typeof window.resalevault === 'object'"))
  check(
    'no se ha mostrado la pantalla de error critico',
    !(await evaluate<boolean>("document.body.innerText.includes('RESALEVAULT no puede arrancar')"))
  )
  check('React ha montado contenido', (await evaluate<number>("document.querySelector('#root').childElementCount")) > 0)

  const navCount = await evaluate<number>("document.querySelectorAll('.navitem').length")
  check('la navegacion lateral tiene las 15 secciones', navCount === 15, `encontradas ${navCount}`)

  const title = await evaluate<string>("document.querySelector('.page-title')?.textContent ?? ''")
  check('se abre en el panel', title === 'Panel', `titulo: ${title}`)

  check(
    'el monograma RV esta en la barra de titulo',
    (await evaluate<string>("document.querySelector('.monogram')?.textContent ?? ''")) === 'RV'
  )

  check(
    'el estado vacio explica que hacer',
    await evaluate<boolean>("document.querySelector('.empty__title') !== null")
  )

  // -------------------------------------------------------------------------
  process.stdout.write('\nOperaciones a traves del puente IPC\n-----------------------------------\n')
  // -------------------------------------------------------------------------
  const createResult = await evaluate<string>(
    `window.resalevault.products.create({ name: 'Articulo desde la interfaz', purchasePriceCents: 1500, acquisitionFeesCents: 300, expectedSalePriceCents: 4900 })
       .then((r) => JSON.stringify(r))`
  )
  const created = JSON.parse(createResult) as { ok: boolean; data?: { id: string; sku: string } }
  check('el articulo se crea a traves del puente', created.ok === true, createResult.slice(0, 160))
  check('el SKU se genera en el proceso principal', Boolean(created.data?.sku?.startsWith('RV-')), created.data?.sku)

  const rejectResult = await evaluate<string>(
    `window.resalevault.products.create({ name: '' }).then((r) => JSON.stringify(r))`
  )
  const rejected = JSON.parse(rejectResult) as { ok: boolean; error?: { code: string } }
  check('la validacion rechaza un nombre vacio', rejected.ok === false && rejected.error?.code === 'invalid_input')

  const forbidden = await evaluate<string>(
    `window.resalevault.products.list({ pageSize: 99999 }).then((r) => JSON.stringify(r))`
  )
  check('se rechaza un pageSize fuera de rango', (JSON.parse(forbidden) as { ok: boolean }).ok === false)

  const summaryResult = await evaluate<string>(
    `window.resalevault.dashboard.summary().then((r) => JSON.stringify(r))`
  )
  const summary = JSON.parse(summaryResult) as {
    ok: boolean
    data?: { totalItems: number; capitalInvestedCents: number }
  }
  check('el panel refleja el articulo creado', summary.data?.totalItems === 1, String(summary.data?.totalItems))
  check('el capital invertido se calcula', summary.data?.capitalInvestedCents === 1800, String(summary.data?.capitalInvestedCents))

  // Al crear el articulo, el proceso principal notifica el cambio y el panel se
  // recarga solo: se comprueba que la interfaz ya no muestra el estado vacio.
  await sleep(800)
  const kpiCount = await evaluate<number>("document.querySelectorAll('.kpi').length")
  check('el panel se refresca solo y muestra los 8 indicadores', kpiCount === 8, `indicadores ${kpiCount}`)
  check(
    'el estado vacio ha desaparecido',
    !(await evaluate<boolean>("document.querySelector('.empty__title') !== null"))
  )

  // -------------------------------------------------------------------------
  process.stdout.write('\nNavegacion real en la interfaz\n------------------------------\n')
  // -------------------------------------------------------------------------
  await evaluate<null>(
    `(() => { const items = [...document.querySelectorAll('.navitem')];
       const target = items.find((el) => el.textContent.includes('Inventario'));
       target.click(); return null })()`
  )
  await sleep(700)

  const inventoryTitle = await evaluate<string>("document.querySelector('.page-title')?.textContent ?? ''")
  check('se abre la pantalla de inventario', inventoryTitle === 'Inventario', `titulo: ${inventoryTitle}`)

  const rowCount = await evaluate<number>("document.querySelectorAll('table.table tbody tr').length")
  check('la tabla pinta el articulo creado', rowCount === 1, `filas ${rowCount}`)

  const firstCell = await evaluate<string>(
    "document.querySelector('table.table tbody tr td:nth-child(2)')?.textContent ?? ''"
  )
  check('la fila muestra el SKU generado', firstCell === created.data?.sku, `celda: ${firstCell}`)

  const statusCount = await evaluate<number>("document.querySelectorAll('.badge').length")
  check('se pinta la insignia de estado', statusCount > 0)

  // -------------------------------------------------------------------------
  process.stdout.write('\nPedido y beneficio NETO\n-----------------------\n')
  // -------------------------------------------------------------------------
  const orderResult = await evaluate<string>(
    `window.resalevault.orders.create({
       soldAt: new Date().toISOString().slice(0, 10),
       items: [{ productId: '${created.data?.id ?? ''}', unitPriceCents: 4900 }],
       fees: [{ kind: 'commission', amountCents: 490 }]
     }).then((r) => JSON.stringify(r))`
  )
  const order = JSON.parse(orderResult) as {
    ok: boolean
    data?: { id: string; orderNumber: string; financials: { netProfitCents: number } }
  }
  check('el pedido se crea a traves del puente', order.ok === true, orderResult.slice(0, 160))
  // Coste del articulo: 1500 + 300 = 1800. 4900 - 1800 - 490 = 2610.
  check(
    'el beneficio NETO se calcula descontando comision y coste',
    order.data?.financials.netProfitCents === 2610,
    String(order.data?.financials.netProfitCents)
  )

  await evaluate<null>(
    `(() => { const items = [...document.querySelectorAll('.navitem')];
       const target = items.find((el) => el.textContent.includes('Pedidos'));
       target.click(); return null })()`
  )
  await sleep(700)

  const ordersTitle = await evaluate<string>("document.querySelector('.page-title')?.textContent ?? ''")
  check('se abre la pantalla de pedidos', ordersTitle === 'Pedidos', `titulo: ${ordersTitle}`)

  const ordersRowCount = await evaluate<number>("document.querySelectorAll('table.table tbody tr').length")
  check('la tabla de pedidos muestra el pedido creado', ordersRowCount === 1, `filas ${ordersRowCount}`)

  const netProfitText = await evaluate<string>(
    "document.querySelector('table.table tbody tr td:nth-child(8)')?.textContent ?? ''"
  )
  check('la columna de beneficio neto muestra el importe', netProfitText.includes('26,10'), `celda: ${netProfitText}`)

  // -------------------------------------------------------------------------
  process.stdout.write('\nAI Studio\n---------\n')
  // -------------------------------------------------------------------------
  await evaluate<null>(
    `(() => { const items = [...document.querySelectorAll('.navitem')];
       const target = items.find((el) => el.textContent.includes('AI Studio'));
       target.click(); return null })()`
  )
  await sleep(700)

  const aiTitle = await evaluate<string>("document.querySelector('.page-title')?.textContent ?? ''")
  check('se abre AI Studio', aiTitle === 'AI Studio', `titulo: ${aiTitle}`)
  check(
    'sin licencia avisa de que el plan no incluye IA',
    await evaluate<boolean>("document.body.innerText.includes('Vault Pro')")
  )
  check(
    'no simula ninguna respuesta de IA',
    await evaluate<boolean>("document.querySelector('pre') === null")
  )

  // -------------------------------------------------------------------------
  process.stdout.write('\nCopias de seguridad\n-------------------\n')
  // -------------------------------------------------------------------------
  await evaluate<null>(
    `(() => { const items = [...document.querySelectorAll('.navitem')];
       const target = items.find((el) => el.textContent.includes('Ajustes'));
       target.click(); return null })()`
  )
  await sleep(700)

  const settingsTitle = await evaluate<string>("document.querySelector('.page-title')?.textContent ?? ''")
  check('se abre Ajustes', settingsTitle === 'Ajustes', `titulo: ${settingsTitle}`)

  check(
    'la tarjeta de copias esta presente',
    await evaluate<boolean>(
      "document.body.innerText.toLowerCase().includes('copias de seguridad')"
    )
  )

  // Se pulsa de verdad el boton de crear copia.
  const clicked = await evaluate<boolean>(
    `(() => { const buttons = [...document.querySelectorAll('button')];
       const target = buttons.find((el) => el.textContent.includes('Crear copia ahora'));
       if (!target) return false;
       target.click(); return true })()`
  )
  check('se puede crear una copia desde la interfaz', clicked)
  await sleep(1800)

  const backupFiles = readdirSync(paths.backups).filter((name) => name.endsWith('.zip'))
  check('la copia se ha escrito en disco', backupFiles.length === 1, `archivos: ${backupFiles.length}`)

  check(
    'la copia aparece en la lista de la interfaz',
    await evaluate<boolean>("document.body.innerText.includes('resalevault-backup-')")
  )

  // -------------------------------------------------------------------------
  process.stdout.write('\nShipping Tracker\n----------------\n')
  // -------------------------------------------------------------------------
  await evaluate<null>(
    `(() => { const items = [...document.querySelectorAll('.navitem')];
       const target = items.find((el) => el.textContent.includes('Shipping Tracker'));
       if (!target) return null;
       target.click(); return null })()`
  )
  await sleep(700)

  const trackerTitle = await evaluate<string>("document.querySelector('.page-title')?.textContent ?? ''")
  check('se abre Shipping Tracker', trackerTitle === 'Shipping Tracker', `titulo: ${trackerTitle}`)

  check(
    'el estado vacio invita a anadir el primer codigo',
    await evaluate<boolean>("document.body.innerText.toLowerCase().includes('anadir codigo')")
  )

  // Pestana de transportistas: se comprueba que el catalogo se ha cargado.
  await evaluate<null>(
    `(() => { const buttons = [...document.querySelectorAll('.segmented button')];
       const target = buttons.find((el) => el.textContent.includes('Transportistas'));
       if (target) target.click(); return null })()`
  )
  await sleep(500)

  const carrierCards = await evaluate<number>("document.querySelectorAll('.carrier-card').length")
  check('el directorio de transportistas se carga', carrierCards >= 40, `tarjetas: ${carrierCards}`)

  const badges = await evaluate<number>("document.querySelectorAll('.carrier-badge').length")
  check('cada transportista tiene su distintivo', badges >= 40, `distintivos: ${badges}`)

  // Crear un codigo a traves del formulario real de la interfaz.
  await evaluate<null>(
    `(() => { const buttons = [...document.querySelectorAll('.segmented button')];
       const target = buttons.find((el) => el.textContent.includes('Tus codigos'));
       if (target) target.click(); return null })()`
  )
  await sleep(400)

  const openedModal = await evaluate<boolean>(
    `(() => { const buttons = [...document.querySelectorAll('button')];
       const target = buttons.find((el) => el.textContent.includes('Anadir codigo'));
       if (!target) return false;
       target.click(); return true })()`
  )
  check('el formulario de alta se abre', openedModal)
  await sleep(500)

  // Se rellenan los campos con los setters nativos para que React los registre.
  const filled = await evaluate<boolean>(
    `(() => {
       const setValue = (el, value) => {
         const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
         const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
         setter.call(el, value)
         el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
       }
       const inputs = [...document.querySelectorAll('.modal input')]
       const codeInput = inputs.find((el) => el.placeholder && el.placeholder.includes('1234567890'))
       if (!codeInput) return false
       setValue(codeInput, 'SMOKE123456')

       const selects = [...document.querySelectorAll('.modal select')]
       const carrierSelect = selects.find((el) => el.value === '')
       if (!carrierSelect) return false
       setValue(carrierSelect, 'seur')

       const nameInput = inputs.find((el) => el.placeholder && el.placeholder.includes('zapatillas'))
       if (nameInput) setValue(nameInput, 'Envio de prueba')
       return true
     })()`
  )
  check('los campos del formulario se pueden rellenar', filled)
  await sleep(300)

  const submitted = await evaluate<boolean>(
    `(() => { const buttons = [...document.querySelectorAll('.modal__footer button')];
       const target = buttons.find((el) => el.textContent.trim() === 'Crear');
       if (!target) return false;
       target.click(); return true })()`
  )
  check('el formulario se envia', submitted)
  await sleep(900)

  const trackcodeRows = await evaluate<number>("document.querySelectorAll('table.table tbody tr').length")
  check('el codigo guardado aparece en la lista', trackcodeRows === 1, `filas: ${trackcodeRows}`)

  check(
    'la fila muestra el codigo normalizado',
    await evaluate<boolean>("document.body.innerText.includes('SMOKE123456')")
  )

  // La URL de seguimiento se construye sin abrir nada y sin red.
  const resolved = await evaluate<string>(
    `window.resalevault.tracking.resolveUrl('seur', 'SMOKE123456').then((r) => JSON.stringify(r))`
  )
  const resolvedUrl = JSON.parse(resolved) as { ok: boolean; data?: { url: string; filledByUrl: boolean } }
  check('se resuelve la URL oficial del transportista', resolvedUrl.ok === true, resolved)
  check(
    'SEUR abre su buscador para pegar el codigo',
    resolvedUrl.data?.url.startsWith('https://www.seur.com') === true && resolvedUrl.data?.filledByUrl === false,
    JSON.stringify(resolvedUrl.data)
  )

  const browserClosed = await evaluate<string>(
    `window.resalevault.browser.state().then((r) => JSON.stringify(r))`
  )
  check(
    'el navegador integrado sigue cerrado (no se ha abierto ninguna web)',
    (JSON.parse(browserClosed) as { data?: { open: boolean } }).data?.open === false
  )

  // Track Now sobre el codigo recien creado: abre la web REAL dentro de la app.
  const trackNowResult = await evaluate<string>(
    `window.resalevault.tracking.list({}).then((r) => {
       if (!r.ok || r.data.items.length === 0) return JSON.stringify({ ok: false })
       return window.resalevault.tracking.trackNow(r.data.items[0].id).then((t) => JSON.stringify(t))
     })`
  )
  const trackNow = JSON.parse(trackNowResult) as {
    ok: boolean
    data?: { url: string; filledByUrl: boolean; copiedToClipboard: boolean }
  }
  check('Track Now devuelve la URL del transportista', trackNow.ok === true, trackNowResult.slice(0, 160))

  // Se espera a que la vista nativa exista y navegue.
  await sleep(2500)
  const afterOpen = await evaluate<string>(`window.resalevault.browser.state().then((r) => JSON.stringify(r))`)
  const browserState = JSON.parse(afterOpen) as {
    data?: { open: boolean; url: string; carrierName: string; errorCode: string | null }
  }
  check('el navegador integrado se ha abierto', browserState.data?.open === true)
  check(
    'ha navegado al dominio del transportista',
    browserState.data?.url.includes('seur.com') === true,
    browserState.data?.url
  )

  const barVisible = await evaluate<boolean>("document.querySelector('.browser-bar') !== null")
  check('la barra del navegador integrado esta visible', barVisible)

  await evaluate<unknown>(`window.resalevault.browser.close()`)
  await sleep(400)

  const closedState = await evaluate<string>(`window.resalevault.browser.state().then((r) => JSON.stringify(r))`)
  check(
    'el navegador se cierra correctamente',
    (JSON.parse(closedState) as { data?: { open: boolean } }).data?.open === false
  )

  const stillSaved = await evaluate<string>(
    `window.resalevault.tracking.list({}).then((r) => JSON.stringify(r))`
  )
  check(
    'los codigos siguen guardados tras cerrar el navegador',
    (JSON.parse(stillSaved) as { data?: { total: number } }).data?.total === 1
  )

  // -------------------------------------------------------------------------
  process.stdout.write('\nCompra de licencia por Discord\n------------------------------\n')
  // -------------------------------------------------------------------------
  await evaluate<null>(
    `(() => { const items = [...document.querySelectorAll('.navitem')];
       const target = items.find((el) => el.textContent.includes('Licencia'));
       if (target) target.click(); return null })()`
  )
  await sleep(700)

  const licenseTitle = await evaluate<string>("document.querySelector('.page-title')?.textContent ?? ''")
  check('se abre la pantalla de licencia', licenseTitle === 'Licencia y plan', `titulo: ${licenseTitle}`)

  // El boton de compra debe existir con el texto EXACTO en espanol.
  const buyButtonEs = await evaluate<boolean>(
    `(() => [...document.querySelectorAll('button')].some((el) => el.textContent.trim() === 'Comprar licencia'))()`
  )
  check('el boton "Comprar licencia" esta presente (es)', buyButtonEs)

  // El enlace visible debe ser EXACTAMENTE el Discord oficial.
  const shownLink = await evaluate<string>(
    `(() => { const a = [...document.querySelectorAll('a')].find((el) => el.textContent.includes('discord.gg'));
       return a ? a.getAttribute('href') : '' })()`
  )
  check('se muestra la URL oficial de Discord', shownLink === 'https://discord.gg/9bMhnGvjrx', shownLink)

  // El puente de enlaces solo acepta destinos de la lista blanca.
  const badTarget = await evaluate<string>(
    `window.resalevault.links.open('sitio_pirata').then((r) => JSON.stringify(r))`
  )
  check(
    'el puente rechaza un destino fuera de la lista blanca',
    (JSON.parse(badTarget) as { ok: boolean }).ok === false,
    badTarget.slice(0, 120)
  )

  // El destino real se resuelve desde el proceso principal.
  const targets = await evaluate<string>(
    `window.resalevault.links.targets().then((r) => JSON.stringify(r))`
  )
  const resolvedTargets = JSON.parse(targets) as { ok: boolean; data?: { discordInvite: string } }
  check(
    'el proceso principal declara el Discord oficial',
    resolvedTargets.ok === true && resolvedTargets.data?.discordInvite === 'https://discord.gg/9bMhnGvjrx',
    targets.slice(0, 140)
  )

  // No se afirma que se haya comprado/activado nada: el aviso debe existir.
  check(
    'la pantalla aclara que NO se compra desde la app',
    await evaluate<boolean>("document.body.innerText.toLowerCase().includes('no se piden datos de pago')")
  )

  // -------------------------------------------------------------------------
  process.stdout.write('\nComprobacion online de licencia\n-------------------------------\n')
  // -------------------------------------------------------------------------
  // La tarjeta de estado online debe existir siempre (aunque no haya licencia).
  // Se compara en minusculas: los titulos de seccion se muestran en mayusculas
  // por CSS, y `innerText` devuelve el texto ya transformado.
  check(
    'se muestra la tarjeta de comprobacion online',
    await evaluate<boolean>(
      "document.body.innerText.toLowerCase().includes('comprobacion online')"
    )
  )

  // Sin licencia activa, el estado es "sin comprobar todavia" y NO hay boton de
  // comprobar: no tiene sentido consultar el servidor sin licencia.
  check(
    'sin licencia, el estado online es "sin comprobar todavia"',
    await evaluate<boolean>("document.body.innerText.includes('Sin comprobar todavia')")
  )
  const checkButtonAbsent = await evaluate<boolean>(
    `(() => ![...document.querySelectorAll('button')].some((el) => el.textContent.trim() === 'Comprobar ahora'))()`
  )
  check('sin licencia no se ofrece comprobar ahora', checkButtonAbsent)

  // El puente existe y responde SIEMPRE un resultado (nunca lanza), incluso sin
  // red: el proceso principal captura los fallos.
  const refreshResult = await evaluate<string>(
    `window.resalevault.license.refresh().then((r) => JSON.stringify(r)).catch(() => 'LANZO')`
  )
  check(
    'la llamada de comprobacion responde sin lanzar aunque no haya red',
    refreshResult !== 'LANZO' && (JSON.parse(refreshResult) as { ok: boolean }).ok === true,
    refreshResult.slice(0, 140)
  )

  // -------------------------------------------------------------------------
  process.stdout.write('\nCambio de idioma en caliente\n----------------------------\n')
  // -------------------------------------------------------------------------
  await evaluate<null>(
    `(() => { const buttons = [...document.querySelectorAll('.titlebar__actions button')];
       buttons[0].click(); return null })()`
  )
  await sleep(700)

  // Se comprueba en la navegacion, que es independiente de la pantalla abierta.
  const englishNavText = await evaluate<string>(
    "document.querySelectorAll('.navitem')[0]?.textContent ?? ''"
  )
  check('la interfaz cambia a ingles', englishNavText.includes('Dashboard'), englishNavText)

  const englishNav = await evaluate<number>(
    "document.querySelectorAll('.navitem')[0].textContent.toLowerCase().includes('dashboard') ? 1 : 0"
  )
  check('la navegacion tambien se traduce', englishNav === 1)

  // El boton de compra tambien se traduce al ingles (misma pantalla de licencia).
  const buyButtonEn = await evaluate<boolean>(
    `(() => [...document.querySelectorAll('button')].some((el) => el.textContent.trim() === 'Buy license'))()`
  )
  check('el boton dice "Buy license" en ingles', buyButtonEn)

  // -------------------------------------------------------------------------
  process.stdout.write('\nSelector de tema\n----------------\n')
  // -------------------------------------------------------------------------
  await evaluate<null>(
    `(() => { const buttons = [...document.querySelectorAll('.titlebar__actions button')];
       buttons[1].click(); return null })()`
  )
  await sleep(500)
  const theme = await evaluate<string>("document.documentElement.dataset.theme ?? ''")
  check('el tema cambia a claro y se refleja en el documento', theme === 'light', `tema: ${theme}`)

  // -------------------------------------------------------------------------
  process.stdout.write('\nConsola del renderer\n--------------------\n')
  // -------------------------------------------------------------------------
  check('no hay errores en la consola de la interfaz', rendererErrors.length === 0, rendererErrors.join(' | '))

  window.destroy()
  opened.db.close()

  // Chromium puede mantener abiertos algunos archivos de su carpeta de perfil
  // durante un instante despues de cerrar la ventana. La limpieza del
  // directorio temporal es una cortesia, no un requisito de la prueba.
  let cleanupWarning = ''
  await sleep(400)
  try {
    rmSync(workDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 })
  } catch (error) {
    cleanupWarning = ` (no se pudo borrar el temporal: ${(error as Error).message})`
  }

  writeSync(
    1,
    `\nResultado: ${passed} comprobaciones correctas, ${failures.length} fallidas${cleanupWarning}\n` +
      (failures.length > 0
        ? failures.map((failure) => `  - ${failure}\n`).join('')
        : 'TODO CORRECTO\n') +
      '\n'
  )
  app.exit(failures.length === 0 ? 0 : 1)
}

app.whenReady().then(() =>
  main().catch((error: unknown) => {
    process.stderr.write(`\nERROR NO CONTROLADO: ${(error as Error).stack ?? String(error)}\n`)
    app.exit(1)
  })
)

// Electron cierra la aplicacion por defecto cuando se destruye la ultima
// ventana. Si ocurriera eso, el resumen de la prueba se perderia y el proceso
// terminaria con codigo 0 aunque hubiera fallos: la prueba mentiria. Aqui el
// cierre lo decide el propio script, ya con el resultado calculado.
app.on('window-all-closed', () => {
  // Deliberadamente vacio.
})
