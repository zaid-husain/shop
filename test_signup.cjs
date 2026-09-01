const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://zcvvqhytlsheuhbbsceb.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjdnZxaHl0bHNoZXVoYmJzY2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4NjE1OTIsImV4cCI6MjA5OTQzNzU5Mn0.BW7QYZlemVJJjW32U8phJ75y3NuUJZezzxqzCc1eFZs",
);

async function test() {
  const email = "bap-9309938127@bharatautoparts.app";
  const password = "bap_123456_8127";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: "Test Owner",
        phone: "9309938127",
        join_code: "BAPTESTX",
      },
    },
  });

  console.log("Result:", error || "Success");
}

test();
