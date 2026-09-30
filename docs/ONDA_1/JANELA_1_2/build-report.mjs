import { buildPortableArtifact } from "file:///C:/Users/ADMIN/.codex/plugins/cache/openai-curated-remote/data-analytics/0.2.8-13ceeea1f599/skills/build-report/scripts/build_portable_artifact.mjs";
import { deliverPortableArtifact } from "file:///C:/Users/ADMIN/.codex/plugins/cache/openai-curated-remote/data-analytics/0.2.8-13ceeea1f599/skills/build-report/scripts/deliver_portable_artifact.mjs";

// The packaged reader uses 100vw for its sticky header. On Windows Chromium,
// a classic vertical scrollbar makes 100vw wider than the document client area.
const overflowCompatibilityStyle = [
  "<style data-olli-portable-overflow-fix>",
  ".analytics-top-bar,.portable-page-header{width:100%!important;margin-left:0!important;margin-right:0!important}",
  "</style>",
].join("");

function buildWithOverflowCompatibility(input, options) {
  return buildPortableArtifact(input, options).replace(
    "</head>",
    `${overflowCompatibilityStyle}</head>`,
  );
}

const result = await deliverPortableArtifact(
  { inputPath: "artifact.json", outputPath: "report.html" },
  { build: buildWithOverflowCompatibility },
);

console.log(JSON.stringify(result));
