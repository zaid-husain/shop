import fs from "fs";

async function fetchOpenApi() {
  const url =
    "https://zcvvqhytlsheuhbbsceb.supabase.co/rest/v1/?apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjdnZxaHl0bHNoZXVoYmJzY2ViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mzg2MTU5MiwiZXhwIjoyMDk5NDM3NTkyfQ.A2WzS4r5YxvIP6quzHWNQA8uty0Fkgoat9kHu7fIakc";
  try {
    const res = await fetch(url);
    const data = await res.json();
    fs.writeFileSync("openapi.json", JSON.stringify(data, null, 2));
    console.log("OpenAPI spec saved to openapi.json");
    process.exit(0);
  } catch (error) {
    console.error("Failed to fetch OpenAPI spec:", error);
    process.exit(1);
  }
}

fetchOpenApi();
