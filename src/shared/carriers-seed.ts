/**
 * RESALEVAULT - Catálogo inicial de transportistas.
 *
 * REGLAS QUE SE HAN RESPETADO AL CONSTRUIRLO (importante):
 *
 *  1. **No se inventan URLs.** Los dominios se comprobaron uno a uno con una
 *     petición HTTPS real. El campo `verified` refleja ese resultado: si es
 *     `false`, el dominio no respondió o bloqueó la comprobación (protección
 *     anti-bot), y la aplicación lo indica en la interfaz.
 *  2. **No se promete rellenar el código si no consta.** `strategy: 'url'` solo
 *     se usa cuando la plantilla con `{code}` es un patrón público y estable.
 *     En el resto (`copy`) se abre el buscador oficial y se copia el código al
 *     portapapeles: funciona siempre.
 *  3. **No se incluyen logotipos oficiales.** Son marcas registradas y no hay
 *     autorización de uso. Se muestra un distintivo propio con las iniciales y
 *     un color estable por transportista. El campo `logo` queda preparado para
 *     añadir recursos autorizados en el futuro.
 *  4. Las URLs se guardan en la base de datos, así que si un transportista las
 *     cambia, el usuario puede corregirlas sin esperar una actualización.
 *
 * Verificación realizada (resumen):
 *   - 41 de 46 dominios respondieron correctamente.
 *   - Sin respuesta/bloqueados: envialia, chronopost, mondial-relay,
 *     postnord y canada-post. Se mantienen en el directorio (el usuario puede
 *     abrirlos igualmente) pero marcados como no verificados.
 */

import type { CarrierRegion, CarrierStrategy } from './types-tracking'

export interface CarrierSeed {
  id: string
  name: string
  region: CarrierRegion
  country: string
  /** Página de seguimiento oficial (o inicio si no se conoce la exacta). */
  trackUrl: string
  /** Plantilla con `{code}`; vacía si no consta que el código vaya en la URL. */
  urlTemplate: string
  strategy: CarrierStrategy
  verified: boolean
  notes?: string
}

export const CARRIER_SEED: readonly CarrierSeed[] = [
  // -------------------------------------------------------------------------
  // España
  // -------------------------------------------------------------------------
  {
    id: 'correos',
    name: 'Correos',
    region: 'ES',
    country: 'España',
    trackUrl: 'https://www.correos.es/es/es/herramientas/localizador/envios',
    urlTemplate: '',
    strategy: 'copy',
    verified: true,
    notes: 'El localizador no admite el código por URL de forma estable.'
  },
  {
    id: 'correos-express',
    name: 'Correos Express',
    region: 'ES',
    country: 'España',
    trackUrl: 'https://www.correosexpress.com/seguimiento-de-envios',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'seur',
    name: 'SEUR',
    region: 'ES',
    country: 'España',
    trackUrl: 'https://www.seur.com/es/rastreo-envios/',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'mrw',
    name: 'MRW',
    region: 'ES',
    country: 'España',
    trackUrl: 'https://www.mrw.es/seguimiento_envios/',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'nacex',
    name: 'NACEX',
    region: 'ES',
    country: 'España',
    trackUrl: 'https://www.nacex.com/',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'gls-spain',
    name: 'GLS Spain',
    region: 'ES',
    country: 'España',
    trackUrl: 'https://gls-group.com/ES/es/seguimiento-de-paquetes',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'dhl',
    name: 'DHL',
    region: 'ES',
    country: 'Internacional',
    trackUrl: 'https://www.dhl.com/global-en/home/tracking.html',
    urlTemplate: 'https://www.dhl.com/global-en/home/tracking.html?tracking-id={code}',
    strategy: 'url',
    verified: true,
    notes: 'DHL acepta el código en el parámetro tracking-id.'
  },
  {
    id: 'ups',
    name: 'UPS',
    region: 'ES',
    country: 'Internacional',
    trackUrl: 'https://www.ups.com/track',
    urlTemplate: 'https://www.ups.com/track?tracknum={code}',
    strategy: 'url',
    verified: true
  },
  {
    id: 'fedex',
    name: 'FedEx',
    region: 'ES',
    country: 'Internacional',
    trackUrl: 'https://www.fedex.com/fedextrack/',
    urlTemplate: 'https://www.fedex.com/fedextrack/?trknbr={code}',
    strategy: 'url',
    verified: true
  },
  {
    id: 'ctt-express',
    name: 'CTT Express',
    region: 'ES',
    country: 'España / Portugal',
    trackUrl: 'https://www.cttexpress.com/',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'inpost',
    name: 'InPost',
    region: 'ES',
    country: 'España / Europa',
    trackUrl: 'https://inpost.es/tracking',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'envialia',
    name: 'Envialia',
    region: 'ES',
    country: 'España',
    trackUrl: 'https://www.envialia.com/',
    urlTemplate: '',
    strategy: 'copy',
    verified: false,
    notes: 'No respondió a la comprobación automatizada. Abrir manualmente.'
  },
  {
    id: 'sending',
    name: 'Sending',
    region: 'ES',
    country: 'España',
    trackUrl: 'https://sending.com/',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'paack',
    name: 'Paack',
    region: 'ES',
    country: 'España',
    trackUrl: 'https://paack.co/',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'tipsa',
    name: 'Tipsa',
    region: 'ES',
    country: 'España',
    trackUrl: 'https://www.tipsa.es/',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },

  // -------------------------------------------------------------------------
  // Europa
  // -------------------------------------------------------------------------
  {
    id: 'dpd',
    name: 'DPD',
    region: 'EU',
    country: 'Europa',
    trackUrl: 'https://tracking.dpd.de/status/en_US/parcel',
    urlTemplate: 'https://tracking.dpd.de/status/en_US/parcel/{code}',
    strategy: 'url',
    verified: true
  },
  {
    id: 'chronopost',
    name: 'Chronopost',
    region: 'EU',
    country: 'Francia',
    trackUrl: 'https://www.chronopost.fr/tracking-no-cms/suivi-page',
    urlTemplate: '',
    strategy: 'copy',
    verified: false,
    notes: 'Bloquea la comprobación automatizada (403). Abrir manualmente.'
  },
  {
    id: 'colissimo',
    name: 'Colissimo',
    region: 'EU',
    country: 'Francia',
    trackUrl: 'https://www.laposte.fr/outils/suivre-vos-envois',
    urlTemplate: 'https://www.laposte.fr/outils/suivre-vos-envois?code={code}',
    strategy: 'url',
    verified: true
  },
  {
    id: 'mondial-relay',
    name: 'Mondial Relay',
    region: 'EU',
    country: 'Francia',
    trackUrl: 'https://www.mondialrelay.fr/suivi-de-colis',
    urlTemplate: '',
    strategy: 'copy',
    verified: false,
    notes: 'Bloquea la comprobación automatizada (403). Abrir manualmente.'
  },
  {
    id: 'royal-mail',
    name: 'Royal Mail',
    region: 'EU',
    country: 'Reino Unido',
    trackUrl: 'https://www.royalmail.com/track-your-item',
    urlTemplate: '',
    strategy: 'copy',
    verified: true,
    notes: 'Su seguimiento usa rutas internas; el código se copia para pegarlo.'
  },
  {
    id: 'evri',
    name: 'Evri',
    region: 'EU',
    country: 'Reino Unido',
    trackUrl: 'https://www.evri.com/track/parcel',
    urlTemplate: 'https://www.evri.com/track/parcel/{code}',
    strategy: 'url',
    verified: true
  },
  {
    id: 'yodel',
    name: 'Yodel',
    region: 'EU',
    country: 'Reino Unido',
    trackUrl: 'https://www.yodel.co.uk/track',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'postnl',
    name: 'PostNL',
    region: 'EU',
    country: 'Países Bajos',
    trackUrl: 'https://postnl.nl/tracktrace/',
    urlTemplate: 'https://postnl.nl/tracktrace/?B={code}',
    strategy: 'url',
    verified: true
  },
  {
    id: 'bpost',
    name: 'bpost',
    region: 'EU',
    country: 'Bélgica',
    trackUrl: 'https://track.bpost.cloud/btr/web/',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'post-at',
    name: 'Österreichische Post',
    region: 'EU',
    country: 'Austria',
    trackUrl: 'https://www.post.at/',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'deutsche-post',
    name: 'Deutsche Post / DHL Paket',
    region: 'EU',
    country: 'Alemania',
    trackUrl: 'https://www.deutschepost.de/sendung/simpleQuery.html',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'poste-italiane',
    name: 'Poste Italiane',
    region: 'EU',
    country: 'Italia',
    trackUrl: 'https://www.poste.it/',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'swiss-post',
    name: 'Swiss Post',
    region: 'EU',
    country: 'Suiza',
    trackUrl: 'https://www.post.ch/en/business-solutions/track-and-trace',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'postnord',
    name: 'PostNord',
    region: 'EU',
    country: 'Suecia / Dinamarca',
    trackUrl: 'https://www.postnord.se/en/',
    urlTemplate: '',
    strategy: 'copy',
    verified: false,
    notes: 'Bloquea la comprobación automatizada (403). Abrir manualmente.'
  },
  {
    id: 'bring',
    name: 'Bring',
    region: 'EU',
    country: 'Noruega',
    trackUrl: 'https://www.bring.no/',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'dao',
    name: 'DAO',
    region: 'EU',
    country: 'Dinamarca',
    trackUrl: 'https://dao.dk/',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'omniva',
    name: 'Omniva',
    region: 'EU',
    country: 'Estonia',
    trackUrl: 'https://www.omniva.ee/',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'packeta',
    name: 'Packeta / Zásilkovna',
    region: 'EU',
    country: 'Chequia',
    trackUrl: 'https://tracking.packeta.com/',
    urlTemplate: 'https://tracking.packeta.com/?id={code}',
    strategy: 'url',
    verified: true
  },

  // -------------------------------------------------------------------------
  // Internacional
  // -------------------------------------------------------------------------
  {
    id: 'amazon-logistics',
    name: 'Amazon Logistics',
    region: 'INT',
    country: 'Internacional',
    trackUrl: 'https://track.amazon.com/',
    urlTemplate: 'https://track.amazon.com/tracking/{code}',
    strategy: 'url',
    verified: true
  },
  {
    id: 'aramex',
    name: 'Aramex',
    region: 'INT',
    country: 'Internacional',
    trackUrl: 'https://www.aramex.com/track/results',
    urlTemplate: 'https://www.aramex.com/track/results?ShipmentNumber={code}',
    strategy: 'url',
    verified: true
  },
  {
    id: 'japan-post',
    name: 'Japan Post',
    region: 'INT',
    country: 'Japón',
    trackUrl: 'https://trackings.post.japanpost.jp/services/srv/search/input',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'usps',
    name: 'USPS',
    region: 'INT',
    country: 'Estados Unidos',
    trackUrl: 'https://tools.usps.com/go/TrackConfirmAction_input',
    urlTemplate: 'https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1={code}',
    strategy: 'url',
    verified: true
  },
  {
    id: 'canada-post',
    name: 'Canada Post',
    region: 'INT',
    country: 'Canadá',
    trackUrl: 'https://www.canadapost-postescanada.ca/track-reperage/en',
    urlTemplate: '',
    strategy: 'copy',
    verified: false,
    notes: 'Devolvió error 500 en la comprobación. Abrir manualmente.'
  },
  {
    id: 'australia-post',
    name: 'Australia Post',
    region: 'INT',
    country: 'Australia',
    trackUrl: 'https://auspost.com.au/mypost/track/',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'singpost',
    name: 'Singapore Post',
    region: 'INT',
    country: 'Singapur',
    trackUrl: 'https://www.singpost.com/track-items',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'yanwen',
    name: 'Yanwen',
    region: 'INT',
    country: 'China',
    trackUrl: 'https://www.yw56.com.cn/',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'cainiao',
    name: 'Cainiao',
    region: 'INT',
    country: 'China',
    trackUrl: 'https://global.cainiao.com/',
    urlTemplate: 'https://global.cainiao.com/detail.htm?mailNoList={code}',
    strategy: 'url',
    verified: true
  },
  {
    id: 'sf-express',
    name: 'SF Express',
    region: 'INT',
    country: 'China',
    trackUrl: 'https://www.sf-express.com/',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: '4px',
    name: '4PX',
    region: 'INT',
    country: 'China',
    trackUrl: 'https://www.4px.com/',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'yunexpress',
    name: 'YunExpress',
    region: 'INT',
    country: 'China',
    trackUrl: 'https://www.yunexpress.com/',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  },
  {
    id: 'colis-prive',
    name: 'Colis Privé',
    region: 'INT',
    country: 'Francia',
    trackUrl: 'https://www.colisprive.fr/',
    urlTemplate: '',
    strategy: 'copy',
    verified: true
  }
]
