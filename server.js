const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and serve static files
app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// Use system temp directory for Vercel compatibility
const tempDir = os.tmpdir();
const outputDir = path.join(tempDir, 'output');

// Ensure directories exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Configure multer for file uploads - use temp directory
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(tempDir, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit for Vercel
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/gif') {
      cb(null, true);
    } else {
      cb(new Error('Only GIF files are allowed!'), false);
    }
  }
});

// Convert single file endpoint - SIMPLIFIED FOR VERCEL
app.post('/convert', upload.single('gif'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const inputPath = req.file.path;
  const outputFormat = req.body.format || 'webp';
  const quality = parseInt(req.body.quality) || 80;
  const resize = parseInt(req.body.resize) || 100;
  
  const outputName = path.parse(req.file.originalname).name + 
    (outputFormat === 'webp' ? '.webp' : '.png');
  const outputPath = path.join(outputDir, Date.now() + '-' + outputName);

  console.log(`Converting ${req.file.originalname} to ${outputFormat}...`);

  try {
    await new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath);
      let videoFilters = [];
      
      // Quality-based framerate reduction for both formats
      if (quality < 30) {
        videoFilters.push('fps=4');
      } else if (quality < 50) {
        videoFilters.push('fps=6');
      } else if (quality < 70) {
        videoFilters.push('fps=8');
      } else if (quality < 90) {
        videoFilters.push('fps=10');
      } else {
        videoFilters.push('fps=12');
      }
      
      if (resize !== 100) {
        videoFilters.push(`scale=iw*${resize/100}:ih*${resize/100}`);
      }
      
      if (videoFilters.length > 0) {
        command = command.videoFilters(videoFilters);
      }

      if (outputFormat === 'webp') {
        // Convert to WebP using FFmpeg (no img2webp needed)
        command
          .outputOptions([
            '-f webp',
            '-loop 0',
            '-compression_level 6',
            '-quality ' + quality,
            '-an'
          ])
          .save(outputPath);
      } else {
        // Convert to APNG
        command
          .outputOptions([
            '-f apng',
            '-plays 0',
            '-compression_level 9',
            '-an'
          ])
          .save(outputPath);
      }

      command
        .on('progress', (progress) => {
          console.log(`Processing: ${Math.round(progress.percent || 0)}% done`);
        })
        .on('end', () => {
          console.log(`${outputFormat.toUpperCase()} conversion completed!`);
          
          const originalSize = fs.statSync(inputPath).size;
          const outputSize = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
          console.log(`${originalSize} bytes -> ${outputSize} bytes (${Math.round((outputSize/originalSize)*100)}% of original)`);
          
          resolve();
        })
        .on('error', (err) => {
          console.error(`${outputFormat.toUpperCase()} conversion error:`, err);
          reject(err);
        });
    });
    
    console.log(`${outputFormat.toUpperCase()} conversion completed successfully!`);
    
    if (!fs.existsSync(outputPath)) {
      throw new Error('Output file was not created');
    }
    
    const outputSize = fs.statSync(outputPath).size;
    console.log(`Output file size: ${(outputSize / 1024 / 1024).toFixed(2)} MB`);
    
    res.download(outputPath, outputName, (err) => {
      // Cleanup files
      setTimeout(() => {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      }, 60000);
    });
    
  } catch (error) {
    console.error(`${outputFormat.toUpperCase()} conversion failed:`, error);
    res.status(500).json({ error: `${outputFormat.toUpperCase()} conversion failed: ` + error.message });
    
    // Cleanup on error
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
});

// Batch convert endpoint - SIMPLIFIED
app.post('/convert-batch', upload.array('gifs', 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const outputFormat = req.body.format || 'webp';
  const quality = parseInt(req.body.quality) || 80;
  const resize = parseInt(req.body.resize) || 100;
  
  console.log(`Starting batch conversion of ${req.files.length} files...`);

  try {
    const convertedFiles = [];
    
    for (const file of req.files) {
      const outputName = path.parse(file.originalname).name + 
        (outputFormat === 'webp' ? '.webp' : '.png');
      const outputPath = path.join(outputDir, Date.now() + '-' + outputName);
      
      await new Promise((resolve, reject) => {
        let command = ffmpeg(file.path);
        let videoFilters = [];
        
        if (quality < 30) {
          videoFilters.push('fps=4');
        } else if (quality < 50) {
          videoFilters.push('fps=6');
        } else if (quality < 70) {
          videoFilters.push('fps=8');
        } else if (quality < 90) {
          videoFilters.push('fps=10');
        } else {
          videoFilters.push('fps=12');
        }
        
        if (resize !== 100) {
          videoFilters.push(`scale=iw*${resize/100}:ih*${resize/100}`);
        }
        
        if (videoFilters.length > 0) {
          command = command.videoFilters(videoFilters);
        }

        if (outputFormat === 'webp') {
          command.outputOptions(['-f webp', '-loop 0', '-compression_level 6', '-quality ' + quality, '-an']);
        } else {
          command.outputOptions(['-f apng', '-plays 0', '-compression_level 9', '-an']);
        }

        command
          .save(outputPath)
          .on('end', () => {
            convertedFiles.push({ name: outputName, path: outputPath });
            fs.unlinkSync(file.path);
            resolve();
          })
          .on('error', reject);
      });
    }

    // Create ZIP file
    const JSZip = require('jszip');
    const zip = new JSZip();
    
    for (const file of convertedFiles) {
      const data = fs.readFileSync(file.path);
      zip.file(file.name, data);
      fs.unlinkSync(file.path);
    }
    
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    const zipPath = path.join(outputDir, `converted-${Date.now()}.zip`);
    fs.writeFileSync(zipPath, zipBuffer);
    
    res.download(zipPath, 'converted-files.zip', () => {
      fs.unlinkSync(zipPath);
    });

  } catch (error) {
    console.error('Batch conversion error:', error);
    res.status(500).json({ error: 'Batch conversion failed: ' + error.message });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint for Vercel
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 GIF Converter server running at http://localhost:${PORT}`);
  console.log('📁 Upload your GIF files to convert them to WebP or APNG!');
});

// Export for Vercel
module.exports = app;
