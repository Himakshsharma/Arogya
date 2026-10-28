# Arogya: interview questions and answers

Every answer refers to the actual code in this repository, so you can open the file and show it. Answers are written in first person, the way you would say them. Where a number depends on your own training run (accuracy), the answer tells you where to find it instead of inventing one.

**Before any interview:** run the app once end to end, train the model on Colab, and note the numbers from `backend/app/data/models/report.json`.

---

## A. The project in two minutes

**1. Tell me about your project.**
Arogya is a doctor–patient communication assistant for deaf, blind and speech-impaired patients in Indian hospitals. When the doctor speaks, a deaf patient sees the words as Hindi or English text and as Indian Sign Language signed by a 3D avatar. The patient answers by signing to the camera, tapping symptom pictures, marking pain on a body map or typing, and the doctor hears it read aloud. Blind patients get every message spoken and a prescription that reads itself aloud. It's a React web app with a FastAPI backend, MediaPipe for hand tracking in the browser, an LSTM plus template matching for sign recognition, a rule-based English/Hindi-to-ISL converter and a Three.js avatar.

**2. Why did you build it?**
Two reasons. First, most sign-language projects target American Sign Language; ISL has its own grammar and handshapes and very few tools. Second, hospitals are where miscommunication is dangerous: a wrong dose or a missed allergy is a safety issue. Combining two-way ISL with a hospital workflow gave the project a real user and a real problem.

**3. Who are the users?**
Three groups: deaf or hard-of-hearing patients, blind or low-vision patients, and patients who cannot speak, plus the doctor. Each patient type gets a different default screen: deaf patients start on the symptom board and sign camera, blind patients on a single large “tap and speak” button with auto-read messages.

**4. What makes it different from other sign-language projects?**
It's two-way (sign → speech and speech → sign), it's built for ISL rather than ASL, and it's embedded in a complete clinical workflow (live consultation rooms, symptom board, pain scale, structured prescriptions). Technically, one landmark format drives the camera, recogniser and avatar, which lets a user teach a new sign once and have it both recognised and signed back.

**5. What was the hardest part?**
Making the pieces agree on one coordinate system. The camera gives image coordinates, the avatar needs 3D body space, and the model needs scale-invariant features. I normalised everything to a shoulder-centred frame divided by shoulder width, wrote it in Python and JavaScript, and added a test that checks both produce the same numbers from the same fixture.

**6. What would you do differently?**
I'd involve Deaf ISL users from the first week to review the avatar signs and the gloss rules, and I'd collect a small clinic-specific dataset (words like “allergy”, “injection”, “dizzy”) because INCLUDE covers general vocabulary.

**7. Is it production-ready?**
It's a working pilot, not a certified medical device. It handles everyday clinic conversation, and the home screen tells users to ask for a certified interpreter for consent, surgery or serious diagnoses. For production I'd add Postgres, Redis for rooms, audit logs, and clinical validation.

**8. How long did it take and what was your role?**
(Answer honestly for your situation.) I designed the architecture, wrote the backend, the ML pipeline, the avatar and the UI, and the tests.

---

## B. Architecture and design decisions

**9. Draw the architecture.**
Patient browser: camera → MediaPipe hand and pose landmarkers → normalised landmarks → segmenter → `/api/signs/recognize`. Doctor browser: microphone → Web Speech API (or Whisper on the server) → WebSocket. FastAPI server: recogniser (ONNX LSTM + DTW), text-to-gloss, translator, WebSocket room manager, SQLite. Every consultation message is enriched once on the server (both languages + ISL gloss) and broadcast to both screens. (See `docs/ARCHITECTURE.md`.)

**10. Why a web app instead of a mobile app?**
One codebase runs on the hospital desktop and on the patient's phone, with no install. It's an installable PWA with an offline shell for weak Wi-Fi. MediaPipe and Web Speech both run in the browser.

**11. Why FastAPI?**
Async support for WebSockets, automatic request validation with Pydantic, auto-generated API docs at `/docs`, and it's Python, which is where the ML lives.

**12. Why SQLite?**
It's a single file, needs no server, and handles a department-level pilot easily. All SQL is in `db.py` and the routers, so moving to PostgreSQL means changing the connection layer, not the app.

**13. Why run hand tracking in the browser instead of on the server?**
Privacy and bandwidth. Video never leaves the patient's device; only about 150 numbers per frame are sent. It also removes server GPU cost, and MediaPipe uses the device's GPU through WebGL.

**14. What is the “one data format” idea?**
A frame is 6 arm points plus 21 points per hand, in shoulder-centred coordinates. The camera produces it, the LSTM and DTW consume it, and the avatar renders it. So a recording from the Teach screen is instantly a recognition template and an avatar animation, and the avatar's built-in signs became starter templates for recognition.

**15. Why do messages carry both languages?**
The server translates once and stores `{en, hi}` plus the gloss. Each screen picks its language. Doctor and patient can use different languages without each client calling a translator.

**16. How does real-time communication work?**
WebSockets. `/ws/consult/{code}?role=doctor|patient`. The server keeps a dict of rooms → sockets, sends history on join, broadcasts new messages and presence. The client (`useRoom.js`) reconnects with exponential backoff and sends a ping every 25 seconds.

**17. Why not use a ready-made avatar or animation files?**
Signs need precise hand shapes, and I wanted the avatar to play signs recorded from real people. A procedural hand model driven by landmarks does both, with no rigging or animation files.

**18. How did you decide what to build first?**
The doctor–patient text loop with the symptom board first, since it's useful even without any ML. Then gloss + avatar, then recognition, then training on INCLUDE.

---

## C. Computer vision and MediaPipe

**19. What does MediaPipe give you?**
The hand landmarker gives 21 3D points per hand (wrist, and 4 joints per finger). The pose landmarker gives 33 body points; I use shoulders, elbows and wrists. Together they're the core of MediaPipe Holistic.

**20. Why not use MediaPipe Holistic directly?**
The Tasks API in the browser gives me the hand and pose landmarkers as separate models, which load reliably on both GPU and CPU, and I only need part of the face/pose output. Functionally it's the same set of landmarks Holistic provides.

**21. How do you know which hand is left and which is right?**
MediaPipe's handedness label flips when the image is mirrored. I instead assign each detected hand to the closer pose wrist (`assign_hands`). With two hands I choose the assignment with the smaller total distance.

**22. How do you normalise landmarks and why?**
Convert to pixels (so x and y use the same scale), subtract the shoulder mid-point, divide by shoulder width, flip y so up is positive. This removes the effect of where the person sits and how far they are from the camera. The z value of hand points is relative to the wrist, so I add the pose wrist depth.

**23. How do you split continuous signing into words?**
`SignSegmenter`: a sign starts when a wrist rises above the waist line and ends after about 7 frames (~0.35 s) of hands down or out of view. Segments shorter than 8 frames are ignored as noise, and anything over 75 frames is cut.

**24. What happens with poor lighting or partial occlusion?**
Frames without a pose are skipped; missing hands are zeros for the LSTM and a “not present” flag for DTW. The UI shows live landmarks over the video so the user can see when tracking fails, and asks them to keep both hands in view.

**25. What frame rate do you process?**
About 20 fps, throttled in `SignTracker`, which is enough for signing and keeps older phones cool.

**26. GPU vs CPU in MediaPipe?**
I try the GPU delegate first and fall back to CPU if WebGL2 isn't available.

---

## D. Sign recognition and machine learning

**27. What dataset did you use?**
INCLUDE from AI4Bharat: about 4,300 videos of 263 ISL words, recorded by deaf students. There's also INCLUDE-50, a 50-word subset. The notebook can download all categories or just clinic-relevant ones.

**28. Walk me through the training pipeline.**
`ml/extract_keypoints.py` runs MediaPipe on every video, normalises frames with the same code the server uses, trims idle frames at the start and end, and saves sequences. `ml/train_lstm.py` resamples each sequence to 30 frames × 144 features, does a stratified 80/20 split, augments the training set, trains a two-layer LSTM, evaluates, writes `report.json`, and exports to ONNX.

**29. What are the 144 features?**
6 arm points × 3 coordinates = 18, plus 21 points × 3 for each hand = 126. Missing hands are zeros.

**30. Why an LSTM?**
A sign is a short motion sequence, and an LSTM models order and timing. It's small (two layers, 128 and 96 units), trains in minutes on a free Colab GPU, and runs in a couple of milliseconds on a CPU through ONNX Runtime.

**31. Why not a Transformer?**
With a few thousand clips, a Transformer tends to overfit without heavy augmentation or pre-training. An LSTM is a strong baseline at this size. The pipeline would take a Transformer encoder as a drop-in replacement for `build_model`.

**32. Why not train a CNN on raw video?**
Keypoints are 144 numbers per frame instead of ~200,000 pixels, so training is fast, the model is tiny, and it ignores background, clothing and skin tone, which helps it generalise to new signers.

**33. What augmentation did you use?**
Time stretching (0.75–1.25×), small random shifts and scaling, Gaussian jitter, and occasionally dropping a hand (`augment()` in `train_lstm.py`). These mimic different signing speeds, positions and tracking drop-outs.

**34. What accuracy did you get?**
(Quote your `report.json`.) I report top-1 and top-3 accuracy on a held-out 20% stratified split, and I look at the most-confused pairs, which are usually signs with similar handshapes in similar places. Note the split is by video, not by signer, so real-world accuracy on a brand-new signer will be lower; a signer-independent split is the next evaluation I'd add.

**35. What is DTW and why do you also use it?**
Dynamic Time Warping aligns two sequences that may be at different speeds and measures the distance along the best alignment. I use it for template matching: every sign a user records becomes a template, and a new sign is matched to the nearest template. It needs no training, works from a single example, and adapts to regional variants and to one person's style.

**36. How is your DTW implemented?**
`features.dtw_distance`: compute a pairwise Euclidean cost matrix with NumPy, then fill the accumulated-cost table with a Sakoe-Chiba band (30% of the length) so impossible alignments are skipped, then normalise by path length. Both sequences are first resampled to 24 frames.

**37. What features does DTW use?**
38 per frame: for each hand, the wrist position (where the sign is), five fingertips relative to the wrist divided by palm size (which handshape), and a presence flag. It's much smaller than 144 and focuses on what distinguishes signs.

**38. How do you turn DTW distances into confidence?**
A softmax over negative distances, with the temperature set from the spread of distances, multiplied by a quality factor that drops when even the best match is far away. If the top score is below 0.45, the app doesn't guess: it shows the top three for the patient to choose.

**39. How do the LSTM and DTW results combine?**
Both produce ranked labels with scores. I merge by label, keeping the higher score, and sort. User-recorded templates get a 15% distance bonus over the synthetic starter templates.

**40. What are starter templates?**
Each of the avatar's 85 built-in signs is sampled at 20 fps and saved as a template (`scripts/export_starter_templates.mjs`). So recognition works on day one before any training. They're synthetic, so they're a cold-start aid, not a measure of real accuracy.

**41. How do you handle left-handed signers?**
For DTW I match both the original and a mirrored sequence (flip x, swap left and right). There's also a left-hand setting that mirrors the camera input and the avatar.

**42. How fast is recognition?**
On my machine about 30–40 ms per sign for DTW over 85 templates, and a few milliseconds for the ONNX LSTM.

**43. Why export to ONNX?**
The server then needs only `onnxruntime` (about 15 MB) instead of TensorFlow (about 500 MB). That's what makes the free hosting tier possible. The training script also checks the ONNX output matches Keras.

**44. How would you improve accuracy?**
Signer-independent evaluation; collect clinic vocabulary from Deaf signers; add face landmarks (ISL uses facial grammar); try a Transformer or a temporal CNN; use the Teach recordings (with consent) to fine-tune.

**45. What about continuous sentence recognition?**
Right now it's isolated-word recognition with automatic segmentation. Continuous sign recognition would need a sequence model with CTC loss and a sentence-level dataset such as ISL-CSLRT.

**46. How do you prevent overfitting?**
Dropout after each layer, augmentation, early stopping on validation accuracy with best weights restored, and learning-rate reduction on plateau.

---

## E. Text → ISL and translation

**47. How is ISL grammar different from English?**
ISL is generally subject-object-verb, puts time references at the start, puts negation after the verb, puts question words at the end, and drops articles and auxiliary verbs. Facial expression marks questions.

**48. How does your text-to-gloss converter work?**
`services/gloss.py`: phrase matching first (“thank you”, “after food”), then drop function words, map words to canonical signs with a synonym table and a small lemmatiser, fingerspell unknown words, then a stable sort into five groups: time, others, verbs, negation, question words. For example, “Where does it hurt?” becomes `PAIN WHERE`.

**49. Why rules instead of a neural model?**
In a medical setting I need to explain exactly why a sentence was signed a certain way, and there's no large English–ISL gloss corpus to train on. Rules are transparent, testable (there are unit tests for each rule) and easy for an ISL expert to correct.

**50. How do you handle Hindi?**
A Hindi synonym table maps words like दर्द → PAIN, सिर → HEAD, and drops postpositions (को, का, में, है). Hindi is already verb-final, which matches ISL well. Unknown Hindi words, usually names, are transliterated to Latin letters for fingerspelling (रवि → RAVI).

**51. What happens to a word with no sign?**
It's fingerspelled letter by letter, and the letter is shown large on screen. In the gloss strip, fingerspelled words have a dashed border so the reader knows.

**52. How is translation done?**
Three layers in `translator.py`: an exact medical phrasebook (doctor questions, patient answers, every symptom sentence), then an optional neural engine (IndicTrans2 or MarianMT), then a word-by-word dictionary marked **approximate**. Every result says which engine produced it, and the UI shows an “approximate” tag.

**53. Why not always use IndicTrans2?**
It needs about 1–2 GB of RAM per direction and a compiled toolkit, which doesn't fit small free hosts. The phrasebook already covers most clinic conversation exactly. On a host with enough memory, setting `AROGYA_TRANSLATION_ENGINE=indictrans2` turns it on.

**54. How do you make prescriptions accurate in Hindi without translation?**
They're structured: medicine, strength, quantities for morning/afternoon/night, before/after food, days. `prescription_text.py` generates the sentence from templates in each language, so “1 in the morning and 1 at night, after food, for 3 days” becomes “सुबह 1 और रात 1, खाने के बाद, 3 दिन तक लीजिए।” exactly.

**55. How do recognised signs become a sentence for the doctor?**
`gloss_to_sentence` keeps the patient's sign order and maps each sign to a word in the doctor's language. It's marked approximate because sign order isn't English order.

**56. How do you handle numbers?**
1–5 have signs; other numbers are fingerspelled digit by digit. In prescriptions, the day count is signed with the number sign when it's 5 or less.

---

## F. Speech

**57. How does speech-to-text work?**
In Chrome, Edge and Android, the Web Speech API with `en-IN` or `hi-IN`, with live interim results. Where it's missing (e.g. Firefox), the app records audio with MediaRecorder and sends it to `/api/speech/stt`, which uses faster-whisper if enabled.

**58. Why faster-whisper?**
It's a CTranslate2 version of Whisper that runs several times faster on CPU with int8 quantisation, which matters on a free server. I pass a short medical prompt to bias it toward clinic vocabulary and enable voice-activity detection.

**59. How does text-to-speech work?**
The browser's `speechSynthesis` with an Indian voice if the device has one; otherwise the server generates an MP3 with gTTS (cached in an LRU cache). Users can set the speaking speed.

**60. How do blind users navigate?**
Messages are read aloud automatically; the patient screen has one large microphone button and big Yes/No buttons; everything has proper labels for screen readers, `aria-live` regions announce new messages, and the prescription has “Listen to all” plus per-medicine listening.

---

## G. The 3D avatar

**61. How is the avatar built?**
From primitives in Three.js: a lathe for the kurta, spheres and cylinders for head, arms and every finger bone, an ellipsoid palm. Every frame, each bone is placed between two landmarks: position at the midpoint, scaled to the distance, rotated from the y-axis to the bone direction with a quaternion.

**62. How do you describe a sign?**
As keyframes of two hand poses. Each pose is: where the wrist is, which way the fingers point, which way the palm faces, and a handshape name. `handModel.js` turns that into 21 landmarks, using per-finger curl angles at three joints.

**63. How are the elbows computed?**
Two-bone inverse kinematics. Given shoulder, wrist target and the two arm lengths, the elbow lies on a circle; a pole vector picks the point. The pole points down and out at rest and swings forward as the hand rises toward the face, which is how a real arm moves.

**64. How do signs connect smoothly?**
`sequencer.js` builds a timeline: rest → sign → short transition → next sign → rest. Positions, directions and finger curls are interpolated with smoothstep. Letters in fingerspelling use shorter transitions.

**65. How does the avatar show questions or pain?**
Eyebrows raise for questions and furrow for pain, the mouth changes, the head nods for YES/HELLO and shakes for NO/NOT, and it tilts for SLEEP.

**66. Can the avatar play signs recorded from a person?**
Yes. Recorded landmark frames from the Teach screen override the built-in animation for that word. That's the route to replace my approximations with real Deaf signers' signs.

**67. How did you verify the avatar poses?**
I wrote a script that renders every sign as a 2D stick figure (front and side views) into one contact sheet. That's how I found that hands near the face made the elbows swing out sideways, which led to the forward-swinging pole vector. Automated tests also check every sign produces finite landmarks and that the IK keeps the forearm length constant.

**68. How do you keep 3D fast on phones?**
About 120 simple meshes, low-power WebGL, pixel ratio capped at 2, and three.js is loaded only on screens that show the avatar. If WebGL isn't available, the words are shown instead.

---

## H. Backend

**69. List your API endpoints.**
Auth (`/api/auth/register`, `/login`, `/me`), consultations (create, list, lookup by code, history, close, and the WebSocket), language (`/api/isl/gloss`, `/isl/sentence`, `/isl/lexicon`, `/translate`, `/phrases`, `/symptoms`), signs (`/recognize`, templates CRUD, `/recorded/{label}`), speech (`/stt`, `/tts`), prescriptions (create, list, get by token), and `/api/health`.

**70. How does authentication work?**
Doctors register and log in; passwords are hashed with PBKDF2-HMAC-SHA256 (200,000 iterations, random salt). Login returns a JWT (HS256, 12-hour expiry). A FastAPI dependency (`current_doctor`) validates it on protected routes.

**71. Why PBKDF2 and not bcrypt?**
Both are acceptable password hashes. PBKDF2 is in Python's standard library, so there's no native dependency to compile, and with 200k iterations it meets current guidance for SHA-256.

**72. How do patients authenticate?**
They don't create accounts; a disabled patient shouldn't have to. They join with the 6-character code on the doctor's screen. The alphabet excludes look-alike characters (0/O, 1/I/L), giving about 887 million combinations, and the room closes when the doctor ends it.

**73. How is the doctor's WebSocket secured?**
The token is passed as a query parameter (browsers can't set headers on WebSockets), validated, and must belong to the doctor who created that consultation; otherwise the socket closes with code 4401.

**74. How do you validate input?**
Pydantic models for every request with length limits, enums (`Literal`) for languages and modes, frame shape checks (6 arm points, 21 hand points), and caps like 240 frames per request. WebSocket messages go through `build_message`, which rejects unknown kinds, empty text and pain values outside 0–10.

**75. How is concurrency handled with SQLite?**
One connection with `check_same_thread=False`, guarded by a lock in `Database`, transactions committed or rolled back in a context manager. For heavier load I'd move to PostgreSQL with a pool.

**76. What happens if a model crashes during a consultation?**
Translation catches exceptions and falls back to the dictionary; speech endpoints return 503 with a clear message and the browser voice is used; a global exception handler returns a plain error without leaking details.

**77. How are prescriptions shared?**
Each gets a random 14-character token (~83 bits). The link `/rx/<token>` opens without login so the patient can view it on their own phone.

**78. Why is consultation logic in a separate service?**
`services/consult.py` has no FastAPI imports, so I can unit-test message building directly. The router just handles sockets.

**79. How do you seed data?**
On startup (FastAPI lifespan), a demo doctor is created if missing, and the 85 starter sign templates are loaded once.

**80. How is the React app served?**
In Docker, the built files are copied into the backend's `static` folder; FastAPI serves `/assets` and returns `index.html` for any non-API path (single-page app routing), with a path check to stop directory traversal.

---

## I. Frontend

**81. How is the frontend organised?**
`pages/` for screens, `components/` for shared UI (sign input, symptom board, pain input, message, prescription form), `avatar/` for 3D, and `lib/` for API, speech, settings, MediaPipe tracking and the WebSocket hook. Pages are lazy-loaded so the first screen stays small.

**82. How do you manage state?**
Local `useState` for page state, a React context for settings (language, text size, contrast, speeds), and custom hooks: `useRoom` for the WebSocket, `useSpeechInput` for the microphone. No Redux; the app doesn't have shared state that needs it.

**83. How did you do Hindi/English?**
A `t(en, hi)` helper from `useT()`. Both strings sit side by side in the component, so they never drift apart. The patient screen uses the patient's language even if the device is set to English.

**84. What accessibility features did you build?**
Text size up to extra-large (all sizes in rem), high-contrast and dark themes, reduced motion, 48–56 px touch targets, visible focus outlines, skip link, semantic headings, `aria-live` for new messages, `aria-pressed` on toggles, keyboard-operable body map, screen-reader labels on icon buttons, and automatic speech for blind users.

**85. Why plain CSS instead of Tailwind or a component library?**
The design is specific (an indigo and turmeric palette, one Devanagari-capable font), and I wanted control over contrast and sizes for accessibility. Design tokens are CSS variables, which also makes themes trivial.

**86. What is a PWA and why use it?**
A Progressive Web App can be installed on the home screen and run full-screen. My service worker caches the app shell so screens like the symptom board open on a weak hospital network.

**87. How does the camera component avoid restarting?**
The tracker keeps a ref to the latest frame handler, so state changes in React don't tear down the camera. Cleanup stops the media tracks when the component unmounts.

**88. How did you handle WebSocket reconnects?**
Exponential backoff up to 10 seconds, de-duplication of messages by id, and a visible “reconnecting” message. Codes 4401/4404 stop retrying because they're permanent.

**89. How do you handle microphone or camera permission being denied?**
I detect `NotAllowedError` and show what to do (“allow the camera in the address bar”), rather than a generic failure.

**90. Why does the UI show bilingual labels on symptom tiles?**
A patient may read only one script, and the doctor glancing at the patient's screen may read the other. Icons help patients with low literacy.

---

## J. Testing, CI/CD and deployment

**91. How did you test it?**
Three levels. Backend pytest: gloss rules, translation, password hashing, JWT, features, DTW, recognition, message building, prescription text, and API tests including a two-socket WebSocket conversation. Frontend Vitest: landmark maths checked against a Python fixture, the segmenter, the hand model, every sign in the library, the timeline. Playwright: a doctor and a patient in two real browser contexts run a full consultation and a prescription, on desktop and mobile, with screenshots.

**92. What is the Python–JavaScript parity test?**
The normalisation exists in both languages. A fixture produced by the Python code is loaded by a JavaScript test, which checks it gets the same numbers. If someone edits one side only, CI fails.

**93. What does your CI pipeline do?**
GitHub Actions: backend tests, frontend tests and build, then an end-to-end job that starts the real server with the built app and runs Playwright, uploading screenshots.

**94. Explain your Dockerfile.**
Multi-stage: a Node stage builds the React app; a Python slim stage installs the API requirements (and optionally the ML extras), copies the backend and the built app, and runs as a non-root user. The deployed image is the lite variant (`Dockerfile.lite`), without the optional ML extras, so it fits a 512 MB free instance.

**95. Why Render?**
The free tier runs a Docker container with WebSockets and HTTPS (needed for camera and microphone), and `render.yaml` describes the service as code, including a generated secret key. The full image with Whisper and MarianMT needs more RAM, so it is meant for a paid instance or a GPU box.

**96. What's a limitation of your hosting?**
The free instance sleeps after 15 idle minutes (first request then takes about a minute) and its disk resets on redeploy, so SQLite data is lost. For real use I'd attach persistent storage or move to managed Postgres.

**97. How do you configure environments?**
Environment variables read in `config.py`: secret key, DB path, CORS origins, which AI features to enable. The app degrades gracefully when features are off and `/api/health` reports which are active.

**98. Why must it run on HTTPS?**
Browsers only allow camera and microphone access on secure origins (HTTPS or localhost).

---

## K. Privacy, ethics and healthcare safety

**99. What data do you store?**
Doctor accounts, consultation messages (text), prescriptions and recorded sign landmarks. No video, no audio (Whisper audio is processed in a temp file and discarded).

**100. How does this relate to India's DPDP Act 2023?**
Health conversations are personal data. In a real deployment I'd need clear consent at join, a stated purpose, retention limits and deletion, access controls and logging, and data stored in India. The landmarks-only design already minimises data.

**101. What if the translation or recognition is wrong?**
The app is designed to show uncertainty: approximate translations are tagged, unsure recognitions ask the patient to choose, and both languages are shown so a bilingual person can catch errors. Critical content (prescriptions) uses templates, not machine translation. And the app tells users when to ask for a human interpreter.

**102. Did you consult the Deaf community?**
(Answer honestly.) The right process is to review signs and gloss rules with Deaf ISL users and interpreters; that's why the avatar's built-in signs can be replaced with recordings, and why the docs call them approximations.

**103. Is a signing avatar acceptable to Deaf users?**
Many Deaf people find avatars less clear than human signers, mainly because of missing facial grammar and stiff motion. The avatar here is a support next to large text, not a replacement for interpreters. Recorded signs from real signers improve naturalness.

**104. Could this be biased?**
Yes: if training data comes from a few signers or one region, recognition is worse for others. ISL has regional variants. Mitigations: per-user Teach recordings, a signer-independent evaluation, and collecting data across regions.

**105. What are the safety-critical paths?**
Red-flag symptoms (chest pain, bleeding, breathlessness) and pain ≥ 8 are marked urgent in red on the doctor's screen. Prescriptions are structured and read back.

---

## L. Scaling and future work

**106. How would you scale to many hospitals?**
Stateless API containers behind a load balancer, Redis pub/sub for rooms, PostgreSQL, object storage for models, and multi-tenant hospital accounts.

**107. What breaks first under load?**
The in-memory rooms (they assume one process), then SQLite writes, then DTW if users record thousands of templates (fix: index templates per label, prune with the LSTM's top-k first).

**108. What features would you add next?**
Facial-expression landmarks in recognition, continuous sentence recognition, more Indian languages (IndicTrans2 already supports 22), video-call mode for remote interpreters, and integration with hospital records (ABDM/FHIR).

**109. How would you add another language, say Tamil?**
Add Tamil to the phrasebook and symptom catalogue, a Tamil synonym/drop list for gloss, the `ta` option in schemas and UI, and Tamil voices for TTS. IndicTrans2 already supports it.

**110. How would you make the avatar more natural?**
Record signs with MediaPipe from Deaf signers (the Teach pipeline already does this), smooth them with a filter, add facial landmarks, and use a rigged character with blend shapes driven by the same landmarks.

---

## M. Behavioural questions about the project

**111. Describe a bug you found and fixed.**
The avatar's elbows swung out to shoulder height whenever a hand touched the face. I found it from a contact sheet of all signs. The pole vector for the elbow was constant; I changed it to depend on wrist height so the elbow comes forward as the hand rises.

**112. Describe a design trade-off you made.**
Rule-based gloss vs a neural model. Neural might be more fluent, but there's no training corpus and I couldn't explain its errors. I chose rules for transparency, with tests, and left the interface open for a model later.

**113. How did you make sure the project works and isn't just a demo?**
Automated tests at three levels, a CI pipeline that runs a real two-browser consultation, and graceful fallbacks when each optional service is missing.

**114. What did you learn?**
That accessibility is a feature you design from the start (text size, contrast, speech, simple flows), and that a single shared data format saves enormous complexity across ML, backend and graphics.

**115. If you had a team of three for three months, what would each person do?**
One on data and models (signer-independent dataset, Transformer, facial features), one on the clinical workflow and hospital integration, one on UX research with Deaf and blind users and the avatar.

**116. How would you explain this project to a non-technical person?**
It's like having a sign-language interpreter and a translator inside a tablet: the doctor talks, a cartoon character signs it and the words appear in big letters; the patient signs or taps pictures, and the tablet speaks for them.

**117. Why should we believe a student built this?**
Each part uses standard, well-documented tools (FastAPI, React, MediaPipe, Keras, Three.js), and I can walk through any file: the gloss rules, the DTW loop, the IK maths, the WebSocket handler. Ask me to change something and I'll show you where.

---

## Quick facts to remember

| Item | Value |
|---|---|
| Built-in ISL signs | 85 (+ A–Z, 0–9 fingerspelling) |
| Symptoms on the board | 30, each in Hindi and English with a spoken sentence |
| Doctor quick phrases | 30 |
| Frame features | 144 for the LSTM, 38 for DTW |
| LSTM input | 30 frames × 144 |
| DTW length / band | 24 frames / 30% Sakoe-Chiba |
| Confidence threshold | 0.45 |
| Password hashing | PBKDF2-SHA256, 200,000 iterations |
| JWT expiry | 12 hours |
| Room code space | 31⁶ ≈ 887 million |
| Prescription token | 14 chars ≈ 83 bits |
| Tracking rate | ~20 fps, in the browser |
