import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { chatModelTier, FastQualityToggle } from "./FastQualityToggle";

describe("FastQualityToggle", () => {
  it("renders both tiers and marks the active one", () => {
    render(<FastQualityToggle value="fast" onChange={() => undefined} />);

    expect(screen.getByRole("group", { name: "Answer quality" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fast" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Quality" })).toHaveAttribute("aria-pressed", "false");
  });

  it("reports a switch to the other tier", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<FastQualityToggle value="fast" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Quality" }));

    expect(onChange).toHaveBeenCalledWith("quality");
  });

  it("reflects the quality tier when selected", () => {
    render(<FastQualityToggle value="quality" onChange={() => undefined} />);

    expect(screen.getByRole("button", { name: "Quality" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Fast" })).toHaveAttribute("aria-pressed", "false");
  });


  it("reports unavailable quality without switching tiers", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onQualityUnavailable = vi.fn();

    render(
      <FastQualityToggle
        value="fast"
        onChange={onChange}
        qualityAvailable={false}
        onQualityUnavailable={onQualityUnavailable}
      />
    );
    await user.click(screen.getByRole("button", { name: "Quality" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(onQualityUnavailable).toHaveBeenCalledOnce();
  });
  it("maps stored chat models to a tier with fast as the fallback", () => {
    expect(chatModelTier("quality")).toBe("quality");
    expect(chatModelTier("fast")).toBe("fast");
    expect(chatModelTier("gpt-4.1")).toBe("fast");
    expect(chatModelTier(null)).toBe("fast");
  });
});
