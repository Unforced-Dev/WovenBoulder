/** Decisions & Votes hoisting from AI-summary markdown. */
import { describe, expect, it } from "vitest";
import { splitDecisions } from "../lib/decisions.ts";

describe("splitDecisions", () => {
  it("hoists a '### Decisions & Votes' section and removes it from the rest", () => {
    const summary = [
      "### Overview",
      "Council met.",
      "",
      "### Decisions & Votes",
      "- Adopted the linkage fee 7-2.",
      "- Continued the ADU item.",
      "",
      "### Public Comment",
      "Many speakers.",
    ].join("\n");

    const { decisions, heading, rest } = splitDecisions(summary);
    expect(heading).toBe("Decisions & Votes");
    expect(decisions).toContain("linkage fee 7-2");
    expect(decisions).not.toContain("Public Comment");
    expect(rest).toContain("Council met.");
    expect(rest).toContain("Many speakers.");
    expect(rest).not.toContain("linkage fee 7-2");
  });

  it("matches vote/motion heading variants", () => {
    const summary = "## Key Votes\nMotion carried 9-0.\n\n## Next Steps\nStaff returns.";
    const { decisions, heading } = splitDecisions(summary);
    expect(heading).toBe("Key Votes");
    expect(decisions).toBe("Motion carried 9-0.");
  });

  it("returns the summary unchanged when no decisions heading exists", () => {
    const summary = "### Overview\nA study session, no votes taken.";
    const { decisions, heading, rest } = splitDecisions(summary);
    expect(decisions).toBeNull();
    expect(heading).toBeNull();
    expect(rest).toBe(summary);
  });

  it("an empty decisions section falls back to no-callout", () => {
    const summary = "### Decisions\n\n### Overview\nNothing was decided.";
    const { decisions, rest } = splitDecisions(summary);
    expect(decisions).toBeNull();
    expect(rest).toBe(summary);
  });
});
