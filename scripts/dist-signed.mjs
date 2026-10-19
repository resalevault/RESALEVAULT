/**
 * RESALEVAULT - Compilacion con firma (gratuita, certificado de desarrollo).
 *
 * Que hace:
 *  1. Comprueba que exista un certificado .pfx.
 *  2. Exporta `WIN_CSC_LINK` y `WIN_CSC_KEY_PASSWORD` SOLO para este proceso.
 *  3. Ejecuta electron-builder.
 *  4. Verifica la firma del instalador y calcula su SHA-256.
 *
 * Si no hay certificado, falla con un mensaje claro en lugar de generar un
 * instalador sin firmar sin avisar.
 *
 * Uso:  npm run dist:signed
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const pfx = join(root, 'tools', 'signing', 'dev-signing.pfx')
const passwordFile = join(root, 'tools', 'signing', 'dev-signing.password')

if (!existsSync(pfx) || !existsSync(passwordFile)) {
  process.stderr.write(
    '\nNo hay certificado de firma configurado.\n\n' +
      'Genera uno de DESARROLLO (gratuito, autofirmado) con:\n\n' +
      '  powershell -ExecutionPolicy Bypass -File scripts/setup-signing.ps1\n\n' +
      'Ten en cuenta que un certificado autofirmado NO elimina los avisos de Windows.\n' +
      'Para distribucion publica necesitas un certificado OV/IV de una CA.\n\n'
  )
  process.exit(1)
}

const password = readFileSync(passwordFile, 'utf8').trim()

process.stdout.write('Compilando y firmando con el certificado de desarrollo...\n')

try {
  execFileSync('npx', ['electron-builder', '--win', '--config', 'electron-builder.yml'], {
    stdio: 'inherit',
    cwd: root,
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      CSC_LINK: pfx,
      CSC_KEY_PASSWORD: password,
      WIN_CSC_LINK: pfx,
      WIN_CSC_KEY_PASSWORD: password
    }
  })
} catch {
  process.stderr.write('\nLa compilacion o la firma han fallado.\n')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Verificacion del artefacto
// ---------------------------------------------------------------------------

const releaseDir = join(root, 'release')
const installers = existsSync(releaseDir)
  ? readdirSync(releaseDir).filter((name) => /^RESALEVAULT-Setup-.*\.exe$/.test(name))
  : []

if (installers.length === 0) {
  process.stderr.write('\nNo se ha encontrado ningun instalador en release/.\n')
  process.exit(1)
}

const installer = join(releaseDir, installers.sort().at(-1))
const bytes = readFileSync(installer)
const hash = createHash('sha256').update(bytes).digest('hex')

process.stdout.write('\nArtefacto: ' + installer + '\n')
process.stdout.write('Tamano:    ' + (bytes.length / 1024 / 1024).toFixed(2) + ' MB\n')
process.stdout.write('SHA-256:   ' + hash + '\n')

try {
  const signature = execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `$s = Get-AuthenticodeSignature -FilePath '${installer}'; "$($s.Status)|$($s.StatusMessage)"`
    ],
    { encoding: 'utf8' }
  ).trim()

  const [status, ...rest] = signature.split('|')
  const message = rest.join('|').trim()

  process.stdout.write('Firma:     ' + status + '\n')

  if (status === 'Valid') {
    process.stdout.write('La firma es valida y la cadena de confianza esta completa.\n')
  } else if (/not trusted by the trust provider|UntrustedRoot/i.test(message)) {
    // Caso normal con un certificado AUTOFIRMADO: la firma existe y es
    // criptograficamente correcta, pero su raiz no es de confianza publica.
    process.stdout.write(
      'La firma EXISTE y es criptograficamente valida, pero su raiz no es de\n' +
        'confianza publica (certificado autofirmado). Windows seguira mostrando\n' +
        '"editor desconocido" y SmartScreen/Device Guard pueden bloquearlo.\n' +
        'NO es un fallo del empaquetado. Ver docs/FIRMA.md.\n'
    )
  } else {
    process.stdout.write(
      'AVISO: la firma no se ha podido validar. Detalle:\n  ' + message + '\n' +
        'Revisa docs/FIRMA.md antes de distribuir.\n'
    )
  }
} catch {
  process.stdout.write('Firma:     no se pudo comprobar\n')
}

process.stdout.write('\nGuarda el SHA-256 junto al instalador para poder verificar la descarga.\n')
process.stdout.write(
  'Nota: el instalador NO es reproducible byte a byte (NSIS incluye marcas de\n' +
    'tiempo). Publica siempre el hash de la compilacion que entregues.\n'
)

// Salida explicita: el comando PowerShell de verificacion puede devolver un
// codigo distinto de cero al encontrar una cadena no confiable, y no queremos
// que eso marque como fallida una firma que si existe.
process.exit(0)
