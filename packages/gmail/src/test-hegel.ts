import type { Settings, TestCase } from "@hegeldev/hegel";

const DEFAULT_PBT_TEST_CASES = 40;
const MIN_PBT_TEST_CASES = 5;

type NoteValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<NoteValue>
  | { readonly [key: string]: NoteValue | undefined };

const readPbtTestCases = () => {
  const raw = process.env.PBT_TEST_CASES;

  if (raw === undefined) {
    return DEFAULT_PBT_TEST_CASES;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed)) {
    return MIN_PBT_TEST_CASES;
  }

  return Math.max(MIN_PBT_TEST_CASES, Math.trunc(parsed));
};

export const hegelSettings = {
  testCases: readPbtTestCases(),
} satisfies Partial<Settings>;

export const notePbtCase = (
  tc: TestCase,
  propertySlug: string,
  details: Record<string, NoteValue>,
) => {
  tc.note(
    JSON.stringify(
      {
        propertySlug,
        ...details,
      },
      null,
      2,
    ),
  );
};
