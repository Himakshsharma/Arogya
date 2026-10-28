import { NavLink, Link, Outlet } from 'react-router-dom'
import { useSettings, useT } from '../lib/settings.jsx'
import { IconHand, IconLogo, IconMic, IconSettings, IconStethoscope, IconSpark } from './icons.jsx'

export default function Layout() {
  const t = useT()
  const { settings, update } = useSettings()

  const links = [
    { to: '/sign', en: 'Sign to speech', hi: 'संकेत से आवाज़', short: ['Sign', 'संकेत'], icon: IconHand },
    { to: '/speak', en: 'Speech to sign', hi: 'आवाज़ से संकेत', short: ['Speak', 'बोलें'], icon: IconMic },
    { to: '/clinic', en: 'Clinic', hi: 'क्लिनिक', short: ['Clinic', 'क्लिनिक'], icon: IconStethoscope },
    { to: '/teach', en: 'Teach signs', hi: 'संकेत सिखाएँ', short: ['Teach', 'सिखाएँ'], icon: IconSpark },
  ]

  return (
    <div className="shell">
      <a className="skip" href="#main">{t('Skip to content', 'मुख्य भाग पर जाएँ')}</a>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Arogya home">
          <IconLogo className="brand__mark" />
          <span>Arogya</span>
          <span className="brand__hi" lang="hi">आरोग्य</span>
        </Link>
        <nav className="nav" aria-label={t('Main', 'मुख्य')}>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to}>{t(l.en, l.hi)}</NavLink>
          ))}
        </nav>
        <div className="topbar__tools">
          <div className="lang-switch" role="group" aria-label={t('Language', 'भाषा')}>
            <button type="button" aria-pressed={settings.lang === 'en'} onClick={() => update({ lang: 'en' })}>EN</button>
            <button type="button" aria-pressed={settings.lang === 'hi'} onClick={() => update({ lang: 'hi' })} lang="hi">हिं</button>
          </div>
          <Link to="/settings" className="icon-btn" aria-label={t('Accessibility settings', 'सुलभता सेटिंग')}>
            <IconSettings width="22" height="22" />
          </Link>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>

      <nav className="tabbar" aria-label={t('Main', 'मुख्य')}>
        {links.map(({ to, short, icon: Icon }) => (
          <NavLink key={to} to={to}>
            <Icon />
            <span>{t(short[0], short[1])}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
