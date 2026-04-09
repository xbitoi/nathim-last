import { Router } from "express";
import multer from "multer";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execFileAsync = promisify(execFile);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

export const videoRouter = Router();

videoRouter.post("/convert", upload.single("video"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No video file provided" });
    return;
  }

  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `input_${Date.now()}.webm`);
  const outputPath = path.join(tmpDir, `output_${Date.now()}.mp4`);

  try {
    fs.writeFileSync(inputPath, req.file.buffer);

    await execFileAsync("ffmpeg", [
      "-y",
      "-i", inputPath,
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-an",
      outputPath,
    ]);

    const mp4Buffer = fs.readFileSync(outputPath);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", 'attachment; filename="yazaki-ai-video.mp4"');
    res.setHeader("Content-Length", mp4Buffer.length);
    res.send(mp4Buffer);
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
});
