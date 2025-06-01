import express from "express";
import cors from "cors";
import ytdl from "@distube/ytdl-core";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import rateLimit from "express-rate-limit";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();
import { fileURLToPath } from "url";
import { dirname } from "path";

// Define __filename and __dirname manually for ES module support
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
});
app.use(limiter);

// Serve downloads statically
app.use("/downloads", express.static(__dirname));

// Verify reCAPTCHA
async function verifyRecaptcha(token) {
  const response = await fetch(
    `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${token}`,
    { method: "POST" }
  );
  const data = await response.json();
  console.log("reCAPTCHA response from Google:", data);
  return data.success;
}

// Convert route
app.post("/convert", async (req, res) => {
  const { url, recaptchaToken } = req.body;

  // Validate YouTube URL
  if (!ytdl.validateURL(url)) {
    return res.status(400).json({ error: "Invalid YouTube URL" });
  }

  // Verify reCAPTCHA
  const isHuman = await verifyRecaptcha(recaptchaToken);
  if (!isHuman) {
    return res.status(403).json({ error: "reCAPTCHA verification failed" });
  }

  try {
    const videoId = ytdl.getURLVideoID(url);
    const outputFileName = `output-${videoId}.mp3`;
    const outputPath = path.join(__dirname, outputFileName);

    exec(
      `yt-dlp -x --audio-format mp3 --ffmpeg-location "C:\\Users\\TCS\\Downloads\\ffmpeg-7.1.1-essentials_build\\bin" --output "${outputPath}" ${url}`,
      async (error) => {
        if (error) {
          console.error("Error converting video:", error);
          return res.status(500).json({ error: "Conversion failed" });
        }

        const downloadUrl = `http://localhost:${port}/downloads/${outputFileName}`;
        return res.json({ downloadUrl });
      }
    );
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
