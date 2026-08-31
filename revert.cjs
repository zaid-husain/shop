const fs = require("fs");
let content = fs.readFileSync("src/lib/ai/query-executor.ts", "utf8");

// Undo the naive replacement
content = content.replace(
  /intent: (\".+?\") as any, action: \"UNKNOWN\" as any, entityType: \"unknown\" as any, entityId: null, entityName: null, status: \"PENDING_CONFIRMATION\" as any, createdAt: Date\.now\(\), id: crypto\.randomUUID\(\)(,)?/g,
  "type: $1$2",
);

content = content.replace(
  /intent: (\".+?\") as any, action: \"UNKNOWN\" as any, entityType: \"unknown\" as any, entityId: null, entityName: null, status: \"PENDING_CONFIRMATION\" as any, id: crypto\.randomUUID\(\)(,)?/g,
  "type: $1$2",
);

// Same for the type: type replacement
content = content.replace(
  /intent: type as any, action: \"UNKNOWN\" as any, entityType: \"unknown\" as any, entityId: null, entityName: null, status: \"PENDING_CONFIRMATION\" as any, createdAt: Date\.now\(\), id: crypto\.randomUUID\(\)(,)?/g,
  "type: type$1",
);

content = content.replace(
  /intent: type as any, action: \"UNKNOWN\" as any, entityType: \"unknown\" as any, entityId: null, entityName: null, status: \"PENDING_CONFIRMATION\" as any, id: crypto\.randomUUID\(\)(,)?/g,
  "type: type$1",
);

// Same for the isReduction replacement
content = content.replace(
  /intent: (isReduction \? \".+?\" : \".+?\") as any, action: \"UNKNOWN\" as any, entityType: \"unknown\" as any, entityId: null, entityName: null, status: \"PENDING_CONFIRMATION\" as any, createdAt: Date\.now\(\), id: crypto\.randomUUID\(\)(,)?/g,
  "type: $1$2",
);

content = content.replace(
  /intent: (isReduction \? \".+?\" : \".+?\") as any, action: \"UNKNOWN\" as any, entityType: \"unknown\" as any, entityId: null, entityName: null, status: \"PENDING_CONFIRMATION\" as any, id: crypto\.randomUUID\(\)(,)?/g,
  "type: $1$2",
);

fs.writeFileSync("src/lib/ai/query-executor.ts", content);
console.log("Reverted naive regex.");
