const express = require("express");
const facts = require("./facts");

function createApp() {
  const app = express();
  const likes = new Map(facts.map((f) => [f.id, 0]));
  const withLikes = (f) => ({ ...f, likes: likes.get(f.id) });

  app.use(express.json());

  // Liveness / readiness probe
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

  app.get("/api/info", (_req, res) =>
    res.json({
      service: "cosmic-facts-backend",
      version: process.env.APP_VERSION || "dev",
      environment: process.env.APP_ENV || "local",
      pod: process.env.HOSTNAME || "local",
    })
  );

  app.get("/api/facts", (_req, res) => res.json(facts.map(withLikes)));

  app.get("/api/facts/random", (_req, res) => {
    const fact = facts[Math.floor(Math.random() * facts.length)];
    res.json(withLikes(fact));
  });

  app.post("/api/facts/:id/like", (req, res) => {
    const id = Number(req.params.id);
    if (!likes.has(id)) return res.status(404).json({ error: "fact not found" });
    likes.set(id, likes.get(id) + 1);
    res.json(withLikes(facts.find((f) => f.id === id)));
  });

  return app;
}

module.exports = createApp;
