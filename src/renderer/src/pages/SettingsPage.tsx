/**
 * RESALEVAULT - Ajustes.
 *
 * Todo lo editable aqui se guarda en la base de datos local y surte efecto de
 * inmediato. El estado del almacenamiento se muestra con datos reales (version
 * de esquema, modo de diario, resultado de la comprobacion de integridad,
 * tamano del archivo), no con afirmaciones genericas.
 */

import { useEffect, useState, type ReactNode } from 'react'
import {
  ACCENT_CUSTOM,
  ACCENT_PRESETS,
  ACCENT_SWATCH,
  DEFAULT_CUSTOM_HEX,
  isLowContrastOnDark,
  isLowContrastOnLight,
  isValidHex,
  normalizeHex
} from '@shared/accent'
import { DEFAULT_SKU_PATTERN, renderSkuPattern, validateSkuPattern } from '@shared/sku'
import { ATTRIBUTE_TYPES, type AppHashInfo, type AttributeType, type ThirdPartyNoticesInfo } from '@shared/types'
import { api, AppError } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsyncData } from '../lib/hooks'
import {
  Button,
  Card,
  Field,
  IconButton,
  Modal,
  Select,
  Spinner,
  TextInput
} from '../components/ui'
import { IconExternal, IconPlus, IconTrash } from '../components/Icons'
import { BackupsCard } from './BackupsCard'

export function SettingsPage(): ReactNode {
  const {
    t,
    notify,
    settings,
    updateSettings,
    theme,
    accentColor,
    accentCustomHex,
    updateAccentColor,
    updateAccentCustomHex,
    resetAccent,
    health,
    reloadHealth,
    info,
    dataVersion,
    refreshData,
    number,
    navigate
  } = useApp()

  const [currency, setCurrency] = useState(settings.currency)
  const [skuPrefix, setSkuPrefix] = useState(settings.skuPrefix)
  const [skuPattern, setSkuPattern] = useState(settings.skuPattern)
  const [thresholds, setThresholds] = useState(settings.staleThresholds.join(', '))
  const [hexDraft, setHexDraft] = useState(accentCustomHex)
  const [busy, setBusy] = useState(false)

  const [attributeKey, setAttributeKey] = useState('')
  const [attributeName, setAttributeName] = useState('')
  const [attributeType, setAttributeType] = useState<AttributeType>('text')
  const [attributeOptions, setAttributeOptions] = useState('')

  const [platformCode, setPlatformCode] = useState('')
  const [platformName, setPlatformName] = useState('')
  const [notices, setNotices] = useState<ThirdPartyNoticesInfo | null | undefined>(undefined)
  const [showNotices, setShowNotices] = useState(false)
  const [appHash, setAppHash] = useState<AppHashInfo | null>(null)

  const attributes = useAsyncData(() => api.attributes.list(), [dataVersion])
  const platforms = useAsyncData(() => api.platforms.list(), [dataVersion])
  const tags = useAsyncData(() => api.tags.list(), [dataVersion])

  useEffect(() => {
    setCurrency(settings.currency)
    setSkuPrefix(settings.skuPrefix)
    setSkuPattern(settings.skuPattern)
    setThresholds(settings.staleThresholds.join(', '))
  }, [settings])

  // El campo HEX sigue al color guardado (por ejemplo al restablecer).
  useEffect(() => {
    setHexDraft(accentCustomHex)
  }, [accentCustomHex])

  const hexValid = isValidHex(hexDraft)
  const lowContrast =
    accentColor === ACCENT_CUSTOM &&
    (theme === 'light' ? isLowContrastOnLight(accentCustomHex) : isLowContrastOnDark(accentCustomHex))

  const applyCustomHex = (): void => {
    const normalized = normalizeHex(hexDraft)
    if (!normalized) return
    setHexDraft(normalized)
    updateAccentCustomHex(normalized)
    notify(t('settings.accentApplied'), 'success')
  }

  const handleResetAccent = (): void => {
    resetAccent()
    setHexDraft(DEFAULT_CUSTOM_HEX)
    notify(t('settings.accentResetDone'), 'success')
  }

  const patternValidation = validateSkuPattern(skuPattern)
  const patternPreview = patternValidation.ok
    ? renderSkuPattern(skuPattern, {
        prefix: skuPrefix || 'RV',
        categoryName: 'Camisetas',
        date: new Date(),
        sequence: 1
      })
    : ''

  const reportError = (error: unknown): void => {
    notify(
      error instanceof AppError
        ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
        : t('errors.internal_error', { id: '-' }),
      'error'
    )
  }

  const loadNotices = async (): Promise<void> => {
    setShowNotices(true)
    try {
      setNotices(await api.app.getThirdPartyNotices())
    } catch (error) {
      reportError(error)
      setNotices(null)
    }
  }

  const loadHash = async (): Promise<void> => {
    try {
      setAppHash(await api.app.computeAppHash())
    } catch (error) {
      reportError(error)
    }
  }

  const saveGeneral = async (): Promise<void> => {
    setBusy(true)
    try {
      const parsedThresholds = thresholds
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0)

      await updateSettings({
        currency: currency.trim().toUpperCase(),
        skuPrefix: skuPrefix.trim().toUpperCase(),
        skuPattern: skuPattern.trim() || DEFAULT_SKU_PATTERN,
        staleThresholds: parsedThresholds.length > 0 ? parsedThresholds : [30, 60, 90]
      })
      notify(t('settings.saved'), 'success')
      refreshData()
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  const createAttribute = async (): Promise<void> => {
    try {
      await api.attributes.create({
        key: attributeKey.trim().toLowerCase(),
        name: attributeName.trim(),
        type: attributeType,
        options:
          attributeType === 'select'
            ? attributeOptions
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean)
            : []
      })
      setAttributeKey('')
      setAttributeName('')
      setAttributeOptions('')
      attributes.reload()
      notify(t('settings.saved'), 'success')
    } catch (error) {
      reportError(error)
    }
  }

  const createPlatform = async (): Promise<void> => {
    try {
      await api.platforms.create({ code: platformCode.trim(), name: platformName.trim() })
      setPlatformCode('')
      setPlatformName('')
      platforms.reload()
      notify(t('settings.saved'), 'success')
    } catch (error) {
      reportError(error)
    }
  }

  if (!health || !info) {
    return (
      <div className="page">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__text">
          <h1 className="page-title">{t('settings.title')}</h1>
          <p className="page-subtitle">{t('settings.subtitle')}</p>
        </div>
        <div className="page-header__actions">
          <Button variant="primary" onClick={() => void saveGeneral()} disabled={busy}>
            {t('common.saveChanges')}
          </Button>
        </div>
      </header>

      <div className="grid-2">
        <Card title={t('settings.sectionAppearance')}>
          <div className="form-grid">
            <Field label={t('settings.language')}>
              <Select
                value={settings.locale}
                onChange={(value) => {
                  void updateSettings({ locale: value === 'en' ? 'en' : 'es' }).catch(reportError)
                }}
              >
                <option value="es">{t('settings.languageEs')}</option>
                <option value="en">{t('settings.languageEn')}</option>
              </Select>
            </Field>

            <Field label={t('settings.theme')}>
              <Select
                value={settings.theme}
                onChange={(value) => {
                  void updateSettings({ theme: value === 'light' ? 'light' : 'dark' }).catch(reportError)
                }}
              >
                <option value="dark">{t('settings.themeDark')}</option>
                <option value="light">{t('settings.themeLight')}</option>
              </Select>
            </Field>

            <Field label={t('settings.accent')} hint={t('settings.accentHint')}>
              <div className="accent-picker">
                <div className="accent-grid" role="radiogroup" aria-label={t('settings.accent')}>
                  {ACCENT_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      role="radio"
                      aria-checked={accentColor === preset}
                      aria-label={t(`settings.accentPresets.${preset}`)}
                      title={t(`settings.accentPresets.${preset}`)}
                      className="accent-swatch"
                      style={{ background: ACCENT_SWATCH[preset] }}
                      onClick={() => updateAccentColor(preset)}
                    />
                  ))}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={accentColor === ACCENT_CUSTOM}
                    aria-label={`${t('settings.accentCustom')} ${accentCustomHex}`}
                    title={`${t('settings.accentCustom')} ${accentCustomHex}`}
                    className="accent-swatch accent-swatch--custom"
                    style={{ background: accentCustomHex }}
                    onClick={() => updateAccentColor(ACCENT_CUSTOM)}
                  />
                </div>

                <div className="accent-custom">
                  <label className="accent-custom__label" htmlFor="settings-accent-hex">
                    {t('settings.accentHex')}
                  </label>
                  <div className="accent-custom__row">
                    <span className="accent-custom__chip" style={{ background: hexDraft }} aria-hidden="true" />
                    <TextInput
                      id="settings-accent-hex"
                      value={hexDraft}
                      onChange={setHexDraft}
                      placeholder={DEFAULT_CUSTOM_HEX}
                      maxLength={7}
                      mono
                      invalid={!hexValid}
                    />
                    <Button variant="ghost" size="sm" onClick={applyCustomHex} disabled={!hexValid}>
                      {t('settings.accentApply')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleResetAccent}>
                      {t('settings.accentReset')}
                    </Button>
                  </div>
                  <p className="accent-custom__hint">{t('settings.accentHexHint')}</p>
                  {!hexValid ? (
                    <p className="accent-custom__warning" role="alert">
                      {t('settings.accentHexInvalid')}
                    </p>
                  ) : lowContrast ? (
                    <p className="accent-custom__warning" role="status">
                      {theme === 'light'
                        ? t('settings.accentLowContrastLight')
                        : t('settings.accentLowContrastDark')}
                    </p>
                  ) : null}
                </div>
              </div>
            </Field>

            <Field label={t('settings.currency')} hint={t('settings.currencyHint')}>
              <TextInput value={currency} onChange={(value) => setCurrency(value.toUpperCase())} maxLength={3} mono />
            </Field>
          </div>
        </Card>

        <Card title={t('settings.sectionSku')}>
          <div className="form-grid">
            <Field label={t('settings.skuPrefix')} hint={t('settings.skuPrefixHint')}>
              <TextInput value={skuPrefix} onChange={(value) => setSkuPrefix(value.toUpperCase())} mono maxLength={12} />
            </Field>

            <Field
              label={t('settings.skuPattern')}
              hint={t('settings.skuPatternHint')}
              error={patternValidation.ok ? undefined : t('errors.invalid_sku_pattern')}
            >
              <TextInput value={skuPattern} onChange={setSkuPattern} mono invalid={!patternValidation.ok} />
            </Field>
          </div>

          <div className="notice notice--accent" style={{ marginTop: 12 }}>
            <span>
              {t('settings.skuPreview')}: <strong className="mono">{patternPreview || '—'}</strong>
            </span>
          </div>
        </Card>

        <Card title={t('settings.sectionInventory')}>
          <Field label={t('settings.staleThresholds')} hint={t('settings.staleThresholdsHint')}>
            <TextInput value={thresholds} onChange={setThresholds} placeholder="30, 60, 90" />
          </Field>
        </Card>

        <Card title={t('settings.sectionData')}>
          <div className="stack stack--sm">
            <div className="stat-line">
              <span className="faint">{t('settings.dataFolder')}</span>
              <span className="mono" style={{ fontSize: 11 }}>
                {info.userDataPath}
              </span>
            </div>
            <div className="stat-line">
              <span className="faint">{t('settings.databaseFile')}</span>
              <span className="mono" style={{ fontSize: 11 }}>
                {info.databasePath}
              </span>
            </div>
            <div className="stat-line">
              <span className="faint">{t('settings.schemaVersion')}</span>
              <span className="stat-line__value">v{number(health.schemaVersion)}</span>
            </div>
            <div className="stat-line">
              <span className="faint">{t('settings.journalMode')}</span>
              <span className="stat-line__value mono">{health.journalMode}</span>
            </div>
            <div className="stat-line">
              <span className="faint">{t('settings.integrity')}</span>
              <span className={`badge ${health.integrityCheck === 'ok' ? 'badge--ok' : 'badge--danger'}`}>
                {health.integrityCheck}
              </span>
            </div>
            <div className="stat-line">
              <span className="faint">{t('settings.fileSize')}</span>
              <span className="stat-line__value">{(health.fileSizeBytes / 1024).toFixed(1)} KB</span>
            </div>

            <div className="row" style={{ marginTop: 6 }}>
              <Button
                size="sm"
                icon={<IconExternal size={13} />}
                onClick={() => void api.app.openDataFolder().catch(reportError)}
              >
                {t('settings.openDataFolder')}
              </Button>
              <Button size="sm" onClick={() => void reloadHealth()}>
                {t('common.refresh')}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <BackupsCard />

      <Card title={t('settings.demoTitle')}>
        <p className="dim" style={{ marginTop: 0 }}>
          {t('settings.demoHint')}
        </p>
        <div className="row">
          <Button
            onClick={() => {
              void api.app
                .seedDemoData()
                .then((result) => {
                  notify(t('settings.demoInserted', { count: result.created }), 'success')
                  dataVersionRefresh(refreshData)
                })
                .catch(reportError)
            }}
          >
            {t('settings.demoInsert')}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              void api.app
                .clearDemoData()
                .then((result) => {
                  notify(
                    result.deleted === 0
                      ? t('settings.demoNone')
                      : t('settings.demoCleared', { count: result.deleted }),
                    'success'
                  )
                  dataVersionRefresh(refreshData)
                })
                .catch(reportError)
            }}
          >
            {t('settings.demoClear')}
          </Button>
        </div>
      </Card>

      <Card title={t('settings.sectionAttributes')}>
        <p className="dim" style={{ marginTop: 0 }}>
          {t('settings.attributesHint')}
        </p>

        {(attributes.data ?? []).length === 0 ? (
          <div className="notice">{t('settings.attributeNone')}</div>
        ) : (
          <div className="tree" style={{ marginBottom: 12 }}>
            {(attributes.data ?? []).map((attribute) => (
              <div key={attribute.id} className="tree__row">
                <span className="badge badge--muted">{t(`settings.type${capitalize(attribute.type)}` as 'settings.typeText')}</span>
                <span className="tree__name">{attribute.name}</span>
                <span className="tree__meta mono">{attribute.key}</span>
                {attribute.options.length > 0 ? (
                  <span className="tree__meta">{attribute.options.join(' · ')}</span>
                ) : null}
                <span className="tree__actions">
                  <IconButton
                    label={t('common.delete')}
                    onClick={() => {
                      void api.attributes
                        .remove(attribute.id)
                        .then(() => attributes.reload())
                        .catch(reportError)
                    }}
                  >
                    <IconTrash size={14} />
                  </IconButton>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="form-grid">
          <Field label={t('settings.attributeKey')}>
            <TextInput value={attributeKey} onChange={(value) => setAttributeKey(value.toLowerCase())} mono />
          </Field>
          <Field label={t('settings.attributeName')}>
            <TextInput value={attributeName} onChange={setAttributeName} />
          </Field>
          <Field label={t('settings.attributeType')}>
            <Select value={attributeType} onChange={(value) => setAttributeType(value as AttributeType)}>
              {ATTRIBUTE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(`settings.type${capitalize(value)}` as 'settings.typeText')}
                </option>
              ))}
            </Select>
          </Field>
          {attributeType === 'select' ? (
            <Field label={t('settings.attributeOptions')}>
              <TextInput value={attributeOptions} onChange={setAttributeOptions} />
            </Field>
          ) : null}
        </div>

        <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
          <Button
            icon={<IconPlus size={14} />}
            onClick={() => void createAttribute()}
            disabled={!attributeKey.trim() || !attributeName.trim()}
          >
            {t('settings.attributeNew')}
          </Button>
        </div>
      </Card>

      <Card title={t('settings.platformsTitle')}>
        <p className="dim" style={{ marginTop: 0 }}>
          {t('settings.platformsHint')}
        </p>

        <div className="tree" style={{ marginBottom: 12 }}>
          {(platforms.data ?? []).map((platform) => (
            <div key={platform.id} className="tree__row">
              <span className="tree__name">{platform.name}</span>
              <span className="tree__meta mono">{platform.code}</span>
              {platform.isBuiltin ? <span className="badge badge--muted">builtin</span> : null}
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={platform.active}
                  onChange={(event) => {
                    void api.platforms
                      .update(platform.id, { active: event.target.checked })
                      .then(() => platforms.reload())
                      .catch(reportError)
                  }}
                />
                {t('settings.platformActive')}
              </label>
            </div>
          ))}
        </div>

        <div className="form-grid">
          <Field label={t('settings.platformCode')}>
            <TextInput value={platformCode} onChange={(value) => setPlatformCode(value.toLowerCase())} mono />
          </Field>
          <Field label={t('settings.platformName')}>
            <TextInput value={platformName} onChange={setPlatformName} />
          </Field>
        </div>
        <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
          <Button
            icon={<IconPlus size={14} />}
            onClick={() => void createPlatform()}
            disabled={!platformCode.trim() || !platformName.trim()}
          >
            {t('settings.platformNew')}
          </Button>
        </div>
      </Card>

      <Card title={t('settings.tagsTitle')}>
        <p className="dim" style={{ marginTop: 0 }}>
          {t('settings.tagsHint')}
        </p>
        {(tags.data ?? []).length === 0 ? (
          <div className="notice">{t('settings.tagNone')}</div>
        ) : (
          <div className="tree">
            {(tags.data ?? []).map((tag) => (
              <div key={tag.id} className="tree__row">
                <span className="tree__name">{tag.name}</span>
                <span className="badge badge--muted">{t('settings.tagProducts', { count: tag.productCount })}</span>
                <span className="tree__actions">
                  <IconButton
                    label={t('common.delete')}
                    onClick={() => {
                      void api.tags
                        .remove(tag.id)
                        .then(() => tags.reload())
                        .catch(reportError)
                    }}
                  >
                    <IconTrash size={14} />
                  </IconButton>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={t('settings.sectionAbout')}>
        <div className="stack stack--sm">
          <div className="stat-line">
            <span className="faint">RESALEVAULT</span>
            <span className="stat-line__value">v{info.version}</span>
          </div>
          <div className="stat-line">
            <span className="faint">Electron</span>
            <span className="stat-line__value mono">{info.electronVersion}</span>
          </div>
          <div className="stat-line">
            <span className="faint">Chromium</span>
            <span className="stat-line__value mono">{info.chromeVersion}</span>
          </div>
          <div className="stat-line">
            <span className="faint">Node</span>
            <span className="stat-line__value mono">{info.nodeVersion}</span>
          </div>
          <div className="stat-line">
            <span className="faint">SQLite</span>
            <span className="stat-line__value mono">{info.sqliteVersion}</span>
          </div>
          <div className="stat-line">
            <span className="faint">{info.platform}</span>
            <span className="stat-line__value mono">{info.arch}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Button size="sm" onClick={() => void loadNotices()}>
            {t('settings.noticesView')}
          </Button>
          <Button size="sm" onClick={() => navigate({ name: 'license' })}>
            {t('settings.aboutLicenses')}
          </Button>
          <Button size="sm" onClick={() => void loadHash()}>
            {t('settings.aboutHashCompute')}
          </Button>
        </div>

        {appHash ? (
          <div className="stat-line" style={{ marginTop: 8 }}>
            <span className="faint">{t('settings.aboutHash')}</span>
            <span className="stat-line__value mono" style={{ wordBreak: 'break-all' }}>
              {appHash.hash}
            </span>
          </div>
        ) : null}
        <p className="faint" style={{ fontSize: 12, marginTop: 8 }}>
          {t('settings.aboutHashHint')}
        </p>
      </Card>

      {showNotices ? (
        <Modal title={t('settings.noticesTitle')} onClose={() => setShowNotices(false)} wide>
          {notices === undefined ? (
            <Spinner />
          ) : notices === null ? (
            <p>{t('settings.noticesEmpty')}</p>
          ) : (
            <>
              <p className="faint mono" style={{ fontSize: 12 }}>
                {notices.path}
              </p>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  maxHeight: '56vh',
                  overflow: 'auto',
                  fontSize: 12,
                  margin: 0
                }}
              >
                {notices.text}
              </pre>
            </>
          )}
        </Modal>
      ) : null}
    </div>
  )
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function dataVersionRefresh(refresh: () => void): void {
  refresh()
}
