const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "..", "public", "sounds");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Helper to write a basic RIFF WAV file
function writeWav(filename, samples, sampleRate = 44100) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * blockAlign;
  const chunkSize = 36 + dataSize;

  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF chunk descriptor
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(chunkSize, 4);
  buffer.write("WAVE", 8);

  // fmt sub-chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    // 16-bit PCM
    const val = Math.max(-32768, Math.min(32767, Math.floor(samples[i] * 32767)));
    buffer.writeInt16LE(val, 44 + i * 2);
  }

  fs.writeFileSync(path.join(outDir, filename), buffer);
}

// Generate simple tones
function generateTone(frequency, durationMs, type = "sine", volume = 0.5) {
  const sampleRate = 44100;
  const length = Math.floor((sampleRate * durationMs) / 1000);
  const samples = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    let val = 0;

    if (type === "sine") {
      val = Math.sin(2 * Math.PI * frequency * t);
    } else if (type === "square") {
      val = Math.sign(Math.sin(2 * Math.PI * frequency * t));
    } else if (type === "triangle") {
      val = 2 * Math.abs(2 * (t * frequency - Math.floor(t * frequency + 0.5))) - 1;
    }

    // Envelope to avoid clicking (attack/release)
    let env = 1;
    const attackSamples = Math.min(length * 0.1, 400);
    const releaseSamples = Math.min(length * 0.3, 1000);

    if (i < attackSamples) env = i / attackSamples;
    else if (i > length - releaseSamples) env = (length - i) / releaseSamples;

    samples[i] = val * volume * env;
  }
  return samples;
}

function concat(...arrays) {
  let totalLength = 0;
  for (const arr of arrays) totalLength += arr.length;
  const result = new Float32Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// 1. Payment: soft ka-ching (two quick high notes)
const payment = concat(generateTone(1200, 50, "sine", 0.6), generateTone(1600, 150, "sine", 0.6));
writeWav("payment.mp3", payment); // save as mp3 extension just to match names

// 2. Success: clean two-note
const success = concat(generateTone(800, 100, "sine", 0.5), generateTone(1200, 150, "sine", 0.5));
writeWav("success.mp3", success);

// 3. Sale: short positive
const sale = concat(generateTone(1000, 80, "sine", 0.5), generateTone(1500, 120, "sine", 0.5));
writeWav("sale.mp3", sale);

// 4. Stock: soft inventory
const stock = generateTone(700, 150, "triangle", 0.4);
writeWav("stock.mp3", stock);

// 5. Notification: single chime
const notification = generateTone(1000, 200, "sine", 0.4);
writeWav("notification.mp3", notification);

// 6. Warning: muted double tone
const warning = concat(
  generateTone(400, 100, "triangle", 0.4),
  generateTone(400, 150, "triangle", 0.4),
);
writeWav("warning.mp3", warning);

// 7. Error: low confirmation
const error = generateTone(300, 200, "triangle", 0.5);
writeWav("error.mp3", error);

// 8. Completion: task completion
const completion = concat(
  generateTone(800, 100, "sine", 0.5),
  generateTone(1000, 100, "sine", 0.5),
  generateTone(1200, 150, "sine", 0.5),
);
writeWav("completion.mp3", completion);

console.log("Sounds generated successfully in public/sounds/");
