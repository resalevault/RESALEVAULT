# RESALEVAULT — Copias de seguridad y recuperación

Guía práctica. Si algo va mal, aquí está qué hacer y en qué orden.

---

## 1. Dónde está todo

```
%APPDATA%\RESALEVAULT\
├── data\
│   ├── resalevault.sqlite                      ← tu inventario (y ventas, gastos...)
│   └── resalevault.antes-de-restaurar-*.sqlite  ← copia automática antes de restaurar
├── media\                                      ← fotografías y documentos ORIGINALES
├── thumbs\                                     ← miniaturas (se pueden regenerar)
├── backups\                                    ← copias de seguridad (.zip)
└── logs\resalevault.log                        ← diagnóstico
```

Las rutas exactas aparecen en **Ajustes → Datos y almacenamiento**, con un botón
para abrir la carpeta.

---

## 2. Qué contiene una copia

Un único archivo `resalevault-backup-AAAA-MM-DDTHH-MM-SS.zip` con:

| Entrada | Contenido |
|---|---|
| `manifest.json` | versión del programa, versión del esquema, fecha, número de artículos y de archivos |
| `resalevault.sqlite` | **instantánea consistente** de la base de datos |
| `media/...` | las fotografías y documentos originales |

Ese ZIP se abre con cualquier herramienta (Explorador de Windows, 7-Zip, macOS,
Linux). No es un formato propietario.

### Por qué la copia no es “copiar el archivo .sqlite”

Copiar una base de datos SQLite **abierta** puede producir una copia corrupta
(sobre todo en modo WAL). RESALEVAULT usa `VACUUM INTO`, que genera un archivo
consistente en un instante concreto. Por eso la copia pesa un poco más y tarda
un segundo: es la diferencia entre una copia y una falsa sensación de seguridad.

---

## 3. Hacer una copia

**Automática:** activada por defecto, cada 7 días al arrancar. Se puede cambiar
el intervalo, el número de copias que se conservan, si se incluyen las fotos y
la carpeta destino, desde **Ajustes → Copias de seguridad**.

**Manual:** botón «Crear copia ahora».

### Lo que se comprueba automáticamente

Después de escribir la copia, el programa **la vuelve a leer y la verifica**:

1. El CRC-32 de cada entrada del ZIP.
2. Que existan el manifiesto y la base de datos.
3. `PRAGMA integrity_check` sobre el SQLite extraído.
4. Que el esquema no sea **más nuevo** que el programa (una copia de una versión
   futura no se restaura: se rechaza).

Si la verificación falla, **el archivo se borra** y se informa del error. Una
copia que no se puede restaurar es peor que no tener copia.

### Rotación

Se conservan las últimas N copias (10 por defecto). **La más reciente nunca se
borra**, aunque se cambie el límite a un número menor.

---

## 4. Restaurar una copia

1. **Ajustes → Copias de seguridad**.
2. Pulsa **Comprobar** en la copia que quieras usar. Debe decir *«Copia válida»*.
3. Pulsa **Restaurar** y confirma.

Qué ocurre exactamente:

1. La copia se **verifica otra vez**.
2. Se prepara en `data\restore-pending\` y se escribe un marcador.
3. La aplicación **se reinicia** (no se restaura nada con la base abierta).
4. Al arrancar, **antes de abrir SQLite**:
   - se comprueba la integridad una última vez,
   - la base actual se aparta como `data\resalevault.antes-de-restaurar-<fecha>.sqlite`,
   - se sustituye por la de la copia,
   - se copian encima las fotografías y documentos,
   - se borra el marcador.
5. La aplicación abre con los datos restaurados.

**Nada se borra de forma irreversible.** Si restauraste por error, la base
anterior sigue en `data\resalevault.antes-de-restaurar-*.sqlite`.

---

## 5. Si la aplicación no arranca

### Caso A — Error de base de datos al iniciar

El programa muestra un aviso con la carpeta de datos y el detalle técnico. Pasos:

1. Abre `%APPDATA%\RESALEVAULT\logs\resalevault.log` y busca la última línea
   `[ERROR]`.
2. Copia la carpeta `data\` a otro sitio (no la borres).
3. Renombra `data\resalevault.sqlite` a `data\resalevault.roto.sqlite`.
4. Vuelve a abrir. Se creará una base vacía.
5. Restaura tu copia más reciente desde **Ajustes → Copias de seguridad**.

### Caso B — No hay ninguna copia

Busca `data\resalevault.antes-de-restaurar-*.sqlite`. Son bases completas y
válidas: renombra la que quieras a `resalevault.sqlite` (con la aplicación
cerrada) y ábrela.

### Caso C — Recuperación manual desde un ZIP de copia

```powershell
# 1. Cierra RESALEVAULT
# 2. Guarda la carpeta de datos actual por si acaso
Copy-Item "$env:APPDATA\RESALEVAULT\data" "$env:APPDATA\RESALEVAULT\data-antes" -Recurse

# 3. Extrae la copia
Expand-Archive "$env:APPDATA\RESALEVAULT\backups\TU-COPIA.zip" -DestinationPath "$env:TEMP\rv"

# 4. Comprueba que la base está bien (debe decir "ok")
node -e "const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1],{readOnly:true});console.log(d.prepare('PRAGMA integrity_check').get().integrity_check)" "$env:TEMP\rv\resalevault.sqlite"

# 5. Sustituye la base y las fotos
Copy-Item "$env:TEMP\rv\resalevault.sqlite" "$env:APPDATA\RESALEVAULT\data\resalevault.sqlite" -Force
Copy-Item "$env:TEMP\rv\media\*" "$env:APPDATA\RESALEVAULT\media\" -Recurse -Force

# 6. Abre RESALEVAULT
```

---

## 6. Qué NO hace todavía

| Cosa | Estado |
|---|---|
| Copia automática **en la nube** | No. Solo local. No se afirma lo contrario. |
| Cifrado de la copia | No. El ZIP no lleva contraseña. Guárdalo en un sitio de confianza. |
| Copia programada con la app cerrada | No. La automática ocurre **al arrancar**. |
| Verificación periódica de copies antiguas | No automática; el botón «Comprobar» lo hace cuando quieras. |

Si guardas las copias en una carpeta sincronizada (OneDrive, Dropbox), ten en
cuenta que **subes el archivo ZIP**, no una base de datos viva: eso es seguro.
Lo que **nunca** hay que hacer es sincronizar `data\resalevault.sqlite`.

---

## 7. Buenas prácticas recomendadas

1. Deja la copia automática activada y **comprueba una copia de vez en cuando**
   con el botón «Comprobar».
2. Guarda una copia en **otro disco o en la nube** al menos una vez al mes.
3. Antes de una importación grande de CSV, crea una copia manual.
4. Si cambias de ordenador: instala RESALEVAULT, copia tu ZIP y restáuralo. Las
   fotografías van dentro.
