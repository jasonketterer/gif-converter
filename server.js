const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');
const os = require('os');

const execAsync = promisify(exec);

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

// Helper function to execute commands with timeout
function execWithTimeout(command, timeoutMs) {
  return new Promise((resolve, reject) => {
    const process = exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
    
    // Set timeout
    const timeout = setTimeout(() => {
      process.kill('SIGKILL');
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
    }, timeoutMs);
    
    // Clear timeout if process completes
    process.on('exit', () => {
      clearTimeout(timeout);
    });
  });
}

// Helper function to convert GIF to WebP - Vercel optimized
async function convertToWebPWithCwebp(inputPath, outputPath, quality, resize) {
  const tempFramesDir = path.join(tempDir, `frames_${Date.now()}`);
  
  try {
    fs.mkdirSync(tempFramesDir, { recursive: true });
  } catch (e) {
    console.error('Could not create temp directory:', e.message);
    throw e;
  }

  try {
    console.log('Extracting GIF frames with aggressive optimization...');
    
    // Step 1: Extract frames with filters
    let ffmpegCommand = `ffmpeg -y -i "${inputPath}"`;
    
    let filters = [];
    filters.push('fps=8'); // Aggressive frame reduction for much smaller files
    
    if (resize !== 100) {
      filters.push(`scale=iw*${resize/100}:ih*${resize/100}`);
    }
    
    ffmpegCommand += ` -vf "${filters.join(',')}"`;
    ffmpegCommand += ` "${path.join(tempFramesDir, 'frame_%04d.png')}"`;
    
    await execWithTimeout(ffmpegCommand, 60000); // Reduced timeout for Vercel
    
    console.log('Frames extracted with optimization, creating WebP...');
    
    // Step 2: Get frame files
    const frameFiles = fs.readdirSync(tempFramesDir)
      .filter(file => file.endsWith('.png'))
      .sort();
    
    if (frameFiles.length === 0) {
      throw new Error('No frames extracted from GIF');
    }
    
    console.log(`Found ${frameFiles.length} optimized frames (reduced from original)`);
    
    // Step 3: Create WebP with img2webp - simplified for Vercel
    const fullFramePaths = frameFiles.map(file => path.join(tempFramesDir, file));
    
    // Show original file size for comparison
    const originalSize = fs.statSync(inputPath).size;
    console.log(`Original GIF size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Extracted ${frameFiles.length} frames at 8fps`);
    
    // Use a simpler approach for Vercel - direct img2webp command
    let webpCommand = `img2webp -lossy -q ${quality} -d 150 -loop 0 -m 4`;
    fullFramePaths.forEach(framePath => {
      webpCommand += ` "${framePath}"`;
    });
    webpCommand += ` -o "${outputPath}"`;
    
    console.log(`Using LOSSY compression with quality ${quality}%`);
    console.log('Creating full animation...');
    
    await execWithTimeout(webpCommand, 180000); // 3 minutes for Vercel
    
    // Check output file size
    if (fs.existsSync(outputPath)) {
      const outputSize = fs.statSync(outputPath).size;
      const inputSize = fs.statSync(inputPath).size;
      console.log(`Conversion complete: ${inputSize} bytes -> ${outputSize} bytes (${Math.round((outputSize/inputSize)*100)}% of original)`);
    }
    
    console.log('WebP created with aggressive compression!');
    return true;
    
  } catch (error) {
    console.error('WebP conversion error:', error);
    throw error;
  } finally {
    // Cleanup with delay
    setTimeout(() => {
      try {
        if (fs.existsSync(tempFramesDir)) {
          const files = fs.readdirSync(tempFramesDir);
          files.forEach(file => {
            try {
              fs.unlinkSync(path.join(tempFramesDir, file));
            } catch (e) {
              // Ignore cleanup errors
            }
          });
          fs.rmdirSync(tempFramesDir);
          console.log('Cleanup completed successfully');
        }
      } catch (e) {
        console.log('Cleanup had some issues but conversion succeeded');
      }
    }, 5000);
  }
}

// Convert single file endpoint
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

  if (outputFormat === 'webp') {
    try {
      await convertToWebPWithCwebp(inputPath, outputPath, quality, resize);
      
      console.log('WebP conversion completed successfully!');
      
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
      console.error('WebP conversion failed:', error);
      res.status(500).json({ error: 'WebP conversion failed: ' + error.message });
      
      // Cleanup on error
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
  } else {
    // Convert to APNG using FFmpeg with quality control
    try {
      await new Promise((resolve, reject) => {
        console.log('Converting to APNG with optimization...');
        
        let command = ffmpeg(inputPath);
        let videoFilters = [];
        
        // Quality-based framerate reduction
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
        
        console.log(`APNG quality=${quality}% - using framerate optimization`);
        
        if (videoFilters.length > 0) {
          command = command.videoFilters(videoFilters);
        }

        command
          .outputOptions([
            '-f apng',
            '-plays 0',
            '-compression_level 9',
            '-an'
          ])
          .save(outputPath)
          .on('progress', (progress) => {
            console.log(`APNG Processing: ${Math.round(progress.percent || 0)}% done`);
          })
          .on('end', () => {
            console.log('APNG conversion completed!');
            
            const originalSize = fs.statSync(inputPath).size;
            const outputSize = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
            console.log(`APNG: ${originalSize} bytes -> ${outputSize} bytes (${Math.round((outputSize/originalSize)*100)}% of original)`);
            
            resolve();
          })
          .on('error', (err) => {
            console.error('APNG conversion error:', err);
            reject(err);
          });
      });
      
      console.log('APNG conversion completed successfully!');
      
      if (!fs.existsSync(outputPath)) {
        throw new Error('APNG output file was not created');
      }
      
      const outputSize = fs.statSync(outputPath).size;
      console.log(`APNG output file size: ${(outputSize / 1024 / 1024).toFixed(2)} MB`);
      
      res.download(outputPath, outputName, (err) => {
        // Cleanup files
        setTimeout(() => {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        }, 60000);
      });
      
    } catch (error) {
      console.error('APNG conversion failed:', error);
      res.status(500).json({ error: 'APNG conversion failed: ' + error.message });
      
      // Cleanup on error
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
  }
});

// Batch convert endpoint
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
      
      if (outputFormat === 'webp') {
        try {
          await convertToWebPWithCwebp(file.path, outputPath, quality, resize);
          convertedFiles.push({ name: outputName, path: outputPath });
          fs.unlinkSync(file.path);
        } catch (error) {
          console.error(`Failed to convert ${file.originalname}:`, error);
        }
      } else {
        // APNG conversion
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

          command
            .outputOptions(['-f apng', '-plays 0', '-compression_level 9', '-an'])
            .save(outputPath)
            .on('end', () => {
              convertedFiles.push({ name: outputName, path: outputPath });
              fs.unlinkSync(file.path);
              resolve();
            })
            .on('error', reject);
        });
      }
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