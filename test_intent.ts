import { generateObject } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { z } from "zod";

async function run() {
  const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });

  const queries = [
    "kya tum mujhe break ki price bata sakte ho",
    "brake ka rate kya hai",
    "break pad kitne ka hai",
    "engine oill ka price batao",
    "oil kitne ka h",
    "mujhe oil ka rate bta",
    "break stock me hai kya",
    "cluch plate kitne ki hai",
    "clutch plet available hai?",
    "air filtar ka kya rate hai",
    "mere pass headlite stock me hai kya",
    "2 oil kitne ke honge",
    "teen brake pad ka total kitna hoga",
    "hello",
    "how to make a bill",
  ];

  for (const query of queries) {
    const result = await generateObject({
      model: groq("llama-3.3-70b-versatile"),
      schema: z.object({
        intent: z.enum(["PRODUCT_PRICE_STOCK", "OTHER"]),
        extracted_product_name: z
          .string()
          .nullable()
          .describe(
            "The clean, normalized product name without filler words or conversational text. Fix typos.",
          ),
        quantity: z
          .number()
          .nullable()
          .describe("The numeric quantity requested, if any (e.g. 1, 2, 3)"),
      }),
      prompt: `Analyze the user query: "${query}". 
Determine if they are asking for the price, stock, or availability of a product. 
If so, set intent to PRODUCT_PRICE_STOCK, extract the core product name (fix typos if obvious, like 'break' -> 'brake'), and extract the numeric quantity if mentioned (e.g. '2 oil' -> 2, 'teen brake pad' -> 3, 'ek' -> 1).
If not, set intent to OTHER.`,
    });
    console.log(`Query: "${query}"`);
    console.log(JSON.stringify(result.object, null, 2));
    console.log("-------------------");
  }
}

run().catch(console.error);
