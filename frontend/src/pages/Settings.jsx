import { useSettings, useT } from '../lib/settings.jsx'
import { speak } from '../lib/speech.js'

function Choice({ label, value, options, onChange }) {
  return (
    <fieldset className="field" style={{ border: 0, padding: 0 }}>
      <legend style={{ fontWeight: 600, marginBottom: 6 }}>{label}</legend>
      <div className="segmented">
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{text}</button>
        ))}
      </div>
    </fieldset>
  )
}

export default function Settings() {
  const t = useT()
  const { settings, update } = useSettings()

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('Accessibility', 'सुलभता')}</h1>
          <p>{t('Saved on this device.', 'इस डिवाइस पर सहेजा जाता है।')}</p>
        </div>
      </div>
      <div className="split">
        <div className="panel">
          <Choice label={t('Language', 'भाषा')} value={settings.lang} onChange={(lang) => update({ lang })}
            options={[['en', 'English'], ['hi', 'हिंदी']]} />
          <Choice label={t('Text size', 'अक्षरों का आकार')} value={settings.textSize} onChange={(textSize) => update({ textSize })}
            options={[['m', t('Normal', 'सामान्य')], ['l', t('Large', 'बड़ा')], ['xl', t('Extra large', 'बहुत बड़ा')]]} />
          <Choice label={t('Colours', 'रंग')} value={settings.contrast} onChange={(contrast) => update({ contrast })}
            options={[['normal', t('Normal', 'सामान्य')], ['high', t('High contrast', 'तेज़ कंट्रास्ट')]]} />
          <Choice label={t('Theme', 'थीम')} value={settings.theme} onChange={(theme) => update({ theme })}
            options={[['auto', t('Match device', 'डिवाइस जैसा')], ['light', t('Light', 'हल्का')], ['dark', t('Dark', 'गहरा')]]} />
          <Choice label={t('Motion', 'हलचल')} value={settings.reduceMotion} onChange={(reduceMotion) => update({ reduceMotion })}
            options={[[false, t('Normal', 'सामान्य')], [true, t('Reduce', 'कम')]]} />
        </div>
        <div className="panel">
          <Choice label={t('Read messages aloud', 'संदेश पढ़कर सुनाएँ')} value={settings.autoSpeak} onChange={(autoSpeak) => update({ autoSpeak })}
            options={[[true, t('On', 'चालू')], [false, t('Off', 'बंद')]]} />
          <Choice label={t('Speaking speed', 'बोलने की गति')} value={settings.speechRate} onChange={(speechRate) => update({ speechRate })}
            options={[[0.75, t('Slow', 'धीमी')], [0.95, t('Normal', 'सामान्य')], [1.15, t('Fast', 'तेज़')]]} />
          <button type="button" className="btn btn--line" onClick={() => speak(t('This is how I will sound.', 'मैं ऐसे बोलूँगा।'), settings.lang, { rate: settings.speechRate })}>
            {t('Test voice', 'आवाज़ जाँचें')}
          </button>
          <div className="mt">
            <Choice label={t('Avatar signing speed', 'अवतार की गति')} value={settings.avatarSpeed} onChange={(avatarSpeed) => update({ avatarSpeed })}
              options={[[0.6, t('Slow', 'धीमी')], [1, t('Normal', 'सामान्य')], [1.3, t('Fast', 'तेज़')]]} />
            <Choice label={t('Main signing hand', 'संकेत का मुख्य हाथ')} value={settings.leftHanded} onChange={(leftHanded) => update({ leftHanded })}
              options={[[false, t('Right hand', 'दायाँ हाथ')], [true, t('Left hand', 'बायाँ हाथ')]]} />
          </div>
        </div>
      </div>
    </>
  )
}
