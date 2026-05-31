import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

test("seed dares are present and shared between peers", async ({ browser, baseURL }) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await expect(a.locator(".dw-options").getByText(/push-ups/i)).toBeVisible();
    await expect(b.locator(".dw-options").getByText(/push-ups/i)).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("adding a dare on A appears on B", async ({ browser, baseURL }) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("add a dare…").fill("speak in a foreign accent");
    await a.getByRole("button", { name: "add" }).click();
    await expect(b.locator(".dw-options").getByText("speak in a foreign accent")).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("spin button enters commit phase visible on both peers", async ({ browser, baseURL }) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByRole("button", { name: /SPIN/i }).click();
    await expect(a.getByText(/committing entropy/i)).toBeVisible();
    await expect(b.getByText(/committing entropy/i)).toBeVisible();
  } finally {
    await cleanup();
  }
});

// The headline claim is "fair group wheel-spin via commit-reveal — everyone
// sees the SAME result". This drives the full commit→reveal→done flow with two
// peers and asserts BOTH land on the exact same dare. It fails on any code that
// computes the result from a non-shared seed (e.g. a local RNG), or that only
// shows the result on the spinning peer.
test("a full commit-reveal spin yields the IDENTICAL result on both peers", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    // Both peers must be registered as players before A spins; wait until A's
    // status line counts 2 players (B's playersMap.setMy has propagated).
    await expect(a.locator(".dw-status")).toContainText("2 players");
    await expect(b.locator(".dw-status")).toContainText("2 players");

    // A spins → both enter commit. Each peer auto-commits its salt.
    await a.getByRole("button", { name: /SPIN/i }).click();
    await expect(a.getByText(/committing entropy/i)).toBeVisible();
    await expect(b.getByText(/committing entropy/i)).toBeVisible();

    // Wait until both salts are sealed (2/2), then advance to reveal.
    await expect(a.locator(".dw-card .dw-help")).toContainText("2/2 sealed");
    await a.getByRole("button", { name: /all sealed → reveal/i }).click();

    // The shared, deterministic result must render on BOTH peers…
    await expect(a.locator(".dw-result-big")).toBeVisible();
    await expect(b.locator(".dw-result-big")).toBeVisible();

    // …and be byte-for-byte identical. This is the cross-peer fairness proof.
    const resultA = (await a.locator(".dw-result-big").textContent())?.trim();
    const resultB = (await b.locator(".dw-result-big").textContent())?.trim();
    expect(resultA).toBeTruthy();
    expect(resultA).toBe(resultB);
  } finally {
    await cleanup();
  }
});
