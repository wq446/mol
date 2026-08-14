const express = require('express');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs-extra');
const path = require('path');

// ربط محرك FFmpeg المدمج تلقائياً
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));

const TEMP_DIR = path.join(__dirname, 'temp');
const OUTPUT_DIR = path.join(__dirname, 'output');

fs.ensureDirSync(TEMP_DIR);
fs.ensureDirSync(OUTPUT_DIR);

app.use('/output', express.static(OUTPUT_DIR));

// الصفحة الرئيسية لتأكيد عمل السيرفر
app.get('/', (req, res) => {
    res.send('🚀 سيرفر مداد لإنشاء فيديوهات MP4 يعمل بنجاح!');
});

app.post('/api/render-video', async (req, res) => {
    const sessionId = Date.now();
    const sessionDir = path.join(TEMP_DIR, `session_${sessionId}`);
    fs.ensureDirSync(sessionDir);

    try {
        const { slides, audioBase64 } = req.body;

        if (!slides || slides.length === 0) {
            return res.status(400).json({ error: 'لا توجد شرائح لمعالجتها' });
        }

        // 1. كتابة الصور المؤقتة
        let concatContent = '';
        for (let i = 0; i < slides.length; i++) {
            const slide = slides[i];
            const base64Data = slide.imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
            const imgPath = path.join(sessionDir, `slide_${i}.png`);
            
            await fs.writeFile(imgPath, base64Data, 'base64');
            concatContent += `file '${imgPath.replace(/\\/g, '/')}'\n`;
            concatContent += `duration ${slide.duration || 5}\n`;
        }

        const lastImgPath = path.join(sessionDir, `slide_${slides.length - 1}.png`);
        concatContent += `file '${lastImgPath.replace(/\\/g, '/')}'\n`;

        const concatFilePath = path.join(sessionDir, 'input.txt');
        await fs.writeFile(concatFilePath, concatContent);

        // 2. كتابة ملف الصوت (إن وجد)
        let bgAudioPath = null;
        if (audioBase64) {
            bgAudioPath = path.join(sessionDir, 'bg_music.mp3');
            const audioData = audioBase64.replace(/^data:audio\/\w+;base64,/, '');
            await fs.writeFile(bgAudioPath, audioData, 'base64');
        }

        const outputFileName = `medad_video_${sessionId}.mp4`;
        const outputPath = path.join(OUTPUT_DIR, outputFileName);

        // 3. إنشاء فيديو MP4 حقيقي (H.264 / AAC)
        let command = ffmpeg()
            .input(concatFilePath)
            .inputOptions(['-f concat', '-safe 0'])
            .videoCodec('libx264')
            .outputOptions([
                '-pix_fmt yuv420p',
                '-preset ultrafast',
                '-r 30'
            ]);


               let command = ffmpeg()
            .input(concatFilePath)
            .inputOptions(['-f concat', '-safe 0'])
            .videoCodec('libx264')
            .outputOptions([
                '-pix_fmt yuv420p',
                '-preset ultrafast',
                '-threads 1', // 🟢 تقييد استخدام الخيوط لتوفير RAM الـ Render
                '-r 25'        // 🟢 25 إطار في الثانية كافية جداً وسريعة
            ]);


        if (bgAudioPath) {
            command = command
                .input(bgAudioPath)
                .audioCodec('aac')
                .outputOptions(['-shortest']);
        }

        command
            .on('end', async () => {
                await fs.remove(sessionDir);
                const videoUrl = `${req.protocol}://${req.get('host')}/output/${outputFileName}`;
                res.json({ success: true, videoUrl });
            })
            .on('error', async (err) => {
                console.error('FFmpeg Error:', err);
                await fs.remove(sessionDir);
                res.status(500).json({ error: 'خطأ معالجة الفيديو: ' + err.message });
            })
            .save(outputPath);

    } catch (err) {
        console.error('Server Error:', err);
        await fs.remove(sessionDir);
        res.status(500).json({ error: 'خطأ السيرفر: ' + err.message });
    }
});

// المنافذ الخاصة بـ Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على المنفذ ${PORT}`));
