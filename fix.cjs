const fs = require("fs");
let content = fs.readFileSync("src/lib/ai/query-executor.ts", "utf8");

// 1. Fix the import
content = content.replace(
  /import type { PendingAction } from "\.\/context-manager";/,
  'import type { AIPendingAction as PendingAction } from "./core/types";',
);

// 2. buildConfirmationRequest
content = content.replace(/type: action\.type,/, "type: action.intent,");
content = content.replace(/payload: action\.payload,/, "payload: action.parameters,");

// 3. pending action creation blocks
let parts = content.split("const action: PendingAction = {");
for (let i = 1; i < parts.length; i++) {
  let blockEndIndex = parts[i].indexOf("};");
  if (blockEndIndex === -1) continue;
  let block = parts[i].substring(0, blockEndIndex);

  let newBlock = block.replace(
    /type:\s*([^,]+),/,
    'intent: $1 as any, action: "UNKNOWN" as any, entityType: "unknown" as any, entityId: null, entityName: null, status: "PENDING_CONFIRMATION" as any, createdAt: Date.now(), id: crypto.randomUUID(),',
  );
  newBlock = newBlock.replace(/payload:/, "parameters:");

  parts[i] = newBlock + parts[i].substring(blockEndIndex);
}
content = parts.join("const action: PendingAction = {");

// 4. executePendingAction
content = content.replace(/switch \(action\.type\)/, "switch (action.intent)");
content = content.replace(/action\.type ===/g, "action.intent ===");
content = content.replace(/action\.payload/g, "action.parameters");

fs.writeFileSync("src/lib/ai/query-executor.ts", content);
console.log("Fixed query-executor.ts safely");
