const base = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
}

const HEART = 'M12 20s-7-4.3-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.7-7 10-7 10z'
const BELLY = 'M8 3v4c-2 1-3 3-3 6a7 7 0 0 0 14 0c0-3-1-5-3-6V3'

const PATHS = {
  headache: <><circle cx="10" cy="13" r="7" /><path d="M7.5 12.5h.01M12.5 12.5h.01M8.5 16.5h3M16 3.5l1.2 2.3L20 4.5M19.5 9l2.3.4" /></>,
  chest_pain: <><path d={HEART} /><path d="M12 7.4 10.6 11l2.8 2-1.4 3" /></>,
  stomach_pain: <><path d={BELLY} /><path d="M12 11a2 2 0 1 1-2 2 3.5 3.5 0 0 1 3.5-3.5" /></>,
  back_pain: <><path d="M11 2v20M8 5h6M7.5 9h7M7.5 13h7M8 17h6M18 9l2.5-1M18 13l2.5 1" /></>,
  tooth_pain: <path d="M7.5 3C5.5 3 4 4.7 4 7c0 3 1.2 4 1.7 7 .4 2.6 1 6 2.4 6 1.5 0 1.6-4 2.1-6h3.6c.5 2 .6 6 2.1 6 1.4 0 2-3.4 2.4-6 .5-3 1.7-4 1.7-7 0-2.3-1.5-4-3.5-4-2 0-2.8 1-4.5 1S9.5 3 7.5 3z" />,
  ear_pain: <><path d="M7 9a5 5 0 1 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0" /><path d="M10 9a2 2 0 1 1 4 0c0 1.5-2 2-2 3M19.5 14l2 .5M19 17.5l1.8 1.2" /></>,
  joint_pain: <><path d="M8 2l1.5 9L6 21M13 2l.5 8.5L11 21" /><path d="M16.5 10l2.5-1M16.5 13.5H19" /></>,
  fever: <><path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z" /><path d="M12 8v8" /></>,
  dizzy: <path d="M12 12.5a1.5 1.5 0 1 1 1.5-1.5 3.5 3.5 0 1 1-3.5-3.5A5.5 5.5 0 1 1 6.5 13 7.5 7.5 0 1 1 14 20.5" />,
  weak: <><rect x="2" y="7" width="17" height="10" rx="2" /><path d="M22 11v2M5.5 10v4" /></>,
  rash: <><circle cx="12" cy="12" r="9" /><path d="M9 9h.01M14.5 8h.01M15 13.5h.01M9 14h.01M12 16.5h.01M12 11.5h.01" strokeWidth="2.6" /></>,
  bleeding: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  eye_problem: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  no_sleep: <><path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5z" /><path d="M3 3l18 18" /></>,
  cough: <><path d="M4 6a8 8 0 0 1 8 8v.5a2.5 2.5 0 0 1-5 0V14" /><path d="M15 9h.01M18.5 7h.01M18.5 12h.01M21 9.5h.01" strokeWidth="2.6" /></>,
  cold: <path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7" />,
  breathless: <><path d="M12 3v8M12 11c-1-1-2.2-1-3 0M12 11c1-1 2.2-1 3 0" /><path d="M9 7C6 7 4 11 4 16c0 2 1 3 2.5 3S9 18 9 16V7zM15 7c3 0 5 4 5 9 0 2-1 3-2.5 3S15 18 15 16V7z" /></>,
  sore_throat: <><path d="M8 2v6c0 2-2 3-2 6v8M16 2v6c0 2 2 3 2 6v8" /><circle cx="12" cy="13" r="1.6" /></>,
  palpitations: <><path d={HEART} /><path d="M3 12h4.5L9 9l2 6 1.5-3H21" /></>,
  vomiting: <><circle cx="12" cy="8.5" r="5.5" /><path d="M10 11h4M11 14.5c0 2-1 3.5-1 6M13 14.5c0 2 1 3.5 1 6" /></>,
  nausea: <path d="M3 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />,
  diarrhoea: <><path d={BELLY} /><path d="M12 10v6M9.5 13.5 12 16l2.5-2.5" /></>,
  no_appetite: <><circle cx="14" cy="12" r="6" /><path d="M5 3v18M3 3v4a2 2 0 0 0 4 0V3M3 21 21 3" /></>,
  need_water: <><path d="M6 3h12l-1.6 17.1a1 1 0 0 1-1 .9H8.6a1 1 0 0 1-1-.9z" /><path d="M7 9h10" /></>,
  need_toilet: <path d="M6 3h4v8H6zM4 11h16a8 8 0 0 1-8 8v2H8v-3.5A8 8 0 0 1 4 11z" />,
  need_family: <><circle cx="8" cy="7" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M2 21v-2a6 6 0 0 1 12 0v2M15 21v-1.5a3 3 0 0 1 6 0V21" /></>,
  need_interpreter: <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6.5 7h-.5c-2.5 0-4-1.2-5.3-3.2L2.6 14a1.5 1.5 0 0 1 2.4-1.8L8 15" />,
  repeat: <path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5" />,
  understood: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6.5" /></>,
  not_understood: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7v.5M12 17h.01" /></>,
}

export default function SymptomIcon({ id, ...props }) {
  const shape = PATHS[id]
  if (!shape) return null
  return <svg {...base} {...props}>{shape}</svg>
}

// Faces for the 0-10 pain scale, from calm to severe.
const MOUTHS = ['M8 14.5c2 2.5 6 2.5 8 0', 'M8.5 15c2 1.3 5 1.3 7 0', 'M8.5 15.5h7', 'M8.5 16.5c2-1.3 5-1.3 7 0', 'M8 17c2-2.5 6-2.5 8 0', 'M8 17.5c2-3 6-3 8 0']

export function PainFace({ level, ...props }) {
  const severe = level >= 4
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9.5" />
      {severe ? <path d="M7.5 9.5l2 1M16.5 9.5l-2 1" /> : <path d="M9 10h.01M15 10h.01" strokeWidth="2.6" />}
      {level >= 3 && !severe && <path d="M7.5 8l2-.6M16.5 8l-2-.6" />}
      <path d={MOUTHS[level]} />
    </svg>
  )
}
