/**
 * RESALEVAULT - Generador de etiquetas con codigo de barras o QR.
 *
 * El codigo lo genera el PROCESO PRINCIPAL (bwip-js en Node) y llega ya hecho en
 * SVG. Motivo: la interfaz no necesita ninguna libreria de codificacion y lo que
 * se ve en la vista previa es exactamente lo que se imprime.
 *
 * El SVG se inserta con `dangerouslySetInnerHTML` a proposito: es marcado
 * generado por la libreria, no texto del usuario. Los datos del articulo (SKU,
 * nombre) se pintan como TEXTO de React, que ya los escapa.
 *
 * La impresion usa `window.print()` con una hoja de estilos que oculta todo
 * menos la zona de etiquetas.
 */

import { useMemo, useState, type ReactNode } from 'react'
import type { BarcodeSymbology, LabelOptions, LabelSheet } from '@shared/types-modules'
import { BARCODE_SYMBOLOGIES } from '@shared/types-modules'
import { api, AppError } from '../lib/api'
import { useApp } from '../lib/app-context'
import { Button, Card, Field, Modal, Select, TextInput } from '../components/ui'

export function LabelsModal({
  target,
  ids,
  onClose
}: {
  target: 'product' | 'location'
  ids: string[]
  onClose: () => void
}): ReactNode {
  const { t, money, notify } = useApp()

  const [options, setOptions] = useState<Partial<LabelOptions>>({
    symbology: 'code128',
    widthMm: 50,
    heightMm: 30,
    columns: 3,
    showSku: true,
    showName: true,
    showLocation: true,
    showPrice: false,
    showPlatform: false,
    encode: 'sku',
    title: 'RESALEVAULT'
  })
  const [sheet, setSheet] = useState<LabelSheet | null>(null)
  const [loading, setLoading] = useState(false)

  const update = (patch: Partial<LabelOptions>): void => setOptions((current) => ({ ...current, ...patch }))

  const generate = async (): Promise<void> => {
    setLoading(true)
    try {
      const result =
        target === 'product'
          ? await api.labels.products(ids, options)
          : await api.labels.locations(ids, options)
      setSheet(result)
    } catch (error) {
      notify(
        error instanceof AppError
          ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
          : t('errors.internal_error', { id: '-' }),
        'error'
      )
    } finally {
      setLoading(false)
    }
  }

  const missingCodes = useMemo(
    () => (sheet ? sheet.items.filter((item) => !item.barcodeSvg).length : 0),
    [sheet]
  )

  return (
    <Modal
      wide
      title={t('labels.title')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.close')}</Button>
          <Button onClick={() => void generate()} disabled={loading || ids.length === 0}>
            {t('labels.preview')}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              // Se pide al navegador imprimir la ventana; la hoja de estilos de
              // impresion deja visible solo la zona de etiquetas.
              window.print()
            }}
            disabled={!sheet}
          >
            {t('labels.print')}
          </Button>
        </>
      }
    >
      {ids.length === 0 ? (
        <div className="notice">{t('labels.noItems')}</div>
      ) : (
        <>
          <p className="dim" style={{ marginTop: 0 }}>
            {t('labels.itemsCount', { count: ids.length })} · {t('labels.printHint')}
          </p>

          <div className="form-grid">
            <Field label={t('labels.symbology')}>
              <Select
                value={options.symbology ?? 'code128'}
                onChange={(value) => update({ symbology: value as BarcodeSymbology })}
              >
                {BARCODE_SYMBOLOGIES.map((value) => (
                  <option key={value} value={value}>
                    {t(`labels.symbologies.${value}` as 'labels.symbologies.code128')}
                  </option>
                ))}
              </Select>
            </Field>

            {target === 'product' ? (
              <Field label={t('labels.encode')}>
                <Select
                  value={options.encode ?? 'sku'}
                  onChange={(value) => update({ encode: value as 'sku' })}
                >
                  <option value="sku">{t('labels.encodeSku')}</option>
                  <option value="location">{t('labels.encodeLocation')}</option>
                  <option value="custom">{t('labels.encodeCustom')}</option>
                </Select>
              </Field>
            ) : null}

            {options.encode === 'custom' ? (
              <Field label={t('labels.customPrefix')}>
                <TextInput
                  value={options.customPrefix ?? ''}
                  onChange={(value) => update({ customPrefix: value })}
                />
              </Field>
            ) : null}

            <Field label={t('labels.widthMm')}>
              <TextInput
                value={String(options.widthMm ?? 50)}
                onChange={(value) => update({ widthMm: Number(value) || 50 })}
              />
            </Field>
            <Field label={t('labels.heightMm')}>
              <TextInput
                value={String(options.heightMm ?? 30)}
                onChange={(value) => update({ heightMm: Number(value) || 30 })}
              />
            </Field>
            <Field label={t('labels.columns')}>
              <TextInput
                value={String(options.columns ?? 3)}
                onChange={(value) => update({ columns: Number(value) || 3 })}
              />
            </Field>
            <Field label={t('labels.sheetTitle')}>
              <TextInput value={options.title ?? ''} onChange={(value) => update({ title: value })} />
            </Field>
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            {(
              [
                ['showSku', 'labels.showSku'],
                ['showName', 'labels.showName'],
                ['showLocation', 'labels.showLocation'],
                ['showPrice', 'labels.showPrice'],
                ['showPlatform', 'labels.showPlatform']
              ] as const
            ).map(([key, labelKey]) => (
              <label key={key} className="checkbox">
                <input
                  type="checkbox"
                  checked={Boolean(options[key])}
                  onChange={(event) => update({ [key]: event.target.checked } as Partial<LabelOptions>)}
                />
                {t(labelKey)}
              </label>
            ))}
          </div>

          {missingCodes > 0 ? (
            <div className="notice notice--warn" style={{ marginTop: 10 }}>
              <strong>{t('labels.noBarcode')}:</strong> {t('labels.noBarcodeHint')} ({missingCodes})
            </div>
          ) : null}
        </>
      )}

      {sheet ? (
        <Card title={t('labels.subsystem')} flush>
          <div className="print-area" style={{ padding: 12, background: '#fff', color: '#000' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${sheet.options.columns}, ${sheet.options.widthMm}mm)`,
                gap: '3mm'
              }}
            >
              {sheet.items.map((item) => (
                <div
                  key={item.id}
                  className="label"
                  style={{
                    width: `${sheet.options.widthMm}mm`,
                    height: `${sheet.options.heightMm}mm`,
                    border: '1px dashed #bbb',
                    padding: '2mm',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    overflow: 'hidden',
                    background: '#fff',
                    color: '#000'
                  }}
                >
                  <div style={{ fontSize: '6pt', fontWeight: 700, letterSpacing: '0.08em' }}>
                    {sheet.options.title}
                  </div>

                  {item.barcodeSvg ? (
                    <div
                      style={{ display: 'flex', justifyContent: 'center', maxHeight: '12mm' }}
                      // SVG generado por la libreria en el proceso principal.
                      dangerouslySetInnerHTML={{ __html: item.barcodeSvg }}
                    />
                  ) : null}

                  <div style={{ fontSize: '6.5pt', lineHeight: 1.25 }}>
                    {sheet.options.showSku ? <div style={{ fontWeight: 700 }}>{item.sku}</div> : null}
                    {sheet.options.showName ? <div>{item.name.slice(0, 46)}</div> : null}
                    {sheet.options.showLocation && item.locationPath ? (
                      <div style={{ fontFamily: 'monospace' }}>{item.locationPath}</div>
                    ) : null}
                    {sheet.options.showPrice && item.priceCents ? <div>{money(item.priceCents)}</div> : null}
                    {sheet.options.showPlatform && item.platform ? <div>{item.platform}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : null}
    </Modal>
  )
}
