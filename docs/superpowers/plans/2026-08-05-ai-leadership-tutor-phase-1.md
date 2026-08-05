# AI Leadership Tutor — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working voice-first leadership tutor that runs Module 1 ("What is leadership") end to end — learner speaks, tutor teaches, lesson advances — in English or Hindi.

**Architecture:** A React front end records audio and renders a live transcript. A thin Express server holds API keys and owns the pedagogy: a pure lesson engine drives a step state machine, asking Gemini for one step at a time and deciding advancement itself. Sarvam handles speech in and out. The model supplies conversation; the engine supplies teaching.

**Tech Stack:** React 18, Vite, TypeScript, Chakra UI v3, Express 4, Vitest, Testing Library, Supertest, Sarvam AI (`saaras:v3`, `bulbul:v3`), Gemini via OpenRouter.

**Spec:** `docs/superpowers/specs/2026-08-05-ai-leadership-tutor-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Chakra UI v3 only.** Use `Provider` from `@/components/ui/provider` — `ChakraProvider` does not exist in v3. There is no `@chakra-ui/icons` package; all icons come from `lucide-react`. Most Chakra material online documents v2 and will not work.
- **Sarvam auth header is `api-subscription-key`** — not `Authorization`, not a bearer token.
- **Sarvam STT:** `POST https://api.sarvam.ai/speech-to-text`, multipart, `model: "saaras:v3"`, `mode: "codemix"`. Returns `{ request_id, transcript, language_code }`.
- **Sarvam TTS:** `POST https://api.sarvam.ai/text-to-speech`, JSON, `model: "bulbul:v3"`, `text` ≤ 2500 chars, `language_code` one of `en-IN` / `hi-IN`. Returns `{ request_id, audios: [base64] }`.
- **The lesson engine performs no I/O.** `server/tutor/engine.ts` imports nothing that touches the network, filesystem, or clock. This is what makes the pedagogy testable.
- **Tutor replies are 2–3 sentences.** Enforced in the prompt. A voice tutor that monologues is a podcast.
- **The learner chooses the teaching language explicitly** — English or हिंदी — on the module map and again inside a session. The choice persists in `localStorage` and governs both the tutor's replies and the TTS voice. STT still runs in `codemix` mode so mixed speech transcribes correctly, but a detected language **never** silently overrides the learner's choice.
- **The model never sees future steps.** It receives only the step currently running. Leaking the lesson plan into the prompt is the failure this whole design exists to prevent.
- **No text is reproduced from Admired Leadership Field Notes.** All lesson content is original, written in that structural style. Attribution for the three-leader-types framing (Randall Stutman) appears in the About text.
- **Text input is always available**, not an error fallback. Every task touching the UI preserves it.
- **`.env` is never committed.** `.env.example` is committed with empty values.
- **Tests never hit live APIs.** All external calls are tested against recorded fixtures.

---

## File Structure

| Path | Responsibility |
|---|---|
| `shared/types.ts` | Types used by both server and client |
| `shared/validateModule.ts` | Structural validation of content modules |
| `content/modules/01-what-is-leadership.ts` | Module 1 content |
| `content/modules/index.ts` | Module registry and lookup |
| `server/tutor/engine.ts` | Step state machine. Pure. No I/O. |
| `server/tutor/prompt.ts` | Builds the per-step prompt |
| `server/tutor/openrouter.ts` | Gemini client, structured output, repair retry |
| `server/speech/stt.ts` | Sarvam speech-to-text |
| `server/speech/tts.ts` | Sarvam text-to-speech, voice selection |
| `server/routes/stt.ts` / `tutor.ts` / `tts.ts` | Three thin HTTP handlers |
| `server/index.ts` | Express app assembly |
| `src/hooks/useProgress.ts` | `localStorage` progress |
| `src/hooks/useLanguage.ts` | Chosen teaching language, persisted |
| `src/components/LanguagePicker.tsx` | English / हिंदी toggle, used in both views |
| `src/hooks/useVoiceSession.ts` | Recording, API calls, playback, session state |
| `src/components/ModuleMap.tsx` | The five-module arc |
| `src/components/SessionView.tsx` | Mic, transcript, session states |
| `src/App.tsx` | Shell and routing between the two views |

---

## Task 1: Scaffold, shared types, and module validation

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `.env.example`
- Create: `shared/types.ts`, `shared/validateModule.ts`
- Test: `shared/validateModule.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: all types below; `validateModule(module: Module): string[]` returning an array of human-readable problems, empty when valid

- [ ] **Step 1: Initialize the project**

```bash
npm init -y
npm i react react-dom @chakra-ui/react @emotion/react lucide-react express multer
npm i -D typescript vite @vitejs/plugin-react vitest @types/react @types/react-dom \
  @types/express @types/multer @types/node tsx jsdom @testing-library/react \
  @testing-library/user-event supertest @types/supertest
```

- [ ] **Step 2: Write the config files**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "server", "shared", "content"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://localhost:3001" },
  },
});
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    environmentMatchGlobs: [["src/**", "jsdom"]],
  },
});
```

Add to `package.json` scripts:

```json
{
  "type": "module",
  "scripts": {
    "dev": "npm run dev:server & npm run dev:client",
    "dev:client": "vite",
    "dev:server": "tsx watch server/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`.env.example`:

```
# Sarvam AI — https://dashboard.sarvam.ai
# Sent as the `api-subscription-key` header
SARVAM_API_KEY=

# OpenRouter — https://openrouter.ai/keys
OPENROUTER_API_KEY=
OPENROUTER_MODEL=google/gemini-2.5-flash

PORT=3001
```

- [ ] **Step 3: Write the shared types**

`shared/types.ts`:

```ts
export type LanguageCode = "en-IN" | "hi-IN";

export type Step = {
  id: string;
  objective: string;
  tutorGoal: string;
  doneWhen: string;
  maxTurns: number;
};

export type Lesson = {
  id: string;
  title: string;
  principle: string;
  steps: Step[];
};

export type Module = {
  id: string;
  order: number;
  title: string;
  premise: string;
  lessons: Lesson[];
};

export type Turn = {
  speaker: "learner" | "tutor";
  text: string;
  language: LanguageCode;
};

export type SessionState = {
  moduleId: string;
  lessonId: string;
  stepId: string;
  turnsInStep: number;
  transcript: Turn[];
  language: LanguageCode;
};

export type TutorVerdict = {
  reply: string;
  stepComplete: boolean;
  note?: string;
};

export type Progress = {
  completedModules: string[];
  current: { moduleId: string; lessonId: string; stepId: string } | null;
};
```

- [ ] **Step 4: Write the failing test**

`shared/validateModule.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateModule } from "./validateModule";
import type { Module } from "./types";

const valid: Module = {
  id: "01-test",
  order: 1,
  title: "Test",
  premise: "A premise.",
  lessons: [
    {
      id: "1.1",
      title: "Lesson one",
      principle: "A principle.",
      steps: [
        {
          id: "1.1.a",
          objective: "Learner names something.",
          tutorGoal: "Ask them to name it.",
          doneWhen: "They named it.",
          maxTurns: 4,
        },
      ],
    },
  ],
};

describe("validateModule", () => {
  it("accepts a well-formed module", () => {
    expect(validateModule(valid)).toEqual([]);
  });

  it("rejects a module with no lessons", () => {
    const m = { ...valid, lessons: [] };
    expect(validateModule(m)).toContain("module 01-test has no lessons");
  });

  it("rejects a lesson with no steps", () => {
    const m = { ...valid, lessons: [{ ...valid.lessons[0], steps: [] }] };
    expect(validateModule(m)).toContain("lesson 1.1 has no steps");
  });

  it("rejects duplicate step ids", () => {
    const step = valid.lessons[0].steps[0];
    const m = {
      ...valid,
      lessons: [{ ...valid.lessons[0], steps: [step, { ...step }] }],
    };
    expect(validateModule(m)).toContain("duplicate step id 1.1.a");
  });

  it("rejects a step with maxTurns below 2", () => {
    const m = {
      ...valid,
      lessons: [
        {
          ...valid.lessons[0],
          steps: [{ ...valid.lessons[0].steps[0], maxTurns: 1 }],
        },
      ],
    };
    expect(validateModule(m)).toContain("step 1.1.a has maxTurns below 2");
  });

  it("rejects an empty doneWhen", () => {
    const m = {
      ...valid,
      lessons: [
        {
          ...valid.lessons[0],
          steps: [{ ...valid.lessons[0].steps[0], doneWhen: "  " }],
        },
      ],
    };
    expect(validateModule(m)).toContain("step 1.1.a has an empty doneWhen");
  });
});
```

`maxTurns` below 2 is rejected because a step that force-advances after a single turn never gives the learner a second attempt, which defeats the point of a teaching step.

- [ ] **Step 5: Run the test and confirm it fails**

Run: `npx vitest run shared/validateModule.test.ts`
Expected: FAIL — `Failed to resolve import "./validateModule"`

- [ ] **Step 6: Implement the validator**

`shared/validateModule.ts`:

```ts
import type { Module } from "./types";

export function validateModule(module: Module): string[] {
  const problems: string[] = [];
  const seenStepIds = new Set<string>();

  if (module.lessons.length === 0) {
    problems.push(`module ${module.id} has no lessons`);
  }

  for (const lesson of module.lessons) {
    if (lesson.steps.length === 0) {
      problems.push(`lesson ${lesson.id} has no steps`);
    }
    for (const step of lesson.steps) {
      if (seenStepIds.has(step.id)) {
        problems.push(`duplicate step id ${step.id}`);
      }
      seenStepIds.add(step.id);

      if (step.maxTurns < 2) {
        problems.push(`step ${step.id} has maxTurns below 2`);
      }
      if (step.doneWhen.trim() === "") {
        problems.push(`step ${step.id} has an empty doneWhen`);
      }
    }
  }

  return problems;
}
```

- [ ] **Step 7: Run the test and confirm it passes**

Run: `npx vitest run shared/validateModule.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts \
  vitest.config.ts .env.example shared/
git commit -m "feat: scaffold project with shared types and module validation"
```

---

## Task 2: Module 1 content

**Files:**
- Create: `content/modules/01-what-is-leadership.ts`, `content/modules/index.ts`
- Test: `content/modules/modules.test.ts`

**Interfaces:**
- Consumes: `Module`, `Lesson`, `Step` from `shared/types`; `validateModule` from `shared/validateModule`
- Produces: `moduleOne: Module`; `modules: Module[]`; `getModule(id: string): Module | undefined`; `getLesson(module, lessonId)`; `getStep(lesson, stepId)`

- [ ] **Step 1: Write the failing test**

`content/modules/modules.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { modules, getModule, getLesson, getStep } from "./index";
import { validateModule } from "../../shared/validateModule";

describe("content modules", () => {
  it("every module is structurally valid", () => {
    for (const m of modules) {
      expect(validateModule(m), `module ${m.id}`).toEqual([]);
    }
  });

  it("module 1 has three lessons", () => {
    const m = getModule("01-what-is-leadership");
    expect(m?.lessons).toHaveLength(3);
  });

  it("every lesson states a principle", () => {
    for (const m of modules) {
      for (const l of m.lessons) {
        expect(l.principle.trim().length, `lesson ${l.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("looks up a lesson and a step by id", () => {
    const m = getModule("01-what-is-leadership")!;
    const lesson = getLesson(m, "1.1")!;
    expect(lesson.title).toBe("Behavior, not position");
    expect(getStep(lesson, lesson.steps[0].id)).toBe(lesson.steps[0]);
  });

  it("returns undefined for unknown ids", () => {
    expect(getModule("nope")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run content/modules/modules.test.ts`
Expected: FAIL — cannot resolve `./index`

- [ ] **Step 3: Write Module 1's content**

`content/modules/01-what-is-leadership.ts`:

```ts
import type { Module } from "../../shared/types";

export const moduleOne: Module = {
  id: "01-what-is-leadership",
  order: 1,
  title: "What is leadership",
  premise: "Leadership is a set of behaviors, not a title or a personality.",
  lessons: [
    {
      id: "1.1",
      title: "Behavior, not position",
      principle:
        "Authority is granted by an organization. Leadership is demonstrated, one behavior at a time, and it can be withdrawn by the people who granted it.",
      steps: [
        {
          id: "1.1.a",
          objective:
            "Learner names a specific real person they would willingly follow.",
          tutorGoal:
            "Welcome them warmly in one sentence, then ask them to think of one real person they have worked with, studied under, or known personally that they would willingly follow. Ask who it is. Do not explain what leadership is. Do not list qualities for them.",
          doneWhen:
            "The learner has named a specific real person, by name or by clear role such as 'my first manager'. A fictional or famous figure they have never met does not count — redirect them to someone they knew personally.",
          maxTurns: 4,
        },
        {
          id: "1.1.b",
          objective:
            "Learner describes at least one concrete observable action that person took, not a personality trait.",
          tutorGoal:
            "Ask what that person actually DID that earned their followership. If they answer with traits — 'inspiring', 'confident', 'a great communicator', 'charismatic' — accept it warmly and then press once for the specific moment: what did that look like on a particular day? Keep pressing until you have an action you could have filmed.",
          doneWhen:
            "The learner has described at least one observable action with enough specificity that a camera could have recorded it. 'She stayed late to rehearse my presentation with me' counts. 'She was supportive' does not.",
          maxTurns: 6,
        },
        {
          id: "1.1.c",
          objective:
            "Learner recognizes that the action they described required no authority.",
          tutorGoal:
            "Point out that the behavior they described was a choice, not a requirement of that person's job title. Ask whether someone with no authority at all could have done the same thing. Then state the principle in your own words and close the lesson.",
          doneWhen:
            "The learner has acknowledged, in any form, that the behavior did not depend on the person's rank or title.",
          maxTurns: 4,
        },
      ],
    },
    {
      id: "1.2",
      title: "Results, followership, or both",
      principle:
        "Some leaders deliver results but are not trusted. Some are loved but do not deliver. Admired leaders do both, and the second is what makes the first repeatable.",
      steps: [
        {
          id: "1.2.a",
          objective:
            "Learner understands the three types before applying them.",
          tutorGoal:
            "Lay out three kinds of leader in no more than three sentences: the one who hits every number but leaves people burned out and wary; the one everyone loves but whose team misses its goals; and the one who does both. Ask which of the three they have most often worked under.",
          doneWhen:
            "The learner has picked one of the three types and connected it to their own experience.",
          maxTurns: 4,
        },
        {
          id: "1.2.b",
          objective:
            "Learner defends a classification with evidence rather than impression.",
          tutorGoal:
            "Ask them to justify their classification. What did that leader's results actually look like, and what did the people around them actually do — did they stay, did they volunteer for hard work, did they tell that leader the truth? Challenge them once if the evidence is thin.",
          doneWhen:
            "The learner has offered at least one piece of concrete evidence about results and one about how people responded.",
          maxTurns: 6,
        },
        {
          id: "1.2.c",
          objective:
            "Learner articulates why followership makes results repeatable.",
          tutorGoal:
            "Ask what happened to that leader's results over time, or what would happen if the pressure doubled. Guide them toward the insight that trust is what makes performance survive difficulty. Close with the principle.",
          doneWhen:
            "The learner has stated a connection between how people felt about the leader and whether the results lasted.",
          maxTurns: 5,
        },
      ],
    },
    {
      id: "1.3",
      title: "Behaviors are learnable",
      principle:
        "The distance between an admired leader and everyone else is a set of repeated behaviors, not a gift you were born with. Which means it is closeable, starting this week.",
      steps: [
        {
          id: "1.3.a",
          objective:
            "Learner returns to the behavior from lesson 1.1 and considers doing it themselves.",
          tutorGoal:
            "Remind them of the specific behavior they described earlier — use their own words. Ask whether that behavior required a talent they lack, or whether it was mostly a decision that person made.",
          doneWhen:
            "The learner has assessed whether the behavior is available to them, in either direction.",
          maxTurns: 4,
        },
        {
          id: "1.3.b",
          objective:
            "Learner commits to performing one specific behavior within a week.",
          tutorGoal:
            "Ask them to name one behavior they could perform this week, with a real person, in a real situation. Push for specificity: who, and roughly when. Do not accept 'be more supportive' — ask what that would look like on Tuesday.",
          doneWhen:
            "The learner has named a specific behavior, a specific person, and a rough timeframe within the coming week.",
          maxTurns: 6,
        },
        {
          id: "1.3.c",
          objective: "Learner hears the module's arc summarized back.",
          tutorGoal:
            "In two or three sentences, tie together what they said across all three lessons: the person they named, the behavior they identified, and the commitment they just made. Close the module. Do not introduce new material.",
          doneWhen:
            "You have delivered the summary. Mark this complete after your first reply.",
          maxTurns: 2,
        },
      ],
    },
  ],
};
```

The framing in lesson 1.2 derives from Randall Stutman's research on admired leaders; the text is original.

- [ ] **Step 4: Write the registry**

`content/modules/index.ts`:

```ts
import type { Lesson, Module, Step } from "../../shared/types";
import { moduleOne } from "./01-what-is-leadership";

// Phase 2 adds modules 2-5 here. Order determines the unlock sequence.
export const modules: Module[] = [moduleOne];

export function getModule(id: string): Module | undefined {
  return modules.find((m) => m.id === id);
}

export function getLesson(module: Module, lessonId: string): Lesson | undefined {
  return module.lessons.find((l) => l.id === lessonId);
}

export function getStep(lesson: Lesson, stepId: string): Step | undefined {
  return lesson.steps.find((s) => s.id === stepId);
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run content/modules/modules.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 6: Commit**

```bash
git add content/
git commit -m "feat: add Module 1 content and module registry"
```

---

## Task 3: The lesson engine

**Files:**
- Create: `server/tutor/engine.ts`
- Test: `server/tutor/engine.test.ts`

**Interfaces:**
- Consumes: `SessionState`, `TutorVerdict`, `Module` from `shared/types`; `getLesson`, `getStep` from `content/modules`
- Produces:
  - `startSession(module: Module, language: LanguageCode): SessionState`
  - `advance(state: SessionState, verdict: TutorVerdict, module: Module): AdvanceResult`
  - `type AdvanceResult = { state: SessionState; advanced: boolean; stepUnmet: boolean; lessonComplete: boolean; moduleComplete: boolean }`

This is the most important file in the project. It is pure: same inputs, same outputs, no network, no clock, no filesystem.

- [ ] **Step 1: Write the failing test**

`server/tutor/engine.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { startSession, advance } from "./engine";
import { moduleOne } from "../../content/modules/01-what-is-leadership";
import type { SessionState, TutorVerdict } from "../../shared/types";

const complete: TutorVerdict = { reply: "Good.", stepComplete: true };
const incomplete: TutorVerdict = { reply: "Say more.", stepComplete: false };

describe("startSession", () => {
  it("starts at the first step of the first lesson", () => {
    const s = startSession(moduleOne, "en-IN");
    expect(s.moduleId).toBe("01-what-is-leadership");
    expect(s.lessonId).toBe("1.1");
    expect(s.stepId).toBe("1.1.a");
    expect(s.turnsInStep).toBe(0);
    expect(s.transcript).toEqual([]);
    expect(s.language).toBe("en-IN");
  });

  it("carries the chosen teaching language into the session", () => {
    expect(startSession(moduleOne, "hi-IN").language).toBe("hi-IN");
  });
});

describe("advance", () => {
  it("moves to the next step when the learner satisfies the condition", () => {
    const r = advance(startSession(moduleOne, "en-IN"), complete, moduleOne);
    expect(r.advanced).toBe(true);
    expect(r.state.stepId).toBe("1.1.b");
    expect(r.state.turnsInStep).toBe(0);
    expect(r.stepUnmet).toBe(false);
  });

  it("stays on the step and counts the turn when the learner does not", () => {
    const r = advance(startSession(moduleOne, "en-IN"), incomplete, moduleOne);
    expect(r.advanced).toBe(false);
    expect(r.state.stepId).toBe("1.1.a");
    expect(r.state.turnsInStep).toBe(1);
  });

  it("force-advances at maxTurns and reports the step unmet", () => {
    // step 1.1.a has maxTurns 4
    let state: SessionState = startSession(moduleOne, "en-IN");
    for (let i = 0; i < 3; i++) {
      state = advance(state, incomplete, moduleOne).state;
    }
    expect(state.turnsInStep).toBe(3);
    expect(state.stepId).toBe("1.1.a");

    const r = advance(state, incomplete, moduleOne);
    expect(r.advanced).toBe(true);
    expect(r.stepUnmet).toBe(true);
    expect(r.state.stepId).toBe("1.1.b");
    expect(r.state.turnsInStep).toBe(0);
  });

  it("crosses into the next lesson after the last step", () => {
    const state: SessionState = { ...startSession(moduleOne, "en-IN"), stepId: "1.1.c" };
    const r = advance(state, complete, moduleOne);
    expect(r.lessonComplete).toBe(true);
    expect(r.state.lessonId).toBe("1.2");
    expect(r.state.stepId).toBe("1.2.a");
    expect(r.moduleComplete).toBe(false);
  });

  it("reports module completion after the final step of the final lesson", () => {
    const state: SessionState = {
      ...startSession(moduleOne, "en-IN"),
      lessonId: "1.3",
      stepId: "1.3.c",
    };
    const r = advance(state, complete, moduleOne);
    expect(r.moduleComplete).toBe(true);
    expect(r.lessonComplete).toBe(true);
    expect(r.state.lessonId).toBe("1.3");
    expect(r.state.stepId).toBe("1.3.c");
  });

  it("does not mutate the state it was given", () => {
    const before = startSession(moduleOne, "en-IN");
    const snapshot = JSON.stringify(before);
    advance(before, complete, moduleOne);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("throws when the state points at a step that does not exist", () => {
    const state: SessionState = { ...startSession(moduleOne, "en-IN"), stepId: "9.9.z" };
    expect(() => advance(state, complete, moduleOne)).toThrow(
      /unknown step 9.9.z/,
    );
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run server/tutor/engine.test.ts`
Expected: FAIL — cannot resolve `./engine`

- [ ] **Step 3: Implement the engine**

`server/tutor/engine.ts`:

```ts
import type {
  LanguageCode,
  Module,
  SessionState,
  TutorVerdict,
} from "../../shared/types";

export type AdvanceResult = {
  state: SessionState;
  advanced: boolean;
  stepUnmet: boolean;
  lessonComplete: boolean;
  moduleComplete: boolean;
};

export function startSession(module: Module, language: LanguageCode): SessionState {
  const lesson = module.lessons[0];
  return {
    moduleId: module.id,
    lessonId: lesson.id,
    stepId: lesson.steps[0].id,
    turnsInStep: 0,
    transcript: [],
    language,
  };
}

export function advance(
  state: SessionState,
  verdict: TutorVerdict,
  module: Module,
): AdvanceResult {
  const lessonIndex = module.lessons.findIndex((l) => l.id === state.lessonId);
  if (lessonIndex === -1) {
    throw new Error(`unknown lesson ${state.lessonId}`);
  }
  const lesson = module.lessons[lessonIndex];

  const stepIndex = lesson.steps.findIndex((s) => s.id === state.stepId);
  if (stepIndex === -1) {
    throw new Error(`unknown step ${state.stepId}`);
  }
  const step = lesson.steps[stepIndex];

  const turns = state.turnsInStep + 1;
  const forced = !verdict.stepComplete && turns >= step.maxTurns;
  const advanced = verdict.stepComplete || forced;

  if (!advanced) {
    return {
      state: { ...state, turnsInStep: turns },
      advanced: false,
      stepUnmet: false,
      lessonComplete: false,
      moduleComplete: false,
    };
  }

  const isLastStep = stepIndex === lesson.steps.length - 1;
  const isLastLesson = lessonIndex === module.lessons.length - 1;

  // Final step of the final lesson: the module is done. Hold position rather
  // than pointing at a step that does not exist.
  if (isLastStep && isLastLesson) {
    return {
      state: { ...state, turnsInStep: 0 },
      advanced: true,
      stepUnmet: forced,
      lessonComplete: true,
      moduleComplete: true,
    };
  }

  const next = isLastStep
    ? {
        lessonId: module.lessons[lessonIndex + 1].id,
        stepId: module.lessons[lessonIndex + 1].steps[0].id,
      }
    : { lessonId: lesson.id, stepId: lesson.steps[stepIndex + 1].id };

  return {
    state: { ...state, ...next, turnsInStep: 0 },
    advanced: true,
    stepUnmet: forced,
    lessonComplete: isLastStep,
    moduleComplete: false,
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run server/tutor/engine.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add server/tutor/engine.ts server/tutor/engine.test.ts
git commit -m "feat: add lesson engine step state machine"
```

---

## Task 4: The prompt builder

**Files:**
- Create: `server/tutor/prompt.ts`
- Test: `server/tutor/prompt.test.ts`

**Interfaces:**
- Consumes: `Lesson`, `Module`, `SessionState`, `Step` from `shared/types`
- Produces: `buildPrompt(args: { module: Module; lesson: Lesson; step: Step; state: SessionState; stepUnmetHint?: boolean }): { system: string; messages: { role: "user" | "assistant"; content: string }[] }`

- [ ] **Step 1: Write the failing test**

`server/tutor/prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPrompt } from "./prompt";
import { moduleOne } from "../../content/modules/01-what-is-leadership";
import type { SessionState } from "../../shared/types";

const lesson = moduleOne.lessons[0];
const step = lesson.steps[0];

const state: SessionState = {
  moduleId: moduleOne.id,
  lessonId: lesson.id,
  stepId: step.id,
  turnsInStep: 0,
  transcript: [
    { speaker: "tutor", text: "Who would you follow?", language: "en-IN" },
    { speaker: "learner", text: "My first manager.", language: "en-IN" },
  ],
  language: "en-IN",
};

describe("buildPrompt", () => {
  it("includes the current step's goal and completion condition", () => {
    const { system } = buildPrompt({ module: moduleOne, lesson, step, state });
    expect(system).toContain(step.tutorGoal);
    expect(system).toContain(step.doneWhen);
  });

  it("does not leak any later step into the prompt", () => {
    const { system } = buildPrompt({ module: moduleOne, lesson, step, state });
    for (const later of lesson.steps.slice(1)) {
      expect(system).not.toContain(later.tutorGoal);
      expect(system).not.toContain(later.doneWhen);
    }
  });

  it("does not leak the lesson principle before it is taught", () => {
    const { system } = buildPrompt({ module: moduleOne, lesson, step, state });
    expect(system).not.toContain(lesson.principle);
  });

  it("instructs the tutor to reply in the learner's language", () => {
    const hindi = { ...state, language: "hi-IN" as const };
    const { system } = buildPrompt({
      module: moduleOne,
      lesson,
      step,
      state: hindi,
    });
    expect(system).toContain("Hindi");
  });

  it("caps reply length", () => {
    const { system } = buildPrompt({ module: moduleOne, lesson, step, state });
    expect(system).toMatch(/two to three sentences/i);
  });

  it("maps the transcript onto chat roles", () => {
    const { messages } = buildPrompt({ module: moduleOne, lesson, step, state });
    expect(messages).toEqual([
      { role: "assistant", content: "Who would you follow?" },
      { role: "user", content: "My first manager." },
    ]);
  });

  it("opens the step with a nudge when the transcript is empty", () => {
    const empty = { ...state, transcript: [] };
    const { messages } = buildPrompt({
      module: moduleOne,
      lesson,
      step,
      state: empty,
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toMatch(/begin/i);
  });

  it("tells the tutor to move on when the step is being abandoned", () => {
    const { system } = buildPrompt({
      module: moduleOne,
      lesson,
      step,
      state,
      stepUnmetHint: true,
    });
    expect(system).toMatch(/move on gracefully/i);
  });
});
```

The leak tests are the point of this file. If the model can see later steps, it runs ahead and the engine stops controlling the lesson.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run server/tutor/prompt.test.ts`
Expected: FAIL — cannot resolve `./prompt`

- [ ] **Step 3: Implement the prompt builder**

`server/tutor/prompt.ts`:

```ts
import type { Lesson, Module, SessionState, Step } from "../../shared/types";

export type ChatMessage = { role: "user" | "assistant"; content: string };

const LANGUAGE_NAMES = { "en-IN": "English", "hi-IN": "Hindi" } as const;

export function buildPrompt(args: {
  module: Module;
  lesson: Lesson;
  step: Step;
  state: SessionState;
  stepUnmetHint?: boolean;
}): { system: string; messages: ChatMessage[] } {
  const { module, lesson, step, state, stepUnmetHint } = args;
  const language = LANGUAGE_NAMES[state.language];

  const system = [
    `You are a leadership tutor speaking with an adult learner. Your words are read aloud, so write for the ear: plain spoken sentences, no lists, no markdown, no headings.`,
    ``,
    `Module: ${module.title}. Lesson: ${lesson.title}.`,
    ``,
    `YOUR ONLY TASK RIGHT NOW:`,
    step.tutorGoal,
    ``,
    `This part of the lesson is finished when: ${step.doneWhen}`,
    ``,
    `RULES:`,
    `- Reply in ${language}. The learner is speaking ${language}, so you speak ${language}.`,
    `- Keep every reply to two to three sentences. You are having a conversation, not delivering a lecture.`,
    `- Ask before you tell. The learner should be doing most of the talking.`,
    `- Never move past the task above. You do not know what comes next in this lesson, and you must not invent it.`,
    `- Do not summarize the lesson or state its conclusion unless the task above tells you to.`,
    stepUnmetHint
      ? `- The learner has struggled with this for several turns. Move on gracefully: acknowledge what they did offer, do not press again, and set stepComplete to true.`
      : ``,
    ``,
    `Return JSON with three fields: "reply" (what you say next), "stepComplete" (true only if the finishing condition above is now met), and "note" (one short sentence for the log explaining your judgement).`,
  ]
    .filter((line) => line !== ``)
    .join(`\n`);

  const messages: ChatMessage[] = state.transcript.map((turn) => ({
    role: turn.speaker === "tutor" ? ("assistant" as const) : ("user" as const),
    content: turn.text,
  }));

  if (messages.length === 0) {
    messages.push({ role: "user", content: "[begin this part of the lesson]" });
  }

  return { system, messages };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run server/tutor/prompt.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add server/tutor/prompt.ts server/tutor/prompt.test.ts
git commit -m "feat: add per-step prompt builder"
```

---

## Task 5: The OpenRouter client

**Files:**
- Create: `server/tutor/openrouter.ts`
- Test: `server/tutor/openrouter.test.ts`

**Interfaces:**
- Consumes: `TutorVerdict` from `shared/types`; `ChatMessage` from `server/tutor/prompt`
- Produces: `getVerdict(args: { system: string; messages: ChatMessage[]; fetchImpl?: typeof fetch }): Promise<TutorVerdict>`

`fetchImpl` is injected so tests never touch the network. It defaults to global `fetch`.

- [ ] **Step 1: Write the failing test**

`server/tutor/openrouter.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getVerdict } from "./openrouter";

function reply(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  } as unknown as Response;
}

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_MODEL = "google/gemini-2.5-flash";
});

const args = { system: "sys", messages: [{ role: "user" as const, content: "hi" }] };

describe("getVerdict", () => {
  it("parses a well-formed response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      reply(JSON.stringify({ reply: "Go on.", stepComplete: false, note: "vague" })),
    );
    const v = await getVerdict({ ...args, fetchImpl });
    expect(v).toEqual({ reply: "Go on.", stepComplete: false, note: "vague" });
  });

  it("sends the key and the model", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(reply(JSON.stringify({ reply: "ok", stepComplete: true })));
    await getVerdict({ ...args, fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body).model).toBe("google/gemini-2.5-flash");
  });

  it("strips markdown fences before parsing", async () => {
    const fenced = '```json\n{"reply":"Hi","stepComplete":true}\n```';
    const fetchImpl = vi.fn().mockResolvedValue(reply(fenced));
    const v = await getVerdict({ ...args, fetchImpl });
    expect(v.reply).toBe("Hi");
  });

  it("retries once when the response is not valid JSON", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(reply("I'm not JSON at all"))
      .mockResolvedValueOnce(reply(JSON.stringify({ reply: "Fixed.", stepComplete: false })));
    const v = await getVerdict({ ...args, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(v.reply).toBe("Fixed.");
  });

  it("falls back to a safe verdict when both attempts fail to parse", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply("still not JSON"));
    const v = await getVerdict({ ...args, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(v.stepComplete).toBe(false);
    expect(v.reply.length).toBeGreaterThan(0);
  });

  it("coerces a missing stepComplete to false", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(JSON.stringify({ reply: "Hm." })));
    const v = await getVerdict({ ...args, fetchImpl });
    expect(v.stepComplete).toBe(false);
  });

  it("throws when the API returns an error status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    } as unknown as Response);
    await expect(getVerdict({ ...args, fetchImpl })).rejects.toThrow(/429/);
  });
});
```

A malformed reply must never crash a session. Two parse failures degrade to a safe "keep going" verdict — the learner sees a slightly bland turn instead of a broken lesson.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run server/tutor/openrouter.test.ts`
Expected: FAIL — cannot resolve `./openrouter`

- [ ] **Step 3: Implement the client**

`server/tutor/openrouter.ts`:

```ts
import type { TutorVerdict } from "../../shared/types";
import type { ChatMessage } from "./prompt";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

const FALLBACK: TutorVerdict = {
  reply: "Sorry, I lost my thread for a moment. Could you say that again?",
  stepComplete: false,
  note: "model returned unparseable output twice",
};

function extractJson(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

function toVerdict(parsed: unknown): TutorVerdict | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const o = parsed as Record<string, unknown>;
  if (typeof o.reply !== "string" || o.reply.trim() === "") return null;
  return {
    reply: o.reply,
    stepComplete: o.stepComplete === true,
    note: typeof o.note === "string" ? o.note : undefined,
  };
}

async function callOnce(
  system: string,
  messages: ChatMessage[],
  fetchImpl: typeof fetch,
): Promise<string> {
  const res = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash",
      messages: [{ role: "system", content: system }, ...messages],
      response_format: { type: "json_object" },
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content;
}

export async function getVerdict(args: {
  system: string;
  messages: ChatMessage[];
  fetchImpl?: typeof fetch;
}): Promise<TutorVerdict> {
  const fetchImpl = args.fetchImpl ?? fetch;

  const first = await callOnce(args.system, args.messages, fetchImpl);
  try {
    const verdict = toVerdict(extractJson(first));
    if (verdict) return verdict;
  } catch {
    // fall through to the repair attempt
  }

  const repairMessages: ChatMessage[] = [
    ...args.messages,
    { role: "assistant", content: first },
    {
      role: "user",
      content:
        'That was not valid JSON. Reply again with only a JSON object containing "reply", "stepComplete", and "note". No prose, no code fences.',
    },
  ];

  const second = await callOnce(args.system, repairMessages, fetchImpl);
  try {
    const verdict = toVerdict(extractJson(second));
    if (verdict) return verdict;
  } catch {
    // fall through to the fallback
  }

  return FALLBACK;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run server/tutor/openrouter.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add server/tutor/openrouter.ts server/tutor/openrouter.test.ts
git commit -m "feat: add OpenRouter client with repair retry and safe fallback"
```

---

## Task 6: The Sarvam speech-to-text client

**Files:**
- Create: `server/speech/stt.ts`
- Test: `server/speech/stt.test.ts`

**Interfaces:**
- Consumes: `LanguageCode` from `shared/types`
- Produces: `transcribe(args: { audio: Buffer; filename: string; fetchImpl?: typeof fetch }): Promise<{ transcript: string; language: LanguageCode }>`

- [ ] **Step 1: Write the failing test**

`server/speech/stt.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { transcribe } from "./stt";

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  process.env.SARVAM_API_KEY = "sarvam-test-key";
});

const audio = { audio: Buffer.from("fake audio"), filename: "turn.webm" };

describe("transcribe", () => {
  it("returns the transcript and the detected language", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      ok({ request_id: "r1", transcript: "My first manager.", language_code: "en-IN" }),
    );
    const r = await transcribe({ ...audio, fetchImpl });
    expect(r).toEqual({ transcript: "My first manager.", language: "en-IN" });
  });

  it("posts multipart form data with the codemix model", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(ok({ transcript: "hi", language_code: "hi-IN" }));
    await transcribe({ ...audio, fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.sarvam.ai/speech-to-text");
    expect(init.headers["api-subscription-key"]).toBe("sarvam-test-key");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("model")).toBe("saaras:v3");
    expect((init.body as FormData).get("mode")).toBe("codemix");
  });

  it("detects Hindi", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(ok({ transcript: "मेरे पहले मैनेजर", language_code: "hi-IN" }));
    const r = await transcribe({ ...audio, fetchImpl });
    expect(r.language).toBe("hi-IN");
  });

  it("falls back to en-IN for a language we do not support", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(ok({ transcript: "vanakkam", language_code: "ta-IN" }));
    const r = await transcribe({ ...audio, fetchImpl });
    expect(r.language).toBe("en-IN");
  });

  it("falls back to en-IN when no language is returned", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(ok({ transcript: "hello", language_code: null }));
    const r = await transcribe({ ...audio, fetchImpl });
    expect(r.language).toBe("en-IN");
  });

  it("returns an empty transcript rather than throwing on silence", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ transcript: "", language_code: null }));
    const r = await transcribe({ ...audio, fetchImpl });
    expect(r.transcript).toBe("");
  });

  it("throws on an error status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    } as unknown as Response);
    await expect(transcribe({ ...audio, fetchImpl })).rejects.toThrow(/401/);
  });
});
```

The prototype supports two languages. Sarvam supports eleven, so a learner speaking Tamil gets a real transcript with a language we cannot speak back in — falling back to `en-IN` keeps the session alive rather than crashing on an unexpected code.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run server/speech/stt.test.ts`
Expected: FAIL — cannot resolve `./stt`

- [ ] **Step 3: Implement the client**

`server/speech/stt.ts`:

```ts
import type { LanguageCode } from "../../shared/types";

const ENDPOINT = "https://api.sarvam.ai/speech-to-text";
const SUPPORTED: LanguageCode[] = ["en-IN", "hi-IN"];

function toSupportedLanguage(code: unknown): LanguageCode {
  return SUPPORTED.includes(code as LanguageCode) ? (code as LanguageCode) : "en-IN";
}

export async function transcribe(args: {
  audio: Buffer;
  filename: string;
  fetchImpl?: typeof fetch;
}): Promise<{ transcript: string; language: LanguageCode }> {
  const fetchImpl = args.fetchImpl ?? fetch;

  const form = new FormData();
  form.append("file", new Blob([args.audio]), args.filename);
  form.append("model", "saaras:v3");
  form.append("mode", "codemix");

  const res = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: { "api-subscription-key": process.env.SARVAM_API_KEY ?? "" },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sarvam STT ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { transcript?: string; language_code?: string | null };
  return {
    transcript: data.transcript ?? "",
    language: toSupportedLanguage(data.language_code),
  };
}
```

Do not set a `Content-Type` header. `fetch` sets the multipart boundary itself, and overriding it breaks the upload.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run server/speech/stt.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add server/speech/stt.ts server/speech/stt.test.ts
git commit -m "feat: add Sarvam speech-to-text client"
```

---

## Task 7: The Sarvam text-to-speech client

**Files:**
- Create: `server/speech/tts.ts`
- Test: `server/speech/tts.test.ts`

**Interfaces:**
- Consumes: `LanguageCode` from `shared/types`
- Produces: `speak(args: { text: string; language: LanguageCode; fetchImpl?: typeof fetch }): Promise<string>` returning base64 WAV; `VOICES: Record<LanguageCode, string>`

- [ ] **Step 1: Verify the available voices before writing code**

The speaker names in Sarvam's docs summaries are not reliable enough to hard-code blind. With `SARVAM_API_KEY` set in `.env`, confirm a valid speaker for each language:

```bash
curl -s -X POST https://api.sarvam.ai/text-to-speech \
  -H "api-subscription-key: $SARVAM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello, this is a test.","language_code":"en-IN","speaker":"anushka","model":"bulbul:v3"}' \
  | head -c 300
```

If the speaker is rejected, the error body lists valid names. Use one valid speaker per language and put the confirmed names into `VOICES` in Step 3. **Record the verified names in the commit message** so the next person does not repeat this.

- [ ] **Step 2: Write the failing test**

`server/speech/tts.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { speak, VOICES } from "./tts";

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  process.env.SARVAM_API_KEY = "sarvam-test-key";
});

describe("speak", () => {
  it("returns the first base64 audio string", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ request_id: "r", audios: ["QUJD"] }));
    expect(await speak({ text: "Hello.", language: "en-IN", fetchImpl })).toBe("QUJD");
  });

  it("sends the bulbul model, the language, and a matching voice", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ audios: ["QUJD"] }));
    await speak({ text: "Hello.", language: "hi-IN", fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.sarvam.ai/text-to-speech");
    expect(init.headers["api-subscription-key"]).toBe("sarvam-test-key");

    const body = JSON.parse(init.body);
    expect(body.model).toBe("bulbul:v3");
    expect(body.language_code).toBe("hi-IN");
    expect(body.speaker).toBe(VOICES["hi-IN"]);
  });

  it("truncates text above Sarvam's 2500 character limit", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ audios: ["QUJD"] }));
    await speak({ text: "x".repeat(3000), language: "en-IN", fetchImpl });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).text.length).toBe(2500);
  });

  it("rejects empty text without calling the API", async () => {
    const fetchImpl = vi.fn();
    await expect(speak({ text: "   ", language: "en-IN", fetchImpl })).rejects.toThrow(
      /empty/i,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws when the response contains no audio", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ audios: [] }));
    await expect(speak({ text: "Hello.", language: "en-IN", fetchImpl })).rejects.toThrow(
      /no audio/i,
    );
  });

  it("throws on an error status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "server error",
    } as unknown as Response);
    await expect(speak({ text: "Hello.", language: "en-IN", fetchImpl })).rejects.toThrow(
      /500/,
    );
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npx vitest run server/speech/tts.test.ts`
Expected: FAIL — cannot resolve `./tts`

- [ ] **Step 4: Implement the client**

`server/speech/tts.ts` — replace the two voice names with the ones verified in Step 1:

```ts
import type { LanguageCode } from "../../shared/types";

const ENDPOINT = "https://api.sarvam.ai/text-to-speech";
const MAX_CHARS = 2500;

// Verified against the live API — see Task 7 Step 1.
export const VOICES: Record<LanguageCode, string> = {
  "en-IN": "anushka",
  "hi-IN": "anushka",
};

export async function speak(args: {
  text: string;
  language: LanguageCode;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  if (args.text.trim() === "") {
    throw new Error("cannot speak empty text");
  }
  const fetchImpl = args.fetchImpl ?? fetch;

  const res = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: {
      "api-subscription-key": process.env.SARVAM_API_KEY ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: args.text.slice(0, MAX_CHARS),
      language_code: args.language,
      speaker: VOICES[args.language],
      model: "bulbul:v3",
      pace: 0.95,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sarvam TTS ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { audios?: string[] };
  const audio = data.audios?.[0];
  if (!audio) {
    throw new Error("Sarvam TTS returned no audio");
  }
  return audio;
}
```

`pace: 0.95` is a deliberate slight slowdown — a tutor that rushes is harder to learn from.

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run server/speech/tts.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 6: Commit**

```bash
git add server/speech/tts.ts server/speech/tts.test.ts
git commit -m "feat: add Sarvam text-to-speech client

Verified speakers against the live API: en-IN and hi-IN both use <name>."
```

---

## Task 8: The three HTTP routes

**Files:**
- Create: `server/routes/stt.ts`, `server/routes/tutor.ts`, `server/routes/tts.ts`, `server/app.ts`, `server/index.ts`
- Test: `server/routes/routes.test.ts`

**Interfaces:**
- Consumes: `transcribe`, `speak`, `startSession`, `advance`, `buildPrompt`, `getVerdict`, `getModule`, `getLesson`, `getStep`
- Produces: `createApp(deps: AppDeps): Express` where

```ts
type AppDeps = {
  transcribe: typeof import("./speech/stt").transcribe;
  speak: typeof import("./speech/tts").speak;
  getVerdict: typeof import("./tutor/openrouter").getVerdict;
};
```

Dependencies are injected so route tests run without network access.

- [ ] **Step 1: Write the failing test**

`server/routes/routes.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { startSession } from "../tutor/engine";
import { moduleOne } from "../../content/modules/01-what-is-leadership";

function app(overrides = {}) {
  return createApp({
    transcribe: vi.fn().mockResolvedValue({ transcript: "My manager.", language: "en-IN" }),
    speak: vi.fn().mockResolvedValue("QUJD"),
    getVerdict: vi.fn().mockResolvedValue({ reply: "Good.", stepComplete: true }),
    ...overrides,
  });
}

describe("GET /api/modules", () => {
  it("returns module ids, titles and order without lesson internals", async () => {
    const res = await request(app()).get("/api/modules");
    expect(res.status).toBe(200);
    expect(res.body[0]).toEqual({
      id: "01-what-is-leadership",
      order: 1,
      title: "What is leadership",
      premise: moduleOne.premise,
      lessonCount: 3,
    });
    expect(JSON.stringify(res.body)).not.toContain("doneWhen");
  });
});

describe("POST /api/session", () => {
  it("starts a session at the first step", async () => {
    const res = await request(app())
      .post("/api/session")
      .send({ moduleId: "01-what-is-leadership", language: "en-IN" });
    expect(res.status).toBe(200);
    expect(res.body.state.stepId).toBe("1.1.a");
  });

  it("starts the session in the chosen language", async () => {
    const res = await request(app())
      .post("/api/session")
      .send({ moduleId: "01-what-is-leadership", language: "hi-IN" });
    expect(res.body.state.language).toBe("hi-IN");
  });

  it("defaults to English when no language is chosen", async () => {
    const res = await request(app())
      .post("/api/session")
      .send({ moduleId: "01-what-is-leadership" });
    expect(res.body.state.language).toBe("en-IN");
  });

  it("rejects an unsupported language", async () => {
    const res = await request(app())
      .post("/api/session")
      .send({ moduleId: "01-what-is-leadership", language: "ta-IN" });
    expect(res.status).toBe(400);
  });

  it("404s on an unknown module", async () => {
    const res = await request(app()).post("/api/session").send({ moduleId: "nope" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/stt", () => {
  it("returns the transcript for uploaded audio", async () => {
    const res = await request(app())
      .post("/api/stt")
      .attach("audio", Buffer.from("fake"), "turn.webm");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ transcript: "My manager.", language: "en-IN" });
  });

  it("400s when no audio is attached", async () => {
    const res = await request(app()).post("/api/stt");
    expect(res.status).toBe(400);
  });

  it("502s when Sarvam fails", async () => {
    const failing = app({ transcribe: vi.fn().mockRejectedValue(new Error("Sarvam STT 500")) });
    const res = await request(failing)
      .post("/api/stt")
      .attach("audio", Buffer.from("fake"), "turn.webm");
    expect(res.status).toBe(502);
    expect(res.body.error).toBeTruthy();
  });
});

describe("POST /api/tutor", () => {
  const state = startSession(moduleOne, "en-IN");

  it("returns a reply and the advanced state", async () => {
    const res = await request(app())
      .post("/api/tutor")
      .send({ state, utterance: "My first manager." });

    expect(res.status).toBe(200);
    expect(res.body.reply).toBe("Good.");
    expect(res.body.state.stepId).toBe("1.1.b");
    expect(res.body.moduleComplete).toBe(false);
  });

  it("appends both turns to the transcript", async () => {
    const res = await request(app())
      .post("/api/tutor")
      .send({ state, utterance: "My first manager." });

    expect(res.body.state.transcript).toEqual([
      { speaker: "learner", text: "My first manager.", language: "en-IN" },
      { speaker: "tutor", text: "Good.", language: "en-IN" },
    ]);
  });

  it("asks the learner to repeat when the utterance is empty, without calling the model", async () => {
    const getVerdict = vi.fn();
    const res = await request(app({ getVerdict }))
      .post("/api/tutor")
      .send({ state, utterance: "   " });

    expect(res.status).toBe(200);
    expect(res.body.reply).toMatch(/didn't catch|say that again/i);
    expect(res.body.state.stepId).toBe("1.1.a");
    expect(getVerdict).not.toHaveBeenCalled();
  });

  it("keeps the chosen teaching language when the learner speaks the other one", async () => {
    const res = await request(app())
      .post("/api/tutor")
      .send({ state, utterance: "मेरे मैनेजर", detectedLanguage: "hi-IN" });

    // The learner chose English. One Hindi sentence does not switch the course.
    expect(res.body.state.language).toBe("en-IN");
    expect(res.body.state.transcript[0].language).toBe("hi-IN");
  });

  it("switches the teaching language when the learner explicitly changes it", async () => {
    const res = await request(app())
      .post("/api/tutor")
      .send({ state: { ...state, language: "hi-IN" }, utterance: "शुरू करते हैं" });
    expect(res.body.state.language).toBe("hi-IN");
  });

  it("asks the learner to repeat in the chosen language", async () => {
    const res = await request(app())
      .post("/api/tutor")
      .send({ state: { ...state, language: "hi-IN" }, utterance: "  " });
    expect(res.body.reply).toMatch(/दोबारा/);
  });

  it("400s on a state pointing at an unknown module", async () => {
    const res = await request(app())
      .post("/api/tutor")
      .send({ state: { ...state, moduleId: "nope" }, utterance: "hi" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/tts", () => {
  it("returns base64 audio", async () => {
    const res = await request(app())
      .post("/api/tts")
      .send({ text: "Hello.", language: "en-IN" });
    expect(res.status).toBe(200);
    expect(res.body.audio).toBe("QUJD");
  });

  it("502s when Sarvam fails", async () => {
    const failing = app({ speak: vi.fn().mockRejectedValue(new Error("Sarvam TTS 500")) });
    const res = await request(failing)
      .post("/api/tts")
      .send({ text: "Hello.", language: "en-IN" });
    expect(res.status).toBe(502);
  });
});
```

The empty-utterance test matters: the model must never be handed silence to respond to, because it will invent a reply to nothing.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run server/routes/routes.test.ts`
Expected: FAIL — cannot resolve `../app`

- [ ] **Step 3: Implement the app and routes**

`server/app.ts`:

```ts
import express, { type Express } from "express";
import multer from "multer";
import type { LanguageCode, SessionState } from "../shared/types";
import { getLesson, getModule, getStep, modules } from "../content/modules/index";
import { advance, startSession } from "./tutor/engine";
import { buildPrompt } from "./tutor/prompt";
import type { transcribe as Transcribe } from "./speech/stt";
import type { speak as Speak } from "./speech/tts";
import type { getVerdict as GetVerdict } from "./tutor/openrouter";

export type AppDeps = {
  transcribe: typeof Transcribe;
  speak: typeof Speak;
  getVerdict: typeof GetVerdict;
};

const upload = multer({ storage: multer.memoryStorage() });

export const SUPPORTED_LANGUAGES: LanguageCode[] = ["en-IN", "hi-IN"];

const REPEAT_PROMPT: Record<LanguageCode, string> = {
  "en-IN": "Sorry, I didn't catch that. Could you say that again?",
  "hi-IN": "माफ़ कीजिए, मैं सुन नहीं पाया। क्या आप दोबारा कह सकते हैं?",
};

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/modules", (_req, res) => {
    res.json(
      modules.map((m) => ({
        id: m.id,
        order: m.order,
        title: m.title,
        premise: m.premise,
        lessonCount: m.lessons.length,
      })),
    );
  });

  app.post("/api/session", (req, res) => {
    const module = getModule(req.body?.moduleId);
    if (!module) {
      res.status(404).json({ error: "unknown module" });
      return;
    }
    const requested = req.body?.language;
    if (requested !== undefined && !SUPPORTED_LANGUAGES.includes(requested)) {
      res.status(400).json({ error: "unsupported language" });
      return;
    }
    res.json({ state: startSession(module, (requested as LanguageCode) ?? "en-IN") });
  });

  app.post("/api/stt", upload.single("audio"), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "no audio uploaded" });
      return;
    }
    try {
      const result = await deps.transcribe({
        audio: req.file.buffer,
        filename: req.file.originalname || "turn.webm",
      });
      res.json(result);
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  app.post("/api/tutor", async (req, res) => {
    const state = req.body?.state as SessionState | undefined;
    const utterance = String(req.body?.utterance ?? "");

    // The teaching language is the learner's explicit choice, carried on the
    // session state. `detectedLanguage` is what STT heard — recorded on the
    // learner's turn for display, but it never changes what the tutor teaches in.
    const language: LanguageCode = state?.language ?? "en-IN";
    const spoken = SUPPORTED_LANGUAGES.includes(req.body?.detectedLanguage)
      ? (req.body.detectedLanguage as LanguageCode)
      : language;

    if (!state) {
      res.status(400).json({ error: "missing state" });
      return;
    }

    const module = getModule(state.moduleId);
    if (!module) {
      res.status(400).json({ error: "unknown module in state" });
      return;
    }
    const lesson = getLesson(module, state.lessonId);
    const step = lesson && getStep(lesson, state.stepId);
    if (!lesson || !step) {
      res.status(400).json({ error: "unknown lesson or step in state" });
      return;
    }

    // Never ask the model to respond to silence — it will invent something.
    if (utterance.trim() === "") {
      res.json({
        reply: REPEAT_PROMPT[language],
        state,
        advanced: false,
        lessonComplete: false,
        moduleComplete: false,
      });
      return;
    }

    const withLearner: SessionState = {
      ...state,
      transcript: [
        ...state.transcript,
        { speaker: "learner", text: utterance, language: spoken },
      ],
    };

    try {
      const { system, messages } = buildPrompt({
        module,
        lesson,
        step,
        state: withLearner,
        stepUnmetHint: withLearner.turnsInStep + 1 >= step.maxTurns,
      });

      const verdict = await deps.getVerdict({ system, messages });

      const withTutor: SessionState = {
        ...withLearner,
        transcript: [
          ...withLearner.transcript,
          { speaker: "tutor", text: verdict.reply, language },
        ],
      };

      const result = advance(withTutor, verdict, module);
      res.json({
        reply: verdict.reply,
        note: verdict.note,
        state: result.state,
        advanced: result.advanced,
        lessonComplete: result.lessonComplete,
        moduleComplete: result.moduleComplete,
      });
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  app.post("/api/tts", async (req, res) => {
    const text = String(req.body?.text ?? "");
    const language = (req.body?.language as LanguageCode) ?? "en-IN";
    try {
      res.json({ audio: await deps.speak({ text, language }) });
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  return app;
}
```

`server/index.ts`:

```ts
import { createApp } from "./app";
import { transcribe } from "./speech/stt";
import { speak } from "./speech/tts";
import { getVerdict } from "./tutor/openrouter";

const port = Number(process.env.PORT ?? 3001);

createApp({ transcribe, speak, getVerdict }).listen(port, () => {
  console.log(`AI Leadership Tutor server listening on ${port}`);
});
```

- [ ] **Step 4: Load environment variables**

Node 20.6+ loads `.env` natively. Update the server script in `package.json`:

```json
"dev:server": "tsx watch --env-file=.env server/index.ts"
```

If `node --version` is below 20.6, install `dotenv` and call `import \"dotenv/config\";` as the first line of `server/index.ts` instead.

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run server/routes/routes.test.ts`
Expected: PASS, 18 tests

- [ ] **Step 6: Commit**

```bash
git add server/app.ts server/index.ts server/routes/
git commit -m "feat: add HTTP routes for session, stt, tutor and tts"
```

---

## Task 9: Progress persistence

**Files:**
- Create: `src/hooks/useProgress.ts`
- Test: `src/hooks/useProgress.test.ts`

**Interfaces:**
- Consumes: `Progress`, `SessionState` from `shared/types`
- Produces: `useProgress(): { progress: Progress; isUnlocked(order: number): boolean; recordPosition(state: SessionState): void; completeModule(id: string): void; reset(): void }`

- [ ] **Step 1: Write the failing test**

`src/hooks/useProgress.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useProgress, STORAGE_KEY } from "./useProgress";
import type { SessionState } from "../../shared/types";

const state: SessionState = {
  moduleId: "01-what-is-leadership",
  lessonId: "1.2",
  stepId: "1.2.b",
  turnsInStep: 1,
  transcript: [],
  language: "en-IN",
};

beforeEach(() => localStorage.clear());

describe("useProgress", () => {
  it("starts with nothing completed and no position", () => {
    const { result } = renderHook(() => useProgress());
    expect(result.current.progress).toEqual({ completedModules: [], current: null });
  });

  it("unlocks only the first module initially", () => {
    const { result } = renderHook(() => useProgress());
    expect(result.current.isUnlocked(1)).toBe(true);
    expect(result.current.isUnlocked(2)).toBe(false);
  });

  it("unlocks the next module once the previous is complete", () => {
    const { result } = renderHook(() => useProgress());
    act(() => result.current.completeModule("01-what-is-leadership"));
    expect(result.current.isUnlocked(2)).toBe(true);
    expect(result.current.isUnlocked(3)).toBe(false);
  });

  it("records position and survives a remount", () => {
    const first = renderHook(() => useProgress());
    act(() => first.result.current.recordPosition(state));

    const second = renderHook(() => useProgress());
    expect(second.result.current.progress.current).toEqual({
      moduleId: "01-what-is-leadership",
      lessonId: "1.2",
      stepId: "1.2.b",
    });
  });

  it("does not record a module twice", () => {
    const { result } = renderHook(() => useProgress());
    act(() => result.current.completeModule("01-what-is-leadership"));
    act(() => result.current.completeModule("01-what-is-leadership"));
    expect(result.current.progress.completedModules).toEqual(["01-what-is-leadership"]);
  });

  it("recovers from corrupted storage instead of crashing", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    const { result } = renderHook(() => useProgress());
    expect(result.current.progress).toEqual({ completedModules: [], current: null });
  });

  it("clears everything on reset", () => {
    const { result } = renderHook(() => useProgress());
    act(() => result.current.completeModule("01-what-is-leadership"));
    act(() => result.current.reset());
    expect(result.current.progress.completedModules).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/hooks/useProgress.test.ts`
Expected: FAIL — cannot resolve `./useProgress`

- [ ] **Step 3: Implement the hook**

`src/hooks/useProgress.ts`:

```ts
import { useCallback, useState } from "react";
import type { Progress, SessionState } from "../../shared/types";

export const STORAGE_KEY = "ai-leadership-tutor:progress";

const EMPTY: Progress = { completedModules: [], current: null };

function read(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Progress;
    if (!Array.isArray(parsed.completedModules)) return EMPTY;
    return parsed;
  } catch {
    return EMPTY;
  }
}

function write(progress: Progress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Storage full or blocked (private browsing). Progress is a convenience,
    // not a requirement — the session in memory still works.
  }
}

export function useProgress() {
  const [progress, setProgress] = useState<Progress>(read);

  const update = useCallback((next: Progress) => {
    write(next);
    setProgress(next);
  }, []);

  const recordPosition = useCallback(
    (state: SessionState) =>
      update({
        ...read(),
        current: {
          moduleId: state.moduleId,
          lessonId: state.lessonId,
          stepId: state.stepId,
        },
      }),
    [update],
  );

  const completeModule = useCallback(
    (id: string) => {
      const current = read();
      if (current.completedModules.includes(id)) return;
      update({ ...current, completedModules: [...current.completedModules, id] });
    },
    [update],
  );

  // Module N unlocks when N-1 modules are complete. Module 1 is always open.
  const isUnlocked = useCallback(
    (order: number) => order <= progress.completedModules.length + 1,
    [progress.completedModules.length],
  );

  const reset = useCallback(() => update(EMPTY), [update]);

  return { progress, isUnlocked, recordPosition, completeModule, reset };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/hooks/useProgress.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useProgress.ts src/hooks/useProgress.test.ts
git commit -m "feat: add localStorage progress with linear module unlock"
```

---

## Task 9b: Language choice and picker

**Files:**
- Create: `src/hooks/useLanguage.ts`, `src/components/ui/provider.tsx`, `src/components/LanguagePicker.tsx`
- Test: `src/hooks/useLanguage.test.ts`, `src/components/LanguagePicker.test.tsx`

**Interfaces:**
- Consumes: `LanguageCode` from `shared/types`
- Produces:
  - `<Provider>` — the Chakra v3 root, used by every component test from here on
  - `useLanguage(): { language: LanguageCode; setLanguage(l: LanguageCode): void }`
  - `LANGUAGE_STORAGE_KEY: string`
  - `<LanguagePicker />`

Stored under its own key rather than inside `Progress`, because resetting progress should
not reset a preference about what language someone speaks.

- [ ] **Step 1: Write the failing hook test**

`src/hooks/useLanguage.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLanguage, LANGUAGE_STORAGE_KEY } from "./useLanguage";

beforeEach(() => localStorage.clear());

describe("useLanguage", () => {
  it("defaults to English", () => {
    const { result } = renderHook(() => useLanguage());
    expect(result.current.language).toBe("en-IN");
  });

  it("stores a choice and survives a remount", () => {
    const first = renderHook(() => useLanguage());
    act(() => first.result.current.setLanguage("hi-IN"));

    const second = renderHook(() => useLanguage());
    expect(second.result.current.language).toBe("hi-IN");
  });

  it("ignores an unsupported stored value", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "ta-IN");
    const { result } = renderHook(() => useLanguage());
    expect(result.current.language).toBe("en-IN");
  });

  it("survives corrupted storage", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "{broken");
    const { result } = renderHook(() => useLanguage());
    expect(result.current.language).toBe("en-IN");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/hooks/useLanguage.test.ts`
Expected: FAIL — cannot resolve `./useLanguage`

- [ ] **Step 3: Implement the hook**

`src/hooks/useLanguage.ts`:

```ts
import { useCallback, useState } from "react";
import type { LanguageCode } from "../../shared/types";

export const LANGUAGE_STORAGE_KEY = "ai-leadership-tutor:language";

const SUPPORTED: LanguageCode[] = ["en-IN", "hi-IN"];

function read(): LanguageCode {
  try {
    const raw = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return SUPPORTED.includes(raw as LanguageCode) ? (raw as LanguageCode) : "en-IN";
  } catch {
    return "en-IN";
  }
}

export function useLanguage() {
  const [language, setLanguageState] = useState<LanguageCode>(read);

  const setLanguage = useCallback((next: LanguageCode) => {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // Preference is a convenience; the in-memory choice still applies.
    }
    setLanguageState(next);
  }, []);

  return { language, setLanguage };
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run src/hooks/useLanguage.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 4b: Write the Chakra v3 provider**

Every component test from here on renders inside this. Create it now.

`src/components/ui/provider.tsx`:

```tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import type { ReactNode } from "react";

// Chakra v3: ChakraProvider takes a `value` system rather than a `theme`.
// Everything in the app renders inside this.
export function Provider({ children }: { children: ReactNode }) {
  return <ChakraProvider value={defaultSystem}>{children}</ChakraProvider>;
}
```

- [ ] **Step 5: Write the failing picker test**

`src/components/LanguagePicker.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguagePicker } from "./LanguagePicker";
import { Provider } from "./ui/provider";
import { LANGUAGE_STORAGE_KEY } from "../hooks/useLanguage";

beforeEach(() => localStorage.clear());

const renderPicker = () =>
  render(
    <Provider>
      <LanguagePicker />
    </Provider>,
  );

describe("LanguagePicker", () => {
  it("offers both languages, Hindi in its own script", () => {
    renderPicker();
    expect(screen.getByRole("button", { name: "English" })).toBeDefined();
    expect(screen.getByRole("button", { name: "हिंदी" })).toBeDefined();
  });

  it("marks English as selected by default", () => {
    renderPicker();
    expect(
      screen.getByRole("button", { name: "English" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("stores the choice when Hindi is picked", async () => {
    renderPicker();
    await userEvent.click(screen.getByRole("button", { name: "हिंदी" }));
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("hi-IN");
  });

  it("moves the selected state to Hindi once picked", async () => {
    renderPicker();
    await userEvent.click(screen.getByRole("button", { name: "हिंदी" }));
    expect(
      screen.getByRole("button", { name: "हिंदी" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "English" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `npx vitest run src/components/LanguagePicker.test.tsx`
Expected: FAIL — cannot resolve `./LanguagePicker`

- [ ] **Step 7: Implement the picker**

`src/components/LanguagePicker.tsx`:

```tsx
import { Button, Stack, Text } from "@chakra-ui/react";
import type { LanguageCode } from "../../shared/types";
import { useLanguage } from "../hooks/useLanguage";

const OPTIONS: { code: LanguageCode; label: string }[] = [
  { code: "en-IN", label: "English" },
  { code: "hi-IN", label: "हिंदी" },
];

export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useLanguage();

  return (
    <Stack direction="row" align="center" gap="2">
      {!compact && (
        <Text fontSize="sm" color="fg.muted">
          Learn in
        </Text>
      )}
      {OPTIONS.map((option) => (
        <Button
          key={option.code}
          size="sm"
          aria-pressed={language === option.code}
          variant={language === option.code ? "solid" : "outline"}
          onClick={() => setLanguage(option.code)}
        >
          {option.label}
        </Button>
      ))}
    </Stack>
  );
}
```

- [ ] **Step 8: Run it and confirm it passes**

Run: `npx vitest run src/components/LanguagePicker.test.tsx`
Expected: PASS, 4 tests

- [ ] **Step 9: Commit**

```bash
git add src/hooks/useLanguage.ts src/hooks/useLanguage.test.ts \
  src/components/ui/provider.tsx \
  src/components/LanguagePicker.tsx src/components/LanguagePicker.test.tsx
git commit -m "feat: add persisted English/Hindi language choice and picker"
```

---

## Task 10: The voice session hook

**Files:**
- Create: `src/hooks/useVoiceSession.ts`
- Test: `src/hooks/useVoiceSession.test.ts`

**Interfaces:**
- Consumes: `LanguageCode`, `SessionState`, `Turn` from `shared/types`
- Produces:

```ts
type SessionStatus = "idle" | "listening" | "thinking" | "speaking" | "error";

useVoiceSession(moduleId: string, language: LanguageCode): {
  status: SessionStatus;
  transcript: Turn[];
  state: SessionState | null;
  moduleComplete: boolean;
  error: string | null;
  start(): Promise<void>;
  startRecording(): Promise<void>;
  stopRecording(): void;
  sendText(text: string): Promise<void>;
  dismissError(): void;
}
```

- [ ] **Step 1: Write the failing test**

`src/hooks/useVoiceSession.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useVoiceSession } from "./useVoiceSession";
import type { SessionState } from "../../shared/types";

const state: SessionState = {
  moduleId: "01-what-is-leadership",
  lessonId: "1.1",
  stepId: "1.1.a",
  turnsInStep: 0,
  transcript: [],
  language: "en-IN",
};

function mockFetch(routes: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    if (!key) throw new Error(`unexpected fetch: ${url}`);
    const body = routes[key];
    if (body instanceof Error) {
      return { ok: false, status: 502, json: async () => ({ error: body.message }) };
    }
    return { ok: true, status: 200, json: async () => body };
  });
}

beforeEach(() => {
  // Audio playback is a no-op in jsdom.
  vi.stubGlobal(
    "Audio",
    class {
      play = vi.fn().mockResolvedValue(undefined);
      onended: (() => void) | null = null;
    },
  );
});

describe("useVoiceSession", () => {
  it("starts idle with no transcript", () => {
    vi.stubGlobal("fetch", mockFetch({}));
    const { result } = renderHook(() => useVoiceSession("01-what-is-leadership", "en-IN"));
    expect(result.current.status).toBe("idle");
    expect(result.current.transcript).toEqual([]);
  });

  it("opens a session and speaks the tutor's first turn", async () => {
    const opened = {
      ...state,
      transcript: [{ speaker: "tutor", text: "Who would you follow?", language: "en-IN" }],
    };
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/api/session": { state },
        "/api/tutor": { reply: "Who would you follow?", state: opened, moduleComplete: false },
        "/api/tts": { audio: "QUJD" },
      }),
    );

    const { result } = renderHook(() => useVoiceSession("01-what-is-leadership", "en-IN"));
    await act(() => result.current.start());

    await waitFor(() => expect(result.current.transcript).toHaveLength(1));
    expect(result.current.transcript[0].text).toBe("Who would you follow?");
  });

  it("sends typed text through the same path as speech", async () => {
    const after = {
      ...state,
      stepId: "1.1.b",
      transcript: [
        { speaker: "learner", text: "My first manager.", language: "en-IN" },
        { speaker: "tutor", text: "What did they do?", language: "en-IN" },
      ],
    };
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/api/session": { state },
        "/api/tutor": { reply: "What did they do?", state: after, moduleComplete: false },
        "/api/tts": { audio: "QUJD" },
      }),
    );

    const { result } = renderHook(() => useVoiceSession("01-what-is-leadership", "en-IN"));
    await act(() => result.current.start());
    await act(() => result.current.sendText("My first manager."));

    await waitFor(() => expect(result.current.transcript).toHaveLength(2));
    expect(result.current.state?.stepId).toBe("1.1.b");
  });

  it("returns to idle after the tutor finishes speaking", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/api/session": { state },
        "/api/tutor": { reply: "Go on.", state, moduleComplete: false },
        "/api/tts": { audio: "QUJD" },
      }),
    );
    const { result } = renderHook(() => useVoiceSession("01-what-is-leadership", "en-IN"));
    await act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe("idle"));
  });

  it("keeps the tutor's words when TTS fails", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/api/session": { state },
        "/api/tutor": {
          reply: "Still teaching.",
          state: { ...state, transcript: [{ speaker: "tutor", text: "Still teaching.", language: "en-IN" }] },
          moduleComplete: false,
        },
        "/api/tts": new Error("Sarvam TTS 500"),
      }),
    );

    const { result } = renderHook(() => useVoiceSession("01-what-is-leadership", "en-IN"));
    await act(() => result.current.start());

    await waitFor(() => expect(result.current.transcript).toHaveLength(1));
    expect(result.current.transcript[0].text).toBe("Still teaching.");
    expect(result.current.status).not.toBe("error");
  });

  it("surfaces an error when the tutor call fails", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ "/api/session": { state }, "/api/tutor": new Error("model down") }),
    );
    const { result } = renderHook(() => useVoiceSession("01-what-is-leadership", "en-IN"));
    await act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toMatch(/model down/);
  });

  it("reports an explicit error when the microphone is denied", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/api/session": { state } }));
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error("Permission denied")) },
    });

    const { result } = renderHook(() => useVoiceSession("01-what-is-leadership", "en-IN"));
    await act(() => result.current.startRecording());
    await waitFor(() => expect(result.current.error).toMatch(/microphone/i));
  });

  it("opens the session in the chosen language", async () => {
    const fetchImpl = mockFetch({
      "/api/session": { state: { ...state, language: "hi-IN" } },
      "/api/tutor": { reply: "नमस्ते।", state: { ...state, language: "hi-IN" }, moduleComplete: false },
      "/api/tts": { audio: "QUJD" },
    });
    vi.stubGlobal("fetch", fetchImpl);

    const { result } = renderHook(() => useVoiceSession("01-what-is-leadership", "hi-IN"));
    await act(() => result.current.start());

    const sessionCall = fetchImpl.mock.calls.find((c) => String(c[0]).includes("/api/session"));
    expect(JSON.parse(sessionCall![1].body).language).toBe("hi-IN");
  });

  it("applies a mid-session language switch to the next turn", async () => {
    const fetchImpl = mockFetch({
      "/api/session": { state },
      "/api/tutor": { reply: "ठीक है।", state, moduleComplete: false },
      "/api/tts": { audio: "QUJD" },
    });
    vi.stubGlobal("fetch", fetchImpl);

    const { result, rerender } = renderHook(
      ({ lang }) => useVoiceSession("01-what-is-leadership", lang),
      { initialProps: { lang: "en-IN" as const } },
    );
    await act(() => result.current.start());
    rerender({ lang: "hi-IN" as never });
    await act(() => result.current.sendText("आगे बढ़ें"));

    const tutorCalls = fetchImpl.mock.calls.filter((c) => String(c[0]).includes("/api/tutor"));
    const last = JSON.parse(tutorCalls[tutorCalls.length - 1][1].body);
    expect(last.state.language).toBe("hi-IN");
  });

  it("flags module completion", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/api/session": { state },
        "/api/tutor": { reply: "Well done.", state, moduleComplete: true },
        "/api/tts": { audio: "QUJD" },
      }),
    );
    const { result } = renderHook(() => useVoiceSession("01-what-is-leadership", "en-IN"));
    await act(() => result.current.start());
    await waitFor(() => expect(result.current.moduleComplete).toBe(true));
  });
});
```

The TTS-failure test encodes a real product decision: losing the voice must not lose the lesson.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/hooks/useVoiceSession.test.ts`
Expected: FAIL — cannot resolve `./useVoiceSession`

- [ ] **Step 3: Implement the hook**

`src/hooks/useVoiceSession.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { LanguageCode, SessionState, Turn } from "../../shared/types";

export type SessionStatus = "idle" | "listening" | "thinking" | "speaking" | "error";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `${url} failed`);
  return data as T;
}

export function useVoiceSession(moduleId: string, language: LanguageCode) {
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [state, setState] = useState<SessionState | null>(null);
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [moduleComplete, setModuleComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stateRef = useRef<SessionState | null>(null);

  // A mid-session switch in the picker takes effect on the next turn.
  useEffect(() => {
    if (stateRef.current && stateRef.current.language !== language) {
      const next = { ...stateRef.current, language };
      stateRef.current = next;
      setState(next);
    }
  }, [language]);

  const play = useCallback(async (text: string, language: LanguageCode) => {
    try {
      const { audio } = await postJson<{ audio: string }>("/api/tts", { text, language });
      setStatus("speaking");
      await new Promise<void>((resolve) => {
        const el = new Audio(`data:audio/wav;base64,${audio}`);
        el.onended = () => resolve();
        el.play().catch(() => resolve());
      });
    } catch {
      // Voice failed; the words are already on screen. Continue silently.
    }
    setStatus("idle");
  }, []);

  const turn = useCallback(
    async (utterance: string, detectedLanguage?: LanguageCode) => {
      const current = stateRef.current;
      if (!current) return;

      setStatus("thinking");
      try {
        const res = await postJson<{
          reply: string;
          state: SessionState;
          moduleComplete: boolean;
        }>("/api/tutor", { state: current, utterance, detectedLanguage });

        stateRef.current = res.state;
        setState(res.state);
        setTranscript(res.state.transcript);
        setModuleComplete(res.moduleComplete);
        // The tutor always speaks the chosen teaching language, not whatever
        // language the learner happened to use on this turn.
        await play(res.reply, res.state.language);
      } catch (err) {
        setError((err as Error).message);
        setStatus("error");
      }
    },
    [play],
  );

  const start = useCallback(async () => {
    try {
      const { state: fresh } = await postJson<{ state: SessionState }>("/api/session", {
        moduleId,
        language,
      });
      stateRef.current = fresh;
      setState(fresh);
      setTranscript(fresh.transcript);
      // "[open]" is a synthetic first utterance so the tutor speaks first.
      await turn("[open]");
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }, [moduleId, language, turn]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setStatus("thinking");
        try {
          const form = new FormData();
          form.append("audio", blob, "turn.webm");
          const res = await fetch("/api/stt", { method: "POST", body: form });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error ?? "transcription failed");
          await turn(data.transcript, data.language);
        } catch (err) {
          setError((err as Error).message);
          setStatus("error");
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setStatus("listening");
    } catch {
      setError("Microphone unavailable. Check permissions, or type your answer instead.");
      setStatus("error");
    }
  }, [turn]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }, []);

  const sendText = useCallback((text: string) => turn(text), [turn]);

  const dismissError = useCallback(() => {
    setError(null);
    setStatus("idle");
  }, []);

  return {
    status,
    transcript,
    state,
    moduleComplete,
    error,
    start,
    startRecording,
    stopRecording,
    sendText,
    dismissError,
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/hooks/useVoiceSession.test.ts`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useVoiceSession.ts src/hooks/useVoiceSession.test.ts
git commit -m "feat: add voice session hook with text fallback"
```

---

## Task 11: The module map

**Files:**
- Create: `src/components/ModuleMap.tsx`
- Test: `src/components/ModuleMap.test.tsx`

**Interfaces:**
- Consumes: `useProgress` from `src/hooks/useProgress`; `LanguagePicker` and `Provider` from Task 9b
- Produces: `<ModuleMap onOpen={(moduleId: string) => void} />`

- [ ] **Step 1: Write the failing test**

`src/components/ModuleMap.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModuleMap } from "./ModuleMap";
import { Provider } from "./ui/provider";

const catalogue = [
  { id: "01-what-is-leadership", order: 1, title: "What is leadership", premise: "P1", lessonCount: 3 },
  { id: "02-leadership-styles", order: 2, title: "Leadership styles", premise: "P2", lessonCount: 4 },
];

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => catalogue }),
  );
});

const renderMap = (onOpen = vi.fn()) => {
  render(
    <Provider>
      <ModuleMap onOpen={onOpen} />
    </Provider>,
  );
  return onOpen;
};

describe("ModuleMap", () => {
  it("lists every module in the curriculum", async () => {
    renderMap();
    expect(await screen.findByText("What is leadership")).toBeDefined();
    expect(screen.getByText("Leadership styles")).toBeDefined();
  });

  it("opens an unlocked module when clicked", async () => {
    const onOpen = renderMap();
    await userEvent.click(await screen.findByRole("button", { name: /what is leadership/i }));
    expect(onOpen).toHaveBeenCalledWith("01-what-is-leadership");
  });

  it("disables a locked module", async () => {
    renderMap();
    const locked = await screen.findByRole("button", { name: /leadership styles/i });
    expect(locked.hasAttribute("disabled")).toBe(true);
  });

  it("does not open a locked module when clicked", async () => {
    const onOpen = renderMap();
    await userEvent.click(await screen.findByRole("button", { name: /leadership styles/i }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("offers the language choice before any module is started", async () => {
    renderMap();
    expect(await screen.findByRole("button", { name: "English" })).toBeDefined();
    expect(screen.getByRole("button", { name: "हिंदी" })).toBeDefined();
  });

  it("shows a locked module as unlocked once the previous one is complete", async () => {
    localStorage.setItem(
      "ai-leadership-tutor:progress",
      JSON.stringify({ completedModules: ["01-what-is-leadership"], current: null }),
    );
    renderMap();
    await waitFor(async () => {
      const m2 = await screen.findByRole("button", { name: /leadership styles/i });
      expect(m2.hasAttribute("disabled")).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/components/ModuleMap.test.tsx`
Expected: FAIL — cannot resolve `./ModuleMap`

- [ ] **Step 3: Implement the module map**

`src/components/ModuleMap.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Badge, Box, Button, Heading, Stack, Text } from "@chakra-ui/react";
import { Lock } from "lucide-react";
import { useProgress } from "../hooks/useProgress";
import { LanguagePicker } from "./LanguagePicker";

type ModuleSummary = {
  id: string;
  order: number;
  title: string;
  premise: string;
  lessonCount: number;
};

export function ModuleMap({ onOpen }: { onOpen: (moduleId: string) => void }) {
  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const { progress, isUnlocked } = useProgress();

  useEffect(() => {
    fetch("/api/modules")
      .then((r) => r.json())
      .then(setModules)
      .catch(() => setModules([]));
  }, []);

  return (
    <Stack gap="4" maxW="640px" mx="auto" py="10" px="4">
      <Heading size="2xl">Foundations of Leadership</Heading>
      <Text color="fg.muted">
        Five modules. Speak your answers — the tutor listens and responds.
      </Text>

      <LanguagePicker />

      {modules.map((m) => {
        const unlocked = isUnlocked(m.order);
        const done = progress.completedModules.includes(m.id);

        return (
          <Button
            key={m.id}
            onClick={() => unlocked && onOpen(m.id)}
            disabled={!unlocked}
            variant="outline"
            height="auto"
            py="4"
            px="5"
            justifyContent="flex-start"
            textAlign="left"
          >
            <Box>
              <Stack direction="row" align="center" gap="2">
                <Text fontWeight="bold">
                  {m.order}. {m.title}
                </Text>
                {done && <Badge colorPalette="green">Complete</Badge>}
                {!unlocked && <Lock size={14} aria-label="locked" />}
              </Stack>
              <Text fontSize="sm" color="fg.muted" whiteSpace="normal">
                {m.premise} · {m.lessonCount} lessons
              </Text>
            </Box>
          </Button>
        );
      })}
    </Stack>
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/components/ModuleMap.test.tsx`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/components/ModuleMap.tsx src/components/ModuleMap.test.tsx
git commit -m "feat: add module map with linear unlock"
```

---

## Task 12: The session view

**Files:**
- Create: `src/components/SessionView.tsx`
- Test: `src/components/SessionView.test.tsx`

**Interfaces:**
- Consumes: `useVoiceSession`, `useProgress`, `useLanguage`, `LanguagePicker`
- Produces: `<SessionView moduleId={string} onExit={() => void} />`

- [ ] **Step 1: Write the failing test**

`src/components/SessionView.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionView } from "./SessionView";
import { Provider } from "./ui/provider";
import type { Turn } from "../../shared/types";

const session = {
  status: "idle" as const,
  transcript: [] as Turn[],
  state: null,
  moduleComplete: false,
  error: null as string | null,
  start: vi.fn().mockResolvedValue(undefined),
  startRecording: vi.fn().mockResolvedValue(undefined),
  stopRecording: vi.fn(),
  sendText: vi.fn().mockResolvedValue(undefined),
  dismissError: vi.fn(),
};

vi.mock("../hooks/useVoiceSession", () => ({
  useVoiceSession: () => session,
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(session, { status: "idle", transcript: [], error: null, moduleComplete: false });
});

const renderView = () =>
  render(
    <Provider>
      <SessionView moduleId="01-what-is-leadership" onExit={vi.fn()} />
    </Provider>,
  );

describe("SessionView", () => {
  it("renders both speakers' turns", () => {
    session.transcript = [
      { speaker: "tutor", text: "Who would you follow?", language: "en-IN" },
      { speaker: "learner", text: "My first manager.", language: "en-IN" },
    ];
    renderView();
    expect(screen.getByText("Who would you follow?")).toBeDefined();
    expect(screen.getByText("My first manager.")).toBeDefined();
  });

  it("starts recording when the mic is pressed", async () => {
    renderView();
    await userEvent.click(screen.getByRole("button", { name: /speak/i }));
    expect(session.startRecording).toHaveBeenCalled();
  });

  it("stops recording when pressed again while listening", async () => {
    session.status = "listening";
    renderView();
    await userEvent.click(screen.getByRole("button", { name: /stop/i }));
    expect(session.stopRecording).toHaveBeenCalled();
  });

  it("names the current status so silence is never ambiguous", () => {
    session.status = "thinking";
    renderView();
    expect(screen.getByText(/thinking/i)).toBeDefined();
  });

  it("always offers the text fallback", () => {
    renderView();
    expect(screen.getByPlaceholderText(/type/i)).toBeDefined();
  });

  it("lets the learner switch language mid-lesson", () => {
    renderView();
    expect(screen.getByRole("button", { name: "हिंदी" })).toBeDefined();
    expect(screen.getByRole("button", { name: "English" })).toBeDefined();
  });

  it("sends typed text and clears the box", async () => {
    renderView();
    const box = screen.getByPlaceholderText(/type/i) as HTMLInputElement;
    await userEvent.type(box, "My first manager.{Enter}");
    expect(session.sendText).toHaveBeenCalledWith("My first manager.");
    expect(box.value).toBe("");
  });

  it("does not send empty text", async () => {
    renderView();
    await userEvent.type(screen.getByPlaceholderText(/type/i), "   {Enter}");
    expect(session.sendText).not.toHaveBeenCalled();
  });

  it("shows an error with a way to dismiss it", async () => {
    session.status = "error";
    session.error = "Microphone unavailable.";
    renderView();
    expect(screen.getByText(/microphone unavailable/i)).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(session.dismissError).toHaveBeenCalled();
  });

  it("celebrates module completion", () => {
    session.moduleComplete = true;
    renderView();
    expect(screen.getByText(/module complete/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/components/SessionView.test.tsx`
Expected: FAIL — cannot resolve `./SessionView`

- [ ] **Step 3: Implement the session view**

`src/components/SessionView.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Badge, Box, Button, Input, Stack, Text } from "@chakra-ui/react";
import { Mic, Square } from "lucide-react";
import { useVoiceSession } from "../hooks/useVoiceSession";
import { useProgress } from "../hooks/useProgress";
import { useLanguage } from "../hooks/useLanguage";
import { LanguagePicker } from "./LanguagePicker";

const STATUS_LABEL = {
  idle: "Ready",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  error: "Something went wrong",
} as const;

export function SessionView({
  moduleId,
  onExit,
}: {
  moduleId: string;
  onExit: () => void;
}) {
  const { language } = useLanguage();
  const session = useVoiceSession(moduleId, language);
  const { recordPosition, completeModule } = useProgress();
  const [typed, setTyped] = useState("");

  useEffect(() => {
    void session.start();
    // Starting the session is a one-time effect for this module.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId]);

  useEffect(() => {
    if (session.state) recordPosition(session.state);
  }, [session.state, recordPosition]);

  useEffect(() => {
    if (session.moduleComplete) completeModule(moduleId);
  }, [session.moduleComplete, moduleId, completeModule]);

  const submitTyped = () => {
    const text = typed.trim();
    if (text === "") return;
    setTyped("");
    void session.sendText(text);
  };

  const listening = session.status === "listening";
  const busy = session.status === "thinking" || session.status === "speaking";

  return (
    <Stack gap="4" maxW="640px" mx="auto" py="8" px="4" minH="100dvh">
      <Stack direction="row" justify="space-between" align="center">
        <Button variant="ghost" size="sm" onClick={onExit}>
          ← All modules
        </Button>
        <Stack direction="row" align="center" gap="3">
          <LanguagePicker compact />
          <Badge>{STATUS_LABEL[session.status]}</Badge>
        </Stack>
      </Stack>

      {session.error && (
        <Box borderWidth="1px" borderRadius="md" p="3" borderColor="red.400">
          <Text mb="2">{session.error}</Text>
          <Button size="sm" onClick={session.dismissError}>
            Dismiss
          </Button>
        </Box>
      )}

      {session.moduleComplete && (
        <Box borderWidth="1px" borderRadius="md" p="3" borderColor="green.400">
          <Text fontWeight="bold">Module complete</Text>
          <Text fontSize="sm">The next module is now unlocked.</Text>
        </Box>
      )}

      <Stack gap="3" flex="1">
        {session.transcript.map((turn, i) => (
          <Box
            key={i}
            alignSelf={turn.speaker === "learner" ? "flex-end" : "flex-start"}
            bg={turn.speaker === "learner" ? "gray.emphasized" : "bg.subtle"}
            borderRadius="lg"
            px="4"
            py="2"
            maxW="85%"
          >
            <Text>{turn.text}</Text>
          </Box>
        ))}
      </Stack>

      <Stack gap="2" position="sticky" bottom="0" bg="bg" pt="2" pb="4">
        <Button
          size="lg"
          colorPalette={listening ? "red" : "blue"}
          disabled={busy}
          onClick={() => (listening ? session.stopRecording() : void session.startRecording())}
        >
          {listening ? <Square size={18} /> : <Mic size={18} />}
          {listening ? "Stop" : "Speak"}
        </Button>

        <Input
          placeholder="…or type your answer"
          value={typed}
          disabled={busy}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitTyped()}
        />
      </Stack>
    </Stack>
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/components/SessionView.test.tsx`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/components/SessionView.tsx src/components/SessionView.test.tsx
git commit -m "feat: add session view with transcript, mic and text fallback"
```

---

## Task 13: Wire the app together and run a live voice session

**Files:**
- Create: `index.html`, `src/main.tsx`, `src/App.tsx`, `README.md`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: `ModuleMap`, `SessionView`, `Provider`
- Produces: the running application

- [ ] **Step 1: Write the failing test**

`src/App.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";

vi.mock("./components/SessionView", () => ({
  SessionView: ({ moduleId, onExit }: { moduleId: string; onExit: () => void }) => (
    <div>
      <span>session: {moduleId}</span>
      <button onClick={onExit}>back</button>
    </div>
  ),
}));

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "01-what-is-leadership",
          order: 1,
          title: "What is leadership",
          premise: "P",
          lessonCount: 3,
        },
      ],
    }),
  );
});

describe("App", () => {
  it("shows the module map first", async () => {
    render(<App />);
    expect(await screen.findByText("Foundations of Leadership")).toBeDefined();
  });

  it("enters a session when a module is opened", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /what is leadership/i }));
    expect(screen.getByText("session: 01-what-is-leadership")).toBeDefined();
  });

  it("returns to the module map on exit", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /what is leadership/i }));
    await userEvent.click(screen.getByRole("button", { name: "back" }));
    expect(await screen.findByText("Foundations of Leadership")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — cannot resolve `./App`

- [ ] **Step 3: Implement the shell**

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI Leadership Tutor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/App.tsx`:

```tsx
import { useState } from "react";
import { Provider } from "./components/ui/provider";
import { ModuleMap } from "./components/ModuleMap";
import { SessionView } from "./components/SessionView";

export function App() {
  const [openModuleId, setOpenModuleId] = useState<string | null>(null);

  return (
    <Provider>
      {openModuleId ? (
        <SessionView moduleId={openModuleId} onExit={() => setOpenModuleId(null)} />
      ) : (
        <ModuleMap onOpen={setOpenModuleId} />
      )}
    </Provider>
  );
}
```

`src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS, 3 tests

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS. Every test from Tasks 1–13, no failures, no skips.

- [ ] **Step 6: Supply the API keys**

```bash
cp .env.example .env
```

Fill in `SARVAM_API_KEY` and `OPENROUTER_API_KEY`. Confirm `.env` is gitignored:

```bash
git check-ignore .env && echo "ignored — good"
```

- [ ] **Step 7: Run a live English session**

```bash
npm run dev
```

Open the app, start Module 1, and complete lesson 1.1 by voice. Verify:
- The tutor speaks first, without being prompted.
- Speech is transcribed accurately enough to work with.
- The tutor stays on its current step and does not run ahead into later material.
- Answering vaguely keeps you on the step; answering the question moves you forward.
- Every wait has a visible status — no unexplained silence.

- [ ] **Step 8: Run a live Hindi session**

Reset progress in the browser console with
`localStorage.removeItem("ai-leadership-tutor:progress")` and reload. On the module map,
choose **हिंदी**, then start Module 1. Verify:
- The tutor's very first words are in Hindi, in a Hindi voice — the choice applies before
  the learner has said anything.
- Answering in Hindi is transcribed correctly.
- One Hinglish sentence ("मेरा first manager बहुत supportive थे") is handled rather than
  mangled — this is what `codemix` mode is for.
- Reloading the page keeps हिंदी selected.

- [ ] **Step 8b: Verify the choice governs, and switching works**

- With **English** selected, answer one question in Hindi. The tutor must keep teaching in
  English — a single spoken sentence does not hijack the course.
- Mid-lesson, switch the picker to **हिंदी**. The next tutor reply must be in Hindi, and
  the lesson must continue from the same step rather than restarting.

- [ ] **Step 9: Verify the failure paths by hand**

- Deny microphone permission → an explicit message appears and typing still works.
- Break `SARVAM_API_KEY` in `.env`, restart, send a turn → an error appears and the session
  is recoverable after fixing the key.
- Break only the TTS path (set an invalid speaker in `server/speech/tts.ts`) → the tutor's
  words still appear on screen and the lesson continues.

- [ ] **Step 10: Write the README**

`README.md` must contain: what the app is, the prerequisites (Node 20.6+, a Sarvam key, an
OpenRouter key), setup (`npm install`, `cp .env.example .env`, fill keys), how to run
(`npm run dev`), how to test (`npm test`), and a short architecture note explaining that
the lesson engine owns advancement while the model handles conversation. Add a line
crediting Admired Leadership as a structural inspiration and Randall Stutman for the
three-leader-types framing, stating that all lesson text is original.

- [ ] **Step 11: Commit**

```bash
git add index.html src/main.tsx src/App.tsx src/App.test.tsx README.md
git commit -m "feat: wire app shell and document setup

Phase 1 complete: Module 1 runs end to end by voice in English and Hindi."
```

---

## Definition of done

Phase 1 is complete when every box above is ticked and:

1. `npm test` passes with no skips.
2. A learner completes Module 1's three lessons by voice, in English.
3. Choosing हिंदी teaches the whole module in Hindi, in a Hindi voice, and the choice
   survives a reload. Switching mid-lesson takes effect on the next turn without losing
   position.
4. Closing and reopening the browser resumes at the same position.
5. Denying the mic, killing STT, or killing TTS each leave the session usable.
6. `git status` shows no `.env` and no keys anywhere in the history.

## What Phase 2 will need

Do not build these now. Note them if the work suggests changes:

- Modules 2–5 authored to Module 1's depth (fifteen more lessons).
- Whether `doneWhen` prose alone produces reliable completion judgments, or whether steps
  need few-shot examples. Module 1 is the experiment that answers this.
- Whether `maxTurns` values are right. Watch where learners get stuck.
- Module 5 needs the spoken commitment captured and shown back — the only feature Phase 2
  adds beyond content.
