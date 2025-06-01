import express from "express";
import cors from "cors";
import ytdl from "@distube/ytdl-core";
import fs from "fs";
import path from "path";
import rateLimit from "express-rate-limit";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { CronJob } from "cron";
import ytDlp from "yt-dlp-exec";  // Import yt-dlp-exec

dotenv.config();

// Define __filename and __dirname manually for ES module support
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);

// Serve /tmp directory where MP3s are saved
app.use("/downloads", express.static("/tmp"));

// reCAPTCHA verification
async function verifyRecaptcha(token) {
  const response = await fetch(
    `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${token}`,
    { method: "POST" }
  );
  const data = await response.json();
  console.log("reCAPTCHA response from Google:", data);
  return data.success;
}

// Download and convert route
app.post("/convert", async (req, res) => {
  const { url, recaptchaToken } = req.body;

  if (!ytdl.validateURL(url)) {
    return res.status(400).json({ error: "Invalid YouTube URL" });
  }

  const isHuman = await verifyRecaptcha(recaptchaToken);
  if (!isHuman) {
    return res.status(403).json({ error: "reCAPTCHA verification failed" });
  }

  try {
    const videoId = ytdl.getURLVideoID(url);
    const outputFileName = `output-${videoId}.mp3`;
    const outputPath = path.join("/tmp", outputFileName); // /tmp for Render

    // Use yt-dlp-exec programmatically
    await ytDlp(url, {
      extractAudio: true,
      audioFormat: "mp3",
      output: outputPath,
      ffmpegLocation: "ffmpeg", // assumes ffmpeg is in PATH
    });

    const downloadUrl = `https://youty-back.onrender.com/downloads/${outputFileName}`;
    return res.json({ downloadUrl });
  } catch (error) {
    console.error("Error converting video:", error);
    return res.status(500).json({ error: "Conversion failed" });
  }
});

// Cron job to clean up /tmp every hour
const cleanupJob = new CronJob("0 * * * *", () => {
  fs.readdir("/tmp", (err, files) => {
    if (err) return console.error("Failed to read /tmp:", err);

    files
      .filter((file) => file.endsWith(".mp3"))
      .forEach((file) => {
        const filePath = path.join("/tmp", file);
        fs.unlink(filePath, (err) => {
          if (err) console.error("Error deleting:", filePath);
          else console.log("Deleted file:", filePath);
        });
      });
  });
});
cleanupJob.start();

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
