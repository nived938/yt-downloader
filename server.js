import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import ytDlp from 'youtube-dl-exec';
import ffmpegPath from 'ffmpeg-static';

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(process.cwd(), 'public');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '32kb' }));
app.use(express.static(publicDir));

function validYouTubeUrl(value) {
  try { const url = new URL(value); return ['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com'].includes(url.hostname.toLowerCase()); }
  catch { return false; }
}
function cleanTitle(title='youtube-video') { return title.replace(/[<>:"/\\|?*\x00-\x1F]/g,'').replace(/\s+/g,' ').trim().slice(0,100)||'youtube-video'; }
function sizeLabel(bytes) {
  if (!Number.isFinite(bytes)||bytes<=0) return 'Unknown size'; const units=['B','KB','MB','GB']; let n=bytes,i=0;
  while(n>=1024&&i<units.length-1){n/=1024;i++;} return `${n.toFixed(n>=10||i===0?0:1)} ${units[i]}`;
}

app.post('/api/analyze', async (req,res)=>{
  const {url}=req.body||{};
  if(!url||!validYouTubeUrl(url)) return res.status(400).json({error:'Please enter a valid YouTube URL.'});
  try {
    const info=await ytDlp(url,{dumpSingleJson:true,noWarnings:true,skipDownload:true,noPlaylist:true,preferFreeFormats:true});
    const formats=(info.formats||[]).filter(f=>f.vcodec!=='none'||f.acodec!=='none').map(f=>({id:f.format_id,ext:f.ext||'mp4',resolution:f.resolution||(f.height?`${f.height}p`:'Audio'),height:f.height||0,fps:f.fps||null,filesize:f.filesize||f.filesize_approx||0,size:sizeLabel(f.filesize||f.filesize_approx||0),type:f.vcodec!=='none'?'video':'audio',hasAudio:f.acodec!=='none',hasVideo:f.vcodec!=='none',abr:f.abr||null,tbr:f.tbr||null})).filter(f=>f.type==='audio'||f.height>=144).sort((a,b)=>(b.height||0)-(a.height||0));
    const combined=formats.filter(f=>f.hasVideo&&f.hasAudio),audio=formats.filter(f=>f.type==='audio'),video=formats.filter(f=>f.hasVideo);
    res.json({title:info.title||'YouTube video',thumbnail:info.thumbnail||'',duration:info.duration||0,uploader:info.uploader||info.channel||'',webpageUrl:info.webpage_url||url,formats:{video:combined.length?combined.slice(0,10):video.slice(0,10),audio:audio.slice(0,6)}});
  } catch(error) { console.error(error); res.status(422).json({error:'Unable to analyze this video. It may be private, unavailable, restricted, or the URL may be invalid.'}); }
});

app.post('/api/download',async(req,res)=>{
  const {url,format='best',mode='video',title='youtube-video'}=req.body||{};
  if(!url||!validYouTubeUrl(url)) return res.status(400).json({error:'Invalid YouTube URL.'});
  const tempDir=await fs.mkdtemp(path.join(os.tmpdir(),'yt-downloader-'));
  const outputTemplate=path.join(tempDir,`${cleanTitle(title)}.%(ext)s`);
  try {
    const options={output:outputTemplate,noPlaylist:true,noWarnings:true};
    if(mode==='audio'){options.format=format==='best'?'bestaudio/best':format;options.extractAudio=true;options.audioFormat='mp3';options.audioQuality='0';if(ffmpegPath)options.ffmpegLocation=ffmpegPath;}
    else {options.format=format==='best'?'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b':format;options.mergeOutputFormat='mp4';if(ffmpegPath)options.ffmpegLocation=ffmpegPath;}
    await ytDlp(url,options);
    const files=await fs.readdir(tempDir); const media=files.find(name=>/\.(mp4|mp3|m4a|webm|mov|mkv)$/i.test(name));
    if(!media) throw new Error('Download produced no media file');
    const filePath=path.join(tempDir,media),ext=path.extname(media).toLowerCase();
    res.setHeader('Content-Type',ext==='.mp3'?'audio/mpeg':ext==='.mp4'?'video/mp4':'application/octet-stream');
    res.setHeader('Content-Disposition',`attachment; filename="${media.replace(/"/g,'')}"`);
    res.download(filePath,media,async()=>{await fs.rm(tempDir,{recursive:true,force:true}).catch(()=>{});});
  } catch(error){console.error(error);await fs.rm(tempDir,{recursive:true,force:true}).catch(()=>{});res.status(500).json({error:'Download failed. Try another available quality or check the video permissions.'});}
});

app.use((req,res)=>{if(req.path.startsWith('/api/'))return res.status(404).json({error:'API route not found'});res.sendFile(path.join(publicDir,'index.html'));});
app.listen(PORT,()=>console.log(`YT Downloader running on port ${PORT}`));
