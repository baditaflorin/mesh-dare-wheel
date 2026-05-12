import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-dare-wheel",
  description:
    "Fair group wheel-spin via commit-reveal — everyone sees the same result, no one can rig it",
  accentHex: "#ffa45e",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
