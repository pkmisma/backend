const { test } = require("node:test");
const assert = require("node:assert");
const createApp = require("../src/app");

async function withServer(fn) {
  const server = createApp().listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

test("healthz returns ok", () =>
  withServer(async (base) => {
    const res = await fetch(`${base}/healthz`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { status: "ok" });
  }));

test("random fact has title and likes", () =>
  withServer(async (base) => {
    const fact = await (await fetch(`${base}/api/facts/random`)).json();
    assert.ok(fact.title);
    assert.strictEqual(fact.likes, 0);
  }));

test("liking a fact increments, unknown id returns 404", () =>
  withServer(async (base) => {
    const liked = await (await fetch(`${base}/api/facts/1/like`, { method: "POST" })).json();
    assert.strictEqual(liked.likes, 1);
    const missing = await fetch(`${base}/api/facts/999/like`, { method: "POST" });
    assert.strictEqual(missing.status, 404);
  }));
