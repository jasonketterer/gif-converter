# 🎯 GIF to WebP/APNG Converter

A professional web application to convert animated GIFs to modern WebP and APNG formats with quality control and batch processing.

## ✨ Features

- **Animated WebP & APNG Support** - Perfect animation preservation
- **Quality Control** - Adjustable quality settings (1-100%)
- **Resize Options** - Scale images from 10% to 200%
- **Batch Processing** - Convert multiple files at once
- **Real-time Progress** - Visual progress bars for each file
- **Professional UI** - Modern, responsive design

## 🚀 Live Demo

[Add your Vercel URL here after deployment]

## 📦 Deployment on Vercel

### Prerequisites
- Git installed on your computer
- GitHub account
- Vercel account (free)

### Step-by-Step Deployment

1. **Prepare Your Project Structure**
   ```
   gif-converter/
   ├── public/
   │   └── index.html          (Your enhanced frontend)
   ├── server.js               (Vercel-optimized server)
   ├── package.json           (Dependencies)
   ├── vercel.json            (Vercel configuration)
   └── README.md              (This file)
   ```

2. **Create GitHub Repository**
   - Go to github.com and create a new repository
   - Name it "gif-converter" (or any name you prefer)
   - Don't initialize with README (we'll add our files)

3. **Upload Your Code to GitHub**
   ```bash
   # In your project folder
   git init
   git add .
   git commit -m "Initial commit - GIF converter app"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/gif-converter.git
   git push -u origin main
   ```

4. **Deploy to Vercel**
   - Go to [vercel.com](https://vercel.com) and sign up/login
   - Click "New Project"
   - Import your GitHub repository
   - Vercel will auto-detect it's a Node.js app
   - Click "Deploy"
   - Wait 2-3 minutes for deployment

5. **Your App is Live!**
   - Vercel will give you a URL like `https://gif-converter-abc123.vercel.app`
   - Test the conversion functionality
   - Share your live app with others!

### Environment Variables (Optional)
If you need to configure anything, add these in Vercel dashboard:
- `NODE_ENV=production`
- `MAX_FILE_SIZE=52428800` (50MB in bytes)

### Custom Domain (Optional)
- In Vercel dashboard, go to your project
- Click "Domains" tab
- Add your custom domain (requires domain ownership)

## 🛠️ Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:3000
```

## 📁 File Limits

- **File Size**: 50MB per file (Vercel limit)
- **Batch Size**: Up to 10 files at once
- **Formats**: Input (GIF) → Output (WebP, APNG)

## 🔧 Technical Details

- **Backend**: Node.js + Express
- **File Processing**: FFmpeg + img2webp
- **Frontend**: Vanilla JavaScript + CSS
- **Hosting**: Vercel (Serverless)
- **Storage**: Temporary files (auto-cleanup)

## 📊 Performance

- **WebP**: 30-60% smaller than original GIF
- **APNG**: 10-40% smaller than original GIF
- **Processing**: ~30 seconds per 10MB file
- **Quality**: Adjustable from 1-100%

## 🐛 Troubleshooting

**Large File Timeout**: Reduce quality or resize percentage
**Conversion Fails**: Check file format (must be animated GIF)
**Slow Processing**: Large files take more time, be patient

## 📄 License

MIT License - Feel free to use and modify!

---

Made with ❤️ for better web performance
