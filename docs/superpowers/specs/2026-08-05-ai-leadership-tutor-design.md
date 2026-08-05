# AI Leadership Tutor — Design Spec

**Date:** 2026-08-05
**Status:** Approved for planning
**Deliverable:** Working local prototype

---

## 1. What we're building

A web application that teaches leadership to individual adult learners through spoken
conversation. The learner talks; an AI tutor listens, teaches, and talks back. Learning
happens through dialogue rather than reading.

The tutor leads. It works through a fixed curriculum of five modules in order, and within
each module through structured lessons. It is not a chatbot that answers leadership
questions — it is a tutor that runs a lesson.

The application supports English, Hindi, and code-mixed Hinglish, detected automatically
from the learner's speech. There is no language setting in the interface.

### Success criteria

The prototype succeeds if a learner can work through the curriculum by voice, in either
English or Hindi, and come away having said things out loud they hadn't articulated before.
Specifically:

1. Every lesson in all five modules runs to completion without the tutor drifting off the
   lesson structure.
2. Speaking Hindi produces a Hindi reply, without the learner configuring anything.
3. A learner who closes the tab returns to the same position, mid-lesson.
4. A failure in any single component (mic, STT, LLM, TTS) leaves the session recoverable.
5. Modules unlock in order, and Module 5 produces a spoken commitment specific enough to
   be checked against later.

### Non-goals

Accounts and authentication. Server-side persistence. Deployment. Payments. Analytics.
Instructor dashboards, cohorts, or any multi-user feature. Content authoring tools.
Mobile applications. Curriculum beyond the five modules specified here.

---

## 2. Architecture

```
┌─ BROWSER (React + Vite + Chakra UI v3) ───────────────┐
│                                                        │
│  ModuleMap        SessionView         useProgress      │
│  five modules,    mic control,        localStorage:    │
│  linear unlock    live transcript,    completed        │
│                   idle/listening/     modules,         │
│                   thinking/speaking   current step     │
│                        │                               │
│                  MediaRecorder ──► audio blob          │
│                        │              ▲ playback       │
└────────────────────────┼──────────────┼────────────────┘
                         │              │
              ┌──────────▼──────────────┴───────────┐
              │  EXPRESS SERVER                     │
              │  holds API keys, owns pedagogy      │
              ├─────────────────────────────────────┤
              │  POST /api/stt    ──► Sarvam saaras:v3
              │  POST /api/tutor  ──► OpenRouter → Gemini
              │  POST /api/tts    ──► Sarvam bulbul:v3
              │                                     │
              │  ┌───────────────────────────────┐  │
              │  │ LESSON ENGINE                 │  │
              │  │ step state machine            │  │
              │  │ owns advancement decisions    │  │
              │  │ pure logic, no network calls  │  │
              │  └───────────────────────────────┘  │
              │  ┌───────────────────────────────┐  │
              │  │ CONTENT — 5 modules as data   │  │
              │  └───────────────────────────────┘  │
              └─────────────────────────────────────┘
```

The server exists for three reasons: API keys cannot live in the browser, the tutor logic
belongs somewhere testable, and the curriculum content should not ship to the client.

### 2.1 The load-bearing decision

**Lesson structure lives in code. The model supplies conversation, not pedagogy.**

The obvious approach — put the lesson plan in the system prompt and let the model run it —
produces a chatbot that wanders. It skips steps, over-explains, accepts weak answers, and
declares things taught that were not taught. That failure is quiet: the conversation still
reads fine, but the learner is no longer being taught anything in particular.

So: each lesson is an explicit sequence of steps. Each step has an objective, a completion
condition, and a turn cap. The server prompts the model for **one step at a time**, and
requires structured output stating whether the step's condition is now met. The engine —
not the model — decides when to advance.

The model is responsible for being a good conversationalist within a step. The engine is
responsible for the learner actually progressing through a lesson.

---

## 3. Data model

```ts
type Module = {
  id: string                  // "01-what-is-leadership"
  order: number               // 1..5
  title: string
  premise: string             // the shift this module produces, one sentence
  lessons: Lesson[]
}

type Lesson = {
  id: string
  title: string
  principle: string           // the memorable close, stated once at lesson end
  steps: Step[]
}

type Step = {
  id: string
  objective: string           // what the LEARNER must demonstrate
  tutorGoal: string           // instruction to the model for this step only
  doneWhen: string            // completion condition, evaluated by the model
  maxTurns: number            // engine force-advances past this; prevents dead ends
}
```

`maxTurns` is a safeguard, not a nicety. Without it, a learner who cannot or will not
satisfy `doneWhen` is trapped in a step forever. On hitting the cap the engine advances and
flags the step as unmet, and the tutor moves on gracefully rather than interrogating.

### What the model returns

```ts
type TutorVerdict = {
  reply: string               // spoken to the learner, 2-3 sentences
  stepComplete: boolean       // did the learner satisfy this step's doneWhen?
  note?: string               // why, for the transcript log and debugging
}
```

This is the entire contract between model and engine. The model never sees the next step,
never decides what comes next, and cannot skip ahead — it answers one question about the
step it is currently running.

### Session state

```ts
type SessionState = {
  moduleId: string
  lessonId: string
  stepId: string
  turnsInStep: number
  transcript: Turn[]          // { speaker, text, language }
  language: "en-IN" | "hi-IN" // last detected; drives TTS
}
```

Held in React state during a session, mirrored to `localStorage` after each turn.

### Progress

```ts
type Progress = {
  completedModules: string[]
  current: { moduleId, lessonId, stepId } | null
}
```

`localStorage` only. Modules unlock linearly — Module N+1 opens when Module N completes.
This matches the tutor-led, guided design and makes the arc legible; the alternative
(all open) undercuts the premise that the curriculum builds on itself.

---

## 4. Curriculum

Five modules, eighteen lessons. Content is authored originally, structured after the
Admired Leadership Field Notes pattern — one named behavior or distinction per lesson,
concrete practices, a memorable close. Field Notes are a **structural and topical
reference, not a source of text**; nothing is reproduced from them. Where the framing
derives from Randall Stutman's work (notably the three leader types in Module 1), the
attribution is stated in the app's About text.

Every lesson requires the learner to say something out loud. A lesson the learner could
complete by listening is a lesson in the wrong app.

### Module 1 — What is leadership

*Premise: leadership is a set of behaviors, not a title or a personality.*

| Lesson | Teaches | Learner says out loud |
|---|---|---|
| 1.1 Behavior, not position | Authority is granted; leadership is demonstrated | Names someone they'd follow, and what that person *did* — tutor pushes from traits ("inspiring") to behaviors ("rewrote my deck with me at 9pm") |
| 1.2 Results, followership, or both | Three types: leaders who deliver but aren't trusted, leaders who are loved but don't deliver, and admired leaders who do both | Classifies leaders they've actually worked under, and defends the classification |
| 1.3 Behaviors are learnable | The gap between admired leaders and everyone else is repeated behavior, not talent | Picks one behavior from their own example they could perform this week |

### Module 2 — Leadership styles

*Premise: there is no best style; the skill is choosing one deliberately.*

| Lesson | Teaches | Learner says out loud |
|---|---|---|
| 2.1 Your default | Everyone has a style they fall back on under pressure | Responds to a situation cold; tutor names the default they revealed |
| 2.2 Directing and developing | When to give the answer, when to ask the question | Handles the same request both ways |
| 2.3 Reading the person | Style follows the person's competence and commitment, not your comfort | Same situation, two different people; adjusts the response |
| 2.4 Switching on purpose | Style is a choice made per situation | Replays 2.1 in a style that isn't their default |

### Module 3 — Self-awareness

*Premise: the gap between your intent and your impact is invisible to you by definition.*

| Lesson | Teaches | Learner says out loud |
|---|---|---|
| 3.1 Intent and impact | The two come apart constantly, and only impact is real to others | Describes something they did and what they meant; tutor probes how it likely landed |
| 3.2 How you're experienced | Your self-image is built from intentions; others' image of you is built from behavior | Predicts what their team would say about them; tutor separates evidence from assumption |
| 3.3 Asking for the truth | People withhold honest feedback unless the question makes it safe and specific | Drafts and delivers the actual question they'd ask |
| 3.4 Your blind spot hypothesis | A blind spot you can name is a blind spot you can test | Names one likely blind spot and how they'd check it this month |

### Module 4 — Giving effective feedback

*Premise: coaching beats judging; behavior beats character; one thing beats everything.*

| Lesson | Teaches | Learner says out loud |
|---|---|---|
| 4.1 Coaching, not judging | "What did you think?" buys a verdict; ask for one thing to change instead | Converts judging questions into coaching ones |
| 4.2 Behavior, not the person | Specific observed behavior doesn't trigger defensiveness; character assessment does | Delivers feedback; tutor catches character language and has them redo it |
| 4.3 One thing, now | Late, bulk feedback fails. Timely and singular works | Cuts a four-point critique down to the one that matters |
| 4.4 The full rep | All three at once, unassisted | Delivers complete feedback on a real situation; tutor evaluates against all three principles |

### Module 5 — Your leadership commitment

*Premise: learning becomes one specific, observable behavior or it becomes nothing.*

| Lesson | Teaches | Learner says out loud |
|---|---|---|
| 5.1 What landed | Retrieval beats review; what you can recall unprompted is what you have | Recalls what stuck from Modules 1–4, unprompted |
| 5.2 Make it observable | "Be a better listener" cannot be checked. "Ask one question before offering a solution" can | Converts a vague intention into a checkable behavior |
| 5.3 Say it out loud | Spoken commitments with a named person and a date get kept | States the commitment; tutor pressure-tests it — when, with whom, how you'll know it happened |

---

## 5. The voice loop

One turn, end to end:

1. Learner holds the mic button; `MediaRecorder` captures audio (webm/opus).
2. `POST /api/stt` — multipart to Sarvam `saaras:v3`, `mode: codemix`.
   Returns `{ transcript, language_code }`.
3. `POST /api/tutor` — transcript plus current `SessionState`.
   Engine builds a prompt for the current step only, calls Gemini via OpenRouter with a
   JSON schema response format, receives `{ reply, stepComplete, note }`, decides
   advancement, returns updated state.
4. `POST /api/tts` — reply text to Sarvam `bulbul:v3`, `language_code` mirroring the
   learner's detected language. Returns base64 WAV.
5. Audio plays. Transcript pane updates. Progress written to `localStorage`.

### Language handling

STT auto-detects and returns the language code; `codemix` mode handles Hinglish, which is
how bilingual Indian speakers actually talk. The tutor is instructed to reply in the
learner's detected language, and TTS is called with a matching `language_code` and a voice
selected per language. If detection is ambiguous, the previous turn's language persists.

Curriculum content is authored in English. Hindi delivery is generated — the model teaches
the same lesson in Hindi. This is acceptable for a prototype; professionally translated
content is a later concern and is noted as such.

### Reply length

The tutor prompt caps replies at two to three sentences. This is a pedagogical constraint
as much as a technical one: a voice tutor that monologues is a podcast. It also keeps
every reply well inside Sarvam's 2500-character TTS limit and holds latency down.

### Latency

STT, LLM, and TTS run in series — realistically two to four seconds per turn. Mitigations
for the prototype: short replies, and never-ambiguous UI state (`listening`, `thinking`,
`speaking`) so silence always has a visible cause. Sarvam's streaming TTS and token
streaming from OpenRouter are the optimization path if turns feel sluggish, but they are
not in scope for the first working version.

---

## 6. Components

| Path | Responsibility | Depends on |
|---|---|---|
| `content/modules/*.ts` | The five modules as typed data | Types only |
| `server/tutor/engine.ts` | Step state machine — advancement, turn caps, module/lesson transitions | Content types. **No network.** |
| `server/tutor/prompt.ts` | Builds the per-step prompt from step + transcript + language | Content types |
| `server/tutor/openrouter.ts` | Gemini client, structured output, retries | HTTP |
| `server/speech/stt.ts` | Sarvam speech-to-text client | HTTP |
| `server/speech/tts.ts` | Sarvam text-to-speech client, voice selection per language | HTTP |
| `server/routes/*.ts` | Three thin HTTP handlers | The above |
| `src/components/ModuleMap.tsx` | The five-module arc, locked/current/complete | `useProgress` |
| `src/components/SessionView.tsx` | Mic control, session states, live transcript | `useVoiceSession` |
| `src/hooks/useVoiceSession.ts` | Recording, the three API calls, playback, state machine | Browser APIs |
| `src/hooks/useProgress.ts` | `localStorage` read/write | — |

`engine.ts` is deliberately pure — it takes state and a model verdict and returns new
state. That is what makes the pedagogy testable without spending API credits, and it is
the single most important file in the project.

---

## 7. Failure handling

| Failure | Behavior |
|---|---|
| Mic permission denied | Explicit UI state with a path to text input. Never a dead button. |
| Empty or unintelligible transcript | Tutor asks the learner to repeat. The model is never handed an empty string to respond to — the engine short-circuits. |
| STT / TTS / OpenRouter error | Surfaced in the UI, session state preserved, retry available. The lesson is never lost. |
| TTS fails but tutor replied | Reply still shown as text. The lesson continues silently rather than stopping. |
| Model returns malformed JSON | One retry with a repair instruction, then treat the step as incomplete and continue. Never crash a session on a parse error. |
| Learner stuck in a step | `maxTurns` forces advancement; step marked unmet; tutor moves on without comment. |

**Text input is a permanent fallback, not an error state.** It sits in the interface at all
times. A learner in a noisy office or with a broken mic can complete the whole curriculum
by typing. Voice is the intended experience, not a requirement.

---

## 8. Testing

- **Lesson engine — real unit tests.** Step advancement on met and unmet conditions, turn
  caps, lesson boundaries, module completion, unlock logic. Pure functions, no mocks
  beyond the model verdict. This is where the pedagogy lives and it is fully testable.
- **Speech and LLM clients — fixture tests.** Recorded Sarvam and OpenRouter responses,
  including malformed ones. Tests never hit live APIs and never cost money.
- **Prompt builder — snapshot tests.** Confirms the prompt contains the current step only,
  and that lesson content from later steps does not leak in.
- **Manual voice pass.** One full spoken session per module, in English and in Hindi.
  Whether it *feels* like a tutor is not something a test can tell us.

Development follows TDD per the Superpowers workflow: tests before implementation,
starting with the engine.

---

## 9. Configuration

```
SARVAM_API_KEY=       # header: api-subscription-key
OPENROUTER_API_KEY=
OPENROUTER_MODEL=     # a Gemini model id, pinned at scaffold time
PORT=3001
```

`.env.example` is committed with keys documented and empty. `.env` is gitignored and never
committed. Keys are supplied by the user directly into `.env` at scaffold time — not pasted
into a chat transcript.

Sarvam voice selection for `en-IN` and `hi-IN` is resolved against Sarvam's voices endpoint
during implementation rather than hard-coded from documentation summaries, and pinned in
`server/speech/tts.ts` once verified.

---

## 10. Verified API reference

Confirmed against Sarvam documentation on 2026-08-05:

**Speech to text** — `POST https://api.sarvam.ai/speech-to-text`
Header `api-subscription-key`. Multipart: `file`, `model: saaras:v3`, `mode: codemix`.
Returns `{ request_id, transcript, language_code }`.

**Text to speech** — `POST https://api.sarvam.ai/text-to-speech`
Header `api-subscription-key`. Body: `text` (≤2500 chars), `language_code` (`en-IN`,
`hi-IN`), `speaker`, `model: bulbul:v3`, optional `pace` (0.5–2.0),
`speech_sample_rate`, `audio_format`.
Returns `{ request_id, audios: [base64] }`.

**Chakra UI v3** — `npm i @chakra-ui/react @emotion/react`. Uses `Provider`, not
`ChakraProvider`. No `@chakra-ui/icons`; icons come from `lucide-react`. Much online
material still documents v2 and does not apply.

---

## 11. Phasing

This spec covers more work than one sitting — five modules and eighteen lessons of authored
content on top of the application itself. The implementation plan should phase it, but the
phases share one codebase and one spec; this is sequencing, not separate projects.

**Phase 1 — the loop works.** Engine, three routes, both Sarvam clients, the React shell,
and Module 1's content only. Ends with a real spoken lesson, in both languages. This phase
answers the only question that can invalidate the design: does an engine-driven voice
tutor actually feel like a tutor? If it doesn't, better to learn it against three lessons
than eighteen.

**Phase 2 — the curriculum.** Modules 2 through 5 authored to the same depth, plus the
unlock arc and Module 5's commitment capture. Almost entirely content work; the engine
should not need to change. If it does, that is a signal the Phase 1 abstraction was wrong,
and worth stopping to fix rather than working around.

## 12. Open items for the implementation plan

These are decisions for the plan, not blockers:

1. Exact step breakdown within each of the eighteen lessons (3–5 steps each).
2. Sarvam voice ids for English and Hindi, once verified against the live voices endpoint.
3. Gemini model id on OpenRouter, pinned at scaffold time.
4. Whether the engine's completion judgments need few-shot examples per step, or whether
   `doneWhen` prose is sufficient. Resolve empirically during Module 1.
