import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AvatarStage from '../avatar/AvatarStage.jsx'
import { IconHand, IconInfo, IconMic, IconSpark } from '../components/icons.jsx'
import { useSettings, useT } from '../lib/settings.jsx'

const TOOLS = [
  {
    to: '/sign', icon: IconHand, lead: true,
    title: ['Sign to speech', 'संकेत से आवाज़'],
    text: ['Sign in front of the camera. Arogya writes it and says it aloud in Hindi or English.', 'कैमरे के सामने संकेत करें। आरोग्य उसे लिखता है और हिंदी या अंग्रेज़ी में बोलता है।'],
  },
  {
    to: '/speak', icon: IconMic,
    title: ['Speech to sign', 'आवाज़ से संकेत'],
    text: ['Speak or type. The 3D avatar signs it in ISL.', 'बोलें या लिखें। 3D अवतार उसे ISL में दिखाता है।'],
  },
  {
    to: '/teach', icon: IconSpark,
    title: ['Teach a sign', 'संकेत सिखाएँ'],
    text: ['Record your own way of signing a word. Arogya learns it in seconds.', 'किसी शब्द का अपना संकेत रिकॉर्ड करें। आरोग्य उसे कुछ सेकंड में सीख लेता है।'],
  },
]

const GREETING = [
  { gloss: 'HELLO', kind: 'sign' },
  { gloss: 'DOCTOR', kind: 'sign' },
  { gloss: 'HELP', kind: 'sign' },
  { gloss: 'YOU', kind: 'sign' },
]

export default function Home() {
  const t = useT()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [loop, setLoop] = useState(0)
  const replayTimer = useRef(null)
  useEffect(() => () => clearTimeout(replayTimer.current), [])

  const join = (e) => {
    e.preventDefault()
    const c = code.trim().toUpperCase()
    if (c.length >= 4) navigate(`/join/${c}`)
  }

  return (
    <>
      <section className="hero">
        <div>
          <h1>{t('Your doctor, in your language.', 'आपका डॉक्टर, आपकी भाषा में।')}</h1>
          <p className="hero__hi" lang={settings.lang === 'hi' ? 'en' : 'hi'}>
            {settings.lang === 'hi' ? 'Your doctor, in your language.' : 'आपका डॉक्टर, आपकी भाषा में।'}
          </p>
          <p className="hero__lede">
            {t(
              'Sign, speak, type or tap a picture. Arogya turns it into words the doctor understands, and turns the doctor’s words back into Indian Sign Language and speech.',
              'संकेत करें, बोलें, लिखें या तस्वीर दबाएँ। आरोग्य उसे डॉक्टर के समझने लायक शब्दों में बदलता है, और डॉक्टर की बात को भारतीय सांकेतिक भाषा और आवाज़ में।',
            )}
          </p>

          <div className="doors">
            <form className="door door--patient" onSubmit={join}>
              <h2>{t('I am a patient', 'मैं मरीज़ हूँ')}</h2>
              <p>{t('Type the code shown on your doctor’s screen.', 'डॉक्टर की स्क्रीन पर दिखा कोड लिखें।')}</p>
              <label className="sr-only" htmlFor="join-code">{t('Consultation code', 'परामर्श कोड')}</label>
              <div className="code-row">
                <input
                  id="join-code"
                  className="input"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, '').slice(0, 6))}
                  placeholder="ABC234"
                  autoComplete="off"
                  inputMode="text"
                />
                <button className="btn btn--primary" type="submit" disabled={code.length < 4}>
                  {t('Join', 'जुड़ें')}
                </button>
              </div>
            </form>
            <div className="door">
              <h2>{t('I am a doctor', 'मैं डॉक्टर हूँ')}</h2>
              <p>{t('Start a consultation and share the code with your patient.', 'परामर्श शुरू करें और कोड मरीज़ को दें।')}</p>
              <Link className="btn btn--neel" to="/clinic">{t('Open the clinic', 'क्लिनिक खोलें')}</Link>
            </div>
          </div>
        </div>

        <AvatarStage
          tokens={GREETING}
          playKey={loop}
          label={t('Avatar signing: hello, doctor, help, you', 'अवतार संकेत कर रहा है: नमस्ते, डॉक्टर, मदद, आप')}
          onDone={() => {
            if (!settings.reduceMotion) replayTimer.current = setTimeout(() => setLoop((n) => n + 1), 6000)
          }}
        />
      </section>

      <h2 className="section-title">{t('Use it on your own', 'अकेले इस्तेमाल करें')}</h2>
      <ul className="tools">
        {TOOLS.map(({ to, icon: Icon, title, text, lead }) => (
          <li key={to}>
            <Link to={to} className={`tool ${lead ? 'tool--lead' : ''}`}>
              <Icon className="tool__icon" />
              <div>
                <h3>{t(...title)}</h3>
                <p>{t(...text)}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <aside className="disclaimer">
        <IconInfo />
        <p style={{ margin: 0 }}>
          {t(
            'Arogya helps everyday conversation in the clinic. For consent forms, surgery or a serious diagnosis, ask the hospital for a certified ISL interpreter.',
            'आरोग्य क्लिनिक की रोज़ की बातचीत में मदद करता है। सहमति पत्र, ऑपरेशन या गंभीर बीमारी की बात के लिए अस्पताल से प्रमाणित ISL दुभाषिया माँगें।',
          )}
        </p>
      </aside>
    </>
  )
}
