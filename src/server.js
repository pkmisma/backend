const createApp = require("./app");

const port = process.env.PORT || 3000;
const server = createApp().listen(port, () =>
  console.log(`cosmic-facts-backend listening on :${port}`)
);

process.on("SIGTERM", () => server.close(() => process.exit(0)));
