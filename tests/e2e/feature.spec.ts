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
