import { expect, test } from '@playwright/test'

const ctxOptions = (info, baseURL) => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = info.project.use
  return { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL }
}

const shot = (page, name, info) => page.screenshot({ path: `e2e-shots/${info.project.name}-${name}.png`, fullPage: true })

test('home page loads with the signing avatar', async ({ page }, info) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your doctor')
  await expect(page.locator('.stage__canvas canvas')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(2200)
  await shot(page, '01-home', info)
})

test('speech to sign converts text into ISL gloss', async ({ page }, info) => {
  await page.goto('/speak')
  await page.getByRole('button', { name: 'Where does it hurt?' }).click()
  await expect(page.getByText('PAIN WHERE')).toBeVisible()
  await expect(page.getByText('दर्द कहाँ हो रहा है?')).toBeVisible()
  await page.waitForTimeout(1600)
  await shot(page, '02-speak-to-sign', info)
})

test('Hindi interface switch', async ({ page }, info) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'हिं' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('आपका डॉक्टर')
  await shot(page, '03-home-hindi', info)
})

test('full consultation: doctor, deaf patient, prescription', async ({ browser, baseURL }, info) => {
  const doctorCtx = await browser.newContext(ctxOptions(info, baseURL))
  const doctor = await doctorCtx.newPage()
  await doctor.goto('/clinic')
  await doctor.getByRole('button', { name: 'Try the demo doctor account' }).click()
  await doctor.getByLabel('Patient name').fill('Asha Verma')
  await doctor.getByRole('button', { name: 'Start consultation' }).click()
  await expect(doctor.locator('.room-code')).toBeVisible()
  const code = (await doctor.locator('.room-code').textContent()).trim()

  const patientCtx = await browser.newContext(ctxOptions(info, baseURL))
  const patient = await patientCtx.newPage()
  await patient.goto(`/join/${code}`)
  await expect(patient).toHaveURL(new RegExp(`/patient/${code}`))
  await expect(doctor.getByText('Patient connected')).toBeVisible({ timeout: 15_000 })

  await doctor.getByRole('button', { name: 'Where does it hurt?' }).click()
  await expect(patient.locator('.now__text')).toHaveText('दर्द कहाँ हो रहा है?', { timeout: 15_000 })
  await patient.waitForTimeout(1500)
  await shot(patient, '04-patient-sees-sign', info)

  await patient.getByRole('button', { name: /Headache/ }).click()
  await expect(doctor.getByText('I have a headache.')).toBeVisible({ timeout: 15_000 })
  await shot(doctor, '05-doctor-room', info)

  await doctor.getByRole('tab', { name: 'Prescription' }).click()
  await doctor.getByLabel('Diagnosis').fill('Tension headache')
  await doctor.getByLabel('Medicine').first().fill('Paracetamol')
  await doctor.getByLabel('Strength').first().fill('500 mg')
  await doctor.getByRole('button', { name: 'Send prescription to patient' }).click()
  await expect(doctor.getByText('Sent. The patient can open')).toBeVisible()

  await expect(patient.getByRole('link', { name: /पर्चा|prescription/i }).first()).toBeVisible({ timeout: 15_000 })
  await patient.getByRole('link', { name: /पर्चा|prescription/i }).first().click()
  await expect(patient.getByRole('heading', { name: 'Paracetamol' })).toBeVisible()
  await expect(patient.getByText('खाने के बाद').first()).toBeVisible()
  await shot(patient, '06-prescription', info)

  await doctorCtx.close()
  await patientCtx.close()
})

test('teach and settings pages render', async ({ page }, info) => {
  await page.goto('/teach')
  await expect(page.getByRole('heading', { name: 'Teach a sign' })).toBeVisible()
  await page.waitForTimeout(1500)
  await shot(page, '07-teach', info)
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Extra large' }).click()
  await page.getByRole('button', { name: 'Dark' }).click()
  await shot(page, '08-settings-dark-xl', info)
})

test('sign to speech page explains camera use', async ({ page }, info) => {
  await page.goto('/sign')
  await expect(page.getByRole('button', { name: 'Turn on camera' })).toBeVisible()
  await shot(page, '09-sign-to-speech', info)
})
